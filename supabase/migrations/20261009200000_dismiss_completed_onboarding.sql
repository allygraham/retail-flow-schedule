-- Permanent dismissal is private to the current user's workspace and role.
ALTER TABLE public.membership_onboarding ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_onboarding_status(_business_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role public.app_role; state public.membership_onboarding%ROWTYPE; done text[]:='{}';
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 SELECT role INTO actor_role FROM user_roles WHERE user_id=auth.uid() AND business_id=_business_id
 ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END LIMIT 1;
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Membership role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO state FROM membership_onboarding WHERE business_id=_business_id AND user_id=auth.uid() AND role=actor_role;
 IF actor_role IN ('owner','admin') THEN
  IF EXISTS(SELECT 1 FROM store_locations WHERE business_id=_business_id AND is_active) THEN done:=array_append(done,'stores'); END IF;
  IF EXISTS(SELECT 1 FROM business_onboarding WHERE business_id=_business_id) THEN done:=array_append(done,'policy'); END IF;
  IF EXISTS(SELECT 1 FROM invitations WHERE business_id=_business_id AND role<>'admin' AND status IN ('pending','accepted'))
    OR EXISTS(SELECT 1 FROM employee_profiles p JOIN memberships m ON m.user_id=p.user_id AND m.business_id=p.business_id
      WHERE p.business_id=_business_id AND p.user_id<>auth.uid() AND m.is_active) THEN done:=array_append(done,'team'); END IF;
  IF EXISTS(SELECT 1 FROM shifts WHERE business_id=_business_id AND is_published AND status<>'cancelled') THEN done:=array_append(done,'publish'); END IF;
 ELSIF actor_role='manager' THEN
  done:=coalesce(state.explored,'{}');
  IF EXISTS(SELECT 1 FROM shifts WHERE business_id=_business_id AND is_published AND status<>'cancelled') THEN done:=array_append(done,'publish'); END IF;
 ELSE done:=coalesce(state.explored,'{}');
 END IF;
 RETURN jsonb_build_object('welcomed',coalesce(state.welcomed,false),'hidden',coalesce(state.hidden,false),'dismissed',coalesce(state.dismissed,false),'completed',done);
END $$;

CREATE OR REPLACE FUNCTION public.update_onboarding(_business_id uuid,_action text,_step text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role public.app_role; allowed text[]; required_steps text[]; current_state jsonb;
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 SELECT role INTO actor_role FROM user_roles WHERE user_id=auth.uid() AND business_id=_business_id
 ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END LIMIT 1;
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Membership role required' USING ERRCODE='42501'; END IF;
 allowed:=CASE WHEN actor_role='employee' THEN ARRAY['profile','rota','leave']
   WHEN actor_role='manager' THEN ARRAY['team','requests'] ELSE '{}'::text[] END;
 IF _action NOT IN ('welcome','hide','show','explore','dismiss') OR _action IS NULL THEN RAISE EXCEPTION 'Invalid onboarding action' USING ERRCODE='23514'; END IF;
 IF _action='explore' AND (_step IS NULL OR NOT(_step=ANY(allowed))) THEN RAISE EXCEPTION 'Invalid step for this role' USING ERRCODE='23514'; END IF;
 IF _action='dismiss' THEN
  required_steps:=CASE WHEN actor_role IN ('owner','admin') THEN ARRAY['stores','policy','team','publish']
    WHEN actor_role='manager' THEN ARRAY['team','publish','requests'] ELSE ARRAY['profile','rota','leave'] END;
  current_state:=public.get_onboarding_status(_business_id);
  IF NOT coalesce((current_state->>'dismissed')::boolean,false) AND EXISTS(
    SELECT 1 FROM unnest(required_steps) step WHERE NOT ((current_state->'completed') ? step)
  ) THEN RAISE EXCEPTION 'Complete onboarding before dismissing it' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO membership_onboarding(business_id,user_id,role,welcomed,hidden,dismissed,explored)
 VALUES(_business_id,auth.uid(),actor_role,_action='welcome',_action='hide',_action='dismiss',CASE WHEN _action='explore' THEN ARRAY[_step] ELSE '{}' END)
 ON CONFLICT(business_id,user_id,role) DO UPDATE SET
  dismissed=membership_onboarding.dismissed OR _action='dismiss',
  welcomed=membership_onboarding.welcomed OR _action='welcome',
  hidden=CASE WHEN _action='hide' THEN true WHEN _action='show' THEN false ELSE membership_onboarding.hidden END,
  explored=CASE WHEN _action='explore' AND NOT(_step=ANY(membership_onboarding.explored)) THEN array_append(membership_onboarding.explored,_step) ELSE membership_onboarding.explored END,
  updated_at=clock_timestamp();
 RETURN public.get_onboarding_status(_business_id);
END $$;
REVOKE ALL ON FUNCTION public.get_onboarding_status(uuid),public.update_onboarding(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_status(uuid),public.update_onboarding(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';

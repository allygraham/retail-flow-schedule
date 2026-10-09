-- Guidance preferences are private to each active membership and role.
CREATE TABLE public.membership_onboarding (
 business_id uuid NOT NULL, user_id uuid NOT NULL, role public.app_role NOT NULL,
 welcomed boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false,
 explored text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(business_id,user_id,role),
 FOREIGN KEY(user_id,business_id) REFERENCES public.memberships(user_id,business_id) ON DELETE CASCADE
);
CREATE TABLE public.business_onboarding (
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
 leave_policy_saved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.membership_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_onboarding,public.business_onboarding FROM PUBLIC,anon,authenticated;

-- Saving even an unchanged calendar-year choice is a valid policy review.
-- The marker and business update commit or roll back together.
CREATE FUNCTION public.note_onboarding_policy_save() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO business_onboarding(business_id) VALUES(NEW.id)
 ON CONFLICT(business_id) DO UPDATE SET leave_policy_saved_at=clock_timestamp();
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.note_onboarding_policy_save() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER note_onboarding_policy_save AFTER UPDATE OF leave_year_mode,leave_year_start_date ON public.businesses
 FOR EACH ROW EXECUTE FUNCTION public.note_onboarding_policy_save();
-- Recognise configured policies from before onboarding was introduced.
INSERT INTO public.business_onboarding(business_id)
 SELECT b.id FROM businesses b WHERE b.leave_year_mode<>'calendar'
 OR EXISTS(SELECT 1 FROM change_events e WHERE e.business_id=b.id AND e.entity_type='businesses'
   AND (e.after_values ? 'leave_year_mode' OR e.after_values ? 'leave_year_start_date'));

CREATE FUNCTION public.get_onboarding_status(_business_id uuid) RETURNS jsonb
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
 RETURN jsonb_build_object('welcomed',coalesce(state.welcomed,false),'hidden',coalesce(state.hidden,false),'completed',done);
END $$;

CREATE FUNCTION public.update_onboarding(_business_id uuid,_action text,_step text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role public.app_role; allowed text[];
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 SELECT role INTO actor_role FROM user_roles WHERE user_id=auth.uid() AND business_id=_business_id
 ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 ELSE 4 END LIMIT 1;
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Membership role required' USING ERRCODE='42501'; END IF;
 allowed:=CASE WHEN actor_role='employee' THEN ARRAY['profile','rota','leave']
   WHEN actor_role='manager' THEN ARRAY['team','requests'] ELSE '{}'::text[] END;
 IF _action NOT IN ('welcome','hide','show','explore') OR _action IS NULL THEN RAISE EXCEPTION 'Invalid onboarding action' USING ERRCODE='23514'; END IF;
 IF _action='explore' AND (_step IS NULL OR NOT(_step=ANY(allowed))) THEN RAISE EXCEPTION 'Invalid step for this role' USING ERRCODE='23514'; END IF;
 INSERT INTO membership_onboarding(business_id,user_id,role,welcomed,hidden,explored)
 VALUES(_business_id,auth.uid(),actor_role,_action='welcome',_action='hide',CASE WHEN _action='explore' THEN ARRAY[_step] ELSE '{}' END)
 ON CONFLICT(business_id,user_id,role) DO UPDATE SET
  welcomed=membership_onboarding.welcomed OR _action='welcome',
  hidden=CASE WHEN _action='hide' THEN true WHEN _action='show' THEN false ELSE membership_onboarding.hidden END,
  explored=CASE WHEN _action='explore' AND NOT(_step=ANY(membership_onboarding.explored)) THEN array_append(membership_onboarding.explored,_step) ELSE membership_onboarding.explored END,
  updated_at=clock_timestamp();
 RETURN public.get_onboarding_status(_business_id);
END $$;
REVOKE ALL ON FUNCTION public.get_onboarding_status(uuid),public.update_onboarding(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_status(uuid),public.update_onboarding(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';

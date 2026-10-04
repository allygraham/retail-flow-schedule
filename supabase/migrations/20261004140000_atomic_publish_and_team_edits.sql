-- Publish the actual draft rows and their in-app notifications in one transaction.
CREATE OR REPLACE FUNCTION public.publish_rota_shifts(_business_id uuid,_shift_ids uuid[],_week_start date)
RETURNS TABLE(published_count integer,notified_count integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE draft_ids uuid[]; changed integer; notified integer; requested integer;
BEGIN
 IF NOT public.is_manager_or_owner(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active management required' USING ERRCODE='42501'; END IF;
 IF _week_start IS NULL OR _shift_ids IS NULL OR cardinality(_shift_ids)=0 OR array_position(_shift_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Select shifts to publish' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 PERFORM id FROM public.shifts WHERE business_id=_business_id AND id=ANY(_shift_ids) ORDER BY id FOR UPDATE;
 SELECT count(DISTINCT x) INTO requested FROM unnest(_shift_ids) x;
 IF (SELECT count(*) FROM public.shifts WHERE business_id=_business_id AND id=ANY(_shift_ids) AND shift_date BETWEEN _week_start AND _week_start+6 AND status<>'cancelled')<>requested THEN
  RAISE EXCEPTION 'Some shifts changed or cannot be published. Reload your rota.' USING ERRCODE='40001'; END IF;
 SELECT array_agg(id) INTO draft_ids FROM public.shifts WHERE business_id=_business_id AND id=ANY(_shift_ids) AND NOT is_published;
 IF draft_ids IS NULL THEN RETURN QUERY SELECT 0,0; RETURN; END IF;
 UPDATE public.shifts SET is_published=true WHERE business_id=_business_id AND id=ANY(draft_ids);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>cardinality(draft_ids) THEN RAISE EXCEPTION 'Unable to publish every shift' USING ERRCODE='42501'; END IF;
 INSERT INTO public.notifications(business_id,user_id,type,title,body,link,related_entity_type)
 SELECT _business_id,assigned_user_id,'schedule_published','New schedule published',
  format('Your schedule for the week of %s is ready (%s shifts).',to_char(_week_start,'DD Mon YYYY'),count(*)),'/rota','shift_week'
 FROM public.shifts WHERE id=ANY(draft_ids) AND assigned_user_id IS NOT NULL GROUP BY assigned_user_id;
 GET DIAGNOSTICS notified=ROW_COUNT;
 RETURN QUERY SELECT changed,notified;
END $$;
REVOKE ALL ON FUNCTION public.publish_rota_shifts(uuid,uuid[],date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_rota_shifts(uuid,uuid[],date) TO authenticated;

-- Checked definer permits an owner to change their own role without losing
-- permission midway through the transaction; every field is explicitly scoped.
CREATE OR REPLACE FUNCTION public.update_team_member(_business_id uuid,_user_id uuid,_primary_store_id uuid,_primary_role_id uuid,_contracted_hours numeric,_working_days smallint[],_role public.app_role DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE profile_id uuid; actor uuid:=auth.uid();
BEGIN
 IF NOT public.is_manager_or_owner(actor,_business_id) THEN RAISE EXCEPTION 'Active management required' USING ERRCODE='42501'; END IF;
 IF _role IS NOT NULL AND NOT public.is_owner(actor,_business_id) THEN RAISE EXCEPTION 'Only owners can change roles' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 PERFORM id FROM public.memberships WHERE user_id=_user_id AND business_id=_business_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee membership required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_locations WHERE id=_primary_store_id AND business_id=_business_id AND is_active) THEN RAISE EXCEPTION 'Select an active store in this business' USING ERRCODE='23514'; END IF;
 IF _primary_role_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.roles_catalog WHERE id=_primary_role_id AND business_id=_business_id) THEN RAISE EXCEPTION 'Invalid job role for this business' USING ERRCODE='23514'; END IF;
 IF _contracted_hours IS NOT NULL AND (_contracted_hours<0 OR _contracted_hours>168) THEN RAISE EXCEPTION 'Contracted hours must be between 0 and 168' USING ERRCODE='23514'; END IF;
 IF _working_days IS NULL OR NOT public.valid_working_days(_working_days) THEN RAISE EXCEPTION 'Select valid normal working days' USING ERRCODE='23514'; END IF;
 IF _role IS NOT NULL THEN
   IF NOT public.is_member(_user_id,_business_id) THEN RAISE EXCEPTION 'Role changes require active employee membership' USING ERRCODE='42501'; END IF;
   DELETE FROM public.user_roles WHERE business_id=_business_id AND user_id=_user_id;
   INSERT INTO public.user_roles(business_id,user_id,role) VALUES(_business_id,_user_id,_role);
 END IF;
 INSERT INTO public.employee_profiles(business_id,user_id,primary_store_id,primary_role_id,contracted_hours,working_days)
 VALUES(_business_id,_user_id,_primary_store_id,_primary_role_id,_contracted_hours,_working_days)
 ON CONFLICT(user_id,business_id) DO UPDATE SET primary_store_id=excluded.primary_store_id,primary_role_id=excluded.primary_role_id,contracted_hours=excluded.contracted_hours,working_days=excluded.working_days
 RETURNING id INTO profile_id;
 RETURN profile_id;
END $$;
REVOKE ALL ON FUNCTION public.update_team_member(uuid,uuid,uuid,uuid,numeric,smallint[],public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_team_member(uuid,uuid,uuid,uuid,numeric,smallint[],public.app_role) TO authenticated;
NOTIFY pgrst, 'reload schema';

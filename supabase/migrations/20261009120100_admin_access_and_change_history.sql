-- Admin is a business-scoped operational super user, never an owner.
-- Existing management routines use has_role(manager); admin receives those
-- operational privileges while owner checks remain exact and owner-only.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_business_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.memberships m
 ON m.user_id=r.user_id AND m.business_id=r.business_id
 WHERE r.user_id=_user_id AND r.business_id=_business_id AND m.is_active
 AND (r.role=_role OR (_role='manager' AND r.role='admin')));
$$;
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid,_business_id uuid,_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
 WHEN _permission IN ('manage_settings','manage_stores','view_reports','view_change_history') THEN public.is_owner(_user_id,_business_id) OR public.has_role(_user_id,_business_id,'admin')
 WHEN _permission IN ('manage_staff','manage_schedules','manage_leave','view_operational_dashboards') THEN public.is_manager_or_owner(_user_id,_business_id)
 WHEN _permission IN ('view_own_schedule','view_own_requests') THEN public.is_member(_user_id,_business_id)
 WHEN _permission='request_leave' THEN public.is_member(_user_id,_business_id) AND NOT public.has_role(_user_id,_business_id,'admin')
 ELSE false END;
$$;

-- Only owners may assign or invite privileged roles, including through direct APIs.
DROP POLICY IF EXISTS "Invitation inserts enforce owner assignment" ON public.invitations;
CREATE POLICY "Invitation inserts enforce owner assignment" ON public.invitations AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.is_manager_or_owner(auth.uid(),business_id) AND (role NOT IN ('owner','admin') OR public.is_owner(auth.uid(),business_id)));
DROP POLICY IF EXISTS "Invitation updates enforce owner assignment" ON public.invitations;
CREATE POLICY "Invitation updates enforce owner assignment" ON public.invitations AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_manager_or_owner(auth.uid(),business_id) AND (role NOT IN ('owner','admin') OR public.is_owner(auth.uid(),business_id)))
 WITH CHECK(public.is_manager_or_owner(auth.uid(),business_id) AND (role NOT IN ('owner','admin') OR public.is_owner(auth.uid(),business_id)));

-- Owner-only settings policies can permit admin operational edits without
-- widening membership, ownership or role-assignment policies.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['business_branding','store_locations','roles_catalog','custom_holidays'] LOOP
  EXECUTE format('CREATE POLICY "Admins manage operational settings" ON public.%I FOR ALL TO authenticated USING(public.has_role(auth.uid(),business_id,''admin'')) WITH CHECK(public.has_role(auth.uid(),business_id,''admin''))',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.protect_privileged_members()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_role public.app_role;
BEGIN
 IF auth.uid() IS NOT NULL THEN
  SELECT role INTO target_role FROM public.user_roles WHERE business_id=OLD.business_id AND user_id=OLD.user_id AND role IN ('owner','admin') LIMIT 1;
  IF target_role IS NOT NULL AND NOT public.is_owner(auth.uid(),OLD.business_id) THEN
   RAISE EXCEPTION 'Only owners can change owner or admin membership' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_privileged_members BEFORE UPDATE OR DELETE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_members();

CREATE OR REPLACE FUNCTION public.set_business_role(_business_id uuid,_user_id uuid,_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_owner(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Only owners can change access roles' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 IF NOT public.is_member(_user_id,_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 IF public.is_owner(_user_id,_business_id) AND _role<>'owner' AND NOT EXISTS(
  SELECT 1 FROM public.user_roles r JOIN public.memberships m USING(user_id,business_id)
  WHERE r.business_id=_business_id AND r.user_id<>_user_id AND r.role='owner' AND m.is_active) THEN
  RAISE EXCEPTION 'Keep at least one active owner' USING ERRCODE='23514';
 END IF;
 IF _role='admin' AND (EXISTS(SELECT 1 FROM public.shifts WHERE business_id=_business_id AND assigned_user_id=_user_id AND shift_date>=current_date AND status<>'cancelled')
 OR EXISTS(SELECT 1 FROM public.leave_requests WHERE business_id=_business_id AND user_id=_user_id AND end_date>=current_date AND status IN ('pending','approved'))) THEN
  RAISE EXCEPTION 'Remove upcoming shifts and leave before making this person an Admin' USING ERRCODE='23514';
 END IF;
 DELETE FROM public.user_roles WHERE business_id=_business_id AND user_id=_user_id;
 INSERT INTO public.user_roles(business_id,user_id,role) VALUES(_business_id,_user_id,_role);
END $$;
REVOKE ALL ON FUNCTION public.set_business_role(uuid,uuid,public.app_role) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_business_role(uuid,uuid,public.app_role) TO authenticated;

-- Admins remain visible in account management, but never in operational staff.
CREATE OR REPLACE FUNCTION public.get_rota_people(_business_id uuid)
RETURNS TABLE(id uuid,user_id uuid,primary_role_id uuid,primary_store_id uuid,full_name text,store_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active business membership is required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT ep.id,ep.user_id,ep.primary_role_id,ep.primary_store_id,p.full_name,
 coalesce((SELECT array_agg(es.store_id) FROM public.employee_stores es WHERE es.employee_profile_id=ep.id),ARRAY[]::uuid[])
 FROM public.employee_profiles ep JOIN public.memberships m ON m.user_id=ep.user_id AND m.business_id=ep.business_id
 LEFT JOIN public.profiles p ON p.id=ep.user_id
 WHERE ep.business_id=_business_id AND m.is_active AND NOT public.has_role(ep.user_id,ep.business_id,'admin');
END $$;
CREATE OR REPLACE FUNCTION public.prevent_admin_staff_records()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,41030));
 uid:=CASE WHEN TG_TABLE_NAME='shifts' THEN (to_jsonb(NEW)->>'assigned_user_id')::uuid ELSE (to_jsonb(NEW)->>'user_id')::uuid END;
 IF uid IS NOT NULL AND public.has_role(uid,NEW.business_id,'admin') THEN
  RAISE EXCEPTION 'Admins are not staffing accounts' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_admin_shifts BEFORE INSERT OR UPDATE OF assigned_user_id ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_staff_records();
CREATE TRIGGER prevent_admin_leave BEFORE INSERT OR UPDATE OF user_id ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_staff_records();

CREATE TRIGGER prevent_admin_employment BEFORE INSERT OR UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_staff_records();

-- Immutable to application users; records contain only explicitly allowed fields.
CREATE TABLE public.change_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_user_id uuid, actor_name text NOT NULL,
 entity_type text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('created','updated','deleted')),
 subject text, before_values jsonb NOT NULL DEFAULT '{}', after_values jsonb NOT NULL DEFAULT '{}', schema_version integer NOT NULL DEFAULT 1
);
CREATE INDEX change_events_business_time ON public.change_events(business_id,occurred_at DESC,id DESC);
ALTER TABLE public.change_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and admins read history" ON public.change_events FOR SELECT TO authenticated
 USING(public.has_permission(auth.uid(),business_id,'view_change_history'));
REVOKE ALL ON public.change_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.change_events TO authenticated;
CREATE OR REPLACE FUNCTION public.capture_change_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; following jsonb; previous_diff jsonb; following_diff jsonb; keys text[]; business uuid; identifier uuid; label text;
BEGIN
 previous:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 following:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 keys:=string_to_array(TG_ARGV[0],',');
 SELECT coalesce(jsonb_object_agg(k,previous->k),'{}'::jsonb),coalesce(jsonb_object_agg(k,following->k),'{}'::jsonb)
 INTO previous_diff,following_diff FROM unnest(keys) k WHERE previous->k IS DISTINCT FROM following->k;
 IF previous_diff='{}'::jsonb AND following_diff='{}'::jsonb THEN RETURN NULL; END IF;
 business:=coalesce((following->>'business_id')::uuid,(previous->>'business_id')::uuid);
 IF TG_TABLE_NAME='businesses' THEN business:=coalesce((following->>'id')::uuid,(previous->>'id')::uuid); END IF;
 identifier:=coalesce((following->>'id')::uuid,(previous->>'id')::uuid,business);
 label:=coalesce(following->>'name',previous->>'name',following->>'display_name',previous->>'display_name',
 (SELECT full_name FROM public.profiles WHERE id=coalesce((following->>'user_id')::uuid,(previous->>'user_id')::uuid,(following->>'assigned_user_id')::uuid,(previous->>'assigned_user_id')::uuid)));
 INSERT INTO public.change_events(business_id,actor_user_id,actor_name,entity_type,entity_id,action,subject,before_values,after_values)
 VALUES(business,auth.uid(),coalesce((SELECT full_name FROM public.profiles WHERE id=auth.uid()),CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'Team member' END),TG_TABLE_NAME,identifier,
 CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'deleted' ELSE 'updated' END,label,previous_diff,following_diff);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.capture_change_event() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE target record; BEGIN
 FOR target IN SELECT * FROM (VALUES
 ('shifts','shift_date,start_time,end_time,break_minutes,store_id,role_id,assigned_user_id,status,is_published'),
 ('rota_week_publications','week_start,store_id,is_published'),
 ('leave_requests','user_id,leave_type,status,start_date,end_date,lifecycle_status,reviewed_by,approved_by'),
 ('user_roles','user_id,role'),('memberships','user_id,is_active'),
 ('employee_profiles','user_id,primary_store_id,primary_role_id,employment_type,contracted_hours,working_days,annual_leave_entitlement,hourly_rate,hire_date'),
 ('store_locations','name,address,city,postcode,is_active'),('roles_catalog','name,color'),
 ('businesses','name,public_holidays_enabled,public_holidays_region,leave_year_mode,leave_year_start_date'),
 ('business_branding','theme_key,display_name,primary_color,secondary_color,accent_color,surface_color,logo_url'),
 ('custom_holidays','name,date,blocks_scheduling'),
 ('invitations','full_name,role,status,accepted_user_id')
 ) AS targets(table_name,fields) LOOP
 IF to_regclass('public.'||target.table_name) IS NOT NULL THEN
 EXECUTE format('CREATE TRIGGER capture_change_event AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_change_event(%L)',target.table_name,target.fields);
 END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';

-- Cover direct role updates and legacy RPCs as well as the new access dialog.
CREATE FUNCTION public.guard_admin_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.role='admin' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,41030));
  IF EXISTS(SELECT 1 FROM shifts WHERE business_id=NEW.business_id AND assigned_user_id=NEW.user_id AND shift_date>=current_date AND status<>'cancelled')
  OR EXISTS(SELECT 1 FROM leave_requests WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND end_date>=current_date AND status IN ('pending','approved')) THEN
   RAISE EXCEPTION 'Remove upcoming shifts and leave before making this person an Admin' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_admin_assignment BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_admin_assignment();

-- Consume invitation codes once, only after all membership/profile writes succeed.
-- Row locking serializes concurrent acceptance attempts; failed writes roll back acceptance.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv  public.invitations%ROWTYPE;
  v_email text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user;
  IF v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_inv.status USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'P0001';
  END IF;

  -- A fresh invitation can reactivate a former employee. Keep an active
  -- member's existing role; accepting an employee invite must not demote an owner.
  IF NOT EXISTS (SELECT 1 FROM public.memberships
                 WHERE user_id = v_user AND business_id = v_inv.business_id AND is_active) THEN
    -- Remove the inactive role before restoring membership. The privileged
    -- membership guard still requires owners for ordinary API reactivation.
    DELETE FROM public.user_roles WHERE user_id=v_user AND business_id=v_inv.business_id;
    INSERT INTO public.memberships(user_id,business_id,is_active)
    VALUES(v_user,v_inv.business_id,true)
    ON CONFLICT(user_id,business_id) DO UPDATE SET is_active=true;
    INSERT INTO public.user_roles(user_id,business_id,role) VALUES(v_user,v_inv.business_id,v_inv.role);
  END IF;

  -- Employee profile (only if missing for this user+business)
  INSERT INTO public.employee_profiles (
    user_id, business_id, primary_store_id, primary_role_id,
    contracted_hours, hire_date, notes
  )
  SELECT v_user, v_inv.business_id, v_inv.primary_store_id, v_inv.primary_role_id,
         v_inv.contracted_hours, v_inv.hire_date, v_inv.notes
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_user AND business_id=v_inv.business_id AND role='admin') AND NOT EXISTS (
    SELECT 1 FROM public.employee_profiles
    WHERE user_id = v_user AND business_id = v_inv.business_id
  );

  -- Profile (full_name + phone), don't overwrite if already set
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (v_user, v_inv.full_name, v_inv.phone)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone     = COALESCE(public.profiles.phone, EXCLUDED.phone);

  -- Mark invitation accepted
  UPDATE public.invitations
     SET status = 'accepted', accepted_user_id = v_user, accepted_at = now()
   WHERE id = v_inv.id;

  RETURN v_inv.business_id;
END $$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.notify_coverage_staff(_business_id uuid, _notifications jsonb)
RETURNS TABLE(sent_count integer, already_sent_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  recipient jsonb; recipient_id uuid; ids uuid[]; requested integer;
  fingerprint text; message text; inserted integer; sent integer := 0; existing integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m JOIN user_roles r USING (user_id,business_id)
    WHERE m.user_id=auth.uid() AND m.business_id=_business_id AND m.is_active AND r.role IN ('owner','admin','manager')) THEN
    RAISE EXCEPTION 'Active management required' USING ERRCODE='42501';
  END IF;
  IF _notifications IS NULL OR jsonb_typeof(_notifications)<>'array' OR jsonb_array_length(_notifications)>500 THEN
    RAISE EXCEPTION 'Invalid notification recipients' USING ERRCODE='23514';
  END IF;
  -- Serialize delivery attempts within a workspace, including concurrent retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,51900));
  FOR recipient IN SELECT value FROM jsonb_array_elements(_notifications) LOOP
    recipient_id := (recipient->>'user_id')::uuid;
    IF recipient_id IS NULL OR NOT EXISTS (SELECT 1 FROM memberships
      WHERE user_id=recipient_id AND business_id=_business_id AND is_active) THEN
      RAISE EXCEPTION 'Recipient is not an active workspace member' USING ERRCODE='42501';
    END IF;
    IF jsonb_typeof(recipient->'shift_ids') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Select shifts needing cover' USING ERRCODE='23514';
    END IF;
    SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(recipient->'shift_ids');
    IF ids IS NULL OR array_position(ids,NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Select shifts needing cover' USING ERRCODE='23514';
    END IF;
    PERFORM id FROM shifts WHERE business_id=_business_id AND id=ANY(ids) ORDER BY id FOR SHARE;
    SELECT count(*) INTO requested FROM shifts
      WHERE business_id=_business_id AND id=ANY(ids) AND status<>'cancelled';
    IF requested<>cardinality(ids) THEN
      RAISE EXCEPTION 'Some shifts changed or no longer need cover. Reload coverage.' USING ERRCODE='40001';
    END IF;
    SELECT md5(_business_id::text || recipient_id::text || string_agg(
      jsonb_build_array(id,shift_date,start_time,end_time,break_minutes,store_id,role_id,assigned_user_id,status)::text,'|' ORDER BY id)),
      'Cover needed: ' || string_agg(to_char(shift_date,'YYYY-MM-DD') || ' ' ||
      to_char(start_time,'HH24:MI') || '–' || to_char(end_time,'HH24:MI'),', ' ORDER BY shift_date,start_time,id) || '. Tap to view.'
      INTO fingerprint,message FROM shifts WHERE business_id=_business_id AND id=ANY(ids);
    INSERT INTO notification_deliveries(delivery_key,business_id,user_id)
      VALUES(fingerprint,_business_id,recipient_id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    IF inserted=1 THEN
      INSERT INTO notifications(business_id,user_id,type,title,body,link)
        VALUES(_business_id,recipient_id,'shift_open_for_pickup','Shifts open for pickup',message,'/rota');
      sent := sent+1;
    ELSE existing := existing+1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT sent,existing;
END $$;
REVOKE ALL ON FUNCTION public.notify_coverage_staff(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notify_coverage_staff(uuid,jsonb) TO authenticated;

-- Employees request changes without gaining access to colleagues' schedules.
CREATE TABLE public.shift_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id),
 requester_id uuid NOT NULL, source_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','proposed','ready','completed','declined','cancelled')),
 source_version timestamptz NOT NULL, source_details jsonb NOT NULL,
 replacement_user_id uuid, swap_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
 swap_version timestamptz, swap_details jsonb, requester_accepted boolean NOT NULL DEFAULT false,
 replacement_accepted boolean NOT NULL DEFAULT false, manager_note text CHECK(length(manager_note)<=1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX shift_change_business_status ON public.shift_change_requests(business_id,status,created_at DESC);
ALTER TABLE public.shift_change_requests ENABLE ROW LEVEL SECURITY;
-- All access goes through scoped RPCs; employees never read another person's reason or shift notes.
REVOKE ALL ON public.shift_change_requests FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_change_event AFTER INSERT OR UPDATE ON public.shift_change_requests
 FOR EACH ROW EXECUTE FUNCTION public.capture_change_event('requester_id,source_shift_id,status,replacement_user_id,swap_shift_id,requester_accepted,replacement_accepted');

CREATE FUNCTION public.shift_change_shift_details(_shift public.shifts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('id',_shift.id,'date',_shift.shift_date,'start',_shift.start_time,'end',_shift.end_time,
 'break_minutes',_shift.break_minutes,'store',(SELECT name FROM store_locations WHERE id=_shift.store_id),
 'role',(SELECT name FROM roles_catalog WHERE id=_shift.role_id),
 'starts_at',(_shift.shift_date+_shift.start_time) AT TIME ZONE coalesce((SELECT timezone FROM store_locations WHERE id=_shift.store_id),'Europe/London'))
$$;
REVOKE ALL ON FUNCTION public.shift_change_shift_details(public.shifts) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.shift_change_notify(_business uuid,_users uuid[],_title text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO notifications(business_id,user_id,type,title,link)
 SELECT _business,u,'shift_change',_title,'/shift-changes' FROM (SELECT DISTINCT unnest(_users) u) recipients
 WHERE u IS NOT NULL AND public.is_member(u,_business)
$$;
REVOKE ALL ON FUNCTION public.shift_change_notify(uuid,uuid[],text) FROM PUBLIC,anon,authenticated;

-- Advisory warnings do not replace management judgement or assignment validation.
CREATE FUNCTION public.shift_change_warnings(_request public.shift_change_requests) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE assignment record; candidate public.shifts%ROWTYPE; entitlement numeric; hours numeric; warnings jsonb:='[]'; start_at timestamptz; end_at timestamptz;
BEGIN
 FOR assignment IN SELECT * FROM (VALUES (_request.replacement_user_id,_request.source_shift_id),
   (_request.requester_id,_request.swap_shift_id)) assignments(person,shift_id) LOOP
  IF assignment.person IS NULL OR assignment.shift_id IS NULL THEN CONTINUE; END IF;
  SELECT * INTO candidate FROM shifts WHERE id=assignment.shift_id AND business_id=_request.business_id;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT contracted_hours INTO entitlement FROM employee_profiles WHERE user_id=assignment.person AND business_id=_request.business_id;
  SELECT coalesce(sum(extract(epoch FROM (end_time-start_time))/3600-break_minutes/60.0),0)
   +extract(epoch FROM (candidate.end_time-candidate.start_time))/3600-candidate.break_minutes/60.0 INTO hours
   FROM shifts WHERE business_id=_request.business_id AND assigned_user_id=assignment.person AND status<>'cancelled' AND is_published
   AND shift_date BETWEEN date_trunc('week',candidate.shift_date)::date AND date_trunc('week',candidate.shift_date)::date+6
   AND id<>_request.source_shift_id AND (id IS DISTINCT FROM _request.swap_shift_id);
  IF entitlement IS NOT NULL AND hours>entitlement THEN warnings:=warnings||jsonb_build_array(
   coalesce((SELECT full_name FROM profiles WHERE id=assignment.person),'Employee')||': '||round(hours,2)||' scheduled hours exceed '||entitlement||' contracted hours this week'); END IF;
  start_at:=(public.shift_change_shift_details(candidate)->>'starts_at')::timestamptz;
  end_at:=start_at+(candidate.end_time-candidate.start_time);
  IF EXISTS(SELECT 1 FROM shifts s WHERE s.business_id=_request.business_id AND s.assigned_user_id=assignment.person AND s.status<>'cancelled' AND s.is_published
    AND s.id<>_request.source_shift_id AND s.id IS DISTINCT FROM _request.swap_shift_id
    AND (public.shift_change_shift_details(s)->>'starts_at')::timestamptz < end_at+interval '11 hours'
    AND (public.shift_change_shift_details(s)->>'starts_at')::timestamptz+(s.end_time-s.start_time)>start_at-interval '11 hours') THEN
   warnings:=warnings||jsonb_build_array(coalesce((SELECT full_name FROM profiles WHERE id=assignment.person),'Employee')||': check the rest gap around the proposed shift (under 11 hours or an overlap)');
  END IF;
 END LOOP;
 RETURN warnings;
END $$;
REVOKE ALL ON FUNCTION public.shift_change_warnings(public.shift_change_requests) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_shift_change_requests(_business_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE manager boolean;
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 manager:=public.is_manager_or_owner(auth.uid(),_business_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',r.id,'requester_id',r.requester_id,'requester_name',coalesce(p.full_name,'Team member'),
 'replacement_user_id',r.replacement_user_id,'replacement_name',coalesce(q.full_name,'Team member'),
 'reason',CASE WHEN manager OR r.requester_id=auth.uid() THEN r.reason ELSE NULL END,
 'manager_note',CASE WHEN manager THEN r.manager_note ELSE NULL END,
 'warnings',CASE WHEN manager AND r.status IN ('proposed','ready') THEN public.shift_change_warnings(r) ELSE '[]'::jsonb END,
 'status',CASE WHEN r.status IN ('requested','proposed','ready') AND
 least((r.source_details->>'starts_at')::timestamptz,
 coalesce((r.swap_details->>'starts_at')::timestamptz,'infinity'::timestamptz)) <= now() THEN 'expired' ELSE r.status END,
 'source',r.source_details,'swap',r.swap_details,'requester_accepted',r.requester_accepted,
 'replacement_accepted',r.replacement_accepted,'created_at',r.created_at,'updated_at',r.updated_at) ORDER BY r.created_at DESC)
 FROM shift_change_requests r LEFT JOIN profiles p ON p.id=r.requester_id LEFT JOIN profiles q ON q.id=r.replacement_user_id
 WHERE r.business_id=_business_id AND (manager OR r.requester_id=auth.uid() OR
 (r.replacement_user_id=auth.uid() AND r.status<>'requested'))),'[]'::jsonb);
END $$;

-- Lock order matches rota writes: business lock first, then request and shifts.
CREATE FUNCTION public.change_shift_request(_business_id uuid,_action text,_request_id uuid DEFAULT NULL,
 _shift_id uuid DEFAULT NULL,_reason text DEFAULT NULL,_replacement_user_id uuid DEFAULT NULL,
 _swap_shift_id uuid DEFAULT NULL,_manager_note text DEFAULT NULL,_expected_updated_at timestamptz DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.shift_change_requests%ROWTYPE; source public.shifts%ROWTYPE; target public.shifts%ROWTYPE;
 manager boolean; recipients uuid[]; result_id uuid;
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 manager:=public.is_manager_or_owner(auth.uid(),_business_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 IF _action='create' THEN
  SELECT * INTO source FROM shifts WHERE id=_shift_id AND business_id=_business_id FOR UPDATE;
  IF NOT FOUND OR source.assigned_user_id IS DISTINCT FROM auth.uid() OR NOT source.is_published OR source.status='cancelled'
   OR (public.shift_change_shift_details(source)->>'starts_at')::timestamptz<=now() OR public.has_role(auth.uid(),_business_id,'admin') THEN
   RAISE EXCEPTION 'Choose your own upcoming published shift' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM shift_change_requests WHERE business_id=_business_id AND status IN ('requested','proposed','ready')
    AND (_shift_id=source_shift_id OR _shift_id=swap_shift_id)
    AND (source_details->>'starts_at')::timestamptz>now()
    AND coalesce((swap_details->>'starts_at')::timestamptz,'infinity'::timestamptz)>now()) THEN
   RAISE EXCEPTION 'This shift already has an active change request' USING ERRCODE='23514'; END IF;
  INSERT INTO shift_change_requests(business_id,requester_id,source_shift_id,source_version,source_details,reason)
   VALUES(_business_id,auth.uid(),source.id,source.updated_at,public.shift_change_shift_details(source),trim(_reason)) RETURNING id INTO result_id;
  SELECT array_agg(user_id) INTO recipients FROM memberships WHERE business_id=_business_id AND is_active AND public.is_manager_or_owner(user_id,_business_id);
  PERFORM public.shift_change_notify(_business_id,recipients,'New shift change request');
  RETURN result_id;
 END IF;
 SELECT * INTO r FROM shift_change_requests WHERE id=_request_id AND business_id=_business_id FOR UPDATE;
 IF NOT FOUND OR NOT(manager OR r.requester_id=auth.uid() OR r.replacement_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
 IF r.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'The request changed. Refresh and review the current proposal.' USING ERRCODE='40001'; END IF;
 IF r.status NOT IN ('requested','proposed','ready') THEN RAISE EXCEPTION 'This request is already closed' USING ERRCODE='23514'; END IF;
 IF least((r.source_details->>'starts_at')::timestamptz,
 coalesce((r.swap_details->>'starts_at')::timestamptz,'infinity'::timestamptz))<=now() THEN
  RAISE EXCEPTION 'This request has expired' USING ERRCODE='23514'; END IF;
 IF _action='cancel' THEN
  IF r.requester_id<>auth.uid() THEN RAISE EXCEPTION 'Only the requester can cancel' USING ERRCODE='42501'; END IF;
  UPDATE shift_change_requests SET status='cancelled',updated_at=clock_timestamp() WHERE id=r.id;
 ELSIF _action='decline' THEN
  IF NOT manager AND NOT(r.status IN ('proposed','ready') AND auth.uid() IN (r.requester_id,r.replacement_user_id)) THEN
   RAISE EXCEPTION 'Cannot decline this request' USING ERRCODE='42501'; END IF;
  UPDATE shift_change_requests SET status='declined',updated_at=clock_timestamp() WHERE id=r.id;
 ELSIF _action IN ('propose','confirm','accept') THEN
  IF _action IN ('propose','confirm') AND NOT manager THEN RAISE EXCEPTION 'Management access required' USING ERRCODE='42501'; END IF;
  SELECT * INTO source FROM shifts WHERE id=r.source_shift_id AND business_id=_business_id FOR UPDATE;
  IF NOT FOUND OR source.updated_at IS DISTINCT FROM r.source_version OR source.assigned_user_id IS DISTINCT FROM r.requester_id
   OR NOT source.is_published OR source.status='cancelled' OR (public.shift_change_shift_details(source)->>'starts_at')::timestamptz<=now() THEN
   RAISE EXCEPTION 'The original shift has changed. Cancel this request and create a new one.' USING ERRCODE='40001'; END IF;
  IF _action='propose' THEN
   IF _replacement_user_id IS NULL OR _replacement_user_id=r.requester_id OR NOT public.is_member(_replacement_user_id,_business_id)
     OR public.has_role(_replacement_user_id,_business_id,'admin') THEN RAISE EXCEPTION 'Choose an active colleague' USING ERRCODE='23514'; END IF;
   IF _swap_shift_id IS NOT NULL THEN
    SELECT * INTO target FROM shifts WHERE id=_swap_shift_id AND business_id=_business_id FOR UPDATE;
    IF NOT FOUND OR target.id=source.id OR target.assigned_user_id IS DISTINCT FROM _replacement_user_id OR NOT target.is_published
     OR target.status='cancelled' OR (public.shift_change_shift_details(target)->>'starts_at')::timestamptz<=now() THEN RAISE EXCEPTION 'Choose the colleague''s upcoming published shift' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM shift_change_requests WHERE business_id=_business_id AND id<>r.id AND status IN ('requested','proposed','ready')
     AND (source_shift_id=_swap_shift_id OR swap_shift_id=_swap_shift_id)
     AND (source_details->>'starts_at')::timestamptz>now()
     AND coalesce((swap_details->>'starts_at')::timestamptz,'infinity'::timestamptz)>now()) THEN
     RAISE EXCEPTION 'The colleague''s shift already has an active request' USING ERRCODE='23514'; END IF;
   END IF;
   -- Store/role eligibility is explicit; the existing deferred shift validator
   -- rechecks leave, availability, active stores and overlaps at final confirmation.
   IF NOT EXISTS(SELECT 1 FROM employee_profiles ep WHERE ep.business_id=_business_id AND ep.user_id=_replacement_user_id
     AND (ep.primary_store_id=source.store_id OR EXISTS(SELECT 1 FROM employee_stores es WHERE es.employee_profile_id=ep.id AND es.store_id=source.store_id))
     AND (source.role_id IS NULL OR ep.primary_role_id=source.role_id)) THEN RAISE EXCEPTION 'Colleague is not eligible for the original shift store and role' USING ERRCODE='23514'; END IF;
   IF _swap_shift_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM employee_profiles ep WHERE ep.business_id=_business_id AND ep.user_id=r.requester_id
     AND (ep.primary_store_id=target.store_id OR EXISTS(SELECT 1 FROM employee_stores es WHERE es.employee_profile_id=ep.id AND es.store_id=target.store_id))
     AND (target.role_id IS NULL OR ep.primary_role_id=target.role_id)) THEN RAISE EXCEPTION 'Requester is not eligible for the proposed shift store and role' USING ERRCODE='23514'; END IF;
   UPDATE shift_change_requests SET replacement_user_id=_replacement_user_id,swap_shift_id=_swap_shift_id,
    swap_version=CASE WHEN _swap_shift_id IS NOT NULL THEN target.updated_at END,
    swap_details=CASE WHEN _swap_shift_id IS NOT NULL THEN public.shift_change_shift_details(target) END,
    manager_note=_manager_note,requester_accepted=false,replacement_accepted=false,status='proposed',updated_at=clock_timestamp() WHERE id=r.id;
   IF r.replacement_user_id IS DISTINCT FROM _replacement_user_id THEN PERFORM public.shift_change_notify(_business_id,ARRAY[r.replacement_user_id],'Shift change proposal withdrawn'); END IF;
  ELSE
   IF r.status NOT IN ('proposed','ready') OR r.replacement_user_id IS NULL THEN RAISE EXCEPTION 'No proposal to accept or confirm' USING ERRCODE='23514'; END IF;
   IF NOT public.is_member(r.requester_id,_business_id) OR NOT public.is_member(r.replacement_user_id,_business_id)
     OR public.has_role(r.requester_id,_business_id,'admin') OR public.has_role(r.replacement_user_id,_business_id,'admin') THEN RAISE EXCEPTION 'Both employees must still be active' USING ERRCODE='23514'; END IF;
   IF r.swap_details IS NOT NULL AND r.swap_shift_id IS NULL THEN RAISE EXCEPTION 'The proposed shift was deleted. A manager must propose again.' USING ERRCODE='40001'; END IF;
   IF r.swap_shift_id IS NOT NULL THEN
    SELECT * INTO target FROM shifts WHERE id=r.swap_shift_id AND business_id=_business_id FOR UPDATE;
    IF NOT FOUND OR target.updated_at IS DISTINCT FROM r.swap_version OR target.assigned_user_id IS DISTINCT FROM r.replacement_user_id
     OR NOT target.is_published OR target.status='cancelled' OR (public.shift_change_shift_details(target)->>'starts_at')::timestamptz<=now() THEN
     RAISE EXCEPTION 'The proposed shift has changed. A manager must propose it again.' USING ERRCODE='40001'; END IF;
   END IF;
   IF _action='accept' THEN
    IF auth.uid() NOT IN (r.requester_id,r.replacement_user_id) THEN RAISE EXCEPTION 'Only affected employees can accept' USING ERRCODE='42501'; END IF;
    IF (auth.uid()=r.requester_id AND r.requester_accepted) OR (auth.uid()=r.replacement_user_id AND r.replacement_accepted) THEN RETURN r.id; END IF;
    UPDATE shift_change_requests SET requester_accepted=requester_accepted OR requester_id=auth.uid(),
     replacement_accepted=replacement_accepted OR replacement_user_id=auth.uid(),updated_at=clock_timestamp() WHERE id=r.id;
    UPDATE shift_change_requests SET status='ready' WHERE id=r.id AND requester_accepted AND replacement_accepted;
   ELSE
    IF NOT r.requester_accepted OR NOT r.replacement_accepted THEN RAISE EXCEPTION 'Both employees must accept first' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM employee_profiles ep WHERE ep.business_id=_business_id AND ep.user_id=r.replacement_user_id
     AND (ep.primary_store_id=source.store_id OR EXISTS(SELECT 1 FROM employee_stores es WHERE es.employee_profile_id=ep.id AND es.store_id=source.store_id))
     AND (source.role_id IS NULL OR ep.primary_role_id=source.role_id)) THEN RAISE EXCEPTION 'Colleague is no longer eligible for this shift' USING ERRCODE='23514'; END IF;
    IF r.swap_shift_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM employee_profiles ep WHERE ep.business_id=_business_id AND ep.user_id=r.requester_id
     AND (ep.primary_store_id=target.store_id OR EXISTS(SELECT 1 FROM employee_stores es WHERE es.employee_profile_id=ep.id AND es.store_id=target.store_id))
     AND (target.role_id IS NULL OR ep.primary_role_id=target.role_id)) THEN RAISE EXCEPTION 'Requester is no longer eligible for proposed shift' USING ERRCODE='23514'; END IF;
    UPDATE shifts SET assigned_user_id=CASE WHEN id=source.id THEN r.replacement_user_id ELSE r.requester_id END
     WHERE business_id=_business_id AND id IN (source.id,r.swap_shift_id);
    SET CONSTRAINTS validate_shift_assignment IMMEDIATE;
    SET CONSTRAINTS validate_shift_assignment DEFERRED;
    UPDATE shift_change_requests SET status='completed',updated_at=clock_timestamp() WHERE id=r.id;
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Unknown request action' USING ERRCODE='23514'; END IF;
 SELECT array_agg(user_id) INTO recipients FROM memberships WHERE business_id=_business_id AND is_active AND public.is_manager_or_owner(user_id,_business_id);
 PERFORM public.shift_change_notify(_business_id,recipients||ARRAY[r.requester_id,coalesce(_replacement_user_id,r.replacement_user_id)],
  CASE _action WHEN 'propose' THEN 'Shift change proposal: please review' WHEN 'accept' THEN 'Shift change acceptance received'
  WHEN 'confirm' THEN 'Shift change confirmed' WHEN 'cancel' THEN 'Shift change cancelled' ELSE 'Shift change declined' END);
 RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.get_shift_change_requests(uuid),public.change_shift_request(uuid,text,uuid,uuid,text,uuid,uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_shift_change_requests(uuid),public.change_shift_request(uuid,text,uuid,uuid,text,uuid,uuid,text,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Repair production schema and keep health details private.
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS sickness_meta jsonb;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS lifecycle_status text;
REVOKE SELECT (review_notes,sickness_meta,lifecycle_status) ON public.leave_requests FROM authenticated,anon,PUBLIC;

-- Remove the known historical copy, retaining the original internal note.
UPDATE public.leave_requests SET review_notes=NULL
WHERE source IN ('owner_created','manager_created') AND manager_note IS NOT NULL AND review_notes=manager_note;

CREATE OR REPLACE FUNCTION public.lock_leave_schedule_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text,41030));
  IF NEW.manager_note IS NOT NULL AND NEW.review_notes=NEW.manager_note THEN
    NEW.review_notes:=NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aaa_lock_leave_schedule ON public.leave_requests;
CREATE TRIGGER aaa_lock_leave_schedule BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.lock_leave_schedule_write();

-- Runs in the same transaction, including for direct table API approvals.
CREATE OR REPLACE FUNCTION public.release_approved_leave_shifts()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE expected_count integer; changed_count integer;
BEGIN
  IF NEW.status<>'approved' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status='approved' AND NEW.start_date=OLD.start_date AND NEW.end_date=OLD.end_date THEN RETURN NEW; END IF;
  END IF;
  SELECT count(*) INTO expected_count FROM public.shifts
    WHERE business_id=NEW.business_id AND assigned_user_id=NEW.user_id
      AND shift_date BETWEEN NEW.start_date AND NEW.end_date AND status<>'cancelled';
  UPDATE public.shifts SET assigned_user_id=NULL,status='unassigned'
    WHERE business_id=NEW.business_id AND assigned_user_id=NEW.user_id
      AND shift_date BETWEEN NEW.start_date AND NEW.end_date AND status<>'cancelled';
  GET DIAGNOSTICS changed_count=ROW_COUNT;
  IF changed_count<>expected_count THEN
    RAISE EXCEPTION 'Unable to release all conflicting shifts' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS release_approved_leave_shifts ON public.leave_requests;
CREATE TRIGGER release_approved_leave_shifts AFTER INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.release_approved_leave_shifts();

CREATE OR REPLACE FUNCTION public.record_employee_leave(
 _business_id uuid,_user_id uuid,_leave_type public.leave_type,_start_date date,_end_date date,
 _reason text DEFAULT NULL,_manager_note text DEFAULT NULL,_sickness_meta jsonb DEFAULT NULL,_lifecycle_status text DEFAULT NULL)
RETURNS TABLE(leave_id uuid,released_shift_count integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); actor_role public.app_role; new_id uuid; conflicts integer;
BEGIN
 IF public.has_role(actor,_business_id,'owner') THEN actor_role:='owner';
 ELSIF public.has_role(actor,_business_id,'manager') AND actor<>_user_id THEN actor_role:='manager';
 ELSE RAISE EXCEPTION 'Only active management can record this leave' USING ERRCODE='42501'; END IF;
 IF NOT public.is_member(_user_id,_business_id) THEN RAISE EXCEPTION 'Employee must be an active business member' USING ERRCODE='42501'; END IF;
 IF _leave_type IS NULL OR _leave_type NOT IN ('annual','unpaid','sick') OR _start_date IS NULL OR _end_date IS NULL OR _end_date<_start_date THEN
   RAISE EXCEPTION 'Invalid leave type or dates' USING ERRCODE='23514'; END IF;
 IF _sickness_meta IS NOT NULL AND jsonb_typeof(_sickness_meta)<>'object' THEN RAISE EXCEPTION 'Sickness details must be an object' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 IF EXISTS(SELECT 1 FROM public.leave_requests WHERE business_id=_business_id AND user_id=_user_id AND status IN ('pending','approved') AND start_date<=_end_date AND end_date>=_start_date) THEN
   RAISE EXCEPTION 'This employee already has leave covering part of those dates' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO conflicts FROM public.shifts WHERE business_id=_business_id AND assigned_user_id=_user_id AND shift_date BETWEEN _start_date AND _end_date AND status<>'cancelled';
 INSERT INTO public.leave_requests(business_id,user_id,leave_type,start_date,end_date,reason,manager_note,source,status,created_by_user_id,created_by_role,approved_by,approved_at,sickness_meta,lifecycle_status)
 VALUES(_business_id,_user_id,_leave_type,_start_date,_end_date,_reason,_manager_note,
 CASE WHEN actor_role='owner' THEN 'owner_created' ELSE 'manager_created' END,'approved',actor,actor_role,actor,now(),
 CASE WHEN _leave_type='sick' THEN _sickness_meta END,CASE WHEN _leave_type='sick' THEN coalesce(_lifecycle_status,'recorded_absence') END)
 RETURNING id INTO new_id;
 RETURN QUERY SELECT new_id,conflicts;
END $$;

CREATE OR REPLACE FUNCTION public.review_employee_leave(_business_id uuid,_leave_id uuid,_status public.leave_status,_review_notes text DEFAULT NULL)
RETURNS TABLE(leave_id uuid,released_shift_count integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target_user uuid; target_start date; target_end date; target_status public.leave_status; conflicts integer:=0;
BEGIN
 IF NOT public.is_manager_or_owner(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active management is required' USING ERRCODE='42501'; END IF;
 IF _status IS NULL OR _status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid review status' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 SELECT user_id,start_date,end_date,status INTO target_user,target_start,target_end,target_status
 FROM public.leave_requests WHERE id=_leave_id AND business_id=_business_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Leave request not found' USING ERRCODE='42501'; END IF;
 IF target_user=auth.uid() AND NOT public.is_owner(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Managers cannot review their own leave' USING ERRCODE='42501'; END IF;
 IF target_status<>'pending' THEN RAISE EXCEPTION 'Only pending requests can be reviewed' USING ERRCODE='40001'; END IF;
 IF _status='approved' THEN SELECT count(*) INTO conflicts FROM public.shifts WHERE business_id=_business_id AND assigned_user_id=target_user AND shift_date BETWEEN target_start AND target_end AND status<>'cancelled'; END IF;
 UPDATE public.leave_requests SET status=_status,review_notes=_review_notes WHERE id=_leave_id AND business_id=_business_id;
 RETURN QUERY SELECT _leave_id,conflicts;
END $$;
REVOKE ALL ON FUNCTION public.record_employee_leave(uuid,uuid,public.leave_type,date,date,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_employee_leave(uuid,uuid,public.leave_type,date,date,text,text,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_employee_leave(uuid,uuid,public.leave_status,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_employee_leave(uuid,uuid,public.leave_status,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leave_requests(_business_id uuid)
RETURNS SETOF public.leave_requests LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(auth.uid(),_business_id) THEN
    RAISE EXCEPTION 'Active business membership is required' USING ERRCODE='42501';
  END IF;
  IF public.is_manager_or_owner(auth.uid(),_business_id) THEN
    RETURN QUERY SELECT l.* FROM public.leave_requests l WHERE l.business_id=_business_id;
  ELSE
    RETURN QUERY SELECT (jsonb_populate_record(NULL::public.leave_requests,jsonb_build_object(
      'id',l.id,'business_id',l.business_id,'user_id',l.user_id,'leave_type',l.leave_type,'status',l.status,
      'start_date',l.start_date,'end_date',l.end_date,'reason',l.reason,'reviewed_by',l.reviewed_by,
      'reviewed_at',l.reviewed_at,'review_notes',CASE WHEN l.manager_note IS NOT NULL AND l.review_notes=l.manager_note THEN NULL ELSE l.review_notes END,'created_at',l.created_at,'updated_at',l.updated_at,
      'source',l.source,'created_by_user_id',l.created_by_user_id,'created_by_role',l.created_by_role,
      'approved_at',l.approved_at,'approved_by',l.approved_by))).*
    FROM public.leave_requests l WHERE l.business_id=_business_id AND l.user_id=auth.uid();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_leave_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leave_requests(uuid) TO authenticated;


NOTIFY pgrst, 'reload schema';

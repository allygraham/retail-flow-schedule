CREATE OR REPLACE FUNCTION public.validate_leave_request_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'End date must be on or after start date';
  END IF;

  IF NEW.source = 'employee_request' THEN
    IF NEW.created_by_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Employee-requested leave must be created by the same user';
    END IF;

    IF NEW.status NOT IN ('pending', 'cancelled', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'Invalid status for employee-requested leave';
    END IF;
  ELSIF NEW.source IN ('manager_created', 'owner_created') THEN
    IF NEW.created_by_user_id IS NULL THEN
      RAISE EXCEPTION 'Management-created leave must include the creating user';
    END IF;

    IF NEW.created_by_role IS NULL THEN
      RAISE EXCEPTION 'Management-created leave must include the creating role';
    END IF;

    IF (TG_OP='INSERT' AND NEW.status<>'approved') OR NEW.status NOT IN ('approved','cancelled') THEN
      RAISE EXCEPTION 'Management-created leave must be saved as approved';
    END IF;

    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'Management-created leave must include approval details';
    END IF;
  END IF;

  IF NEW.created_by_role IS NOT NULL AND NEW.created_by_role NOT IN ('owner', 'manager', 'employee') THEN
    RAISE EXCEPTION 'Invalid created_by_role';
  END IF;

  RETURN NEW;
END;
$$;


-- Terminal decisions cannot be cancelled or reopened through the direct API.
CREATE OR REPLACE FUNCTION public.guard_leave_cancellation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status IN ('cancelled','rejected') THEN
   RAISE EXCEPTION 'Terminal leave decisions cannot be reopened' USING ERRCODE='23514'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status='cancelled' AND OLD.status NOT IN ('pending','approved') THEN
   RAISE EXCEPTION 'Only pending or approved leave can be cancelled' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_leave_cancellation ON public.leave_requests;
CREATE TRIGGER guard_leave_cancellation BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_leave_cancellation();

CREATE OR REPLACE FUNCTION public.cancel_leave_request(_business_id uuid,_leave_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target_user uuid; target_source text; target_status public.leave_status; cancelled_id uuid;
BEGIN
 IF NOT public.is_member(auth.uid(),_business_id) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text,41030));
 SELECT user_id,source,status INTO target_user,target_source,target_status
 FROM public.leave_requests WHERE business_id=_business_id AND id=_leave_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Leave request not found' USING ERRCODE='42501'; END IF;
 IF NOT (public.is_owner(auth.uid(),_business_id)
   OR (public.has_role(auth.uid(),_business_id,'manager') AND target_user<>auth.uid())
   OR (target_user=auth.uid() AND target_source='employee_request')) THEN
   RAISE EXCEPTION 'You cannot cancel this leave' USING ERRCODE='42501'; END IF;
 IF target_status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Only pending or approved leave can be cancelled' USING ERRCODE='40001'; END IF;
 UPDATE public.leave_requests SET status='cancelled' WHERE id=_leave_id AND business_id=_business_id RETURNING id INTO cancelled_id;
 IF cancelled_id IS NULL THEN RAISE EXCEPTION 'Leave could not be cancelled' USING ERRCODE='42501'; END IF;
 RETURN cancelled_id;
END $$;
REVOKE ALL ON FUNCTION public.cancel_leave_request(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_leave_request(uuid,uuid) TO authenticated;

-- Approved leave uses the agreed pattern at approval, independent of later edits.
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS charged_working_days smallint[];
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_charged_working_days_valid;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_charged_working_days_valid
 CHECK (charged_working_days IS NULL OR public.valid_working_days(charged_working_days));
GRANT SELECT(charged_working_days) ON public.leave_requests TO authenticated;
-- Historical patterns were not stored. Freeze the currently recorded baseline.
UPDATE public.leave_requests l SET charged_working_days=ep.working_days FROM public.employee_profiles ep
WHERE l.business_id=ep.business_id AND l.user_id=ep.user_id AND l.leave_type='annual'
 AND l.status='approved' AND l.charged_working_days IS NULL AND ep.working_days IS NOT NULL;

CREATE OR REPLACE FUNCTION public.capture_leave_working_days()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN NEW.charged_working_days:=OLD.charged_working_days;
 ELSE NEW.charged_working_days:=NULL; END IF;
 IF NEW.leave_type='annual' AND NEW.status='approved' THEN
   IF TG_OP='INSERT' OR OLD.status<>'approved' OR OLD.leave_type<>'annual' OR OLD.charged_working_days IS NULL THEN
     SELECT working_days INTO NEW.charged_working_days FROM public.employee_profiles
     WHERE business_id=NEW.business_id AND user_id=NEW.user_id;
     IF NEW.charged_working_days IS NULL AND (TG_OP='INSERT' OR OLD.status<>'approved' OR OLD.leave_type<>'annual') THEN
       RAISE EXCEPTION 'Set the employee working days before approving annual leave' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
-- Run after authorisation so employees cannot smuggle a charge into their own writes.
DROP TRIGGER IF EXISTS capture_leave_working_days ON public.leave_requests;
CREATE TRIGGER capture_leave_working_days BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.capture_leave_working_days();

-- If a historical employee had no pattern, their first configured pattern
-- establishes the missing baseline; later pattern changes never overwrite it.
CREATE OR REPLACE FUNCTION public.initialise_missing_leave_charges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.working_days IS NOT NULL THEN
   UPDATE public.leave_requests SET charged_working_days=NEW.working_days
   WHERE business_id=NEW.business_id AND user_id=NEW.user_id AND leave_type='annual'
     AND status='approved' AND charged_working_days IS NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS initialise_missing_leave_charges ON public.employee_profiles;
CREATE TRIGGER initialise_missing_leave_charges AFTER INSERT OR UPDATE OF working_days ON public.employee_profiles
FOR EACH ROW EXECUTE FUNCTION public.initialise_missing_leave_charges();

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
      'charged_working_days',l.charged_working_days,'id',l.id,'business_id',l.business_id,'user_id',l.user_id,'leave_type',l.leave_type,'status',l.status,
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

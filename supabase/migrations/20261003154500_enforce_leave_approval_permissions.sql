-- Enforce field permissions and status transitions, not just row ownership.
CREATE OR REPLACE FUNCTION public.authorize_leave_request_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  can_review boolean;
BEGIN
  -- Trusted administration/service-role jobs retain their existing access.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF actor IS NULL OR NOT public.is_member(actor, NEW.business_id) THEN
    RAISE EXCEPTION 'Active business membership is required' USING ERRCODE = '42501';
  END IF;
  can_review := public.has_role(actor, NEW.business_id, 'owner')
    OR (public.has_role(actor, NEW.business_id, 'manager') AND NEW.user_id <> actor);

  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_member(NEW.user_id, NEW.business_id) THEN
      RAISE EXCEPTION 'Leave must belong to an active business member' USING ERRCODE = '42501';
    END IF;
    IF NEW.source = 'employee_request' THEN
      IF NEW.user_id IS DISTINCT FROM actor
        OR NEW.created_by_user_id IS DISTINCT FROM actor
        OR (NEW.created_by_role IS NOT NULL AND NEW.created_by_role <> 'employee')
        OR NEW.status <> 'pending'
        OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
        OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
        OR NEW.review_notes IS NOT NULL OR NEW.manager_note IS NOT NULL THEN
        RAISE EXCEPTION 'Employees can only submit pending, unreviewed leave requests' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT can_review OR NEW.created_by_user_id IS DISTINCT FROM actor
        OR NEW.approved_by IS DISTINCT FROM actor OR NEW.status <> 'approved'
        OR NOT (
          (NEW.source = 'owner_created' AND NEW.created_by_role = 'owner'
            AND public.has_role(actor, NEW.business_id, 'owner'))
          OR (NEW.source = 'manager_created' AND NEW.created_by_role = 'manager'
            AND public.has_role(actor, NEW.business_id, 'manager'))
        ) THEN
        RAISE EXCEPTION 'Only authorised management can record approved leave' USING ERRCODE = '42501';
      END IF;
      NEW.approved_at := now();
      NEW.reviewed_by := actor;
      NEW.reviewed_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Prevent changing the employee/business/source to evade self-review checks.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_by_role IS DISTINCT FROM OLD.created_by_role
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Leave identity and creation details cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NOT can_review THEN
    IF OLD.user_id IS DISTINCT FROM actor OR OLD.source <> 'employee_request' THEN
      RAISE EXCEPTION 'You cannot change this leave request' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'pending' THEN
      IF NEW.status NOT IN ('pending', 'cancelled')
        OR (to_jsonb(NEW) - ARRAY['status','start_date','end_date','leave_type','reason','updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['status','start_date','end_date','leave_type','reason','updated_at']) THEN
        RAISE EXCEPTION 'Employees cannot approve, reject or change review details' USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.status = 'approved' AND NEW.status = 'cancelled' THEN
      IF (to_jsonb(NEW) - ARRAY['status','updated_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN
        RAISE EXCEPTION 'Approved leave can only be cancelled by its requester' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'This leave request cannot be changed by its requester' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected') THEN
      IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending requests can be reviewed' USING ERRCODE = '42501';
      END IF;
      NEW.reviewed_by := actor;
      NEW.reviewed_at := now();
      IF NEW.status = 'approved' THEN
        NEW.approved_by := actor;
        NEW.approved_at := now();
      ELSE
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
      END IF;
    ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Review attribution is set by the database' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authorize_leave_request_write ON public.leave_requests;
CREATE TRIGGER authorize_leave_request_write
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.authorize_leave_request_write();

DROP POLICY IF EXISTS "Members create leave with role rules" ON public.leave_requests;
CREATE POLICY "Members create leave with role rules" ON public.leave_requests
  FOR INSERT TO authenticated WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND (
      (user_id = auth.uid() AND source = 'employee_request' AND status = 'pending')
      OR (source = 'owner_created' AND public.has_role(auth.uid(), business_id, 'owner'))
      OR (source = 'manager_created' AND user_id <> auth.uid()
        AND public.has_role(auth.uid(), business_id, 'manager'))
    )
  );

DROP POLICY IF EXISTS "Members update leave with role rules" ON public.leave_requests;
CREATE POLICY "Members update leave with role rules" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_member(auth.uid(), business_id) AND (
      (user_id = auth.uid() AND created_by_user_id = user_id AND source = 'employee_request')
      OR public.has_role(auth.uid(), business_id, 'owner')
      OR (user_id <> auth.uid() AND public.has_role(auth.uid(), business_id, 'manager'))
    )
  )
  WITH CHECK (
    public.is_member(auth.uid(), business_id) AND (
      (user_id = auth.uid() AND created_by_user_id = user_id AND source = 'employee_request')
      OR public.has_role(auth.uid(), business_id, 'owner')
      OR (user_id <> auth.uid() AND public.has_role(auth.uid(), business_id, 'manager'))
    )
  );

ALTER TABLE public.leave_requests
ADD COLUMN source text NOT NULL DEFAULT 'employee_request',
ADD COLUMN created_by_user_id uuid,
ADD COLUMN created_by_role public.app_role,
ADD COLUMN approved_at timestamp with time zone,
ADD COLUMN approved_by uuid,
ADD COLUMN manager_note text;

ALTER TABLE public.leave_requests
ADD CONSTRAINT leave_requests_source_valid
CHECK (source IN ('employee_request', 'manager_created', 'owner_created'));

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

    IF NEW.status <> 'approved' THEN
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

DROP TRIGGER IF EXISTS validate_leave_request_write ON public.leave_requests;
CREATE TRIGGER validate_leave_request_write
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_leave_request_write();

DROP POLICY IF EXISTS "Employees create own leave" ON public.leave_requests;
CREATE POLICY "Members create leave with role rules"
ON public.leave_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_member(auth.uid(), business_id)
  AND (
    (
      user_id = auth.uid()
      AND source = 'employee_request'
      AND created_by_user_id = auth.uid()
      AND (created_by_role IS NULL OR created_by_role = 'employee')
    )
    OR
    (
      public.has_permission(auth.uid(), business_id, 'manage_leave')
      AND source IN ('manager_created', 'owner_created')
      AND created_by_user_id = auth.uid()
      AND created_by_role IN ('owner', 'manager')
      AND approved_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Owners cancel own leave" ON public.leave_requests;
CREATE POLICY "Members update leave with role rules"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid()) OR public.has_permission(auth.uid(), business_id, 'manage_leave')
)
WITH CHECK (
  public.is_member(auth.uid(), business_id)
  AND (
    (
      user_id = auth.uid()
      AND created_by_user_id = user_id
      AND (source = 'employee_request' OR status = 'cancelled')
    )
    OR public.has_permission(auth.uid(), business_id, 'manage_leave')
  )
);

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
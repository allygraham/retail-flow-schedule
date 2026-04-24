-- Light hardening: add missing indexes on commonly-queried columns
CREATE INDEX IF NOT EXISTS idx_leave_user_status ON public.leave_requests (user_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_business_status ON public.leave_requests (business_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_business ON public.employee_profiles (business_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_store ON public.employee_profiles (primary_store_id);
CREATE INDEX IF NOT EXISTS idx_store_locations_business_active ON public.store_locations (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_schedules_business_week ON public.schedules (business_id, week_start);
CREATE INDEX IF NOT EXISTS idx_schedules_store_week ON public.schedules (store_id, week_start);
CREATE INDEX IF NOT EXISTS idx_user_roles_business_role ON public.user_roles (business_id, role);
CREATE INDEX IF NOT EXISTS idx_memberships_business_active ON public.memberships (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_log_business_created ON public.audit_log (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_user ON public.availability (user_id);
CREATE INDEX IF NOT EXISTS idx_roles_catalog_business ON public.roles_catalog (business_id);

-- Ensure leave_requests end_date >= start_date is enforced (validation trigger already exists,
-- but add a CHECK constraint as a hard guarantee). Using NOT VALID first to avoid blocking
-- existing data, then validating.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leave_requests_date_range_check'
  ) THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_date_range_check
      CHECK (end_date >= start_date) NOT VALID;
    -- Validate; safe because the validation trigger has been enforcing this.
    ALTER TABLE public.leave_requests VALIDATE CONSTRAINT leave_requests_date_range_check;
  END IF;
END$$;
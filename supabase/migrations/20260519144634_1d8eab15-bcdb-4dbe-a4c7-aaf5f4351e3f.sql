ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS sickness_meta jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_status text;

CREATE INDEX IF NOT EXISTS idx_leave_requests_type_user_dates
  ON public.leave_requests (business_id, user_id, leave_type, start_date);
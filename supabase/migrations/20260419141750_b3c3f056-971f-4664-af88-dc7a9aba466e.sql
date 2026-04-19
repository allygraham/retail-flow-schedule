ALTER TABLE public.employee_profiles
ADD COLUMN IF NOT EXISTS annual_leave_entitlement numeric NOT NULL DEFAULT 28;
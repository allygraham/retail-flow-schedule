ALTER TABLE public.businesses
  ADD COLUMN leave_year_mode text NOT NULL DEFAULT 'calendar',
  ADD COLUMN leave_year_start_date date,
  ADD CONSTRAINT businesses_leave_year_check CHECK (
    (leave_year_mode IN ('calendar', 'tax') AND leave_year_start_date IS NULL)
    OR (leave_year_mode = 'financial' AND leave_year_start_date IS NOT NULL)
  );
-- Existing business UPDATE policy requires an active owner through has_role.

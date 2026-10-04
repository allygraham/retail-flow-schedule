-- A missing pattern remains explicit; contracted hours do not identify weekdays.
ALTER TABLE public.employee_profiles ADD COLUMN IF NOT EXISTS working_days smallint[];

CREATE OR REPLACE FUNCTION public.valid_working_days(_days smallint[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT array_ndims(_days)=1 AND cardinality(_days) BETWEEN 1 AND 7
    AND _days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
    AND array_position(_days,NULL) IS NULL
    AND cardinality(_days)=(SELECT count(DISTINCT day) FROM unnest(_days) day);
$$;
ALTER TABLE public.employee_profiles DROP CONSTRAINT IF EXISTS employee_profiles_working_days_check;
ALTER TABLE public.employee_profiles ADD CONSTRAINT employee_profiles_working_days_check
  CHECK (working_days IS NULL OR public.valid_working_days(working_days));

-- Existing RLS restricts reads to self/management and writes to active management.
GRANT SELECT (working_days) ON public.employee_profiles TO authenticated;

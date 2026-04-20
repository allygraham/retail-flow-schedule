ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS public_holidays_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_holidays_region text NOT NULL DEFAULT 'england';

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_public_holidays_region_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_public_holidays_region_check
  CHECK (public_holidays_region IN ('england', 'scotland'));
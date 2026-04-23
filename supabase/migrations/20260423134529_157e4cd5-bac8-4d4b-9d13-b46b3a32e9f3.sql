ALTER TABLE public.business_branding
ADD COLUMN IF NOT EXISTS theme_key text NOT NULL DEFAULT 'default';

UPDATE public.business_branding
SET theme_key = 'default'
WHERE theme_key IS NULL;

ALTER TABLE public.business_branding
ADD CONSTRAINT business_branding_theme_key_check
CHECK (theme_key IN ('default', 'dark', 'light', 'green', 'orange'));
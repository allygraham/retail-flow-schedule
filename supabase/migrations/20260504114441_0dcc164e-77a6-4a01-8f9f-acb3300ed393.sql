ALTER TABLE public.business_branding DROP CONSTRAINT IF EXISTS business_branding_theme_key_check;
ALTER TABLE public.business_branding ADD CONSTRAINT business_branding_theme_key_check
  CHECK (theme_key = ANY (ARRAY['default','midnight','forest','sunset','slate','topdrawer']));
-- 1. Branding table
CREATE TABLE public.business_branding (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  display_name TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  surface_color TEXT,
  logo_url TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_branding ENABLE ROW LEVEL SECURITY;

-- Members can view their business branding (so the app can theme)
CREATE POLICY "Members read branding"
  ON public.business_branding FOR SELECT
  TO authenticated
  USING (public.is_member(auth.uid(), business_id));

-- Only managers/owners can insert / update / delete
CREATE POLICY "Managers insert branding"
  ON public.business_branding FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

CREATE POLICY "Managers update branding"
  ON public.business_branding FOR UPDATE
  TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

CREATE POLICY "Managers delete branding"
  ON public.business_branding FOR DELETE
  TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id));

-- updated_at trigger
CREATE TRIGGER business_branding_updated_at
  BEFORE UPDATE ON public.business_branding
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Storage bucket for logos (public read so <img src> works without signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read of logos
CREATE POLICY "Public read business logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-logos');

-- Path convention: <business_id>/<filename>
-- Only managers/owners of that business can write
CREATE POLICY "Managers upload business logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-logos'
    AND public.is_manager_or_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Managers update business logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND public.is_manager_or_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Managers delete business logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-logos'
    AND public.is_manager_or_owner(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
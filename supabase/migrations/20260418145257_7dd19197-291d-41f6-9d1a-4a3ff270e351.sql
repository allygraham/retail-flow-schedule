-- Remove permissive insert policy
DROP POLICY IF EXISTS "Authenticated can create business" ON public.businesses;

-- Block direct inserts; force going through the bootstrap function
CREATE POLICY "No direct business inserts" ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (false);

-- Atomic signup bootstrap: business + membership + owner role
CREATE OR REPLACE FUNCTION public.bootstrap_business(
  _name TEXT,
  _slug TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _bid UUID;
  _final_slug TEXT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _final_slug := lower(regexp_replace(coalesce(_slug, _name), '[^a-zA-Z0-9]+', '-', 'g'));
  -- ensure unique
  WHILE EXISTS (SELECT 1 FROM public.businesses WHERE slug = _final_slug) LOOP
    _final_slug := _final_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  END LOOP;

  INSERT INTO public.businesses (name, slug) VALUES (_name, _final_slug) RETURNING id INTO _bid;
  INSERT INTO public.memberships (user_id, business_id) VALUES (_uid, _bid);
  INSERT INTO public.user_roles (user_id, business_id, role) VALUES (_uid, _bid, 'owner');

  RETURN _bid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_business(TEXT, TEXT) TO authenticated;
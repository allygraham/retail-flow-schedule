CREATE OR REPLACE FUNCTION public.invitations_normalize_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  NEW.updated_at := now();
  RETURN NEW;
END $$;
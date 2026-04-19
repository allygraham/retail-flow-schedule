-- Status enum for invitations
DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role public.app_role NOT NULL DEFAULT 'employee',
  primary_store_id uuid REFERENCES public.store_locations(id) ON DELETE SET NULL,
  primary_role_id uuid REFERENCES public.roles_catalog(id) ON DELETE SET NULL,
  contracted_hours numeric,
  hire_date date,
  phone text,
  notes text,
  token text NOT NULL UNIQUE,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid,
  accepted_user_id uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Normalize email
CREATE OR REPLACE FUNCTION public.invitations_normalize_email()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invitations_normalize_email ON public.invitations;
CREATE TRIGGER trg_invitations_normalize_email
BEFORE INSERT OR UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.invitations_normalize_email();

-- Only one open invite per (business, email)
CREATE UNIQUE INDEX IF NOT EXISTS invitations_unique_pending_per_business_email
  ON public.invitations (business_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invitations_business_idx ON public.invitations (business_id);
CREATE INDEX IF NOT EXISTS invitations_status_idx ON public.invitations (status);

-- RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read invitations" ON public.invitations;
CREATE POLICY "Managers read invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id));

DROP POLICY IF EXISTS "Managers create invitations" ON public.invitations;
CREATE POLICY "Managers create invitations" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_owner(auth.uid(), business_id));

DROP POLICY IF EXISTS "Managers update invitations" ON public.invitations;
CREATE POLICY "Managers update invitations" ON public.invitations
  FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id));

DROP POLICY IF EXISTS "Managers delete invitations" ON public.invitations;
CREATE POLICY "Managers delete invitations" ON public.invitations
  FOR DELETE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), business_id));

-- Public lookup by token (used on the accept-invite page before sign-in)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  business_name text,
  email text,
  full_name text,
  role public.app_role,
  status public.invitation_status,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.business_id, b.name AS business_name, i.email, i.full_name,
         i.role, i.status, i.expires_at
  FROM public.invitations i
  JOIN public.businesses b ON b.id = i.business_id
  WHERE i.token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;

-- Accept an invitation: links the invite to the signed-in user and creates membership, role, and employee profile.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv  public.invitations%ROWTYPE;
  v_email text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_inv.status USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user;
  IF v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation' USING ERRCODE = 'P0001';
  END IF;

  -- Membership
  INSERT INTO public.memberships (user_id, business_id, is_active)
  VALUES (v_user, v_inv.business_id, true)
  ON CONFLICT DO NOTHING;

  -- Role
  INSERT INTO public.user_roles (user_id, business_id, role)
  VALUES (v_user, v_inv.business_id, v_inv.role)
  ON CONFLICT DO NOTHING;

  -- Employee profile (only if missing for this user+business)
  INSERT INTO public.employee_profiles (
    user_id, business_id, primary_store_id, primary_role_id,
    contracted_hours, hire_date, notes
  )
  SELECT v_user, v_inv.business_id, v_inv.primary_store_id, v_inv.primary_role_id,
         v_inv.contracted_hours, v_inv.hire_date, v_inv.notes
  WHERE NOT EXISTS (
    SELECT 1 FROM public.employee_profiles
    WHERE user_id = v_user AND business_id = v_inv.business_id
  );

  -- Profile (full_name + phone), don't overwrite if already set
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (v_user, v_inv.full_name, v_inv.phone)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone     = COALESCE(public.profiles.phone, EXCLUDED.phone);

  -- Mark invitation accepted
  UPDATE public.invitations
     SET status = 'accepted', accepted_user_id = v_user, accepted_at = now()
   WHERE id = v_inv.id;

  RETURN v_inv.business_id;
END $$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
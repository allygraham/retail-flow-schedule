-- Make acceptance retries safe and handle invitations for existing memberships.
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
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user;
  IF v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'Signed-in email does not match the invitation' USING ERRCODE = 'P0001';
  END IF;
  -- Retries after an accepted response was lost must not duplicate or restore access.
  IF v_inv.status = 'accepted' AND v_inv.accepted_user_id = v_user THEN
    IF EXISTS (SELECT 1 FROM public.memberships
               WHERE user_id = v_user AND business_id = v_inv.business_id AND is_active) THEN
      RETURN v_inv.business_id;
    END IF;
    RAISE EXCEPTION 'Membership is inactive. Ask your manager for a new invitation' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_inv.status USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'P0001';
  END IF;

  -- A fresh invitation can reactivate a former employee. Keep an active
  -- member's existing role; accepting an employee invite must not demote an owner.
  IF NOT EXISTS (SELECT 1 FROM public.memberships
                 WHERE user_id = v_user AND business_id = v_inv.business_id AND is_active) THEN
    DELETE FROM public.user_roles WHERE user_id = v_user AND business_id = v_inv.business_id;
    INSERT INTO public.user_roles (user_id, business_id, role)
    VALUES (v_user, v_inv.business_id, v_inv.role);
  END IF;

  -- Membership
  INSERT INTO public.memberships (user_id, business_id, is_active)
  VALUES (v_user, v_inv.business_id, true)
  ON CONFLICT (user_id, business_id) DO UPDATE SET is_active = true;

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
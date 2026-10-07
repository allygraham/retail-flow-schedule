-- Return account emails only to active managers/owners in the requested business.
-- Keep auth.users private; expose only member IDs and email addresses.
CREATE FUNCTION public.get_team_member_emails(_business_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_member(auth.uid(), _business_id)
    OR NOT (public.has_role(auth.uid(), _business_id, 'owner') OR public.has_role(auth.uid(), _business_id, 'manager')) THEN
    RAISE EXCEPTION 'Not authorised to view team email addresses' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.user_id, u.email::text
    FROM public.memberships m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.business_id = _business_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_team_member_emails(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_member_emails(uuid) TO authenticated;

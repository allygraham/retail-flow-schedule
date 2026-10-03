-- Initial ownership is created only by bootstrap_business; invited membership
-- and roles are created by accept_invitation. Both run as SECURITY DEFINER.
-- Regular authenticated API callers must already be active business owners.

DROP POLICY IF EXISTS "Owners insert memberships" ON public.memberships;
CREATE POLICY "Owners insert memberships" ON public.memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND public.has_role(auth.uid(), business_id, 'owner')
  );

DROP POLICY IF EXISTS "Owners or self-bootstrap insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners insert roles" ON public.user_roles;
CREATE POLICY "Owners insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND public.has_role(auth.uid(), business_id, 'owner')
    AND public.is_member(user_id, business_id)
  );

-- Restrictive guards also protect against other permissive INSERT policies
-- that may have been added independently in the hosted project.
DROP POLICY IF EXISTS "Membership inserts require an active owner" ON public.memberships;
CREATE POLICY "Membership inserts require an active owner" ON public.memberships
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND public.has_role(auth.uid(), business_id, 'owner')
  );

DROP POLICY IF EXISTS "Role inserts require an active owner and member" ON public.user_roles;
CREATE POLICY "Role inserts require an active owner and member" ON public.user_roles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND public.has_role(auth.uid(), business_id, 'owner')
    AND public.is_member(user_id, business_id)
  );

-- A manager must not bypass the invitation function's owner-only check by
-- creating or changing an owner invitation directly through the table API.
DROP POLICY IF EXISTS "Invitation inserts enforce owner assignment" ON public.invitations;
CREATE POLICY "Invitation inserts enforce owner assignment" ON public.invitations
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND public.is_manager_or_owner(auth.uid(), business_id)
    AND (role <> 'owner' OR public.has_role(auth.uid(), business_id, 'owner'))
  );

DROP POLICY IF EXISTS "Invitation updates enforce owner assignment" ON public.invitations;
CREATE POLICY "Invitation updates enforce owner assignment" ON public.invitations
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.is_member(auth.uid(), business_id)
    AND public.is_manager_or_owner(auth.uid(), business_id)
    AND (role <> 'owner' OR public.has_role(auth.uid(), business_id, 'owner'))
  )
  WITH CHECK (
    public.is_member(auth.uid(), business_id)
    AND public.is_manager_or_owner(auth.uid(), business_id)
    AND (role <> 'owner' OR public.has_role(auth.uid(), business_id, 'owner'))
  );

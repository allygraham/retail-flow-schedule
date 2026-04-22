CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND business_id = _business_id
      AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _business_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE _permission
    WHEN 'manage_settings' THEN public.is_owner(_user_id, _business_id)
    WHEN 'manage_stores' THEN public.is_owner(_user_id, _business_id)
    WHEN 'manage_staff' THEN public.has_role(_user_id, _business_id, 'owner') OR public.has_role(_user_id, _business_id, 'manager')
    WHEN 'manage_schedules' THEN public.has_role(_user_id, _business_id, 'owner') OR public.has_role(_user_id, _business_id, 'manager')
    WHEN 'manage_leave' THEN public.has_role(_user_id, _business_id, 'owner') OR public.has_role(_user_id, _business_id, 'manager')
    WHEN 'view_operational_dashboards' THEN public.has_role(_user_id, _business_id, 'owner') OR public.has_role(_user_id, _business_id, 'manager')
    WHEN 'view_own_schedule' THEN public.is_member(_user_id, _business_id)
    WHEN 'request_leave' THEN public.is_member(_user_id, _business_id)
    WHEN 'view_own_requests' THEN public.is_member(_user_id, _business_id)
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "Managers and owners update business" ON public.businesses;
CREATE POLICY "Owners update business"
ON public.businesses
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), id, 'manage_settings'))
WITH CHECK (public.has_permission(auth.uid(), id, 'manage_settings'));

DROP POLICY IF EXISTS "Managers delete branding" ON public.business_branding;
DROP POLICY IF EXISTS "Managers insert branding" ON public.business_branding;
DROP POLICY IF EXISTS "Managers update branding" ON public.business_branding;
CREATE POLICY "Owners delete branding"
ON public.business_branding
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), business_id, 'manage_settings'));
CREATE POLICY "Owners insert branding"
ON public.business_branding
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission(auth.uid(), business_id, 'manage_settings'));
CREATE POLICY "Owners update branding"
ON public.business_branding
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), business_id, 'manage_settings'))
WITH CHECK (public.has_permission(auth.uid(), business_id, 'manage_settings'));

DROP POLICY IF EXISTS "Managers delete custom holidays" ON public.custom_holidays;
DROP POLICY IF EXISTS "Managers insert custom holidays" ON public.custom_holidays;
DROP POLICY IF EXISTS "Managers update custom holidays" ON public.custom_holidays;
CREATE POLICY "Owners delete custom holidays"
ON public.custom_holidays
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), business_id, 'manage_settings'));
CREATE POLICY "Owners insert custom holidays"
ON public.custom_holidays
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission(auth.uid(), business_id, 'manage_settings'));
CREATE POLICY "Owners update custom holidays"
ON public.custom_holidays
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), business_id, 'manage_settings'))
WITH CHECK (public.has_permission(auth.uid(), business_id, 'manage_settings'));

DROP POLICY IF EXISTS "Managers manage stores" ON public.store_locations;
CREATE POLICY "Owners manage stores"
ON public.store_locations
FOR ALL
TO authenticated
USING (public.has_permission(auth.uid(), business_id, 'manage_stores'))
WITH CHECK (public.has_permission(auth.uid(), business_id, 'manage_stores'));
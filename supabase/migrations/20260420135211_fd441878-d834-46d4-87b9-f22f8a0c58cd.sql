DROP POLICY IF EXISTS "Owners update business" ON public.businesses;

CREATE POLICY "Managers and owners update business"
ON public.businesses
FOR UPDATE
TO authenticated
USING (public.is_manager_or_owner(auth.uid(), id))
WITH CHECK (public.is_manager_or_owner(auth.uid(), id));
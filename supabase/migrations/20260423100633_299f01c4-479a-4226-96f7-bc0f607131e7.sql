DROP POLICY IF EXISTS "Members update leave with role rules" ON public.leave_requests;

CREATE POLICY "Members update leave with role rules"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  (
    user_id = auth.uid()
    AND created_by_user_id = user_id
    AND source = 'employee_request'
  )
  OR public.has_role(auth.uid(), business_id, 'owner')
  OR (
    public.has_role(auth.uid(), business_id, 'manager')
    AND user_id <> auth.uid()
  )
)
WITH CHECK (
  public.is_member(auth.uid(), business_id)
  AND (
    (
      user_id = auth.uid()
      AND created_by_user_id = user_id
      AND source = 'employee_request'
    )
    OR public.has_role(auth.uid(), business_id, 'owner')
    OR (
      public.has_role(auth.uid(), business_id, 'manager')
      AND user_id <> auth.uid()
    )
  )
);
-- Release an entire coverage selection only if every displayed version is current.
CREATE OR REPLACE FUNCTION public.release_coverage_shifts(_business_id uuid, _shifts jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE desired record; current_shift public.shifts%ROWTYPE; changed integer; requested integer;
BEGIN
  IF NOT public.is_manager_or_owner(auth.uid(), _business_id) THEN
    RAISE EXCEPTION 'Active management membership is required' USING ERRCODE = '42501';
  END IF;
  IF _shifts IS NULL OR jsonb_typeof(_shifts) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of shift versions' USING ERRCODE = '22023';
  END IF;
  requested := jsonb_array_length(_shifts);
  IF requested = 0 THEN RETURN 0; END IF;
  IF (SELECT count(DISTINCT id) FROM jsonb_to_recordset(_shifts) AS s(id uuid, updated_at timestamptz)) <> requested THEN
    RAISE EXCEPTION 'Each shift must be supplied exactly once' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_business_id::text, 41030));
  PERFORM 1 FROM public.shifts WHERE business_id = _business_id
    AND id IN (SELECT id FROM jsonb_to_recordset(_shifts) AS s(id uuid, updated_at timestamptz))
    ORDER BY id FOR UPDATE;
  FOR desired IN SELECT * FROM jsonb_to_recordset(_shifts) AS s(id uuid, updated_at timestamptz) LOOP
    SELECT * INTO current_shift FROM public.shifts WHERE id = desired.id AND business_id = _business_id;
    IF NOT FOUND OR current_shift.updated_at IS DISTINCT FROM desired.updated_at OR current_shift.status = 'cancelled' THEN
      RAISE EXCEPTION 'Coverage has changed. Refresh coverage and try again.' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  UPDATE public.shifts SET assigned_user_id = NULL, status = 'unassigned'
    WHERE business_id = _business_id
    AND id IN (SELECT id FROM jsonb_to_recordset(_shifts) AS s(id uuid, updated_at timestamptz));
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> requested THEN
    RAISE EXCEPTION 'Could not release every shift. Refresh coverage and try again.' USING ERRCODE = '42501';
  END IF;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.release_coverage_shifts(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_coverage_shifts(uuid, jsonb) TO authenticated;

-- Service-only exact lookup avoids paging through the entire Auth directory.
-- The edge function checks the caller's active management membership first.
CREATE OR REPLACE FUNCTION public.has_active_team_email(_business_id uuid, _email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m JOIN auth.users u ON u.id = m.user_id
    WHERE m.business_id = _business_id AND m.is_active
      AND lower(trim(u.email)) = lower(trim(_email))
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_team_email(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_team_email(uuid, text) TO service_role;

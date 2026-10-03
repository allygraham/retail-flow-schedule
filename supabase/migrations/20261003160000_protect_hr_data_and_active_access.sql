-- All privilege helpers require an active membership, even if roles remain.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _business_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.memberships m
    ON m.user_id=r.user_id AND m.business_id=r.business_id
    WHERE r.user_id=_user_id AND r.business_id=_business_id AND r.role=_role AND m.is_active);
$$;
CREATE OR REPLACE FUNCTION public.is_manager_or_owner(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,_business_id,'owner') OR public.has_role(_user_id,_business_id,'manager');
$$;
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,_business_id,'owner');
$$;

-- Restrictive policies protect every tenant table from stale memberships.
DO $$ DECLARE target record; BEGIN
  FOR target IN SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='business_id'
      AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Active membership required" ON public.%I',target.table_name);
    EXECUTE format('CREATE POLICY "Active membership required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_member(auth.uid(),business_id)) WITH CHECK (public.is_member(auth.uid(),business_id))',target.table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Read profiles of co-members" ON public.profiles;
CREATE POLICY "Read profiles of co-members" ON public.profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.memberships mine JOIN public.memberships peer ON mine.business_id=peer.business_id
  WHERE mine.user_id=auth.uid() AND mine.is_active AND peer.user_id=profiles.id));

DROP POLICY IF EXISTS "Members read employee_profiles" ON public.employee_profiles;
CREATE POLICY "Members read employee_profiles" ON public.employee_profiles FOR SELECT TO authenticated
USING (public.is_member(auth.uid(),business_id) AND (user_id=auth.uid() OR public.is_manager_or_owner(auth.uid(),business_id)));
DROP POLICY IF EXISTS "Employment reads require own record or management" ON public.employee_profiles;
CREATE POLICY "Employment reads require own record or management" ON public.employee_profiles
AS RESTRICTIVE FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_manager_or_owner(auth.uid(),business_id));
DROP POLICY IF EXISTS "Employees update own employee_profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Employment writes require management" ON public.employee_profiles;
CREATE POLICY "Employment writes require management" ON public.employee_profiles
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.is_manager_or_owner(auth.uid(),business_id))
WITH CHECK (public.is_manager_or_owner(auth.uid(),business_id));
-- Internal personnel notes are never exposed by the direct table API.
REVOKE SELECT ON public.employee_profiles FROM authenticated, anon, PUBLIC;
REVOKE SELECT (notes) ON public.employee_profiles FROM authenticated, anon, PUBLIC;
GRANT SELECT (id,user_id,business_id,primary_store_id,primary_role_id,employment_type,contracted_hours,hire_date,hourly_rate,annual_leave_entitlement,created_at,updated_at)
ON public.employee_profiles TO authenticated;

DROP POLICY IF EXISTS "Members read leave" ON public.leave_requests;
CREATE POLICY "Members read leave" ON public.leave_requests FOR SELECT TO authenticated
USING (public.is_member(auth.uid(),business_id) AND (user_id=auth.uid() OR public.is_manager_or_owner(auth.uid(),business_id)));
DROP POLICY IF EXISTS "Absence reads require own record or management" ON public.leave_requests;
CREATE POLICY "Absence reads require own record or management" ON public.leave_requests
AS RESTRICTIVE FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_manager_or_owner(auth.uid(),business_id));
-- Employees may read their own requests, but not internal management/health notes.
REVOKE SELECT ON public.leave_requests FROM authenticated, anon, PUBLIC;
DO $$ DECLARE columns text; BEGIN
  SELECT string_agg(quote_ident(column_name),',') INTO columns FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leave_requests';
  EXECUTE format('REVOKE SELECT (%s) ON public.leave_requests FROM authenticated, anon, PUBLIC',columns);
END $$;
GRANT SELECT (id,business_id,user_id,leave_type,status,start_date,end_date,reason,reviewed_by,reviewed_at,review_notes,created_at,updated_at,source,created_by_user_id,created_by_role,approved_at,approved_by)
ON public.leave_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.get_leave_requests(_business_id uuid)
RETURNS SETOF public.leave_requests LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(auth.uid(),_business_id) THEN
    RAISE EXCEPTION 'Active business membership is required' USING ERRCODE='42501';
  END IF;
  IF public.is_manager_or_owner(auth.uid(),_business_id) THEN
    RETURN QUERY SELECT l.* FROM public.leave_requests l WHERE l.business_id=_business_id;
  ELSE
    RETURN QUERY SELECT (jsonb_populate_record(NULL::public.leave_requests,jsonb_build_object(
      'id',l.id,'business_id',l.business_id,'user_id',l.user_id,'leave_type',l.leave_type,'status',l.status,
      'start_date',l.start_date,'end_date',l.end_date,'reason',l.reason,'reviewed_by',l.reviewed_by,
      'reviewed_at',l.reviewed_at,'review_notes',l.review_notes,'created_at',l.created_at,'updated_at',l.updated_at,
      'source',l.source,'created_by_user_id',l.created_by_user_id,'created_by_role',l.created_by_role,
      'approved_at',l.approved_at,'approved_by',l.approved_by))).*
    FROM public.leave_requests l WHERE l.business_id=_business_id AND l.user_id=auth.uid();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_leave_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leave_requests(uuid) TO authenticated;

-- A minimal directory keeps shared rota rendering functional without HR access.
CREATE OR REPLACE FUNCTION public.get_rota_people(_business_id uuid)
RETURNS TABLE (id uuid,user_id uuid,primary_role_id uuid,primary_store_id uuid,full_name text,store_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(auth.uid(),_business_id) THEN
    RAISE EXCEPTION 'Active business membership is required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT ep.id,ep.user_id,ep.primary_role_id,ep.primary_store_id,p.full_name,
    coalesce((SELECT array_agg(es.store_id) FROM public.employee_stores es WHERE es.employee_profile_id=ep.id),ARRAY[]::uuid[])
    FROM public.employee_profiles ep JOIN public.memberships m ON m.user_id=ep.user_id AND m.business_id=ep.business_id
    LEFT JOIN public.profiles p ON p.id=ep.user_id WHERE ep.business_id=_business_id AND m.is_active;
END $$;
REVOKE ALL ON FUNCTION public.get_rota_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rota_people(uuid) TO authenticated;

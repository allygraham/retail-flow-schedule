-- Admin conversion does not erase payroll inputs from earlier employment.
-- One JSON snapshot avoids PostgREST's default maximum table row count.
-- Export only payroll inputs; never medical notes, invitation secrets or inferred pay.
CREATE FUNCTION public.get_payroll_export(_business_id uuid, _start_date date, _end_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_permission(auth.uid(),_business_id,'view_reports') THEN
  RAISE EXCEPTION 'Only active owners and admins can export payroll' USING ERRCODE='42501';
 END IF;
 IF _start_date IS NULL OR _end_date IS NULL OR _end_date<_start_date OR _end_date-_start_date>365 THEN
  RAISE EXCEPTION 'Choose a date range of up to 366 days' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.leave_requests l WHERE l.business_id=_business_id AND l.leave_type='annual' AND l.status='approved'
  AND l.start_date<=_end_date AND l.end_date>=_start_date AND coalesce(cardinality(l.charged_working_days),0)=0
  AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.business_id=_business_id AND r.user_id=l.user_id AND r.role='admin' AND greatest(l.start_date,_start_date)>=r.created_at::date)) THEN
  RAISE EXCEPTION 'Approved annual leave is missing its saved working pattern. Review these records before exporting.' USING ERRCODE='23514';
 END IF;
 RETURN (
 WITH scheduled AS (
  SELECT s.assigned_user_id person,count(*) shifts,
   sum(greatest(0,extract(epoch FROM (s.end_time-s.start_time))::bigint/60-coalesce(s.break_minutes,0)))::bigint minutes
  FROM public.shifts s WHERE s.business_id=_business_id AND s.shift_date BETWEEN _start_date AND _end_date
   AND s.is_published AND s.status<>'cancelled' AND s.assigned_user_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.business_id=_business_id AND r.user_id=s.assigned_user_id AND r.role='admin' AND s.shift_date>=r.created_at::date)
  GROUP BY s.assigned_user_id
 ), absence_dates AS (
  SELECT DISTINCT l.user_id person,l.leave_type,day::date absence_date FROM public.leave_requests l
   CROSS JOIN LATERAL generate_series(greatest(l.start_date,_start_date)::timestamp,least(l.end_date,_end_date)::timestamp,interval '1 day') day
  WHERE l.business_id=_business_id AND l.status='approved' AND l.start_date<=_end_date AND l.end_date>=_start_date
   AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.business_id=_business_id AND r.user_id=l.user_id AND r.role='admin' AND day::date>=r.created_at::date)
   AND (l.leave_type='sick' OR (l.leave_type='annual' AND extract(dow FROM day)::smallint=ANY(l.charged_working_days)))
 ), absence AS (
  SELECT person,count(*) FILTER(WHERE leave_type='annual') annual,count(*) FILTER(WHERE leave_type='sick') sick
  FROM absence_dates GROUP BY person
 ), people AS (SELECT person FROM scheduled UNION SELECT person FROM absence)
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'user_id',people.person,'full_name',coalesce(p.full_name,'Employee'),'email',coalesce(u.email,''),
  'shift_count',coalesce(s.shifts,0),'scheduled_minutes',coalesce(s.minutes,0),
  'annual_leave_days',coalesce(a.annual,0),'sickness_days',coalesce(a.sick,0)
 ) ORDER BY coalesce(p.full_name,'Employee'),people.person),'[]'::jsonb)
 FROM people JOIN auth.users u ON u.id=people.person LEFT JOIN public.profiles p ON p.id=people.person
 LEFT JOIN scheduled s ON s.person=people.person LEFT JOIN absence a ON a.person=people.person
 );
END $$;
REVOKE ALL ON FUNCTION public.get_payroll_export(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_export(uuid,date,date) TO authenticated;
NOTIFY pgrst,'reload schema';

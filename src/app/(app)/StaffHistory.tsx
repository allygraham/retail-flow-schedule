import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { Card } from '@/components/common/Card';
import { Stat } from '@/components/common/Stat';
import { Field, Select } from '@/components/common/Field';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { DataLoadError } from '@/components/common/DataLoadError';
import { Badge } from '@/components/common/Badge';
import { EmptyState } from '@/components/common/EmptyState';
import { staffYearSummary } from '@/features/leave/staffHistory';
import { STATUS_LABEL, STATUS_TONE } from '@/features/leave/leaveStatus';
import { parseSicknessMeta, SICKNESS_CATEGORY_LABEL, SICKNESS_LIFECYCLE_LABEL, type SicknessLifecycleStatus } from '@/features/leave/sickness';
import { fmtDate, isoDate } from '@/lib/datetime';
import s from './StaffHistory.module.scss';

export default function StaffHistory() {
  const { userId } = useParams();
  const { business, role } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const fetchData = useCallback(async () => {
    if (!business || !userId || role !== 'owner') throw new Error('Access denied');
    const member = await supabase.from('memberships').select('user_id').eq('business_id', business.id).eq('user_id', userId).maybeSingle();
    assertQueryResults(member);
    if (!member.data) throw new Error('Staff member not found in this workspace');
    const [profile, employment, leaves] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      supabase.from('employee_profiles').select('working_days').eq('business_id', business.id).eq('user_id', userId).maybeSingle(),
      supabase.rpc('get_leave_requests', { _business_id: business.id }).eq('user_id', userId).order('start_date', { ascending: false }),
    ]);
    assertQueryResults(profile, employment, leaves);
    return { name: profile.data?.full_name ?? 'Staff member', workingDays: employment.data?.working_days ?? [], records: leaves.data ?? [] };
  }, [business, userId, role]);
  const { data, loading, error: loadError, reload } = useAsyncData(fetchData, 'Could not load this staff member’s history. Check they belong to this workspace and try again.');
  const calculation = useMemo(() => {
    try { return { summary: data ? staffYearSummary(data.records, year, data.workingDays, isoDate(new Date())) : null, error: null }; }
    catch { return { summary: null, error: 'Annual leave history is missing a saved working pattern. Please review the affected records.' }; }
  }, [data, year]);
  const summary = calculation.summary;
  const error = loadError || calculation.error;
  const years = new Set([currentYear, year]);
  for (const row of data?.records ?? []) {
    for (let y = Number(row.start_date.slice(0, 4)); y <= Number(row.end_date.slice(0, 4)); y++) years.add(y);
  }
  const records = data?.records.filter(row => row.start_date <= `${year}-12-31` && row.end_date >= `${year}-01-01`) ?? [];
  const value = (count: number | undefined) => loading ? <LoadingSkeleton layout="inline" label="Loading total" /> : count ?? '—';
  return <div className={s.page}>
    <Link to="/team">← Back to staff</Link>
    <header className={s.header}><div><h1>{data?.name ?? 'Staff history'}</h1><p>Annual leave and sickness by calendar year</p></div>
      <Field label="Year"><Select value={year} onChange={event => setYear(Number(event.target.value))}>
        {[...years].sort((a, b) => b - a).map(y => <option key={y} value={y}>{y}</option>)}
      </Select></Field>
    </header>
    {error && <DataLoadError message={error} retry={reload} />}
    <div className={s.stats}>
      <Stat label="Annual leave taken" value={value(summary?.taken)} hint="Approved working days through today" />
      <Stat label="Annual leave booked" value={value(summary?.booked)} hint="Approved future working days" />
      <Stat label="Annual leave pending" value={value(summary?.pending)} />
      <Stat label="Sickness days" value={value(summary?.sickDays)} hint="Approved calendar days through today" />
      <Stat label="Sickness spells" value={value(summary?.sickSpells)} hint="Approved absences overlapping this year" />
    </div>
    <div className={s.records}>
      {(['annual', 'sick'] as const).map(type => <Card key={type} title={type === 'annual' ? 'Annual leave record' : 'Sickness record'} subtitle={String(year)}>
        {loading ? <LoadingSkeleton label={`Loading ${type} history`} /> : error ? <p>History unavailable</p> : records.filter(row => row.leave_type === type).length === 0 ? <EmptyState title="No records this year" /> :
          <ul className={s.list}>{records.filter(row => row.leave_type === type).map(row => {
            const meta = parseSicknessMeta(row.sickness_meta);
            return <li key={row.id} className={s.record}>
              <div><strong>{fmtDate(row.start_date)} – {fmtDate(row.end_date)}</strong>
                {type === 'sick' && <>
                  {meta.category && <p>{SICKNESS_CATEGORY_LABEL[meta.category] ?? meta.category}</p>}
                  {row.lifecycle_status && <p>{SICKNESS_LIFECYCLE_LABEL[row.lifecycle_status as SicknessLifecycleStatus] ?? row.lifecycle_status}</p>}
                  {meta.return_to_work_date && <p>Returned to work: {fmtDate(meta.return_to_work_date)}</p>}
                </>}
                {row.reason && <p>{row.reason}</p>}
              </div>
              <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
            </li>;
          })}</ul>}
      </Card>)}
    </div>
    <p>Annual leave uses the working pattern saved when it was approved. Records spanning two years appear in both years; each year’s totals count only its own dates. Pending, declined and cancelled records are shown but are excluded from taken and sickness totals.</p>
  </div>;
}

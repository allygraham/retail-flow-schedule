import { ArrowLeft, CalendarDays, HeartPulse, Info, Plane, UserRound } from 'lucide-react';
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
import { leavePeriodForDate, leavePeriodForYear } from '@/features/leave/leavePeriod';
import { staffYearSummary } from '@/features/leave/staffHistory';
import { STATUS_LABEL, STATUS_TONE } from '@/features/leave/leaveStatus';
import { parseSicknessMeta, SICKNESS_CATEGORY_LABEL, SICKNESS_LIFECYCLE_LABEL, type SicknessLifecycleStatus } from '@/features/leave/sickness';
import { fmtDate, isoDate } from '@/lib/datetime';
import s from './StaffHistory.module.scss';

export default function StaffHistory() {
  const { userId } = useParams();
  const { business, role } = useAuth();
  const currentYear = leavePeriodForDate(business, isoDate(new Date())).year;
  const [year, setYear] = useState(currentYear);
  const period = useMemo(() => leavePeriodForYear(business, year), [business, year]);
  const fetchData = useCallback(async () => {
    if (!business || !userId || role !== 'owner') throw new Error('Access denied');
    const member = await supabase.from('memberships').select('user_id').eq('business_id', business.id).eq('user_id', userId).maybeSingle();
    assertQueryResults(member);
    if (!member.data) throw new Error('Staff member not found in this workspace');
    const [profile, employment, leaves] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      supabase.from('employee_profiles').select('working_days, annual_leave_entitlement').eq('business_id', business.id).eq('user_id', userId).maybeSingle(),
      supabase.rpc('get_leave_requests', { _business_id: business.id }).eq('user_id', userId).order('start_date', { ascending: false }),
    ]);
    assertQueryResults(profile, employment, leaves);
    return { name: profile.data?.full_name ?? 'Staff member', workingDays: employment.data?.working_days ?? [], entitlement: employment.data?.annual_leave_entitlement, records: leaves.data ?? [] };
  }, [business, userId, role]);
  const { data, loading, error: loadError, reload } = useAsyncData(fetchData, 'Could not load this staff member’s history. Check they belong to this workspace and try again.');
  const calculation = useMemo(() => {
    try { return { summary: data ? staffYearSummary(data.records, period, data.workingDays, isoDate(new Date())) : null, error: null }; }
    catch { return { summary: null, error: 'Annual leave history is missing a saved working pattern. Please review the affected records.' }; }
  }, [data, period]);
  const summary = calculation.summary;
  const error = loadError || calculation.error;
  const years = new Set([currentYear, year]);
  for (const row of data?.records ?? []) {
    for (let y = leavePeriodForDate(business, row.start_date).year; y <= leavePeriodForDate(business, row.end_date).year; y++) years.add(y);
  }
  const records = data?.records.filter(row => row.start_date <= period.end && row.end_date >= period.start) ?? [];
  const value = (count: number | undefined) => loading ? <LoadingSkeleton layout="inline" label="Loading total" /> : count ?? '—';
  const leaveValue = (count: number | undefined) => loading ? value(count) : <span className={s.leaveValue}>
    <span>{count ?? '—'}</span><span className={s.entitlement}>/ {data?.entitlement ?? '—'}</span>
  </span>;
  return <div className={s.page}>
    <Link className={s.backLink} to="/team"><ArrowLeft size={15} aria-hidden /> Back to staff</Link>
    <header className={s.header}><div className={s.identity}><span className={s.personIcon}><UserRound size={24} aria-hidden /></span><div><span className={s.eye}>Staff history</span><h1 className={s.h1}>{data?.name ?? 'Staff history'}</h1><p className={s.sub}>Annual leave and sickness by leave year</p></div></div>
      <div className={s.yearPicker}><Field label="Year"><Select value={year} onChange={event => setYear(Number(event.target.value))}>
        {[...years].sort((a, b) => b - a).map(y => <option key={y} value={y}>{leavePeriodForYear(business, y).label}</option>)}
      </Select></Field></div>
    </header>
    {error && <DataLoadError message={error} retry={reload} />}
    <div className={s.overview}>
      <section className={s.summarySection} aria-labelledby="leave-summary-title">
        <div className={s.sectionHead}><span className={s.sectionIcon}><Plane size={18} aria-hidden /></span><div><h2 id="leave-summary-title">Annual leave</h2><p>{period.label} · working days</p></div></div>
        <div className={s.stats}>
      <Stat label="Annual leave taken" value={leaveValue(summary?.taken)} hint="Approved working days through today" />
      <Stat label="Annual leave booked" value={leaveValue(summary?.booked)} hint="Approved future working days" />
      <Stat label="Annual leave pending" value={leaveValue(summary?.pending)} hint="Working days awaiting approval" />
        </div>
        <p className={s.allowanceNote}>Allowance shown is the current entitlement in working days per leave year.</p>
      </section>
      <section className={`${s.summarySection} ${s.sicknessSection}`} aria-labelledby="sickness-summary-title">
        <div className={s.sectionHead}><span className={s.sectionIcon}><HeartPulse size={18} aria-hidden /></span><div><h2 id="sickness-summary-title">Sickness</h2><p>{period.label} · absence overview</p></div></div>
        <div className={s.sicknessStats}>
      <Stat label="Sickness days" value={value(summary?.sickDays)} hint="Approved calendar days through today" />
      <Stat label="Sickness spells" value={value(summary?.sickSpells)} hint="Approved absences overlapping this year" />
        </div>
      </section>
    </div>
    <div className={s.records}>
      {(['annual', 'sick'] as const).map(type => <Card key={type} title={<span className={s.recordHeading}>{type === 'annual' ? <Plane size={17} aria-hidden /> : <HeartPulse size={17} aria-hidden />}{type === 'annual' ? 'Annual leave record' : 'Sickness record'}</span>} subtitle={period.label}>
        {loading ? <LoadingSkeleton label={`Loading ${type} history`} /> : error ? <p className={s.note}>History unavailable</p> : records.filter(row => row.leave_type === type).length === 0 ? <EmptyState title="No records this year" /> :
          <ul className={s.list}>{records.filter(row => row.leave_type === type).map(row => {
            const meta = parseSicknessMeta(row.sickness_meta);
            return <li key={row.id} className={s.record}>
              <span className={s.dateIcon}><CalendarDays size={17} aria-hidden /></span>
              <div className={s.recordMain}><strong className={s.recordTitle}>{fmtDate(row.start_date)} – {fmtDate(row.end_date)}</strong>
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
    <div className={s.guidance}><Info size={18} aria-hidden /><p className={s.note}>Annual leave uses the working pattern saved when it was approved. Records spanning two leave years appear in both periods; each period’s totals count only its own dates. Pending, declined and cancelled records are shown but are excluded from taken and sickness totals.</p></div>
  </div>;
}

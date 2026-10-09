import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useAuth } from '@/features/auth/authContext';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncData } from '@/hooks/useAsyncData';
import { assertQueryResults } from '@/lib/queryResults';
import { errorMessage } from '@/lib/errors';
import { isoDate } from '@/lib/datetime';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Field } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { DataLoadError } from '@/components/common/DataLoadError';
import { ScrollCue } from '@/components/common/ScrollCue';
import { EmptyState } from '@/components/common/EmptyState';
import { payrollCsv, downloadPayroll } from '@/features/payroll/payrollCsv';
import s from './Payroll.module.scss';

export default function Payroll() {
  const { business, user, role, hasPermission } = useAuth();
  const previousMonth = subMonths(new Date(), 1);
  const [start, setStart] = useState(() => isoDate(startOfMonth(previousMonth)));
  const [end, setEnd] = useState(() => isoDate(endOfMonth(previousMonth)));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const context = `${business?.id}:${user?.id}:${role}`;
  const exportContext = useRef<string | null>(context);
  useEffect(() => { exportContext.current = context; return () => { exportContext.current = null; }; }, [context]);
  const allowed = hasPermission('view_reports');
  const valid = !!start && !!end && end >= start && (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000 <= 365;
  const fetchRows = useCallback(async () => {
    if (!business || !allowed) throw new Error('Access denied');
    if (!valid) return { rows: [], problem: null };
    const result = await supabase.rpc('get_payroll_export', { _business_id: business.id, _start_date: start, _end_date: end });
    return { rows: result.data ?? [], problem: result.error ? errorMessage(result.error, 'Could not load payroll data. Please try again.') : null };
  }, [business, allowed, valid, start, end]);
  const { data, loading, error: loadError, reload } = useAsyncData(fetchRows, 'Could not load payroll data. Please try again.');
  const error = loadError || data?.problem;
  const rows = useMemo(() => loading || error || !valid ? [] : data?.rows ?? [], [loading, error, valid, data]);
  const totals = useMemo(() => rows.reduce((sum, row) => ({ minutes: sum.minutes + row.scheduled_minutes, annual: sum.annual + row.annual_leave_days, sick: sum.sick + row.sickness_days }), { minutes: 0, annual: 0, sick: 0 }), [rows]);
  const exportCsv = async () => {
    if (!business || !allowed || !valid || submitting.current) return;
    submitting.current = true; setExporting(true); setExportError(null);
    try {
      // Read a fresh, atomic snapshot at export time, rather than a stale preview.
      const result = await supabase.rpc('get_payroll_export', { _business_id: business.id, _start_date: start, _end_date: end });
      if (exportContext.current !== context) return;
      assertQueryResults(result);
      if (!result.data?.length) throw new Error('No published shifts or approved absence were found for this period.');
      downloadPayroll(payrollCsv(result.data, start, end), start, end);
    } catch (error) { if (exportContext.current === context) setExportError(errorMessage(error, 'Could not export payroll. Please try again.')); }
    finally { submitting.current = false; setExporting(false); }
  };
  const setDate = (setter: (value: string) => void, value: Date | null) => { setter(value ? toISODate(value) : ''); setExportError(null); };
  return <div className={s.page}>
    <header className={s.header}><div><span className={s.eyebrow}>Business reports</span><h1>Payroll export</h1><p>Download scheduling and absence totals for your payroll period.</p></div>
      <Button disabled={!valid || loading || !!error || !rows.length || exporting} onClick={() => void exportCsv()} loading={exporting}>Download CSV</Button>
    </header>
    <Card title="Pay period"><div className={s.filters}>
      <Field label="From date"><DatePicker value={parseISODate(start)} disabled={exporting} onChange={date => setDate(setStart, date)} /></Field>
      <Field label="To date"><DatePicker value={parseISODate(end)} disabled={exporting} onChange={date => setDate(setEnd, date)} /></Field>
    </div><p className={s.note}>Published scheduled hours after breaks, and approved absence only. Hours are assigned to the shift date. Actual worked hours, pay and SSP amounts are not included.</p>
      {!valid && <p role="alert">Choose a date range of up to 366 days, with the end date on or after the start date.</p>}
      {exportError && <p role="alert">{exportError}</p>}
    </Card>
    <Card padded={false} title="Employee totals" subtitle="Includes former staff and records from before someone became an Admin.">
      {error ? <DataLoadError message={error} retry={reload} /> : !valid ? <EmptyState title="Choose a valid pay period" /> :
      <><ScrollCue target={tableRef} label="payroll columns" /><div ref={tableRef} className={s.tableWrap} role="region" aria-label="Payroll totals" tabIndex={0}><table className={s.table}>
        <thead><tr><th>Employee</th><th>Published shifts</th><th>Scheduled hours</th><th>Annual leave<span>working days</span></th><th>Sickness<span>calendar days</span></th></tr></thead>
        <tbody aria-busy={loading}>{loading ? <tr><td colSpan={5}><LoadingSkeleton label="Loading payroll totals" rows={4} /></td></tr> : !rows.length ? <tr><td colSpan={5}><EmptyState title="No payroll records" description="No published shifts or approved absence fall within this period." /></td></tr> : rows.map(row => <tr key={row.user_id}><td><strong>{row.full_name}</strong><span>{row.email || '—'}</span></td><td>{row.shift_count}</td><td>{(row.scheduled_minutes / 60).toFixed(2)}</td><td>{row.annual_leave_days}</td><td>{row.sickness_days}</td></tr>)}</tbody>
        {!loading && rows.length > 0 && <tfoot><tr><th>Total · {rows.length} {rows.length === 1 ? 'person' : 'people'}</th><td>{rows.reduce((n, r) => n + r.shift_count, 0)}</td><td>{(totals.minutes / 60).toFixed(2)}</td><td>{totals.annual}</td><td>{totals.sick}</td></tr></tfoot>}
      </table></div></>}
    </Card>
  </div>;
}

import { useMemo } from 'react';
import { estimateSsp, findLinkedSicknessDays } from './ssp';
import { fmtDate } from '@/lib/datetime';
import { Button } from '@/components/common/Button';
import s from './SspPanel.module.scss';

interface Props {
  startDate: string;
  endDate: string;
  history: { start_date: string; end_date: string; leave_type: string }[];
  /** Mark absence as paid by the employer (display only). */
  paid?: boolean;
  employeeName?: string;
}

/**
 * Operational SSP guidance panel — informational only.
 * See src/features/leave/ssp.ts for assumptions.
 */
export function SspPanel({ startDate, endDate, history, paid, employeeName }: Props) {
  const linked = useMemo(
    () => findLinkedSicknessDays({ start_date: startDate, end_date: endDate }, history),
    [startDate, endDate, history],
  );
  const est = useMemo(
    () => estimateSsp({ start_date: startDate, end_date: endDate, linkedDaysAlreadyCounted: linked, paid }),
    [startDate, endDate, linked, paid],
  );

  const exportSummary = () => {
    const lines = [
      ['Employee', employeeName ?? ''],
      ['Start', startDate],
      ['End', endDate],
      ['Total days', String(est.totalDays)],
      ['Qualifies as PIW', est.qualifies ? 'Yes' : 'No'],
      ['Waiting days remaining', String(est.waitingDaysRemaining)],
      ['Eligible from', est.eligibleFrom ?? '—'],
      ['Payable days', String(est.payableDays)],
      ['Estimated SSP (GBP)', est.estimateGbp.toFixed(2)],
      ['Linked prior sick days counted', String(linked)],
      ['Note', 'Operational estimate only — not for RTI/HMRC submission.'],
    ];
    const csv = lines.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ssp-summary-${startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.eyebrow}>SSP estimate</span>
        <span className={s.note}>Operational guidance — not legally authoritative</span>
      </div>
      <dl className={s.grid}>
        <div><dt>Eligible from</dt><dd>{est.eligibleFrom ? fmtDate(est.eligibleFrom, 'd MMM yyyy') : '—'}</dd></div>
        <div><dt>Qualifying days</dt><dd>{est.payableDays}</dd></div>
        <div><dt>Waiting days left</dt><dd>{est.waitingDaysRemaining}</dd></div>
        <div><dt>Estimated SSP</dt><dd>£{est.estimateGbp.toFixed(2)}</dd></div>
      </dl>
      <p className={s.summary}>{est.summary}{linked > 0 ? ` Linked to a previous sickness period (${linked} day${linked === 1 ? '' : 's'} already counted).` : ''}</p>
      <div className={s.actions}>
        <Button size="sm" variant="outline" onClick={exportSummary}>Export payroll summary</Button>
      </div>
    </div>
  );
}

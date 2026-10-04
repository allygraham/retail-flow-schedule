import { useState } from 'react';
import { Field, Input } from '@/components/common/Field';
import { Button } from '@/components/common/Button';
import { WEEKDAYS } from './leaveDays';
import { estimateSsp, linkedSicknessStart, type SicknessPeriod } from './ssp';
import s from './SspPanel.module.scss';
interface Props {
  startDate: string; endDate: string; requestId?: string;
  history: SicknessPeriod[]; workingDays?: number[] | null;
  employeeName?: string;
}
export function SspPanel({ startDate, endDate, requestId, history, workingDays }: Props) {
  let detectedStart = startDate, historyError: string | null = null;
  try { detectedStart = linkedSicknessStart({ id: requestId, start_date: startDate, end_date: endDate }, history); }
  catch (error) { historyError = (error as Error).message; }
  const [earnings, setEarnings] = useState('');
  const [firstDate, setFirstDate] = useState(detectedStart);
  const [days, setDays] = useState<number[]>(workingDays ?? []);
  const [paidDays, setPaidDays] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [calculated, setCalculated] = useState(false);
  let error = historyError;
  let result: ReturnType<typeof estimateSsp> | null = null;
  if (calculated && !error) {
    try {
      if (!earnings.trim() || !paidDays.trim()) throw new Error('Enter average weekly earnings and prior paid SSP days (0 if none).');
      if (!confirmed) throw new Error('Confirm eligibility and the qualifying pattern before calculating.');
      if (firstDate > detectedStart) throw new Error('The linked series starts before this date in the recorded sickness history.');
      result = estimateSsp({ startDate, endDate, firstLinkedDate: firstDate, averageWeeklyEarnings: Number(earnings), qualifyingDays: days, priorPaidDays: Number(paidDays) });
    } catch (failure) { error = (failure as Error).message; }
  }
  const invalidate = () => setCalculated(false);
  return <div className={s.panel}>
    <div className={s.head}><span className={s.eyebrow}>SSP estimate · 2026/27</span></div>
    <p className={s.summary}>For full days of sickness with the same agreed qualifying weekdays throughout the linked series. Earnings must relate to the first absence, including any earlier absences not recorded in Lavoro.</p>
    <Field label={<label htmlFor="ssp-first">First full sick day in the linked series</label>}>
      <Input id="ssp-first" type="date" value={firstDate} onChange={e => { setFirstDate(e.target.value); invalidate(); }} />
    </Field>
    <Field label={<label htmlFor="ssp-earnings">Average weekly earnings (£)</label>} hint="Use unrounded payroll earnings for the relevant period before that first sick day, not annual salary or hourly pay.">
      <Input id="ssp-earnings" type="number" min="0" step="any" value={earnings} onChange={e => { setEarnings(e.target.value); invalidate(); }} />
    </Field>
    <fieldset className={s.days}><legend>Agreed qualifying weekdays</legend>
      {WEEKDAYS.map(({ day, label }) => <label key={day}><input type="checkbox" checked={days.includes(day)} onChange={e => { setDays(e.target.checked ? [...days, day] : days.filter(d => d !== day)); invalidate(); }} /> {label}</label>)}
    </fieldset>
    <Field label={<label htmlFor="ssp-paid">Qualifying days of SSP already paid in this linked series</label>} hint="Enter 0 if none. Count only SSP days paid before this absence began. The estimate covers the whole absence, not the unpaid remainder.">
      <Input id="ssp-paid" type="number" min="0" step="1" value={paidDays} onChange={e => { setPaidDays(e.target.value); invalidate(); }} />
    </Field>
    <label className={s.summary}><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); invalidate(); }} /> I have checked SSP eligibility, the earnings period and that this qualifying pattern applies throughout the linked series.</label>
    <Button size="sm" onClick={() => setCalculated(true)}>Calculate SSP estimate</Button>
    {error && <p role="alert" className={s.summary}>{error}</p>}
    {result && <div role="status">
      <dl className={s.grid}>
        <div><dt>Estimated SSP for this absence</dt><dd>£{result.estimateGbp.toFixed(2)}</dd></div>
        <div><dt>Weekly rate</dt><dd>£{result.weeklyRate.toFixed(2)}</dd></div>
        <div><dt>Payable qualifying days</dt><dd>{result.payableDays}</dd></div>
        <div><dt>Payable from</dt><dd>{result.eligibleFrom ?? 'No payable days'}</dd></div>
      </dl>
      {result.excludedDays > 0 && <p className={s.summary}>{result.excludedDays} qualifying days excluded by the 28-week limit.</p>}
      <p className={s.summary}>Partial weeks are calculated Sunday–Saturday and rounded up to whole pence.</p>
    </div>}
    <p className={s.summary}>Estimate only. These inputs are not saved. Check payroll for changing patterns, statutory maternity pay, exclusions or absences crossing tax-year rules.</p>
    <a href="https://www.gov.uk/guidance/statutory-sick-pay-manually-calculate-your-employees-payments" target="_blank" rel="noopener noreferrer">HMRC calculation guidance</a>
    <a href="https://www.gov.uk/statutory-sick-pay/eligibility" target="_blank" rel="noopener noreferrer">Check SSP eligibility</a>
  </div>;
}

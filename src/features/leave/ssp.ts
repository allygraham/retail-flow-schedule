import { workingDates } from './leaveDays';

// HMRC 2026/27: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
// Partial-week amounts use the unrounded daily rate and round UP to whole pence.
export const SSP_POLICY = { start: '2026-04-06', end: '2027-04-05', weeklyCap: 123.25, maximumWeeks: 28 } as const;
const DAY = 86_400_000;
function dateTime(value: string): number {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('Enter valid sickness dates.');
  return time;
}
export interface SicknessPeriod { id?: string; start_date: string; end_date: string; leave_type: string; status?: string }
export function linkedSicknessStart(current: { id?: string; start_date: string; end_date: string }, history: readonly SicknessPeriod[]): string {
  const start = dateTime(current.start_date), end = dateTime(current.end_date);
  if (end < start) throw new Error('End date must be on or after start date.');
  const prior = history.filter(p => p.leave_type === 'sick' && (!p.status || p.status === 'approved')
    && (current.id ? p.id !== current.id : p.start_date !== current.start_date || p.end_date !== current.end_date));
  for (const p of prior) {
    const a = dateTime(p.start_date), b = dateTime(p.end_date);
    if (b < a) throw new Error('Correct the dates in the sickness history.');
    if (a <= end && b >= start) throw new Error('This absence overlaps another sickness record. Reconcile the dates before estimating SSP.');
  }
  let first = current.start_date;
  for (const p of prior.filter(p => p.end_date < current.start_date).sort((a, b) => b.end_date.localeCompare(a.end_date))) {
    // Gap means non-sick days between the two periods, excluding both endpoints.
    if ((dateTime(first) - dateTime(p.end_date)) / DAY - 1 <= 56) first = p.start_date < first ? p.start_date : first;
  }
  return first;
}
export interface SspInput {
  startDate: string; endDate: string; firstLinkedDate: string;
  averageWeeklyEarnings: number; qualifyingDays: readonly number[]; priorPaidDays: number;
}
export interface SspEstimate {
  weeklyRate: number; qualifyingDays: number; payableDays: number; excludedDays: number;
  eligibleFrom: string | null; estimateGbp: number; weeks: { weekStart: string; payableDays: number; amountGbp: number }[];
}
export function estimateSsp(input: SspInput): SspEstimate {
  const start = dateTime(input.startDate), end = dateTime(input.endDate), first = dateTime(input.firstLinkedDate);
  if (end < start || first > start) throw new Error('Check the sickness and linked-period dates.');
  if (input.firstLinkedDate < SSP_POLICY.start || input.startDate < SSP_POLICY.start || input.endDate > SSP_POLICY.end) throw new Error('This absence needs a different tax-year or transition calculation. Check payroll before estimating SSP.');
  if (!Number.isFinite(input.averageWeeklyEarnings) || input.averageWeeklyEarnings < 0) throw new Error('Enter valid average weekly earnings.');
  const q = input.qualifyingDays;
  if (!q.length || q.length > 7 || new Set(q).size !== q.length || q.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Select the agreed qualifying weekdays.');
  if (!Number.isInteger(input.priorPaidDays) || input.priorPaidDays < 0 || input.priorPaidDays > SSP_POLICY.maximumWeeks * q.length) throw new Error('Check the SSP qualifying days already paid in this linked series.');
  if (input.priorPaidDays > workingDates(input.firstLinkedDate, new Date(start - DAY).toISOString().slice(0, 10), q).length) throw new Error('Paid days cannot exceed the qualifying dates before this absence.');
  const weeklyRate = Math.min(SSP_POLICY.weeklyCap, input.averageWeeklyEarnings * 0.8);
  const dates = workingDates(input.startDate, input.endDate, q);
  const payable = dates.slice(0, SSP_POLICY.maximumWeeks * q.length - input.priorPaidDays);
  const byWeek = new Map<string, number>();
  for (const date of payable) {
    const day = new Date(`${date}T00:00:00Z`);
    const sunday = new Date(day.getTime() - day.getUTCDay() * DAY).toISOString().slice(0, 10);
    byWeek.set(sunday, (byWeek.get(sunday) ?? 0) + 1);
  }
  const weeks = [...byWeek].map(([weekStart, payableDays]) => ({ weekStart, payableDays,
    amountGbp: Math.ceil(weeklyRate * 100 * payableDays / q.length - 1e-8) / 100 }));
  return { weeklyRate, qualifyingDays: dates.length, payableDays: payable.length, excludedDays: dates.length - payable.length,
    eligibleFrom: payable[0] ?? null, estimateGbp: weeks.reduce((p, w) => p + Math.round(w.amountGbp * 100), 0) / 100, weeks };
}

import { workingDates } from './leaveDays';

import { SSP_POLICIES, policiesForPeriod, policyForDate, type SspPolicy } from './sspPolicies';

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
  policies: { id: string; label: string; weeklyRate: number }[];
  weeklyRate: number; qualifyingDays: number; payableDays: number; excludedDays: number;
  eligibleFrom: string | null; estimateGbp: number; weeks: { weekStart: string; payableDays: number; amountGbp: number }[];
}
export function estimateSsp(input: SspInput, policies: readonly SspPolicy[] = SSP_POLICIES): SspEstimate {
  const start = dateTime(input.startDate), end = dateTime(input.endDate), first = dateTime(input.firstLinkedDate);
  if (end < start || first > start) throw new Error('Check the sickness and linked-period dates.');
  const linkedPolicy = policyForDate(input.firstLinkedDate, policies);
  const applicable = policiesForPeriod(input.firstLinkedDate, input.endDate, policies);
  if (applicable.some(policy => policy.ruleVersion !== 'first-day-percentage-v1' || policy.maximumWeeks !== linkedPolicy.maximumWeeks || policy.earningsFraction !== linkedPolicy.earningsFraction)) throw new Error('This linked absence needs a reviewed transition calculation. Check payroll before estimating SSP.');
  if (!Number.isFinite(input.averageWeeklyEarnings) || input.averageWeeklyEarnings < 0) throw new Error('Enter valid average weekly earnings.');
  const q = input.qualifyingDays;
  if (!q.length || q.length > 7 || new Set(q).size !== q.length || q.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Select the agreed qualifying weekdays.');
  if (!Number.isInteger(input.priorPaidDays) || input.priorPaidDays < 0 || input.priorPaidDays > linkedPolicy.maximumWeeks * q.length) throw new Error('Check the SSP qualifying days already paid in this linked series.');
  if (input.priorPaidDays > workingDates(input.firstLinkedDate, new Date(start - DAY).toISOString().slice(0, 10), q).length) throw new Error('Paid days cannot exceed the qualifying dates before this absence.');
  const rateFor = (policy: SspPolicy) => Math.min(policy.weeklyCap, input.averageWeeklyEarnings * linkedPolicy.earningsFraction);
  const weeklyRate = rateFor(policyForDate(input.startDate, policies));
  const dates = workingDates(input.startDate, input.endDate, q);
  const payable = dates.slice(0, linkedPolicy.maximumWeeks * q.length - input.priorPaidDays);
  const byWeek = new Map<string, { payableDays: number; unroundedPence: number }>();
  for (const date of payable) {
    const day = new Date(`${date}T00:00:00Z`);
    const sunday = new Date(day.getTime() - day.getUTCDay() * DAY).toISOString().slice(0, 10);
    const week = byWeek.get(sunday) ?? { payableDays: 0, unroundedPence: 0 };
    week.payableDays++;
    week.unroundedPence += rateFor(policyForDate(date, policies)) * 100 / q.length;
    byWeek.set(sunday, week);
  }
  const weeks = [...byWeek].map(([weekStart, week]) => ({ weekStart, payableDays: week.payableDays,
    amountGbp: Math.ceil(week.unroundedPence - 1e-8) / 100 }));
  return { policies: policiesForPeriod(input.startDate, input.endDate, policies).map(policy => ({ id: policy.id, label: policy.label, weeklyRate: rateFor(policy) })), weeklyRate, qualifyingDays: dates.length, payableDays: payable.length, excludedDays: dates.length - payable.length,
    eligibleFrom: payable[0] ?? null, estimateGbp: weeks.reduce((p, w) => p + Math.round(w.amountGbp * 100), 0) / 100, weeks };
}

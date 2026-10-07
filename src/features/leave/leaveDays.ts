/** Weekdays use JavaScript's numbering: Sunday=0, Monday=1, ... Saturday=6. */
export const WEEKDAYS = [
  { day: 1, label: 'Monday' }, { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' }, { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' }, { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

/** UTC date-only arithmetic avoids daylight-saving changes. */
export function daysBetween(startISO: string, endISO: string): number {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000) + 1);
}

export function workingDates(startISO: string, endISO: string, workingDays: readonly number[], year?: number | { start: string; end: string }): string[] {
  const bounds = typeof year === 'number' ? { start: `${year}-01-01`, end: `${year}-12-31` } : year;
  const start = bounds && startISO < bounds.start ? bounds.start : startISO;
  const end = bounds && endISO > bounds.end ? bounds.end : endISO;
  const weekdays = new Set(workingDays);
  const result: string[] = [];
  const endTime = Date.parse(`${end}T00:00:00Z`);
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= endTime; time += 86_400_000) {
    const date = new Date(time);
    if (weekdays.has(date.getUTCDay())) result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

export function workingDaysBetween(start: string, end: string, workingDays: readonly number[]): number {
  return workingDates(start, end, workingDays).length;
}

export function daysInYear(start: string, end: string, year: number, workingDays: readonly number[]): number {
  return workingDates(start, end, workingDays, year).length;
}

export interface BalanceRequest {
  start_date: string; end_date: string; status: string; leave_type: string;
  charged_working_days?: readonly number[] | null;
}

/** Count a working date once even if requests overlap; approved takes precedence. */
export function calculateLeaveDays(requests: readonly BalanceRequest[], year: number | { start: string; end: string }, workingDays: readonly number[]) {
  const approved = new Set<string>();
  const pending = new Set<string>();
  for (const request of requests) {
    if (request.leave_type !== 'annual' || !['approved', 'pending'].includes(request.status)) continue;
    if (request.status === 'approved' && !request.charged_working_days?.length) throw new Error('Approved leave has no saved working pattern');
    const target = request.status === 'approved' ? approved : pending;
    for (const date of workingDates(request.start_date, request.end_date, request.status === 'approved' ? request.charged_working_days! : workingDays, year)) target.add(date);
  }
  return { taken: approved.size, pending: [...pending].filter(date => !approved.has(date)).length };
}

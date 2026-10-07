import { workingDates } from './leaveDays';

export type LeaveYearMode = 'calendar' | 'tax' | 'financial';
export interface LeaveYearConfig { leave_year_mode?: LeaveYearMode; leave_year_start_date?: string | null; }
export interface LeavePeriod { start: string; end: string; year: number; label: string; }

export function leavePeriodForYear(config: LeaveYearConfig | null | undefined, year: number): LeavePeriod {
  const mode = config?.leave_year_mode ?? 'calendar';
  const monthDay = mode === 'tax' ? '04-06' : mode === 'financial' ? config?.leave_year_start_date?.slice(5) : '01-01';
  if (!monthDay || !/^\d{2}-\d{2}$/.test(monthDay)) throw new Error('Choose a valid financial year start date');
  const anniversary = (y: number) => {
    const [month, day] = monthDay.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) throw new Error('Invalid leave year start date');
    return `${y}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  };
  const start = anniversary(year);
  const end = new Date(Date.parse(`${anniversary(year + 1)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const format = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  return { start, end, year, label: mode === 'calendar' ? String(year) : `${format(start)} – ${format(end)}` };
}
export function leavePeriodForDate(config: LeaveYearConfig | null | undefined, date: string): LeavePeriod {
  const year = Number(date.slice(0, 4));
  const period = leavePeriodForYear(config, year);
  return date < period.start ? leavePeriodForYear(config, year - 1) : period;
}
export function daysInPeriod(start: string, end: string, period: Pick<LeavePeriod, 'start' | 'end'>, workingDays: readonly number[]): number {
  return workingDates(start < period.start ? period.start : start, end > period.end ? period.end : end, workingDays).length;
}

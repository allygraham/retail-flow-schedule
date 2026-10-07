import { expect, it } from 'vitest';
import { daysInPeriod, leavePeriodForDate, leavePeriodForYear } from './leavePeriod';
import { calculateLeaveDays } from './leaveDays';
it('keeps calendar years as the default', () => {
  expect(leavePeriodForDate({}, '2026-12-31')).toMatchObject({ start: '2026-01-01', end: '2026-12-31', year: 2026 });
});
it('rolls the UK tax year precisely at 6 April', () => {
  const config = { leave_year_mode: 'tax' as const };
  expect(leavePeriodForDate(config, '2026-04-05')).toMatchObject({ start: '2025-04-06', end: '2026-04-05' });
  expect(leavePeriodForDate(config, '2026-04-06')).toMatchObject({ start: '2026-04-06', end: '2027-04-05' });
});
it('uses any custom anniversary and splits requests without double-counting', () => {
  const config = { leave_year_mode: 'financial' as const, leave_year_start_date: '2024-07-15' };
  const before = leavePeriodForDate(config, '2026-07-14'), after = leavePeriodForDate(config, '2026-07-15');
  expect(before).toMatchObject({ start: '2025-07-15', end: '2026-07-14' });
  expect(after).toMatchObject({ start: '2026-07-15', end: '2027-07-14' });
  const row = { start_date: '2026-07-13', end_date: '2026-07-17', leave_type: 'annual', status: 'approved', charged_working_days: [1,2,3,4,5] };
  expect(calculateLeaveDays([row], before, [0,6]).taken).toBe(2);
  expect(calculateLeaveDays([row], after, [0,6]).taken).toBe(3);
  expect(daysInPeriod(row.start_date,row.end_date,after,[1,2,3,4,5])).toBe(3);
});
it('handles 29 February without gaps or overlapping days', () => {
  const config = { leave_year_mode: 'financial' as const, leave_year_start_date: '2024-02-29' };
  expect(leavePeriodForYear(config,2027)).toMatchObject({ start: '2027-02-28', end: '2028-02-28' });
  expect(leavePeriodForYear(config,2028)).toMatchObject({ start: '2028-02-29', end: '2029-02-27' });
});
it('rejects missing or invalid financial dates', () => {
  expect(()=>leavePeriodForYear({leave_year_mode:'financial'},2026)).toThrow();
  expect(()=>leavePeriodForYear({leave_year_mode:'financial',leave_year_start_date:'2026-04-31'},2026)).toThrow();
});

import { expect, it } from 'vitest';
import { staffYearSummary } from './staffHistory';
const annual = { leave_type: 'annual', status: 'approved', charged_working_days: [1, 2, 3, 4, 5], start_date: '2026-12-31', end_date: '2027-01-04' };
it('splits years using saved working patterns and separates taken from future bookings', () => {
  expect(staffYearSummary([annual], 2026, [0, 6], '2026-12-31')).toMatchObject({ taken: 1, booked: 0 });
  expect(staffYearSummary([annual], 2027, [0, 6], '2026-12-31')).toMatchObject({ taken: 0, booked: 2 });
  expect(staffYearSummary([annual], 2027, [0, 6], '2027-01-01')).toMatchObject({ taken: 1, booked: 1 });
});
it('deduplicates overlapping sick dates, includes weekends, and excludes unapproved and future sickness', () => {
  const sick = { leave_type: 'sick', status: 'approved', start_date: '2026-10-02', end_date: '2026-10-05' };
  expect(staffYearSummary([sick, { ...sick, start_date: '2026-10-04' }, { ...sick, status: 'cancelled' }, { ...sick, start_date: '2026-11-01', end_date: '2026-11-02' }], 2026, [1], '2026-10-07')).toMatchObject({ sickDays: 4, sickSpells: 2 });
});
it('pending annual leave uses the current pattern and never counts as taken', () => {
  expect(staffYearSummary([{ ...annual, status: 'pending' }], 2027, [1], '2027-02-01')).toMatchObject({ taken: 0, booked: 0, pending: 1 });
});
it('requires a saved pattern for approved annual leave', () => {
  expect(() => staffYearSummary([{ ...annual, charged_working_days: null }], 2026, [1], '2026-12-31')).toThrow('saved working pattern');
});

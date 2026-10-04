import { describe, expect, it } from 'vitest';
import { calculateLeaveDays, daysBetween, daysInYear, workingDaysBetween } from './leaveDays';
const weekdays = [1, 2, 3, 4, 5];
const request = (start_date: string, end_date: string, status = 'approved', leave_type = 'annual') => ({ start_date, end_date, status, leave_type });

describe('working-pattern annual leave', () => {
  it('deducts five working days for a Monday–Sunday request', () => {
    expect(workingDaysBetween('2026-10-05', '2026-10-11', weekdays)).toBe(5);
  });
  it('deducts only a part-time employee’s three normal days', () => {
    expect(workingDaysBetween('2026-10-05', '2026-10-11', [1, 3, 5])).toBe(3);
  });
  it('supports weekend and Sunday working patterns', () => {
    expect(workingDaysBetween('2026-10-05', '2026-10-11', [0, 5, 6])).toBe(3);
  });
  it('does not deduct non-working days', () => {
    expect(workingDaysBetween('2026-10-10', '2026-10-11', weekdays)).toBe(0);
  });
  it('counts a single working date inclusively', () => {
    expect(workingDaysBetween('2026-10-05', '2026-10-05', weekdays)).toBe(1);
  });
  it('handles seven-day patterns and leap years', () => {
    expect(daysInYear('2024-01-01', '2024-12-31', 2024, [0,1,2,3,4,5,6])).toBe(366);
  });
  it('allocates a cross-year request to each year independently', () => {
    expect(daysInYear('2026-12-28', '2027-01-03', 2026, weekdays)).toBe(4);
    expect(daysInYear('2026-12-28', '2027-01-03', 2027, weekdays)).toBe(1);
  });
  it('ignores ranges outside the year and reversed or invalid dates', () => {
    expect(daysInYear('2027-01-01', '2027-01-05', 2026, weekdays)).toBe(0);
    expect(workingDaysBetween('2026-10-11', '2026-10-05', weekdays)).toBe(0);
    expect(workingDaysBetween('', '', weekdays)).toBe(0);
  });
  it('uses date-only arithmetic across daylight-saving boundaries', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(3);
    expect(workingDaysBetween('2026-10-23', '2026-10-26', weekdays)).toBe(2);
  });
  it('counts overlapping approved or pending requests only once', () => {
    expect(calculateLeaveDays([
      request('2026-10-05', '2026-10-07'), request('2026-10-06', '2026-10-09'),
      request('2026-10-08', '2026-10-12', 'pending'), request('2026-10-12', '2026-10-13', 'pending'),
    ], 2026, weekdays)).toEqual({ taken: 5, pending: 2 });
  });
  it('ignores sickness, unpaid leave, rejected and cancelled requests', () => {
    expect(calculateLeaveDays([
      request('2026-10-05', '2026-10-09', 'approved', 'sick'),
      request('2026-10-05', '2026-10-09', 'approved', 'unpaid'),
      request('2026-10-05', '2026-10-09', 'cancelled'),
      request('2026-10-05', '2026-10-09', 'rejected'),
    ], 2026, weekdays)).toEqual({ taken: 0, pending: 0 });
  });
});

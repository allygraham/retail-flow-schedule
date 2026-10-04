import { describe, expect, it } from 'vitest';
import { estimateSsp, linkedSicknessStart } from './ssp';
const base = { startDate: '2026-10-05', endDate: '2026-10-11', firstLinkedDate: '2026-10-05', averageWeeklyEarnings: 185, qualifyingDays: [1,2,3,4,5], priorPaidDays: 0 };
describe('SSP 2026/27 estimates', () => {
  it('uses the weekly cap and pays the first qualifying day without waiting days', () => {
    const r = estimateSsp({ ...base, endDate: '2026-10-05' });
    expect(r.weeklyRate).toBe(123.25); expect(r.estimateGbp).toBe(24.65); expect(r.eligibleFrom).toBe('2026-10-05');
  });
  it('uses 80% of lower earnings with no obsolete earnings threshold', () => {
    expect(estimateSsp({ ...base, averageWeeklyEarnings: 100 }).estimateGbp).toBe(80);
    expect(estimateSsp({ ...base, averageWeeklyEarnings: 0 }).estimateGbp).toBe(0);
  });
  it('uses only agreed working days, including weekend patterns', () => {
    expect(estimateSsp({ ...base, qualifyingDays: [1,3,5] }).payableDays).toBe(3);
    expect(estimateSsp({ ...base, qualifyingDays: [0,6], startDate: '2026-10-10', firstLinkedDate: '2026-10-10' }).estimateGbp).toBe(123.26);
  });
  it('returns zero payable days for sickness only on non-qualifying days', () => {
    const r = estimateSsp({ ...base, startDate: '2026-10-10', firstLinkedDate: '2026-10-10' });
    expect(r.payableDays).toBe(0); expect(r.eligibleFrom).toBeNull(); expect(r.estimateGbp).toBe(0);
  });
  it.each([
    [7, 1, 17.61], [7, 4, 70.43], [6, 4, 82.17], [4, 1, 30.82], [3, 2, 82.17], [2, 1, 61.63],
  ])('matches HMRC rate table: %i qualifying days, %i sick days', (qualifying, sick, expected) => {
    const days = Array.from({ length: qualifying }, (_, i) => i);
    const r = estimateSsp({ ...base, startDate: '2026-10-04', firstLinkedDate: '2026-10-04', endDate: `2026-10-0${3 + sick}`, qualifyingDays: days });
    expect(r.estimateGbp).toBe(expected);
  });
  it('rounds each Sunday–Saturday week independently using unrounded daily rates', () => {
    const r = estimateSsp({ ...base, startDate: '2026-10-09', endDate: '2026-10-12', firstLinkedDate: '2026-10-09', qualifyingDays: [1,3,5] });
    expect(r.weeks.map(w => w.amountGbp)).toEqual([41.09,41.09]); expect(r.estimateGbp).toBe(82.18);
  });
  it('keeps a full week exactly at the weekly rate', () => {
    expect(estimateSsp({ ...base, startDate: '2026-10-04', endDate: '2026-10-10', firstLinkedDate: '2026-10-04', qualifyingDays: [0,1,2,3,4,5,6] }).estimateGbp).toBe(123.25);
  });
  it('caps linked paid days at 28 weeks', () => {
    const r = estimateSsp({ ...base, startDate: '2026-11-02', endDate: '2026-11-08', firstLinkedDate: '2026-04-06', priorPaidDays: 139 });
    expect(r.payableDays).toBe(1); expect(r.excludedDays).toBe(4);
    expect(estimateSsp({ ...base, startDate: '2026-11-02', endDate: '2026-11-08', firstLinkedDate: '2026-04-06', priorPaidDays: 140 }).estimateGbp).toBe(0);
  });
  it('rejects dates outside the supported rules and pre-2026 linked transitions', () => {
    expect(() => estimateSsp({ ...base, firstLinkedDate: '2026-04-05' })).toThrow('transition');
    expect(() => estimateSsp({ ...base, endDate: '2027-04-06' })).toThrow('tax-year');
  });
  it('does not apply April’s rate to a future tax year and accepts its last valid day', () => {
    expect(() => estimateSsp({ ...base, startDate: '2027-04-06', firstLinkedDate: '2027-04-06', endDate: '2027-04-06' })).toThrow('tax-year');
    expect(estimateSsp({ ...base, startDate: '2027-04-05', firstLinkedDate: '2027-04-05', endDate: '2027-04-05' }).payableDays).toBe(1);
  });
  it('rejects missing patterns, invalid earnings, dates and prior consumption', () => {
    for (const patch of [{ qualifyingDays: [] }, { qualifyingDays: [1,1] }, { qualifyingDays: [7] }, { averageWeeklyEarnings: NaN }, { averageWeeklyEarnings: -1 }, { startDate: '2026-02-30' }, { priorPaidDays: -1 }, { priorPaidDays: 0.5 }, { priorPaidDays: 1 }]) {
      expect(() => estimateSsp({ ...base, ...patch })).toThrow();
    }
  });
});
describe('linked sickness history', () => {
  const current = { id: 'current', start_date: '2026-11-27', end_date: '2026-11-28' };
  const sick = (start_date: string, end_date: string) => ({ start_date, end_date, leave_type: 'sick', status: 'approved' });
  it('links a gap of exactly 56 non-sick days but not 57', () => {
    expect(linkedSicknessStart(current, [sick('2026-10-01','2026-10-01')])).toBe('2026-10-01');
    expect(linkedSicknessStart(current, [sick('2026-09-30','2026-09-30')])).toBe(current.start_date);
  });
  it('follows the whole linked chain and ignores rejected or cancelled history', () => {
    expect(linkedSicknessStart(current, [sick('2026-08-10','2026-08-12'), sick('2026-10-01','2026-10-01'), { ...sick('2026-07-01','2026-07-02'), status: 'cancelled' }])).toBe('2026-08-10');
  });
  it('ignores the current record but refuses overlapping duplicate records', () => {
    expect(linkedSicknessStart(current, [{ ...current, leave_type: 'sick', status: 'approved' }])).toBe(current.start_date);
    expect(() => linkedSicknessStart(current, [{ ...current, id: 'other', leave_type: 'sick', status: 'approved' }])).toThrow('overlaps');
  });
});

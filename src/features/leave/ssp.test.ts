import { describe, expect, it } from 'vitest';
import { estimateSsp, linkedSicknessStart } from './ssp';
import { SSP_POLICIES, policiesForPeriod, policyForDate } from './sspPolicies';
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

describe('SSP boundary regressions', () => {
  it.each([[1, [1], 3451], [3, [1,3,5], 3451], [7, [0,1,2,3,4,5,6], 3451.01]])('caps a %i-day pattern at exactly 28 paid weeks', (count, pattern, amount) => {
    const result = estimateSsp({ ...base, startDate: '2026-04-06', firstLinkedDate: '2026-04-06', endDate: '2027-04-05', qualifyingDays: pattern });
    expect(result.payableDays).toBe(28 * count);
    expect(result.excludedDays).toBe(result.qualifyingDays - 28 * count);
    // Seven-day sickness starts midweek: the two partial weeks round up independently.
    expect(result.estimateGbp).toBe(amount);
  });
  it('accepts the first supported day and rejects a series starting one day earlier', () => {
    expect(estimateSsp({ ...base, startDate: '2026-04-06', endDate: '2026-04-06', firstLinkedDate: '2026-04-06' }).estimateGbp).toBe(24.65);
    expect(() => estimateSsp({ ...base, firstLinkedDate: '2026-04-05' })).toThrow('transition');
  });
  it('retains unrounded low earnings until the partial-week amount is rounded to pence', () => {
    const result = estimateSsp({ ...base, averageWeeklyEarnings: 100.01, qualifyingDays: [1,3,5], endDate: '2026-10-05' });
    expect(result.weeklyRate).toBeCloseTo(80.008);
    expect(result.estimateGbp).toBe(26.67);
  });
  it('does not consume entitlement for non-qualifying days before the next payable day', () => {
    const result = estimateSsp({ ...base, startDate: '2026-11-07', endDate: '2026-11-09', firstLinkedDate: '2026-04-06', priorPaidDays: 139 });
    expect(result.payableDays).toBe(1); expect(result.eligibleFrom).toBe('2026-11-09'); expect(result.estimateGbp).toBe(24.65);
  });
  it('links unsorted prior absences without including future, non-sick or pending records', () => {
    const current = { id: 'current', start_date: '2026-11-27', end_date: '2026-11-28' };
    const history = [
      { start_date: '2026-10-01', end_date: '2026-10-01', leave_type: 'sick', status: 'approved' },
      { start_date: '2026-12-01', end_date: '2026-12-02', leave_type: 'sick', status: 'approved' },
      { start_date: '2026-08-10', end_date: '2026-08-12', leave_type: 'sick', status: 'approved' },
      { start_date: '2026-07-01', end_date: '2026-07-02', leave_type: 'sick', status: 'pending' },
      { start_date: '2026-07-01', end_date: '2026-07-02', leave_type: 'annual', status: 'approved' },
    ];
    expect(linkedSicknessStart(current, history)).toBe('2026-08-10');
    expect(linkedSicknessStart(current, [...history].reverse())).toBe('2026-08-10');
  });
});

// Fictional next-year rules exercise the engine; these are NEVER shipped policies.
const futureFixture = { ...SSP_POLICIES[0], id: 'test-only', label: 'Test only', start: '2027-04-06', end: '2028-04-05', weeklyCap: 130 };
const fixturePolicies = [...SSP_POLICIES, futureFixture];
describe('versioned SSP policies', () => {
  const crossing = { ...base, startDate: '2027-04-05', endDate: '2027-04-09', firstLinkedDate: '2027-04-05' };
  it('selects the policy on each side of 5/6 April and reports both rates', () => {
    expect(policyForDate('2027-04-05', fixturePolicies).id).toBe('2026-27');
    expect(policyForDate('2027-04-06', fixturePolicies).id).toBe('test-only');
    const result = estimateSsp(crossing, fixturePolicies);
    expect(result.estimateGbp).toBe(128.65);
    expect(result.policies.map(p => p.weeklyRate)).toEqual([123.25, 130]);
    expect(result.weeks).toEqual([{ weekStart: '2027-04-04', payableDays: 5, amountGbp: 128.65 }]);
  });
  it('retains linked earnings across years and rounds a mixed week once', () => {
    const result = estimateSsp({ ...crossing, averageWeeklyEarnings: 100.01 }, fixturePolicies);
    expect(result.estimateGbp).toBe(80.01);
    expect(result.policies.every(p => Math.abs(p.weeklyRate - 80.008) < 1e-8)).toBe(true);
  });
  it('does not reset the 28-week entitlement at the new year', () => {
    const result = estimateSsp({ ...crossing, firstLinkedDate: '2026-04-06', priorPaidDays: 139 }, fixturePolicies);
    expect(result.payableDays).toBe(1);
    expect(result.excludedDays).toBe(4);
    expect(result.estimateGbp).toBe(24.65);
  });
  it('rejects policy gaps even on non-qualifying days and overlapping policies', () => {
    expect(() => estimateSsp(crossing, [...SSP_POLICIES, { ...futureFixture, start: '2027-04-07' }])).toThrow('No reviewed');
    expect(() => policyForDate('2027-04-05', [...SSP_POLICIES, { ...futureFixture, start: '2027-04-05' }])).toThrow('No reviewed');
  });
  it('requires a transition implementation for changed calculation rules', () => {
    expect(() => estimateSsp(crossing, [...SSP_POLICIES, { ...futureFixture, ruleVersion: 'different-rules' }])).toThrow('transition');
    expect(() => estimateSsp(crossing, [...SSP_POLICIES, { ...futureFixture, earningsFraction: 0.9 }])).toThrow('transition');
  });
  it('never makes fictional future policies available to real estimates', () => {
    expect(() => estimateSsp(crossing)).toThrow('No reviewed');
    expect(policiesForPeriod(base.startDate, base.endDate).map(p => p.label)).toEqual(['2026/27']);
  });
});

import { describe, expect, it } from 'vitest';
import { payrollCsv, type PayrollRow } from './payrollCsv';
const row: PayrollRow = { user_id: 'employee-1', full_name: 'Zoë, "Jones"', email: 'zoe@example.test', shift_count: 2, scheduled_minutes: 905, annual_leave_days: 1, sickness_days: 3 };
describe('payroll CSV', () => {
  it('exports exact minute totals as hours with the period and clear absence units', () => {
    const csv = payrollCsv([row], '2026-10-01', '2026-10-31');
    expect(csv.startsWith('\uFEFF"Period start"')).toBe(true);
    expect(csv).toContain('"2026-10-01","2026-10-31","employee-1","Zoë, ""Jones""","zoe@example.test","2","15.08","1","3"\r\n');
    expect(csv).toContain('Approved annual leave (working days)');
    expect(csv).toContain('Approved sickness (calendar days)');
  });
  it.each(['=HYPERLINK("https://example.test")', '+SUM(1,2)', '-1+2', '@SUM(1,2)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1'])('neutralises spreadsheet formulas: %s', value => {
    const csv = payrollCsv([{ ...row, full_name: value, email: value }], '2026-10-01', '2026-10-31');
    expect(csv).toContain(`"'${value.replace(/"/g, '""')}"`);
  });
  it('keeps multiple lines inside a quoted field and preserves Unicode', () => {
    expect(payrollCsv([{ ...row, full_name: 'Zoë\r\nJones' }], '2026-10-01', '2026-10-31')).toContain('"Zoë\r\nJones"');
  });
  it('exports a header-only CSV for an empty input', () => {
    expect(payrollCsv([], '2026-10-01', '2026-10-31').split('\r\n')).toHaveLength(2);
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveBalanceInline } from './LeaveBalanceInline';
const mocks = vi.hoisted(() => ({ value: {} as any }));
vi.mock('./useLeaveBalance', () => ({ useLeaveBalance: () => mocks.value }));
afterEach(cleanup);
beforeEach(() => { mocks.value = { balance: { year: 2026, remaining: 10, taken: 10, entitlement: 20 }, workingDays: [1,3,5], loading: false }; });
describe('annual leave approval preview', () => {
  it('previews three days for a part-time employee’s full week', () => {
    render(<LeaveBalanceInline userId="employee" startDate="2026-10-05" endDate="2026-10-11" />);
    expect(screen.getByText('7 left after approval')).toBeInTheDocument();
  });
  it('warns based on working days rather than calendar duration', () => {
    mocks.value.balance.remaining = 2;
    render(<LeaveBalanceInline userId="employee" startDate="2026-10-05" endDate="2026-10-11" />);
    expect(screen.getByText('Exceeds balance by 1 day')).toBeInTheDocument();
  });
  it('asks for configuration when no pattern is recorded', () => {
    mocks.value = { balance: null, workingDays: null, patternMissing: true, loading: false };
    render(<LeaveBalanceInline userId="employee" startDate="2026-10-05" endDate="2026-10-11" />);
    expect(screen.getByRole('status')).toHaveTextContent('normal working days');
  });
});

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaveBalance } from './useLeaveBalance';
const mocks = vi.hoisted(() => ({ profile: null as any, leaves: null as any, auth: { user: { id: 'self' }, business: { id: 'shop' } } as any }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const response = table === 'employee_profiles' ? mocks.profile : mocks.leaves;
  const chain = { select: () => chain, eq: () => chain, in: () => chain, lte: () => chain, gte: () => chain, maybeSingle: () => chain,
    then: (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject) };
  return chain;
} } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  mocks.auth = { user: { id: 'self' }, business: { id: 'shop' } };
  mocks.profile = { data: { annual_leave_entitlement: 20, working_days: [1,3,5] }, error: null };
  mocks.leaves = { data: [
    { start_date: '2026-10-05', end_date: '2026-10-11', leave_type: 'annual', status: 'approved' },
    { start_date: '2026-10-12', end_date: '2026-10-18', leave_type: 'annual', status: 'pending' },
  ], error: null };
});
describe('annual leave balance integration', () => {
  it('uses stored working days and keeps pending leave separate', async () => {
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.balance).toEqual({ entitlement: 20, taken: 3, pending: 3, remaining: 17, year: 2026 });
  });
  it('reports a missing pattern instead of inventing a balance', async () => {
    mocks.profile.data.working_days = null;
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.patternMissing).toBe(true);
    expect(result.current.balance).toBeNull();
  });
  it('does not show a full balance when database access fails', async () => {
    mocks.leaves = { data: null, error: { message: 'Permission denied' } };
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.balance).toBeNull();
  });
  it('handles a rejected network request', async () => {
    // Promise is consumed immediately by the query chain.
    mocks.profile = Promise.reject(new Error('Offline'));
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
  it('does not replace a selected employee’s balance with an older response', async () => {
    let finishOld!: (value: any) => void;
    mocks.profile = new Promise(resolve => { finishOld = resolve; });
    const { result, rerender } = renderHook(({ id }) => useLeaveBalance(id), { initialProps: { id: 'first' } });
    mocks.profile = { data: { annual_leave_entitlement: 10, working_days: [1] }, error: null };
    rerender({ id: 'second' });
    await waitFor(() => expect(result.current.balance?.entitlement).toBe(10));
    await act(async () => { finishOld({ data: { annual_leave_entitlement: 99, working_days: [1,2,3,4,5] }, error: null }); });
    expect(result.current.balance?.entitlement).toBe(10);
    expect(result.current.balance?.taken).toBe(1);
  });
});

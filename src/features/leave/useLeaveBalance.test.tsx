import type { MockResponse, MockResult } from '@/test/types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaveBalance } from './useLeaveBalance';
const mocks = vi.hoisted(() => ({ profile: null as MockResult | null, leaves: null as MockResult | null, auth: { user: { id: 'self' }, business: { id: 'shop' } } }));
vi.mock('@/features/auth/authContext', () => ({ useOptionalAuth: () => undefined, useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const response = table === 'employee_profiles' ? mocks.profile : mocks.leaves;
  const chain = { select: () => chain, eq: () => chain, in: () => chain, lte: () => chain, gte: () => chain, maybeSingle: () => chain,
    then: Promise.resolve(response).then.bind(Promise.resolve(response)) };
  return chain;
} } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  mocks.auth = { user: { id: 'self' }, business: { id: 'shop' } };
  mocks.profile = { data: { annual_leave_entitlement: 20, working_days: [1,3,5] }, error: null };
  mocks.leaves = { data: [
    { start_date: '2026-10-05', end_date: '2026-10-11', leave_type: 'annual', status: 'approved', charged_working_days: [1,3,5] },
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
    ((mocks.profile as MockResponse).data as { working_days: number[] | null }).working_days = null;
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
    let finishOld!: (value: MockResponse) => void;
    mocks.profile = new Promise(resolve => { finishOld = resolve; });
    const { result, rerender } = renderHook(({ id }) => useLeaveBalance(id), { initialProps: { id: 'first' } });
    mocks.profile = { data: { annual_leave_entitlement: 10, working_days: [1] }, error: null };
    rerender({ id: 'second' });
    await waitFor(() => expect(result.current.balance?.entitlement).toBe(10));
    await act(async () => { finishOld({ data: { annual_leave_entitlement: 99, working_days: [1,2,3,4,5] }, error: null }); });
    expect(result.current.balance?.entitlement).toBe(10);
    expect(result.current.balance?.taken).toBe(3);
  });
  it('keeps historical balance when current working days change', async () => {
    ((mocks.profile as MockResponse).data as { working_days: number[] | null }).working_days = [2,4];
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.balance?.taken).toBe(3); expect(result.current.balance?.pending).toBe(2);
  });
  it('shows an unavailable balance when historical pattern is unknown', async () => {
    ((mocks.leaves as MockResponse).data as { charged_working_days: number[] | null }[])[0].charged_working_days = null;
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.patternMissing).toBe(true); expect(result.current.balance).toBeNull();
  });

  it('preserves an overused entitlement as a negative balance', async () => {
    ((mocks.profile as MockResponse).data as { annual_leave_entitlement: number }).annual_leave_entitlement = 2;
    const { result } = renderHook(() => useLeaveBalance());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.balance?.remaining).toBe(-1);
  });

});

it('allocates approved leave across calendar years and reloads after year rollover', async () => {
  mocks.profile = { data: { annual_leave_entitlement: 28, working_days: [1,2,3,4,5] }, error: null };
  mocks.leaves = { data: [{ start_date: '2026-12-28', end_date: '2027-01-03', leave_type: 'annual', status: 'approved', charged_working_days: [1,2,3,4,5] }], error: null };
  const { result, rerender } = renderHook(() => useLeaveBalance());
  await waitFor(() => expect(result.current.balance?.taken).toBe(4));
  vi.setSystemTime(new Date('2027-01-01T12:00:00Z')); rerender();
  await waitFor(() => expect(result.current.balance).toEqual({ entitlement: 28, taken: 1, pending: 0, remaining: 27, year: 2027 }));
});

it('cancelling approved leave restores entitlement while pending cancellation removes only pending days', async () => {
  const { result } = renderHook(() => useLeaveBalance());
  await waitFor(() => expect(result.current.balance?.remaining).toBe(17));
  mocks.leaves = { data: [
    { start_date: '2026-10-05', end_date: '2026-10-11', leave_type: 'annual', status: 'cancelled', charged_working_days: [1,3,5] },
    { start_date: '2026-10-12', end_date: '2026-10-18', leave_type: 'annual', status: 'pending' },
  ], error: null };
  await act(async () => { await result.current.reload(); });
  expect(result.current.balance).toMatchObject({ taken: 0, remaining: 20, pending: 3 });
  mocks.leaves = { data: [], error: null };
  await act(async () => { await result.current.reload(); });
  expect(result.current.balance).toMatchObject({ taken: 0, remaining: 20, pending: 0 });
});

it('clears a previously valid balance on reload failure and recovers on retry', async () => {
  const { result } = renderHook(() => useLeaveBalance());
  await waitFor(() => expect(result.current.balance?.taken).toBe(3));
  mocks.leaves = { data: null, error: { message: 'Offline' } };
  await act(async () => { await result.current.reload(); });
  expect(result.current.balance).toBeNull(); expect(result.current.error).toBeTruthy();
  mocks.leaves = { data: [], error: null };
  await act(async () => { await result.current.reload(); });
  expect(result.current.balance?.remaining).toBe(20); expect(result.current.error).toBeNull();
});

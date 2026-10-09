import type { MockResponse, MockResult } from '@/test/types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaveRequests } from './useLeaveRequests';
const mocks = vi.hoisted(() => ({
  main: null as MockResult | null, responses: {} as Record<string, MockResult | null>, profiles: [] as (MockResult | null)[],
  auth: { business: { id: 'shop' }, user: { id: 'owner' }, role: 'owner', hasPermission: () => true },
}));
vi.mock('@/features/auth/authContext', () => ({ useOptionalAuth: () => undefined, useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = (response: MockResult | null | undefined) => {
    const query = { select: () => query, eq: () => query, order: () => query, in: () => query,
      then: Promise.resolve(response).then.bind(Promise.resolve(response)) };
    return query;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    rpc: () => chain(mocks.main),
    from: (table: string) => chain(table === 'profiles' && mocks.profiles.length ? mocks.profiles.shift() : mocks.responses[table]),
    channel: () => channel, removeChannel: vi.fn(),
  } };
});
afterEach(cleanup);
beforeEach(() => {
  mocks.auth = { business: { id: 'shop' }, user: { id: 'owner' }, role: 'owner', hasPermission: () => true };
  mocks.main = { data: [{ id: 'request', user_id: 'employee', status: 'pending' }], error: null };
  mocks.responses = {
    employee_profiles: { data: [{ user_id: 'employee', working_days: [1,3,5], store_locations: { name: 'Shop' } }], error: null },
    profiles: { data: [{ id: 'employee', full_name: 'Person' }], error: null },
    user_roles: { data: [], error: null },
    memberships: { data: [{ user_id: 'employee' }], error: null },
  };
  mocks.profiles = [];
});
describe('leave list loading', () => {
  it('loads requests, employees and working days together', async () => {
    const { result } = renderHook(() => useLeaveRequests()); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requests[0].profiles?.full_name).toBe('Person'); expect(result.current.employees).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });
  it.each(['requests', 'employee_profiles', 'profiles', 'memberships', 'user_roles'])('clears data and shows an error for %s failure, then retries', async (table) => {
    const { result } = renderHook(() => useLeaveRequests()); await waitFor(() => expect(result.current.requests).toHaveLength(1));
    const previous = table === 'requests' ? mocks.main : mocks.responses[table];
    const failure = { data: null, error: { message: 'Offline' } };
    if (table === 'requests') mocks.main = failure; else mocks.responses[table] = failure;
    await act(async () => { await result.current.load(); });
    expect(result.current.error).toBeTruthy(); expect(result.current.requests).toEqual([]); expect(result.current.employees).toEqual([]);
    if (table === 'requests') mocks.main = previous; else mocks.responses[table] = previous;
    await act(async () => { await result.current.load(); }); expect(result.current.error).toBeNull(); expect(result.current.requests).toHaveLength(1);
  });
  it('excludes Admin accounts from leave recipients while retaining historical records', async () => {
    mocks.responses.user_roles = { data: [{ user_id: 'employee' }], error: null };
    const { result } = renderHook(() => useLeaveRequests());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.employees).toEqual([]);
    expect(result.current.requests).toHaveLength(1);
  });
  it('checks the additional employee name query for errors', async () => {
    ((mocks.responses.memberships as MockResponse).data as { user_id: string }[]).push({ user_id: 'second' });
    mocks.profiles = [mocks.responses.profiles, { data: null, error: { message: 'Permission denied' } }];
    const { result } = renderHook(() => useLeaveRequests()); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy(); expect(result.current.requests).toEqual([]);
  });
  it('handles a rejected network request', async () => {
    const failure = Promise.reject(new Error('Offline')); failure.catch(() => {}); mocks.main = failure;
    const { result } = renderHook(() => useLeaveRequests()); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
  it('ignores a late response from the previous workspace', async () => {
    let finish!: (value: MockResponse) => void;
    mocks.main = new Promise(resolve => { finish = resolve; });
    const { result, rerender } = renderHook(() => useLeaveRequests());
    mocks.auth = { ...mocks.auth, business: { id: 'new-shop' } };
    mocks.main = { data: [{ id: 'new', user_id: 'employee', status: 'approved' }], error: null }; rerender();
    await waitFor(() => expect(result.current.requests[0]?.id).toBe('new'));
    await act(async () => finish({ data: [{ id: 'old' }], error: null }));
    expect(result.current.requests[0].id).toBe('new'); expect(result.current.error).toBeNull();
  });
});

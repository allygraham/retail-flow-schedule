import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';

const api = vi.hoisted(() => ({ failLoad: false, failWrite: false, offline: false, read: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    let write = false;
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
      update: () => { write = true; return q; },
      then: (resolve: (v: unknown) => unknown, reject: (e: Error) => unknown) => {
        if (api.offline) return Promise.reject(new Error('Offline')).then(resolve, reject);
        if (write && !api.failWrite) api.read = true;
        return Promise.resolve({ error: (write ? api.failWrite : api.failLoad) ? { message: 'Denied' } : null,
          data: write ? (api.failWrite ? null : [{ id: 'n' }]) : [{ id: 'n', read_at: api.read ? '2026-10-04' : null, title: 'Update' }],
        }).then(resolve, reject);
      },
    };
    return q;
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn(),
} }));
beforeEach(() => Object.assign(api, { failLoad: false, failWrite: false, offline: false, read: false }));
describe('notification reliability', () => {
  it('reports load failures and retries', async () => {
    api.failLoad = true;
    const { result } = renderHook(() => useNotifications('user'));
    await waitFor(() => expect(result.current.error).toMatch(/Could not load/));
    api.failLoad = false;
    await act(() => result.current.reload());
    expect(result.current.unreadCount).toBe(1);
  });
  it.each(['markRead', 'markAllRead'] as const)('keeps unread state when %s fails and allows retry', async method => {
    const { result } = renderHook(() => useNotifications('user'));
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    api.failWrite = true;
    await act(async () => { expect(await result.current[method]('n')).toBe(false); });
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.writeError).toMatch(/Could not mark/);
    api.failWrite = false;
    await act(async () => { expect(await result.current[method]('n')).toBe(true); });
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.writeError).toBeNull();
  });
  it('reports network failures instead of leaving loading stuck', async () => {
    api.offline = true;
    const { result } = renderHook(() => useNotifications('user'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(false);
  });
});

it.each(['focus', 'online'])('recovers missed notification updates on %s', async event => {
  const { result } = renderHook(() => useNotifications('user'));
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  api.read = true;
  await act(async () => { window.dispatchEvent(new Event(event)); });
  await waitFor(() => expect(result.current.unreadCount).toBe(0));
});

it('recovers a failed notification load when connectivity returns', async () => {
  api.offline = true;
  const { result } = renderHook(() => useNotifications('user'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  api.offline = false;
  await act(async () => { window.dispatchEvent(new Event('online')); });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  expect(result.current.error).toBeNull();
});

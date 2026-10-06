import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';
import type { MockResponse } from '@/test/types';
const mocks = vi.hoisted(() => ({ query: vi.fn(), remove: vi.fn(), subscribed: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    let write = false, userId = '', ids: string[] = [];
    const q = { select: () => q, order: () => q, limit: () => q,
      eq: (_key: string, value: string) => { userId = value; return q; },
      in: (_key: string, values: string[]) => { ids = values; return q; },
      update: () => { write = true; return q; },
      then: (resolve: (value: MockResponse) => unknown, reject: (error: Error) => unknown) => Promise.resolve(mocks.query({ write, userId, ids })).then(resolve, reject),
    }; return q;
  },
  channel: () => ({ on() { return this; }, subscribe() { mocks.subscribed(); return this; } }), removeChannel: mocks.remove,
} }));
const notification = (userId: string, read_at: string | null = null) => ({ id: `${userId}-notice`, user_id: userId, read_at, title: 'Notice' });
const deferred = () => { let resolve!: (value: MockResponse) => void; let reject!: (error: Error) => void; const promise = new Promise<MockResponse>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(({ write, userId, ids }: { write: boolean; userId: string; ids: string[] }) => ({ data: write ? ids.map(id => ({ id })) : [notification(userId)], error: null }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('does not fetch, subscribe or write without a user', async () => {
  const { result } = renderHook(() => useNotifications(undefined));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { expect(await result.current.markRead('notice')).toBe(false); });
  expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.subscribed).not.toHaveBeenCalled();
});
it('does not write when all loaded notices are already read', async () => {
  mocks.query.mockResolvedValue({ data: [notification('user', '2026-10-06')], error: null });
  const { result } = renderHook(() => useNotifications('user'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { expect(await result.current.markAllRead()).toBe(true); });
  expect(mocks.query.mock.calls.some(([query]) => query.write)).toBe(false);
});
it.each([0, 1])('rejects a partial update affecting %i of two unread notices', async count => {
  mocks.query.mockImplementation(({ write }: { write: boolean }) => ({ data: write ? Array.from({ length: count }, (_, i) => ({ id: String(i) })) : [notification('one'), notification('two')], error: null }));
  const { result } = renderHook(() => useNotifications('user'));
  await waitFor(() => expect(result.current.unreadCount).toBe(2));
  await act(async () => { expect(await result.current.markAllRead()).toBe(false); });
  expect(result.current.unreadCount).toBe(2); expect(result.current.writeError).toMatch(/Could not mark/);
});
it('prevents duplicate writes from two actions in the same event', async () => {
  const pending = deferred();
  mocks.query.mockImplementation(({ write, userId }: { write: boolean; userId: string }) => write ? pending.promise : { data: [notification(userId)], error: null });
  const { result } = renderHook(() => useNotifications('user'));
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  let first!: Promise<boolean>, second!: Promise<boolean>;
  act(() => { first = result.current.markRead('user-notice'); second = result.current.markAllRead(); });
  await waitFor(() => expect(mocks.query.mock.calls.filter(([q]) => q.write)).toHaveLength(1));
  await act(async () => { pending.resolve({ data: [{ id: 'user-notice' }], error: null }); await first; expect(await second).toBe(false); });
});
it.each(['success', 'failure'])('ignores a late old-user load %s', async outcome => {
  const old = deferred();
  mocks.query.mockImplementation(({ userId }: { userId: string }) => userId === 'old' ? old.promise : { data: [notification(userId)], error: null });
  const { result, rerender } = renderHook(({ userId }) => useNotifications(userId), { initialProps: { userId: 'old' } });
  await waitFor(() => expect(mocks.query).toHaveBeenCalled());
  rerender({ userId: 'new' });
  await waitFor(() => expect(result.current.items[0]?.user_id).toBe('new'));
  await act(async () => { if (outcome === 'success') old.resolve({ data: [notification('old')], error: null }); else old.reject(new Error('Old failure')); });
  expect(result.current.items[0].user_id).toBe('new'); expect(result.current.error).toBeNull();
});
it('does not expose an old-user write failure to the new user', async () => {
  const pending = deferred();
  mocks.query.mockImplementation(({ write, userId }: { write: boolean; userId: string }) => write ? pending.promise : { data: [notification(userId)], error: null });
  const { result, rerender } = renderHook(({ userId }) => useNotifications(userId), { initialProps: { userId: 'old' } });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  let write!: Promise<boolean>; act(() => { write = result.current.markRead('old-notice'); });
  rerender({ userId: 'new' });
  await waitFor(() => expect(result.current.items[0]?.user_id).toBe('new'));
  await act(async () => { pending.reject(new Error('Denied')); expect(await write).toBe(false); });
  expect(result.current.writeError).toBeNull(); expect(result.current.items[0].user_id).toBe('new');
});
it('rejects a stale action callback after the signed-in user changes', async () => {
  const { result, rerender } = renderHook(({ userId }) => useNotifications(userId), { initialProps: { userId: 'old' } });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  const staleAction = result.current.markRead;
  rerender({ userId: 'new' });
  await waitFor(() => expect(result.current.items[0]?.user_id).toBe('new'));
  await act(async () => { expect(await staleAction('old-notice')).toBe(false); });
  expect(mocks.query.mock.calls.some(([q]) => q.write)).toBe(false);
});
it('reconciles visible notifications on the timer and stops polling after unmount', async () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useNotifications('user'));
  await act(async () => {});
  expect(result.current.unreadCount).toBe(1);
  const before = mocks.query.mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(mocks.query.mock.calls.length).toBeGreaterThan(before);
  unmount(); const after = mocks.query.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); window.dispatchEvent(new Event('focus')); });
  expect(mocks.query.mock.calls.length).toBe(after); expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it('does not reconcile while the page is hidden but refreshes when visible again', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const { result } = renderHook(() => useNotifications('user'));
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  const before = mocks.query.mock.calls.length; visibility.mockReturnValue('hidden');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(mocks.query.mock.calls.length).toBe(before);
  visibility.mockReturnValue('visible');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.query.mock.calls.length).toBeGreaterThan(before);
});
it('lets a new user act while an old write is pending without clearing the new busy state', async () => {
  const old = deferred(), next = deferred();
  mocks.query.mockImplementation(({ write, userId }: { write: boolean; userId: string }) => write ? (userId === 'old' ? old.promise : next.promise) : { data: [notification(userId)], error: null });
  const { result, rerender } = renderHook(({ userId }) => useNotifications(userId), { initialProps: { userId: 'old' } });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  let oldWrite!: Promise<boolean>; act(() => { oldWrite = result.current.markRead('old-notice'); });
  rerender({ userId: 'new' });
  await waitFor(() => expect(result.current.items[0]?.user_id).toBe('new'));
  expect(result.current.saving).toBe(false);
  let nextWrite!: Promise<boolean>; act(() => { nextWrite = result.current.markRead('new-notice'); });
  await waitFor(() => expect(mocks.query.mock.calls.filter(([q]) => q.write)).toHaveLength(2));
  await act(async () => { old.resolve({ data: [{ id: 'old-notice' }], error: null }); expect(await oldWrite).toBe(false); });
  expect(result.current.saving).toBe(true);
  await act(async () => { next.resolve({ data: [{ id: 'new-notice' }], error: null }); expect(await nextWrite).toBe(true); });
  expect(result.current.saving).toBe(false);
});
it('does not restore a stale write error when returning to the previous user', async () => {
  const pending = deferred();
  mocks.query.mockImplementation(({ write, userId }: { write: boolean; userId: string }) => write ? pending.promise : { data: [notification(userId)], error: null });
  const { result, rerender } = renderHook(({ userId }) => useNotifications(userId), { initialProps: { userId: 'old' } });
  await waitFor(() => expect(result.current.unreadCount).toBe(1));
  let write!: Promise<boolean>; act(() => { write = result.current.markRead('old-notice'); });
  rerender({ userId: 'new' });
  await waitFor(() => expect(result.current.items[0]?.user_id).toBe('new'));
  await act(async () => { pending.reject(new Error('Old write failed')); await write; });
  rerender({ userId: 'old' });
  await waitFor(() => expect(result.current.items[0]?.user_id).toBe('old'));
  expect(result.current.writeError).toBeNull();
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCustomHolidays } from './useCustomHolidays';
const api = vi.hoisted(() => ({ failure: false, offline: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: () => q, order: () => q,
    then: (resolve: (v: unknown) => unknown, reject: (e: Error) => unknown) => api.offline
      ? Promise.reject(new Error('Offline')).then(resolve, reject)
      : Promise.resolve({ error: api.failure ? { message: 'Denied' } : null, data: api.failure ? null : [{ id: 'h', date: '2026-12-25', name: 'Closure', blocks_scheduling: true }] }).then(resolve, reject),
  }; return q;
} } }));
beforeEach(() => Object.assign(api, { failure: false, offline: false }));
it('clears failed holiday data, exposes an error and retries', async () => {
  const { result } = renderHook(() => useCustomHolidays('business'));
  await waitFor(() => expect(result.current.rows).toHaveLength(1));
  api.failure = true;
  await act(() => result.current.reload());
  expect(result.current.rows).toHaveLength(0);
  expect(result.current.error).toMatch(/Could not load company holidays/);
  api.failure = false;
  await act(() => result.current.reload());
  expect(result.current.rows).toHaveLength(1);
  expect(result.current.error).toBeNull();
});
it('handles rejected network requests', async () => {
  api.offline = true;
  const { result } = renderHook(() => useCustomHolidays('business'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.loading).toBe(false);
});

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAsyncData } from './useAsyncData';

afterEach(cleanup);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
describe('complete and current page data', () => {
  it('clears stale data on a failed refresh and recovers through retry', async () => {
    const loader = vi.fn().mockResolvedValue(['first']);
    const { result } = renderHook(() => useAsyncData(loader, 'Could not load'));
    await waitFor(() => expect(result.current.data).toEqual(['first']));
    loader.mockRejectedValueOnce(new Error('Offline'));
    await act(async () => { await result.current.reload(); });
    expect(result.current).toMatchObject({ data: null, error: 'Could not load', loading: false });
    loader.mockResolvedValue(['second']);
    await act(async () => { await result.current.reload(); });
    expect(result.current).toMatchObject({ data: ['second'], error: null, loading: false });
  });
  it('ignores older successes when a newer request has finished', async () => {
    const old = deferred<string[]>();
    const loader = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(['new']);
    const { result } = renderHook(() => useAsyncData(loader, 'Could not load'));
    await act(async () => { await result.current.reload(); });
    await act(async () => { old.resolve(['old']); });
    expect(result.current.data).toEqual(['new']);
  });
  it('ignores an older failure after a newer success', async () => {
    const old = deferred<string[]>();
    const loader = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(['new']);
    const { result } = renderHook(() => useAsyncData(loader, 'Could not load'));
    await act(async () => { await result.current.reload(); });
    await act(async () => { old.reject(new Error('Old failure')); });
    expect(result.current).toMatchObject({ data: ['new'], error: null });
  });
  it('hides the previous workspace immediately and ignores its pending response and retry callback', async () => {
    const old = deferred<string[]>(), next = deferred<string[]>();
    const first = () => old.promise, second = () => next.promise;
    const { result, rerender } = renderHook(({ loader }) => useAsyncData(loader, 'Could not load'), { initialProps: { loader: first } });
    const staleRetry = result.current.reload;
    rerender({ loader: second });
    expect(result.current).toMatchObject({ data: null, loading: true });
    await act(async () => { old.resolve(['old workspace']); await staleRetry(); });
    expect(result.current.data).toBeNull();
    await act(async () => { next.resolve(['new workspace']); });
    expect(result.current.data).toEqual(['new workspace']);
  });
});

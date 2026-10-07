import { useCallback, useEffect, useRef, useState } from 'react';

/** Publish only a complete result from the latest load and current context. */
export function useAsyncData<T>(loader: () => Promise<T>, message: string) {
  const sequence = useRef(0);
  const currentLoader = useRef(loader);
  currentLoader.current = loader;
  const [state, setState] = useState<{ source: typeof loader; data: T | null; error: string | null; loading: boolean }>({
    source: loader, data: null, error: null, loading: true,
  });
  const reload = useCallback(async (options?: { background?: boolean }) => {
    if (currentLoader.current !== loader) return;
    const request = ++sequence.current;
    setState(previous => options?.background && previous.source === loader && previous.data !== null
      ? { ...previous, error: null }
      : { source: loader, data: null, error: null, loading: true });
    try {
      const data = await loader();
      if (request === sequence.current) setState({ source: loader, data, error: null, loading: false });
    } catch {
      if (request === sequence.current) setState({ source: loader, data: null, error: message, loading: false });
    }
  }, [loader, message]);
  useEffect(() => {
    const requests = sequence;
    void reload();
    return () => { requests.current++; };
  }, [reload]);
  const current = state.source === loader;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !current || state.loading, reload };
}

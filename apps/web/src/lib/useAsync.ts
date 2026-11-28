import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: string;
  loading: boolean;
  /** Run the loader again. Pass true for a forced refresh when the loader supports one. */
  reload: (force?: boolean) => void;
}

/**
 * Runs `load` on mount and whenever it changes. Only the newest call may update the state, so a
 * slow old answer never replaces a newer one. The previous data stays visible while loading.
 */
export function useAsync<T>(load: (force: boolean) => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const run = useCallback(
    (force: boolean) => {
      const id = ++latest.current;
      setLoading(true);
      setError('');
      load(force)
        .then((value) => {
          if (id === latest.current) setData(value);
        })
        .catch((err: unknown) => {
          if (id === latest.current)
            setError(err instanceof Error ? err.message : 'Request failed');
        })
        .finally(() => {
          if (id === latest.current) setLoading(false);
        });
    },
    [load],
  );

  useEffect(() => {
    run(false);
    return () => {
      latest.current += 1;
    };
  }, [run]);

  return { data, error, loading, reload: run };
}

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';
import { Button, ErrorState, Skeleton } from './ui.jsx';

/**
 * Loads `path` and renders `children(items)` when it arrives, with loading and error states.
 * Shared by the Alerts and Documents list pages.
 */
export default function HubLoader({ path, children }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await apiGet(path));
    } catch (err) {
      setError(err.message);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <ErrorState
        message={error}
        action={
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!items) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  return children(items);
}

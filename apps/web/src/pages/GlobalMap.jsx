import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Anchor, Search } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import MaritimeMapLazy from '../components/MaritimeMapLazy.jsx';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui.jsx';
import { buildPortItems, searchItems } from '../lib/search.js';

export default function GlobalMap() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('port') ?? '';
  const [ports, setPorts] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    setError('');
    apiGet('/api/ports')
      .then((p) => !ignore && setPorts(p))
      .catch((err) => !ignore && setError(err.message));
    return () => {
      ignore = true;
    };
  }, [attempt]);

  const visible = useMemo(() => {
    if (!ports) return [];
    const hits = new Set(searchItems(buildPortItems(ports), query, Infinity).map((i) => i.id));
    return ports.filter((p) => hits.has(`port:${p.code}`));
  }, [ports, query]);

  const choose = (code) => setParams(code === selected ? {} : { port: code }, { replace: true });

  return (
    <div>
      <PageHeader
        title="Global Map"
        description="Ports in the seeded demo network. Positions and the map are illustrative, not for navigation."
      />
      {error && (
        <ErrorState
          message={error}
          action={
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          }
        />
      )}
      {!error && !ports && <Skeleton className="h-96" />}
      {ports?.length === 0 && (
        <EmptyState icon={Anchor} title="No ports found" description="The port list is empty." />
      )}
      {ports?.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MaritimeMapLazy
              ports={ports}
              selectedCode={selected}
              onPortClick={(p) => choose(p.code)}
              height={520}
              fit="world"
              ariaLabel="World map of ports"
            />
          </div>
          <Card as="section" className="flex max-h-[520px] flex-col p-3" aria-label="Ports">
            <label className="relative mb-2">
              <span className="sr-only">Search ports</span>
              <Search
                size={14}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ports"
                className="w-full rounded-lg border border-line bg-surface-2 p-2 pl-8 text-sm text-fg"
              />
            </label>
            <ul className="flex-1 overflow-y-auto">
              {visible.map((p) => (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => choose(p.code)}
                    aria-pressed={p.code === selected}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                      p.code === selected ? 'bg-accent-soft text-accent' : 'text-fg'
                    }`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="font-mono text-xs text-muted">{p.code}</span>
                  </button>
                </li>
              ))}
              {visible.length === 0 && <li className="p-3 text-sm text-muted">No ports match.</li>}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

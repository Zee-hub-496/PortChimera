import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
} from 'lucide-react';
import EventCard from '../components/EventCard.tsx';
import FadeIn from '../components/FadeIn.tsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/uiKit.ts';
import { getNews } from '../lib/intelligenceApi.ts';
import {
  CATEGORY_LABELS,
  REGION_OPTIONS,
  SOURCE_CLASS_LABELS,
  newsFreshness,
} from '../lib/intelligenceView.ts';
import { useAsync } from '../lib/useAsync.ts';

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function WorldMonitor() {
  const [text, setText] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [sourceClass, setSourceClass] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(text, 300);

  // A new filter always starts on page 1.
  useEffect(() => setPage(1), [q, region, category, sourceClass]);

  const load = useCallback(
    (force: boolean) => getNews({ q, region, category, sourceClass, page, refresh: force }),
    [q, region, category, sourceClass, page],
  );
  const { data, error, loading, reload } = useAsync(load);

  const filtered = Boolean(q || region || category || sourceClass);
  const fresh = data ? newsFreshness(data.meta) : null;

  return (
    <div>
      <PageHeader
        title="World Monitor"
        description="Shipping-related news from the last few days, found through GDELT. Reports are not verified here and are not official confirmation."
        actions={
          <Button
            variant="secondary"
            onClick={() => reload(true)}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      {fresh && data && (
        <div
          role="status"
          className={`mb-4 rounded-xl p-3 text-sm ${fresh.tone === 'warn' ? 'bg-warn-soft text-fg' : 'bg-surface-2 text-fg'}`}
        >
          <p className="font-semibold">
            {fresh.title} {fresh.tone === 'warn' && <Badge tone="warn">Stale or partial</Badge>}
          </p>
          <p className="mt-0.5 text-muted">{fresh.text}</p>
          {data.meta.refreshThrottled && (
            <p className="mt-1 text-muted">
              You refreshed less than a minute ago, so the same data is shown.
            </p>
          )}
        </div>
      )}

      <form
        role="search"
        aria-label="Filter events"
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="sm:col-span-2 lg:col-span-4">
          <span className="mb-1 block text-xs font-semibold text-muted">Search headlines</span>
          <span className="relative block">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={text}
              maxLength={100}
              onChange={(e) => setText(e.target.value)}
              placeholder="For example: tanker, Hormuz, strike"
              className={`${FIELD} pl-9`}
            />
          </span>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={FIELD}>
            <option value="">All regions</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={FIELD}>
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Source type</span>
          <select
            value={sourceClass}
            onChange={(e) => setSourceClass(e.target.value)}
            className={FIELD}
          >
            <option value="">All source types</option>
            {Object.entries(SOURCE_CLASS_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setText('');
                setRegion('');
                setCategory('');
                setSourceClass('');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </form>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <section aria-label="Events" aria-busy={loading}>
          {error && !data && (
            <ErrorState
              title="The news feed is not available"
              message={error}
              action={
                <Button variant="secondary" onClick={() => reload(false)}>
                  Try again
                </Button>
              }
            />
          )}
          {error && data && (
            <p role="alert" className="mb-3 rounded-lg bg-danger-soft p-3 text-sm text-fg">
              {error}
            </p>
          )}

          {!data && !error && (
            <div className="flex flex-col gap-3" aria-label="Loading events">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          )}

          {data && data.items.length === 0 && (
            <EmptyState
              icon={Newspaper}
              title={
                filtered ? 'No events match these filters' : 'No shipping events found right now'
              }
              description={
                filtered
                  ? 'Try a wider search or clear the filters.'
                  : 'The news source returned nothing relevant for the last few days. That does not mean nothing is happening.'
              }
            />
          )}

          {data && data.items.length > 0 && (
            <>
              <ul className="flex flex-col gap-3">
                {data.items.map((event, i) => (
                  <li key={event.id}>
                    <FadeIn delay={Math.min(i, 6) * 0.03}>
                      <EventCard event={event} />
                    </FadeIn>
                  </li>
                ))}
              </ul>
              <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  disabled={loading || data.page <= 1}
                  onClick={() => setPage(data.page - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" /> Previous
                </Button>
                <p className="text-sm text-muted">
                  Page {data.page} of {data.totalPages} · {data.total}{' '}
                  {data.total === 1 ? 'event' : 'events'}
                </p>
                <Button
                  variant="secondary"
                  disabled={loading || data.page >= data.totalPages}
                  onClick={() => setPage(data.page + 1)}
                >
                  Next <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </nav>
            </>
          )}
        </section>

        <aside aria-label="Official sources" className="flex flex-col gap-3">
          <Card as="section" className="p-4">
            <h2 className="text-sm font-semibold">Official sources</h2>
            <p className="mt-1 text-xs text-muted">
              Open these pages for authoritative maritime security notices. PortChimera does not
              read them automatically.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {(data?.meta.officialLinks ?? []).map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                  >
                    {l.name} <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <p className="text-xs text-muted">{l.note}</p>
                </li>
              ))}
            </ul>
          </Card>
          {data && (
            <Card as="section" className="p-4">
              <h2 className="text-sm font-semibold">About this list</h2>
              <p className="mt-1 text-xs text-muted">{data.meta.source}.</p>
              <p className="mt-2 text-xs text-muted">
                Searches ok: {data.meta.queriesOk}, failed: {data.meta.queriesFailed}. Skipped as
                not shipping-related: {data.meta.dropped.irrelevant}.
              </p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

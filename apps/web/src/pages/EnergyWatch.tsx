import { Fuel, RefreshCw } from 'lucide-react';
import FadeIn from '../components/FadeIn.tsx';
import PriceChart from '../components/PriceChart.tsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '../components/uiKit.ts';
import { getEnergy } from '../lib/intelligenceApi.ts';
import {
  TREND_LABELS,
  energyFreshness,
  formatDay,
  formatPct,
  formatPrice,
  formatUtc,
  pctTone,
} from '../lib/intelligenceView.ts';
import { useAsync } from '../lib/useAsync.ts';

const loadEnergy = () => getEnergy();

export default function EnergyWatch() {
  const { data, error, loading, reload } = useAsync(loadEnergy);
  const note = data ? energyFreshness(data) : null;

  return (
    <div>
      <PageHeader
        title="Energy Watch"
        description="Brent crude oil spot price from the U.S. Energy Information Administration (EIA). A market benchmark, shown for context."
        actions={
          <Button
            variant="secondary"
            onClick={() => reload(false)}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
            Reload
          </Button>
        }
      />

      {error && !data && (
        <ErrorState
          title="Energy data is not available"
          message={error}
          action={
            <Button variant="secondary" onClick={() => reload(false)}>
              Try again
            </Button>
          }
        />
      )}

      {!data && !error && (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading energy data">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {data?.state === 'NOT_CONFIGURED' && (
        <EmptyState
          icon={Fuel}
          title="Energy data is not set up yet"
          description="The server has no EIA API key. Add EIA_API_KEY in the API environment to show Brent prices. No prices are shown until then."
        />
      )}

      {data?.state === 'OK' && data.summary && (
        <FadeIn className="flex flex-col gap-4">
          {note && (
            <div role="status" className="rounded-xl bg-warn-soft p-3 text-sm text-fg">
              <p className="font-semibold">{note.title}</p>
              <p className="mt-0.5 text-muted">{note.text}</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card as="section" aria-label="Latest price" className="p-4">
              <h2 className="text-xs font-semibold text-muted">{data.label}</h2>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {formatPrice(data.summary.latest.value)}
              </p>
              <p className="text-sm text-muted">{data.unit}</p>
              <p className="mt-2 text-xs text-muted">
                Price date: {formatDay(data.summary.latest.date)}
              </p>
            </Card>
            <Card as="section" aria-label="Daily change" className="p-4">
              <h2 className="text-xs font-semibold text-muted">Daily change</h2>
              <p className="mt-2">
                <Badge tone={pctTone(data.summary.dailyChangePct)}>
                  {formatPct(data.summary.dailyChangePct)}
                </Badge>
              </p>
              <p className="mt-2 text-xs text-muted">
                {data.summary.previous
                  ? `Compared with ${formatDay(data.summary.previous.date)} (${formatPrice(data.summary.previous.value)})`
                  : 'No earlier price in the data.'}
              </p>
            </Card>
            <Card as="section" aria-label="Weekly trend" className="p-4">
              <h2 className="text-xs font-semibold text-muted">Weekly trend</h2>
              <p className="mt-2">
                <Badge tone={pctTone(data.summary.weeklyChangePct)}>
                  {formatPct(data.summary.weeklyChangePct)}
                </Badge>
              </p>
              <p className="mt-2 text-xs text-muted">
                {data.summary.weeklyTrend
                  ? TREND_LABELS[data.summary.weeklyTrend]
                  : 'Not enough history for a weekly comparison.'}
              </p>
            </Card>
          </div>

          <Card as="section" aria-label="Price history" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Price history</h2>
            <PriceChart history={data.history} unit={data.unit} />
          </Card>

          <p className="text-xs text-muted">
            Source: U.S. EIA, series {data.series}. Fetched by the server{' '}
            {formatUtc(data.fetchedAt) ?? 'at an unknown time'}; EIA publishes daily prices with a
            delay. {data.note}
          </p>
        </FadeIn>
      )}
    </div>
  );
}

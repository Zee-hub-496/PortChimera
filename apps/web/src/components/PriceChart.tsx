import { buildChart, formatDay, formatPrice } from '../lib/intelligenceView.ts';

const W = 640;
const H = 220;

/** Line chart of real daily prices as inline SVG. Scales with its container. */
export default function PriceChart({
  history,
  unit,
}: {
  history: ReadonlyArray<{ date: string; value: number }>;
  unit: string;
}) {
  const chart = buildChart(history, W, H, 12);
  if (chart === null) {
    return <p className="text-sm text-muted">Not enough data points to draw a chart.</p>;
  }
  const first = history[0];
  const last = history[history.length - 1];
  const label = `Line chart of ${history.length} daily prices from ${first ? formatDay(first.date) : ''} to ${last ? formatDay(last.date) : ''}, ${unit}. Lowest ${formatPrice(chart.min)}, highest ${formatPrice(chart.max)}.`;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="h-auto w-full text-accent"
      >
        <path d={chart.area} fill="currentColor" opacity="0.12" />
        <path
          d={chart.line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {chart.points.length > 0 && (
          <circle
            cx={chart.points[chart.points.length - 1]?.x}
            cy={chart.points[chart.points.length - 1]?.y}
            r="4"
            fill="currentColor"
          />
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>
          {first ? formatDay(first.date) : ''} to {last ? formatDay(last.date) : ''}
        </span>
        <span>
          Low {formatPrice(chart.min)} / High {formatPrice(chart.max)} ({unit})
        </span>
      </figcaption>
    </figure>
  );
}

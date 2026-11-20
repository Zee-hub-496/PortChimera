// Pure display helpers for a route result returned by POST /api/routes/calculate.
export const ILLUSTRATIVE_NOTICE = 'Illustrative data, not real freight rates';

export const OBJECTIVE_LABELS = {
  fastest: 'Fastest',
  cheapest: 'Cheapest',
  lowest_risk: 'Lowest risk',
};

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatDays(days) {
  const n = Number(days);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${text} ${n === 1 ? 'day' : 'days'}`;
}

export function formatUsd(amount) {
  return usd.format(Number(amount));
}

export function formatRisk(totals) {
  return `${Number(totals.riskSum).toFixed(1)} total, ${Number(totals.riskMax).toFixed(1)} worst leg`;
}

/** Converts an API route result into plain strings for display. */
export function formatRoute(result) {
  const notice = result?.dataLabel === 'illustrative' ? ILLUSTRATIVE_NOTICE : '';
  const objective = OBJECTIVE_LABELS[result?.objective] ?? String(result?.objective ?? '');
  if (!result || result.status !== 'found') {
    return {
      found: false,
      objective,
      message: result?.reason ?? 'No route was found between these ports.',
      stops: [],
      notice,
    };
  }
  return {
    found: true,
    objective,
    days: formatDays(result.totals.transitDays),
    cost: formatUsd(result.totals.freightCostUsd),
    risk: formatRisk(result.totals),
    stops: result.path.map((p) => `${p.name} (${p.code})`),
    pathLabel: result.path.map((p) => p.name).join(' > '),
    notice,
  };
}

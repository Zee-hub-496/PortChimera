const EIA_BASE = 'https://api.eia.gov/v2/petroleum/pri/spt/data/';

/** Series ids on the EIA spot price route. */
export const EIA_SERIES = Object.freeze({ BRENT: 'RBRTE', WTI: 'RWTC' });

/**
 * URL for daily spot prices, newest first, WITHOUT the API key. The caller appends `api_key`
 * itself so the key never appears in a string that gets logged or returned to a client.
 */
export function buildEiaUrl(series: string, length = 120): string {
  const n = Math.min(500, Math.max(2, Math.floor(length)));
  const params = new URLSearchParams();
  params.set('frequency', 'daily');
  params.append('data[]', 'value');
  params.append('facets[series][]', series);
  params.append('sort[0][column]', 'period');
  params.append('sort[0][direction]', 'desc');
  params.set('length', String(n));
  return `${EIA_BASE}?${params.toString()}`;
}

/**
 * Rows from an EIA v2 response as `{date, value}` for `summarizeSeries`. Returns null when the
 * payload is not the expected shape (treat as a provider failure, not as "no data").
 */
export function parseEiaRows(payload: unknown): Array<{ date: unknown; value: unknown }> | null {
  const data = (payload as { response?: { data?: unknown } } | null)?.response?.data;
  if (!Array.isArray(data)) return null;
  return data.map((row) => {
    const r = row as { period?: unknown; value?: unknown } | null;
    return { date: r?.period, value: r?.value };
  });
}

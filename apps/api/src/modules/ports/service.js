import { AppError } from '../../middleware/errorHandler.js';

/** Lists every port (shared reference data) for the form dropdowns. */
export async function listPorts(db) {
  const { data, error } = await db
    .from('ports')
    .select('code, name, country, lat, lon, data_label')
    .order('code', { ascending: true });
  if (error) throw new AppError(500, 'PORT_LIST_FAILED', 'Could not load ports');
  return (data ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    country: p.country,
    lat: p.lat,
    lon: p.lon,
    dataLabel: p.data_label,
  }));
}

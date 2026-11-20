// Sample ports for the public landing page. Coordinates and names are copied from
// supabase/seed/ports.json and are illustrative, not survey data.
export const SAMPLE_PORTS = Object.freeze([
  { code: 'CNSHA', name: 'Shanghai', country: 'CN', lat: 31.23, lon: 121.47 },
  { code: 'SGSIN', name: 'Singapore', country: 'SG', lat: 1.26, lon: 103.82 },
  { code: 'PKKHI', name: 'Karachi', country: 'PK', lat: 24.84, lon: 66.98 },
  { code: 'NLRTM', name: 'Rotterdam', country: 'NL', lat: 51.95, lon: 4.14 },
  { code: 'AEJEA', name: 'Jebel Ali', country: 'AE', lat: 25.01, lon: 55.06 },
]);

const byCode = (code) => SAMPLE_PORTS.find((p) => p.code === code);

// Made-up demo values. Shown on the landing page with a "Sample, illustrative" label.
export const SAMPLE_SHIPMENT = Object.freeze({
  number: 'SHP-003',
  origin: byCode('CNSHA'),
  destination: byCode('PKKHI'),
  discrepancy: Object.freeze({ field: 'Gross weight', a: '500 kg', b: '650 kg' }),
  label: 'Sample, illustrative',
});

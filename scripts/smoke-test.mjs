#!/usr/bin/env node
// Post-deploy smoke test.
// Usage: node scripts/smoke-test.mjs https://your-api.onrender.com [https://your-app.vercel.app]
// Checks the live API without any secret: health, 404 envelope, sign-in required, security
// headers, and (when a web origin is given) that CORS allows that origin.
// Exit code 1 means a check failed.
const [apiArg, webOrigin] = process.argv.slice(2);
if (!apiArg) {
  console.error('Usage: node scripts/smoke-test.mjs <api-base-url> [web-origin]');
  process.exit(2);
}
const api = apiArg.replace(/\/+$/, '');
const TIMEOUT_MS = 60_000; // Render free instances can take about a minute to wake up.

async function get(path, headers = {}) {
  return fetch(`${api}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

const checks = [
  [
    'GET /api/health returns { data: { status: "ok" } }',
    async () => {
      const res = await get('/api/health');
      const body = await res.json();
      return res.status === 200 && body?.data?.status === 'ok';
    },
  ],
  [
    'unknown route returns 404 NOT_FOUND envelope',
    async () => {
      const res = await get('/api/does-not-exist');
      const body = await res.json();
      return res.status === 404 && body?.error?.code === 'NOT_FOUND';
    },
  ],
  [
    'GET /api/shipments without a token returns 401 (protected routes are mounted and guarded)',
    async () => (await get('/api/shipments')).status === 401,
  ],
  [
    'security headers present',
    async () => (await get('/api/health')).headers.get('x-content-type-options') === 'nosniff',
  ],
];

if (webOrigin) {
  const origin = webOrigin.replace(/\/+$/, '');
  checks.push([
    `CORS allows ${origin}`,
    async () =>
      (await get('/api/health', { Origin: origin })).headers.get('access-control-allow-origin') ===
      origin,
  ]);
}

let failed = 0;
for (const [name, run] of checks) {
  let ok = false;
  try {
    ok = await run();
  } catch (err) {
    console.error(`  (${err.name}: ${err.message})`);
  }
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
process.exit(failed === 0 ? 0 : 1);

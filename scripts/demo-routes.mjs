#!/usr/bin/env node
// Prints the demo routes from the seed data so you can see the engine's answers without a UI.
//   npm run demo:routes
// All numbers are ILLUSTRATIVE demo values, not real quotes.
import { readFileSync } from 'node:fs';
import { buildGraph, findRoute } from '../packages/core/src/index.js';

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../supabase/seed/${name}`, import.meta.url)));
const ports = read('ports.json');
const edges = read('edges.json');
const graph = buildGraph(ports, edges, { dataLabel: 'illustrative' });

// Stand-in for the disruption overlay (spec 06): drop a port and every lane touching it.
const withoutPort = (code) =>
  buildGraph(
    ports.filter((p) => p.code !== code),
    edges.filter((e) => e.from !== code && e.to !== code),
  );

const describe = (label, r) => {
  const line =
    r.status === 'found'
      ? `${r.path.join(' > ')} | ${r.totals.transitDays} days | $${r.totals.freightCostUsd} | risk ${r.totals.riskSum.toFixed(2)}`
      : `${r.status}: ${r.reason}`;
  console.log(`${label.padEnd(34)} ${line}`);
};

console.log('ILLUSTRATIVE demo data, not real quotes\n');
for (const objective of ['fastest', 'cheapest', 'lowest_risk']) {
  describe(`Shanghai -> Karachi, ${objective}`, findRoute(graph, 'CNSHA', 'PKKHI', objective));
}

console.log('\nPort strike at Singapore (same cost scale as the baseline):');
const noSingapore = withoutPort('SGSIN');
for (const objective of ['fastest', 'cheapest', 'lowest_risk']) {
  describe(
    `  ${objective}`,
    findRoute(noSingapore, 'CNSHA', 'PKKHI', objective, { scale: graph.maxima }),
  );
}

console.log('\nSuez corridor closed (Port Said):');
describe('  Rotterdam -> Karachi, before', findRoute(graph, 'NLRTM', 'PKKHI', 'fastest'));
describe(
  '  Rotterdam -> Karachi, after',
  findRoute(withoutPort('EGPSD'), 'NLRTM', 'PKKHI', 'fastest', { scale: graph.maxima }),
);

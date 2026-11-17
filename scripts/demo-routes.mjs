#!/usr/bin/env node
// Prints the demo routes and crisis scenarios from the seed data, without a UI.
//   npm run demo:routes
// All numbers are ILLUSTRATIVE demo values, not real quotes.
import { readFileSync } from 'node:fs';
import { buildGraph, findRoute, simulateDisruption } from '../packages/core/src/index.js';

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../supabase/seed/${name}`, import.meta.url)));
const graph = buildGraph(read('ports.json'), read('edges.json'), { dataLabel: 'illustrative' });

console.log('ILLUSTRATIVE demo data, not real quotes\n');

console.log('Normal routes, Shanghai -> Karachi:');
for (const objective of ['fastest', 'cheapest', 'lowest_risk']) {
  const r = findRoute(graph, 'CNSHA', 'PKKHI', objective);
  const names = r.path.map((c) => graph.ports.get(c).name).join(' > ');
  console.log(
    `  ${objective.padEnd(12)} ${names} | ${r.totals.transitDays} days | $${r.totals.freightCostUsd} | risk ${r.totals.riskSum.toFixed(2)}`,
  );
}

const scenarios = [
  [
    'Port strike at Singapore',
    [{ type: 'port_strike', portCode: 'SGSIN' }],
    'CNSHA',
    'PKKHI',
    'fastest',
  ],
  [
    'Lane Shanghai -> Singapore fails',
    [{ type: 'connection_failure', from: 'CNSHA', to: 'SGSIN' }],
    'CNSHA',
    'PKKHI',
    'fastest',
  ],
  [
    'Congestion at Colombo (cheapest)',
    [{ type: 'port_congestion', portCode: 'LKCMB' }],
    'CNSHA',
    'PKKHI',
    'cheapest',
  ],
  [
    'Suez corridor closed (Port Said)',
    [{ type: 'port_strike', portCode: 'EGPSD' }],
    'NLRTM',
    'PKKHI',
    'fastest',
  ],
  [
    'Destination port closed',
    [{ type: 'severe_weather', portCode: 'PKKHI' }],
    'CNSHA',
    'PKKHI',
    'fastest',
  ],
];

for (const [title, effects, from, to, objective] of scenarios) {
  const r = simulateDisruption(graph, effects, from, to, objective);
  console.log(`\n${title}  [${r.status}]`);
  console.log(`  ${r.explanation}`);
}

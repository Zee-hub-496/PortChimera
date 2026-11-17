#!/usr/bin/env node
// Writes the routing seed files from scripts/routing-seed/definition.mjs.
//   supabase/seed/ports.json, supabase/seed/edges.json, supabase/seed/routing_seed.sql
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSeed, buildSql } from './routing-seed/definition.mjs';

const outDir = new URL('../supabase/seed/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const seed = buildSeed();
writeFileSync(new URL('ports.json', outDir), JSON.stringify(seed.ports, null, 2) + '\n');
writeFileSync(new URL('edges.json', outDir), JSON.stringify(seed.edges, null, 2) + '\n');
writeFileSync(new URL('routing_seed.sql', outDir), buildSql(seed));

console.log(
  `Wrote ${seed.ports.length} ports and ${seed.edges.length} directed lanes to supabase/seed/`,
);

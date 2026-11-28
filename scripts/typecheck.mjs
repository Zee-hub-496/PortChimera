// Runs the TypeScript compiler (type checking only, nothing is emitted) for every workspace
// that has a tsconfig.json. Fails loudly if TypeScript is not installed: a skipped type check
// must never look like a passing one.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const projects = ['packages/core', 'apps/api', 'apps/web']
  .filter((dir) => existsSync(join(root, dir, 'tsconfig.json')))
  .map((dir) => join(root, dir, 'tsconfig.json'));

const local = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const tsc = process.env.PORTCHIMERA_TSC ?? (existsSync(local) ? local : null);
if (tsc === null) {
  console.error(
    'TypeScript is not installed. Run: npm install --save-dev typescript @types/node\n' +
      '(or set PORTCHIMERA_TSC to a tsc entry file).',
  );
  process.exit(1);
}

let failed = false;
for (const project of projects) {
  console.log(`typecheck ${project}`);
  const extra = process.env.PORTCHIMERA_TYPE_ROOTS
    ? ['--typeRoots', process.env.PORTCHIMERA_TYPE_ROOTS]
    : [];
  const r = spawnSync(process.execPath, [tsc, '-p', project, ...extra], { stdio: 'inherit' });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
// Scans every file Git would track (tracked + untracked-but-not-ignored) for credential patterns.
// Exit code 1 means a possible secret was found, so it can block a commit or fail a hook.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Supabase secret key', re: /sb_secret_[0-9A-Za-z_-]{20,}/ },
  {
    name: 'JWT-like token (could be a Supabase service-role key)',
    re: /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  {
    name: 'Hard-coded secret assignment',
    re: /(?:API_KEY|SERVICE_ROLE_KEY|SECRET)\s*=\s*['"]?[A-Za-z0-9_\-.]{20,}/,
  },
];

const SKIP_FILES = new Set(['package-lock.json', 'scripts/scan-secrets.mjs']);
const MAX_BYTES = 1_000_000;

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const findings = [];

for (const file of files) {
  if (SKIP_FILES.has(file)) continue;
  // A real .env file must never be tracked, whatever it contains.
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example')) {
    findings.push(`${file}: environment file would be committed`);
    continue;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue; // file deleted but still listed
  }
  if (!stat.isFile() || stat.size > MAX_BYTES) continue;
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) findings.push(`${file}:${i + 1}: possible ${name}`);
    }
  });
}

if (findings.length) {
  console.error('Secret scan FAILED:\n' + findings.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} files checked).`);

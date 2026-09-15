#!/usr/bin/env node
/**
 * Integrity guard (PROJECT_PRINCIPLES rules 2 & 3).  Greps every source file for Unicode
 * normalisation calls and fails unless the file is the single sanctioned module.  This runs
 * independently of ESLint so an `eslint-disable` comment cannot bypass it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ALLOWED = new Set(['packages/gurmukhi/src/normalize.ts']);
const PATTERNS = [
  /\.normalize\s*\(/, // JS/TS String.prototype.normalize
  /unicodedata\.normalize\s*\(/, // Python
  /\bNFC\b|\bNFD\b|\bNFKC\b|\bNFKD\b/, // form constants appearing anywhere else are suspicious
];
const EXT = new Set(['.ts', '.mts', '.tsx', '.js', '.mjs', '.py', '.sql']);
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'fixtures']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if ([...EXT].some((e) => name.endsWith(e))) yield p;
  }
}

let bad = 0;
for (const file of walk(process.cwd())) {
  const rel = relative(process.cwd(), file).replaceAll('\\', '/');
  if (ALLOWED.has(rel) || rel.startsWith('scripts/check-no-normalize')) continue;
  const src = readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (line.includes('normalize-guard: allow')) return; // documented exceptions only (see docs/security.md)
    if (PATTERNS.some((re) => re.test(line))) {
      console.error(`✗ ${rel}:${i + 1}: ${line.trim()}`);
      bad++;
    }
  });
}
if (bad) {
  console.error(`\n${bad} normalisation reference(s) outside the sanctioned module.`);
  process.exit(1);
}
console.log(
  '✓ normalisation guard: no Unicode normalisation outside packages/gurmukhi/src/normalize.ts',
);

/**
 * Minimal `.env` loader (no dependency): reads KEY=VALUE lines from the repository root `.env`
 * (or a path in KOSH_ENV_FILE) and sets them on process.env WITHOUT overriding variables that
 * are already set. Quotes around values are stripped; `#` starts a comment. Never logs values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadDotEnv(
  file: string = process.env['KOSH_ENV_FILE'] ?? findRootEnv(),
): string | null {
  if (!file || !existsSync(file)) return null;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return file;
}

/** Walk up from cwd looking for a `.env` next to a `pnpm-workspace.yaml`. */
function findRootEnv(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return resolve(dir, '.env');
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd(), '.env');
}

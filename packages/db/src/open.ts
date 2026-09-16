import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { openPg } from './pg.ts';
import { openPglite } from './pglite.ts';
import type { Db } from './types.ts';

/**
 * Base directory for relative paths (data directories, object store): the workspace root when the
 * process runs inside the repository (found by walking up to `pnpm-workspace.yaml`), otherwise the
 * directory the command was invoked from. This keeps `.data/...` in one place whichever package
 * script started the process.
 */
export function invocationDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.env['INIT_CWD'] ?? process.cwd();
}

/**
 * Open a database from a URL.
 *   postgres://user:pass@host:5432/db   production / CI PostgreSQL
 *   pglite://memory                      throwaway in-memory PostgreSQL (tests)
 *   pglite://./.data/kosh                persisted local PostgreSQL in a directory (development)
 */
export async function openDb(url: string): Promise<Db> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return openPg(url);
  if (url.startsWith('pglite://')) {
    const raw = url.slice('pglite://'.length) || 'memory';
    if (raw === 'memory') return openPglite('memory');
    const dir = isAbsolute(raw) ? raw : resolve(invocationDir(), raw);
    mkdirSync(dir, { recursive: true });
    return openPglite(dir);
  }
  throw new Error(`unsupported database url scheme: ${url.split(':')[0]}`);
}

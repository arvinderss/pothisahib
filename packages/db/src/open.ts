import { openPg } from './pg.ts';
import { openPglite } from './pglite.ts';
import type { Db } from './types.ts';

/**
 * Open a database from a URL.
 *   postgres://user:pass@host:5432/db   production / CI PostgreSQL
 *   pglite://memory                      throwaway in-memory PostgreSQL (tests)
 *   pglite://./.data/kosh                persisted local PostgreSQL in a directory (development)
 */
export async function openDb(url: string): Promise<Db> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return openPg(url);
  if (url.startsWith('pglite://')) return openPglite(url.slice('pglite://'.length) || 'memory');
  throw new Error(`unsupported database url scheme: ${url.split(':')[0]}`);
}

/**
 * Test helper: a fresh in-memory PostgreSQL (PGlite) with every migration applied.
 * Used by corpus/test, packages/kosh-core/test and services/api/test.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openPglite } from './pglite.ts';
import { migrate } from './migrate.ts';
import type { Db } from './types.ts';

export const MIGRATIONS_DIR: string = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'corpus',
  'migrations',
);

export async function createTestDb(): Promise<Db> {
  const db = await openPglite('memory');
  await migrate(db, MIGRATIONS_DIR, 'up', { log: () => undefined });
  return db;
}

import { PGlite, type PGliteInterface, type Transaction } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { toDbError, type Db, type QueryResult } from './types.ts';

type Runner = PGliteInterface | Transaction;

class PgliteHandle implements Db {
  readonly kind = 'pglite' as const;
  constructor(
    private readonly runner: Runner,
    private readonly root: PGlite | null,
  ) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    try {
      // int8 stays a string, matching the pg driver, so ids are handled identically everywhere.
      const r = await this.runner.query<T>(sql, params as unknown[], {
        parsers: { 20: (v: string) => v },
      });
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    } catch (e) {
      throw toDbError(e);
    }
  }

  async exec(sql: string): Promise<void> {
    try {
      await this.runner.exec(sql);
    } catch (e) {
      throw toDbError(e);
    }
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.root === null) return fn(this); // already inside a transaction: flatten
    return this.root.transaction((tx) => fn(new PgliteHandle(tx, null)));
  }

  async close(): Promise<void> {
    if (this.root) await this.root.close();
  }
}

/**
 * Open a PGlite database. `dataDir` of `memory` (or empty) is an in-memory instance; otherwise a
 * directory path, persisted between runs (used for zero-setup local development).
 */
export async function openPglite(dataDir?: string): Promise<Db> {
  const opts = { extensions: { citext, pg_trgm } };
  const db =
    dataDir && dataDir !== 'memory'
      ? await PGlite.create(dataDir, opts)
      : await PGlite.create(opts);
  return new PgliteHandle(db, db);
}

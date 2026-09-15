import pg from 'pg';
import { toDbError, type Db, type QueryResult } from './types.ts';

// int8 (bigint) columns are returned as strings by the driver; ids are always handled as strings.
pg.types.setTypeParser(20, (v: string) => v);

class PgHandle implements Db {
  readonly kind = 'pg' as const;
  constructor(
    private readonly runner: pg.Pool | pg.PoolClient,
    private readonly pool: pg.Pool | null,
  ) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    try {
      const r = await this.runner.query(sql, params as unknown[]);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
    } catch (e) {
      throw toDbError(e);
    }
  }

  async exec(sql: string): Promise<void> {
    try {
      await this.runner.query(sql);
    } catch (e) {
      throw toDbError(e);
    }
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.pool === null) return fn(this); // already in a transaction: flatten
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(new PgHandle(client, null));
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw toDbError(e);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
  }
}

export function openPg(connectionString: string, max = 5): Db {
  const pool = new pg.Pool({ connectionString, max });
  return new PgHandle(pool, pool);
}

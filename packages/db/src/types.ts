/**
 * Minimal database abstraction shared by every service, the CLI and the tests.
 *
 * Two implementations exist: `pg` (production PostgreSQL) and PGlite (PostgreSQL compiled to
 * WebAssembly, used for zero-setup local development and for the test-suite). Both run the SAME
 * SQL migrations, so what the tests prove about triggers, constraints and grants holds for the
 * production database as well.
 */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  readonly kind: 'pg' | 'pglite';
  /** Parameterised single statement. Always use this for anything carrying user input. */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  /** Multi-statement script (migrations). Never pass user input here. */
  exec(sql: string): Promise<void>;
  /**
   * Run `fn` inside a transaction. Nested calls on the transaction handle run in the SAME
   * transaction (no savepoints), so keep units of work small and explicit.
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Database roles created by migration 0001. */
export type KoshRole = 'kosh_public' | 'kosh_ingest' | 'kosh_app';

export class DbError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

/** Normalise driver errors so callers can branch on SQLSTATE regardless of driver. */
export function toDbError(e: unknown): DbError {
  if (e instanceof DbError) return e;
  const err = e as { message?: string; code?: string };
  return new DbError(err.message ?? String(e), err.code, e);
}

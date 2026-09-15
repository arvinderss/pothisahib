import type { Db, KoshRole, QueryResult } from './types.ts';

const ROLES: ReadonlySet<string> = new Set(['kosh_public', 'kosh_ingest', 'kosh_app']);

/**
 * A Db that executes everything as a given database role, using `SET LOCAL ROLE` inside a
 * transaction. This is how a single owner connection (development, tests, PGlite) exercises the
 * SAME grant boundaries that separate login roles enforce in production. Because the role name is
 * interpolated into SQL it is validated against a closed allow-list.
 */
export function withRole(db: Db, role: KoshRole): Db {
  if (!ROLES.has(role)) throw new Error(`unknown database role: ${role}`);
  return new RoleDb(db, role);
}

class RoleDb implements Db {
  readonly kind: 'pg' | 'pglite';
  constructor(
    private readonly inner: Db,
    private readonly role: KoshRole,
  ) {
    this.kind = inner.kind;
  }
  query<T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>> {
    return this.transaction((tx) => tx.query<T>(sql, params));
  }
  exec(sql: string): Promise<void> {
    return this.transaction((tx) => tx.exec(sql));
  }
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.inner.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${this.role}`);
      return fn(tx);
    });
  }
  close(): Promise<void> {
    return this.inner.close();
  }
}

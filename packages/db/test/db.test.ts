import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations, migrate, openDb, openPglite, withRole, type Db } from '../src/index.ts';
import { MIGRATIONS_DIR } from '../src/testing.ts';

let db: Db;
beforeAll(async () => {
  db = await openPglite('memory');
});
afterAll(async () => {
  await db.close();
});

describe('openDb', () => {
  it('routes by scheme and rejects unknown schemes', async () => {
    await expect(openDb('mysql://x')).rejects.toThrow(/unsupported database url scheme/);
    const mem = await openDb('pglite://memory');
    expect(mem.kind).toBe('pglite');
    await mem.close();
  });
});

describe('PGlite handle', () => {
  it('returns int8 as strings like the pg driver, and Date for timestamptz', async () => {
    const r = await db.query<{ big: unknown; ts: unknown; n: unknown }>(
      `SELECT 9007199254740993::bigint AS big, now() AS ts, 3::int AS n`,
    );
    expect(r.rows[0]?.big).toBe('9007199254740993');
    expect(r.rows[0]?.ts).toBeInstanceOf(Date);
    expect(r.rows[0]?.n).toBe(3);
  });
  it('rolls back a transaction on error and flattens nested transactions', async () => {
    await db.exec('CREATE TABLE t (v int)');
    await expect(
      db.transaction(async (tx) => {
        await tx.query('INSERT INTO t VALUES (1)');
        await tx.transaction(async (inner) => {
          await inner.query('INSERT INTO t VALUES (2)');
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const n = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM t');
    expect(n.rows[0]?.n).toBe(0);
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO t VALUES (1)');
      await tx.transaction((inner) => inner.query('INSERT INTO t VALUES (2)'));
    });
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM t')).rows[0]?.n).toBe(2);
  });
  it('surfaces SQLSTATE codes through DbError', async () => {
    await expect(db.query('SELECT * FROM does_not_exist')).rejects.toMatchObject({
      name: 'DbError',
      code: '42P01',
    });
  });
});

describe('withRole', () => {
  it('rejects role names outside the closed allow-list (no SQL injection surface)', () => {
    expect(() => withRole(db, 'kosh_app; DROP TABLE t' as never)).toThrow(/unknown database role/);
    expect(() => withRole(db, 'postgres' as never)).toThrow(/unknown database role/);
  });
});

describe('migration runner', () => {
  it('lists migrations in order with checksums and matching down files', () => {
    const ms = listMigrations(MIGRATIONS_DIR);
    expect(ms.length).toBeGreaterThanOrEqual(7);
    ms.forEach((m, i) => {
      expect(m.version).toBe(i + 1);
      expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(m.down.length).toBeGreaterThan(0);
    });
  });
  it('status reports pending then applied', async () => {
    const fresh = await openPglite('memory');
    const lines: string[] = [];
    try {
      await migrate(fresh, MIGRATIONS_DIR, 'status', { log: (l) => lines.push(l) });
      expect(lines.every((l) => l.startsWith('pending'))).toBe(true);
      await migrate(fresh, MIGRATIONS_DIR, 'up', { log: () => undefined });
      lines.length = 0;
      await migrate(fresh, MIGRATIONS_DIR, 'status', { log: (l) => lines.push(l) });
      expect(lines.every((l) => l.startsWith('applied'))).toBe(true);
      await expect(migrate(fresh, MIGRATIONS_DIR, 'bogus' as never)).rejects.toThrow(
        /unknown command/,
      );
    } finally {
      await fresh.close();
    }
  });
});

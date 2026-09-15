/**
 * SQL migration runner shared by the CLI, the services and the tests.
 *
 * Files live in a directory as NNNN_name.up.sql / NNNN_name.down.sql. Each migration runs in one
 * transaction. A SHA-256 of the up-file is recorded so an edited, already-applied migration is
 * detected and refused: migrations are immutable once applied. Write a new one instead.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './types.ts';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
  checksum: string;
}

export function listMigrations(dir: string): Migration[] {
  const ups = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.up\.sql$/.test(f))
    .sort();
  return ups.map((f) => {
    const version = Number(f.slice(0, 4));
    const name = f.slice(5, -7);
    const up = readFileSync(join(dir, f), 'utf8');
    const down = readFileSync(join(dir, `${f.slice(0, -7)}.down.sql`), 'utf8');
    return { version, name, up, down, checksum: createHash('sha256').update(up).digest('hex') };
  });
}

async function ensureTable(db: Db): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    integer PRIMARY KEY,
    name       text NOT NULL,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now())`);
}

export interface MigrateOptions {
  all?: boolean;
  log?: (line: string) => void;
}

export type MigrateCommand = 'up' | 'down' | 'status';

const pad = (v: number): string => String(v).padStart(4, '0');

export async function migrate(
  db: Db,
  dir: string,
  command: MigrateCommand,
  opts: MigrateOptions = {},
): Promise<void> {
  const log = opts.log ?? ((m: string): void => console.log(m));
  await ensureTable(db);
  const applied = await db.query<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  const appliedMap = new Map(applied.rows.map((r) => [Number(r.version), r.checksum]));
  const all = listMigrations(dir);

  for (const m of all) {
    const c = appliedMap.get(m.version);
    if (c && c !== m.checksum)
      throw new Error(
        `migration ${m.version} (${m.name}) was modified after being applied; refusing to continue`,
      );
  }

  if (command === 'status') {
    for (const m of all)
      log(`${appliedMap.has(m.version) ? 'applied' : 'pending'}  ${pad(m.version)}_${m.name}`);
    return;
  }
  if (command === 'up') {
    for (const m of all) {
      if (appliedMap.has(m.version)) continue;
      try {
        await db.transaction(async (tx) => {
          await tx.exec(m.up);
          await tx.query(
            'INSERT INTO schema_migrations(version, name, checksum) VALUES ($1,$2,$3)',
            [m.version, m.name, m.checksum],
          );
        });
      } catch (e) {
        throw new Error(`migration ${m.version} (${m.name}) failed: ${(e as Error).message}`);
      }
      log(`up    ${pad(m.version)}_${m.name}`);
    }
    return;
  }
  if (command === 'down') {
    const toRevert = all
      .filter((m) => appliedMap.has(m.version))
      .sort((a, b) => b.version - a.version);
    const targets = opts.all ? toRevert : toRevert.slice(0, 1);
    for (const m of targets) {
      try {
        await db.transaction(async (tx) => {
          await tx.exec(m.down);
          await tx.query('DELETE FROM schema_migrations WHERE version = $1', [m.version]);
        });
      } catch (e) {
        throw new Error(`revert of ${m.version} (${m.name}) failed: ${(e as Error).message}`);
      }
      log(`down  ${pad(m.version)}_${m.name}`);
    }
    return;
  }
  throw new Error(`unknown command: ${String(command)}`);
}

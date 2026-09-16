/**
 * Offline export: the copy must be openable by an ordinary SQLite client, must keep the corpus
 * bytes exact, and must not carry credential material unless that is explicitly asked for.
 * All text here is synthetic test text, never Gurbani.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportDatabase, isSecretColumn } from '../src/export.ts';
import { internText } from '../src/text.ts';
import { createWorld, SAMPLE_LINES, type TestWorld } from '../src/testing.ts';

describe('offline export', () => {
  let world: TestWorld;
  let dir: string;
  let sqlitePath: string;

  beforeAll(async () => {
    world = await createWorld();
    for (const text of SAMPLE_LINES.slice(0, 8)) await internText(world.db, text);
    dir = mkdtempSync(join(tmpdir(), 'kosh-export-'));
    sqlitePath = join(dir, 'kosh.sqlite');
    await exportDatabase(world.db, { sqlitePath, sqlPath: join(dir, 'kosh.sql') });
  });
  afterAll(async () => {
    await world.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('flags credential columns by name', () => {
    expect(isSecretColumn('password_hash')).toBe(true);
    expect(isSecretColumn('totp_secret_encrypted')).toBe(true);
    expect(isSecretColumn('recovery_codes_hash')).toBe(true);
    expect(isSecretColumn('refresh_token_hash')).toBe(true);
    expect(isSecretColumn('raw_text')).toBe(false);
    expect(isSecretColumn('slug')).toBe(false);
  });

  it('produces a SQLite database any client can open, with the corpus tables present', () => {
    const s = new DatabaseSync(sqlitePath, { readOnly: true });
    const tables = s
      .prepare(`select name from sqlite_master where type='table' order by name`)
      .all()
      .map((r) => r['name'] as string);
    expect(tables).toContain('text_blobs');
    expect(tables).toContain('banis');
    expect(tables).toContain('accepted_versions');
    expect(tables).toContain('_kosh_export');
    const meta = s.prepare(`select value from _kosh_export where key='includes_secrets'`).get();
    expect(meta?.['value']).toBe('false');
    s.close();
  });

  it('keeps every stored blob byte-exact under its own hash', () => {
    const s = new DatabaseSync(sqlitePath, { readOnly: true });
    const rows = s.prepare('select sha256, raw_bytes from text_blobs').all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const bytes = r['raw_bytes'] as Uint8Array;
      const stored = Buffer.from(r['sha256'] as Uint8Array).toString('hex');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(stored);
    }
    s.close();
  });

  it('redacts credential columns by default', () => {
    const s = new DatabaseSync(sqlitePath, { readOnly: true });
    const users = s.prepare('select username, password_hash from users').all();
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u['username']).toBeTruthy();
      expect(u['password_hash']).toBeNull();
    }
    s.close();
  });
});

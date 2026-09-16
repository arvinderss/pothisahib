/**
 * Offline export of the corpus database to a single SQLite file (and an equivalent SQL script).
 *
 * Why: development runs on PGlite, whose data directory is a PostgreSQL cluster that only the
 * WebAssembly engine can open — no external client (HeidiSQL, psql, pgAdmin) can attach to it.
 * A SQLite file can be opened directly by HeidiSQL (Session type "SQLite"), DB Browser, or any
 * other tool, which makes the corpus reviewable offline without running the application.
 *
 * Rules honoured here:
 * - the export is a COPY; nothing in the corpus is altered and no text is normalised;
 * - Gurmukhi text is written as UTF-8 exactly as stored, and `text_blobs.bytes` is written as a
 *   BLOB, so a byte-exact comparison against the corpus is still possible from the export;
 * - credential material (password hashes, MFA secrets, session tokens, security answers) is
 *   REDACTED unless `includeSecrets` is explicitly set, so an export can be shared safely.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Db } from '@pothisahib/db';

/**
 * Credential material is redacted by name, not by a fixed table list, so a column added by a later
 * migration is redacted by default rather than leaking into an export that someone shares.
 */
const SECRET_COLUMN_RE = /(password|secret|token_hash|answer_hash|recovery_codes|_cipher|nonce)/i;

export function isSecretColumn(column: string): boolean {
  return SECRET_COLUMN_RE.test(column);
}

export interface ExportOptions {
  /** Target SQLite file. Overwritten if it exists. */
  sqlitePath?: string;
  /** Optional SQLite-dialect .sql script with the same content. */
  sqlPath?: string;
  /** Include credential columns (default false). */
  includeSecrets?: boolean;
  /** Progress reporting. */
  log?: (message: string) => void;
}

export interface ExportResult {
  sqlitePath?: string;
  sqlPath?: string;
  tables: { name: string; rows: number }[];
  totalRows: number;
  exportedAt: string;
}

interface ColumnInfo {
  name: string;
  dataType: string;
}

/** PostgreSQL type → SQLite storage class (SQLite is dynamically typed; this is documentation). */
function sqliteType(pgType: string): string {
  if (pgType === 'bytea') return 'BLOB';
  if (['smallint', 'integer', 'bigint'].includes(pgType)) return 'INTEGER';
  if (['numeric', 'real', 'double precision'].includes(pgType)) return 'REAL';
  if (pgType === 'boolean') return 'INTEGER';
  return 'TEXT';
}

/** Convert one PostgreSQL value to something node:sqlite can bind. */
function toSqlite(value: unknown): string | number | bigint | Uint8Array | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function sqlLiteral(value: string | number | bigint | Uint8Array | null): string {
  if (value === null) return 'NULL';
  if (value instanceof Uint8Array)
    return `X'${[...value].map((b) => b.toString(16).padStart(2, '0')).join('')}'`;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

async function listTables(db: Db): Promise<string[]> {
  const r = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return r.rows.map((x) => x.table_name);
}

async function listColumns(db: Db, table: string): Promise<ColumnInfo[]> {
  const r = await db.query<{ column_name: string; data_type: string }>(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table],
  );
  return r.rows.map((x) => ({ name: x.column_name, dataType: x.data_type }));
}

/**
 * Read every public table and write it to a SQLite database and/or a SQL script.
 * Rows are streamed in pages so a large corpus does not have to fit in memory at once.
 */
export async function exportDatabase(db: Db, options: ExportOptions): Promise<ExportResult> {
  const log = options.log ?? ((): void => undefined);
  const includeSecrets = options.includeSecrets ?? false;
  const exportedAt = new Date().toISOString();
  const tables = await listTables(db);
  const counts: { name: string; rows: number }[] = [];

  let sqlite: DatabaseSync | null = null;
  if (options.sqlitePath) {
    await mkdir(dirname(options.sqlitePath), { recursive: true });
    await writeFile(options.sqlitePath, new Uint8Array()); // start from an empty file
    sqlite = new DatabaseSync(options.sqlitePath);
    sqlite.exec('PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF;');
  }
  const script: string[] = [
    `-- Gurbani Kosh offline export (${exportedAt})`,
    `-- SQLite dialect. Open the .sqlite file directly in HeidiSQL (session type: SQLite),`,
    `-- or run this script against a new SQLite database.`,
    includeSecrets
      ? '-- WARNING: this export INCLUDES credential columns.'
      : '-- Credential columns are redacted (NULL).',
    'PRAGMA foreign_keys = OFF;',
    'BEGIN;',
  ];

  const meta = [
    ['exported_at', exportedAt],
    ['source_driver', db.kind],
    ['includes_secrets', String(includeSecrets)],
  ];
  const metaDdl = 'CREATE TABLE "_kosh_export" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL);';
  sqlite?.exec(metaDdl);
  script.push(metaDdl);
  for (const [k, v] of meta) {
    sqlite?.prepare('INSERT INTO "_kosh_export" VALUES (?, ?)').run(k as string, v as string);
    script.push(
      `INSERT INTO "_kosh_export" VALUES (${sqlLiteral(k as string)}, ${sqlLiteral(v as string)});`,
    );
  }

  for (const table of tables) {
    const columns = await listColumns(db, table);
    if (columns.length === 0) continue;
    const redacted = new Set(
      includeSecrets ? [] : columns.map((c) => c.name).filter((n) => isSecretColumn(n)),
    );
    const ddl = `CREATE TABLE ${quoteIdent(table)} (\n  ${columns
      .map((c) => `${quoteIdent(c.name)} ${sqliteType(c.dataType)}`)
      .join(',\n  ')}\n);`;
    sqlite?.exec(ddl);
    script.push('', ddl);

    const selectList = columns
      .map((c) => (redacted.has(c.name) ? `NULL as ${quoteIdent(c.name)}` : quoteIdent(c.name)))
      .join(', ');
    const insertSql = `INSERT INTO ${quoteIdent(table)} VALUES (${columns.map(() => '?').join(', ')})`;
    const insert = sqlite?.prepare(insertSql);

    const pageSize = 500;
    let offset = 0;
    let rows = 0;
    for (;;) {
      const page = await db.query<Record<string, unknown>>(
        `select ${selectList} from ${quoteIdent(table)} limit ${pageSize} offset ${offset}`,
      );
      if (page.rows.length === 0) break;
      for (const row of page.rows) {
        const values = columns.map((c) => toSqlite(row[c.name]));
        insert?.run(...values);
        script.push(
          `INSERT INTO ${quoteIdent(table)} VALUES (${values.map(sqlLiteral).join(', ')});`,
        );
      }
      rows += page.rows.length;
      offset += pageSize;
      if (page.rows.length < pageSize) break;
    }
    counts.push({ name: table, rows });
    log(
      `${table}: ${rows} rows${redacted.size > 0 ? ` (${[...redacted].join(', ')} redacted)` : ''}`,
    );
  }

  sqlite?.close();
  script.push('COMMIT;');
  if (options.sqlPath) {
    await mkdir(dirname(options.sqlPath), { recursive: true });
    await writeFile(options.sqlPath, script.join('\n') + '\n', 'utf8');
  }

  return {
    ...(options.sqlitePath ? { sqlitePath: options.sqlitePath } : {}),
    ...(options.sqlPath ? { sqlPath: options.sqlPath } : {}),
    tables: counts,
    totalRows: counts.reduce((a, b) => a + b.rows, 0),
    exportedAt,
  };
}

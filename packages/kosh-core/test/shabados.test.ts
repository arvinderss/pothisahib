/**
 * Shabad OS adapter tests against a tiny SQLite file built here with the 5.x schema shape and
 * SYNTHETIC strings (not Gurbani corpus data).
 */
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  flattenDocument,
  inputFromBytes,
  separateVishraam,
  shabadosSqliteV1Parser,
} from '../src/index.ts';

function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kosh-shabados-fx-'));
  const path = join(dir, 'master.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE assets (id text PRIMARY KEY, name text, reference text);
    CREATE TABLE asset_lines (asset_id text, line_id text, type text, data text, additional text, priority integer);
    CREATE TABLE authors (id text PRIMARY KEY, name text, other_names text);
    CREATE TABLE sources (id text PRIMARY KEY, name text, translation text);
    CREATE TABLE sections (id text PRIMARY KEY, source_id text, source_order integer, name text, description text);
    CREATE TABLE line_groups (id text PRIMARY KEY, author_id text, section_id text, section_order integer);
    CREATE TABLE lines (id text PRIMARY KEY, line_group_id text, line_group_order integer);
    CREATE TABLE banis (id text PRIMARY KEY, name text);
    CREATE TABLE bani_lines (bani_id text, line_id text, section_order integer, line_order integer);
    INSERT INTO assets VALUES ('TEST', '{"en":"Synthetic edition"}', '{}');
    INSERT INTO sources VALUES ('SRC1', '{"Latn":"synthetic source"}', '{}');
    INSERT INTO sections VALUES ('SEC1', 'SRC1', 1, '{"Latn":"Synthetic"}', NULL);
    INSERT INTO line_groups VALUES ('LG01', 'AUTH', 'SEC1', 1);
    INSERT INTO lines VALUES ('L001', 'LG01', 1), ('L002', 'LG01', 2), ('L003', 'LG01', 3), ('L004', 'LG01', 4);
    INSERT INTO asset_lines VALUES
      ('TEST', 'L001', 'primary', 'ਸਤਿ ਨਾਮੁ ਕਰਤਾ; ਪੁਰਖੁ ॥', '{"type":"primary","page":1,"line":1}', 1),
      ('TEST', 'L002', 'primary', 'ਸਤਿਗੁਰੁ. ਪ੍ਰਸਾਦਿ, ਹਰਿ ॥', '{"type":"primary","page":1,"line":2}', 1),
      ('TEST', 'L003', 'primary', 'ਸ਼ਬਦ ਸ਼ਬਦ ॥੧॥', NULL, 1),
      ('TEST', 'L001', 'translation', 'not ingested', '{"language":"en"}', 2),
      ('TEST', 'L001', 'note', 'not ingested either', NULL, 3);
    INSERT INTO banis VALUES ('TB01', '{"Latn":"Test Bani","Guru":"ਟੈਸਟ"}'), ('TB02', '{"Latn":"Broken Bani"}');
    INSERT INTO bani_lines VALUES ('TB01', 'L001', 1, 1), ('TB01', 'L002', 1, 2), ('TB01', 'L003', 2, 1), ('TB02', 'L004', 1, 1),
      ('TB01', 'GONE', 2, 2);  -- compilation entry pointing at a line the source does not have
  `);
  db.close();
  return path;
}

describe('separateVishraam', () => {
  it('removes ; , . marks and records their kinds and codepoint positions; identity when none', () => {
    const r = separateVishraam('ਸਤਿ ਨਾਮੁ ਕਰਤਾ; ਪੁਰਖੁ. ਹਰਿ, ॥');
    expect(r.text).toBe('ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ਹਰਿ ॥');
    expect(r.vishraam).toEqual([
      { cp: 13, kind: 'heavy' },
      { cp: 19, kind: 'light' },
      { cp: 23, kind: 'medium' },
    ]);
    expect(separateVishraam('ਸਤਿ ਨਾਮੁ')).toEqual({ text: 'ਸਤਿ ਨਾਮੁ', vishraam: [] });
    // reinsertion reproduces the raw string exactly (the layer is recoverable)
    const raw = 'ਸਤਿ; ਨਾਮੁ, ਕਰਤਾ.';
    const { text, vishraam } = separateVishraam(raw);
    const cps = [...text];
    const marks: Record<string, string> = { heavy: ';', medium: ',', light: '.' };
    let rebuilt = '';
    let pos = 0;
    for (const v of vishraam) {
      rebuilt += cps.slice(pos, v.cp).join('') + marks[v.kind];
      pos = v.cp;
    }
    rebuilt += cps.slice(pos).join('');
    expect(rebuilt).toBe(raw);
  });
});

describe('shabados-sqlite-v1 parser', () => {
  const path = buildFixture();
  it('emits one document per Bani with sections by section_order, primary text only, vishraam separated', async () => {
    const docs = await shabadosSqliteV1Parser.parse(
      { bytes: async () => readFileSync(path), localPath: path },
      { scope: 'banis', banis: ['TB01'] },
    );
    expect(docs).toHaveLength(1);
    const d = docs[0] as (typeof docs)[number];
    expect(d.locator).toBe('bani:TB01');
    expect(d.title).toBe('Test Bani');
    expect(d.metadata?.['shabados_source_ids']).toEqual(['SRC1']);
    const flat = flattenDocument(d);
    expect(flat.map((l) => l.text)).toEqual([
      'ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ॥',
      'ਸਤਿਗੁਰੁ ਪ੍ਰਸਾਦਿ ਹਰਿ ॥',
      'ਸ਼ਬਦ ਸ਼ਬਦ ॥੧॥',
    ]);
    expect(flat.map((l) => l.sectionPath[0]?.label)).toEqual(['1', '1', '2']);
    expect(flat[0]?.locator).toMatchObject({
      shabados_line_id: 'L001',
      asset_id: 'TEST',
      page: 1,
      line: 1,
      raw: 'ਸਤਿ ਨਾਮੁ ਕਰਤਾ; ਪੁਰਖੁ ॥',
    });
    expect(flat[0]?.locator['vishraam']).toEqual([{ cp: 13, kind: 'heavy' }]);
    expect(flat[2]?.locator['raw']).toBeUndefined(); // no marks: nothing to record
    // the dangling compilation entry is recorded, not invented and not silently dropped
    expect(d.metadata?.['integrity']).toEqual({
      bani_lines_in_source: 4,
      lines_emitted: 3,
      dangling_bani_lines: [{ line_id: 'GONE', section_order: 2, line_order: 2 }],
    });
  });
  it('works from bytes when no local path is available', async () => {
    const docs = await shabadosSqliteV1Parser.parse(inputFromBytes(readFileSync(path)), {
      banis: ['TB01'],
    });
    expect(flattenDocument(docs[0] as never)).toHaveLength(3);
  });
  it('refuses to invent: a Bani line without primary text fails the whole parse', async () => {
    await expect(
      shabadosSqliteV1Parser.parse(inputFromBytes(readFileSync(path)), { banis: ['TB02'] }),
    ).rejects.toThrow(/no primary text/);
    await expect(shabadosSqliteV1Parser.parse(inputFromBytes(readFileSync(path)))).rejects.toThrow(
      /no primary text/,
    );
  });
  it('validates options and artefact', async () => {
    await expect(
      shabadosSqliteV1Parser.parse(inputFromBytes(readFileSync(path)), { scope: 'sources' }),
    ).rejects.toThrow(/only scope/);
    await expect(
      shabadosSqliteV1Parser.parse(inputFromBytes(readFileSync(path)), { banis: ['NOPE'] }),
    ).rejects.toThrow(/unknown bani/);
    await expect(
      shabadosSqliteV1Parser.parse(inputFromBytes(new TextEncoder().encode('not a database'))),
    ).rejects.toThrow(/SQLite/);
  });
});

/**
 * Adapter for the Shabad OS database (npm `@shabados/database` 5.x, `dist/master.sqlite`).
 *
 * Model in that database: `lines` (stable 4-char ids) belong to `line_groups` (shabads) within
 * `sections` of `sources` (SGGS, Dasam Granth, ...). `asset_lines` holds every representation of a
 * line per physical asset (`type = 'primary'` is the Gurmukhi text of one physical edition, e.g.
 * SGPC Shabadaarth; `translation` and `note` are other authors' works). `banis` + `bani_lines`
 * are Shabad OS's Bani compilations (Japji, Rehras, ...), ordered by section_order, line_order.
 *
 * Scope `banis`: one document per Bani compilation (optionally filtered), sections by
 * section_order. Only `primary` text is read; translations and notes are separate works with
 * their own licences and are NOT ingested here (R-29).
 *
 * Annotation layer (ADR-0006): Shabad OS embeds vishraam (pause) marks in the primary text as
 * `;` (heavy), `,` (medium) and `.` (light). They are an editorial layer from a cited pause pothi,
 * not the words of the physical source. The adapter records the composite string verbatim in the
 * line locator (`raw`) together with each mark's kind and codepoint position, and emits the text
 * without the marks. The rule is fixed by `version`; the snapshot keeps the original database.
 *
 * Requires Node's built-in `node:sqlite` (Node 22.13+ / 24). The file is opened read-only.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestError } from '../errors.ts';
import type { ParsedDocument, ParsedLine, ParsedSection, Parser, ParserInput } from './types.ts';

export type VishraamKind = 'heavy' | 'medium' | 'light';
const VISHRAAM: Record<string, VishraamKind> = { ';': 'heavy', ',': 'medium', '.': 'light' };

export interface Vishraam {
  /** codepoint offset in the emitted text at which the mark stood (i.e. after this many codepoints) */
  cp: number;
  kind: VishraamKind;
}

/** Split Shabad OS composite text into words-only text and the annotation layer. Deterministic. */
export function separateVishraam(raw: string): { text: string; vishraam: Vishraam[] } {
  const out: string[] = [];
  const vishraam: Vishraam[] = [];
  for (const ch of raw) {
    const kind = VISHRAAM[ch];
    if (kind) vishraam.push({ cp: out.length, kind });
    else out.push(ch);
  }
  return { text: out.join(''), vishraam };
}

interface Options {
  scope: 'banis';
  banis?: string[];
}

function readOptions(o: Record<string, unknown> | undefined): Options {
  const scope = o?.['scope'] ?? 'banis';
  if (scope !== 'banis')
    throw new BadRequestError(
      'shabados-sqlite-v1: only scope "banis" is supported in this version',
    );
  const banis = o?.['banis'];
  if (banis !== undefined) {
    if (
      !Array.isArray(banis) ||
      !banis.every((b) => typeof b === 'string' && /^[A-Z0-9]{2,8}$/.test(b))
    )
      throw new BadRequestError('shabados-sqlite-v1: banis must be an array of Shabad OS bani ids');
    return { scope: 'banis', banis: banis as string[] };
  }
  return { scope: 'banis' };
}

function parseJsonField(v: unknown): Record<string, unknown> {
  if (typeof v !== 'string') return {};
  try {
    const j = JSON.parse(v) as unknown;
    return typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const shabadosSqliteV1Parser: Parser = {
  format: 'shabados-sqlite-v1',
  // 1.1.0: compilation entries that reference a line the source does not have are recorded in the
  // document metadata (integrity.dangling_bani_lines) instead of being lost in an inner join.
  version: 'kosh-parse-shabados-sqlite/1.1.0',
  async parse(input: ParserInput, options?: Record<string, unknown>): Promise<ParsedDocument[]> {
    const opts = readOptions(options);
    let tmp: string | null = null;
    let path = input.localPath;
    if (!path) {
      tmp = mkdtempSync(join(tmpdir(), 'kosh-shabados-'));
      path = join(tmp, 'master.sqlite');
      writeFileSync(path, await input.bytes());
    }
    let db: DatabaseSync | null = null;
    try {
      try {
        db = new DatabaseSync(path, { readOnly: true });
      } catch (e) {
        throw new BadRequestError(
          `artefact is not a readable SQLite database: ${(e as Error).message}`,
        );
      }
      let tables: Set<string>;
      try {
        tables = new Set(
          (
            db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
              name: string;
            }[]
          ).map((t) => t.name),
        );
      } catch (e) {
        throw new BadRequestError(
          `artefact is not a readable SQLite database: ${(e as Error).message}`,
        );
      }
      for (const t of [
        'banis',
        'bani_lines',
        'lines',
        'line_groups',
        'sections',
        'sources',
        'asset_lines',
        'assets',
      ])
        if (!tables.has(t))
          throw new BadRequestError(
            `shabados-sqlite-v1: table "${t}" missing; expected the @shabados/database 5.x schema`,
          );

      const banis = db.prepare(`SELECT id, name FROM banis ORDER BY id`).all() as {
        id: string;
        name: string;
      }[];
      const selected = opts.banis ? banis.filter((b) => opts.banis?.includes(b.id)) : banis;
      if (opts.banis && selected.length !== opts.banis.length) {
        const missing = opts.banis.filter((id) => !banis.some((b) => b.id === id));
        throw new BadRequestError(`shabados-sqlite-v1: unknown bani id(s): ${missing.join(', ')}`);
      }
      // asset_lines (hundreds of thousands of rows) is not indexed by line_id in the published
      // file, so per-line lookups would each scan the table. One pass builds the map instead.
      type Primary = {
        asset_id: string;
        data: string;
        additional: string | null;
        priority: number;
      };
      const primaries = new Map<string, Primary[]>();
      for (const row of db
        .prepare(
          `SELECT line_id, asset_id, data, additional, priority FROM asset_lines WHERE type = 'primary'`,
        )
        .iterate() as Iterable<Primary & { line_id: string }>) {
        const list = primaries.get(row.line_id) ?? [];
        list.push(row);
        primaries.set(row.line_id, list);
      }
      const linesStmt = db.prepare(
        `SELECT bl.line_id, bl.section_order, bl.line_order, l.id AS line_exists, l.line_group_id, l.line_group_order, lg.section_id, s.source_id, lg.author_id
         FROM bani_lines bl
         LEFT JOIN lines l ON l.id = bl.line_id
         LEFT JOIN line_groups lg ON lg.id = l.line_group_id
         LEFT JOIN sections s ON s.id = lg.section_id
         WHERE bl.bani_id = ? ORDER BY bl.section_order, bl.line_order`,
      );

      const docs: ParsedDocument[] = [];
      for (const bani of selected) {
        const names = parseJsonField(bani.name);
        const rows = linesStmt.all(bani.id) as {
          line_id: string;
          section_order: number;
          line_order: number;
          line_exists: string | null;
          line_group_id: string | null;
          line_group_order: number | null;
          section_id: string | null;
          source_id: string | null;
          author_id: string | null;
        }[];
        if (rows.length === 0) continue;
        const sections = new Map<number, ParsedLine[]>();
        const sourceIds = new Set<string>();
        // Entries of the compilation that point at a line the source does not contain. Recorded,
        // never invented, never silently dropped.
        const dangling: { line_id: string; section_order: number; line_order: number }[] = [];
        for (const r of rows) {
          if (r.line_exists === null) {
            dangling.push({
              line_id: r.line_id,
              section_order: r.section_order,
              line_order: r.line_order,
            });
            continue;
          }
          const prim = (primaries.get(r.line_id) ?? []).sort((a, b) => a.priority - b.priority);
          if (prim.length === 0)
            throw new BadRequestError(
              `shabados-sqlite-v1: line ${r.line_id} of ${bani.id} has no primary text; refusing to invent`,
            );
          if (prim.length > 1)
            throw new BadRequestError(
              `shabados-sqlite-v1: line ${r.line_id} has ${prim.length} primary readings; multi-reading lines are not supported yet`,
            );
          const p = prim[0] as { asset_id: string; data: string; additional: string | null };
          if (typeof p.data !== 'string')
            throw new BadRequestError(
              `shabados-sqlite-v1: line ${r.line_id} primary text is not a string`,
            );
          const { text, vishraam } = separateVishraam(p.data);
          const add = parseJsonField(p.additional);
          if (r.source_id) sourceIds.add(r.source_id);
          const locator: Record<string, unknown> = {
            shabados_line_id: r.line_id,
            line_group_id: r.line_group_id,
            line_group_order: r.line_group_order,
            shabados_section_id: r.section_id,
            shabados_source_id: r.source_id,
            author_id: r.author_id,
            asset_id: p.asset_id,
            page: add['page'] ?? null,
            line: add['line'] ?? null,
            section_order: r.section_order,
            line_order: r.line_order,
          };
          if (vishraam.length > 0) {
            locator['raw'] = p.data;
            locator['vishraam'] = vishraam;
          }
          const list = sections.get(r.section_order) ?? [];
          list.push({ text, locator });
          sections.set(r.section_order, list);
        }
        const parsedSections: ParsedSection[] = [...sections.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([order, lines]) => ({ type: 'BANI_SECTION', label: String(order), lines }));
        docs.push({
          locator: `bani:${bani.id}`,
          title: String(names['Latn'] ?? names['Guru'] ?? bani.id),
          metadata: {
            shabados_bani_id: bani.id,
            names,
            shabados_source_ids: [...sourceIds],
            annotation_layer: 'vishraam marks separated into line locators (ADR-0006)',
            integrity: {
              bani_lines_in_source: rows.length,
              lines_emitted: rows.length - dangling.length,
              dangling_bani_lines: dangling,
            },
          },
          sections: parsedSections,
        });
      }
      return docs;
    } finally {
      db?.close();
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  },
};

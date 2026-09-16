/**
 * Parse a stored snapshot into the immutable source layer: source_documents, source_lines
 * (blob references + SOURCE_SPACING layouts), source_normalizations (the SEPARATE comparison
 * representation) and derived search keys. Parsing never touches the accepted layer.
 */
import type { Db } from '@pothisahib/db';
import {
  NORMALIZER_VERSION,
  normalizeEncoding,
  normalizeForComparison,
} from '@pothisahib/gurmukhi';
import { audit } from './audit.ts';
import { iso, str, type Actor, type KoshContext } from './context.ts';
import { sha256Hex } from './crypto.ts';
import { ConflictError, fromDb, IntegrityError, NotFoundError } from './errors.ts';
import { flattenDocument, parserFor } from './formats/index.ts';
import { getSnapshot } from './snapshots.ts';
import { ensureSearchKeys, ensureSourceLayout, internText } from './text.ts';

export interface SourceDocument {
  id: string;
  snapshotId: string;
  locator: string;
  title: string | null;
  ordinal: number;
  parserVersion: string | null;
  inputFormat: string | null;
  parsedAt: string | null;
  lineCount: number;
  /** Parser-recorded facts about the document, including integrity findings in the source itself. */
  metadata: Record<string, unknown>;
}

const DOC_COLS = `id, snapshot_id, locator, title, ordinal, parser_version, input_format, parsed_at, line_count, metadata`;
const rowToDoc = (r: Record<string, unknown>): SourceDocument => ({
  id: str(r['id']),
  snapshotId: str(r['snapshot_id']),
  locator: str(r['locator']),
  title: (r['title'] as string | null) ?? null,
  ordinal: Number(r['ordinal']),
  parserVersion: (r['parser_version'] as string | null) ?? null,
  inputFormat: (r['input_format'] as string | null) ?? null,
  parsedAt: iso(r['parsed_at']),
  lineCount: Number(r['line_count']),
  metadata: (typeof r['metadata'] === 'string'
    ? JSON.parse(r['metadata'] as string)
    : (r['metadata'] ?? {})) as Record<string, unknown>,
});

export interface ParseResult {
  documents: SourceDocument[];
  lineCount: number;
}

export async function parseSnapshot(
  ctx: KoshContext,
  input: { snapshotId: string; format: string; options?: Record<string, unknown> },
  actor: Actor,
): Promise<ParseResult> {
  const snap = await getSnapshot(ctx.db, input.snapshotId);
  if (!snap) throw new NotFoundError('snapshot');
  if (!snap.contentPresent)
    throw new IntegrityError('snapshot content has been pruned; re-ingest the artefact');
  const parser = parserFor(input.format);

  // The stored artefact is verified against the recorded hash before any parser sees it.
  const bytes = await ctx.store.get(snap.storageKey);
  if (sha256Hex(bytes) !== snap.sha256Hex)
    throw new IntegrityError('stored artefact does not match the recorded hash');
  const localPath = ctx.store.localPath ? await ctx.store.localPath(snap.storageKey) : null;
  const docs = await parser.parse({ bytes: async () => bytes, localPath }, input.options ?? {});

  // A snapshot is parsed once per parser version. A newer parser may parse it again; the earlier
  // documents remain (immutable) and the new ones sit beside them (migration 0009).
  const already = await ctx.db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM source_documents WHERE snapshot_id = $1 AND parser_version = $2',
    [snap.id, parser.version],
  );
  if (Number(already.rows[0]?.n) > 0)
    throw new ConflictError(`snapshot has already been parsed with ${parser.version}`);

  const out: SourceDocument[] = [];
  let total = 0;
  for (const [di, doc] of docs.entries()) {
    const lines = flattenDocument(doc);
    const created = await ctx.db.transaction(async (tx) => {
      let dr;
      try {
        dr = await tx.query<Record<string, unknown>>(
          `INSERT INTO source_documents (snapshot_id, locator, title, ordinal, parser_version, input_format, line_count, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING ${DOC_COLS}`,
          [
            snap.id,
            doc.locator,
            doc.title ?? null,
            di,
            parser.version,
            parser.format,
            lines.length,
            JSON.stringify(doc.metadata ?? {}),
          ],
        );
      } catch (e) {
        fromDb(e);
      }
      const document = rowToDoc(dr.rows[0] as Record<string, unknown>);
      for (const l of lines) {
        const blobId = await internText(tx, l.text);
        const layoutId = await ensureSourceLayout(tx, blobId, l.text);
        const locator = { ...l.locator, section_path: l.sectionPath };
        await tx.query(
          `INSERT INTO source_lines (snapshot_id, document_id, ordinal, blob_id, layout_id, locator) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [snap.id, document.id, l.ordinal, blobId, layoutId, JSON.stringify(locator)],
        );
        const lineIdRow = await tx.query<{ id: unknown }>(
          'SELECT id FROM source_lines WHERE document_id = $1 AND ordinal = $2',
          [document.id, l.ordinal],
        );
        const sourceLineId = str(lineIdRow.rows[0]?.id);
        for (const [profile, fn] of [
          ['encoding-v1', normalizeEncoding],
          ['compare-v1', normalizeForComparison],
        ] as const) {
          const normBlob = await internText(tx, fn(l.text));
          await tx.query(
            `INSERT INTO source_normalizations (source_line_id, normalizer_version, profile, normalized_blob_id) VALUES ($1,$2,$3,$4)`,
            [sourceLineId, NORMALIZER_VERSION, profile, normBlob],
          );
        }
        await ensureSearchKeys(tx, blobId, l.text);
      }
      await audit(tx, {
        actorType: 'USER',
        actorId: actor.userId,
        action: 'SNAPSHOT_PARSE',
        objectType: 'source_document',
        objectId: document.id,
        after: {
          snapshotId: snap.id,
          locator: doc.locator,
          lineCount: lines.length,
          parserVersion: parser.version,
          inputFormat: parser.format,
          options: input.options ?? {},
        },
      });
      return document;
    });
    out.push(created);
    total += lines.length;
  }
  return { documents: out, lineCount: total };
}

export async function listDocuments(db: Db, snapshotId: string): Promise<SourceDocument[]> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT ${DOC_COLS} FROM source_documents WHERE snapshot_id = $1 ORDER BY ordinal`,
    [snapshotId],
  );
  return r.rows.map(rowToDoc);
}

export async function getDocument(db: Db, id: string): Promise<SourceDocument | null> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT ${DOC_COLS} FROM source_documents WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return row ? rowToDoc(row) : null;
}

export interface SourceLineRow {
  id: string;
  ordinal: number;
  blobId: string;
  layoutId: string | null;
  text: string;
  sha256Hex: string;
  locator: Record<string, unknown>;
}

export async function getDocumentLines(db: Db, documentId: string): Promise<SourceLineRow[]> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT sl.id, sl.ordinal, sl.blob_id, sl.layout_id, tb.raw_text, encode(tb.sha256,'hex') AS sha, sl.locator
     FROM source_lines sl JOIN text_blobs tb ON tb.id = sl.blob_id WHERE sl.document_id = $1 ORDER BY sl.ordinal`,
    [documentId],
  );
  return r.rows.map((x) => ({
    id: str(x['id']),
    ordinal: Number(x['ordinal']),
    blobId: str(x['blob_id']),
    layoutId: x['layout_id'] === null || x['layout_id'] === undefined ? null : str(x['layout_id']),
    text: str(x['raw_text']),
    sha256Hex: str(x['sha']),
    locator: (typeof x['locator'] === 'string'
      ? JSON.parse(x['locator'] as string)
      : x['locator']) as Record<string, unknown>,
  }));
}

/**
 * Corpus structure (the editorial spine): corpora -> granths -> banis -> sections -> lines.
 * Structure carries NO text. Bootstrapping a Bani's structure from a parsed source document
 * records which snapshot's segmentation was used (RISK_REGISTER R-05).
 */
import type { Db } from '@pothisahib/db';
import { isSlug, type VerificationState } from '@pothisahib/domain';
import { audit } from './audit.ts';
import { str, type Actor } from './context.ts';
import { BadRequestError, ConflictError, fromDb, NotFoundError } from './errors.ts';
import { getDocument, getDocumentLines } from './parse.ts';

export interface Bani {
  id: string;
  granthId: string;
  granthSlug: string;
  slug: string;
  name: string;
  verificationState: VerificationState;
  ordinal: number;
  metadata: Record<string, unknown>;
  structureBasisSnapshotId: string | null;
}

const BANI_SQL = `SELECT b.id, b.granth_id, g.slug AS granth_slug, b.slug, b.name, b.verification_state, b.ordinal, b.metadata,
  b.structure_basis_snapshot_id FROM banis b JOIN granths g ON g.id = b.granth_id`;

const rowToBani = (r: Record<string, unknown>): Bani => ({
  id: str(r['id']),
  granthId: str(r['granth_id']),
  granthSlug: str(r['granth_slug']),
  slug: str(r['slug']),
  name: str(r['name']),
  verificationState: r['verification_state'] as VerificationState,
  ordinal: Number(r['ordinal']),
  metadata: (typeof r['metadata'] === 'string'
    ? JSON.parse(r['metadata'] as string)
    : (r['metadata'] ?? {})) as Record<string, unknown>,
  structureBasisSnapshotId:
    r['structure_basis_snapshot_id'] === null || r['structure_basis_snapshot_id'] === undefined
      ? null
      : str(r['structure_basis_snapshot_id']),
});

function checkName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200)
    throw new BadRequestError('invalid name');
  return name;
}

export async function ensureCorpus(db: Db, slug: string, name: string): Promise<string> {
  if (!isSlug(slug)) throw new BadRequestError('invalid corpus slug');
  checkName(name);
  const existing = await db.query<{ id: unknown }>('SELECT id FROM corpora WHERE slug = $1', [
    slug,
  ]);
  if (existing.rows[0]) return str(existing.rows[0].id);
  const r = await db.query<{ id: unknown }>(
    'INSERT INTO corpora (slug, name) VALUES ($1,$2) RETURNING id',
    [slug, name],
  );
  return str(r.rows[0]?.id);
}

export async function ensureGranth(
  db: Db,
  corpusSlug: string,
  slug: string,
  name: string,
): Promise<string> {
  if (!isSlug(slug)) throw new BadRequestError('invalid granth slug');
  checkName(name);
  const existing = await db.query<{ id: unknown }>('SELECT id FROM granths WHERE slug = $1', [
    slug,
  ]);
  if (existing.rows[0]) return str(existing.rows[0].id);
  const c = await db.query<{ id: unknown }>('SELECT id FROM corpora WHERE slug = $1', [corpusSlug]);
  if (!c.rows[0]) throw new NotFoundError('corpus');
  const r = await db.query<{ id: unknown }>(
    'INSERT INTO granths (corpus_id, slug, name) VALUES ($1,$2,$3) RETURNING id',
    [str(c.rows[0].id), slug, name],
  );
  return str(r.rows[0]?.id);
}

export async function ensureBani(
  db: Db,
  input: {
    granthSlug: string;
    slug: string;
    name: string;
    metadata?: Record<string, unknown>;
    aliases?: string[];
  },
  actor: Actor,
): Promise<Bani> {
  if (!isSlug(input.slug)) throw new BadRequestError('invalid bani slug');
  checkName(input.name);
  const existing = await getBani(db, input.slug);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const g = await tx.query<{ id: unknown }>('SELECT id FROM granths WHERE slug = $1', [
      input.granthSlug,
    ]);
    if (!g.rows[0]) throw new NotFoundError('granth');
    let r;
    try {
      r = await tx.query<{ id: unknown }>(
        'INSERT INTO banis (granth_id, slug, name, metadata) VALUES ($1,$2,$3,$4::jsonb) RETURNING id',
        [str(g.rows[0].id), input.slug, input.name, JSON.stringify(input.metadata ?? {})],
      );
    } catch (e) {
      fromDb(e);
    }
    const id = str(r.rows[0]?.id);
    for (const alias of input.aliases ?? []) {
      if (typeof alias !== 'string' || alias.length === 0 || alias.length > 200)
        throw new BadRequestError('invalid alias');
      await tx.query(
        'INSERT INTO bani_aliases (bani_id, alias) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id, alias],
      );
    }
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'BANI_CREATE',
      objectType: 'bani',
      objectId: id,
      after: input,
    });
    const bani = await getBani(tx, input.slug);
    if (!bani) throw new Error('bani vanished');
    return bani;
  });
}

export async function getBani(db: Db, slug: string): Promise<Bani | null> {
  const r = await db.query<Record<string, unknown>>(`${BANI_SQL} WHERE b.slug = $1`, [slug]);
  const row = r.rows[0];
  return row ? rowToBani(row) : null;
}

export async function listBanis(db: Db): Promise<Bani[]> {
  const r = await db.query<Record<string, unknown>>(
    `${BANI_SQL} ORDER BY g.ordinal, g.id, b.ordinal, b.id`,
  );
  return r.rows.map(rowToBani);
}

export interface StructureLine {
  lineId: string;
  sectionId: string;
  ordinal: number;
}

export async function getBaniLines(db: Db, baniId: string): Promise<StructureLine[]> {
  const r = await db.query<Record<string, unknown>>(
    'SELECT id, section_id, ordinal FROM lines WHERE bani_id = $1 AND superseded_by IS NULL ORDER BY ordinal',
    [baniId],
  );
  return r.rows.map((x) => ({
    lineId: str(x['id']),
    sectionId: str(x['section_id']),
    ordinal: Number(x['ordinal']),
  }));
}

/**
 * Create sections and lines for a Bani from a parsed document's segmentation. Refuses if the
 * Bani already has structure (structure revisions are a separate, decision-gated workflow).
 */
export async function bootstrapStructureFromDocument(
  db: Db,
  input: { baniSlug: string; documentId: string },
  actor: Actor,
): Promise<{ bani: Bani; sections: number; lines: number }> {
  return db.transaction(async (tx) => {
    const bani = await getBani(tx, input.baniSlug);
    if (!bani) throw new NotFoundError('bani');
    const doc = await getDocument(tx, input.documentId);
    if (!doc) throw new NotFoundError('document');
    const existing = await getBaniLines(tx, bani.id);
    if (existing.length > 0) throw new ConflictError('bani already has structure');
    const srcLines = await getDocumentLines(tx, doc.id);
    if (srcLines.length === 0) throw new BadRequestError('document has no lines');

    // sections keyed by path so identical (type,label) paths share one section
    const sectionByPath = new Map<string, string>();
    const childCount = new Map<string, number>();
    let sectionCount = 0;
    const ensureSection = async (
      path: { type: string; label: string | null }[],
    ): Promise<string> => {
      const key = JSON.stringify(path);
      const have = sectionByPath.get(key);
      if (have) return have;
      const parentPath = path.slice(0, -1);
      const parentId = parentPath.length ? await ensureSection(parentPath) : null;
      const leaf = path[path.length - 1] as { type: string; label: string | null };
      const ordKey = parentId ?? 'root';
      const ordinal = childCount.get(ordKey) ?? 0;
      childCount.set(ordKey, ordinal + 1);
      const r = await tx.query<{ id: unknown }>(
        `INSERT INTO sections (bani_id, parent_section_id, section_type, ordinal, label) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [bani.id, parentId, leaf.type, ordinal, leaf.label],
      );
      const id = str(r.rows[0]?.id);
      sectionByPath.set(key, id);
      sectionCount++;
      return id;
    };

    for (const sl of srcLines) {
      const path = (sl.locator['section_path'] as
        { type: string; label: string | null }[] | undefined) ?? [{ type: 'BODY', label: null }];
      const sectionId = await ensureSection(path.length ? path : [{ type: 'BODY', label: null }]);
      await tx.query(
        `INSERT INTO lines (bani_id, section_id, ordinal, structure_basis_snapshot_id) VALUES ($1,$2,$3,$4)`,
        [bani.id, sectionId, sl.ordinal, doc.snapshotId],
      );
    }
    await tx.query('UPDATE banis SET structure_basis_snapshot_id = $2 WHERE id = $1', [
      bani.id,
      doc.snapshotId,
    ]);
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'STRUCTURE_BOOTSTRAP',
      objectType: 'bani',
      objectId: bani.id,
      after: {
        documentId: doc.id,
        snapshotId: doc.snapshotId,
        sections: sectionCount,
        lines: srcLines.length,
      },
    });
    const refreshed = await getBani(tx, input.baniSlug);
    return { bani: refreshed as Bani, sections: sectionCount, lines: srcLines.length };
  });
}

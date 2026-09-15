/**
 * The accepted layer. Accepted text changes ONLY by:
 *   draft version  ->  approval by account A  ->  approval by account B (≠ A)  ->  decision row
 *   ->  explicit publish (trigger re-checks everything)  ->  previous version SUPERSEDED.
 * Rollback creates a NEW draft copying an older version's line texts and follows the same path.
 * No text is ever written here; only references to content-addressed blobs.
 */
import type { Db } from '@pothisahib/db';
import {
  REDISTRIBUTABLE,
  type AcceptedBasis,
  type AcceptedStatus,
  type DecisionKind,
} from '@pothisahib/domain';
import { audit } from './audit.ts';
import { iso, str, type Actor } from './context.ts';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  fromDb,
  IntegrityError,
  NotFoundError,
} from './errors.ts';
import { getDocument, getDocumentLines } from './parse.ts';
import { getSnapshot } from './snapshots.ts';
import { getSourceById } from './sources.ts';
import { getBani, getBaniLines, type Bani } from './structure.ts';

export interface AcceptedVersion {
  id: string;
  baniId: string;
  versionNo: number;
  status: AcceptedStatus;
  basis: AcceptedBasis;
  basisSourceId: string | null;
  decisionId: string | null;
  previousVersionId: string | null;
  rolledBackToId: string | null;
  createdBy: string;
  createdAt: string | null;
  publishedAt: string | null;
  rationale: string | null;
  approvals: Approval[];
}

export interface Approval {
  userId: string;
  username: string;
  roleAtTime: string;
  approvedAt: string | null;
}

const V_COLS = `v.id, v.bani_id, v.version_no, v.status, v.basis, v.basis_source_id, v.decision_id, v.previous_version_id,
  v.rolled_back_to_id, v.created_by, v.created_at, v.published_at, v.rationale`;

async function loadApprovals(db: Db, versionId: string): Promise<Approval[]> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT a.user_id, u.username, a.role_at_time, a.approved_at FROM version_approvals a JOIN users u ON u.id = a.user_id
     WHERE a.accepted_version_id = $1 ORDER BY a.approved_at, a.user_id`,
    [versionId],
  );
  return r.rows.map((x) => ({
    userId: str(x['user_id']),
    username: str(x['username']),
    roleAtTime: str(x['role_at_time']),
    approvedAt: iso(x['approved_at']),
  }));
}

async function rowToVersion(db: Db, r: Record<string, unknown>): Promise<AcceptedVersion> {
  const id = str(r['id']);
  const nul = (v: unknown): string | null => (v === null || v === undefined ? null : str(v));
  return {
    id,
    baniId: str(r['bani_id']),
    versionNo: Number(r['version_no']),
    status: r['status'] as AcceptedStatus,
    basis: r['basis'] as AcceptedBasis,
    basisSourceId: nul(r['basis_source_id']),
    decisionId: nul(r['decision_id']),
    previousVersionId: nul(r['previous_version_id']),
    rolledBackToId: nul(r['rolled_back_to_id']),
    createdBy: str(r['created_by']),
    createdAt: iso(r['created_at']),
    publishedAt: iso(r['published_at']),
    rationale: (r['rationale'] as string | null) ?? null,
    approvals: await loadApprovals(db, id),
  };
}

export async function getVersion(db: Db, id: string): Promise<AcceptedVersion | null> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT ${V_COLS} FROM accepted_versions v WHERE v.id = $1`,
    [id],
  );
  const row = r.rows[0];
  return row ? rowToVersion(db, row) : null;
}

export async function listVersions(db: Db, baniId: string): Promise<AcceptedVersion[]> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT ${V_COLS} FROM accepted_versions v WHERE v.bani_id = $1 ORDER BY v.version_no`,
    [baniId],
  );
  const out: AcceptedVersion[] = [];
  for (const row of r.rows) out.push(await rowToVersion(db, row));
  return out;
}

export async function getPublishedVersion(db: Db, baniId: string): Promise<AcceptedVersion | null> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT ${V_COLS} FROM accepted_versions v WHERE v.bani_id = $1 AND v.status = 'PUBLISHED'`,
    [baniId],
  );
  const row = r.rows[0];
  return row ? rowToVersion(db, row) : null;
}

function checkRationale(r: unknown): string {
  if (typeof r !== 'string' || r.trim().length < 3 || r.length > 4000)
    throw new BadRequestError('rationale is required (3-4000 chars)');
  return r;
}

/**
 * Create a DRAFT adopting one parsed document's text as the Bani's accepted reading, line by line
 * (ordinal to ordinal). Requires the Bani's structure to have the same number of lines, a
 * spaced layout for every source line (R-07), and a source that is ACTIVE and redistributable
 * (the decision trigger enforces this again at approval time; we fail early for a clear message).
 */
export async function createAdoptionDraft(
  db: Db,
  input: { baniSlug: string; documentId: string; rationale: string },
  actor: Actor,
): Promise<AcceptedVersion> {
  const rationale = checkRationale(input.rationale);
  return db.transaction(async (tx) => {
    const bani = await getBani(tx, input.baniSlug);
    if (!bani) throw new NotFoundError('bani');
    const doc = await getDocument(tx, input.documentId);
    if (!doc) throw new NotFoundError('document');
    const snap = await getSnapshot(tx, doc.snapshotId);
    if (!snap) throw new NotFoundError('snapshot');
    const source = await getSourceById(tx, snap.sourceId);
    if (!source) throw new NotFoundError('source');
    if (source.status !== 'ACTIVE')
      throw new IntegrityError('cannot adopt from a source that is not ACTIVE');
    if (!REDISTRIBUTABLE.includes(source.redistribution))
      throw new IntegrityError(
        `cannot adopt text from a source whose redistribution status is ${source.redistribution} (R-03)`,
      );

    const structure = await getBaniLines(tx, bani.id);
    const srcLines = await getDocumentLines(tx, doc.id);
    if (structure.length === 0)
      throw new ConflictError('bani has no structure; bootstrap it first');
    if (structure.length !== srcLines.length)
      throw new ConflictError(
        `structure has ${structure.length} lines but document has ${srcLines.length}; alignment is required`,
      );

    const current = await getPublishedVersion(tx, bani.id);
    let vr;
    try {
      vr = await tx.query<Record<string, unknown>>(
        `INSERT INTO accepted_versions (bani_id, version_no, status, basis, basis_source_id, previous_version_id, created_by, rationale)
         VALUES ($1, 0, 'DRAFT', 'SOURCE_ADOPTION', $2, $3, $4, $5) RETURNING ${V_COLS.replaceAll('v.', '')}`,
        [bani.id, source.id, current?.id ?? null, actor.userId, rationale],
      );
    } catch (e) {
      fromDb(e);
    }
    const versionId = str((vr.rows[0] as Record<string, unknown>)['id']);
    for (const [i, sl] of srcLines.entries()) {
      const line = structure[i] as { lineId: string };
      if (sl.layoutId === null)
        throw new IntegrityError(
          `source line ${sl.ordinal} has no token layout (unspaced source); cannot adopt`,
        );
      try {
        await tx.query(
          `INSERT INTO accepted_line_texts (accepted_version_id, line_id, blob_id, layout_id, derived_from_source_line_id) VALUES ($1,$2,$3,$4,$5)`,
          [versionId, line.lineId, sl.blobId, sl.layoutId, sl.id],
        );
      } catch (e) {
        fromDb(e);
      }
    }
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'VERSION_DRAFT_ADOPTION',
      objectType: 'accepted_version',
      objectId: versionId,
      after: {
        baniSlug: bani.slug,
        documentId: doc.id,
        snapshotId: snap.id,
        sourceSlug: source.slug,
        lines: srcLines.length,
      },
      reason: rationale,
    });
    return (await getVersion(tx, versionId)) as AcceptedVersion;
  });
}

/** Rollback = a NEW draft whose line texts are copied from an earlier version (SRS §35). */
export async function createRollbackDraft(
  db: Db,
  input: { baniSlug: string; targetVersionId: string; rationale: string },
  actor: Actor,
): Promise<AcceptedVersion> {
  const rationale = checkRationale(input.rationale);
  return db.transaction(async (tx) => {
    const bani = await getBani(tx, input.baniSlug);
    if (!bani) throw new NotFoundError('bani');
    const target = await getVersion(tx, input.targetVersionId);
    if (!target || target.baniId !== bani.id) throw new NotFoundError('target version');
    if (target.status === 'DRAFT') throw new BadRequestError('cannot roll back to a DRAFT');
    const current = await getPublishedVersion(tx, bani.id);
    if (!current) throw new ConflictError('nothing is published; nothing to roll back');
    if (current.id === target.id)
      throw new BadRequestError('target is already the published version');
    let vr;
    try {
      vr = await tx.query<Record<string, unknown>>(
        `INSERT INTO accepted_versions (bani_id, version_no, status, basis, previous_version_id, rolled_back_to_id, created_by, rationale)
         VALUES ($1, 0, 'DRAFT', 'ROLLBACK', $2, $3, $4, $5) RETURNING id`,
        [bani.id, current.id, target.id, actor.userId, rationale],
      );
    } catch (e) {
      fromDb(e);
    }
    const versionId = str((vr.rows[0] as Record<string, unknown>)['id']);
    await tx.query(
      `INSERT INTO accepted_line_texts (accepted_version_id, line_id, blob_id, layout_id, derived_from_source_line_id)
       SELECT $1, line_id, blob_id, layout_id, derived_from_source_line_id FROM accepted_line_texts WHERE accepted_version_id = $2`,
      [versionId, target.id],
    );
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'VERSION_DRAFT_ROLLBACK',
      objectType: 'accepted_version',
      objectId: versionId,
      after: { baniSlug: bani.slug, rolledBackTo: target.id, from: current.id },
      reason: rationale,
    });
    return (await getVersion(tx, versionId)) as AcceptedVersion;
  });
}

const DECISION_FOR: Record<AcceptedBasis, DecisionKind> = {
  SOURCE_ADOPTION: 'SOURCE_ADOPTION',
  REVIEWED_CORRECTION: 'CORRECTION',
  ROLLBACK: 'ROLLBACK',
  STRUCTURE_REVISION: 'STRUCTURE_REVISION',
};

/**
 * Record one approval by the acting account. The database captures the approver's role and
 * refuses non-eligible accounts and non-DRAFT versions. When two DISTINCT accounts have approved,
 * the two-person decision row is created (its trigger re-validates both) and attached to the draft.
 */
export async function approveVersion(
  db: Db,
  input: { versionId: string; notes?: string | null },
  actor: Actor,
): Promise<AcceptedVersion> {
  return db.transaction(async (tx) => {
    const v = await getVersion(tx, input.versionId);
    if (!v) throw new NotFoundError('version');
    if (v.status !== 'DRAFT') throw new ConflictError(`version is ${v.status}`);
    if (v.approvals.some((a) => a.userId === actor.userId))
      throw new ConflictError('you have already approved this version');
    try {
      await tx.query(
        `INSERT INTO version_approvals (accepted_version_id, user_id, role_at_time, notes) VALUES ($1, $2, 'EDITOR', $3)`,
        [v.id, actor.userId, input.notes ?? null],
      );
    } catch (e) {
      fromDb(e);
    }
    const approvals = await loadApprovals(tx, v.id);
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'VERSION_APPROVE',
      objectType: 'accepted_version',
      objectId: v.id,
      after: { approvals: approvals.length },
      reason: input.notes ?? null,
    });
    if (approvals.length >= 2 && v.decisionId === null) {
      const [a1, a2] = approvals as [Approval, Approval, ...Approval[]];
      let snapshotId: string | null = null;
      if (v.basis === 'SOURCE_ADOPTION') {
        const s = await tx.query<{ snapshot_id: unknown }>(
          `SELECT sl.snapshot_id FROM accepted_line_texts t JOIN source_lines sl ON sl.id = t.derived_from_source_line_id
           WHERE t.accepted_version_id = $1 LIMIT 1`,
          [v.id],
        );
        snapshotId = s.rows[0] ? str(s.rows[0].snapshot_id) : null;
      }
      let d;
      try {
        d = await tx.query<{ id: unknown }>(
          `INSERT INTO decisions (kind, bani_id, approver_1, approver_1_role, approver_2, approver_2_role, rationale, source_snapshot_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            DECISION_FOR[v.basis],
            v.baniId,
            a1.userId,
            a1.roleAtTime,
            a2.userId,
            a2.roleAtTime,
            v.rationale ?? 'approved',
            snapshotId,
          ],
        );
        await tx.query('UPDATE accepted_versions SET decision_id = $2 WHERE id = $1', [
          v.id,
          str(d.rows[0]?.id),
        ]);
      } catch (e) {
        fromDb(e);
      }
    }
    return (await getVersion(tx, v.id)) as AcceptedVersion;
  });
}

/**
 * Explicit commit by an EDITOR/SUPER_ADMIN (checked here against live grants as well as at the
 * API). The accepted_versions trigger verifies the decision, line texts and lineage.
 */
export async function publishVersion(
  db: Db,
  input: { versionId: string },
  actor: Actor,
): Promise<AcceptedVersion> {
  return db.transaction(async (tx) => {
    const roles = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL AND role IN ('EDITOR','SUPER_ADMIN')`,
      [actor.userId],
    );
    if (Number(roles.rows[0]?.n) === 0)
      throw new ForbiddenError('only an Editor or Super Admin may publish');
    const v = await getVersion(tx, input.versionId);
    if (!v) throw new NotFoundError('version');
    if (v.status !== 'DRAFT') throw new ConflictError(`version is ${v.status}`);
    if (v.decisionId === null)
      throw new IntegrityError('publishing requires two independent approvals (no decision yet)');
    try {
      await tx.query(`UPDATE accepted_versions SET status = 'PUBLISHED' WHERE id = $1`, [v.id]);
    } catch (e) {
      fromDb(e);
    }
    await audit(tx, {
      actorType: 'USER',
      actorId: actor.userId,
      action: 'VERSION_PUBLISH',
      objectType: 'accepted_version',
      objectId: v.id,
      after: { baniId: v.baniId, versionNo: v.versionNo, previousVersionId: v.previousVersionId },
      decisionId: v.decisionId,
    });
    return (await getVersion(tx, v.id)) as AcceptedVersion;
  });
}

export interface AcceptedLine {
  lineId: string;
  sectionId: string;
  ordinal: number;
  text: string;
  sha256Hex: string;
  codepointCount: number;
  graphemeCount: number;
  tokens: [number, number][];
  derivedFromSourceLineId: string | null;
}

/** Line texts of one version, with token offsets. Owner/app-role read (drafts included). */
export async function getVersionLines(db: Db, versionId: string): Promise<AcceptedLine[]> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT l.id AS line_id, l.section_id, l.ordinal, tb.raw_text, encode(tb.sha256,'hex') AS sha, tb.codepoint_count, tb.grapheme_count,
            t.layout_id, t.derived_from_source_line_id
     FROM accepted_line_texts t JOIN lines l ON l.id = t.line_id JOIN text_blobs tb ON tb.id = t.blob_id
     WHERE t.accepted_version_id = $1 ORDER BY l.ordinal`,
    [versionId],
  );
  const out: AcceptedLine[] = [];
  for (const x of r.rows) {
    const tk = await db.query<{ cp_start: number; cp_end: number }>(
      'SELECT cp_start, cp_end FROM tokens WHERE layout_id = $1 ORDER BY ordinal',
      [str(x['layout_id'])],
    );
    out.push({
      lineId: str(x['line_id']),
      sectionId: str(x['section_id']),
      ordinal: Number(x['ordinal']),
      text: str(x['raw_text']),
      sha256Hex: str(x['sha']),
      codepointCount: Number(x['codepoint_count']),
      graphemeCount: Number(x['grapheme_count']),
      tokens: tk.rows.map((t) => [Number(t.cp_start), Number(t.cp_end)]),
      derivedFromSourceLineId:
        x['derived_from_source_line_id'] === null || x['derived_from_source_line_id'] === undefined
          ? null
          : str(x['derived_from_source_line_id']),
    });
  }
  return out;
}

export type { Bani };

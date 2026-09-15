/**
 * Raw-SQL fixtures for database-invariant tests. Deliberately independent of kosh-core so these
 * tests exercise the schema's own guarantees, not the application's.
 */
import type { Db } from '@pothisahib/db';
import { graphemeCount, tokenize } from '@pothisahib/gurmukhi';

const s = (v: unknown): string => String(v);

export async function mkUser(
  db: Db,
  username: string,
  opts: { mfa?: boolean } = {},
): Promise<string> {
  const r = await db.query<{ id: unknown }>(
    `INSERT INTO users (username, password_hash) VALUES ($1, '$argon2id$test') RETURNING id`,
    [username],
  );
  const id = s(r.rows[0]?.id);
  if (opts.mfa) {
    await db.query(
      `INSERT INTO user_mfa (user_id, totp_secret_encrypted, confirmed_at) VALUES ($1, '\\x00'::bytea, now())`,
      [id],
    );
  }
  return id;
}

export async function grant(
  db: Db,
  userId: string,
  role: string,
  grantedBy: string | null,
  at?: string,
): Promise<void> {
  await db.query(
    `INSERT INTO user_roles (user_id, role, granted_by, granted_at) VALUES ($1, $2::role_name, $3, COALESCE($4::timestamptz, now()))`,
    [userId, role, grantedBy, at ?? null],
  );
}

export async function mkSource(
  db: Db,
  slug: string,
  opts: { status?: string; redistribution?: string; license?: string | null } = {},
): Promise<string> {
  const r = await db.query<{ id: unknown }>(
    `INSERT INTO sources (slug, name, source_type, license, redistribution, status)
     VALUES ($1, $1, 'DATABASE', $2, $3::redistribution_status, $4::source_status) RETURNING id`,
    [
      slug,
      opts.license === undefined ? 'CC0-1.0' : opts.license,
      opts.redistribution ?? 'ALLOWED',
      opts.status ?? 'ACTIVE',
    ],
  );
  return s(r.rows[0]?.id);
}

export async function mkSnapshot(db: Db, sourceId: string, seed = 'a'): Promise<string> {
  const r = await db.query<{ id: unknown }>(
    `INSERT INTO source_snapshots (source_id, fetched_at, sha256, byte_size, storage_key)
     VALUES ($1, now(), sha256(convert_to($2, 'UTF8')), 1, 'snapshots/' || encode(sha256(convert_to($2,'UTF8')),'hex')) RETURNING id`,
    [sourceId, seed + sourceId],
  );
  return s(r.rows[0]?.id);
}

export async function mkBlob(db: Db, text: string): Promise<{ blobId: string; layoutId: string }> {
  const b = await db.query<{ id: unknown }>('SELECT kosh.intern_text($1, $2) AS id', [
    text,
    graphemeCount(text),
  ]);
  const blobId = s(b.rows[0]?.id);
  const existing = await db.query<{ id: unknown }>(
    `SELECT id FROM token_layouts WHERE blob_id = $1 AND tokenizer_version = 'test/1' AND basis = 'SOURCE_SPACING'`,
    [blobId],
  );
  const l = existing.rows[0]
    ? existing
    : await db.query<{ id: unknown }>(
        `INSERT INTO token_layouts (blob_id, tokenizer_version, basis) VALUES ($1, 'test/1', 'SOURCE_SPACING') RETURNING id`,
        [blobId],
      );
  const layoutId = s(l.rows[0]?.id);
  const have = await db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tokens WHERE layout_id = $1',
    [layoutId],
  );
  if (Number(have.rows[0]?.n) === 0) {
    for (const t of tokenize(text))
      await db.query(
        'INSERT INTO tokens (layout_id, ordinal, cp_start, cp_end) VALUES ($1,$2,$3,$4)',
        [layoutId, t.ordinal, t.cpStart, t.cpEnd],
      );
  }
  return { blobId, layoutId };
}

export async function mkBani(
  db: Db,
  slug: string,
  lineCount = 2,
): Promise<{ baniId: string; sectionId: string; lineIds: string[] }> {
  await db.query(`INSERT INTO corpora (slug, name) VALUES ('c', 'c') ON CONFLICT DO NOTHING`);
  await db.query(
    `INSERT INTO granths (corpus_id, slug, name) SELECT id, 'g', 'g' FROM corpora WHERE slug = 'c' ON CONFLICT (slug) DO NOTHING`,
  );
  const b = await db.query<{ id: unknown }>(
    `INSERT INTO banis (granth_id, slug, name) SELECT id, $1, $1 FROM granths WHERE slug = 'g' RETURNING id`,
    [slug],
  );
  const baniId = s(b.rows[0]?.id);
  const sec = await db.query<{ id: unknown }>(
    `INSERT INTO sections (bani_id, section_type, ordinal) VALUES ($1, 'BODY', 0) RETURNING id`,
    [baniId],
  );
  const sectionId = s(sec.rows[0]?.id);
  const lineIds: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const l = await db.query<{ id: unknown }>(
      `INSERT INTO lines (bani_id, section_id, ordinal) VALUES ($1, $2, $3) RETURNING id`,
      [baniId, sectionId, i],
    );
    lineIds.push(s(l.rows[0]?.id));
  }
  return { baniId, sectionId, lineIds };
}

export async function mkDraft(
  db: Db,
  opts: {
    baniId: string;
    basis: string;
    basisSourceId?: string | null;
    createdBy: string;
    lines: { lineId: string; text: string }[];
    previousVersionId?: string | null;
    rolledBackToId?: string | null;
  },
): Promise<string> {
  const r = await db.query<{ id: unknown }>(
    `INSERT INTO accepted_versions (bani_id, version_no, status, basis, basis_source_id, created_by, previous_version_id, rolled_back_to_id, rationale)
     VALUES ($1, 0, 'DRAFT', $2::accepted_basis, $3, $4, $5, $6, 'test') RETURNING id`,
    [
      opts.baniId,
      opts.basis,
      opts.basisSourceId ?? null,
      opts.createdBy,
      opts.previousVersionId ?? null,
      opts.rolledBackToId ?? null,
    ],
  );
  const versionId = s(r.rows[0]?.id);
  for (const l of opts.lines) {
    const { blobId, layoutId } = await mkBlob(db, l.text);
    await db.query(
      `INSERT INTO accepted_line_texts (accepted_version_id, line_id, blob_id, layout_id) VALUES ($1,$2,$3,$4)`,
      [versionId, l.lineId, blobId, layoutId],
    );
  }
  return versionId;
}

export async function mkDecision(
  db: Db,
  opts: {
    kind: string;
    baniId: string;
    a1: string;
    a1Role: string;
    a2: string;
    a2Role: string;
    snapshotId?: string | null;
    decidedAt?: string;
  },
): Promise<string> {
  const r = await db.query<{ id: unknown }>(
    `INSERT INTO decisions (kind, bani_id, approver_1, approver_1_role, approver_2, approver_2_role, rationale, source_snapshot_id, decided_at)
     VALUES ($1::decision_kind, $2, $3, $4::role_name, $5, $6::role_name, 'test', $7, COALESCE($8::timestamptz, now())) RETURNING id`,
    [
      opts.kind,
      opts.baniId,
      opts.a1,
      opts.a1Role,
      opts.a2,
      opts.a2Role,
      opts.snapshotId ?? null,
      opts.decidedAt ?? null,
    ],
  );
  return s(r.rows[0]?.id);
}

export async function publish(db: Db, versionId: string, decisionId: string): Promise<void> {
  await db.query(`UPDATE accepted_versions SET decision_id = $2 WHERE id = $1`, [
    versionId,
    decisionId,
  ]);
  await db.query(`UPDATE accepted_versions SET status = 'PUBLISHED' WHERE id = $1`, [versionId]);
}

export async function statusOf(
  db: Db,
  versionId: string,
): Promise<{ status: string; version_no: number }> {
  const r = await db.query<{ status: string; version_no: number }>(
    'SELECT status, version_no FROM accepted_versions WHERE id = $1',
    [versionId],
  );
  return r.rows[0] as { status: string; version_no: number };
}

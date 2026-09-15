/**
 * Database-invariant tests: the guarantees the schema itself enforces, independent of application
 * code. Runs on real PostgreSQL (PGlite) with every migration applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { withRole, migrate, openPglite, type Db } from '@pothisahib/db';
import { createTestDb, MIGRATIONS_DIR } from '@pothisahib/db/testing';
import { graphemeCount } from '@pothisahib/gurmukhi';
import {
  grant,
  mkBani,
  mkBlob,
  mkDecision,
  mkDraft,
  mkSnapshot,
  mkSource,
  mkUser,
  publish,
  statusOf,
} from './helpers.ts';

const fx = JSON.parse(
  readFileSync(
    new URL('../../packages/gurmukhi/fixtures/unicode-adversarial.json', import.meta.url),
    'utf8',
  ),
) as { recover_cases: string[]; diff_cases: { a: string; b: string }[] };
const ALL_STRINGS = [...fx.recover_cases, ...fx.diff_cases.flatMap((c) => [c.a, c.b])];

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

describe('text substrate: byte-exact, content-addressed, immutable', () => {
  it('interns every adversarial fixture and reads it back byte-for-byte', async () => {
    for (const text of ALL_STRINGS) {
      const r = await db.query<{ id: unknown }>('SELECT kosh.intern_text($1, $2) AS id', [
        text,
        graphemeCount(text),
      ]);
      const row = await db.query<{
        raw_text: string;
        raw_bytes: Uint8Array;
        sha: string;
        cp: number;
      }>(
        `SELECT raw_text, raw_bytes, encode(sha256,'hex') AS sha, codepoint_count AS cp FROM text_blobs WHERE id = $1`,
        [String(r.rows[0]?.id)],
      );
      const got = row.rows[0] as {
        raw_text: string;
        raw_bytes: Uint8Array;
        sha: string;
        cp: number;
      };
      const expectedBytes = new TextEncoder().encode(text);
      expect(got.raw_text).toBe(text);
      expect(Buffer.from(got.raw_bytes).equals(Buffer.from(expectedBytes))).toBe(true);
      expect(got.sha).toBe(sha(expectedBytes));
      expect(Number(got.cp)).toBe([...text].length);
    }
  });
  it('interning the same text twice returns the same blob (identity is the hash)', async () => {
    const a = await db.query<{ id: unknown }>('SELECT kosh.intern_text($1, $2) AS id', [
      'ਸਤਿਗੁਰੁ',
      5,
    ]);
    const b = await db.query<{ id: unknown }>('SELECT kosh.intern_text($1, $2) AS id', [
      'ਸਤਿਗੁਰੁ',
      5,
    ]);
    expect(String(a.rows[0]?.id)).toBe(String(b.rows[0]?.id));
    // distinct sequences that may render alike are distinct blobs
    const c = await db.query<{ id: unknown }>('SELECT kosh.intern_text($1, $2) AS id', [
      'ਸਤਿਗੁਰੂ',
      5,
    ]);
    expect(String(c.rows[0]?.id)).not.toBe(String(a.rows[0]?.id));
  });
  it('UPDATE and DELETE on text_blobs raise', async () => {
    await expect(db.query(`UPDATE text_blobs SET raw_text = raw_text`)).rejects.toThrow(
      /append-only/,
    );
    await expect(db.query(`DELETE FROM text_blobs`)).rejects.toThrow(/append-only/);
  });
  it('raw_text COLLATE "C" keeps distinct sequences unequal', async () => {
    const r = await db.query<{ eq: boolean }>(
      `SELECT ('\u0a36'::text COLLATE "C") = ('\u0a38\u0a3c'::text COLLATE "C") AS eq`,
    );
    expect(r.rows[0]?.eq).toBe(false);
  });
  it('token bounds: out of range, overlap and gaps in ordinals are refused', async () => {
    const { layoutId } = await mkBlob(db, 'ਸਤਿ ਨਾਮੁ'); // 8 codepoints, tokens [0,3) [4,8)
    await expect(db.query('INSERT INTO tokens VALUES ($1, 2, 8, 9)', [layoutId])).rejects.toThrow(
      /beyond blob length/,
    );
    await expect(db.query('INSERT INTO tokens VALUES ($1, 2, 7, 8)', [layoutId])).rejects.toThrow(
      /overlaps/,
    );
    await expect(db.query('INSERT INTO tokens VALUES ($1, 5, 7, 8)', [layoutId])).rejects.toThrow(
      /contiguously/,
    );
    await expect(
      db.query('UPDATE tokens SET cp_end = cp_end WHERE layout_id = $1', [layoutId]),
    ).rejects.toThrow(/append-only/);
  });
});

describe('source layer', () => {
  it('a source cannot become ACTIVE without a licence and a known redistribution status', async () => {
    await expect(mkSource(db, 'no-licence', { license: null })).rejects.toThrow(
      /sources_active_requires_license/,
    );
    await expect(mkSource(db, 'unknown-redist', { redistribution: 'UNKNOWN' })).rejects.toThrow(
      /sources_active_requires_license/,
    );
    const ok = await mkSource(db, 'proposed-ok', {
      status: 'PROPOSED',
      license: null,
      redistribution: 'UNKNOWN',
    });
    expect(ok).toBeTruthy();
    await expect(db.query('DELETE FROM sources WHERE id = $1', [ok])).rejects.toThrow(
      /may not be deleted/,
    );
  });
  it('snapshots are append-only except content_present true->false; source_lines and normalizations are immutable', async () => {
    const src = await mkSource(db, 'src-a');
    const snap = await mkSnapshot(db, src);
    await expect(
      db.query('UPDATE source_snapshots SET byte_size = 2 WHERE id = $1', [snap]),
    ).rejects.toThrow(/only content_present/);
    await db.query('UPDATE source_snapshots SET content_present = false WHERE id = $1', [snap]);
    await expect(
      db.query('UPDATE source_snapshots SET content_present = true WHERE id = $1', [snap]),
    ).rejects.toThrow(/only content_present/);
    await expect(db.query('DELETE FROM source_snapshots WHERE id = $1', [snap])).rejects.toThrow(
      /append-only/,
    );
    // identical artefact for the same source is refused (duplicate snapshot detection)
    await expect(mkSnapshot(db, src)).rejects.toThrow(/duplicate key/);

    const { blobId, layoutId } = await mkBlob(db, 'ਸਤਿ ਨਾਮੁ');
    const doc = await db.query<{ id: unknown }>(
      `INSERT INTO source_documents (snapshot_id, locator) VALUES ($1, 'd') RETURNING id`,
      [snap],
    );
    const docId = String(doc.rows[0]?.id);
    const sl = await db.query<{ id: unknown }>(
      `INSERT INTO source_lines (snapshot_id, document_id, ordinal, blob_id, layout_id) VALUES ($1,$2,0,$3,$4) RETURNING id`,
      [snap, docId, blobId, layoutId],
    );
    const slId = String(sl.rows[0]?.id);
    await expect(
      db.query('UPDATE source_lines SET ordinal = 5 WHERE id = $1', [slId]),
    ).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM source_lines WHERE id = $1', [slId])).rejects.toThrow(
      /append-only/,
    );
    await db.query(`INSERT INTO source_normalizations VALUES ($1, 'n/1', 'compare-v1', $2)`, [
      slId,
      blobId,
    ]);
    await expect(
      db.query('DELETE FROM source_normalizations WHERE source_line_id = $1', [slId]),
    ).rejects.toThrow(/append-only/);
  });
});

describe('identity and roles', () => {
  it('EDITOR/SUPER_ADMIN grants require confirmed MFA; self-grant is refused; grants are never deleted', async () => {
    const admin = await mkUser(db, 'admin1', { mfa: true });
    await grant(db, admin, 'SUPER_ADMIN', null);
    const noMfa = await mkUser(db, 'nomfa');
    await expect(grant(db, noMfa, 'EDITOR', admin)).rejects.toThrow(/requires confirmed MFA/);
    await grant(db, noMfa, 'REVIEWER', admin); // non-privileged is fine
    const withMfa = await mkUser(db, 'withmfa', { mfa: true });
    await grant(db, withMfa, 'EDITOR', admin);
    await expect(grant(db, withMfa, 'SUPER_ADMIN', withMfa)).rejects.toThrow(
      /user_roles_no_self_grant/,
    );
    await expect(db.query('DELETE FROM user_roles WHERE user_id = $1', [withMfa])).rejects.toThrow(
      /may not be deleted/,
    );
    // duplicate active grant refused
    await expect(grant(db, withMfa, 'EDITOR', admin)).rejects.toThrow(/duplicate key/);
    // audit rows were written automatically
    const a = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'ROLE_GRANT' AND object_id = $1`,
      [withMfa],
    );
    expect(Number(a.rows[0]?.n)).toBe(1);
  });
  it('no PII column exists on users', async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY column_name`,
    );
    const names = cols.rows.map((c) => c.column_name);
    for (const banned of [
      'email',
      'phone',
      'real_name',
      'full_name',
      'dob',
      'birth',
      'location',
      'photo',
      'avatar',
      'ip',
    ])
      expect(names.some((n) => n.includes(banned))).toBe(false);
  });
  it('anon_identities has no IP/device/fingerprint column and labels are Anon-######', async () => {
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'anon_identities'`,
    );
    expect(cols.rows.map((c) => c.column_name).sort()).toEqual([
      'claim_token_hash',
      'created_at',
      'id',
      'label',
    ]);
    await expect(
      db.query(`INSERT INTO anon_identities (label, claim_token_hash) VALUES ('Anon-12', '\\x01')`),
    ).rejects.toThrow(/check/i);
  });
});

describe('two-person decisions', () => {
  let admin: string,
    ed1: string,
    ed2: string,
    rev: string,
    bani: Awaited<ReturnType<typeof mkBani>>;
  let openSrc: string, closedSrc: string, unknownSrc: string, inactiveSrc: string;
  let openSnap: string, closedSnap: string, unknownSnap: string, inactiveSnap: string;
  beforeAll(async () => {
    admin = await mkUser(db, 'd-admin', { mfa: true });
    await grant(db, admin, 'SUPER_ADMIN', null);
    ed1 = await mkUser(db, 'd-ed1', { mfa: true });
    ed2 = await mkUser(db, 'd-ed2', { mfa: true });
    rev = await mkUser(db, 'd-rev');
    await grant(db, ed1, 'EDITOR', admin);
    await grant(db, ed2, 'EDITOR', admin);
    await grant(db, rev, 'REVIEWER', admin);
    bani = await mkBani(db, 'dec-bani');
    openSrc = await mkSource(db, 'open-src');
    closedSrc = await mkSource(db, 'closed-src', { redistribution: 'PROHIBITED' });
    unknownSrc = await mkSource(db, 'unknown-src', {
      status: 'PROPOSED',
      redistribution: 'UNKNOWN',
      license: null,
    });
    inactiveSrc = await mkSource(db, 'inactive-src', { status: 'SUSPENDED' });
    openSnap = await mkSnapshot(db, openSrc);
    closedSnap = await mkSnapshot(db, closedSrc);
    unknownSnap = await mkSnapshot(db, unknownSrc);
    inactiveSnap = await mkSnapshot(db, inactiveSrc);
  });
  it('the same account cannot be both approvers', async () => {
    await expect(
      mkDecision(db, {
        kind: 'SOURCE_ADOPTION',
        baniId: bani.baniId,
        a1: ed1,
        a1Role: 'EDITOR',
        a2: ed1,
        a2Role: 'EDITOR',
        snapshotId: openSnap,
      }),
    ).rejects.toThrow(/decisions_two_distinct_approvers/);
  });
  it('approver roles must be eligible and genuinely held at decision time', async () => {
    await expect(
      mkDecision(db, {
        kind: 'SOURCE_ADOPTION',
        baniId: bani.baniId,
        a1: ed1,
        a1Role: 'EDITOR',
        a2: rev,
        a2Role: 'REVIEWER',
        snapshotId: openSnap,
      }),
    ).rejects.toThrow(/decisions_eligible_roles/);
    // claims EDITOR but is only a REVIEWER
    await expect(
      mkDecision(db, {
        kind: 'SOURCE_ADOPTION',
        baniId: bani.baniId,
        a1: ed1,
        a1Role: 'EDITOR',
        a2: rev,
        a2Role: 'EDITOR',
        snapshotId: openSnap,
      }),
    ).rejects.toThrow(/did not hold role/);
    // role granted today cannot validate a decision dated yesterday
    await expect(
      mkDecision(db, {
        kind: 'SOURCE_ADOPTION',
        baniId: bani.baniId,
        a1: ed1,
        a1Role: 'EDITOR',
        a2: ed2,
        a2Role: 'EDITOR',
        snapshotId: openSnap,
        decidedAt: new Date(Date.now() - 86_400_000).toISOString(),
      }),
    ).rejects.toThrow(/did not hold role/);
  });
  it('adoption is refused from PROHIBITED, UNKNOWN or non-ACTIVE sources, and without a snapshot', async () => {
    const base = {
      kind: 'SOURCE_ADOPTION',
      baniId: bani.baniId,
      a1: ed1,
      a1Role: 'EDITOR',
      a2: ed2,
      a2Role: 'EDITOR',
    };
    await expect(mkDecision(db, { ...base, snapshotId: closedSnap })).rejects.toThrow(
      /redistribution status is PROHIBITED/,
    );
    await expect(mkDecision(db, { ...base, snapshotId: unknownSnap })).rejects.toThrow(
      /not ACTIVE/,
    );
    await expect(mkDecision(db, { ...base, snapshotId: inactiveSnap })).rejects.toThrow(
      /not ACTIVE/,
    );
    await expect(mkDecision(db, { ...base, snapshotId: null })).rejects.toThrow(
      /decisions_adoption_needs_snapshot/,
    );
  });
  it('UNLOCK requires two SUPER_ADMINs', async () => {
    await expect(
      mkDecision(db, {
        kind: 'UNLOCK',
        baniId: bani.baniId,
        a1: admin,
        a1Role: 'SUPER_ADMIN',
        a2: ed2,
        a2Role: 'EDITOR',
      }),
    ).rejects.toThrow(/decisions_unlock_needs_super_admin/);
  });
  it('a valid decision is immutable and auto-audited', async () => {
    const d = await mkDecision(db, {
      kind: 'SOURCE_ADOPTION',
      baniId: bani.baniId,
      a1: ed1,
      a1Role: 'EDITOR',
      a2: ed2,
      a2Role: 'EDITOR',
      snapshotId: openSnap,
    });
    await expect(
      db.query('UPDATE decisions SET rationale = $2 WHERE id = $1', [d, 'x']),
    ).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM decisions WHERE id = $1', [d])).rejects.toThrow(
      /append-only/,
    );
    const a = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE decision_id = $1`,
      [d],
    );
    expect(Number(a.rows[0]?.n)).toBe(1);
    await expect(db.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('accepted versions lifecycle', () => {
  let admin: string,
    ed1: string,
    ed2: string,
    openSrc: string,
    openSnap: string,
    closedSrc: string,
    closedSnap: string;
  beforeAll(async () => {
    admin = await mkUser(db, 'v-admin', { mfa: true });
    await grant(db, admin, 'SUPER_ADMIN', null);
    ed1 = await mkUser(db, 'v-ed1', { mfa: true });
    ed2 = await mkUser(db, 'v-ed2', { mfa: true });
    await grant(db, ed1, 'EDITOR', admin);
    await grant(db, ed2, 'EDITOR', admin);
    openSrc = await mkSource(db, 'v-open');
    openSnap = await mkSnapshot(db, openSrc);
    closedSrc = await mkSource(db, 'v-closed', { redistribution: 'PROHIBITED' });
    closedSnap = await mkSnapshot(db, closedSrc);
  });
  const decide = (
    baniId: string,
    kind = 'SOURCE_ADOPTION',
    snap: string | null = openSnap,
  ): Promise<string> =>
    mkDecision(db, {
      kind,
      baniId,
      a1: ed1,
      a1Role: 'EDITOR',
      a2: ed2,
      a2Role: 'EDITOR',
      snapshotId: snap,
    });

  it('cannot be inserted as PUBLISHED, published without a decision, with a wrong-kind decision, or empty', async () => {
    const b = await mkBani(db, 'lc-1');
    await expect(
      db.query(
        `INSERT INTO accepted_versions (bani_id, version_no, status, basis, basis_source_id, created_by) VALUES ($1, 0, 'PUBLISHED', 'SOURCE_ADOPTION', $2, $3)`,
        [b.baniId, openSrc, ed1],
      ),
    ).rejects.toThrow(/inserted as DRAFT/);
    const v = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: [],
    });
    await expect(
      db.query(`UPDATE accepted_versions SET status = 'PUBLISHED' WHERE id = $1`, [v]),
    ).rejects.toThrow(/requires a two-person decision/);
    const wrongKind = await decide(b.baniId, 'ROLLBACK', null);
    await expect(publish(db, v, wrongKind)).rejects.toThrow(/does not match version basis/);
    const other = await mkBani(db, 'lc-1b');
    const otherDecision = await decide(other.baniId);
    const v2 = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: [],
    });
    await expect(publish(db, v2, otherDecision)).rejects.toThrow(/different Bani/);
    const okDecision = await decide(b.baniId);
    const v3 = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: [],
    });
    await expect(publish(db, v3, okDecision)).rejects.toThrow(/no line texts/);
  });

  it('happy path: version numbers are assigned, the previous version is superseded, state becomes PROVISIONAL, texts freeze', async () => {
    const b = await mkBani(db, 'lc-2');
    const lines = b.lineIds.map((lineId, i) => ({ lineId, text: `ਸਤਿ ਨਾਮੁ ${i}` }));
    const v1 = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines,
    });
    expect((await statusOf(db, v1)).version_no).toBe(1);
    await publish(db, v1, await decide(b.baniId));
    expect((await statusOf(db, v1)).status).toBe('PUBLISHED');
    const st = await db.query<{ verification_state: string }>(
      'SELECT verification_state FROM banis WHERE id = $1',
      [b.baniId],
    );
    expect(st.rows[0]?.verification_state).toBe('PROVISIONAL');
    // frozen after leaving DRAFT
    const { blobId, layoutId } = await mkBlob(db, 'ਵਾਹਿਗੁਰੂ');
    await expect(
      db.query(
        `INSERT INTO accepted_line_texts (accepted_version_id, line_id, blob_id, layout_id) VALUES ($1,$2,$3,$4)`,
        [v1, b.lineIds[0], blobId, layoutId],
      ),
    ).rejects.toThrow(/frozen/);
    await expect(
      db.query('DELETE FROM accepted_line_texts WHERE accepted_version_id = $1', [v1]),
    ).rejects.toThrow(/frozen/);
    // layout must belong to the blob
    const v2 = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: [],
    });
    const other = await mkBlob(db, 'ਹਰਿ');
    await expect(
      db.query(
        `INSERT INTO accepted_line_texts (accepted_version_id, line_id, blob_id, layout_id) VALUES ($1,$2,$3,$4)`,
        [v2, b.lineIds[0], blobId, other.layoutId],
      ),
    ).rejects.toThrow(/does not belong to blob/);
    // second version supersedes the first; one PUBLISHED per bani
    const v3 = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: lines.map((l) => ({ ...l, text: l.text + ' ॥' })),
      previousVersionId: v1,
    });
    expect((await statusOf(db, v3)).version_no).toBe(3);
    await publish(db, v3, await decide(b.baniId));
    expect((await statusOf(db, v1)).status).toBe('SUPERSEDED');
    expect((await statusOf(db, v3)).status).toBe('PUBLISHED');
    // illegal transitions and deletes
    await expect(
      db.query(`UPDATE accepted_versions SET status = 'PUBLISHED' WHERE id = $1`, [v1]),
    ).rejects.toThrow(/illegal .* transition/);
    await expect(
      db.query(`UPDATE accepted_versions SET status = 'DRAFT' WHERE id = $1`, [v3]),
    ).rejects.toThrow(/illegal .* transition/);
    await expect(
      db.query(
        `UPDATE accepted_versions SET bani_id = bani_id + 0, created_by = $2 WHERE id = $1`,
        [v3, ed2],
      ),
    ).rejects.toThrow(/only status\/decision\/published_at/);
    await expect(db.query('DELETE FROM accepted_versions WHERE id = $1', [v1])).rejects.toThrow(
      /append-only/,
    );
    // rollback = new version; state becomes REVIEWED
    const v4 = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'ROLLBACK',
      createdBy: ed1,
      lines,
      previousVersionId: v3,
      rolledBackToId: v1,
    });
    await publish(db, v4, await decide(b.baniId, 'ROLLBACK', null));
    expect((await statusOf(db, v4)).status).toBe('PUBLISHED');
    expect((await statusOf(db, v3)).status).toBe('SUPERSEDED');
    const st2 = await db.query<{ verification_state: string; basis_source_id: unknown }>(
      'SELECT b.verification_state, v.basis_source_id FROM banis b JOIN accepted_versions v ON v.id = $2 WHERE b.id = $1',
      [b.baniId, v4],
    );
    expect(st2.rows[0]?.verification_state).toBe('REVIEWED');
    expect(String(st2.rows[0]?.basis_source_id)).toBe(openSrc); // lineage root inherited
    // history intact: 4 versions
    const n = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM accepted_versions WHERE bani_id = $1',
      [b.baniId],
    );
    expect(Number(n.rows[0]?.n)).toBe(4);
  });

  it('version_approvals: only eligible accounts, only DRAFTs, role captured by the database', async () => {
    const b = await mkBani(db, 'lc-3');
    const v = await mkDraft(db, {
      baniId: b.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: [{ lineId: b.lineIds[0] as string, text: 'ਸਤਿ' }],
    });
    const rev = await mkUser(db, 'v-rev');
    await grant(db, rev, 'REVIEWER', admin);
    await expect(
      db.query(
        `INSERT INTO version_approvals (accepted_version_id, user_id, role_at_time) VALUES ($1, $2, 'EDITOR')`,
        [v, rev],
      ),
    ).rejects.toThrow(/cannot approve/);
    // caller claims SUPER_ADMIN; database captures the real role
    await db.query(
      `INSERT INTO version_approvals (accepted_version_id, user_id, role_at_time) VALUES ($1, $2, 'SUPER_ADMIN')`,
      [v, ed1],
    );
    const got = await db.query<{ role_at_time: string }>(
      'SELECT role_at_time FROM version_approvals WHERE accepted_version_id = $1',
      [v],
    );
    expect(got.rows[0]?.role_at_time).toBe('EDITOR');
    await expect(
      db.query(
        `INSERT INTO version_approvals (accepted_version_id, user_id, role_at_time) VALUES ($1, $2, 'EDITOR')`,
        [v, ed1],
      ),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      db.query('DELETE FROM version_approvals WHERE accepted_version_id = $1', [v]),
    ).rejects.toThrow(/append-only/);
    await publish(db, v, await decide(b.baniId));
    await expect(
      db.query(
        `INSERT INTO version_approvals (accepted_version_id, user_id, role_at_time) VALUES ($1, $2, 'EDITOR')`,
        [v, ed2],
      ),
    ).rejects.toThrow(/only DRAFT versions/);
  });

  it('the public views expose only PUBLISHED text whose lineage source is redistributable', async () => {
    const good = await mkBani(db, 'pub-good');
    const gv = await mkDraft(db, {
      baniId: good.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: good.lineIds.map((lineId) => ({ lineId, text: 'ਗੁਰ ਪ੍ਰਸਾਦਿ' })),
    });
    await publish(db, gv, await decide(good.baniId));
    // a PROHIBITED source cannot be adopted at all (trigger), so simulate a lineage root that later became PROHIBITED
    const later = await mkSource(db, 'later-closed');
    const laterSnap = await mkSnapshot(db, later);
    const bad = await mkBani(db, 'pub-bad');
    const bv = await mkDraft(db, {
      baniId: bad.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: later,
      createdBy: ed1,
      lines: bad.lineIds.map((lineId) => ({ lineId, text: 'ਵਾਹਿਗੁਰੂ' })),
    });
    await publish(
      db,
      bv,
      await mkDecision(db, {
        kind: 'SOURCE_ADOPTION',
        baniId: bad.baniId,
        a1: ed1,
        a1Role: 'EDITOR',
        a2: ed2,
        a2Role: 'EDITOR',
        snapshotId: laterSnap,
      }),
    );
    await db.query(`UPDATE sources SET redistribution = 'PROHIBITED' WHERE id = $1`, [later]);
    void closedSnap;
    void closedSrc;

    const pub = withRole(db, 'kosh_public');
    const lines = await pub.query<{ bani_id: unknown; text: string }>(
      'SELECT bani_id, text FROM public_api.lines ORDER BY line_id',
    );
    expect(lines.rows.some((r) => String(r.bani_id) === good.baniId)).toBe(true);
    expect(lines.rows.some((r) => String(r.bani_id) === bad.baniId)).toBe(false);
    const banis = await pub.query<{
      id: unknown;
      text_available: boolean;
      verification_state: string;
    }>(
      'SELECT id, text_available, verification_state FROM public_api.banis WHERE id IN ($1, $2) ORDER BY id',
      [good.baniId, bad.baniId],
    );
    expect(banis.rows.find((r) => String(r.id) === good.baniId)?.text_available).toBe(true);
    expect(banis.rows.find((r) => String(r.id) === bad.baniId)?.text_available).toBe(false);
    // drafts never appear
    const draft = await mkDraft(db, {
      baniId: good.baniId,
      basis: 'SOURCE_ADOPTION',
      basisSourceId: openSrc,
      createdBy: ed1,
      lines: good.lineIds.map((lineId) => ({ lineId, text: 'DRAFT-ONLY-TEXT' })),
    });
    const vis = await pub.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public_api.versions WHERE id = $1',
      [draft],
    );
    expect(Number(vis.rows[0]?.n)).toBe(0);
    const draftText = await pub.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public_api.lines WHERE text = 'DRAFT-ONLY-TEXT'`,
    );
    expect(Number(draftText.rows[0]?.n)).toBe(0);
  });
});

describe('database role boundaries (defence in depth)', () => {
  it('kosh_public can read public views and nothing else, and cannot write anywhere', async () => {
    const pub = withRole(db, 'kosh_public');
    await pub.query('SELECT * FROM public_api.banis LIMIT 1');
    await pub.query('SELECT * FROM public_api.lines LIMIT 1');
    await pub.query('SELECT * FROM public_api.search_lines LIMIT 1');
    await pub.query('SELECT * FROM public_api.statistics');
    await expect(pub.query('SELECT * FROM users LIMIT 1')).rejects.toThrow(/permission denied/);
    await expect(pub.query('SELECT * FROM text_blobs LIMIT 1')).rejects.toThrow(
      /permission denied/,
    );
    await expect(pub.query('SELECT * FROM sessions LIMIT 1')).rejects.toThrow(/permission denied/);
    await expect(pub.query(`INSERT INTO corpora (slug, name) VALUES ('x','x')`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(pub.query(`UPDATE banis SET name = name`)).rejects.toThrow(/permission denied/);
    await expect(pub.query(`SELECT kosh.intern_text('x', 1)`)).rejects.toThrow(/permission denied/);
  });
  it('kosh_ingest can write the source layer but has nothing on accepted text, decisions or identity', async () => {
    const ing = withRole(db, 'kosh_ingest');
    const src = await mkSource(db, 'ing-src');
    const snap = await ing.query<{ id: unknown }>(
      `INSERT INTO source_snapshots (source_id, fetched_at, sha256, byte_size, storage_key) VALUES ($1, now(), sha256('zz'::bytea), 2, 'snapshots/x') RETURNING id`,
      [src],
    );
    const blob = await ing.query<{ id: unknown }>(`SELECT kosh.intern_text('ਸਤਿ', 2) AS id`);
    await ing.query(`INSERT INTO source_lines (snapshot_id, ordinal, blob_id) VALUES ($1, 0, $2)`, [
      String(snap.rows[0]?.id),
      String(blob.rows[0]?.id),
    ]);
    await ing.query(
      `INSERT INTO audit_log (actor_type, action, object_type) VALUES ('SYSTEM', 'TEST', 'test')`,
    );
    await expect(ing.query(`SELECT * FROM users LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(ing.query(`SELECT * FROM accepted_versions LIMIT 1`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(ing.query(`SELECT * FROM decisions LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(
      ing.query(
        `INSERT INTO accepted_versions (bani_id, version_no, basis, created_by) VALUES (1, 0, 'SOURCE_ADOPTION', 1)`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      ing.query(`INSERT INTO user_roles (user_id, role) VALUES (1, 'SUPER_ADMIN')`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      ing.query(`UPDATE sources SET redistribution = 'ALLOWED' WHERE id = $1`, [src]),
    ).rejects.toThrow(/permission denied/);
    await ing.query(`UPDATE sources SET last_checked_at = now() WHERE id = $1`, [src]); // narrow column grant
  });
  it('kosh_app has DML but no DDL and no TRUNCATE, and is still bound by every trigger', async () => {
    const app = withRole(db, 'kosh_app');
    await app.query(`SELECT * FROM users LIMIT 1`);
    await expect(app.query(`CREATE TABLE evil (id int)`)).rejects.toThrow(/permission denied/);
    await expect(app.query(`TRUNCATE audit_log`)).rejects.toThrow(/permission denied/);
    // no DELETE grant at all on corpus tables (denied before any trigger runs)
    await expect(app.query(`DELETE FROM text_blobs`)).rejects.toThrow(/permission denied/);
    await expect(app.query(`DELETE FROM audit_log`)).rejects.toThrow(/permission denied/);
    // UPDATE is granted, so the append-only trigger is what stops it
    await expect(app.query(`UPDATE text_blobs SET raw_text = raw_text`)).rejects.toThrow(
      /append-only/,
    );
    await expect(app.query(`UPDATE audit_log SET reason = reason`)).rejects.toThrow(/append-only/);
  });
});

describe('migration runner', () => {
  it('refuses to run when an applied migration has been edited', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kosh-mig-'));
    for (const f of readdirSync(MIGRATIONS_DIR))
      copyFileSync(join(MIGRATIONS_DIR, f), join(dir, f));
    const fresh = await openPglite('memory');
    try {
      await migrate(fresh, dir, 'up', { log: () => undefined });
      const first = readdirSync(dir).find((f) => f.endsWith('.up.sql')) as string;
      writeFileSync(join(dir, first), readFileSync(join(dir, first), 'utf8') + '\n-- tampered\n');
      await expect(migrate(fresh, dir, 'status', { log: () => undefined })).rejects.toThrow(
        /modified after being applied/,
      );
    } finally {
      await fresh.close();
    }
  });
  it('is reversible: up, down --all, up leaves the same set of public tables', async () => {
    const fresh = await openPglite('memory');
    try {
      const count = async (): Promise<number> =>
        Number(
          (
            await fresh.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`,
            )
          ).rows[0]?.n,
        );
      await migrate(fresh, MIGRATIONS_DIR, 'up', { log: () => undefined });
      const after = await count();
      await migrate(fresh, MIGRATIONS_DIR, 'down', { all: true, log: () => undefined });
      expect(await count()).toBe(1); // schema_migrations only
      await migrate(fresh, MIGRATIONS_DIR, 'up', { log: () => undefined });
      expect(await count()).toBe(after);
    } finally {
      await fresh.close();
    }
  });
});

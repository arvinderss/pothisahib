/**
 * End-to-end corpus workflow on a real database:
 *   register source -> ingest snapshot -> parse -> bootstrap structure -> adoption draft
 *   -> two independent approvals -> decision -> publish -> public view -> rollback.
 * Every hop asserts byte identity of the synthetic Gurmukhi fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { withRole } from '@pothisahib/db';
import {
  approveVersion,
  bootstrapStructureFromDocument,
  createAdoptionDraft,
  createRollbackDraft,
  ensureBani,
  ensureCorpus,
  ensureGranth,
  getBani,
  getDocumentLines,
  getVersionLines,
  ingestSnapshot,
  listVersions,
  parseSnapshot,
  publishVersion,
  registerSource,
  updateSource,
  type AcceptedVersion,
} from '../src/index.ts';
import { createWorld, koshSourceDocument, SAMPLE_LINES, type TestWorld } from '../src/testing.ts';

const sha = (s: string): string =>
  createHash('sha256').update(new TextEncoder().encode(s)).digest('hex');

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

describe('source registry and ingestion', () => {
  it('registers a source, refuses ingestion until ACTIVE with a licence, then hashes and stores the artefact', async () => {
    const src = await registerSource(
      w.db,
      {
        slug: 'test-open',
        name: 'Synthetic open source',
        sourceType: 'DATABASE',
        url: 'https://example.invalid/open',
      },
      w.editorA,
    );
    expect(src.status).toBe('PROPOSED');
    const bytes = koshSourceDocument('doc-1', SAMPLE_LINES);
    await expect(
      ingestSnapshot(w.ctx, { sourceSlug: 'test-open', bytes }, w.editorA),
    ).rejects.toThrow(/PROPOSED/);
    await expect(updateSource(w.db, 'test-open', { status: 'ACTIVE' }, w.editorA)).rejects.toThrow(
      /sources_active_requires_license/,
    );
    await updateSource(
      w.db,
      'test-open',
      { license: 'CC0-1.0', redistribution: 'ALLOWED', status: 'ACTIVE' },
      w.editorA,
      'licence reviewed',
    );

    const r1 = await ingestSnapshot(
      w.ctx,
      { sourceSlug: 'test-open', bytes, sourceVersion: 'v1' },
      w.editorA,
    );
    expect(r1.duplicate).toBe(false);
    expect(r1.snapshot.sha256Hex).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(r1.snapshot.byteSize).toBe(bytes.length);
    const stored = await w.ctx.store.get(r1.snapshot.storageKey);
    expect(Buffer.from(stored).equals(Buffer.from(bytes))).toBe(true);
    const r2 = await ingestSnapshot(w.ctx, { sourceSlug: 'test-open', bytes }, w.editorA);
    expect(r2.duplicate).toBe(true);
    expect(r2.snapshot.id).toBe(r1.snapshot.id);
  });
});

describe('parse -> structure -> adoption -> approvals -> publish', () => {
  let snapshotId: string;
  let documentId: string;
  let draft: AcceptedVersion;

  it('parses the snapshot into immutable source lines, byte-exact, with layouts and normalisations', async () => {
    const snaps = await w.db.query<{ id: unknown }>(
      `SELECT id FROM source_snapshots ORDER BY id LIMIT 1`,
    );
    snapshotId = String(snaps.rows[0]?.id);
    const res = await parseSnapshot(w.ctx, { snapshotId, format: 'kosh-source-v1' }, w.editorA);
    expect(res.documents).toHaveLength(1);
    expect(res.lineCount).toBe(SAMPLE_LINES.length);
    documentId = (res.documents[0] as { id: string }).id;
    const lines = await getDocumentLines(w.db, documentId);
    expect(lines.map((l) => l.text)).toEqual(SAMPLE_LINES);
    lines.forEach((l, i) => expect(l.sha256Hex).toBe(sha(SAMPLE_LINES[i] as string)));
    expect(lines.every((l) => l.layoutId !== null)).toBe(true);
    const norms = await w.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM source_normalizations',
    );
    expect(Number(norms.rows[0]?.n)).toBe(SAMPLE_LINES.length * 2);
    await expect(
      parseSnapshot(w.ctx, { snapshotId, format: 'kosh-source-v1' }, w.editorA),
    ).rejects.toThrow(/already been parsed/);
  });

  it('bootstraps the structural spine from the document segmentation', async () => {
    await ensureCorpus(w.db, 'test-corpus', 'Test corpus');
    await ensureGranth(w.db, 'test-corpus', 'test-granth', 'Test granth');
    await ensureBani(
      w.db,
      {
        granthSlug: 'test-granth',
        slug: 'test-bani',
        name: 'Synthetic test bani',
        aliases: ['Test Bani'],
      },
      w.editorA,
    );
    const r = await bootstrapStructureFromDocument(
      w.db,
      { baniSlug: 'test-bani', documentId },
      w.editorA,
    );
    expect(r.lines).toBe(SAMPLE_LINES.length);
    expect(r.sections).toBe(3); // PAURI 1, PAURI 2, PAURI 2 > SALOK
    expect(r.bani.structureBasisSnapshotId).toBe(snapshotId);
    await expect(
      bootstrapStructureFromDocument(w.db, { baniSlug: 'test-bani', documentId }, w.editorA),
    ).rejects.toThrow(/already has structure/);
  });

  it('creates an adoption draft whose line texts are the source blobs themselves', async () => {
    draft = await createAdoptionDraft(
      w.db,
      { baniSlug: 'test-bani', documentId, rationale: 'Adopt synthetic source for testing' },
      w.editorA,
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.basis).toBe('SOURCE_ADOPTION');
    expect(draft.versionNo).toBe(1);
    const lines = await getVersionLines(w.db, draft.id);
    expect(lines.map((l) => l.text)).toEqual(SAMPLE_LINES);
    expect(lines.every((l) => l.derivedFromSourceLineId !== null)).toBe(true);
    const bani = await getBani(w.db, 'test-bani');
    expect(bani?.verificationState).toBe('SOURCE_ONLY');
  });

  it('requires two DISTINCT eligible approvals; a reviewer cannot approve; nothing publishes early', async () => {
    await expect(publishVersion(w.db, { versionId: draft.id }, w.editorA)).rejects.toThrow(
      /two independent approvals/,
    );
    await expect(approveVersion(w.db, { versionId: draft.id }, w.reviewer)).rejects.toThrow(
      /cannot approve/,
    );
    await expect(approveVersion(w.db, { versionId: draft.id }, w.user)).rejects.toThrow(
      /cannot approve/,
    );
    const one = await approveVersion(
      w.db,
      { versionId: draft.id, notes: 'looks right' },
      w.editorA,
    );
    expect(one.approvals).toHaveLength(1);
    expect(one.decisionId).toBeNull();
    await expect(approveVersion(w.db, { versionId: draft.id }, w.editorA)).rejects.toThrow(
      /already approved/,
    );
    await expect(publishVersion(w.db, { versionId: draft.id }, w.editorA)).rejects.toThrow(
      /two independent approvals/,
    );
    const two = await approveVersion(w.db, { versionId: draft.id }, w.editorB);
    expect(two.approvals.map((a) => a.username).sort()).toEqual(['editor-a', 'editor-b']);
    expect(two.decisionId).not.toBeNull();
    expect(two.status).toBe('DRAFT'); // decision exists; commit is explicit
  });

  it('publishes explicitly (Editor only), moves the Bani to PROVISIONAL, and the public role sees byte-exact text', async () => {
    await expect(publishVersion(w.db, { versionId: draft.id }, w.reviewer)).rejects.toThrow(
      /only an Editor or Super Admin/,
    );
    const pub = await publishVersion(w.db, { versionId: draft.id }, w.editorB);
    expect(pub.status).toBe('PUBLISHED');
    expect(pub.publishedAt).not.toBeNull();
    expect((await getBani(w.db, 'test-bani'))?.verificationState).toBe('PROVISIONAL');

    const publicDb = withRole(w.db, 'kosh_public');
    const rows = await publicDb.query<{ text: string; text_sha256_hex: string; ordinal: number }>(
      'SELECT text, text_sha256_hex, ordinal FROM public_api.lines WHERE bani_id = $1 ORDER BY ordinal',
      [pub.baniId],
    );
    expect(rows.rows.map((r) => r.text)).toEqual(SAMPLE_LINES);
    rows.rows.forEach((r) => expect(r.text_sha256_hex).toBe(sha(r.text)));
    const search = await publicDb.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public_api.search_lines WHERE bani_id = $1`,
      [pub.baniId],
    );
    expect(Number(search.rows[0]?.n)).toBe(SAMPLE_LINES.length);
    // audit trail exists for every step
    const audit = await w.db.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit_log ORDER BY action`,
    );
    const actions = audit.rows.map((a) => a.action);
    for (const a of [
      'SOURCE_REGISTER',
      'SNAPSHOT_INGEST',
      'SNAPSHOT_PARSE',
      'STRUCTURE_BOOTSTRAP',
      'VERSION_DRAFT_ADOPTION',
      'VERSION_APPROVE',
      'DECISION_SOURCE_ADOPTION',
      'VERSION_PUBLISH',
    ])
      expect(actions).toContain(a);
  });

  it('adoption from a non-redistributable source is refused before any decision exists', async () => {
    await registerSource(
      w.db,
      {
        slug: 'test-closed',
        name: 'Synthetic closed source',
        sourceType: 'WEBSITE',
        license: 'All rights reserved',
        redistribution: 'PROHIBITED',
        status: 'ACTIVE',
      },
      w.editorA,
    );
    const bytes = koshSourceDocument('doc-closed', SAMPLE_LINES);
    const r = await ingestSnapshot(w.ctx, { sourceSlug: 'test-closed', bytes }, w.editorA);
    const p = await parseSnapshot(
      w.ctx,
      { snapshotId: r.snapshot.id, format: 'kosh-source-v1' },
      w.editorA,
    );
    await expect(
      createAdoptionDraft(
        w.db,
        {
          baniSlug: 'test-bani',
          documentId: (p.documents[0] as { id: string }).id,
          rationale: 'should fail',
        },
        w.editorA,
      ),
    ).rejects.toThrow(/PROHIBITED/);
  });

  it('a second adoption supersedes the first; rollback creates a NEW version with the old texts and keeps all history', async () => {
    const changed = SAMPLE_LINES.map((s, i) => (i === 0 ? s + ' ॥' : s));
    const bytes = koshSourceDocument('doc-2', changed);
    const r = await ingestSnapshot(
      w.ctx,
      { sourceSlug: 'test-open', bytes, sourceVersion: 'v2' },
      w.editorA,
    );
    const p = await parseSnapshot(
      w.ctx,
      { snapshotId: r.snapshot.id, format: 'kosh-source-v1' },
      w.editorA,
    );
    const d2 = await createAdoptionDraft(
      w.db,
      {
        baniSlug: 'test-bani',
        documentId: (p.documents[0] as { id: string }).id,
        rationale: 'Adopt v2',
      },
      w.editorB,
    );
    expect(d2.versionNo).toBe(2);
    expect(d2.previousVersionId).toBe(draft.id);
    await approveVersion(w.db, { versionId: d2.id }, w.editorB);
    await approveVersion(w.db, { versionId: d2.id }, w.superAdmin);
    const v2 = await publishVersion(w.db, { versionId: d2.id }, w.superAdmin);
    expect(v2.status).toBe('PUBLISHED');
    expect((await getVersionLines(w.db, v2.id)).map((l) => l.text)).toEqual(changed);

    const rb = await createRollbackDraft(
      w.db,
      {
        baniSlug: 'test-bani',
        targetVersionId: draft.id,
        rationale: 'v2 introduced a stray danda',
      },
      w.editorA,
    );
    expect(rb.basis).toBe('ROLLBACK');
    expect(rb.rolledBackToId).toBe(draft.id);
    expect(rb.versionNo).toBe(3);
    await approveVersion(w.db, { versionId: rb.id }, w.editorA);
    await approveVersion(w.db, { versionId: rb.id }, w.editorB);
    const v3 = await publishVersion(w.db, { versionId: rb.id }, w.editorA);
    expect(v3.status).toBe('PUBLISHED');
    expect((await getVersionLines(w.db, v3.id)).map((l) => l.text)).toEqual(SAMPLE_LINES);

    const all = await listVersions(w.db, v3.baniId);
    expect(all.map((v) => [v.versionNo, v.status])).toEqual([
      [1, 'SUPERSEDED'],
      [2, 'SUPERSEDED'],
      [3, 'PUBLISHED'],
    ]);
    expect((await getBani(w.db, 'test-bani'))?.verificationState).toBe('REVIEWED');
    // history is intact: the superseded texts are still readable
    expect((await getVersionLines(w.db, v2.id)).map((l) => l.text)).toEqual(changed);
  });
});

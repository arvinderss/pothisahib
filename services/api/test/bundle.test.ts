/**
 * Offline bundle and version-history endpoints: integrity fields verify, ETag/304 works, superseded
 * versions remain readable, drafts never appear.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { bundleHashInput, isBundleShape, type Bundle } from '@pothisahib/domain';
import {
  approveVersion,
  bootstrapStructureFromDocument,
  createAdoptionDraft,
  ensureBani,
  ensureCorpus,
  ensureGranth,
  ingestSnapshot,
  parseSnapshot,
  publishVersion,
  registerSource,
} from '@pothisahib/kosh-core';
import { koshSourceDocument, SAMPLE_LINES } from '@pothisahib/kosh-core/testing';
import { createApps, type Apps } from './helpers.ts';

let A: Apps;
const sha = (s: string): string =>
  createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

async function publishAdoption(
  docLines: string[],
  locator: string,
  rationale: string,
): Promise<void> {
  const db = A.w.db;
  const r = await ingestSnapshot(
    A.w.ctx,
    { sourceSlug: 'b-src', bytes: koshSourceDocument(locator, docLines) },
    A.w.editorA,
  );
  const p = await parseSnapshot(
    A.w.ctx,
    { snapshotId: r.snapshot.id, format: 'kosh-source-v1' },
    A.w.editorA,
  );
  const documentId = (p.documents[0] as { id: string }).id;
  const existing = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM lines WHERE bani_id = (SELECT id FROM banis WHERE slug = 'b-bani')`,
  );
  if (Number(existing.rows[0]?.n) === 0)
    await bootstrapStructureFromDocument(db, { baniSlug: 'b-bani', documentId }, A.w.editorA);
  const d = await createAdoptionDraft(
    db,
    { baniSlug: 'b-bani', documentId, rationale },
    A.w.editorA,
  );
  await approveVersion(db, { versionId: d.id }, A.w.editorA);
  await approveVersion(db, { versionId: d.id }, A.w.editorB);
  await publishVersion(db, { versionId: d.id }, A.w.editorB);
}

beforeAll(async () => {
  A = await createApps();
  await registerSource(
    A.w.db,
    {
      slug: 'b-src',
      name: 'Bundle synthetic source',
      sourceType: 'DATABASE',
      license: 'CC0-1.0',
      redistribution: 'ALLOWED',
      status: 'ACTIVE',
      attributionText: 'Synthetic test source',
    },
    A.w.editorA,
  );
  await ensureCorpus(A.w.db, 'b-corpus', 'Bundle corpus');
  await ensureGranth(A.w.db, 'b-corpus', 'b-granth', 'Bundle granth');
  await ensureBani(
    A.w.db,
    { granthSlug: 'b-granth', slug: 'b-bani', name: 'Bundle synthetic bani' },
    A.w.editorA,
  );
});
afterAll(async () => {
  await A.close();
});

describe('offline bundle', () => {
  it('404s before anything is published', async () => {
    const r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/b-bani/bundle' });
    expect(r.statusCode).toBe(404);
  });

  it('returns a verifiable kosh-bundle/1 with lineage source, sections and offsets; ETag round-trips as 304', async () => {
    await publishAdoption(SAMPLE_LINES, 'doc-v1', 'Adopt v1');
    const r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/b-bani/bundle' });
    expect(r.statusCode).toBe(200);
    const b = r.json() as Bundle;
    expect(isBundleShape(b)).toBe(true);
    expect(b.versionNo).toBe(1);
    expect(b.bani.verificationState).toBe('PROVISIONAL');
    expect(b.source?.slug).toBe('b-src');
    expect(b.source?.attributionText).toBe('Synthetic test source');
    expect(b.sections.length).toBe(3);
    expect(b.lines.map((l) => l.text)).toEqual(SAMPLE_LINES);
    for (const l of b.lines) {
      expect(l.sha256).toBe(sha(l.text));
      expect(l.codepointCount).toBe([...l.text].length);
      for (const [s, e] of l.tokens) expect(e).toBeGreaterThan(s);
    }
    expect(b.bundleSha256).toBe(sha(bundleHashInput(b.lines.map((l) => l.sha256))));
    const etag = r.headers['etag'] as string;
    expect(etag).toMatch(/^"v1-[0-9a-f]{16}"$/);
    const again = await A.publicApp.inject({
      method: 'GET',
      url: '/api/v1/banis/b-bani/bundle',
      headers: { 'if-none-match': etag },
    });
    expect(again.statusCode).toBe(304);
  });

  it('a new published version changes the ETag and bundle hash; the old version stays readable in history', async () => {
    const changed = SAMPLE_LINES.map((s, i) => (i === 1 ? s + ' ॥' : s));
    await publishAdoption(changed, 'doc-v2', 'Adopt v2');
    const r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/b-bani/bundle' });
    const b = r.json() as Bundle;
    expect(b.versionNo).toBe(2);
    expect(b.lines.map((l) => l.text)).toEqual(changed);
    expect(r.headers['etag']).toMatch(/^"v2-/);

    const v1 = await A.publicApp.inject({
      method: 'GET',
      url: '/api/v1/banis/b-bani/versions/1/lines',
    });
    expect(v1.statusCode).toBe(200);
    const h = v1.json() as {
      status: string;
      lines: { text: string; sha256: string; tokens: [number, number][] }[];
    };
    expect(h.status).toBe('SUPERSEDED');
    expect(h.lines.map((l) => l.text)).toEqual(SAMPLE_LINES);
    expect(h.lines.every((l) => l.tokens.length > 0 || l.text.trim() === '')).toBe(true);
    const v2 = await A.publicApp.inject({
      method: 'GET',
      url: '/api/v1/banis/b-bani/versions/2/lines',
    });
    expect((v2.json() as { status: string }).status).toBe('PUBLISHED');
    expect(
      (await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/b-bani/versions/9/lines' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/b-bani/versions/x/lines' }))
        .statusCode,
    ).toBe(400);
  });

  it('drafts are invisible in version history', async () => {
    const d = await createAdoptionDraft(
      A.w.db,
      {
        baniSlug: 'b-bani',
        documentId: (
          await A.w.db.query<{ id: unknown }>('SELECT id FROM source_documents ORDER BY id LIMIT 1')
        ).rows[0]?.id as string,
        rationale: 'draft only',
      },
      A.w.editorA,
    );
    const r = await A.publicApp.inject({
      method: 'GET',
      url: `/api/v1/banis/b-bani/versions/${d.versionNo}/lines`,
    });
    expect(r.statusCode).toBe(404);
  });
});

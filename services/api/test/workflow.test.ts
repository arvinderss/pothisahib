/**
 * The full Milestone-1 workflow over HTTP, ending with the Unicode round-trip assertion:
 * fixture bytes -> admin API (base64) -> object store -> parse -> adopt -> 2 approvals -> publish
 * -> public API JSON -> byte-identical text.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { koshSourceDocument, SAMPLE_LINES } from '@pothisahib/kosh-core/testing';
import { auth, createApps, type Apps } from './helpers.ts';

let A: Apps;
let tokA: string;
let tokB: string;
let snapshotId: string;
let documentId: string;
let versionId: string;

beforeAll(async () => {
  A = await createApps();
  tokA = await A.loginAs(A.w.editorA);
  tokB = await A.loginAs(A.w.editorB);
});
afterAll(async () => {
  await A.close();
});

const sha = (s: string): string =>
  createHash('sha256').update(new TextEncoder().encode(s)).digest('hex');

describe('admin workflow over HTTP', () => {
  it('registers and activates a source with its licence', async () => {
    let r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources',
      headers: auth(tokA),
      payload: {
        slug: 'http-src',
        name: 'HTTP synthetic source',
        sourceType: 'DATABASE',
        url: 'https://example.invalid/x',
      },
    });
    expect(r.statusCode).toBe(201);
    r = await A.adminApp.inject({
      method: 'PATCH',
      url: '/admin/v1/sources/http-src',
      headers: auth(tokA),
      payload: { status: 'ACTIVE' },
    });
    expect(r.statusCode).toBe(409); // licence missing: refused by the database CHECK
    r = await A.adminApp.inject({
      method: 'PATCH',
      url: '/admin/v1/sources/http-src',
      headers: auth(tokA),
      payload: {
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        redistribution: 'ALLOWED',
        status: 'ACTIVE',
        reason: 'licence reviewed',
      },
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { status: string }).status).toBe('ACTIVE');
  });

  it('ingests an artefact (base64), stores it hashed, and detects the duplicate', async () => {
    const bytes = koshSourceDocument('http-doc', SAMPLE_LINES);
    const payload = { contentBase64: Buffer.from(bytes).toString('base64'), sourceVersion: 'v1' };
    let r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources/http-src/snapshots',
      headers: auth(tokA),
      payload,
    });
    expect(r.statusCode).toBe(201);
    const body = r.json() as {
      snapshot: { id: string; sha256Hex: string; byteSize: number };
      duplicate: boolean;
    };
    expect(body.snapshot.sha256Hex).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(body.snapshot.byteSize).toBe(bytes.length);
    snapshotId = body.snapshot.id;
    r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources/http-src/snapshots',
      headers: auth(tokA),
      payload,
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { duplicate: boolean }).duplicate).toBe(true);
    r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources/http-src/snapshots',
      headers: auth(tokA),
      payload: { contentBase64: '!!!!' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('parses, bootstraps structure and creates an adoption draft', async () => {
    let r = await A.adminApp.inject({
      method: 'POST',
      url: `/admin/v1/snapshots/${snapshotId}/parse`,
      headers: auth(tokA),
      payload: { format: 'kosh-source-v1' },
    });
    expect(r.statusCode).toBe(200);
    documentId = (r.json() as { documents: { id: string }[] }).documents[0]?.id as string;
    r = await A.adminApp.inject({
      method: 'GET',
      url: `/admin/v1/documents/${documentId}/lines`,
      headers: auth(tokA),
    });
    expect((r.json() as { items: { text: string }[] }).items.map((l) => l.text)).toEqual(
      SAMPLE_LINES,
    );

    for (const [url, payload] of [
      ['/admin/v1/corpus/corpora', { slug: 'http-corpus', name: 'HTTP corpus' }],
      [
        '/admin/v1/corpus/granths',
        { corpusSlug: 'http-corpus', slug: 'http-granth', name: 'HTTP granth' },
      ],
      [
        '/admin/v1/corpus/banis',
        {
          granthSlug: 'http-granth',
          slug: 'http-bani',
          name: 'HTTP synthetic bani',
          aliases: ['Synthetic'],
        },
      ],
    ] as const) {
      r = await A.adminApp.inject({ method: 'POST', url, headers: auth(tokA), payload });
      expect(r.statusCode).toBe(201);
    }
    r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/banis/http-bani/structure/bootstrap',
      headers: auth(tokA),
      payload: { documentId },
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { lines: number }).lines).toBe(SAMPLE_LINES.length);
    r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/banis/http-bani/versions/adopt',
      headers: auth(tokA),
      payload: { documentId, rationale: 'Adopt synthetic source over HTTP' },
    });
    expect(r.statusCode).toBe(201);
    versionId = (r.json() as { id: string }).id;
  });

  it('the public API shows the Bani as SOURCE_ONLY with no text before publication', async () => {
    const r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/http-bani/lines' });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      textAvailable: boolean;
      lines: unknown[];
      bani: { verificationState: string };
    };
    expect(body.textAvailable).toBe(false);
    expect(body.lines).toEqual([]);
    expect(body.bani.verificationState).toBe('SOURCE_ONLY');
  });

  it('needs two distinct approvers; publish is an explicit commit', async () => {
    let r = await A.adminApp.inject({
      method: 'POST',
      url: `/admin/v1/versions/${versionId}/publish`,
      headers: auth(tokA),
    });
    expect(r.statusCode).toBe(409);
    r = await A.adminApp.inject({
      method: 'POST',
      url: `/admin/v1/versions/${versionId}/approve`,
      headers: auth(tokA),
      payload: { notes: 'ok' },
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { decisionId: string | null }).decisionId).toBeNull();
    r = await A.adminApp.inject({
      method: 'POST',
      url: `/admin/v1/versions/${versionId}/approve`,
      headers: auth(tokA),
    });
    expect(r.statusCode).toBe(409);
    r = await A.adminApp.inject({
      method: 'POST',
      url: `/admin/v1/versions/${versionId}/approve`,
      headers: auth(tokB),
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { decisionId: string | null }).decisionId).not.toBeNull();
    r = await A.adminApp.inject({
      method: 'POST',
      url: `/admin/v1/versions/${versionId}/publish`,
      headers: auth(tokB),
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { status: string }).status).toBe('PUBLISHED');
  });

  it('UNICODE ROUND TRIP: the public API returns every fixture byte-for-byte, with token offsets that slice back exactly', async () => {
    const r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/http-bani/lines' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.headers['cache-control']).toMatch(/public/);
    const body = r.json() as {
      textAvailable: boolean;
      versionNo: number;
      bani: { verificationState: string };
      lines: { text: string; sha256: string; tokens: [number, number][]; codepointCount: number }[];
    };
    expect(body.textAvailable).toBe(true);
    expect(body.versionNo).toBe(1);
    expect(body.bani.verificationState).toBe('PROVISIONAL');
    expect(body.lines.map((l) => l.text)).toEqual(SAMPLE_LINES);
    for (const [i, l] of body.lines.entries()) {
      const original = SAMPLE_LINES[i] as string;
      expect(Buffer.from(l.text, 'utf8').equals(Buffer.from(original, 'utf8'))).toBe(true);
      expect(l.sha256).toBe(sha(original));
      expect(l.codepointCount).toBe([...original].length);
      const cps = [...l.text];
      for (const [s, e] of l.tokens)
        expect(cps.slice(s, e).join('').trim().length).toBeGreaterThan(0);
      // Larivaar view = tokens joined; rebuilding tokens + gaps reproduces the original
      let rebuilt = '';
      let pos = 0;
      for (const [s, e] of l.tokens) {
        rebuilt += cps.slice(pos, s).join('') + cps.slice(s, e).join('');
        pos = e;
      }
      rebuilt += cps.slice(pos).join('');
      expect(rebuilt).toBe(original);
    }
  });

  it('public metadata endpoints: bani, sections, versions, sources, snapshots, statistics, search', async () => {
    let r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis' });
    expect(
      (r.json() as { items: { slug: string }[] }).items.some((b) => b.slug === 'http-bani'),
    ).toBe(true);
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/http-bani' });
    expect((r.json() as { sections: unknown[] }).sections.length).toBe(3);
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/http-bani/versions' });
    const versions = (
      r.json() as {
        versions: { versionNo: number; status: string; decision: { kind: string } | null }[];
      }
    ).versions;
    expect(versions).toHaveLength(1);
    expect(versions[0]?.status).toBe('PUBLISHED');
    expect(versions[0]?.decision?.kind).toBe('SOURCE_ADOPTION');
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/sources' });
    const srcs = (
      r.json() as { items: { slug: string; license: string; redistribution: string }[] }
    ).items;
    expect(srcs.find((s) => s.slug === 'http-src')?.redistribution).toBe('ALLOWED');
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/sources/http-src/snapshots' });
    expect((r.json() as { items: { sha256: string }[] }).items[0]?.sha256).toHaveLength(64);
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/statistics' });
    expect((r.json() as { banis: number }).banis).toBeGreaterThan(0);
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis/does-not-exist/lines' });
    expect(r.statusCode).toBe(404);

    // exact text search
    const needle = SAMPLE_LINES.find((s) => s.length > 3) as string;
    r = await A.publicApp.inject({
      method: 'GET',
      url: `/api/v1/search?q=${encodeURIComponent(needle)}`,
    });
    expect(r.statusCode).toBe(200);
    const hits = (
      r.json() as { items: { text: string; match: { cpStart: number; cpEnd: number } | null }[] }
    ).items;
    expect(hits.some((h) => h.text === needle)).toBe(true);
    const hit = hits.find((h) => h.text === needle) as {
      text: string;
      match: { cpStart: number; cpEnd: number };
    };
    expect([...hit.text].slice(hit.match.cpStart, hit.match.cpEnd).join('')).toBe(needle);
    // first-letter search (ਸਤਿ ਨਾਮੁ -> ਸਨ)
    r = await A.publicApp.inject({
      method: 'GET',
      url: `/api/v1/search?first_letters=${encodeURIComponent('ਸਨ')}`,
    });
    expect(r.statusCode).toBe(200);
    const flHits = (r.json() as { items: { text: string; firstLetterKey: string }[] }).items;
    expect(flHits.length).toBeGreaterThan(0);
    // every hit must genuinely contain the letter SEQUENCE, not merely start with the first letter
    for (const h of flHits) expect(h.firstLetterKey).toContain('ਸਨ');
    expect(flHits.some((h) => h.text === 'ਸਤਿ ਨਾਮੁ')).toBe(true);
    r = await A.publicApp.inject({
      method: 'GET',
      url: `/api/v1/search?first_letters=${encodeURIComponent('ਸਪ')}`,
    });
    for (const h of (r.json() as { items: { firstLetterKey: string }[] }).items)
      expect(h.firstLetterKey).toContain('ਸਪ');
    r = await A.publicApp.inject({
      method: 'GET',
      url: `/api/v1/search?first_letters=${encodeURIComponent('॥')}`,
    });
    expect(r.statusCode).toBe(400);
    r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/search' });
    expect(r.statusCode).toBe(400);
  });

  it('OpenAPI documents are served for both services', async () => {
    const pub = await A.publicApp.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(pub.statusCode).toBe(200);
    const doc = pub.json() as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(doc.openapi.startsWith('3.')).toBe(true);
    expect(Object.keys(doc.paths)).toContain('/api/v1/banis/{slug}/lines');
    const adm = await A.adminApp.inject({ method: 'GET', url: '/admin/v1/openapi.json' });
    expect(adm.statusCode).toBe(200);
    expect(Object.keys((adm.json() as { paths: object }).paths)).toContain(
      '/admin/v1/versions/{id}/publish',
    );
  });

  it('audit log is readable by reviewers and records every step with the acting username', async () => {
    const tokR = await A.loginAs(A.w.reviewer);
    const r = await A.adminApp.inject({
      method: 'GET',
      url: '/admin/v1/audit?limit=200',
      headers: auth(tokR),
    });
    expect(r.statusCode).toBe(200);
    const items = (r.json() as { items: { action: string; actorUsername: string | null }[] }).items;
    const actions = new Set(items.map((i) => i.action));
    for (const a of [
      'SOURCE_REGISTER',
      'SOURCE_UPDATE',
      'SNAPSHOT_INGEST',
      'SNAPSHOT_PARSE',
      'STRUCTURE_BOOTSTRAP',
      'VERSION_DRAFT_ADOPTION',
      'VERSION_APPROVE',
      'DECISION_SOURCE_ADOPTION',
      'VERSION_PUBLISH',
      'LOGIN',
    ])
      expect(actions.has(a)).toBe(true);
    expect(items.find((i) => i.action === 'VERSION_PUBLISH')?.actorUsername).toBe('editor-b');
  });
});

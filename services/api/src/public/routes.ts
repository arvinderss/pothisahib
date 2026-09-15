import type { Db } from '@pothisahib/db';
import { isSlug } from '@pothisahib/domain';
import {
  firstLetterKey,
  fromCodepoints,
  // firstLetterKey is used for the per-line key of hits (see below); the query itself is a letter sequence.
  isLetter,
  normalizeEncoding,
  normalizeForComparison,
  toCodepoints,
} from '@pothisahib/gurmukhi';
import { iso, NotFoundError, SEARCH_KEY_VERSION, str } from '@pothisahib/kosh-core';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ERROR_SCHEMA } from '../common.ts';

interface Opts extends FastifyPluginOptions {
  db: Db;
}

const TAG_CORPUS = 'corpus';
const TAG_SOURCES = 'sources';

const baniSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    slug: { type: 'string' },
    name: { type: 'string' },
    granth: { type: 'object', properties: { slug: { type: 'string' }, name: { type: 'string' } } },
    verificationState: {
      type: 'string',
      enum: ['SOURCE_ONLY', 'PROVISIONAL', 'REVIEWED', 'LOCKED'],
    },
    publishedVersionNo: { type: ['integer', 'null'] },
    publishedAt: { type: ['string', 'null'] },
    textAvailable: { type: 'boolean' },
    metadata: { type: 'object', additionalProperties: true },
  },
} as const;

function rowToBani(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: str(r['id']),
    slug: str(r['slug']),
    name: str(r['name']),
    granth: { slug: str(r['granth_slug']), name: str(r['granth_name']) },
    verificationState: r['verification_state'],
    publishedVersionNo:
      r['published_version_no'] === null || r['published_version_no'] === undefined
        ? null
        : Number(r['published_version_no']),
    publishedAt: iso(r['published_at']),
    textAvailable: Boolean(r['text_available']),
    metadata: (typeof r['metadata'] === 'string'
      ? JSON.parse(r['metadata'] as string)
      : (r['metadata'] ?? {})) as object,
  };
}

async function baniBySlug(db: Db, slug: string): Promise<Record<string, unknown>> {
  if (!isSlug(slug)) throw new NotFoundError('bani');
  const r = await db.query<Record<string, unknown>>(
    'SELECT * FROM public_api.banis WHERE slug = $1',
    [slug],
  );
  const row = r.rows[0];
  if (!row) throw new NotFoundError('bani');
  return row;
}

export async function registerPublicRoutes(app: FastifyInstance, opts: Opts): Promise<void> {
  const { db } = opts;

  app.get(
    '/banis',
    {
      schema: {
        tags: [TAG_CORPUS],
        summary: 'List Banis with their verification state and whether published text is available',
        response: {
          200: { type: 'object', properties: { items: { type: 'array', items: baniSchema } } },
        },
      },
    },
    async () => {
      const r = await db.query<Record<string, unknown>>(
        'SELECT * FROM public_api.banis ORDER BY granth_slug, id',
      );
      return { items: r.rows.map(rowToBani) };
    },
  );

  app.get<{ Params: { slug: string } }>(
    '/banis/:slug',
    {
      schema: {
        tags: [TAG_CORPUS],
        summary: 'One Bani with its section tree',
        params: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
        response: { 200: { type: 'object', additionalProperties: true }, 404: ERROR_SCHEMA },
      },
    },
    async (req) => {
      const row = await baniBySlug(db, req.params.slug);
      const sections = await db.query<Record<string, unknown>>(
        'SELECT id, parent_section_id, section_type, ordinal, label FROM public_api.sections WHERE bani_id = $1 ORDER BY parent_section_id NULLS FIRST, ordinal, id',
        [str(row['id'])],
      );
      return {
        ...rowToBani(row),
        sections: sections.rows.map((s) => ({
          id: str(s['id']),
          parentId:
            s['parent_section_id'] === null || s['parent_section_id'] === undefined
              ? null
              : str(s['parent_section_id']),
          type: str(s['section_type']),
          ordinal: Number(s['ordinal']),
          label: (s['label'] as string | null) ?? null,
        })),
      };
    },
  );

  app.get<{ Params: { slug: string } }>(
    '/banis/:slug/lines',
    {
      schema: {
        tags: [TAG_CORPUS],
        summary:
          'Published accepted text of a Bani, line by line, byte-exact, with word offsets (codepoint ranges)',
        description:
          'Returns nothing for a Bani without a published version or whose lineage source forbids redistribution. ' +
          'Tokens are [cpStart, cpEnd) codepoint offsets into `text`; joining tokens without separators gives the Larivaar view.',
        params: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
        response: { 200: { type: 'object', additionalProperties: true }, 404: ERROR_SCHEMA },
      },
    },
    async (req) => {
      const row = await baniBySlug(db, req.params.slug);
      const baniId = str(row['id']);
      const r = await db.query<Record<string, unknown>>(
        `SELECT l.line_id, l.section_id, l.ordinal, l.version_no, l.text, l.text_sha256_hex, l.codepoint_count, l.grapheme_count, l.basis,
                (SELECT json_agg(json_build_array(t.cp_start, t.cp_end) ORDER BY t.ordinal) FROM public_api.tokens t WHERE t.layout_id = l.layout_id) AS tokens
         FROM public_api.lines l WHERE l.bani_id = $1 ORDER BY l.ordinal`,
        [baniId],
      );
      const first = r.rows[0];
      return {
        bani: {
          id: baniId,
          slug: str(row['slug']),
          name: str(row['name']),
          verificationState: row['verification_state'],
        },
        versionNo: first ? Number(first['version_no']) : null,
        basis: first ? first['basis'] : null,
        textAvailable: Boolean(row['text_available']),
        lines: r.rows.map((x) => ({
          lineId: str(x['line_id']),
          sectionId: str(x['section_id']),
          ordinal: Number(x['ordinal']),
          text: str(x['text']),
          sha256: str(x['text_sha256_hex']),
          codepointCount: Number(x['codepoint_count']),
          graphemeCount: Number(x['grapheme_count']),
          tokens: (typeof x['tokens'] === 'string'
            ? JSON.parse(x['tokens'] as string)
            : (x['tokens'] ?? [])) as [number, number][],
        })),
      };
    },
  );

  app.get<{ Params: { slug: string } }>(
    '/banis/:slug/versions',
    {
      schema: {
        tags: [TAG_CORPUS],
        summary:
          'Version history of a Bani (published and superseded versions with their decisions)',
        params: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
        response: { 200: { type: 'object', additionalProperties: true }, 404: ERROR_SCHEMA },
      },
    },
    async (req) => {
      const row = await baniBySlug(db, req.params.slug);
      const r = await db.query<Record<string, unknown>>(
        'SELECT * FROM public_api.versions WHERE bani_id = $1 ORDER BY version_no',
        [str(row['id'])],
      );
      return {
        bani: { id: str(row['id']), slug: str(row['slug']) },
        versions: r.rows.map((v) => ({
          id: str(v['id']),
          versionNo: Number(v['version_no']),
          status: v['status'],
          basis: v['basis'],
          createdAt: iso(v['created_at']),
          publishedAt: iso(v['published_at']),
          rationale: (v['rationale'] as string | null) ?? null,
          decision: v['decision_kind']
            ? {
                kind: v['decision_kind'],
                decidedAt: iso(v['decided_at']),
                rationale: v['decision_rationale'],
              }
            : null,
        })),
      };
    },
  );

  app.get(
    '/sources',
    {
      schema: {
        tags: [TAG_SOURCES],
        summary:
          'Source registry: every registered external source with its licence and redistribution status',
      },
    },
    async () => {
      const r = await db.query<Record<string, unknown>>(
        'SELECT * FROM public_api.sources ORDER BY id',
      );
      return {
        items: r.rows.map((s) => ({
          id: str(s['id']),
          slug: str(s['slug']),
          name: str(s['name']),
          url: s['url'] ?? null,
          sourceType: s['source_type'],
          publisher: s['publisher'] ?? null,
          license: s['license'] ?? null,
          licenseUrl: s['license_url'] ?? null,
          attributionText: s['attribution_text'] ?? null,
          redistribution: s['redistribution'],
          status: s['status'],
          lastSyncedAt: iso(s['last_synced_at']),
        })),
      };
    },
  );

  app.get<{ Params: { slug: string } }>(
    '/sources/:slug/snapshots',
    {
      schema: {
        tags: [TAG_SOURCES],
        summary:
          'Provenance: every snapshot taken of a source (hash, size, fetch time, declared version)',
        params: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
      },
    },
    async (req) => {
      if (!isSlug(req.params.slug)) throw new NotFoundError('source');
      const s = await db.query<{ id: unknown }>(
        'SELECT id FROM public_api.sources WHERE slug = $1',
        [req.params.slug],
      );
      if (!s.rows[0]) throw new NotFoundError('source');
      const r = await db.query<Record<string, unknown>>(
        'SELECT * FROM public_api.source_snapshots WHERE source_id = $1 ORDER BY id',
        [str(s.rows[0].id)],
      );
      return {
        items: r.rows.map((x) => ({
          id: str(x['id']),
          fetchedAt: iso(x['fetched_at']),
          sha256: str(x['sha256_hex']),
          byteSize: Number(x['byte_size']),
          sourceVersion: x['source_version'] ?? null,
        })),
      };
    },
  );

  app.get<{
    Querystring: {
      q?: string;
      first_letters?: string;
      bani?: string;
      limit?: number;
      offset?: number;
    };
  }>(
    '/search',
    {
      schema: {
        tags: [TAG_CORPUS],
        summary: 'Search published lines by Gurmukhi text or first letters',
        description:
          '`q` matches the exact codepoint sequence in the accepted text OR its whitespace/encoding-normalised comparison form. ' +
          '`first_letters` matches STTM-style first letters of consecutive words. At least one is required. Only published, redistributable text is searched.',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 200 },
            first_letters: { type: 'string', minLength: 1, maxLength: 60 },
            bani: { type: 'string', maxLength: 80 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            offset: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const { q, first_letters: fl, bani } = req.query;
      const limit = req.query.limit ?? 25;
      const offset = req.query.offset ?? 0;
      if (!q && !fl) {
        reply.code(400);
        return { error: { code: 'BAD_REQUEST', message: 'provide q or first_letters' } };
      }
      const where: string[] = ['s.key_version = $1'];
      const params: unknown[] = [SEARCH_KEY_VERSION];
      if (q) {
        params.push(q, normalizeForComparison(q));
        where.push(
          `(position($${params.length - 1} in s.text) > 0 OR position($${params.length} in s.compare_text) > 0)`,
        );
      }
      if (fl) {
        // The query IS the letter sequence (one letter per intended word); drop anything that is not a letter.
        const key = fromCodepoints(toCodepoints(normalizeEncoding(fl)).filter(isLetter));
        if (key.length === 0) {
          reply.code(400);
          return {
            error: { code: 'BAD_REQUEST', message: 'first_letters must contain Gurmukhi letters' },
          };
        }
        params.push(key);
        where.push(`position($${params.length} in s.first_letter_key) > 0`);
      }
      if (bani) {
        if (!isSlug(bani)) throw new NotFoundError('bani');
        params.push(bani);
        where.push(`b.slug = $${params.length}`);
      }
      params.push(limit, offset);
      const r = await db.query<Record<string, unknown>>(
        `SELECT s.line_id, s.ordinal, s.text, s.text_sha256_hex, b.slug AS bani_slug, b.name AS bani_name
         FROM public_api.search_lines s JOIN public_api.banis b ON b.id = s.bani_id
         WHERE ${where.join(' AND ')} ORDER BY b.id, s.ordinal LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        query: { q: q ?? null, firstLetters: fl ?? null, bani: bani ?? null, limit, offset },
        items: r.rows.map((x) => {
          const text = str(x['text']);
          let match: { cpStart: number; cpEnd: number } | null = null;
          if (q) {
            const idx = text.indexOf(q);
            if (idx >= 0) {
              const cpStart = toCodepoints(text.slice(0, idx)).length;
              match = { cpStart, cpEnd: cpStart + toCodepoints(q).length };
            }
          }
          return {
            lineId: str(x['line_id']),
            ordinal: Number(x['ordinal']),
            bani: { slug: str(x['bani_slug']), name: str(x['bani_name']) },
            text,
            sha256: str(x['text_sha256_hex']),
            firstLetterKey: firstLetterKey(text),
            match,
          };
        }),
      };
    },
  );

  app.get(
    '/statistics',
    {
      schema: {
        tags: ['meta'],
        summary:
          'Corpus statistics derived from corpus and decision records only (never from reader activity)',
      },
    },
    async () => {
      const r = await db.query<Record<string, unknown>>('SELECT * FROM public_api.statistics');
      const s = r.rows[0] ?? {};
      return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)]));
    },
  );
}

import {
  isRole,
  ROLES,
  SNAPSHOT_FORMATS,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  REDISTRIBUTION,
  type Role,
} from '@pothisahib/domain';
import {
  approveVersion,
  BadRequestError,
  bootstrapStructureFromDocument,
  confirmMfa,
  createAdoptionDraft,
  createRollbackDraft,
  createUser,
  enrollMfa,
  ensureBani,
  ensureCorpus,
  ensureGranth,
  getBani,
  getDocumentLines,
  getVersion,
  getVersionLines,
  grantRole,
  ingestSnapshot,
  iso,
  listBanis,
  listDocuments,
  listSnapshots,
  listSources,
  listUsers,
  listVersions,
  login,
  NotFoundError,
  parseSnapshot,
  publishVersion,
  registerSource,
  revokeRole,
  revokeSession,
  str,
  updateSource,
  type KoshContext,
  type SourceInput,
} from '@pothisahib/kosh-core';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ERROR_SCHEMA } from '../common.ts';
import { actorOf, requireAction, requireSession } from './auth.ts';

interface Opts extends FastifyPluginOptions {
  ctx: KoshContext;
  rateLimit: boolean;
}

const ID = { type: 'string', pattern: '^[0-9]{1,18}$' } as const;
const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,79}$' } as const;
const secured = { security: [{ bearer: [] }] } as const;
const nullableStr = (max = 4000): { type: ['string', 'null']; maxLength: number } => ({
  type: ['string', 'null'],
  maxLength: max,
});

export async function registerAdminRoutes(app: FastifyInstance, opts: Opts): Promise<void> {
  const { ctx } = opts;
  const db = ctx.db;

  // ------------------------------------------------------------------ auth
  app.post<{ Body: { username: string; password: string; mfaCode?: string | null } }>(
    '/auth/login',
    {
      config: opts.rateLimit ? { rateLimit: { max: 10, timeWindow: '1 minute' } } : {},
      schema: {
        tags: ['auth'],
        summary:
          'Log in with username + password (+ TOTP/recovery code when MFA is enrolled). Returns an opaque bearer token.',
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', maxLength: 64 },
            password: { type: 'string', maxLength: 256 },
            mfaCode: nullableStr(32),
          },
        },
        response: { 401: ERROR_SCHEMA },
      },
    },
    async (req) => {
      const s = await login(ctx, req.body);
      return { token: s.token, expiresAt: s.expiresAt, principal: s.principal };
    },
  );
  app.post(
    '/auth/logout',
    { preHandler: requireSession(), schema: { tags: ['auth'], ...secured } },
    async (req, reply) => {
      if (req.bearerToken) await revokeSession(db, req.bearerToken);
      reply.code(204);
      return null;
    },
  );
  app.get(
    '/auth/me',
    { preHandler: requireSession(), schema: { tags: ['auth'], ...secured } },
    async (req) => req.principal,
  );
  app.post(
    '/auth/mfa/enroll',
    {
      preHandler: requireSession(),
      schema: {
        tags: ['auth'],
        summary: 'Start TOTP enrolment; returns the secret once',
        ...secured,
      },
    },
    async (req) => enrollMfa(ctx, actorOf(req).userId),
  );
  app.post<{ Body: { code: string } }>(
    '/auth/mfa/confirm',
    {
      preHandler: requireSession(),
      schema: {
        tags: ['auth'],
        summary:
          'Confirm TOTP enrolment with a live code; returns one-time recovery codes exactly once',
        ...secured,
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } },
        },
      },
    },
    async (req) => confirmMfa(ctx, actorOf(req).userId, req.body.code),
  );

  // ------------------------------------------------------------------ users and roles (SUPER_ADMIN)
  app.get(
    '/users',
    { preHandler: requireAction('user.list'), schema: { tags: ['users'], ...secured } },
    async () => ({ items: await listUsers(db) }),
  );
  app.post<{ Body: { username: string; password: string } }>(
    '/users',
    {
      preHandler: requireAction('user.grant_role'),
      schema: {
        tags: ['users'],
        summary: 'Create an account (username + password only; no PII)',
        ...secured,
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', maxLength: 64 },
            password: { type: 'string', maxLength: 256 },
          },
        },
      },
    },
    async (req, reply) => {
      const u = await createUser(db, req.body, actorOf(req));
      reply.code(201);
      return u;
    },
  );
  app.post<{ Params: { username: string }; Body: { role: Role; reason?: string | null } }>(
    '/users/:username/roles',
    {
      preHandler: requireAction('user.grant_role'),
      schema: {
        tags: ['users'],
        summary:
          'Grant a role (EDITOR/SUPER_ADMIN require the target to have confirmed MFA; never to oneself)',
        ...secured,
        params: {
          type: 'object',
          properties: { username: { type: 'string', maxLength: 64 } },
          required: ['username'],
        },
        body: {
          type: 'object',
          required: ['role'],
          additionalProperties: false,
          properties: { role: { type: 'string', enum: [...ROLES] }, reason: nullableStr(1000) },
        },
      },
    },
    async (req) =>
      grantRole(
        db,
        { username: req.params.username, role: req.body.role, reason: req.body.reason ?? null },
        actorOf(req),
      ),
  );
  app.delete<{ Params: { username: string; role: string }; Body?: { reason?: string | null } }>(
    '/users/:username/roles/:role',
    {
      preHandler: requireAction('user.revoke_role'),
      schema: {
        tags: ['users'],
        ...secured,
        params: {
          type: 'object',
          properties: { username: { type: 'string', maxLength: 64 }, role: { type: 'string' } },
          required: ['username', 'role'],
        },
      },
    },
    async (req) => {
      if (!isRole(req.params.role)) throw new BadRequestError('invalid role');
      return revokeRole(
        db,
        { username: req.params.username, role: req.params.role, reason: req.body?.reason ?? null },
        actorOf(req),
      );
    },
  );

  // ------------------------------------------------------------------ sources
  const sourceBody = {
    type: 'object',
    additionalProperties: false,
    properties: {
      slug: SLUG,
      name: { type: 'string', maxLength: 200 },
      sourceType: { type: 'string', enum: [...SOURCE_TYPES] },
      url: nullableStr(2000),
      publisher: nullableStr(500),
      license: nullableStr(500),
      licenseUrl: nullableStr(2000),
      attributionText: nullableStr(2000),
      redistribution: { type: 'string', enum: [...REDISTRIBUTION] },
      importMethod: nullableStr(500),
      notes: nullableStr(4000),
      status: { type: 'string', enum: [...SOURCE_STATUSES] },
    },
  } as const;
  app.get(
    '/sources',
    { preHandler: requireAction('admin.read'), schema: { tags: ['sources'], ...secured } },
    async () => ({ items: await listSources(db) }),
  );
  app.post<{ Body: SourceInput }>(
    '/sources',
    {
      preHandler: requireAction('source.register'),
      schema: {
        tags: ['sources'],
        summary:
          'Register an external source (PROPOSED until its licence is recorded and it is set ACTIVE)',
        ...secured,
        body: { ...sourceBody, required: ['slug', 'name', 'sourceType'] },
      },
    },
    async (req, reply) => {
      const s = await registerSource(db, req.body, actorOf(req));
      reply.code(201);
      return s;
    },
  );
  app.patch<{ Params: { slug: string }; Body: Partial<SourceInput> & { reason?: string } }>(
    '/sources/:slug',
    {
      preHandler: requireAction('source.update'),
      schema: {
        tags: ['sources'],
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
        body: {
          ...sourceBody,
          properties: { ...sourceBody.properties, reason: nullableStr(1000) },
        },
      },
    },
    async (req) => {
      const { reason, slug: _ignored, ...patch } = req.body;
      void _ignored;
      return updateSource(db, req.params.slug, patch, actorOf(req), reason ?? undefined);
    },
  );
  app.get<{ Params: { slug: string } }>(
    '/sources/:slug/snapshots',
    {
      preHandler: requireAction('admin.read'),
      schema: {
        tags: ['sources'],
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
      },
    },
    async (req) => ({ items: await listSnapshots(db, req.params.slug) }),
  );
  app.post<{
    Params: { slug: string };
    Body: {
      contentBase64: string;
      sourceVersion?: string | null;
      notes?: string | null;
      fetchedAt?: string | null;
    };
  }>(
    '/sources/:slug/snapshots',
    {
      preHandler: requireAction('snapshot.ingest'),
      schema: {
        tags: ['sources'],
        summary:
          'Ingest a raw artefact: hashed (SHA-256), stored immutably, recorded. Nothing is parsed or published.',
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
        body: {
          type: 'object',
          required: ['contentBase64'],
          additionalProperties: false,
          properties: {
            contentBase64: { type: 'string', minLength: 4 },
            sourceVersion: nullableStr(200),
            notes: nullableStr(4000),
            fetchedAt: nullableStr(40),
          },
        },
      },
    },
    async (req, reply) => {
      const b64 = req.body.contentBase64;
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(b64))
        throw new BadRequestError('contentBase64 is not base64');
      const bytes = Buffer.from(b64, 'base64');
      const fetchedAt = req.body.fetchedAt ? new Date(req.body.fetchedAt) : undefined;
      if (fetchedAt && Number.isNaN(fetchedAt.getTime()))
        throw new BadRequestError('invalid fetchedAt');
      const r = await ingestSnapshot(
        ctx,
        {
          sourceSlug: req.params.slug,
          bytes,
          sourceVersion: req.body.sourceVersion ?? null,
          notes: req.body.notes ?? null,
          ...(fetchedAt ? { fetchedAt } : {}),
        },
        actorOf(req),
      );
      reply.code(r.duplicate ? 200 : 201);
      return r;
    },
  );
  app.post<{ Params: { id: string }; Body: { format: string } }>(
    '/snapshots/:id/parse',
    {
      preHandler: requireAction('snapshot.parse'),
      schema: {
        tags: ['sources'],
        summary:
          'Parse a stored snapshot into immutable source lines (with layouts, normalisations and search keys)',
        ...secured,
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: 'object',
          required: ['format'],
          additionalProperties: false,
          properties: { format: { type: 'string', enum: [...SNAPSHOT_FORMATS] } },
        },
      },
    },
    async (req) =>
      parseSnapshot(ctx, { snapshotId: req.params.id, format: req.body.format }, actorOf(req)),
  );
  app.get<{ Params: { id: string } }>(
    '/snapshots/:id/documents',
    {
      preHandler: requireAction('admin.read'),
      schema: {
        tags: ['sources'],
        ...secured,
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
      },
    },
    async (req) => ({ items: await listDocuments(db, req.params.id) }),
  );
  app.get<{ Params: { id: string } }>(
    '/documents/:id/lines',
    {
      preHandler: requireAction('admin.read'),
      schema: {
        tags: ['sources'],
        summary: 'Source lines of a parsed document (byte-exact source text)',
        ...secured,
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
      },
    },
    async (req) => ({ items: await getDocumentLines(db, req.params.id) }),
  );

  // ------------------------------------------------------------------ corpus structure
  app.get(
    '/banis',
    { preHandler: requireAction('admin.read'), schema: { tags: ['corpus'], ...secured } },
    async () => ({ items: await listBanis(db) }),
  );
  app.post<{ Body: { slug: string; name: string } }>(
    '/corpus/corpora',
    {
      preHandler: requireAction('structure.bootstrap'),
      schema: {
        tags: ['corpus'],
        ...secured,
        body: {
          type: 'object',
          required: ['slug', 'name'],
          additionalProperties: false,
          properties: { slug: SLUG, name: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const id = await ensureCorpus(db, req.body.slug, req.body.name);
      reply.code(201);
      return { id, slug: req.body.slug };
    },
  );
  app.post<{ Body: { corpusSlug: string; slug: string; name: string } }>(
    '/corpus/granths',
    {
      preHandler: requireAction('structure.bootstrap'),
      schema: {
        tags: ['corpus'],
        ...secured,
        body: {
          type: 'object',
          required: ['corpusSlug', 'slug', 'name'],
          additionalProperties: false,
          properties: { corpusSlug: SLUG, slug: SLUG, name: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const id = await ensureGranth(db, req.body.corpusSlug, req.body.slug, req.body.name);
      reply.code(201);
      return { id, slug: req.body.slug };
    },
  );
  app.post<{
    Body: {
      granthSlug: string;
      slug: string;
      name: string;
      metadata?: Record<string, unknown>;
      aliases?: string[];
    };
  }>(
    '/corpus/banis',
    {
      preHandler: requireAction('structure.bootstrap'),
      schema: {
        tags: ['corpus'],
        ...secured,
        body: {
          type: 'object',
          required: ['granthSlug', 'slug', 'name'],
          additionalProperties: false,
          properties: {
            granthSlug: SLUG,
            slug: SLUG,
            name: { type: 'string', maxLength: 200 },
            metadata: { type: 'object', additionalProperties: true },
            aliases: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 200 } },
          },
        },
      },
    },
    async (req, reply) => {
      const b = await ensureBani(db, req.body, actorOf(req));
      reply.code(201);
      return b;
    },
  );
  app.post<{ Params: { slug: string }; Body: { documentId: string } }>(
    '/banis/:slug/structure/bootstrap',
    {
      preHandler: requireAction('structure.bootstrap'),
      schema: {
        tags: ['corpus'],
        summary:
          'Create sections and lines for a Bani from a parsed document segmentation (records the basis snapshot)',
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
        body: {
          type: 'object',
          required: ['documentId'],
          additionalProperties: false,
          properties: { documentId: ID },
        },
      },
    },
    async (req) =>
      bootstrapStructureFromDocument(
        db,
        { baniSlug: req.params.slug, documentId: req.body.documentId },
        actorOf(req),
      ),
  );

  // ------------------------------------------------------------------ accepted versions
  app.get<{ Params: { slug: string } }>(
    '/banis/:slug/versions',
    {
      preHandler: requireAction('admin.read'),
      schema: {
        tags: ['versions'],
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
      },
    },
    async (req) => {
      const b = await getBani(db, req.params.slug);
      if (!b) throw new NotFoundError('bani');
      return { bani: b, items: await listVersions(db, b.id) };
    },
  );
  app.get<{ Params: { id: string } }>(
    '/versions/:id',
    {
      preHandler: requireAction('admin.read'),
      schema: {
        tags: ['versions'],
        summary: 'A version (any status) with its approvals and line texts',
        ...secured,
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
      },
    },
    async (req) => {
      const v = await getVersion(db, req.params.id);
      if (!v) throw new NotFoundError('version');
      return { ...v, lines: await getVersionLines(db, v.id) };
    },
  );
  app.post<{ Params: { slug: string }; Body: { documentId: string; rationale: string } }>(
    '/banis/:slug/versions/adopt',
    {
      preHandler: requireAction('version.create_draft'),
      schema: {
        tags: ['versions'],
        summary:
          'Create a DRAFT adopting a parsed source document as the accepted reading (SOURCE_ADOPTION)',
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
        body: {
          type: 'object',
          required: ['documentId', 'rationale'],
          additionalProperties: false,
          properties: {
            documentId: ID,
            rationale: { type: 'string', minLength: 3, maxLength: 4000 },
          },
        },
      },
    },
    async (req, reply) => {
      const v = await createAdoptionDraft(
        db,
        {
          baniSlug: req.params.slug,
          documentId: req.body.documentId,
          rationale: req.body.rationale,
        },
        actorOf(req),
      );
      reply.code(201);
      return v;
    },
  );
  app.post<{ Params: { slug: string }; Body: { targetVersionId: string; rationale: string } }>(
    '/banis/:slug/versions/rollback',
    {
      preHandler: requireAction('version.rollback'),
      schema: {
        tags: ['versions'],
        summary:
          'Create a DRAFT that restores an earlier version (history is preserved; the draft still needs two approvals)',
        ...secured,
        params: { type: 'object', properties: { slug: SLUG }, required: ['slug'] },
        body: {
          type: 'object',
          required: ['targetVersionId', 'rationale'],
          additionalProperties: false,
          properties: {
            targetVersionId: ID,
            rationale: { type: 'string', minLength: 3, maxLength: 4000 },
          },
        },
      },
    },
    async (req, reply) => {
      const v = await createRollbackDraft(
        db,
        {
          baniSlug: req.params.slug,
          targetVersionId: req.body.targetVersionId,
          rationale: req.body.rationale,
        },
        actorOf(req),
      );
      reply.code(201);
      return v;
    },
  );
  app.post<{ Params: { id: string }; Body?: { notes?: string | null } }>(
    '/versions/:id/approve',
    {
      preHandler: requireAction('version.approve'),
      schema: {
        tags: ['versions'],
        summary:
          'Record your independent approval. The second distinct approver creates the two-person decision.',
        ...secured,
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { notes: nullableStr(4000) },
        },
      },
    },
    async (req) =>
      approveVersion(
        db,
        { versionId: req.params.id, notes: req.body?.notes ?? null },
        actorOf(req),
      ),
  );
  app.post<{ Params: { id: string } }>(
    '/versions/:id/publish',
    {
      preHandler: requireAction('version.publish'),
      schema: {
        tags: ['versions'],
        summary:
          'Commit a decided DRAFT as the published accepted version (supersedes the previous one)',
        ...secured,
        params: { type: 'object', properties: { id: ID }, required: ['id'] },
      },
    },
    async (req) => publishVersion(db, { versionId: req.params.id }, actorOf(req)),
  );

  // ------------------------------------------------------------------ audit
  app.get<{
    Querystring: { objectType?: string; objectId?: string; limit?: number; offset?: number };
  }>(
    '/audit',
    {
      preHandler: requireAction('admin.read'),
      schema: {
        tags: ['audit'],
        ...secured,
        querystring: {
          type: 'object',
          properties: {
            objectType: { type: 'string', maxLength: 40 },
            objectId: ID,
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (req) => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (req.query.objectType) {
        params.push(req.query.objectType);
        where.push(`a.object_type = $${params.length}`);
      }
      if (req.query.objectId) {
        params.push(req.query.objectId);
        where.push(`a.object_id = $${params.length}`);
      }
      params.push(req.query.limit ?? 50, req.query.offset ?? 0);
      const r = await db.query<Record<string, unknown>>(
        `SELECT a.id, a.ts, a.actor_type, a.actor_id, u.username AS actor_username, a.action, a.object_type, a.object_id, a.before, a.after, a.reason, a.decision_id
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id AND a.actor_type = 'USER'
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        items: r.rows.map((x) => ({
          id: str(x['id']),
          ts: iso(x['ts']),
          actorType: x['actor_type'],
          actorId:
            x['actor_id'] === null || x['actor_id'] === undefined ? null : str(x['actor_id']),
          actorUsername: x['actor_username'] ?? null,
          action: x['action'],
          objectType: x['object_type'],
          objectId:
            x['object_id'] === null || x['object_id'] === undefined ? null : str(x['object_id']),
          before: x['before'] ?? null,
          after: x['after'] ?? null,
          reason: x['reason'] ?? null,
          decisionId:
            x['decision_id'] === null || x['decision_id'] === undefined
              ? null
              : str(x['decision_id']),
        })),
      };
    },
  );
}

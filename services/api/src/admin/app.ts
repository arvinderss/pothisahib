/**
 * The ADMINISTRATIVE API: authenticated, role-checked server-side on every route, bound to the
 * kosh_app database role. It is a separate process from the public API and is never exposed as a
 * public surface (SRS §43). Every state change goes through kosh-core services and lands in the
 * audit log.
 */
import rateLimit from '@fastify/rate-limit';
import type { KoshContext } from '@pothisahib/kosh-core';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../common.ts';
import { registerAuth } from './auth.ts';
import { registerAdminRoutes } from './routes.ts';

export interface AdminAppOptions {
  ctx: KoshContext;
  logger?: boolean;
  /** Disable the in-memory rate limiter (tests). */
  rateLimit?: boolean;
}

export async function buildAdminApp(opts: AdminAppOptions): Promise<FastifyInstance> {
  const app = await createServer({
    title: 'Gurbani Kosh Administrative API',
    description:
      'Authenticated operations for Reviewers, Editors and Super Admins: source registry, snapshot ingestion and parsing, ' +
      'corpus structure, two-person adoption/rollback of accepted text, accounts and roles. Not a public surface.',
    openapiPath: '/admin/v1/openapi.json',
    docsPrefix: '/admin/docs',
    bodyLimit: 48 * 1024 * 1024, // base64-encoded snapshot artefacts
    logger: opts.logger ?? false,
  });
  if (opts.rateLimit !== false) {
    // In-memory, per-process, keyed by connection address for the window only. Nothing is persisted;
    // no address ever reaches the database (docs/privacy.md).
    await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  }
  registerAuth(app, opts.ctx);
  await app.register(registerAdminRoutes, {
    ctx: opts.ctx,
    prefix: '/admin/v1',
    rateLimit: opts.rateLimit !== false,
  });
  return app;
}

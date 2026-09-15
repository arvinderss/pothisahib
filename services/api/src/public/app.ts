/**
 * The PUBLIC API: read-only by construction. It receives a Db bound to the kosh_public database
 * role, which holds SELECT on the public_api views and nothing else, so even a defective handler
 * cannot write. Every route is GET. Tests assert both properties.
 */
import type { Db } from '@pothisahib/db';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../common.ts';
import { registerPublicRoutes } from './routes.ts';

export interface PublicAppOptions {
  db: Db;
  corsOrigin?: string;
  logger?: boolean;
}

export async function buildPublicApp(opts: PublicAppOptions): Promise<FastifyInstance> {
  const app = await createServer({
    title: 'Gurbani Kosh Public API',
    description:
      'Read-only access to the human-verified Gurbani Kosh corpus: Banis, published accepted text with word offsets, ' +
      'version history, source registry and search. Text is served byte-exactly as accepted; nothing is normalised. ' +
      'Only text whose source permits redistribution is exposed.',
    openapiPath: '/api/v1/openapi.json',
    docsPrefix: '/api/docs',
    logger: opts.logger ?? false,
  });
  const origin = opts.corsOrigin ?? '*';
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/')) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Vary', 'Origin');
      if (reply.statusCode === 200 && !reply.getHeader('Cache-Control'))
        reply.header('Cache-Control', 'public, max-age=300');
    }
    return payload;
  });
  await app.register(registerPublicRoutes, { db: opts.db, prefix: '/api/v1' });
  return app;
}

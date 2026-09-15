import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ValidationError } from '@pothisahib/domain';
import { KoshError } from '@pothisahib/kosh-core';

export interface RouteRow {
  method: string;
  url: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    routeTable: RouteRow[];
  }
}

export interface CommonOptions {
  title: string;
  description: string;
  /** Path prefix under which the OpenAPI document is served. */
  openapiPath: string;
  docsPrefix: string;
  bodyLimit?: number;
  logger?: boolean;
}

/**
 * Shared server construction: JSON-only error responses that never leak internals (Instruction
 * §45), conservative security headers, OpenAPI generation from route schemas, and a route table
 * used by tests to prove the public API has no write routes.
 */
export async function createServer(opts: CommonOptions): Promise<FastifyInstance> {
  // Request logs carry method and path only: no client address, no user agent (docs/privacy.md).
  const privateSerializers = {
    req: (r: { method: string; url: string }): { method: string; url: string } => ({
      method: r.method,
      url: r.url.split('?')[0] ?? r.url,
    }),
    res: (r: { statusCode: number }): { statusCode: number } => ({ statusCode: r.statusCode }),
  };
  const logger: NonNullable<FastifyServerOptions['logger']> = opts.logger
    ? ({ serializers: privateSerializers } as unknown as NonNullable<
        FastifyServerOptions['logger']
      >)
    : false;
  const options: FastifyServerOptions = {
    logger,
    bodyLimit: opts.bodyLimit ?? 1024 * 1024,
    trustProxy: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array', allErrors: false } },
  };
  const app: FastifyInstance = Fastify(options);

  const table: RouteRow[] = [];
  app.decorate('routeTable', table);
  app.addHook('onRoute', (r) => {
    const methods = Array.isArray(r.method) ? r.method : [r.method];
    for (const m of methods) table.push({ method: m, url: r.url });
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: opts.title,
        description: opts.description,
        version: '0.1.0',
        license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
      },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: opts.docsPrefix,
    uiConfig: { docExpansion: 'list' },
  });

  app.get(opts.openapiPath, { schema: { hide: true } }, async () => app.swagger());
  app.get(
    '/health',
    {
      schema: {
        tags: ['meta'],
        response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
      },
    },
    async () => ({
      status: 'ok',
    }),
  );

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    if (!req.url.startsWith(opts.docsPrefix))
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });

  app.setNotFoundHandler(async (req, reply) => {
    reply.code(404);
    return {
      error: {
        code: 'NOT_FOUND',
        message: `route ${req.method} ${req.url.split('?')[0]} not found`,
      },
    };
  });

  app.setErrorHandler((err: unknown, _req: FastifyRequest, reply: FastifyReply) => {
    const e = err as { validation?: unknown; statusCode?: number; message?: string; code?: string };
    if (err instanceof KoshError)
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof ValidationError)
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: err.message } });
    if (e.validation)
      return reply
        .code(400)
        .send({ error: { code: 'BAD_REQUEST', message: e.message ?? 'invalid request' } });
    if (e.statusCode === 413)
      return reply
        .code(413)
        .send({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'payload too large' } });
    if (e.statusCode === 415)
      return reply
        .code(415)
        .send({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'unsupported media type' } });
    if (e.statusCode === 429)
      return reply
        .code(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'too many requests' } });
    if (e.statusCode === 400 && e.code?.startsWith('FST_ERR_CTP'))
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'malformed body' } });
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'internal error' } });
  });

  return app;
}

export const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;

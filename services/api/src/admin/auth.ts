import type { Action, Principal } from '@pothisahib/domain';
import { can } from '@pothisahib/domain';
import {
  ForbiddenError,
  resolveSession,
  UnauthorizedError,
  type KoshContext,
} from '@pothisahib/kosh-core';
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
    bearerToken: string | null;
  }
}

/** Attach the principal (if any) to every request. Roles are loaded fresh from the database each time. */
export function registerAuth(app: FastifyInstance, ctx: KoshContext): void {
  app.decorateRequest('principal', null);
  app.decorateRequest('bearerToken', null);
  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return;
    const token = h.slice(7).trim();
    req.bearerToken = token;
    req.principal = await resolveSession(ctx.db, token);
  });
}

/** Route guard: 401 without a valid session, 403 when the permission matrix says no. Always server-side. */
export function requireAction(action: Action): preHandlerHookHandler {
  return async (req: FastifyRequest) => {
    if (!req.principal) throw new UnauthorizedError();
    if (!can(req.principal, action))
      throw new ForbiddenError(
        `action ${action} requires a higher role or an MFA-verified session`,
      );
  };
}

export function requireSession(): preHandlerHookHandler {
  return async (req: FastifyRequest) => {
    if (!req.principal) throw new UnauthorizedError();
  };
}

export function actorOf(req: FastifyRequest): { userId: string; username: string } {
  if (!req.principal) throw new UnauthorizedError();
  return { userId: req.principal.userId, username: req.principal.username };
}

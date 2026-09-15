import { withRole } from '@pothisahib/db';
import type { Actor } from '@pothisahib/kosh-core';
import { createWorld, type TestWorld } from '@pothisahib/kosh-core/testing';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildAdminApp } from '../src/admin/app.ts';
import { buildPublicApp } from '../src/public/app.ts';

export interface Apps {
  w: TestWorld;
  publicApp: FastifyInstance;
  adminApp: FastifyInstance;
  loginAs(actor: Actor): Promise<string>;
  close(): Promise<void>;
}

export const PASSWORD = 'correct-horse-battery-staple';

/** Both services against ONE database, each bound to its own database role exactly as in production. */
export async function createApps(): Promise<Apps> {
  const w = await createWorld();
  const publicApp = await buildPublicApp({ db: withRole(w.db, 'kosh_public') });
  const adminApp = await buildAdminApp({
    ctx: { ...w.ctx, db: withRole(w.db, 'kosh_app') },
    rateLimit: false,
  });
  await publicApp.ready();
  await adminApp.ready();
  return {
    w,
    publicApp,
    adminApp,
    async loginAs(actor) {
      const body: Record<string, string> = { username: actor.username, password: PASSWORD };
      try {
        body['mfaCode'] = await w.codeFor(actor);
      } catch {
        /* account without MFA */
      }
      const r = await adminApp.inject({
        method: 'POST',
        url: '/admin/v1/auth/login',
        payload: body,
      });
      if (r.statusCode !== 200) throw new Error(`login failed for ${actor.username}: ${r.body}`);
      return (r.json() as { token: string }).token;
    },
    async close() {
      await adminApp.close();
      await publicApp.close();
      await w.close();
    },
  };
}

export const auth = (token: string | null): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};
export type Inject = InjectOptions;

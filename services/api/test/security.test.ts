/**
 * Security matrix (Instruction §31): every administrative endpoint × {anonymous, USER, REVIEWER,
 * EDITOR, SUPER_ADMIN}, asserting both allowed and forbidden outcomes; plus escalation attempts,
 * token handling, and the structural read-only-ness of the public API.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '@pothisahib/domain';
import { auth, createApps, PASSWORD, type Apps, type Inject } from './helpers.ts';

let A: Apps;
const tokens: Record<Role | 'anon', string | null> = {
  anon: null,
  USER: null,
  REVIEWER: null,
  EDITOR: null,
  SUPER_ADMIN: null,
};

beforeAll(async () => {
  A = await createApps();
  tokens.USER = await A.loginAs(A.w.user);
  tokens.REVIEWER = await A.loginAs(A.w.reviewer);
  tokens.EDITOR = await A.loginAs(A.w.editorA);
  tokens.SUPER_ADMIN = await A.loginAs(A.w.superAdmin);
});
afterAll(async () => {
  await A.close();
});

interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  min: Role;
  payload?: unknown;
}

// Payloads are deliberately harmless/invalid where possible: an ALLOWED principal may get 400/404/409,
// which still proves authorisation passed. Only 401/403 mean "denied".
const ENDPOINTS: Endpoint[] = [
  { method: 'GET', url: '/admin/v1/sources', min: 'REVIEWER' },
  {
    method: 'POST',
    url: '/admin/v1/sources',
    min: 'EDITOR',
    payload: { slug: 'sec-src', name: 'x', sourceType: 'OTHER' },
  },
  { method: 'PATCH', url: '/admin/v1/sources/sec-src', min: 'EDITOR', payload: { notes: 'n' } },
  { method: 'GET', url: '/admin/v1/sources/sec-src/snapshots', min: 'REVIEWER' },
  {
    method: 'POST',
    url: '/admin/v1/sources/sec-src/snapshots',
    min: 'EDITOR',
    payload: { contentBase64: 'AAAA' },
  },
  {
    method: 'POST',
    url: '/admin/v1/snapshots/999999/parse',
    min: 'EDITOR',
    payload: { format: 'txt' },
  },
  { method: 'GET', url: '/admin/v1/snapshots/999999/documents', min: 'REVIEWER' },
  { method: 'GET', url: '/admin/v1/documents/999999/lines', min: 'REVIEWER' },
  { method: 'GET', url: '/admin/v1/banis', min: 'REVIEWER' },
  {
    method: 'POST',
    url: '/admin/v1/corpus/corpora',
    min: 'EDITOR',
    payload: { slug: 'sec-c', name: 'c' },
  },
  {
    method: 'POST',
    url: '/admin/v1/corpus/granths',
    min: 'EDITOR',
    payload: { corpusSlug: 'sec-c', slug: 'sec-g', name: 'g' },
  },
  {
    method: 'POST',
    url: '/admin/v1/corpus/banis',
    min: 'EDITOR',
    payload: { granthSlug: 'sec-g', slug: 'sec-b', name: 'b' },
  },
  {
    method: 'POST',
    url: '/admin/v1/banis/sec-b/structure/bootstrap',
    min: 'EDITOR',
    payload: { documentId: '999999' },
  },
  { method: 'GET', url: '/admin/v1/banis/sec-b/versions', min: 'REVIEWER' },
  { method: 'GET', url: '/admin/v1/versions/999999', min: 'REVIEWER' },
  {
    method: 'POST',
    url: '/admin/v1/banis/sec-b/versions/adopt',
    min: 'EDITOR',
    payload: { documentId: '999999', rationale: 'sec' },
  },
  {
    method: 'POST',
    url: '/admin/v1/banis/sec-b/versions/rollback',
    min: 'EDITOR',
    payload: { targetVersionId: '999999', rationale: 'sec' },
  },
  { method: 'POST', url: '/admin/v1/versions/999999/approve', min: 'EDITOR', payload: {} },
  { method: 'POST', url: '/admin/v1/versions/999999/publish', min: 'EDITOR' },
  { method: 'GET', url: '/admin/v1/audit', min: 'REVIEWER' },
  { method: 'GET', url: '/admin/v1/users', min: 'SUPER_ADMIN' },
  {
    method: 'POST',
    url: '/admin/v1/users',
    min: 'SUPER_ADMIN',
    payload: { username: 'sec-new-user', password: PASSWORD },
  },
  {
    method: 'POST',
    url: '/admin/v1/users/reader/roles',
    min: 'SUPER_ADMIN',
    payload: { role: 'REVIEWER' },
  },
  { method: 'DELETE', url: '/admin/v1/users/reader/roles/REVIEWER', min: 'SUPER_ADMIN' },
];

const RANK: Record<Role | 'anon', number> = {
  anon: -1,
  USER: 0,
  REVIEWER: 1,
  EDITOR: 2,
  SUPER_ADMIN: 3,
};

describe('administrative endpoint × principal matrix', () => {
  for (const ep of ENDPOINTS) {
    for (const who of ['anon', 'USER', 'REVIEWER', 'EDITOR', 'SUPER_ADMIN'] as const) {
      const allowed = RANK[who] >= RANK[ep.min];
      it(`${ep.method} ${ep.url} as ${who} -> ${allowed ? 'allowed' : who === 'anon' ? '401' : '403'}`, async () => {
        const opts: Inject = { method: ep.method, url: ep.url, headers: auth(tokens[who]) };
        if (ep.payload !== undefined) opts.payload = ep.payload as NonNullable<Inject['payload']>;
        const r = await A.adminApp.inject(opts);
        if (!allowed) {
          expect(r.statusCode).toBe(who === 'anon' ? 401 : 403);
        } else {
          expect([401, 403]).not.toContain(r.statusCode);
          expect(r.statusCode).toBeLessThan(500);
        }
      });
    }
  }
});

describe('escalation and token handling', () => {
  it('nobody can grant themselves a role, not even a Super Admin', async () => {
    const r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/users/super/roles',
      headers: auth(tokens.SUPER_ADMIN),
      payload: { role: 'EDITOR' },
    });
    expect(r.statusCode).toBe(403);
    const e = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/users/editor-a/roles',
      headers: auth(tokens.EDITOR),
      payload: { role: 'SUPER_ADMIN' },
    });
    expect(e.statusCode).toBe(403);
  });
  it('a privileged grant to an account without MFA is refused by the database', async () => {
    const r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/users/reviewer/roles',
      headers: auth(tokens.SUPER_ADMIN),
      payload: { role: 'EDITOR' },
    });
    expect(r.statusCode).toBe(403); // SQLSTATE 42501 raised by the user_roles trigger
    expect(r.body).toMatch(/MFA/);
  });
  it('role claims in the request body or headers are ignored; roles come from the database', async () => {
    const r = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources',
      headers: { ...auth(tokens.USER), 'x-role': 'SUPER_ADMIN' },
      payload: { slug: 'x-src', name: 'x', sourceType: 'OTHER', role: 'SUPER_ADMIN' },
    });
    expect([400, 403]).toContain(r.statusCode);
  });
  it('a revoked role takes effect on the very next request of an existing session', async () => {
    const grant = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/users/reader/roles',
      headers: auth(tokens.SUPER_ADMIN),
      payload: { role: 'REVIEWER' },
    });
    expect(grant.statusCode).toBe(200);
    const ok = await A.adminApp.inject({
      method: 'GET',
      url: '/admin/v1/audit',
      headers: auth(tokens.USER),
    });
    expect(ok.statusCode).toBe(200);
    const revoke = await A.adminApp.inject({
      method: 'DELETE',
      url: '/admin/v1/users/reader/roles/REVIEWER',
      headers: auth(tokens.SUPER_ADMIN),
    });
    expect(revoke.statusCode).toBe(200);
    const denied = await A.adminApp.inject({
      method: 'GET',
      url: '/admin/v1/audit',
      headers: auth(tokens.USER),
    });
    expect(denied.statusCode).toBe(403);
  });
  it('garbage, tampered and logged-out tokens are 401', async () => {
    for (const t of ['x', 'a'.repeat(43), (tokens.EDITOR as string).slice(0, -1) + 'A']) {
      const r = await A.adminApp.inject({
        method: 'GET',
        url: '/admin/v1/auth/me',
        headers: auth(t),
      });
      expect(r.statusCode).toBe(401);
    }
    const tmp = await A.loginAs(A.w.reviewer);
    expect(
      (await A.adminApp.inject({ method: 'GET', url: '/admin/v1/auth/me', headers: auth(tmp) }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await A.adminApp.inject({
          method: 'POST',
          url: '/admin/v1/auth/logout',
          headers: auth(tmp),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await A.adminApp.inject({ method: 'GET', url: '/admin/v1/auth/me', headers: auth(tmp) }))
        .statusCode,
    ).toBe(401);
  });
  it('login errors do not distinguish unknown users from wrong passwords and never echo details', async () => {
    const a = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/auth/login',
      payload: { username: 'ghost-user', password: PASSWORD },
    });
    const b = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/auth/login',
      payload: { username: 'reader', password: 'wrong-password-value' },
    });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
    const c = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/auth/login',
      payload: { username: 'editor-a', password: PASSWORD },
    });
    expect(c.statusCode).toBe(401); // MFA account without a code
  });
  it('request bodies are validated strictly (unknown fields, wrong enums, oversized ids)', async () => {
    const r1 = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources',
      headers: auth(tokens.EDITOR),
      payload: { slug: 'ok-src', name: 'x', sourceType: 'NOT_A_TYPE' },
    });
    expect(r1.statusCode).toBe(400);
    const r2 = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/versions/1e99/publish',
      headers: auth(tokens.EDITOR),
    });
    expect(r2.statusCode).toBe(400);
    const r3 = await A.adminApp.inject({
      method: 'POST',
      url: '/admin/v1/sources',
      headers: auth(tokens.EDITOR),
      payload: { slug: 'ok-src', name: 'x', sourceType: 'OTHER', evil: true },
    });
    expect(r3.statusCode).toBe(400);
  });
  it('error responses never leak internals', async () => {
    const r = await A.adminApp.inject({
      method: 'GET',
      url: '/admin/v1/versions/999999',
      headers: auth(tokens.REVIEWER),
    });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toMatch(/at .*\.ts|pg_|relation|syntax/i);
  });
});

describe('public API is read-only by construction', () => {
  it('registers only GET/HEAD routes', () => {
    const writes = A.publicApp.routeTable.filter((r) => !['GET', 'HEAD'].includes(r.method));
    expect(writes).toEqual([]);
  });
  it('rejects write methods and requires no authentication', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const r = await A.publicApp.inject({ method, url: '/api/v1/banis', payload: {} });
      expect([404, 405]).toContain(r.statusCode);
    }
    const r = await A.publicApp.inject({ method: 'GET', url: '/api/v1/banis' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toMatch(/default-src 'none'/);
  });
  it('the public database role cannot reach identity or draft data even through a hand-written query', async () => {
    // simulate a defective handler: the role, not the code, is the boundary
    const { withRole } = await import('@pothisahib/db');
    const pub = withRole(A.w.db, 'kosh_public');
    await expect(pub.query('SELECT * FROM users')).rejects.toThrow(/permission denied/);
    await expect(pub.query('SELECT * FROM accepted_versions')).rejects.toThrow(/permission denied/);
    await expect(
      pub.query(`INSERT INTO corpora (slug, name) VALUES ('evil', 'evil')`),
    ).rejects.toThrow(/permission denied/);
  });
});

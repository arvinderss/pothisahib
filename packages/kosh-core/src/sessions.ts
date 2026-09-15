/**
 * Opaque server-side sessions. The client holds a random bearer token; the server stores only
 * its SHA-256. Revocation therefore actually works (no self-contained JWT). Login failures are
 * counted per account in security_events (no IP is stored) and trigger a temporary lockout.
 */
import type { Db } from '@pothisahib/db';
import type { Principal } from '@pothisahib/domain';
import { randomUUID } from 'node:crypto';
import { audit } from './audit.ts';
import { iso, str, type KoshContext } from './context.ts';
import { randomToken, sha256 } from './crypto.ts';
import { UnauthorizedError } from './errors.ts';
import { verifyMfaCode } from './mfa.ts';
import { activeRoles, getUserByUsername, hashPassword, verifyPassword } from './users.ts';

export const SESSION_TTL_HOURS = 12;
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

let dummyHash: Promise<string> | null = null;
/** Used so unknown usernames take the same time as wrong passwords (R-19). */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken(24));
  return dummyHash;
}

export interface LoginInput {
  username: string;
  password: string;
  /** TOTP or recovery code; required when the account has confirmed MFA. */
  mfaCode?: string | null;
}

export interface Session {
  token: string;
  sessionId: string;
  expiresAt: string;
  principal: Principal;
}

async function failedAttempts(db: Db, userId: string): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM security_events WHERE user_id = $1 AND kind = 'LOGIN_FAILED' AND ts > now() - ($2 || ' minutes')::interval`,
    [userId, String(LOCKOUT_WINDOW_MINUTES)],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function recordFailure(
  db: Db,
  userId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `INSERT INTO security_events (kind, user_id, detail) VALUES ('LOGIN_FAILED', $1, $2::jsonb)`,
    [userId, JSON.stringify(detail)],
  );
}

const GENERIC = 'invalid credentials';

export async function login(ctx: KoshContext, input: LoginInput): Promise<Session> {
  const user = await getUserByUsername(ctx.db, input.username);
  if (!user || user.disabledAt) {
    await verifyPassword(await getDummyHash(), input.password); // constant-ish time
    throw new UnauthorizedError(GENERIC);
  }
  if ((await failedAttempts(ctx.db, user.id)) >= LOCKOUT_THRESHOLD) {
    await ctx.db.query(
      `INSERT INTO security_events (kind, user_id, detail) VALUES ('LOCKOUT', $1, '{}'::jsonb)`,
      [user.id],
    );
    throw new UnauthorizedError(
      'account temporarily locked after repeated failures; try again later',
    );
  }
  const pw = await ctx.db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [user.id],
  );
  const ok = await verifyPassword(pw.rows[0]?.password_hash ?? '', input.password);
  if (!ok) {
    await recordFailure(ctx.db, user.id, { reason: 'password' });
    throw new UnauthorizedError(GENERIC);
  }
  let mfaVerified = false;
  if (user.mfaConfirmed) {
    if (!input.mfaCode || !(await verifyMfaCode(ctx, user.id, input.mfaCode))) {
      await recordFailure(ctx.db, user.id, { reason: 'mfa' });
      throw new UnauthorizedError(GENERIC);
    }
    mfaVerified = true;
  }
  const token = randomToken(32);
  const sessionId = randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, mfa_verified, expires_at) VALUES ($1,$2,$3,$4,$5)`,
      [sessionId, user.id, sha256(token), mfaVerified, expires],
    );
    await audit(tx, {
      actorType: 'USER',
      actorId: user.id,
      action: 'LOGIN',
      objectType: 'session',
      objectId: null,
      after: { mfaVerified },
    });
  });
  return {
    token,
    sessionId,
    expiresAt: expires.toISOString(),
    principal: { userId: user.id, username: user.username, roles: user.roles, mfaVerified },
  };
}

/** Resolve a bearer token to a principal, or null. Roles are loaded fresh on every call. */
export async function resolveSession(db: Db, token: string): Promise<Principal | null> {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
  const r = await db.query<Record<string, unknown>>(
    `SELECT s.id, s.user_id, s.mfa_verified, s.expires_at, u.username, u.disabled_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  );
  const row = r.rows[0];
  if (!row || row['disabled_at'] !== null) return null;
  const userId = str(row['user_id']);
  return {
    userId,
    username: str(row['username']),
    roles: await activeRoles(db, userId),
    mfaVerified: Boolean(row['mfa_verified']),
  };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL',
    [sha256(token)],
  );
}

export async function revokeAllSessions(db: Db, userId: string): Promise<number> {
  const r = await db.query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
  return r.rowCount;
}

export { iso };

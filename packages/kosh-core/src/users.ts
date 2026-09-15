/**
 * Accounts: username + password only (no PII column exists). Argon2id hashing. Role grants are
 * append-only rows; the database refuses privileged grants without confirmed MFA and refuses
 * self-grants.
 */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Db } from '@pothisahib/db';
import { isPassword, isRole, isUsername, PRIVILEGED_ROLES, type Role } from '@pothisahib/domain';
import { audit } from './audit.ts';
import { iso, str, type Actor } from './context.ts';
import { BadRequestError, ConflictError, ForbiddenError, fromDb, NotFoundError } from './errors.ts';

/** OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1). The library default algorithm is Argon2id; asserted below. */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export async function hashPassword(password: string): Promise<string> {
  const h = await argonHash(password, ARGON);
  if (!h.startsWith('$argon2id$')) throw new Error('password hashing did not produce Argon2id');
  return h;
}
export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hashed, password);
  } catch {
    return false;
  }
}

export interface User {
  id: string;
  username: string;
  roles: Role[];
  mfaConfirmed: boolean;
  disabledAt: string | null;
  createdAt: string | null;
}

export async function getUserByUsername(db: Db, username: string): Promise<User | null> {
  if (!isUsername(username)) return null;
  const r = await db.query<Record<string, unknown>>('SELECT id FROM users WHERE username = $1', [
    username,
  ]);
  const row = r.rows[0];
  return row ? getUserById(db, str(row['id'])) : null;
}

export async function getUserById(db: Db, id: string): Promise<User | null> {
  const r = await db.query<Record<string, unknown>>(
    `SELECT u.id, u.username, u.disabled_at, u.created_at, (m.confirmed_at IS NOT NULL) AS mfa
     FROM users u LEFT JOIN user_mfa m ON m.user_id = u.id WHERE u.id = $1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: str(row['id']),
    username: str(row['username']),
    roles: await activeRoles(db, str(row['id'])),
    mfaConfirmed: Boolean(row['mfa']),
    disabledAt: iso(row['disabled_at']),
    createdAt: iso(row['created_at']),
  };
}

export async function activeRoles(db: Db, userId: string): Promise<Role[]> {
  const r = await db.query<{ role: string }>(
    'SELECT role FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
  return r.rows.map((x) => x.role).filter(isRole);
}

export async function createUser(
  db: Db,
  input: { username: string; password: string },
  actor?: Actor,
): Promise<User> {
  if (!isUsername(input.username))
    throw new BadRequestError('username must be 3-32 chars of letters, digits, _ . -');
  if (!isPassword(input.password)) throw new BadRequestError('password must be 12-256 characters');
  const pw = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    let r;
    try {
      r = await tx.query<{ id: unknown }>(
        'INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id',
        [input.username, pw],
      );
    } catch (e) {
      fromDb(e);
    }
    const id = str(r.rows[0]?.id);
    await audit(tx, {
      actorType: actor ? 'USER' : 'SYSTEM',
      actorId: actor?.userId ?? null,
      action: 'USER_CREATE',
      objectType: 'user',
      objectId: id,
      after: { username: input.username },
    });
    return (await getUserById(tx, id)) as User;
  });
}

export async function listUsers(db: Db): Promise<User[]> {
  const r = await db.query<{ id: unknown }>('SELECT id FROM users ORDER BY id');
  const out: User[] = [];
  for (const row of r.rows) {
    const u = await getUserById(db, str(row.id));
    if (u) out.push(u);
  }
  return out;
}

/** Grant a role. Only a SUPER_ADMIN actor may call this (checked by the API); DB refuses self-grant and MFA-less privileged grants. */
export async function grantRole(
  db: Db,
  input: { username: string; role: Role; reason?: string | null },
  actor: Actor,
): Promise<User> {
  if (!isRole(input.role)) throw new BadRequestError('invalid role');
  return db.transaction(async (tx) => {
    const target = await getUserByUsername(tx, input.username);
    if (!target) throw new NotFoundError('user');
    if (target.id === actor.userId)
      throw new ForbiddenError('accounts cannot grant roles to themselves');
    if (target.roles.includes(input.role)) throw new ConflictError('role already granted');
    try {
      await tx.query(
        'INSERT INTO user_roles (user_id, role, granted_by, reason) VALUES ($1,$2,$3,$4)',
        [target.id, input.role, actor.userId, input.reason ?? null],
      );
    } catch (e) {
      fromDb(e);
    }
    return (await getUserById(tx, target.id)) as User;
  });
}

export async function revokeRole(
  db: Db,
  input: { username: string; role: Role; reason?: string | null },
  actor: Actor,
): Promise<User> {
  if (!isRole(input.role)) throw new BadRequestError('invalid role');
  return db.transaction(async (tx) => {
    const target = await getUserByUsername(tx, input.username);
    if (!target) throw new NotFoundError('user');
    if (target.id === actor.userId && input.role === 'SUPER_ADMIN')
      throw new ForbiddenError('a Super Admin cannot revoke their own Super Admin role');
    const r = await tx.query(
      `UPDATE user_roles SET revoked_at = now(), revoked_by = $3, reason = COALESCE($4, reason)
       WHERE user_id = $1 AND role = $2 AND revoked_at IS NULL`,
      [target.id, input.role, actor.userId, input.reason ?? null],
    );
    if (r.rowCount === 0) throw new NotFoundError('active role grant');
    return (await getUserById(tx, target.id)) as User;
  });
}

/**
 * First-run bootstrap: grant SUPER_ADMIN with no granting account. Permitted only while NO active
 * SUPER_ADMIN exists, and only for an account with confirmed MFA (database trigger).
 */
export async function bootstrapSuperAdmin(db: Db, username: string): Promise<User> {
  return db.transaction(async (tx) => {
    const existing = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_roles WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
    );
    if (Number(existing.rows[0]?.n) > 0)
      throw new ForbiddenError('a Super Admin already exists; use the normal grant path');
    const target = await getUserByUsername(tx, username);
    if (!target) throw new NotFoundError('user');
    try {
      await tx.query(
        `INSERT INTO user_roles (user_id, role, granted_by, reason) VALUES ($1, 'SUPER_ADMIN', NULL, 'bootstrap')`,
        [target.id],
      );
    } catch (e) {
      fromDb(e);
    }
    return (await getUserById(tx, target.id)) as User;
  });
}

export function isPrivileged(roles: readonly Role[]): boolean {
  return roles.some((r) => PRIVILEGED_ROLES.includes(r));
}

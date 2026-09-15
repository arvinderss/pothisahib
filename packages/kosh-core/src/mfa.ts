/**
 * TOTP MFA for EDITOR and SUPER_ADMIN accounts (SRS §40). The secret is encrypted at rest with
 * KOSH_MFA_KEY. Recovery is by software one-time codes only (no hardware keys, Q2 §20); the codes
 * are shown exactly once and stored hashed.
 */
import type { Db } from '@pothisahib/db';
import { audit } from './audit.ts';
import { bytes, str, type KoshContext } from './context.ts';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from './crypto.ts';
import { ConflictError, NotFoundError, UnauthorizedError } from './errors.ts';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp.ts';

export const MFA_ISSUER = 'Gurbani Kosh';

export interface Enrollment {
  secretBase32: string;
  otpauthUri: string;
}

export async function enrollMfa(ctx: KoshContext, userId: string): Promise<Enrollment> {
  return ctx.db.transaction(async (tx) => {
    const u = await tx.query<{ username: string }>('SELECT username FROM users WHERE id = $1', [
      userId,
    ]);
    const user = u.rows[0];
    if (!user) throw new NotFoundError('user');
    const cur = await tx.query<{ confirmed_at: unknown }>(
      'SELECT confirmed_at FROM user_mfa WHERE user_id = $1',
      [userId],
    );
    if (cur.rows[0] && cur.rows[0].confirmed_at !== null)
      throw new ConflictError(
        'MFA is already confirmed; a Super Admin must reset it before re-enrolment',
      );
    const secret = generateTotpSecret();
    const enc = encryptSecret(secret, ctx.mfaKey);
    if (cur.rows[0]) {
      await tx.query(
        'UPDATE user_mfa SET totp_secret_encrypted = $2, created_at = now() WHERE user_id = $1',
        [userId, enc],
      );
    } else {
      await tx.query('INSERT INTO user_mfa (user_id, totp_secret_encrypted) VALUES ($1, $2)', [
        userId,
        enc,
      ]);
    }
    await audit(tx, {
      actorType: 'USER',
      actorId: userId,
      action: 'MFA_ENROLL_START',
      objectType: 'user',
      objectId: userId,
    });
    return {
      secretBase32: base32Encode(secret),
      otpauthUri: otpauthUri(MFA_ISSUER, user.username, secret),
    };
  });
}

async function loadSecret(
  db: Db,
  userId: string,
  key: string,
): Promise<{ secret: Buffer; confirmed: boolean; recovery: string[] } | null> {
  const r = await db.query<Record<string, unknown>>(
    'SELECT totp_secret_encrypted, confirmed_at, recovery_codes_hash FROM user_mfa WHERE user_id = $1',
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    secret: decryptSecret(bytes(row['totp_secret_encrypted']), key),
    confirmed: row['confirmed_at'] !== null,
    recovery: (row['recovery_codes_hash'] as string[] | null) ?? [],
  };
}

/** Confirm enrolment with a live code; returns the one-time recovery codes (shown once). */
export async function confirmMfa(
  ctx: KoshContext,
  userId: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  return ctx.db.transaction(async (tx) => {
    const m = await loadSecret(tx, userId, ctx.mfaKey);
    if (!m) throw new NotFoundError('MFA enrolment');
    if (m.confirmed) throw new ConflictError('MFA already confirmed');
    if (!verifyTotp(m.secret, code, (ctx.now?.() ?? new Date()).getTime() / 1000))
      throw new UnauthorizedError('invalid code');
    const codes = Array.from({ length: 8 }, () => randomToken(10));
    await tx.query(
      'UPDATE user_mfa SET confirmed_at = now(), recovery_codes_hash = $2 WHERE user_id = $1',
      [userId, codes.map((c) => sha256Hex(c))],
    );
    await audit(tx, {
      actorType: 'USER',
      actorId: userId,
      action: 'MFA_CONFIRM',
      objectType: 'user',
      objectId: userId,
    });
    return { recoveryCodes: codes };
  });
}

/** Verify a TOTP code, or consume a recovery code. Returns false on failure; never throws for wrong codes. */
export async function verifyMfaCode(
  ctx: KoshContext,
  userId: string,
  code: string,
): Promise<boolean> {
  return ctx.db.transaction(async (tx) => {
    const m = await loadSecret(tx, userId, ctx.mfaKey);
    if (!m || !m.confirmed) return false;
    if (verifyTotp(m.secret, code, (ctx.now?.() ?? new Date()).getTime() / 1000)) return true;
    const h = sha256Hex(code);
    if (m.recovery.includes(h)) {
      await tx.query(
        'UPDATE user_mfa SET recovery_codes_hash = array_remove(recovery_codes_hash, $2) WHERE user_id = $1',
        [userId, h],
      );
      await audit(tx, {
        actorType: 'USER',
        actorId: userId,
        action: 'MFA_RECOVERY_CODE_USED',
        objectType: 'user',
        objectId: userId,
      });
      return true;
    }
    return false;
  });
}

export async function mfaConfirmed(db: Db, userId: string): Promise<boolean> {
  const r = await db.query<{ ok: boolean }>(
    'SELECT (confirmed_at IS NOT NULL) AS ok FROM user_mfa WHERE user_id = $1',
    [userId],
  );
  return Boolean(r.rows[0]?.ok);
}

/** Test/ops helper: the decrypted secret, for generating codes in tests and for operator recovery flows. */
export async function mfaSecretFor(ctx: KoshContext, userId: string): Promise<Buffer | null> {
  const m = await loadSecret(ctx.db, userId, ctx.mfaKey);
  return m ? m.secret : null;
}

export { str };

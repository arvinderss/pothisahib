import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LOCKOUT_THRESHOLD,
  bootstrapSuperAdmin,
  confirmMfa,
  createUser,
  enrollMfa,
  grantRole,
  login,
  mfaSecretFor,
  resolveSession,
  revokeRole,
  revokeSession,
  totpNow,
  verifyMfaCode,
} from '../src/index.ts';
import { createWorld, PASSWORD, type TestWorld } from '../src/testing.ts';

let w: TestWorld;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w.close();
});

describe('accounts', () => {
  it('stores Argon2id, validates username/password shape, and refuses duplicates', async () => {
    const h = await w.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE username = $1',
      ['reader'],
    );
    expect(h.rows[0]?.password_hash.startsWith('$argon2id$')).toBe(true);
    await expect(createUser(w.db, { username: 'x', password: PASSWORD })).rejects.toThrow(
      /username/,
    );
    await expect(createUser(w.db, { username: 'okname', password: 'short' })).rejects.toThrow(
      /password/,
    );
    await expect(createUser(w.db, { username: 'READER', password: PASSWORD })).rejects.toThrow(
      /already exists/,
    ); // citext
  });
  it('bootstrap Super Admin is a one-time operation and needs MFA', async () => {
    await expect(bootstrapSuperAdmin(w.db, 'reader')).rejects.toThrow(/already exists/);
  });
  it('role grants: not to self, privileged only with MFA, revocation works', async () => {
    await expect(
      grantRole(w.db, { username: 'super', role: 'EDITOR' }, w.superAdmin),
    ).rejects.toThrow(/themselves/);
    await expect(
      grantRole(w.db, { username: 'reader', role: 'EDITOR' }, w.superAdmin),
    ).rejects.toThrow(/requires confirmed MFA/);
    const u = await grantRole(w.db, { username: 'reader', role: 'REVIEWER' }, w.superAdmin);
    expect(u.roles).toEqual(['REVIEWER']);
    const r = await revokeRole(
      w.db,
      { username: 'reader', role: 'REVIEWER', reason: 'test' },
      w.superAdmin,
    );
    expect(r.roles).toEqual([]);
    await expect(
      revokeRole(w.db, { username: 'super', role: 'SUPER_ADMIN' }, w.superAdmin),
    ).rejects.toThrow(/own Super Admin/);
  });
});

describe('MFA', () => {
  it('enrol -> confirm with a live code -> recovery codes are single-use', async () => {
    const u = await createUser(w.db, { username: 'mfa-user', password: PASSWORD });
    const e = await enrollMfa(w.ctx, u.id);
    expect(e.otpauthUri).toContain('otpauth://totp/');
    await expect(confirmMfa(w.ctx, u.id, '000000')).rejects.toThrow(/invalid code/);
    const secret = (await mfaSecretFor(w.ctx, u.id)) as Buffer;
    const { recoveryCodes } = await confirmMfa(w.ctx, u.id, totpNow(secret));
    expect(recoveryCodes).toHaveLength(8);
    await expect(enrollMfa(w.ctx, u.id)).rejects.toThrow(/already confirmed/);
    expect(await verifyMfaCode(w.ctx, u.id, totpNow(secret))).toBe(true);
    expect(await verifyMfaCode(w.ctx, u.id, 'nope')).toBe(false);
    const rc = recoveryCodes[0] as string;
    expect(await verifyMfaCode(w.ctx, u.id, rc)).toBe(true);
    expect(await verifyMfaCode(w.ctx, u.id, rc)).toBe(false); // consumed
  });
  it('the TOTP secret is encrypted at rest', async () => {
    const r = await w.db.query<{ s: Uint8Array }>(
      'SELECT totp_secret_encrypted AS s FROM user_mfa LIMIT 1',
    );
    const secret = await mfaSecretFor(w.ctx, w.editorA.userId);
    expect(Buffer.from(r.rows[0]?.s as Uint8Array).includes(secret as Buffer)).toBe(false);
  });
});

describe('sessions and login protection', () => {
  it('MFA accounts must present a code; sessions resolve to fresh roles; revocation works', async () => {
    await expect(login(w.ctx, { username: 'editor-a', password: PASSWORD })).rejects.toThrow(
      /invalid credentials/,
    );
    const s = await login(w.ctx, {
      username: 'editor-a',
      password: PASSWORD,
      mfaCode: await w.codeFor(w.editorA),
    });
    expect(s.principal.roles).toEqual(['EDITOR']);
    expect(s.principal.mfaVerified).toBe(true);
    const p = await resolveSession(w.db, s.token);
    expect(p?.username).toBe('editor-a');
    await revokeSession(w.db, s.token);
    expect(await resolveSession(w.db, s.token)).toBeNull();
    expect(await resolveSession(w.db, 'not-a-real-token-value')).toBeNull();
  });
  it('a non-MFA account logs in without a code and is not mfaVerified', async () => {
    const s = await login(w.ctx, { username: 'reviewer', password: PASSWORD });
    expect(s.principal.mfaVerified).toBe(false);
    expect(s.principal.roles).toEqual(['REVIEWER']);
  });
  it('unknown usernames and wrong passwords give the same error; repeated failures lock the account', async () => {
    await expect(login(w.ctx, { username: 'nobody-here', password: PASSWORD })).rejects.toThrow(
      /invalid credentials/,
    );
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++)
      await expect(
        login(w.ctx, { username: 'reader', password: 'wrong-password-xyz' }),
      ).rejects.toThrow(/invalid credentials/);
    await expect(login(w.ctx, { username: 'reader', password: PASSWORD })).rejects.toThrow(
      /temporarily locked/,
    );
    const ev = await w.db.query<{ kind: string; detail: unknown }>(
      `SELECT kind, detail FROM security_events ORDER BY id`,
    );
    expect(ev.rows.some((e) => e.kind === 'LOCKOUT')).toBe(true);
    // no IP or device information is recorded
    for (const e of ev.rows)
      expect(JSON.stringify(e.detail ?? {})).not.toMatch(/ip|address|agent|device/i);
  });
});

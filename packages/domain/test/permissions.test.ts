import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  can,
  effectiveRole,
  minimumRoleFor,
  roleAtLeast,
  type Principal,
  type Role,
} from '../src/index.ts';

const p = (roles: Role[], mfa = true): Principal => ({
  userId: '1',
  username: 'u',
  roles,
  mfaVerified: mfa,
});

describe('permission matrix', () => {
  it('anonymous can do nothing privileged', () => {
    for (const a of ACTIONS) expect(can(null, a)).toBe(false);
  });
  it('USER and REVIEWER cannot publish, approve, ingest or grant', () => {
    for (const r of ['USER', 'REVIEWER'] as Role[]) {
      expect(can(p([r]), 'version.approve')).toBe(false);
      expect(can(p([r]), 'version.publish')).toBe(false);
      expect(can(p([r]), 'snapshot.ingest')).toBe(false);
      expect(can(p([r]), 'user.grant_role')).toBe(false);
    }
  });
  it('REVIEWER may read admin views', () => {
    expect(can(p(['REVIEWER']), 'admin.read')).toBe(true);
    expect(can(p(['USER']), 'admin.read')).toBe(false);
  });
  it('EDITOR may approve/publish but never grant roles', () => {
    expect(can(p(['EDITOR']), 'version.approve')).toBe(true);
    expect(can(p(['EDITOR']), 'version.publish')).toBe(true);
    expect(can(p(['EDITOR']), 'user.grant_role')).toBe(false);
  });
  it('SUPER_ADMIN may do everything', () => {
    for (const a of ACTIONS) expect(can(p(['SUPER_ADMIN']), a)).toBe(true);
  });
  it('privileged actions require an MFA-verified session even for SUPER_ADMIN', () => {
    expect(can(p(['SUPER_ADMIN'], false), 'version.publish')).toBe(false);
    expect(can(p(['EDITOR'], false), 'version.approve')).toBe(false);
    expect(can(p(['REVIEWER'], false), 'admin.read')).toBe(true); // REVIEWER-level reads do not
  });
  it('effective role is the highest active grant', () => {
    expect(effectiveRole([])).toBe('USER');
    expect(effectiveRole(['REVIEWER', 'EDITOR'])).toBe('EDITOR');
    expect(roleAtLeast('EDITOR', 'REVIEWER')).toBe(true);
    expect(roleAtLeast('REVIEWER', 'EDITOR')).toBe(false);
    expect(minimumRoleFor('user.grant_role')).toBe('SUPER_ADMIN');
  });
});

/** Exactly four roles (SRS §31). Ordered by privilege; a higher role implies the lower ones. */
export const ROLES = ['USER', 'REVIEWER', 'EDITOR', 'SUPER_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const PRIVILEGED_ROLES: readonly Role[] = ['EDITOR', 'SUPER_ADMIN'];
/** Roles whose accounts must complete TOTP MFA (SRS §40). */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['EDITOR', 'SUPER_ADMIN'];

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

const RANK: Record<Role, number> = { USER: 0, REVIEWER: 1, EDITOR: 2, SUPER_ADMIN: 3 };

/** Highest role among a set of active grants; every account is at least USER. */
export function effectiveRole(granted: readonly Role[]): Role {
  let best: Role = 'USER';
  for (const r of granted) if (RANK[r] > RANK[best]) best = r;
  return best;
}

export function roleAtLeast(have: Role, need: Role): boolean {
  return RANK[have] >= RANK[need];
}

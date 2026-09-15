import { effectiveRole, roleAtLeast, type Role } from './roles.ts';

/**
 * The server-side permission matrix. Every privileged route consults `can()`; the UI never
 * decides. Actions are deliberately coarse and named after the product operation.
 */
export const ACTIONS = [
  // registry and ingestion
  'source.register',
  'source.update',
  'snapshot.ingest',
  'snapshot.parse',
  // corpus structure and accepted text
  'structure.bootstrap',
  'version.create_draft',
  'version.approve',
  'version.publish',
  'version.rollback',
  // identity
  'user.grant_role',
  'user.revoke_role',
  'user.list',
  // reading the administrative views
  'admin.read',
] as const;
export type Action = (typeof ACTIONS)[number];

const MIN_ROLE: Record<Action, Role> = {
  'source.register': 'EDITOR',
  'source.update': 'EDITOR',
  'snapshot.ingest': 'EDITOR',
  'snapshot.parse': 'EDITOR',
  'structure.bootstrap': 'EDITOR',
  'version.create_draft': 'EDITOR',
  'version.approve': 'EDITOR',
  'version.publish': 'EDITOR',
  'version.rollback': 'EDITOR',
  'user.grant_role': 'SUPER_ADMIN',
  'user.revoke_role': 'SUPER_ADMIN',
  'user.list': 'SUPER_ADMIN',
  'admin.read': 'REVIEWER',
};

export interface Principal {
  userId: string;
  username: string;
  roles: readonly Role[];
  mfaVerified: boolean;
}

export function can(p: Principal | null, action: Action): boolean {
  if (!p) return false;
  const role = effectiveRole(p.roles);
  if (!roleAtLeast(role, MIN_ROLE[action])) return false;
  // Privileged actions additionally require an MFA-verified session (SRS §40).
  if (roleAtLeast(MIN_ROLE[action], 'EDITOR') && !p.mfaVerified) return false;
  return true;
}

export function minimumRoleFor(action: Action): Role {
  return MIN_ROLE[action];
}

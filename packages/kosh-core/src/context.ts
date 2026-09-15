import type { Db } from '@pothisahib/db';
import type { ObjectStore } from './storage.ts';

/** Everything a service function needs. Constructed once per process (or per test). */
export interface KoshContext {
  db: Db;
  store: ObjectStore;
  /** Secret used to encrypt TOTP secrets at rest (env KOSH_MFA_KEY). */
  mfaKey: string;
  /** Clock, injectable for tests. */
  now?: () => Date;
}

export interface Actor {
  userId: string;
  username: string;
}

/** Row helpers: drivers differ slightly in how they surface types. */
export const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
export const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
export const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
export const bytes = (v: unknown): Buffer =>
  Buffer.isBuffer(v) ? v : Buffer.from(v as Uint8Array);

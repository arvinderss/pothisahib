/** State vocabularies mirrored from the database enums (corpus/migrations). Keep in sync. */
export const VERIFICATION_STATES = ['SOURCE_ONLY', 'PROVISIONAL', 'REVIEWED', 'LOCKED'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const ACCEPTED_STATUSES = ['DRAFT', 'PUBLISHED', 'SUPERSEDED'] as const;
export type AcceptedStatus = (typeof ACCEPTED_STATUSES)[number];

export const ACCEPTED_BASES = [
  'SOURCE_ADOPTION',
  'REVIEWED_CORRECTION',
  'ROLLBACK',
  'STRUCTURE_REVISION',
] as const;
export type AcceptedBasis = (typeof ACCEPTED_BASES)[number];

export const DECISION_KINDS = [
  'SOURCE_ADOPTION',
  'CORRECTION',
  'ROLLBACK',
  'STRUCTURE_REVISION',
  'LOCK',
  'UNLOCK',
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const SOURCE_TYPES = [
  'DATABASE',
  'API',
  'WEBSITE',
  'HTML',
  'PDF',
  'IMAGE',
  'MANUSCRIPT',
  'PRINTED_BOOK',
  'AUDIO',
  'VIDEO',
  'OTHER',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const REDISTRIBUTION = ['UNKNOWN', 'PROHIBITED', 'ATTRIBUTION_REQUIRED', 'ALLOWED'] as const;
export type Redistribution = (typeof REDISTRIBUTION)[number];
/** Only these two statuses permit text to reach the public API or be adopted (RISK_REGISTER R-03). */
export const REDISTRIBUTABLE: readonly Redistribution[] = ['ALLOWED', 'ATTRIBUTION_REQUIRED'];

export const SOURCE_STATUSES = ['PROPOSED', 'ACTIVE', 'SUSPENDED', 'RETIRED'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** Input formats the ingestion parser understands in Milestone 1. */
export const SNAPSHOT_FORMATS = ['txt', 'kosh-source-v1', 'shabados-sqlite-v1'] as const;
export type SnapshotFormat = (typeof SNAPSHOT_FORMATS)[number];

export function oneOf<T extends readonly string[]>(values: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (values as readonly string[]).includes(v);
}

import type { Db } from '@pothisahib/db';

export interface AuditEntry {
  actorType: 'USER' | 'ANON' | 'SYSTEM';
  actorId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  decisionId?: string | null;
}

/** Append one audit row in the caller's transaction. The table refuses UPDATE/DELETE. */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_type, actor_id, action, object_type, object_id, before, after, reason, decision_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      e.actorType,
      e.actorType === 'SYSTEM' ? null : (e.actorId ?? null),
      e.action,
      e.objectType,
      e.objectId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      e.reason ?? null,
      e.decisionId ?? null,
    ],
  );
}

/**
 * Shared test scaffolding for kosh-core and the API tests: a fresh database, an in-memory object
 * store, and accounts in each role with MFA where required. All text is SYNTHETIC TEST DATA from
 * packages/gurmukhi/fixtures — never Gurbani corpus data.
 */
import { readFileSync } from 'node:fs';
import type { Db } from '@pothisahib/db';
import { createTestDb } from '@pothisahib/db/testing';
import type { Role } from '@pothisahib/domain';
import {
  MemoryObjectStore,
  bootstrapSuperAdmin,
  confirmMfa,
  createUser,
  enrollMfa,
  grantRole,
  mfaSecretFor,
  totpNow,
  type Actor,
  type KoshContext,
} from './index.ts';

export const PASSWORD = 'correct-horse-battery-staple';

export const FIXTURES = JSON.parse(
  readFileSync(
    new URL('../../gurmukhi/fixtures/unicode-adversarial.json', import.meta.url),
    'utf8',
  ),
) as { recover_cases: string[]; diff_cases: { id: string; a: string; b: string }[] };

/** Synthetic line set covering every adversarial case. */
export const SAMPLE_LINES: string[] = [
  ...FIXTURES.recover_cases,
  ...FIXTURES.diff_cases.flatMap((c) => [c.a, c.b]),
].filter((s) => !s.includes('\n'));

export function koshSourceDocument(
  locator: string,
  lines: string[],
  title = 'SYNTHETIC TEST DOCUMENT',
): Uint8Array {
  const half = Math.ceil(lines.length / 2);
  const doc = {
    format: 'kosh-source/1',
    documents: [
      {
        locator,
        title,
        metadata: { notice: 'SYNTHETIC TEST DATA - NOT Gurbani corpus data' },
        sections: [
          {
            type: 'PAURI',
            label: '1',
            lines: lines.slice(0, half).map((text, i) => ({ text, locator: { n: i } })),
          },
          {
            type: 'PAURI',
            label: '2',
            sections: [
              {
                type: 'SALOK',
                lines: lines.slice(half).map((text, i) => ({ text, locator: { n: half + i } })),
              },
            ],
          },
        ],
      },
    ],
  };
  return new TextEncoder().encode(JSON.stringify(doc));
}

export interface TestWorld {
  db: Db;
  ctx: KoshContext;
  superAdmin: Actor;
  editorA: Actor;
  editorB: Actor;
  reviewer: Actor;
  user: Actor;
  /** current TOTP code for an MFA-enrolled account */
  codeFor(actor: Actor): Promise<string>;
  close(): Promise<void>;
}

export async function createWorld(): Promise<TestWorld> {
  const db = await createTestDb();
  const ctx: KoshContext = { db, store: new MemoryObjectStore(), mfaKey: 'test-mfa-key' };

  const mk = async (username: string): Promise<Actor> => {
    const u = await createUser(db, { username, password: PASSWORD });
    return { userId: u.id, username: u.username };
  };
  const enrol = async (a: Actor): Promise<void> => {
    await enrollMfa(ctx, a.userId);
    const secret = (await mfaSecretFor(ctx, a.userId)) as Buffer;
    await confirmMfa(ctx, a.userId, totpNow(secret));
  };
  const superAdmin = await mk('super');
  await enrol(superAdmin);
  await bootstrapSuperAdmin(db, 'super');
  const editorA = await mk('editor-a');
  const editorB = await mk('editor-b');
  await enrol(editorA);
  await enrol(editorB);
  const reviewer = await mk('reviewer');
  const user = await mk('reader');
  const grantAs = (a: Actor, role: Role): Promise<unknown> =>
    grantRole(db, { username: a.username, role }, superAdmin);
  await grantAs(editorA, 'EDITOR');
  await grantAs(editorB, 'EDITOR');
  await grantAs(reviewer, 'REVIEWER');

  return {
    db,
    ctx,
    superAdmin,
    editorA,
    editorB,
    reviewer,
    user,
    async codeFor(actor) {
      const secret = await mfaSecretFor(ctx, actor.userId);
      if (!secret) throw new Error('no mfa');
      return totpNow(secret);
    },
    close: () => db.close(),
  };
}

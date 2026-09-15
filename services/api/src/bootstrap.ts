import { openDb, withRole, type Db } from '@pothisahib/db';
import { FsObjectStore, type KoshContext } from '@pothisahib/kosh-core';
import type { ApiConfig } from './config.ts';

/** Database handle for the public API: a dedicated kosh_public login when configured, else SET ROLE. */
export async function openPublicDb(cfg: ApiConfig): Promise<Db> {
  if (cfg.publicDatabaseUrl) return openDb(cfg.publicDatabaseUrl);
  return withRole(await openDb(cfg.databaseUrl), 'kosh_public');
}

/** Context for the admin API: kosh_app role, filesystem object store, MFA key. */
export async function openAdminContext(cfg: ApiConfig): Promise<KoshContext> {
  const db = cfg.appDatabaseUrl
    ? await openDb(cfg.appDatabaseUrl)
    : withRole(await openDb(cfg.databaseUrl), 'kosh_app');
  return { db, store: new FsObjectStore(cfg.objectStoreDir), mfaKey: cfg.mfaKey };
}

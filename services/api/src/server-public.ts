import { loadDotEnv } from '@pothisahib/kosh-core';
import { loadConfig } from './config.ts';
import { openPublicDb } from './bootstrap.ts';
import { buildPublicApp } from './public/app.ts';

loadDotEnv();
const cfg = loadConfig();
const db = await openPublicDb(cfg);
const app = await buildPublicApp({ db, corsOrigin: cfg.publicCorsOrigin, logger: true });
await app.listen({ port: cfg.publicPort, host: cfg.publicHost });
app.log.info(`public API listening on http://${cfg.publicHost}:${cfg.publicPort}/api/docs`);

const shutdown = async (): Promise<void> => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

import { loadConfig } from './config.ts';
import { openAdminContext } from './bootstrap.ts';
import { buildAdminApp } from './admin/app.ts';

const cfg = loadConfig();
const ctx = await openAdminContext(cfg);
const app = await buildAdminApp({ ctx, logger: true });
await app.listen({ port: cfg.adminPort, host: cfg.adminHost });
app.log.info(`admin API listening on http://${cfg.adminHost}:${cfg.adminPort}/admin/docs`);

const shutdown = async (): Promise<void> => {
  await app.close();
  await ctx.db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

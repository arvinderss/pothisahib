/**
 * Environment-based configuration (Instruction §46). Nothing here is hard-coded; see .env.example.
 */
export interface ApiConfig {
  /** Owner/migrator connection (or a pglite:// path for zero-setup development). */
  databaseUrl: string;
  /** Dedicated kosh_public login. When absent the public API uses SET ROLE kosh_public on databaseUrl. */
  publicDatabaseUrl: string | null;
  /** Dedicated kosh_app login. When absent the admin API uses SET ROLE kosh_app on databaseUrl. */
  appDatabaseUrl: string | null;
  mfaKey: string;
  objectStoreDir: string;
  publicPort: number;
  adminPort: number;
  publicHost: string;
  adminHost: string;
  /** Comma-separated origins allowed to call the public API cross-origin; '*' for any (read-only API). */
  publicCorsOrigin: string;
}

function port(v: string | undefined, dflt: number): number {
  const n = v === undefined ? dflt : Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid port: ${v}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required (postgres://… or pglite://./.data/kosh)');
  const mfaKey = env['KOSH_MFA_KEY'];
  if (!mfaKey || mfaKey.length < 16) {
    if (databaseUrl.startsWith('pglite://')) {
      console.warn(
        'KOSH_MFA_KEY not set; using an INSECURE development key because the database is PGlite',
      );
    } else {
      throw new Error('KOSH_MFA_KEY (>= 16 chars) is required');
    }
  }
  return {
    databaseUrl,
    publicDatabaseUrl: env['PUBLIC_DATABASE_URL'] ?? null,
    appDatabaseUrl: env['APP_DATABASE_URL'] ?? null,
    mfaKey: mfaKey && mfaKey.length >= 16 ? mfaKey : 'dev-insecure-mfa-key-0000',
    objectStoreDir: env['KOSH_OBJECT_STORE_DIR'] ?? '.data/objects',
    publicPort: port(env['PUBLIC_API_PORT'], 8080),
    adminPort: port(env['ADMIN_API_PORT'], 8081),
    publicHost: env['PUBLIC_API_HOST'] ?? '0.0.0.0',
    // the admin API binds to loopback unless explicitly exposed (it should sit behind the reverse proxy / VPN)
    adminHost: env['ADMIN_API_HOST'] ?? '127.0.0.1',
    publicCorsOrigin: env['PUBLIC_CORS_ORIGIN'] ?? '*',
  };
}

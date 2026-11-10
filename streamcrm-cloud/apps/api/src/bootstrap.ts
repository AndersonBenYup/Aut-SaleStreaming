import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { connect, disconnect, runMigrations } from './db/index.js';
import { logger } from './lib/logger.js';

export const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Conecta a DATABASE_URL o, en desarrollo, levanta Postgres embebido en apps/api/.pgdata. Aplica migraciones. */
export async function bootDatabase() {
  let url = env().DATABASE_URL;
  let stopEmbedded: (() => Promise<void>) | undefined;
  if (!url) {
    if (env().NODE_ENV === 'production') throw new Error('DATABASE_URL es obligatorio en producción');
    // Import dinámico: embedded-postgres es solo de desarrollo y no se instala en producción.
    const { startEmbeddedPostgres } = await import('./db/embedded.js');
    const pg = await startEmbeddedPostgres({ dataDir: path.join(apiRoot, '.pgdata'), port: 54320, persistent: true });
    url = pg.url;
    stopEmbedded = pg.stop;
    logger.info('Postgres embebido en el puerto 54320 (datos en apps/api/.pgdata)');
  }
  const target = new URL(url);
  logger.info(`Conectando a Postgres en ${target.hostname}:${target.port || 5432} (usuario ${decodeURIComponent(target.username)})`);
  connect(url);
  await runMigrations();
  logger.info('Base de datos lista (migraciones aplicadas)');
  return {
    url,
    async close() {
      await disconnect();
      await stopEmbedded?.();
    },
  };
}

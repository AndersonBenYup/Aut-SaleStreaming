import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const DB_NAME = 'streamcrm';

async function isUp(port: number) {
  const client = new pg.Client({ connectionString: `postgres://postgres:postgres@localhost:${port}/postgres`, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

async function ensureDatabase(client: pg.Client) {
  const { rows } = await client.query<{ enc: string }>(
    'select pg_encoding_to_char(encoding) as enc from pg_database where datname = $1',
    [DB_NAME],
  );
  if (!rows.length) {
    // En Windows initdb usa WIN1252 por defecto: se fuerza UTF-8 para tildes, ñ y emojis.
    await client.query(`create database ${DB_NAME} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  } else if (rows[0]!.enc !== 'UTF8') {
    await client.end();
    throw new Error(
      `La base "${DB_NAME}" del Postgres embebido no es UTF-8 (${rows[0]!.enc}). ` +
        'Borra la carpeta apps/api/.pgdata (solo datos de desarrollo) y vuelve a ejecutar npm run seed.',
    );
  }
  await client.end();
}

/**
 * Postgres 16 real, descargado como paquete npm. Solo para desarrollo y tests:
 * en producción se usa DATABASE_URL (docker-compose, Railway, etc.).
 * Si ya hay uno corriendo en el puerto (p. ej. quedó vivo tras cerrar la terminal), se reutiliza.
 */
export async function startEmbeddedPostgres(opts: { dataDir: string; port: number; persistent: boolean }) {
  const url = `postgres://postgres:postgres@localhost:${opts.port}/${DB_NAME}`;
  const running = await isUp(opts.port);
  if (running) {
    await ensureDatabase(running);
    return { url, stop: async () => undefined };
  }
  const server = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user: 'postgres',
    password: 'postgres',
    port: opts.port,
    persistent: opts.persistent,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
  });
  if (!existsSync(`${opts.dataDir}/PG_VERSION`)) await server.initialise();
  await server.start();
  const client = await isUp(opts.port);
  if (!client) throw new Error(`Postgres embebido no responde en el puerto ${opts.port}`);
  await ensureDatabase(client);
  return { url, stop: () => server.stop() };
}

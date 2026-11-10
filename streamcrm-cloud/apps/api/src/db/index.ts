import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let db: Db | undefined;

/** Postgres gestionado (Supabase, Render) exige SSL; su CA no está en el almacén de Node, así que no se verifica. */
export function pgSsl(databaseUrl: string): pg.PoolConfig['ssl'] {
  const host = new URL(databaseUrl).hostname;
  return host === 'localhost' || host === '127.0.0.1' ? undefined : { rejectUnauthorized: false };
}

export function connect(databaseUrl: string): Db {
  // Pool chico: el pooler de Supabase (modo sesión) en plan free admite pocas conexiones y pg-boss usa las suyas.
  pool = new pg.Pool({ connectionString: databaseUrl, max: 5, ssl: pgSsl(databaseUrl) });
  db = drizzle(pool, { schema });
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('Base de datos no inicializada: llama a connect() primero');
  return db;
}

export const getPool = () => {
  if (!pool) throw new Error('Base de datos no inicializada');
  return pool;
};

export const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export async function runMigrations(d: Db = getDb()) {
  await migrate(d, { migrationsFolder });
}

export async function disconnect() {
  await pool?.end();
  pool = undefined;
  db = undefined;
}

export { schema };

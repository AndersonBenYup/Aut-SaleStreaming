import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let db: Db | undefined;

export function connect(databaseUrl: string): Db {
  pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
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

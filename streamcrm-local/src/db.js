import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let db = null;
let dbFile = null;

export function openDb(file) {
  dbFile = file;
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}

export function closeDb() {
  if (db?.isOpen) db.close();
  db = null;
}

export const getDb = () => db;
export const getDbFile = () => dbFile;

// node:sqlite no acepta booleanos ni undefined como parámetros.
const bind = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));

export const all = (sql, ...params) => db.prepare(sql).all(...bind(params));
export const get = (sql, ...params) => db.prepare(sql).get(...bind(params));
export const run = (sql, ...params) => db.prepare(sql).run(...bind(params));

let txDepth = 0;

/** Transacción síncrona. Si ya hay una abierta, la interna usa un SAVEPOINT. */
export function tx(fn) {
  const sp = `sp${txDepth}`;
  db.exec(txDepth ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn();
    txDepth--;
    db.exec(txDepth ? `RELEASE ${sp}` : 'COMMIT');
    return result;
  } catch (err) {
    txDepth--;
    db.exec(txDepth ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
    throw err;
  }
}

export const nowIso = (d = new Date()) => d.toISOString();

/** Copia consistente de la base de datos en caliente. */
export function vacuumInto(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
}

export function listMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 3)), name: f, file: path.join(dir, f) }));
}

/**
 * Aplica las migraciones pendientes (migrations/NNN_nombre.sql), cada una en su transacción.
 * Si la base ya tenía datos, antes saca un respaldo; si una migración falla, restaura ese respaldo
 * y lanza el error. Las migraciones solo agregan: nunca borran datos.
 */
export function migrate({ dir, backupDir, upTo = Infinity, log = () => {} }) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const done = new Set(all('SELECT version FROM schema_migrations').map((r) => r.version));
  const pending = listMigrations(dir).filter((m) => !done.has(m.version) && m.version <= upTo);
  if (!pending.length) return [];

  let safety = null;
  if (done.size && backupDir) {
    safety = path.join(backupDir, `streamcrm-pre-migracion-${stamp()}.db`);
    vacuumInto(safety);
    log(`Respaldo previo a migrar: ${safety}`);
  }
  const applied = [];
  for (const m of pending) {
    try {
      tx(() => {
        db.exec(fs.readFileSync(m.file, 'utf8'));
        run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', m.version, m.name, nowIso());
      });
      applied.push(m.name);
      log(`Migración aplicada: ${m.name}`);
    } catch (err) {
      if (safety) restoreFile(safety);
      const e = new Error(`La migración ${m.name} falló (${err.message}).${safety ? ' Se restauró el respaldo previo.' : ''}`);
      e.cause = err;
      throw e;
    }
  }
  return applied;
}

/** Reemplaza el archivo de la base por `source` y la vuelve a abrir. */
export function restoreFile(source) {
  const file = dbFile;
  closeDb();
  for (const ext of ['-wal', '-shm']) fs.rmSync(file + ext, { force: true });
  fs.copyFileSync(source, file);
  openDb(file);
}

/** 20261030-153000123 (con milisegundos para que dos respaldos seguidos no choquen). */
export const stamp = (d = new Date()) => d.toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 18);

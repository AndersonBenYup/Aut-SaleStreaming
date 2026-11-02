import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { config } from './config.js';
import { migrate, restoreFile, stamp, vacuumInto } from './db.js';
import { logEvent } from './events.js';
import { getSettings, setSettings } from './settings.js';

export const KEEP = 30;
const NAME_RE = /^streamcrm-[a-z-]+-\d{8}-\d{9}\.db$/;

export const isBackupName = (name) => NAME_RE.test(name);

/** Respaldo consistente con VACUUM INTO. Conserva los últimos 30 y copia a la carpeta sincronizada si hay una. */
export function createBackup(label = 'manual', now = new Date()) {
  const name = `streamcrm-${label}-${stamp(now)}.db`;
  const file = path.join(config.backupDir, name);
  vacuumInto(file);
  prune();
  let copiedTo = null;
  const copyDir = getSettings().backup_copy_dir;
  if (copyDir) {
    try {
      fs.mkdirSync(copyDir, { recursive: true });
      copiedTo = path.join(copyDir, name);
      fs.copyFileSync(file, copiedTo);
    } catch (err) {
      copiedTo = null;
      logEvent('respaldo.copia_error', { data: { dir: copyDir, error: err.message } });
    }
  }
  setSettings({ last_backup_at: now.toISOString() });
  return { name, file, size: fs.statSync(file).size, copiedTo };
}

export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter(isBackupName)
    .map((name) => {
      const st = fs.statSync(path.join(config.backupDir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.slice(-21).localeCompare(a.name.slice(-21)));
}

function prune() {
  for (const b of listBackups().slice(KEEP)) fs.rmSync(path.join(config.backupDir, b.name), { force: true });
}

export const isSqliteFile = (buf) => buf.subarray(0, 16).toString('latin1') === 'SQLite format 3\u0000';

/**
 * Restaura desde un respaldo de la carpeta backups/ o desde un archivo subido.
 * Antes saca un respaldo "antes-de-restaurar" y después aplica migraciones (por si el respaldo es de una versión anterior).
 */
export function restoreBackup({ name, buffer }) {
  let source;
  if (name) {
    if (!isBackupName(name)) throw new Error('Nombre de respaldo inválido');
    source = path.join(config.backupDir, name);
    if (!fs.existsSync(source)) throw new Error('El respaldo no existe');
  } else {
    if (!buffer || !isSqliteFile(buffer)) throw new Error('El archivo no es un respaldo de StreamCRM (.db)');
    source = path.join(config.backupDir, `subido-${stamp()}.tmp`);
    fs.mkdirSync(config.backupDir, { recursive: true });
    fs.writeFileSync(source, buffer);
  }
  if (!isSqliteFile(fs.readFileSync(source).subarray(0, 16))) throw new Error('El archivo no es una base de datos SQLite');
  const safety = createBackup('antes-de-restaurar');
  try {
    restoreFile(source);
    migrate({ dir: config.migrationsDir, backupDir: config.backupDir });
  } catch (err) {
    restoreFile(safety.file);
    throw new Error(`No se pudo restaurar (${err.message}). Se volvió a la base anterior.`);
  } finally {
    if (!name) fs.rmSync(source, { force: true });
  }
  logEvent('respaldo.restaurado', { data: { from: name ?? 'archivo subido', safety: safety.name } });
  return { safety: safety.name };
}

/** Respaldo automático una vez al día a partir de la hora configurada (03:00 por defecto). */
export function maybeDailyBackup(now = new Date()) {
  const s = getSettings();
  const local = DateTime.fromJSDate(now).setZone(s.timezone);
  const today = local.toISODate();
  if (s.last_auto_backup_date === today || local.hour < Number(s.backup_hour)) return null;
  const b = createBackup('diario', now);
  setSettings({ last_auto_backup_date: today });
  return b;
}

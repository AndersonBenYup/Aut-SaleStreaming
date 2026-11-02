// Respaldo desde la consola (útil para tareas programadas):
//   npm run backup
//   npm run backup -- --restore streamcrm-manual-20261030-153000123.db
import { parseArgs } from 'node:util';
import { config, loadConfig } from '../src/config.js';
import { closeDb, migrate, openDb } from '../src/db.js';
import { createBackup, listBackups, restoreBackup } from '../src/backups.js';

const { values: a } = parseArgs({ options: { restore: { type: 'string' }, list: { type: 'boolean' } } });
loadConfig();
openDb(config.dbFile);
migrate({ dir: config.migrationsDir, backupDir: config.backupDir });
try {
  if (a.list) {
    for (const b of listBackups()) console.log(`${b.name}  ${(b.size / 1024).toFixed(0)} KB`);
  } else if (a.restore) {
    const r = restoreBackup({ name: a.restore });
    console.log(`✔ Restaurado ${a.restore}. Lo que había antes quedó en ${r.safety}`);
  } else {
    const b = createBackup('manual');
    console.log(`✔ ${b.file}${b.copiedTo ? `\n  copia: ${b.copiedTo}` : ''}`);
  }
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}

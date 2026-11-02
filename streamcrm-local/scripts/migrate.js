// Aplica las migraciones pendientes con el código actual. Si una falla, se restaura el respaldo previo.
import { config, loadConfig } from '../src/config.js';
import { closeDb, migrate, openDb } from '../src/db.js';

loadConfig();
openDb(config.dbFile);
try {
  const applied = migrate({ dir: config.migrationsDir, backupDir: config.backupDir, log: (m) => console.log(m) });
  console.log(applied.length ? `✔ ${applied.length} migración(es) aplicada(s)` : '✔ La base de datos ya estaba al día');
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}

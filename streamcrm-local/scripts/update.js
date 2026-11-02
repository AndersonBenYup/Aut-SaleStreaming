// Actualiza StreamCRM de forma segura:
//   1) respaldo  2) baja la versión nueva (git pull o .zip)  3) npm install  4) migraciones (con restauración automática)
//
//   npm run update                                  (instalaciones con git)
//   npm run update -- C:\Descargas\streamcrm-local-v1.1.0.zip
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, config, loadConfig } from '../src/config.js';
import { closeDb, openDb } from '../src/db.js';
import { createBackup } from '../src/backups.js';
import { licenseStatus } from '../src/license.js';
import { readZip } from './lib/zip.js';

// Lo que es del negocio nunca se pisa al actualizar.
const PROTECTED = [/^\.env$/, /^data\//, /^backups\//, /^branding\.json$/, /^branding\//, /^licencia\.txt$/];

const fail = (msg) => {
  console.error(`\n✘ ${msg}`);
  process.exit(1);
};
// Los argumentos son fijos (no vienen del usuario), así que se pueden pasar como una sola línea al shell.
const run = (cmd, args) => spawnSync([cmd, ...args].join(' '), { cwd: ROOT, stdio: 'inherit', shell: true });

loadConfig();

// 0) ¿Está corriendo? Migrar con el servidor abierto puede dejar la base a medias.
try {
  await fetch(`http://127.0.0.1:${config.port}/api/public`, { signal: AbortSignal.timeout(1500) });
  fail(`StreamCRM está abierto (puerto ${config.port}). Ciérralo (o detén el servicio) y vuelve a ejecutar la actualización.`);
} catch {
  /* no responde: bien */
}

const oldVersion = config.version;
openDb(config.dbFile);
const lic = licenseStatus();
if (!lic.updatesAllowed || (lic.mode === 'anual' && !lic.active)) {
  closeDb();
  fail(`Tu periodo de actualizaciones terminó${lic.supportUntil ? ` el ${lic.supportUntil.slice(0, 10)}` : ''}. El sistema sigue funcionando; para recibir versiones nuevas escribe a ${config.vendor.name} (WhatsApp ${config.vendor.whatsapp}).`);
}

console.log('1/4 Respaldo de la base de datos…');
const backup = createBackup('pre-actualizacion');
console.log(`    ${backup.file}`);
closeDb();

console.log('2/4 Descargando la versión nueva…');
const zipArg = process.argv[2];
if (zipArg) {
  const entries = readZip(fs.readFileSync(path.resolve(zipArg)));
  const prefix = entries.every((e) => e.name.startsWith('streamcrm-local/')) ? 'streamcrm-local/' : '';
  let n = 0;
  for (const e of entries) {
    const rel = e.name.slice(prefix.length);
    if (!rel || rel.includes('..') || path.isAbsolute(rel) || PROTECTED.some((re) => re.test(rel))) continue;
    const target = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, e.data);
    if (process.platform !== 'win32' && e.mode & 0o111) fs.chmodSync(target, 0o755);
    n++;
  }
  console.log(`    ${n} archivos actualizados desde ${zipArg}`);
} else if (fs.existsSync(path.join(ROOT, '.git'))) {
  if (run('git', ['pull', '--ff-only']).status !== 0) fail('git pull falló. Tus datos no se tocaron.');
} else {
  fail('Indica el archivo de la versión nueva, por ejemplo:\n  npm run update -- C:\\Descargas\\streamcrm-local-v1.1.0.zip\n  (o arrastra el .zip sobre actualizar.bat)');
}

console.log('3/4 Instalando dependencias…');
if (run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund']).status !== 0) fail('npm install falló. Revisa tu conexión a internet y vuelve a intentar.');

console.log('4/4 Aplicando migraciones…');
// Proceso aparte para que corran las migraciones del código NUEVO.
const mig = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts', 'migrate.js')], { cwd: ROOT, stdio: 'inherit' });
if (mig.status !== 0) fail(`La migración falló y se restauró la base anterior. Respaldo de antes de actualizar: ${backup.file}`);

const newVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
console.log(`\n✔ Actualizado de v${oldVersion} a v${newVersion}. Ya puedes abrir StreamCRM (iniciar.bat / ./iniciar.sh).`);

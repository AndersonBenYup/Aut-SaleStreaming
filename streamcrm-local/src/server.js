import { spawn } from 'node:child_process';
import { config } from './config.js';
import { closeDb } from './db.js';
import { init } from './app.js';
import { startScheduler, stopScheduler } from './scheduler.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`StreamCRM necesita Node.js 22.13 o más nuevo (tienes ${process.version}). Descárgalo de https://nodejs.org`);
  process.exit(1);
}

const app = init();
if (config.envCreated) {
  console.log(`\n⚠  Se creó ${config.envFile} con tus claves de cifrado.`);
  console.log('   RESPALDA ese archivo y la carpeta data/: sin ellos no se pueden recuperar los datos.\n');
}

const server = app.listen(config.port, config.host, () => {
  const shown = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`StreamCRM Local v${config.version} listo en http://${shown}:${config.port}`);
  if (config.host === '0.0.0.0') console.log('⚠  Acceso desde la red local habilitado.');
  console.log('Deja esta ventana abierta: los recordatorios se envían mientras el programa está encendido.');
  startScheduler();
  if (process.env.STREAMCRM_OPEN === '1') openBrowser(`http://localhost:${config.port}`);
});

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`El puerto ${config.port} ya está en uso. ¿StreamCRM ya está abierto? Cambia PORT en .env si hace falta.`);
  else console.error(err);
  process.exit(1);
});

function shutdown() {
  stopScheduler();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Expone SOLO el webhook de Retell a internet con Cloudflare Tunnel (cloudflared).
//
// - Sin configuración: túnel rápido gratuito (https://xxxx.trycloudflare.com). La URL cambia cada vez que se abre.
// - Con CLOUDFLARE_TUNNEL_TOKEN en .env: túnel con nombre y dominio fijo (recomendado). Pon la URL en Ajustes.
//
// La URL detectada se guarda en data/tunnel-url.txt y el panel la muestra en Ajustes → Webhook y red.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, loadConfig } from '../src/config.js';
import { parseEnv } from 'node:util';

loadConfig();
const env = parseEnv(fs.readFileSync(config.envFile, 'utf8'));
const urlFile = path.join(config.dataDir, 'tunnel-url.txt');
const bin = process.env.CLOUDFLARED || 'cloudflared';
const token = env.CLOUDFLARE_TUNNEL_TOKEN;

const args = token ? ['tunnel', '--no-autoupdate', 'run', '--token', token] : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${config.port}`];
console.log(token ? 'Abriendo túnel con nombre (dominio fijo)…' : `Abriendo túnel rápido hacia http://127.0.0.1:${config.port}…`);

const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(`\nNo encuentro "cloudflared". Instálalo:
  Windows:  winget install --id Cloudflare.cloudflared   (o descarga el .exe de https://github.com/cloudflare/cloudflared/releases y ponlo en esta carpeta)
  macOS:    brew install cloudflared
  Linux:    https://pkg.cloudflare.com/  (paquete cloudflared)
Luego vuelve a ejecutar este script. Guía: docs/cloudflare-tunnel.md`);
  } else console.error(err);
  process.exit(1);
});

let found = false;
const onData = (buf) => {
  const text = buf.toString();
  if (process.env.DEBUG) process.stdout.write(text);
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !found) {
    found = true;
    fs.writeFileSync(urlFile, m[0]);
    console.log(`\n✔ Túnel listo: ${m[0]}\n\nPega esta URL en tu agente de Retell (Webhook URL):\n\n   ${m[0]}/webhooks/retell\n`);
    console.log('⚠ Con el túnel rápido la URL cambia cada vez que lo abres. Para una fija usa un túnel con nombre (docs/cloudflare-tunnel.md).');
    console.log('Deja esta ventana abierta. Ctrl+C para cerrar el túnel.');
  }
  if (token && /Registered tunnel connection/i.test(text) && !found) {
    found = true;
    console.log('✔ Túnel conectado. Revisa que la URL pública esté en Ajustes → Webhook y red.');
  }
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

const cleanup = () => {
  fs.rmSync(urlFile, { force: true });
  child.kill();
  process.exit(0);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
child.on('exit', (code) => {
  fs.rmSync(urlFile, { force: true });
  console.log(`cloudflared terminó (código ${code}).`);
  process.exit(code ?? 0);
});

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { VENDOR } from './vendor.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Configuración del proceso. Se llena con loadConfig() al arrancar (o en cada test). */
export const config = {
  version: pkg.version,
  releaseDate: pkg.releaseDate,
};

const GENERATED = ['ENCRYPTION_KEY', 'SESSION_SECRET'];

function defaultEnv() {
  return [
    '# StreamCRM Local — generado automáticamente en el primer arranque.',
    '# ¡RESPALDA ESTE ARCHIVO! Sin ENCRYPTION_KEY no se pueden leer las contraseñas ni los tokens guardados.',
    `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    'PORT=3000',
    '# 127.0.0.1 = solo esta computadora. 0.0.0.0 = también desde la red local (celular en el mismo WiFi).',
    'HOST=127.0.0.1',
    '',
  ].join('\n');
}

/**
 * Lee .env (lo crea con claves nuevas si no existe). Las variables del sistema tienen prioridad,
 * así Docker puede fijar HOST/PORT/DATA_DIR sin tocar el archivo.
 */
export function loadConfig(overrides = {}) {
  const envFile = overrides.envFile ?? process.env.ENV_FILE ?? path.join(ROOT, '.env');
  let envCreated = false;
  if (!fs.existsSync(envFile)) {
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, defaultEnv(), { mode: 0o600 });
    envCreated = true;
  }
  let fileEnv = parseEnv(fs.readFileSync(envFile, 'utf8'));
  const missing = GENERATED.filter((k) => !fileEnv[k]);
  if (missing.length) {
    for (const k of missing) setEnvValue(k, randomBytes(32).toString('hex'), envFile);
    fileEnv = parseEnv(fs.readFileSync(envFile, 'utf8'));
  }
  const env = { ...fileEnv, ...pick(process.env, ['PORT', 'HOST', 'DATA_DIR', 'BACKUP_DIR', 'REMINDER_CHANNEL_OVERRIDE']) };
  if (!/^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY)) throw new Error(`ENCRYPTION_KEY inválida en ${envFile} (deben ser 64 caracteres hex)`);

  const dataDir = path.resolve(ROOT, overrides.dataDir ?? env.DATA_DIR ?? 'data');
  Object.assign(config, {
    envFile,
    envCreated,
    port: Number(overrides.port ?? env.PORT ?? 3000),
    host: overrides.host ?? env.HOST ?? '127.0.0.1',
    dataDir,
    dbFile: path.join(dataDir, 'streamcrm.db'),
    brandingDir: path.join(dataDir, 'branding'),
    backupDir: path.resolve(ROOT, overrides.backupDir ?? env.BACKUP_DIR ?? 'backups'),
    migrationsDir: overrides.migrationsDir ?? path.join(ROOT, 'migrations'),
    encryptionKey: env.ENCRYPTION_KEY,
    sessionSecret: env.SESSION_SECRET,
    channelOverride: env.REMINDER_CHANNEL_OVERRIDE || '',
    branding: loadBranding(),
  });
  config.vendor = { ...VENDOR, ...(config.branding.vendor ?? {}) };
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.brandingDir, { recursive: true });
  return config;
}

/** branding.json opcional (lo deja el vendedor al entregar una instalación personalizada). */
function loadBranding() {
  const file = path.join(ROOT, 'branding.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`branding.json no es un JSON válido: ${err.message}`);
    return {};
  }
}

/** Cambia (o agrega) una línea KEY=valor en .env conservando el resto del archivo. */
export function setEnvValue(key, value, envFile = config.envFile) {
  const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  fs.writeFileSync(envFile, next);
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined && obj[k] !== '').map((k) => [k, obj[k]]));

// Utilidades de prueba: base de datos temporal, licencias firmadas con una clave de prueba y fetch simulado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { closeDb } from '../src/db.js';
import { init } from '../src/app.js';

const realFetch = globalThis.fetch;

export async function startApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamcrm-test-'));
  const keys = generateKeyPairSync('ed25519');
  const app = init({
    dataDir: path.join(dir, 'data'),
    backupDir: path.join(dir, 'backups'),
    envFile: path.join(dir, '.env'),
    licensePublicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    quiet: true,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';

  async function api(method, url, body, { headers = {}, csrf = true, raw } = {}) {
    const res = await realFetch(base + url, {
      method,
      headers: {
        ...(csrf ? { 'x-requested-with': 'streamcrm' } : {}),
        ...(raw ? { 'content-type': 'application/octet-stream' } : body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }

  const signLicense = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `STREAMCRM-${body}.${sign(null, Buffer.from(body), keys.privateKey).toString('base64url')}`;
  };

  return {
    dir,
    base,
    api,
    signLicense,
    setCookie: (c) => (cookie = c),
    getCookie: () => cookie,
    async close() {
      await new Promise((r) => server.close(r));
      closeDb();
    },
  };
}

export const ADMIN = { name: 'Dueña', email: 'admin@negocio.test', password: 'ClaveSegura123' };

export async function completeSetup(t, { licenseKey = '', settings = {} } = {}) {
  const r = await t.api('POST', '/api/setup/complete', {
    settings: { business_name: 'Streaming Juan', timezone: 'America/Lima', country: 'PE', ...settings },
    admin: ADMIN,
    licenseKey,
  });
  if (r.status !== 200) throw new Error(`setup falló: ${JSON.stringify(r.data)}`);
  return r;
}

export const perpetualLicense = (t, extra = {}) =>
  t.signLicense({ licenseId: 'LIC-TEST', businessName: 'Streaming Juan', type: 'perpetua', features: ['ai_calls', 'whatsapp', 'multiuser', 'branding'], supportUntil: '2099-01-01T00:00:00.000Z', ...extra });

/** Reemplaza fetch para las URL externas (Retell, WhatsApp). Las llamadas al propio servidor pasan normal. */
export function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
    const call = { url: u, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null };
    calls.push(call);
    const r = (await handler(call)) ?? { status: 404, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => (globalThis.fetch = realFetch) };
}

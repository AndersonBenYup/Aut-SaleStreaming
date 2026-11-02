import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { config } from '../src/config.js';
import { all, get } from '../src/db.js';
import { ADMIN, completeSetup, perpetualLicense, startApp } from './helpers.js';

const PASSWORD = 'MadreSecreta#2026';
const PIN = '4821';
const TOKEN = 'EAAG-token-secreto-whatsapp';
let t;
let subId;
let accountId;

before(async () => {
  t = await startApp();
  await completeSetup(t, { licenseKey: perpetualLicense(t), settings: { whatsapp_token: TOKEN, retell_api_key: 'key_secreta_retell' } });
  const svc = await t.api('POST', '/api/services', { name: 'Netflix 1 perfil', platform: 'Netflix', price: 15 });
  accountId = (await t.api('POST', '/api/accounts', { platform: 'Netflix', email: 'madre@correo.test', password: PASSWORD, total_profiles: 5, cost: 45 })).data.id;
  subId = (
    await t.api('POST', '/api/sales', {
      customer: { name: 'Ana', phone: '987654321', consent_calls: true },
      serviceId: svc.data.id,
      accountId,
      profileName: 'Perfil 1',
      pin: PIN,
    })
  ).data.id;
});
after(() => t.close());

test('contraseñas, PIN y tokens están cifrados en la base de datos', () => {
  const file = fs.readFileSync(config.dbFile).toString('latin1') + (fs.existsSync(config.dbFile + '-wal') ? fs.readFileSync(config.dbFile + '-wal').toString('latin1') : '');
  for (const secret of [PASSWORD, TOKEN, 'key_secreta_retell']) {
    assert.ok(!file.includes(secret), `"${secret}" no debe estar en claro`);
  }
  const acc = get('SELECT password_enc FROM stream_accounts WHERE id = ?', accountId);
  assert.match(acc.password_enc, /^v1:/);
  assert.match(get('SELECT pin_enc FROM subscriptions WHERE id = ?', subId).pin_enc, /^v1:/);
  assert.match(get(`SELECT value FROM settings WHERE key = 'whatsapp_token'`).value, /^v1:/);
  assert.ok(!all('SELECT value FROM settings').some((r) => String(r.value).includes(ADMIN.password)));
});

test('nada sensible en el CSV, el Excel ni los listados', async () => {
  for (const format of ['csv', 'xls']) {
    const r = await t.api('GET', `/api/customers/export?format=${format}`);
    assert.equal(r.status, 200);
    assert.ok(r.data.includes('Ana'));
    for (const secret of [PASSWORD, PIN, 'madre@correo.test']) assert.ok(!r.data.includes(secret), `${format} sin ${secret}`);
  }
  const list = JSON.stringify((await t.api('GET', '/api/subscriptions')).data);
  assert.ok(!list.includes(PASSWORD) && !list.includes(PIN) && !list.includes('v1:'));
  const accounts = JSON.stringify((await t.api('GET', '/api/accounts')).data);
  assert.ok(!accounts.includes(PASSWORD) && !accounts.includes('v1:'));
  const settings = JSON.stringify((await t.api('GET', '/api/settings')).data);
  assert.ok(!settings.includes(TOKEN) && !settings.includes('key_secreta_retell'));
});

test('ver una contraseña o copiar credenciales queda en la bitácora', async () => {
  const r = await t.api('POST', `/api/accounts/${accountId}/reveal`);
  assert.equal(r.data.password, PASSWORD);
  const c = await t.api('POST', `/api/subscriptions/${subId}/credentials`);
  assert.ok(c.data.message.includes(PASSWORD) && c.data.message.includes(PIN));
  const types = all('SELECT type, user_id FROM events').map((e) => e.type);
  assert.ok(types.includes('contrasena.vista'));
  assert.ok(types.includes('credenciales.vistas'));
  assert.ok(get(`SELECT user_id FROM events WHERE type = 'contrasena.vista'`).user_id > 0);
});

test('el vendedor no entra a Ajustes; los perfiles libres se calculan', async () => {
  const p = (await t.api('GET', `/api/accounts/${accountId}/profiles`)).data;
  assert.equal(p.freeCount, 4);
  assert.deepEqual(p.free, ['Perfil 2', 'Perfil 3', 'Perfil 4', 'Perfil 5']);

  assert.equal((await t.api('POST', '/api/users', { email: 'vendedor@x.test', password: 'Vendedor123', role: 'vendedor' })).status, 201);
  await t.api('POST', '/api/auth/logout');
  assert.equal((await t.api('POST', '/api/auth/login', { email: 'vendedor@x.test', password: 'Vendedor123' })).status, 200);
  assert.equal((await t.api('GET', '/api/dashboard')).status, 200);
  assert.equal((await t.api('GET', '/api/settings')).status, 403);
  assert.equal((await t.api('GET', '/api/backups')).status, 403);
});

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { get, run } from '../src/db.js';
import { licenseStatus, parseLicense } from '../src/license.js';
import { tick } from '../src/scheduler.js';
import { setSettings } from '../src/settings.js';
import { completeSetup, mockFetch, perpetualLicense, startApp } from './helpers.js';

let t;
let serviceId;
let customerId;
const fetchMock = mockFetch(({ url }) => (url.endsWith('/create-phone-call') ? { status: 201, body: { call_id: `call_${Math.random()}` } } : null));
after(() => fetchMock.restore());

const DAY = 86400_000;
const annual = (expiresAt) =>
  t.signLicense({ licenseId: 'LIC-A', businessName: 'Streaming Juan', type: 'anual', expiresAt, features: ['ai_calls'], supportUntil: expiresAt });

before(async () => {
  t = await startApp();
});
after(() => t.close());

test('licencia válida y licencia alterada', () => {
  const key = perpetualLicense(t);
  assert.equal(parseLicense(key).ok, true);
  assert.equal(parseLicense(key).license.type, 'perpetua');

  // Se cambia el contenido (más funciones) sin poder volver a firmarlo.
  const [body, sig] = key.replace('STREAMCRM-', '').split('.');
  const tampered = JSON.parse(Buffer.from(body, 'base64url').toString());
  tampered.maxSubscriptions = 999999;
  const forged = `STREAMCRM-${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${sig}`;
  assert.equal(parseLicense(forged).ok, false);
  assert.match(parseLicense(forged).error, /firma/i);
  assert.equal(parseLicense('basura').ok, false);
});

test('el asistente rechaza una licencia con firma inválida', async () => {
  const r = await t.api('POST', '/api/setup/license-check', { key: perpetualLicense(t).slice(0, -6) + 'AAAAAA' });
  assert.equal(r.status, 400);
});

test('anual vencida → solo lectura y sin envíos', async () => {
  await completeSetup(t, {
    licenseKey: annual(new Date(Date.now() - DAY).toISOString()),
    settings: { reminder_channel: 'retell', retell_api_key: 'key_x', retell_from_number: '+14155550100' },
  });
  serviceId = (get(`SELECT id FROM services LIMIT 1`) ?? {}).id;
  const lic = (await t.api('GET', '/api/license')).data;
  assert.equal(lic.mode, 'anual');
  assert.equal(lic.readOnly, true);
  assert.match(lic.message, /Renueva tu licencia con/);

  assert.equal((await t.api('GET', '/api/dashboard')).status, 200, 'se puede consultar');
  const r = await t.api('POST', '/api/services', { name: 'Disney+', price: 10 });
  assert.equal(r.status, 403);
  assert.equal(r.data.readOnly, true);

  // Una suscripción con aviso vencido no sale.
  run(`INSERT INTO services (name, platform, price) VALUES ('Netflix', 'Netflix', 15)`);
  serviceId = get(`SELECT id FROM services WHERE name = 'Netflix'`).id;
  customerId = Number(run(`INSERT INTO customers (name, phone, consent_calls) VALUES ('Ana', '+51987654321', 1)`).lastInsertRowid);
  run(
    `INSERT INTO subscriptions (customer_id, service_id, start_date, end_date, price, reminder_at) VALUES (?, ?, '2030-01-01', '2030-01-15', 15, '2030-01-13T15:00:00.000Z')`,
    customerId,
    serviceId,
  );
  const res = await tick(new Date('2030-01-13T15:05:00Z'));
  assert.equal(res.canSend, false);
  assert.equal(res.sent, 0);
  assert.equal(fetchMock.calls.length, 0);
});

test('perpetua con soporte vencido → sigue funcionando (solo sin actualizaciones)', async () => {
  const r = await t.api('POST', '/api/license', { key: perpetualLicense(t, { supportUntil: '2020-01-01T00:00:00.000Z' }) });
  assert.equal(r.status, 200, 'activar licencia está permitido aun en solo lectura');
  assert.equal(r.data.active, true);
  assert.equal(r.data.updatesAllowed, false);
  assert.equal((await t.api('POST', '/api/services', { name: 'Max', price: 10 })).status, 201);
  const res = await tick(new Date('2030-01-13T15:06:00Z'));
  assert.equal(res.sent, 1);
  assert.equal(fetchMock.calls.length, 1);
});

test('anual vigente → activa con días restantes', async () => {
  await t.api('POST', '/api/license', { key: annual(new Date(Date.now() + 30 * DAY).toISOString()) });
  const lic = licenseStatus();
  assert.equal(lic.active, true);
  assert.ok(lic.daysLeft >= 29 && lic.daysLeft <= 30);
  assert.deepEqual(lic.features, ['ai_calls']);
  assert.equal(lic.maxUsers, 1, 'sin multiuser solo hay un usuario');
  const u = await t.api('POST', '/api/users', { email: 'v@x.test', password: '12345678', role: 'vendedor' });
  assert.equal(u.status, 403);
});

test('demo vencida (14 días) → solo lectura', () => {
  run(`DELETE FROM settings WHERE key = 'license_key'`);
  setSettings({ demo_started_at: new Date(Date.now() - 15 * DAY).toISOString() });
  const lic = licenseStatus();
  assert.equal(lic.mode, 'demo');
  assert.equal(lic.readOnly, true);
  assert.equal(lic.canSend, false);
});

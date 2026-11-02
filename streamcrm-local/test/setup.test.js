import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/db.js';
import { ADMIN, completeSetup, startApp } from './helpers.js';

let t;
before(async () => (t = await startApp()));
after(() => t.close());

test('primer arranque → asistente → admin creado → demo activa', async () => {
  let r = await t.api('GET', '/api/public');
  assert.equal(r.data.setupRequired, true);
  assert.equal(r.data.license.mode, 'demo');

  r = await t.api('GET', '/api/setup/defaults');
  assert.equal(r.data.settings.timezone, 'America/Lima');
  assert.equal(r.data.settings.currency, 'S/');

  // Sin el encabezado anti-CSRF no se acepta.
  r = await t.api('POST', '/api/setup/complete', {}, { csrf: false });
  assert.equal(r.status, 403);

  await completeSetup(t);
  r = await t.api('GET', '/api/auth/me');
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, ADMIN.email);
  assert.equal(r.data.user.role, 'admin');

  r = await t.api('GET', '/api/public');
  assert.equal(r.data.setupRequired, false);
  assert.equal(r.data.branding.name, 'Streaming Juan');

  r = await t.api('GET', '/api/license');
  assert.equal(r.data.mode, 'demo');
  assert.equal(r.data.active, true);
  assert.equal(r.data.maxSubscriptions, 20);
  assert.ok(r.data.daysLeft >= 13 && r.data.daysLeft <= 14);

  // El asistente ya no se puede volver a usar.
  r = await t.api('POST', '/api/setup/complete', { admin: { email: 'otro@x.test', password: '12345678' } });
  assert.equal(r.status, 409);
});

test('la sesión se cierra por inactividad', async () => {
  run(`UPDATE sessions SET last_seen_at = '2000-01-01T00:00:00.000Z'`);
  const r = await t.api('GET', '/api/auth/me');
  assert.equal(r.status, 401);
});

test('bloqueo temporal tras 5 intentos fallidos', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await t.api('POST', '/api/auth/login', { email: ADMIN.email, password: 'mala' });
    assert.equal(r.status, 401);
  }
  let r = await t.api('POST', '/api/auth/login', ADMIN);
  assert.equal(r.status, 429, 'con la contraseña correcta igual queda bloqueado');
  run('UPDATE users SET locked_until = NULL');
  r = await t.api('POST', '/api/auth/login', ADMIN);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
});

test('la demo permite hasta 20 suscripciones', async () => {
  const svc = await t.api('POST', '/api/services', { name: 'Netflix 1 perfil', platform: 'Netflix', price: 15, duration_days: 30 });
  for (let i = 0; i < 20; i++) {
    const r = await t.api('POST', '/api/sales', { customer: { name: `Cliente ${i}`, phone: `9870000${String(i).padStart(2, '0')}` }, serviceId: svc.data.id });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  const r = await t.api('POST', '/api/sales', { customer: { name: 'Extra', phone: '987111222' }, serviceId: svc.data.id });
  assert.equal(r.status, 403);
});

test('desde el túnel solo se aceptan webhooks', async () => {
  const r = await t.api('GET', '/api/public', undefined, { headers: { 'cf-connecting-ip': '1.2.3.4' } });
  assert.equal(r.status, 403);
});

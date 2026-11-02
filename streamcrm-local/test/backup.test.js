import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackup, listBackups, restoreBackup } from '../src/backups.js';
import { config } from '../src/config.js';
import { all, closeDb, get, migrate, openDb, run } from '../src/db.js';
import { completeSetup, startApp } from './helpers.js';

let t;
before(async () => {
  t = await startApp();
  await completeSetup(t);
  const svc = await t.api('POST', '/api/services', { name: 'Netflix', price: 15 });
  for (const [name, phone] of [['Ana', '987000001'], ['Beto', '987000002'], ['Carla', '987000003']]) {
    await t.api('POST', '/api/sales', { customer: { name, phone }, serviceId: svc.data.id, payment: { amount: 15, method: 'yape' } });
  }
});
after(() => t.close());

const snapshot = () => ({
  customers: all('SELECT name, phone FROM customers ORDER BY id'),
  subscriptions: all('SELECT customer_id, end_date, price FROM subscriptions ORDER BY id'),
  payments: all('SELECT amount, method FROM payments ORDER BY id'),
});

test('respaldo y restauración (desde la lista) conservan todos los datos', () => {
  const before = snapshot();
  const b = createBackup('manual');
  assert.ok(fs.existsSync(b.file));
  run('DELETE FROM customers');
  assert.equal(get('SELECT COUNT(*) n FROM customers').n, 0);

  const r = restoreBackup({ name: b.name });
  assert.deepEqual(snapshot(), before);
  assert.ok(listBackups().some((x) => x.name === r.safety), 'antes de restaurar se guardó la base anterior');
});

test('descargar respaldo y restaurarlo subiendo el archivo', async () => {
  const before = snapshot();
  const dl = await fetch(`${t.base}/api/backups/now`, { headers: { cookie: t.getCookie() } });
  assert.equal(dl.status, 200);
  const buf = Buffer.from(await dl.arrayBuffer());
  assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');

  run(`UPDATE customers SET name = 'BORRADO'`);
  // La sesión actual también vuelve a la del respaldo (que la contiene).
  const r = await t.api('POST', '/api/backups/restore', undefined, { raw: buf });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(snapshot(), before);

  const bad = await t.api('POST', '/api/backups/restore', undefined, { raw: Buffer.from('no soy una base') });
  assert.equal(bad.status, 400);
});

test('se conservan solo los últimos 30 respaldos', () => {
  for (let i = 0; i < 35; i++) createBackup('diario', new Date(Date.UTC(2030, 0, 1, 0, 0, i)));
  assert.equal(listBackups().length, 30);
});

test('una migración nueva se aplica sobre una base de la versión anterior sin perder datos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamcrm-mig-'));
  const file = path.join(dir, 'old.db');
  closeDb();
  openDb(file);
  migrate({ dir: config.migrationsDir, upTo: 1 }); // "versión anterior": solo 001
  run(`INSERT INTO customers (name, phone) VALUES ('Antiguo', '+51987654321')`);
  run(`INSERT INTO subscriptions (customer_id, start_date, end_date, price) VALUES (1, '2026-01-01', '2026-02-01', 12)`);
  run(`INSERT INTO calls (subscription_id, channel, external_id) VALUES (1, 'retell', 'call_old')`);
  assert.ok(!all('PRAGMA table_info(calls)').some((c) => c.name === 'cost'));

  const applied = migrate({ dir: config.migrationsDir, backupDir: dir });
  assert.deepEqual(applied, ['002_costo_llamadas.sql']);
  assert.ok(all('PRAGMA table_info(calls)').some((c) => c.name === 'cost'));
  assert.equal(get('SELECT name FROM customers').name, 'Antiguo');
  assert.equal(get('SELECT external_id FROM calls').external_id, 'call_old');
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('streamcrm-pre-migracion-')), 'se respaldó antes de migrar');

  // Migración que falla a la mitad → se restaura el respaldo y no queda nada a medias.
  const migDir = path.join(dir, 'migrations');
  fs.mkdirSync(migDir);
  for (const f of fs.readdirSync(config.migrationsDir)) fs.copyFileSync(path.join(config.migrationsDir, f), path.join(migDir, f));
  fs.writeFileSync(path.join(migDir, '003_rota.sql'), 'CREATE TABLE nueva (x INTEGER);\nALTER TABLE no_existe ADD COLUMN y TEXT;');
  assert.throws(() => migrate({ dir: migDir, backupDir: dir }), /003_rota\.sql falló.*restauró/);
  assert.equal(get('SELECT name FROM customers').name, 'Antiguo');
  assert.equal(get(`SELECT COUNT(*) n FROM sqlite_master WHERE name = 'nueva'`).n, 0);
  assert.equal(get('SELECT MAX(version) v FROM schema_migrations').v, 2);
  closeDb();
  openDb(config.dbFile);
});

// Prueba de punta a punta en una carpeta temporal (no toca tus datos):
// asistente → servicio → cuenta madre → venta → scheduler (Retell simulado) → webhook firmado → renovación → respaldo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DateTime } from 'luxon';
import { sign } from 'retell-sdk';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamcrm-smoke-'));
const { init } = await import('../src/app.js');
const { tick } = await import('../src/scheduler.js');
const { get, closeDb } = await import('../src/db.js');
const { createBackup } = await import('../src/backups.js');

const app = init({ dataDir: path.join(dir, 'data'), backupDir: path.join(dir, 'backups'), envFile: path.join(dir, '.env'), quiet: true });
const server = await new Promise((r) => {
  const s = app.listen(0, '127.0.0.1', () => r(s));
});
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
let cookie = '';
let ok = true;

// Retell simulado
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith(base)) return realFetch(url, opts);
  if (String(url).endsWith('/v2/create-phone-call')) return Response.json({ call_id: 'call_smoke' }, { status: 201 });
  return Response.json({}, { status: 404 });
};

async function api(method, url, body, headers = {}) {
  const res = await realFetch(base + url, {
    method,
    headers: { 'x-requested-with': 'streamcrm', 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
  });
  const c = res.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0];
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

function step(name, cond, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) ok = false;
}

try {
  await api('POST', '/api/setup/complete', {
    settings: { business_name: 'Streaming Smoke', reminder_channel: 'retell', retell_api_key: 'key_smoke', retell_from_number: '+14155550100' },
    admin: { name: 'Admin', email: 'admin@smoke.test', password: 'Smoke12345' },
  });
  step('Asistente completado (demo)', (await api('GET', '/api/license')).mode === 'demo');

  const svc = await api('POST', '/api/services', { name: 'Netflix 1 perfil', platform: 'Netflix', price: 15, duration_days: 30 });
  const acc = await api('POST', '/api/accounts', { platform: 'Netflix', email: 'madre@smoke.test', password: 'secreta', total_profiles: 5, cost: 40 });
  // Vence en 5 días: el aviso toca en 3 días a las 10:00 de Lima (dentro de los 14 días de demo).
  const endDate = DateTime.now().setZone('America/Lima').plus({ days: 5 }).toISODate();
  const sale = await api('POST', '/api/sales', {
    customer: { name: 'Cliente Smoke', phone: '987654321', consent_calls: true },
    serviceId: svc.id,
    accountId: acc.id,
    profileName: 'Perfil 1',
    endDate,
    payment: { amount: 15, method: 'yape' },
  });
  const sub = () => get('SELECT * FROM subscriptions WHERE id = ?', sale.id);
  const expected = DateTime.fromISO(endDate, { zone: 'America/Lima' }).minus({ days: 2 }).set({ hour: 10 }).toUTC().toISO();
  step('Venta registrada y aviso programado', sub().reminder_at === expected, sub().reminder_at);

  const r = await tick(new Date(Date.parse(sub().reminder_at) + 30_000));
  step('El scheduler envió el aviso (demo → simulado)', r.sent === 1 && sub().reminder_status === 'enviado', sub().reminder_channel);

  // En demo el canal es "console"; simulamos la respuesta de Retell para el flujo del webhook.
  const { run } = await import('../src/db.js');
  run(`UPDATE subscriptions SET last_call_id = 'call_smoke' WHERE id = ?`, sale.id);
  run(`INSERT INTO calls (subscription_id, channel, external_id) VALUES (?, 'retell', 'call_smoke')`, sale.id);
  const raw = JSON.stringify({
    event: 'call_analyzed',
    call: { call_id: 'call_smoke', metadata: { subscriptionId: String(sale.id) }, disconnection_reason: 'user_hangup', call_analysis: { call_summary: 'Renueva', custom_analysis_data: { renovacion: 'renueva' } } },
  });
  await api('POST', '/webhooks/retell', raw, { 'x-retell-signature': await sign(raw, 'key_smoke') });
  step('Webhook firmado → intención "renueva"', sub().renewal_intent === 'renueva');

  const dash = await api('GET', '/api/dashboard');
  step('Aparece en "Por cobrar" del resumen', dash.porCobrar.length === 1, `ingresos ${dash.income}, ganancia ${dash.profit}`);

  const renewed = await api('POST', `/api/subscriptions/${sale.id}/renew`, { amount: 15, method: 'plin' });
  step('Renovación extiende el vencimiento', renewed.end_date === DateTime.fromISO(endDate).plus({ days: 30 }).toISODate(), renewed.end_date);

  const b = createBackup('manual');
  step('Respaldo creado', fs.existsSync(b.file), b.name);
} catch (err) {
  console.error(err);
  ok = false;
} finally {
  globalThis.fetch = realFetch;
  server.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(ok ? '\nTodo OK ✅' : '\nHubo fallas ❌');
process.exit(ok ? 0 : 1);

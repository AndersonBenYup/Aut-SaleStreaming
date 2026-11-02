import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { sign } from 'retell-sdk';
import { get } from '../src/db.js';
import { tick } from '../src/scheduler.js';
import { completeSetup, mockFetch, perpetualLicense, startApp } from './helpers.js';

const API_KEY = 'key_test_retell';
let t;
let serviceId;
let callSeq = 0;
const analyses = new Map(); // call_id → respuesta de get-call (para el polling)

before(async () => {
  t = await startApp();
  await completeSetup(t, {
    licenseKey: perpetualLicense(t),
    settings: { reminder_channel: 'retell', retell_api_key: API_KEY, retell_agent_id: 'agent_1', retell_from_number: '+14155550100' },
  });
  serviceId = (await t.api('POST', '/api/services', { name: 'Netflix 1 perfil', platform: 'Netflix', price: 15, duration_days: 30 })).data.id;
});
after(() => t.close());

const retell = mockFetch(({ url, body }) => {
  if (url.endsWith('/v2/create-phone-call')) return { status: 201, body: { call_id: `call_${++callSeq}`, metadata: body.metadata } };
  const m = url.match(/get-call\/(.+)$/);
  if (m && analyses.has(m[1])) return { body: analyses.get(m[1]) };
  return { status: 404, body: {} };
});
after(() => retell.restore());
const created = () => retell.calls.filter((c) => c.url.endsWith('/create-phone-call'));

async function sale(name, phone, endDate) {
  const r = await t.api('POST', '/api/sales', {
    customer: { name, phone, consent_calls: true },
    serviceId,
    profileName: 'Perfil 1',
    startDate: '2029-12-15',
    endDate,
    price: 15,
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}

async function webhook(payload, signature) {
  const raw = JSON.stringify(payload);
  return t.api('POST', '/webhooks/retell', undefined, {
    csrf: false,
    raw,
    headers: { 'content-type': 'application/json', 'x-retell-signature': signature ?? (await sign(raw, API_KEY)) },
  });
}

const sub = (id) => get('SELECT * FROM subscriptions WHERE id = ?', id);

test('venta → recordatorio a las 10:00 de Lima, 2 días antes → se envía una sola vez', async () => {
  const id = await sale('Ana Pérez', '987654321', '2030-01-15');
  assert.equal(sub(id).reminder_at, '2030-01-13T15:00:00.000Z'); // 10:00 en Lima (UTC−5)
  assert.equal(get('SELECT phone FROM customers WHERE name = ?', 'Ana Pérez').phone, '+51987654321');

  let r = await tick(new Date('2030-01-13T14:59:00Z'));
  assert.equal(r.sent, 0, 'antes de la hora no sale nada');

  r = await tick(new Date('2030-01-13T15:00:30Z'));
  assert.equal(r.sent, 1);
  assert.equal(created().length, 1);
  const body = created()[0].body;
  assert.equal(body.to_number, '+51987654321');
  assert.equal(body.from_number, '+14155550100');
  assert.equal(body.override_agent_id, 'agent_1');
  assert.deepEqual(body.metadata, { subscriptionId: String(id) });
  assert.equal(body.retell_llm_dynamic_variables.businessName, 'Streaming Juan');
  assert.equal(body.retell_llm_dynamic_variables.endDate, '15 de enero');
  assert.equal(body.retell_llm_dynamic_variables.daysLeft, '2');
  assert.equal(body.retell_llm_dynamic_variables.price, '15.00');
  assert.equal(sub(id).reminder_status, 'enviado');

  await tick(new Date('2030-01-13T15:01:30Z'));
  await tick(new Date('2030-01-13T15:30:00Z'));
  assert.equal(created().length, 1, 'no hay envíos duplicados');
});

test('webhook firmado guarda la intención; firma falsa → 401', async () => {
  const id = get(`SELECT id FROM subscriptions WHERE last_call_id = 'call_1'`).id;
  const payload = {
    event: 'call_analyzed',
    call: {
      call_id: 'call_1',
      metadata: { subscriptionId: String(id) },
      disconnection_reason: 'user_hangup',
      recording_url: 'https://retell.test/rec_1.wav',
      call_analysis: { call_summary: 'La clienta confirmó que renueva.', custom_analysis_data: { renovacion: 'renueva' } },
    },
  };
  let r = await webhook(payload, 'v=123,d=firmafalsa');
  assert.equal(r.status, 401);
  assert.equal(sub(id).renewal_intent, null);

  r = await webhook(payload);
  assert.equal(r.status, 204);
  assert.equal(sub(id).renewal_intent, 'renueva');
  assert.equal(sub(id).reminder_status, 'respondido');
  assert.equal(sub(id).recording_url, 'https://retell.test/rec_1.wav');

  const dash = await t.api('GET', '/api/dashboard');
  assert.ok(dash.data.porCobrar.some((s) => s.id === id), 'aparece en "Por cobrar"');

  // Texto libre de respaldo
  r = await webhook({ ...payload, call: { ...payload.call, call_analysis: { custom_analysis_data: { renovacion: 'ya no quiero' } } } });
  assert.equal(r.status, 204);
  assert.equal(sub(id).renewal_intent, 'renueva', 'una llamada ya analizada no se procesa dos veces');
});

test('no contesta → reintenta en 2 h; tras 3 intentos queda fallido', async () => {
  const id = await sale('Beto Ruiz', '912345678', '2030-01-15');
  const before = created().length;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // El webhook usa el reloj real; el scheduler corre en 2030, así que el reintento ya "tocó".
    await tick(new Date(Date.parse('2030-01-13T15:00:30Z') + attempt * 60_000));
    assert.equal(created().length, before + attempt, `intento ${attempt} enviado`);
    const callId = sub(id).last_call_id;
    const sentAt = Date.now();
    const r = await webhook({ event: 'call_ended', call: { call_id: callId, metadata: { subscriptionId: String(id) }, disconnection_reason: 'dial_no_answer' } });
    assert.equal(r.status, 204);
    assert.equal(sub(id).reminder_attempts, attempt);
    if (attempt < 3) {
      assert.equal(sub(id).reminder_status, 'pendiente');
      assert.ok(Date.parse(sub(id).reminder_at) >= sentAt + 2 * 3600_000 - 1000, 'reintento en 2 h o más (horario permitido)');
    }
  }
  assert.equal(sub(id).reminder_status, 'fallido');
  assert.equal(sub(id).renewal_intent, 'sin_respuesta');
  await tick(new Date('2030-01-14T15:00:00Z'));
  assert.equal(created().length, before + 3, 'no hay un cuarto intento');
});

test('sin webhook: el polling a get-call obtiene el resultado', async () => {
  const id = await sale('Carla Díaz', '998877665', '2030-01-15');
  const now = new Date('2030-01-13T15:00:30Z');
  await tick(now);
  const callId = sub(id).last_call_id;
  assert.equal(sub(id).reminder_status, 'enviado');

  analyses.set(callId, { call_id: callId, call_status: 'ongoing', metadata: { subscriptionId: String(id) } });
  await tick(new Date(now.getTime() + 3 * 60_000));
  assert.equal(sub(id).renewal_intent, null, 'en curso: todavía no hay resultado');

  analyses.set(callId, {
    call_id: callId,
    call_status: 'ended',
    disconnection_reason: 'agent_hangup',
    metadata: { subscriptionId: String(id) },
    recording_url: 'https://retell.test/rec_p.wav',
    call_analysis: { call_summary: 'No renovará.', custom_analysis_data: { renovacion: 'no_renueva' } },
  });
  const r = await tick(new Date(now.getTime() + 6 * 60_000));
  assert.equal(r.polled, 1);
  assert.equal(sub(id).renewal_intent, 'no_renueva');
  assert.equal(sub(id).last_call_summary, 'No renovará.');
  assert.ok(retell.calls.some((c) => c.url.endsWith(`/v2/get-call/${callId}`)));
});

test('sin consentimiento no se llama: va a la lista manual con enlace wa.me', async () => {
  const r = await t.api('POST', '/api/sales', { customer: { name: 'Dina Sin Permiso', phone: '955443322' }, serviceId, startDate: '2029-12-15', endDate: '2030-01-15' });
  const before = created().length;
  await tick(new Date('2030-01-13T15:00:30Z'));
  assert.equal(created().length, before);
  assert.equal(sub(r.data.id).reminder_status, 'manual');
  const dash = await t.api('GET', '/api/dashboard');
  const item = dash.data.manuales.find((s) => s.id === r.data.id);
  assert.match(item.wa_link, /^https:\/\/wa\.me\/51955443322\?text=/);
});

test('renovar extiende desde el vencimiento y reprograma el aviso', async () => {
  const id = get(`SELECT id FROM subscriptions WHERE last_call_id = 'call_1'`).id;
  const r = await t.api('POST', `/api/subscriptions/${id}/renew`, { amount: 15, method: 'yape' });
  assert.equal(r.status, 200);
  assert.equal(r.data.end_date, '2030-02-14');
  assert.equal(sub(id).reminder_status, 'pendiente');
  assert.equal(sub(id).renewal_intent, null);
  assert.equal(sub(id).reminder_at, '2030-02-12T15:00:00.000Z');
  assert.equal(get('SELECT COUNT(*) n FROM payments WHERE subscription_id = ?', id).n, 1);
});

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { sign } from 'retell-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/index.js';
import { subscriptions, webhookEvents } from '../src/db/schema.js';
import type { ReminderChannel } from '../src/channels/types.js';
import { dispatchDueReminders, setChannel } from '../src/modules/reminders.js';
import { createSale, recalcStatuses, renewSubscription } from '../src/modules/subscriptions.js';
import { NotFoundError } from '../src/modules/tenantScope.js';
import { NOW, TODAY, createTenant, subsOf } from './helpers.js';
import { TEST_RETELL_KEY } from './setup.js';

const retellMock = { name: 'retell', send: vi.fn() } satisfies ReminderChannel;
const consoleMock = { name: 'console', send: vi.fn() } satisfies ReminderChannel;
let callSeq = 0;

beforeEach(() => {
  callSeq = 0;
  retellMock.send.mockReset().mockImplementation(async () => ({ externalId: `call_${++callSeq}` }));
  consoleMock.send.mockReset().mockImplementation(async () => ({ externalId: `console_${++callSeq}` }));
  setChannel('retell', retellMock);
  setChannel('console', consoleMock);
});

/** Venta que vence hoy: el aviso queda para dentro de 1 minuto. */
async function dueSale(tenantId: string, phone = '987654305', consentCalls = true) {
  return createSale(
    tenantId,
    { customer: { name: 'María Flores', phone, consentCalls }, serviceName: 'NETFLIX 1 Perfil', durationDays: 30, price: 15, startDate: '2026-09-29', profileName: 'María' },
    { now: NOW },
  );
}
const inTwoMinutes = new Date(NOW.getTime() + 2 * 60_000);
const reload = async (id: string) => (await getDb().select().from(subscriptions).where(eq(subscriptions.id, id)))[0]!;

async function postRetell(body: object, signature?: string) {
  const raw = JSON.stringify(body);
  return request(createApp())
    .post('/webhooks/retell')
    .set('content-type', 'application/json')
    .set('x-retell-signature', signature ?? (await sign(raw, TEST_RETELL_KEY)))
    .send(raw);
}

describe('scheduler', () => {
  it('envía por Retell con las variables del agente y marca enviado', async () => {
    const t = await createTenant({ name: 'Streaming Rocío' });
    const sub = await dueSale(t.id);
    expect(await dispatchDueReminders(inTwoMinutes)).toBe(1);
    expect(retellMock.send).toHaveBeenCalledTimes(1);
    expect(retellMock.send.mock.calls[0]![0]).toMatchObject({
      tenantId: t.id,
      subscriptionId: sub.id,
      businessName: 'Streaming Rocío',
      toNumber: '+51987654305',
      serviceName: 'NETFLIX 1 Perfil',
      endDateWords: '29 de octubre',
      daysLeft: 0,
      price: '15.00',
    });
    expect(await reload(sub.id)).toMatchObject({ reminderStatus: 'enviado', reminderAttempts: 1, lastCallId: 'call_1' });
  });

  it('dos workers a la vez no envían duplicados', async () => {
    const t = await createTenant();
    for (let i = 0; i < 5; i++) await dueSale(t.id, `98765431${i}`);
    const [a, b] = await Promise.all([dispatchDueReminders(inTwoMinutes), dispatchDueReminders(inTwoMinutes)]);
    expect(a + b).toBe(5);
    const totalCalls = retellMock.send.mock.calls.length + consoleMock.send.mock.calls.length;
    expect(totalCalls).toBe(5);
    const ids = [...retellMock.send.mock.calls, ...consoleMock.send.mock.calls].map((c) => c[0].subscriptionId);
    expect(new Set(ids).size).toBe(5);
  });

  it('no llama a clientes sin consentimiento: queda para aviso manual', async () => {
    const t = await createTenant();
    const sub = await dueSale(t.id, '987654308', false);
    await dispatchDueReminders(inTwoMinutes);
    expect(retellMock.send).not.toHaveBeenCalled();
    expect(await reload(sub.id)).toMatchObject({ reminderStatus: 'fallido', reminderChannelUsed: 'manual' });
  });

  it('en desarrollo, un número fuera de la lista blanca va por consola (nunca llama a desconocidos)', async () => {
    const t = await createTenant();
    await dueSale(t.id, '987000111');
    await dispatchDueReminders(inTwoMinutes);
    expect(retellMock.send).not.toHaveBeenCalled();
    expect(consoleMock.send).toHaveBeenCalledTimes(1);
  });

  it('un negocio suspendido o con la prueba vencida no recibe llamadas', async () => {
    const suspended = await createTenant({ subscriptionStatus: 'suspended' });
    const expired = await createTenant({ subscriptionStatus: 'trialing', trialEndsAt: new Date(NOW.getTime() - 86400_000) });
    await dueSale(suspended.id);
    await dueSale(expired.id);
    expect(await dispatchDueReminders(inTwoMinutes)).toBe(0);
    expect(retellMock.send).not.toHaveBeenCalled();
  });

  it('fuera del horario permitido reprograma para las 9:00 del día siguiente', async () => {
    const t = await createTenant();
    const sub = await dueSale(t.id);
    const night = new Date('2026-10-30T02:30:00Z'); // 21:30 en Lima
    await getDb().update(subscriptions).set({ reminderAt: night }).where(eq(subscriptions.id, sub.id));
    await dispatchDueReminders(night);
    expect(retellMock.send).not.toHaveBeenCalled();
    const after = await reload(sub.id);
    expect(after.reminderStatus).toBe('pendiente');
    expect(after.reminderAt!.toISOString()).toBe('2026-10-30T14:00:00.000Z');
  });
});

describe('webhook de Retell', () => {
  async function sentCall() {
    const t = await createTenant();
    const sub = await dueSale(t.id);
    await dispatchDueReminders(inTwoMinutes);
    return { t, sub: await reload(sub.id) };
  }

  const analyzed = (sub: { id: string; tenantId: string; lastCallId: string | null }, renovacion: unknown) => ({
    event: 'call_analyzed',
    call: {
      call_id: sub.lastCallId,
      metadata: { tenantId: sub.tenantId, subscriptionId: sub.id },
      disconnection_reason: 'user_hangup',
      duration_ms: 41000,
      recording_url: 'https://example.com/rec.wav',
      call_cost: { combined_cost: 12 },
      call_analysis: { call_summary: 'Dijo que sí', user_sentiment: 'Positive', custom_analysis_data: { renovacion } },
    },
  });

  it('con firma válida actualiza la intención (204)', async () => {
    const { sub } = await sentCall();
    const res = await postRetell(analyzed(sub, 'renueva'));
    expect(res.status).toBe(204);
    expect(await reload(sub.id)).toMatchObject({
      renewalIntent: 'renueva',
      reminderStatus: 'respondido',
      lastCallSummary: 'Dijo que sí',
      recordingUrl: 'https://example.com/rec.wav',
    });
  });

  it('guarda tildes, ñ y emojis del resumen (base en UTF-8)', async () => {
    const { sub } = await sentCall();
    const body = analyzed(sub, 'sí');
    body.call.call_analysis.call_summary = 'La Sra. Muñoz dijo: “sí, renuevo” 👍';
    await postRetell(body);
    expect((await reload(sub.id)).lastCallSummary).toBe('La Sra. Muñoz dijo: “sí, renuevo” 👍');
  });

  it('si el cliente ya renovó, un webhook que llega tarde no pisa la renovación', async () => {
    const { t, sub } = await sentCall();
    await renewSubscription(t.id, sub.id, { amount: 15, method: 'plin' }, { now: NOW });
    await postRetell(analyzed(sub, 'renueva'));
    expect(await reload(sub.id)).toMatchObject({ renewalIntent: null, reminderStatus: 'pendiente', endDate: '2026-11-28' });
  });

  it('interpreta texto libre en el campo renovacion', async () => {
    const { sub } = await sentCall();
    await postRetell(analyzed(sub, 'déjame pensarlo'));
    expect((await reload(sub.id)).renewalIntent).toBe('pensando');
  });

  it('con firma falsa devuelve 401 y no cambia nada', async () => {
    const { sub } = await sentCall();
    const res = await postRetell(analyzed(sub, 'renueva'), 'v=1,d=firmafalsa');
    expect(res.status).toBe(401);
    expect((await reload(sub.id)).renewalIntent).toBeNull();
  });

  it('el mismo evento repetido se procesa una sola vez', async () => {
    const { sub } = await sentCall();
    await postRetell(analyzed(sub, 'renueva'));
    await postRetell(analyzed(sub, 'renueva'));
    expect(await getDb().select().from(webhookEvents)).toHaveLength(1);
  });

  it('si no contesta reintenta en 2 horas, y tras 3 intentos marca fallido + sin_respuesta', async () => {
    const { sub } = await sentCall();
    let current = sub;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const before = Date.now();
      await postRetell({
        event: 'call_ended',
        call: { call_id: current.lastCallId, metadata: { tenantId: current.tenantId, subscriptionId: current.id }, disconnection_reason: 'dial_no_answer' },
      });
      current = await reload(sub.id);
      expect(current.reminderAttempts).toBe(attempt);
      if (attempt < 3) {
        expect(current.reminderStatus).toBe('pendiente');
        expect(current.reminderAt!.getTime()).toBeGreaterThanOrEqual(before + 2 * 3600_000 - 1000);
        // Llega la hora del reintento: el scheduler vuelve a llamar.
        await dispatchDueReminders(new Date(current.reminderAt!.getTime() + 1000));
        current = await reload(sub.id);
        expect(current.reminderStatus).toBe('enviado');
      }
    }
    expect(current).toMatchObject({ reminderStatus: 'fallido', renewalIntent: 'sin_respuesta', reminderAttempts: 3 });
    expect(retellMock.send).toHaveBeenCalledTimes(3);
  });
});

describe('aislamiento entre negocios', () => {
  it('el negocio A no puede renovar ni ver suscripciones del negocio B', async () => {
    const a = await createTenant({ name: 'A' });
    const b = await createTenant({ name: 'B' });
    const subB = await dueSale(b.id);
    await expect(renewSubscription(a.id, subB.id, { amount: 15, method: 'yape' })).rejects.toBeInstanceOf(NotFoundError);
    expect(await subsOf(a.id)).toHaveLength(0);
    const res = await request(createApp()).get(`/dev/tenants/${a.id}/subscriptions`);
    expect(res.body).toEqual([]);
  });

  it('un webhook con metadata de otro negocio no toca la suscripción', async () => {
    const a = await createTenant({ name: 'A' });
    const b = await createTenant({ name: 'B' });
    const subB = await dueSale(b.id);
    await dispatchDueReminders(inTwoMinutes);
    const s = await reload(subB.id);
    await postRetell({
      event: 'call_analyzed',
      call: { call_id: s.lastCallId, metadata: { tenantId: a.id, subscriptionId: s.id }, call_analysis: { custom_analysis_data: { renovacion: 'no_renueva' } } },
    });
    expect((await reload(subB.id)).renewalIntent).toBeNull();
  });
});

it('el recálculo de estados pasa a vencida / por_vencer / activa según la fecha local', async () => {
  const t = await createTenant();
  const sub = await dueSale(t.id);
  const today = new Date().toISOString().slice(0, 10);
  const shift = async (endDate: string) => {
    await getDb().update(subscriptions).set({ endDate, status: 'activa' }).where(eq(subscriptions.id, sub.id));
    await recalcStatuses();
    return (await reload(sub.id)).status;
  };
  expect(await shift('2020-01-01')).toBe('vencida');
  expect(await shift('2099-01-01')).toBe('activa');
  const inTwoDays = new Date(Date.parse(today) + 2 * 86400_000).toISOString().slice(0, 10);
  expect(await shift(inTwoDays)).toBe('por_vencer');
});

it('el PIN se guarda cifrado', async () => {
  const t = await createTenant();
  const sub = await createSale(t.id, {
    customer: { name: 'X', phone: '987654309' },
    serviceName: 'MAX',
    durationDays: 30,
    price: 10,
    startDate: TODAY,
    pin: '4321',
  });
  expect(sub.pinEnc).toBeTruthy();
  expect(sub.pinEnc).not.toContain('4321');
});

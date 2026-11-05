import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { interpretIntent } from '@streamcrm/shared';
import { getDb, type Db } from '../db/index.js';
import { calls, customers, subscriptions, tenants, webhookEvents } from '../db/schema.js';
import { normalizePhone } from '../lib/phone.js';
import { enqueue } from '../jobs/queue.js';
import { applyIntent, getTenant, logEvent } from './subscriptions.js';
import { isRetryableDisconnection, retryOrFail } from './reminders.js';
import { handleSalesMessage, salesAgentReady } from './sales-agent.js';

/**
 * Guarda el evento (idempotente por source + externalId) y lo encola.
 * Devuelve false si ya se había recibido.
 */
/** opts.inline: procesar ya, sin pasar por la cola (lo usan las rutas /dev para responder con el resultado). */
export async function receiveWebhook(
  source: string,
  externalId: string,
  payload: unknown,
  tenantId?: string | null,
  opts: { inline?: boolean } = {},
) {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({ source, externalId, payload: payload as object, tenantId: tenantId ?? null })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!inserted.length) return false;
  if (opts.inline) await processWebhook(inserted[0]!.id);
  else await enqueue('process-webhook', { id: inserted[0]!.id });
  return true;
}

export async function processWebhook(id: string) {
  const db = getDb();
  const [ev] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id));
  if (!ev || ev.status === 'procesado') return;
  try {
    if (ev.source === 'retell') await processRetell(db, ev.payload as RetellEvent);
    else if (ev.source === 'whatsapp') await processWhatsapp(db, ev.payload as WhatsappMessage);
    await db
      .update(webhookEvents)
      .set({ status: 'procesado', processedAt: new Date(), attempts: ev.attempts + 1, error: null })
      .where(eq(webhookEvents.id, id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ status: 'fallido', error: (err as Error).message, attempts: ev.attempts + 1 })
      .where(eq(webhookEvents.id, id));
    throw err;
  }
}

// ---------------- Retell ----------------

export interface RetellEvent {
  event: 'call_started' | 'call_ended' | 'call_analyzed' | string;
  call: {
    call_id: string;
    metadata?: { tenantId?: string; subscriptionId?: string };
    disconnection_reason?: string;
    duration_ms?: number;
    recording_url?: string;
    call_cost?: { combined_cost?: number };
    call_analysis?: {
      call_summary?: string;
      user_sentiment?: string;
      custom_analysis_data?: Record<string, unknown>;
    };
  };
}

export const retellEventId = (e: RetellEvent) => `${e.event}:${e.call?.call_id}`;

async function findCallSubscription(db: Db, e: RetellEvent) {
  const { tenantId, subscriptionId } = e.call.metadata ?? {};
  if (!tenantId || !subscriptionId) return null;
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));
  return sub ?? null;
}

async function processRetell(db: Db, e: RetellEvent) {
  const sub = await findCallSubscription(db, e);
  if (!sub) return;
  const callId = e.call.call_id;
  // Llamadas antiguas (un reintento posterior ya reemplazó a esta) no cambian el estado.
  const isCurrent = sub.lastCallId === callId;
  const callCost = e.call.call_cost?.combined_cost;
  await db
    .update(calls)
    .set({
      durationMs: e.call.duration_ms ?? null,
      callCost: callCost !== undefined ? String(callCost / 100) : null,
      disconnectionReason: e.call.disconnection_reason ?? null,
      recordingUrl: e.call.recording_url ?? null,
      status: e.event === 'call_analyzed' ? 'analizada' : 'finalizada',
    })
    .where(and(eq(calls.channel, 'retell'), eq(calls.externalId, callId)));

  if (e.event === 'call_ended') {
    if (isCurrent && sub.reminderStatus === 'enviado' && isRetryableDisconnection(e.call.disconnection_reason)) {
      await retryOrFail(db, await getTenant(sub.tenantId, db), sub, e.call.disconnection_reason!);
    }
    return;
  }

  if (e.event === 'call_analyzed') {
    // Si la llamada no se contestó, call_ended ya programó el reintento: no se pisa con "sin respuesta".
    if (isRetryableDisconnection(e.call.disconnection_reason)) return;
    const analysis = e.call.call_analysis ?? {};
    const intent = interpretIntent(analysis.custom_analysis_data?.renovacion) ?? 'sin_respuesta';
    await db
      .update(calls)
      .set({ summary: analysis.call_summary ?? null, sentiment: analysis.user_sentiment ?? null, intent })
      .where(and(eq(calls.channel, 'retell'), eq(calls.externalId, callId)));
    if (!isCurrent) return;
    await applyIntent(db, sub, intent, {
      lastCallSummary: analysis.call_summary ?? null,
      recordingUrl: e.call.recording_url ?? null,
    });
  }
}

// ---------------- WhatsApp ----------------

export interface WhatsappMessage {
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
  /** Imagen adjunta (id de media de la Cloud API), p. ej. la captura del Yape. */
  imageId?: string;
  /** Nombre de perfil de WhatsApp del cliente. */
  profileName?: string;
}

/** Extrae los mensajes de texto (o respuestas de botones) del payload de la Cloud API. */
export function extractWhatsappMessages(body: any): WhatsappMessage[] {
  const out: WhatsappMessage[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const profiles = new Map<string, string>(
        (value?.contacts ?? []).map((c: any) => [String(c?.wa_id ?? ''), String(c?.profile?.name ?? '')]),
      );
      for (const m of value?.messages ?? []) {
        const imageId: string | undefined = m?.type === 'image' ? m?.image?.id : undefined;
        const text = m?.text?.body ?? m?.button?.text ?? m?.interactive?.button_reply?.title ?? m?.image?.caption ?? '';
        if (!text && !imageId) continue;
        const profileName = profiles.get(String(m.from)) || undefined;
        out.push({ phoneNumberId: value?.metadata?.phone_number_id, from: m.from, messageId: m.id, text, imageId, profileName });
      }
    }
  }
  return out;
}

export function verifyWhatsappSignature(rawBody: Buffer, header: string | undefined, appSecret: string) {
  if (!appSecret) return true; // sin secreto configurado (desarrollo)
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

async function processWhatsapp(db: Db, m: WhatsappMessage) {
  const [t] = await db.select().from(tenants).where(eq(tenants.whatsappPhoneNumberId, m.phoneNumberId));
  if (!t) return;
  // Vendedor con IA: conversa, cierra ventas y renovaciones (también con números que aún no son clientes).
  if (salesAgentReady(t)) {
    await handleSalesMessage(t, m);
    return;
  }
  if (!m.text) return;
  const phone = normalizePhone(m.from, t.country);
  if (!phone) return;
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, t.id), eq(customers.phone, phone)));
  if (!customer) return;
  await logEvent(db, { tenantId: t.id, type: 'whatsapp.inbound', entity: 'customer', entityId: customer.id, data: { text: m.text } });
  // Se aplica a la suscripción más reciente a la que se le envió aviso.
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.tenantId, t.id),
        eq(subscriptions.customerId, customer.id),
        inArray(subscriptions.reminderStatus, ['enviado', 'respondido']),
      ),
    )
    .orderBy(desc(subscriptions.lastContactAt))
    .limit(1);
  const intent = interpretIntent(m.text);
  if (!sub || !intent) return;
  await applyIntent(db, sub, intent, { lastCallSummary: `WhatsApp: "${m.text.slice(0, 200)}"` });
}

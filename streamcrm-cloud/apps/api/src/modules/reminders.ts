import { eq, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { RETRYABLE_DISCONNECTIONS } from '@streamcrm/shared';
import { env } from '../config/env.js';
import { getDb, type Db } from '../db/index.js';
import { calls, customers, services, subscriptions, tenants } from '../db/schema.js';
import { consoleChannel } from '../channels/console.js';
import { retellChannel } from '../channels/retell.js';
import { whatsappChannel } from '../channels/whatsapp.js';
import type { ReminderChannel } from '../channels/types.js';
import { decrypt } from '../lib/crypto.js';
import { clampToAllowedWindow, dateInWords, daysBetween, isWithinAllowedHours, todayIn } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { logEvent, requestSheetFlush, type Subscription, type Tenant } from './subscriptions.js';

export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_HOURS = 2;
const GRACE_DAYS = 3;

const channels: Record<string, ReminderChannel> = { retell: retellChannel, whatsapp: whatsappChannel, console: consoleChannel };
/** Para tests: reemplazar canales por mocks. */
export const setChannel = (name: string, ch: ReminderChannel) => {
  channels[name] = ch;
};

/** El scheduler nunca envía recordatorios de un negocio que no esté en prueba, activo o dentro de la gracia. */
export function tenantCanSend(t: Tenant, now = new Date()): boolean {
  if (t.subscriptionStatus === 'trialing') return !t.trialEndsAt || t.trialEndsAt > now;
  if (t.subscriptionStatus === 'active') return true;
  if (t.subscriptionStatus === 'past_due') {
    return !!t.pastDueSince && now.getTime() - t.pastDueSince.getTime() < GRACE_DAYS * 86400_000;
  }
  return false;
}

/** Elige el canal: Retell solo con consentimiento; si no, WhatsApp; si tampoco, aviso manual. */
export function pickChannel(t: Tenant, consentCalls: boolean, phone?: string): 'retell' | 'whatsapp' | 'console' | 'manual' {
  const e = env();
  const hasWhatsapp = !!(t.whatsappPhoneNumberId && t.whatsappTokenEnc);
  let ch: 'retell' | 'whatsapp' | 'manual' = 'manual';
  if (t.reminderChannel === 'retell' && consentCalls) ch = 'retell';
  else if ((t.reminderChannel === 'retell' || t.reminderChannel === 'whatsapp') && hasWhatsapp) ch = 'whatsapp';
  if (ch === 'manual') return 'manual';
  if (e.REMINDER_CHANNEL_OVERRIDE === 'console') return 'console';
  if (e.NODE_ENV !== 'production' && !(phone && e.DEV_ALLOWED_NUMBERS.includes(phone))) return 'console';
  return ch;
}

/**
 * Toma (con FOR UPDATE SKIP LOCKED) las suscripciones cuyo recordatorio ya toca y las pasa a "enviando".
 * Dos workers a la vez nunca toman la misma fila.
 */
export async function claimDue(db: Db, limit = 25, now = new Date()): Promise<string[]> {
  const res = await db.execute<{ id: string }>(sql`
    update subscriptions set reminder_status = 'enviando', updated_at = now()
    where id in (
      select s.id from subscriptions s
      join tenants t on t.id = s.tenant_id
      where s.reminder_status = 'pendiente' and s.reminder_at is not null and s.reminder_at <= ${now.toISOString()}::timestamptz
        and s.status <> 'cancelada'
        and (t.subscription_status = 'active'
          or (t.subscription_status = 'trialing' and (t.trial_ends_at is null or t.trial_ends_at > ${now.toISOString()}::timestamptz))
          or (t.subscription_status = 'past_due' and t.past_due_since > ${now.toISOString()}::timestamptz - interval '${sql.raw(String(GRACE_DAYS))} days'))
      order by s.reminder_at
      limit ${limit}
      for update of s skip locked
    )
    returning id`);
  return res.rows.map((r) => r.id);
}

export async function dispatchDueReminders(now = new Date()): Promise<number> {
  const db = getDb();
  const ids = await claimDue(db, 25, now);
  for (const id of ids) {
    try {
      await sendReminder(id, now);
    } catch (err) {
      logger.error({ err, subscriptionId: id }, 'error enviando recordatorio');
    }
  }
  return ids.length;
}

async function reschedule(db: Db, sub: Subscription, at: Date, extra: Partial<Subscription> = {}) {
  await db
    .update(subscriptions)
    .set({ reminderStatus: 'pendiente', reminderAt: at, sheetDirty: true, updatedAt: new Date(), ...extra })
    .where(eq(subscriptions.id, sub.id));
}

/** Programa un reintento en 2 h (dentro del horario permitido) o marca fallido tras el tercer intento. */
export async function retryOrFail(db: Db, t: Tenant, sub: Subscription, reason: string, now = new Date()) {
  const attempts = sub.reminderAttempts;
  if (attempts >= MAX_ATTEMPTS) {
    await db
      .update(subscriptions)
      .set({ reminderStatus: 'fallido', reminderAttempts: attempts, renewalIntent: 'sin_respuesta', sheetDirty: true, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    await logEvent(db, { tenantId: t.id, type: 'reminder.failed', entity: 'subscription', entityId: sub.id, data: { reason, attempts } });
  } else {
    const at = clampToAllowedWindow(
      DateTime.fromJSDate(now).setZone(t.timezone).plus({ hours: RETRY_AFTER_HOURS }),
      t.allowedStartHour,
      t.allowedEndHour,
    ).toJSDate();
    await reschedule(db, sub, at, { reminderAttempts: attempts });
    await logEvent(db, { tenantId: t.id, type: 'reminder.retry', entity: 'subscription', entityId: sub.id, data: { reason, attempts, at } });
  }
  await requestSheetFlush(t.id);
}

export async function sendReminder(subscriptionId: string, now = new Date()) {
  const db = getDb();
  const [row] = await db
    .select({ sub: subscriptions, tenant: tenants, customer: customers, service: services })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .leftJoin(services, eq(services.id, subscriptions.serviceId))
    .where(eq(subscriptions.id, subscriptionId));
  if (!row || row.sub.reminderStatus !== 'enviando') return;
  const { sub, tenant: t, customer } = row;

  if (!tenantCanSend(t, now)) {
    // Negocio suspendido o sin pago: queda pendiente; claimDue no lo vuelve a tomar hasta que se reactive.
    await reschedule(db, sub, sub.reminderAt ?? now);
    return;
  }
  if (!isWithinAllowedHours(t, now)) {
    const at = clampToAllowedWindow(DateTime.fromJSDate(now).setZone(t.timezone), t.allowedStartHour, t.allowedEndHour).toJSDate();
    await reschedule(db, sub, at);
    return;
  }

  const channelName = customer.phone ? pickChannel(t, customer.consentCalls, customer.phone) : 'manual';
  if (channelName === 'manual') {
    await db
      .update(subscriptions)
      .set({
        reminderStatus: 'fallido',
        reminderChannelUsed: 'manual',
        lastCallSummary: customer.phone ? 'Avisar manualmente: sin consentimiento de llamadas ni WhatsApp configurado' : 'Avisar manualmente: falta el teléfono',
        sheetDirty: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));
    await requestSheetFlush(t.id);
    return;
  }

  const today = todayIn(t.timezone, now);
  const attempt = sub.reminderAttempts + 1;
  try {
    const result = await channels[channelName]!.send(
      {
        tenantId: t.id,
        subscriptionId: sub.id,
        businessName: t.name,
        customerName: customer.name,
        toNumber: customer.phone!,
        serviceName: row.service?.name ?? 'servicio',
        profileName: sub.profileName ?? customer.name,
        endDate: sub.endDate,
        endDateWords: dateInWords(sub.endDate),
        daysLeft: Math.max(0, daysBetween(today, sub.endDate)),
        expired: sub.endDate < today,
        price: Number(sub.price).toFixed(2),
      },
      {
        retellFromNumber: t.retellFromNumber,
        whatsappPhoneNumberId: t.whatsappPhoneNumberId,
        whatsappToken: decrypt(t.whatsappTokenEnc),
        whatsappTemplate: t.whatsappTemplate,
      },
    );
    await db.insert(calls).values({ tenantId: t.id, subscriptionId: sub.id, channel: channelName, externalId: result.externalId });
    await db
      .update(subscriptions)
      .set({
        reminderStatus: 'enviado',
        reminderAttempts: attempt,
        reminderChannelUsed: channelName,
        lastCallId: result.externalId,
        lastContactAt: now,
        sheetDirty: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));
    await logEvent(db, { tenantId: t.id, type: 'reminder.sent', entity: 'subscription', entityId: sub.id, data: { channel: channelName, attempt } });
    await requestSheetFlush(t.id);
  } catch (err) {
    logger.warn({ err, subscriptionId: sub.id }, 'falló el envío; se reintenta');
    await retryOrFail(db, t, { ...sub, reminderAttempts: attempt }, (err as Error).message, now);
  }
}

export const isRetryableDisconnection = (reason: string | undefined | null) =>
  !!reason && (RETRYABLE_DISCONNECTIONS as readonly string[]).includes(reason);

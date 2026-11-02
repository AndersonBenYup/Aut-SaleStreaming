import { and, eq, sql } from 'drizzle-orm';
import type { PaymentMethod, RenewInput, RenewalIntent, SubscriptionStatus } from '@streamcrm/shared';
import { getDb, type Db } from '../db/index.js';
import { customers, events, payments, services, subscriptions, tenants } from '../db/schema.js';
import { addDays, computeReminderAt, daysBetween, todayIn, type ReminderConfig } from '../lib/dates.js';
import { encrypt } from '../lib/crypto.js';
import { normalizePhone } from '../lib/phone.js';
import { NotFoundError, scoped } from './tenantScope.js';
import { enqueue } from '../jobs/queue.js';

export type Tenant = typeof tenants.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;

/** Días antes del vencimiento en que una suscripción pasa a "por_vencer" (igual que "DE 1 A 3 DÍAS" en la hoja). */
export const POR_VENCER_DAYS = 3;

export function computeStatus(endDate: string, today: string, current?: string | null): SubscriptionStatus {
  if (current === 'cancelada') return 'cancelada';
  const left = daysBetween(today, endDate);
  if (left < 0) return 'vencida';
  if (left <= POR_VENCER_DAYS) return 'por_vencer';
  return 'activa';
}

export const reminderConfig = (t: Tenant): ReminderConfig => ({
  timezone: t.timezone,
  reminderDaysBefore: t.reminderDaysBefore,
  reminderHour: t.reminderHour,
  allowedStartHour: t.allowedStartHour,
  allowedEndHour: t.allowedEndHour,
});

/** Las suscripciones vencidas hace más de estos días no reciben aviso automático. */
export const EXPIRED_REMINDER_GRACE_DAYS = 7;

/** Calcula reminder_at; null si ya venció hace demasiado como para llamar. */
export function planReminder(t: Tenant, endDate: string, now = new Date()): Date | null {
  const today = todayIn(t.timezone, now);
  if (daysBetween(endDate, today) > EXPIRED_REMINDER_GRACE_DAYS) return null;
  return computeReminderAt(endDate, reminderConfig(t), now);
}

export async function getTenant(tenantId: string, db: Db = getDb()): Promise<Tenant> {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!t) throw new NotFoundError('Negocio');
  return t;
}

export async function logEvent(
  db: Db,
  e: { tenantId: string | null; type: string; entity?: string; entityId?: string; data?: Record<string, unknown>; userId?: string },
) {
  await db.insert(events).values(e);
}

/** Avisa al sincronizador de la hoja que hay cambios por escribir (con pequeño retraso para agrupar). */
export async function requestSheetFlush(tenantId: string) {
  await enqueue('sheet-flush', { tenantId }, { singletonKey: `flush:${tenantId}`, startAfterSeconds: 5 });
}

/**
 * Renovar: registra el pago y extiende desde el vencimiento (o desde hoy si ya venció)
 * con la duración del servicio; reprograma el recordatorio y limpia la intención.
 */
export async function renewSubscription(
  tenantId: string,
  subscriptionId: string,
  input: RenewInput,
  opts: { userId?: string; now?: Date } = {},
) {
  const db = getDb();
  const tenant = await getTenant(tenantId, db);
  const now = opts.now ?? new Date();
  const updated = await db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(scoped(subscriptions, tenantId, eq(subscriptions.id, subscriptionId)))
      .for('update');
    if (!sub) throw new NotFoundError('Suscripción');
    const today = todayIn(tenant.timezone, now);
    const base = sub.endDate >= today ? sub.endDate : today;
    const newEnd = addDays(base, sub.durationDays);
    await tx.insert(payments).values({
      tenantId,
      subscriptionId,
      customerId: sub.customerId,
      amount: String(input.amount),
      method: input.method,
      paidAt: now,
      createdBy: opts.userId,
    });
    const [row] = await tx
      .update(subscriptions)
      .set({
        startDate: base,
        endDate: newEnd,
        price: String(input.amount),
        status: computeStatus(newEnd, today),
        reminderAt: planReminder(tenant, newEnd, now),
        reminderStatus: 'pendiente',
        reminderAttempts: 0,
        renewalIntent: null,
        // La llamada anterior deja de ser "la actual": si su webhook llega tarde, no pisa la renovación.
        lastCallId: null,
        sheetDirty: true,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();
    await logEvent(tx as unknown as Db, {
      tenantId,
      type: 'subscription.renewed',
      entity: 'subscription',
      entityId: subscriptionId,
      userId: opts.userId,
      data: { from: sub.endDate, to: newEnd, amount: input.amount, method: input.method },
    });
    return row!;
  });
  await requestSheetFlush(tenantId);
  return updated;
}

/** Guarda la respuesta del cliente (llamada o WhatsApp) y marca la fila para escribirla en la hoja. */
export async function applyIntent(
  db: Db,
  sub: Subscription,
  intent: RenewalIntent,
  extra: Partial<Pick<Subscription, 'lastCallSummary' | 'recordingUrl' | 'lastCallId'>> = {},
) {
  await db
    .update(subscriptions)
    .set({
      renewalIntent: intent,
      reminderStatus: intent === 'sin_respuesta' ? 'fallido' : 'respondido',
      lastContactAt: new Date(),
      sheetDirty: true,
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(subscriptions.id, sub.id));
  await logEvent(db, { tenantId: sub.tenantId, type: 'subscription.intent', entity: 'subscription', entityId: sub.id, data: { intent } });
  await requestSheetFlush(sub.tenantId);
}

export interface NewSaleInput {
  customer: { name: string; phone?: string | null; email?: string | null; consentCalls?: boolean };
  serviceName: string;
  durationDays: number;
  price: number;
  cost?: number;
  startDate: string;
  profileName?: string;
  pin?: string;
  streamAccountId?: string | null;
  /** si se indica, la venta se registra también como pago */
  paymentMethod?: PaymentMethod;
}

/** Venta nueva desde el panel o la API: se guarda en la BD y se agrega como fila nueva en la hoja. */
export async function createSale(
  tenantId: string,
  input: NewSaleInput,
  opts: { now?: Date; source?: 'panel' | 'api'; userId?: string } = {},
) {
  const db = getDb();
  const tenant = await getTenant(tenantId, db);
  const now = opts.now ?? new Date();
  const phone = normalizePhone(input.customer.phone, tenant.country);
  const sub = await db.transaction(async (tx) => {
    const customerId = await upsertCustomer(tx as unknown as Db, tenantId, {
      name: input.customer.name,
      phone,
      email: input.customer.email ?? null,
      consentCalls: input.customer.consentCalls ?? false,
    });
    const serviceId = await upsertService(tx as unknown as Db, tenantId, input.serviceName, input.price, input.durationDays);
    const endDate = addDays(input.startDate, input.durationDays);
    const today = todayIn(tenant.timezone, now);
    const [row] = await tx
      .insert(subscriptions)
      .values({
        tenantId,
        customerId,
        serviceId,
        streamAccountId: input.streamAccountId ?? null,
        profileName: input.profileName,
        pinEnc: encrypt(input.pin),
        startDate: input.startDate,
        endDate,
        durationDays: input.durationDays,
        price: String(input.price),
        cost: String(input.cost ?? 0),
        status: computeStatus(endDate, today),
        reminderAt: planReminder(tenant, endDate, now),
        source: opts.source ?? 'panel',
        sheetDirty: true,
      })
      .returning();
    if (input.paymentMethod) {
      await tx.insert(payments).values({
        tenantId,
        subscriptionId: row!.id,
        customerId,
        amount: String(input.price),
        method: input.paymentMethod,
        paidAt: now,
        createdBy: opts.userId,
      });
    }
    await logEvent(tx as unknown as Db, {
      tenantId,
      type: 'subscription.created',
      entity: 'subscription',
      entityId: row!.id,
      userId: opts.userId,
      data: { customer: input.customer.name, service: input.serviceName, endDate },
    });
    return row!;
  });
  await requestSheetFlush(tenantId);
  return sub;
}

export async function upsertCustomer(
  db: Db,
  tenantId: string,
  c: { name: string; phone: string | null; email?: string | null; consentCalls: boolean },
): Promise<string> {
  if (c.phone) {
    const [row] = await db
      .insert(customers)
      .values({ tenantId, name: c.name, phone: c.phone, email: c.email, consentCalls: c.consentCalls, consentAt: c.consentCalls ? new Date() : null })
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.phone],
        set: { name: c.name, consentCalls: c.consentCalls, updatedAt: new Date() },
      })
      .returning({ id: customers.id });
    return row!.id;
  }
  // Sin teléfono: se busca por nombre exacto para no duplicar.
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(scoped(customers, tenantId, sql`${customers.phone} is null`, eq(customers.name, c.name)));
  if (existing) return existing.id;
  const [row] = await db
    .insert(customers)
    .values({ tenantId, name: c.name, phone: null, email: c.email, consentCalls: c.consentCalls })
    .returning({ id: customers.id });
  return row!.id;
}

export async function upsertService(db: Db, tenantId: string, name: string, price: number, durationDays: number) {
  const [row] = await db
    .insert(services)
    .values({ tenantId, name, price: String(price), durationDays, platform: guessPlatform(name) })
    .onConflictDoUpdate({ target: [services.tenantId, services.name], set: { name } })
    .returning({ id: services.id });
  return row!.id;
}

export function guessPlatform(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('netflix')) return 'netflix';
  if (n.includes('disney') || n.includes('star')) return 'disney';
  if (n.includes('max') || n.includes('hbo')) return 'max';
  if (n.includes('prime') || n.includes('amazon')) return 'prime';
  if (n.includes('spotify')) return 'spotify';
  if (n.includes('youtube')) return 'youtube';
  if (n.includes('paramount')) return 'paramount';
  if (n.includes('crunchyroll')) return 'crunchyroll';
  return 'otro';
}

/** Recalcula activa / por_vencer / vencida para todas las suscripciones (según la fecha local de cada tenant). */
export async function recalcStatuses(db: Db = getDb()) {
  await db.execute(sql`
    update subscriptions s set status = case
        when s.end_date < (now() at time zone t.timezone)::date then 'vencida'
        when s.end_date <= (now() at time zone t.timezone)::date + ${POR_VENCER_DAYS}::int then 'por_vencer'
        else 'activa' end,
      updated_at = now()
    from tenants t
    where t.id = s.tenant_id and s.status <> 'cancelada'
      and s.status <> case
        when s.end_date < (now() at time zone t.timezone)::date then 'vencida'
        when s.end_date <= (now() at time zone t.timezone)::date + ${POR_VENCER_DAYS}::int then 'por_vencer'
        else 'activa' end`);
}


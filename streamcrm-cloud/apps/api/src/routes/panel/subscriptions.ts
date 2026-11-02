import { Router, type Request } from 'express';
import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { intentInput, renewInput, saleInput, subscriptionFilters } from '@streamcrm/shared';
import { getDb } from '../../db/index.js';
import { calls, customers, events, payments, services, streamAccounts, subscriptions } from '../../db/schema.js';
import { decrypt } from '../../lib/crypto.js';
import { daysBetween, todayIn } from '../../lib/dates.js';
import { HttpError } from '../../lib/http.js';
import { tenantOf } from '../../auth/session.js';
import {
  applyIntent,
  createSale,
  getTenant,
  logEvent,
  renewSubscription,
  requestSheetFlush,
  type Tenant,
} from '../../modules/subscriptions.js';
import { NotFoundError, scoped } from '../../modules/tenantScope.js';
import { reminderLabel } from '../../sheets/labels.js';

/** Dueño y super-admin siempre; el vendedor solo si el negocio lo permite en Ajustes. */
export const canSeeSecrets = (req: Request, t: Tenant) => req.auth!.user.role !== 'staff' || t.staffCanSeePasswords;

export const likePattern = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

const listColumns = {
  id: subscriptions.id,
  customerId: customers.id,
  customerName: customers.name,
  phone: customers.phone,
  consentCalls: customers.consentCalls,
  serviceName: services.name,
  platform: services.platform,
  accountEmail: streamAccounts.email,
  profileName: subscriptions.profileName,
  startDate: subscriptions.startDate,
  endDate: subscriptions.endDate,
  durationDays: subscriptions.durationDays,
  price: subscriptions.price,
  status: subscriptions.status,
  reminderStatus: subscriptions.reminderStatus,
  reminderAt: subscriptions.reminderAt,
  reminderAttempts: subscriptions.reminderAttempts,
  reminderChannelUsed: subscriptions.reminderChannelUsed,
  renewalIntent: subscriptions.renewalIntent,
  lastContactAt: subscriptions.lastContactAt,
  lastCallSummary: subscriptions.lastCallSummary,
  source: subscriptions.source,
  sheetDirty: subscriptions.sheetDirty,
};

type ListRow = Awaited<ReturnType<typeof baseQuery>>[number];

/** Agrega los campos calculados que muestra el panel (días restantes y el mismo texto de RECORDATORIO que va a la hoja). */
export const present = (t: Tenant, today: string) => (r: ListRow) => ({
  ...r,
  price: Number(r.price),
  daysLeft: daysBetween(today, r.endDate),
  reminderLabel: reminderLabel(
    r,
    t.timezone,
  ),
});

const baseQuery = () =>
  getDb()
    .select(listColumns)
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .leftJoin(services, eq(services.id, subscriptions.serviceId))
    .leftJoin(streamAccounts, eq(streamAccounts.id, subscriptions.streamAccountId));

export async function listSubscriptions(t: Tenant, conds: (SQL | undefined)[], opts: { limit: number; offset?: number; order?: SQL[] }) {
  const rows = await baseQuery()
    .where(scoped(subscriptions, t.id, ...conds))
    .orderBy(...(opts.order ?? [asc(subscriptions.endDate), asc(customers.name)]))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);
  return rows.map(present(t, todayIn(t.timezone)));
}

async function findSub(tenantId: string, id: string) {
  const [sub] = await getDb().select().from(subscriptions).where(scoped(subscriptions, tenantId, eq(subscriptions.id, id)));
  if (!sub) throw new NotFoundError('Suscripción');
  return sub;
}

export function subscriptionsRouter() {
  const r = Router();

  r.get('/', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const f = subscriptionFilters.parse(req.query);
    const conds = [
      f.status ? eq(subscriptions.status, f.status) : undefined,
      f.intent ? eq(subscriptions.renewalIntent, f.intent) : undefined,
      f.reminderStatus ? eq(subscriptions.reminderStatus, f.reminderStatus) : undefined,
      f.serviceId ? eq(subscriptions.serviceId, f.serviceId) : undefined,
      f.q
        ? or(ilike(customers.name, likePattern(f.q)), ilike(customers.phone, likePattern(f.q)), ilike(services.name, likePattern(f.q)), ilike(streamAccounts.email, likePattern(f.q)))
        : undefined,
    ];
    const [items, [total]] = await Promise.all([
      listSubscriptions(t, conds, { limit: f.pageSize, offset: (f.page - 1) * f.pageSize }),
      getDb()
        .select({ n: count() })
        .from(subscriptions)
        .innerJoin(customers, eq(customers.id, subscriptions.customerId))
        .leftJoin(services, eq(services.id, subscriptions.serviceId))
        .leftJoin(streamAccounts, eq(streamAccounts.id, subscriptions.streamAccountId))
        .where(scoped(subscriptions, t.id, ...conds)),
    ]);
    res.json({ items, total: total!.n, page: f.page, pageSize: f.pageSize });
  });

  r.get('/:id', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const db = getDb();
    const [row] = await baseQuery().where(scoped(subscriptions, t.id, eq(subscriptions.id, req.params.id)));
    if (!row) throw new NotFoundError('Suscripción');
    const sub = await findSub(t.id, row.id);
    const secrets = canSeeSecrets(req, t);
    const [paymentRows, callRows, eventRows] = await Promise.all([
      db.select().from(payments).where(scoped(payments, t.id, eq(payments.subscriptionId, sub.id))).orderBy(desc(payments.paidAt)),
      db.select().from(calls).where(scoped(calls, t.id, eq(calls.subscriptionId, sub.id))).orderBy(desc(calls.createdAt)),
      db
        .select()
        .from(events)
        .where(and(eq(events.tenantId, t.id), eq(events.entityId, sub.id)))
        .orderBy(desc(events.createdAt))
        .limit(50),
    ]);
    res.json({
      ...present(t, todayIn(t.timezone))(row),
      cost: Number(sub.cost),
      pin: secrets ? decrypt(sub.pinEnc) : sub.pinEnc ? '••••' : null,
      streamAccountId: sub.streamAccountId,
      recordingUrl: sub.recordingUrl,
      sheetSyncedAt: sub.sheetSyncedAt,
      canSeeSecrets: secrets,
      payments: paymentRows.map((p) => ({ ...p, amount: Number(p.amount) })),
      calls: callRows,
      events: eventRows,
    });
  });

  r.post('/', async (req, res) => {
    const tenantId = tenantOf(req);
    const input = saleInput.parse(req.body);
    let streamAccountId: string | null = null;
    if (input.accountEmail) {
      const [acc] = await getDb()
        .select({ id: streamAccounts.id })
        .from(streamAccounts)
        .where(scoped(streamAccounts, tenantId, eq(streamAccounts.email, input.accountEmail)));
      if (!acc) throw new HttpError(400, `No existe la cuenta ${input.accountEmail}`);
      streamAccountId = acc.id;
    }
    const sub = await createSale(
      tenantId,
      {
        customer: { name: input.customerName, phone: input.phone, consentCalls: input.consentCalls },
        serviceName: input.serviceName,
        durationDays: input.durationDays,
        price: input.price,
        cost: input.cost,
        startDate: input.startDate,
        profileName: input.profileName,
        pin: input.pin,
        streamAccountId,
        paymentMethod: input.paymentMethod,
      },
      { source: 'panel', userId: req.auth!.user.id },
    );
    res.status(201).json({ id: sub.id });
  });

  r.post('/:id/renew', async (req, res) => {
    const input = renewInput.parse(req.body);
    const sub = await renewSubscription(tenantOf(req), req.params.id, input, { userId: req.auth!.user.id });
    res.json({ id: sub.id, endDate: sub.endDate });
  });

  /** Registrar a mano lo que respondió el cliente (por ejemplo, después de escribirle por WhatsApp). */
  r.post('/:id/intent', async (req, res) => {
    const { intent, note } = intentInput.parse(req.body);
    const sub = await findSub(tenantOf(req), req.params.id);
    await applyIntent(getDb(), sub, intent, note ? { lastCallSummary: `Nota: ${note}` } : {});
    await logEvent(getDb(), { tenantId: sub.tenantId, type: 'subscription.intent_manual', entity: 'subscription', entityId: sub.id, userId: req.auth!.user.id, data: { intent } });
    res.status(204).end();
  });

  /** Vuelve a programar el aviso para ya: lo envía el scheduler en el próximo minuto (dentro del horario permitido). */
  r.post('/:id/remind-now', async (req, res) => {
    const sub = await findSub(tenantOf(req), req.params.id);
    if (sub.status === 'cancelada') throw new HttpError(400, 'La suscripción está cancelada');
    if (sub.reminderStatus === 'enviando') throw new HttpError(409, 'Ya se está enviando');
    await getDb()
      .update(subscriptions)
      .set({ reminderStatus: 'pendiente', reminderAt: new Date(), reminderAttempts: 0, sheetDirty: true, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    await logEvent(getDb(), { tenantId: sub.tenantId, type: 'reminder.manual', entity: 'subscription', entityId: sub.id, userId: req.auth!.user.id });
    await requestSheetFlush(sub.tenantId);
    res.status(204).end();
  });

  /** El cliente no sigue: deja de avisarse y queda como "No renueva" en la hoja. */
  r.post('/:id/cancel', async (req, res) => {
    const sub = await findSub(tenantOf(req), req.params.id);
    await getDb()
      .update(subscriptions)
      .set({ status: 'cancelada', reminderAt: null, renewalIntent: 'no_renueva', sheetDirty: true, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    await logEvent(getDb(), { tenantId: sub.tenantId, type: 'subscription.canceled', entity: 'subscription', entityId: sub.id, userId: req.auth!.user.id });
    await requestSheetFlush(sub.tenantId);
    res.status(204).end();
  });

  return r;
}

import { Router } from 'express';
import { asc, count, desc, eq, gte, ilike, lte, min, ne, or, sql, sum } from 'drizzle-orm';
import { z } from 'zod';
import { customerUpdate } from '@streamcrm/shared';
import { getDb } from '../../db/index.js';
import { calls, customers, events, payments, services, streamAccounts, subscriptions } from '../../db/schema.js';
import { decrypt } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http.js';
import { normalizePhone } from '../../lib/phone.js';
import { tenantOf } from '../../auth/session.js';
import { getTenant, logEvent } from '../../modules/subscriptions.js';
import { NotFoundError, scoped } from '../../modules/tenantScope.js';
import { canSeeSecrets, likePattern, listSubscriptions } from './subscriptions.js';

const searchQuery = z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) });

export function customersRouter() {
  const r = Router();

  r.get('/', async (req, res) => {
    const tenantId = tenantOf(req);
    const { q, limit } = searchQuery.parse(req.query);
    const rows = await getDb()
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        consentCalls: customers.consentCalls,
        notes: customers.notes,
        subscriptions: count(subscriptions.id),
        nextEndDate: min(subscriptions.endDate),
      })
      .from(customers)
      .leftJoin(subscriptions, sql`${subscriptions.customerId} = ${customers.id} and ${subscriptions.status} <> 'cancelada'`)
      .where(scoped(customers, tenantId, q ? or(ilike(customers.name, likePattern(q)), ilike(customers.phone, likePattern(q))) : undefined))
      .groupBy(customers.id)
      .orderBy(asc(customers.name))
      .limit(limit);
    res.json(rows);
  });

  r.get('/:id', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const [c] = await getDb().select().from(customers).where(scoped(customers, t.id, eq(customers.id, req.params.id)));
    if (!c) throw new NotFoundError('Cliente');
    const subs = await listSubscriptions(t, [eq(subscriptions.customerId, c.id)], { limit: 100, order: [desc(subscriptions.endDate)] });
    res.json({ ...c, subscriptions: subs });
  });

  r.patch('/:id', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const input = customerUpdate.parse(req.body);
    const db = getDb();
    const [c] = await db.select().from(customers).where(scoped(customers, t.id, eq(customers.id, req.params.id)));
    if (!c) throw new NotFoundError('Cliente');
    let phone = c.phone;
    if (input.phone !== undefined) {
      phone = input.phone ? normalizePhone(input.phone, t.country) : null;
      if (input.phone && !phone) throw new HttpError(400, 'Teléfono inválido');
    }
    try {
      await db
        .update(customers)
        .set({
          name: input.name ?? c.name,
          phone,
          email: input.email === undefined ? c.email : input.email,
          notes: input.notes === undefined ? c.notes : input.notes,
          consentCalls: input.consentCalls ?? c.consentCalls,
          consentAt: input.consentCalls && !c.consentCalls ? new Date() : c.consentAt,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, c.id));
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code === '23505' || (err as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Ya existe otro cliente con ese teléfono');
      }
      throw err;
    }
    await logEvent(db, { tenantId: t.id, type: 'customer.updated', entity: 'customer', entityId: c.id, userId: req.auth!.user.id, data: { fields: Object.keys(input) } });
    res.status(204).end();
  });

  return r;
}

export function accountsRouter() {
  const r = Router();

  r.get('/', async (req, res) => {
    const tenantId = tenantOf(req);
    const { q } = searchQuery.parse(req.query);
    const rows = await getDb()
      .select({
        id: streamAccounts.id,
        platform: streamAccounts.platform,
        serviceLabel: streamAccounts.serviceLabel,
        email: streamAccounts.email,
        totalProfiles: streamAccounts.totalProfiles,
        expiresOn: streamAccounts.expiresOn,
        cost: streamAccounts.cost,
        provider: streamAccounts.provider,
        sheetStatus: streamAccounts.sheetStatus,
        usedProfiles: count(subscriptions.id),
      })
      .from(streamAccounts)
      .leftJoin(subscriptions, sql`${subscriptions.streamAccountId} = ${streamAccounts.id} and ${subscriptions.status} <> 'cancelada'`)
      .where(scoped(streamAccounts, tenantId, q ? ilike(streamAccounts.email, likePattern(q)) : undefined))
      .groupBy(streamAccounts.id)
      .orderBy(asc(streamAccounts.expiresOn), asc(streamAccounts.email));
    res.json(rows.map((a) => ({ ...a, cost: Number(a.cost) })));
  });

  /** Ver la contraseña de una cuenta queda registrado en la actividad. */
  r.get('/:id/password', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    if (!canSeeSecrets(req, t)) throw new HttpError(403, 'El dueño no habilitó que los vendedores vean contraseñas');
    const [a] = await getDb().select().from(streamAccounts).where(scoped(streamAccounts, t.id, eq(streamAccounts.id, req.params.id)));
    if (!a) throw new NotFoundError('Cuenta');
    await logEvent(getDb(), { tenantId: t.id, type: 'account.password_viewed', entity: 'stream_account', entityId: a.id, userId: req.auth!.user.id });
    res.json({ password: decrypt(a.passwordEnc) });
  });

  return r;
}

export function paymentsRouter() {
  const r = Router();
  const query = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  r.get('/', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const f = query.parse(req.query);
    // Fechas en la zona horaria del negocio: "to" incluye todo ese día.
    const conds = [
      f.from ? gte(payments.paidAt, sql`(${f.from}::date)::timestamp at time zone ${t.timezone}`) : undefined,
      f.to ? lte(payments.paidAt, sql`((${f.to}::date + 1)::timestamp at time zone ${t.timezone}) - interval '1 microsecond'`) : undefined,
    ];
    const db = getDb();
    const where = scoped(payments, t.id, ...conds);
    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: payments.id,
          amount: payments.amount,
          method: payments.method,
          paidAt: payments.paidAt,
          subscriptionId: payments.subscriptionId,
          customerName: customers.name,
          serviceName: services.name,
        })
        .from(payments)
        .leftJoin(customers, eq(customers.id, payments.customerId))
        .leftJoin(subscriptions, eq(subscriptions.id, payments.subscriptionId))
        .leftJoin(services, eq(services.id, subscriptions.serviceId))
        .where(where)
        .orderBy(desc(payments.paidAt))
        .limit(500),
      db.select({ total: sum(payments.amount), n: count() }).from(payments).where(where),
    ]);
    res.json({ items: rows.map((p) => ({ ...p, amount: Number(p.amount) })), total: Number(totals!.total ?? 0), count: totals!.n });
  });

  return r;
}

export function activityRouter() {
  const r = Router();

  r.get('/events', async (req, res) => {
    const tenantId = tenantOf(req);
    const { limit } = searchQuery.parse(req.query);
    res.json(await getDb().select().from(events).where(eq(events.tenantId, tenantId)).orderBy(desc(events.createdAt)).limit(limit));
  });

  r.get('/calls', async (req, res) => {
    const tenantId = tenantOf(req);
    const { limit } = searchQuery.parse(req.query);
    const rows = await getDb()
      .select({
        id: calls.id,
        channel: calls.channel,
        status: calls.status,
        disconnectionReason: calls.disconnectionReason,
        durationMs: calls.durationMs,
        summary: calls.summary,
        sentiment: calls.sentiment,
        recordingUrl: calls.recordingUrl,
        intent: calls.intent,
        createdAt: calls.createdAt,
        subscriptionId: calls.subscriptionId,
        customerName: customers.name,
        phone: customers.phone,
      })
      .from(calls)
      .leftJoin(subscriptions, eq(subscriptions.id, calls.subscriptionId))
      .leftJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(scoped(calls, tenantId, ne(calls.channel, 'manual')))
      .orderBy(desc(calls.createdAt))
      .limit(limit);
    res.json(rows);
  });

  return r;
}

export function servicesRouter() {
  const r = Router();
  r.get('/', async (req, res) => {
    const rows = await getDb()
      .select()
      .from(services)
      .where(scoped(services, tenantOf(req)))
      .orderBy(asc(services.name));
    res.json(rows.map((s) => ({ ...s, price: Number(s.price) })));
  });
  return r;
}

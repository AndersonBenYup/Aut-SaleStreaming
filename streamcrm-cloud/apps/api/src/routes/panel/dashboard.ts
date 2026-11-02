import { Router } from 'express';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, ne, or, sum } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { getDb } from '../../db/index.js';
import { calls, events, payments, subscriptions } from '../../db/schema.js';
import { addDays, todayIn } from '../../lib/dates.js';
import { tenantOf } from '../../auth/session.js';
import { getTenant } from '../../modules/subscriptions.js';
import { scoped } from '../../modules/tenantScope.js';
import { listSubscriptions } from './subscriptions.js';

export function dashboardRouter() {
  const r = Router();

  r.get('/', async (req, res) => {
    const db = getDb();
    const t = await getTenant(tenantOf(req));
    const today = todayIn(t.timezone);
    const monthStart = DateTime.now().setZone(t.timezone).startOf('month').toJSDate();
    const notCanceled = ne(subscriptions.status, 'cancelada');

    const [byStatus, byIntent, [dueToday], [month], [renewals], [minutes], upcoming, attention, recent] = await Promise.all([
      db.select({ status: subscriptions.status, n: count() }).from(subscriptions).where(scoped(subscriptions, t.id)).groupBy(subscriptions.status),
      db
        .select({ intent: subscriptions.renewalIntent, n: count() })
        .from(subscriptions)
        .where(scoped(subscriptions, t.id, isNotNull(subscriptions.renewalIntent), notCanceled))
        .groupBy(subscriptions.renewalIntent),
      db.select({ n: count() }).from(subscriptions).where(scoped(subscriptions, t.id, eq(subscriptions.endDate, today), notCanceled)),
      db
        .select({ total: sum(payments.amount), n: count() })
        .from(payments)
        .where(scoped(payments, t.id, gte(payments.paidAt, monthStart))),
      db
        .select({ n: count() })
        .from(events)
        .where(and(eq(events.tenantId, t.id), eq(events.type, 'subscription.renewed'), gte(events.createdAt, monthStart))),
      db
        .select({ ms: sum(calls.durationMs) })
        .from(calls)
        .where(scoped(calls, t.id, eq(calls.channel, 'retell'), gte(calls.createdAt, monthStart))),
      // Próximos avisos programados.
      listSubscriptions(t, [eq(subscriptions.reminderStatus, 'pendiente'), isNotNull(subscriptions.reminderAt), notCanceled], {
        limit: 8,
        order: [asc(subscriptions.reminderAt)],
      }),
      // Lo que el negocio tiene que hacer a mano: cobrar a los que dijeron que sí, insistir a los que lo piensan,
      // avisar a los que no se pudo contactar.
      listSubscriptions(
        t,
        [
          notCanceled,
          or(inArray(subscriptions.renewalIntent, ['renueva', 'pensando', 'sin_respuesta']), eq(subscriptions.reminderStatus, 'fallido')),
          gte(subscriptions.endDate, addDays(today, -15)),
        ],
        { limit: 30, order: [asc(subscriptions.endDate)] },
      ),
      db.select().from(events).where(eq(events.tenantId, t.id)).orderBy(desc(events.createdAt)).limit(12),
    ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s.n]));
    res.json({
      today,
      counts: {
        activa: counts.activa ?? 0,
        por_vencer: counts.por_vencer ?? 0,
        vencida: counts.vencida ?? 0,
        cancelada: counts.cancelada ?? 0,
        venceHoy: dueToday!.n,
      },
      intents: Object.fromEntries(byIntent.map((i) => [i.intent, i.n])),
      month: { revenue: Number(month!.total ?? 0), payments: month!.n, renewals: renewals!.n },
      aiMinutesUsed: Math.ceil(Number(minutes!.ms ?? 0) / 60_000),
      upcoming,
      attention,
      recent,
      sheet: {
        connected: !!(t.sheetProvider && t.sheetSpreadsheetId),
        provider: t.sheetProvider,
        lastScanAt: t.sheetLastScanAt,
        lastError: t.sheetLastError,
        stats: t.sheetLastScanStats,
      },
      inDb: byStatus.reduce((a, s) => a + s.n, 0),
    });
  });

  return r;
}

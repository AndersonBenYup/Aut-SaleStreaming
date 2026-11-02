import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PAYMENT_METHODS, renewInput } from '@streamcrm/shared';
import { getDb } from '../db/index.js';
import { customers, events, services, subscriptions, tenants } from '../db/schema.js';
import { DateTime } from 'luxon';
import { dispatchDueReminders, sendReminder } from '../modules/reminders.js';
import { isWithinAllowedHours } from '../lib/dates.js';
import { createSale, recalcStatuses, renewSubscription } from '../modules/subscriptions.js';
import { scoped } from '../modules/tenantScope.js';
import { receiveWebhook } from '../modules/webhooks.js';
import { flushTenantSheet, scanTenantSheet } from '../sheets/sync.js';

/**
 * Rutas de desarrollo (deshabilitadas en producción) para probar el flujo hoja ↔ BD sin el panel:
 * escanear la hoja, disparar recordatorios, simular la respuesta de una llamada y renovar.
 */
export function devRouter() {
  const r = Router();

  r.get('/tenants', async (_req, res) => {
    res.json(await getDb().select({ id: tenants.id, name: tenants.name, sheet: tenants.sheetSpreadsheetId, lastScan: tenants.sheetLastScanAt, lastError: tenants.sheetLastError }).from(tenants));
  });

  r.post('/tenants/:tenantId/scan', async (req, res) => {
    res.json(await scanTenantSheet(req.params.tenantId));
  });

  r.post('/tenants/:tenantId/flush', async (req, res) => {
    res.json({ flushed: await flushTenantSheet(req.params.tenantId) });
  });

  /** body opcional: { "ahora": "2026-10-30T10:00:00-05:00" } para simular la hora (p. ej. probar de noche). */
  r.post('/dispatch', async (req, res) => {
    const { ahora } = z.object({ ahora: z.string().datetime({ offset: true }).optional() }).parse(req.body ?? {});
    await recalcStatuses();
    res.json({ sent: await dispatchDueReminders(ahora ? new Date(ahora) : new Date()) });
  });

  r.get('/tenants/:tenantId/subscriptions', async (req, res) => {
    const tid = req.params.tenantId;
    const rows = await getDb()
      .select({
        id: subscriptions.id,
        cliente: customers.name,
        telefono: customers.phone,
        servicio: services.name,
        vence: subscriptions.endDate,
        estado: subscriptions.status,
        recordatorio: subscriptions.reminderStatus,
        recordatorioEn: subscriptions.reminderAt,
        intentos: subscriptions.reminderAttempts,
        intencion: subscriptions.renewalIntent,
        origen: subscriptions.source,
        pendienteHoja: subscriptions.sheetDirty,
      })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .leftJoin(services, eq(services.id, subscriptions.serviceId))
      .where(scoped(subscriptions, tid))
      .orderBy(subscriptions.endDate);
    res.json(rows);
  });

  r.get('/tenants/:tenantId/events', async (req, res) => {
    res.json(await getDb().select().from(events).where(eq(events.tenantId, req.params.tenantId)).orderBy(desc(events.createdAt)).limit(100));
  });

  /** Simula lo que mandaría Retell al terminar una llamada. body: { renovacion: "sí" | "no" | "pensando" | ..., noContesta?: true } */
  r.post('/subscriptions/:id/simulate-call', async (req, res) => {
    const body = z.object({ renovacion: z.string().optional(), noContesta: z.boolean().optional() }).parse(req.body ?? {});
    const [sub] = await getDb().select().from(subscriptions).where(eq(subscriptions.id, req.params.id));
    if (!sub?.lastCallId) {
      res.status(400).json({ error: 'Esa suscripción todavía no tiene una llamada enviada (usa POST /dev/dispatch)' });
      return;
    }
    const call = {
      call_id: sub.lastCallId,
      metadata: { tenantId: sub.tenantId, subscriptionId: sub.id },
      duration_ms: body.noContesta ? 0 : 42000,
      disconnection_reason: body.noContesta ? 'dial_no_answer' : 'user_hangup',
      call_analysis: body.noContesta
        ? undefined
        : { call_summary: `Cliente respondió: ${body.renovacion}`, user_sentiment: 'Neutral', custom_analysis_data: { renovacion: body.renovacion } },
    };
    await receiveWebhook('retell', `call_ended:${call.call_id}`, { event: 'call_ended', call }, sub.tenantId, { inline: true });
    if (!body.noContesta) await receiveWebhook('retell', `call_analyzed:${call.call_id}`, { event: 'call_analyzed', call }, sub.tenantId, { inline: true });
    const [after] = await getDb().select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    res.json(after);
  });

  /**
   * Envía el aviso de UNA suscripción ya mismo. Si es de noche, simula que son las 10:00 de hoy
   * para no tener que esperar al horario permitido.
   */
  r.post('/subscriptions/:id/send-now', async (req, res) => {
    const db = getDb();
    const [row] = await db.select({ sub: subscriptions, t: tenants }).from(subscriptions).innerJoin(tenants, eq(tenants.id, subscriptions.tenantId)).where(eq(subscriptions.id, req.params.id));
    if (!row) {
      res.status(404).json({ error: 'No existe' });
      return;
    }
    let now = new Date();
    if (!isWithinAllowedHours(row.t, now)) now = DateTime.now().setZone(row.t.timezone).set({ hour: Math.max(10, row.t.allowedStartHour), minute: 0 }).toJSDate();
    await db.update(subscriptions).set({ reminderStatus: 'enviando', reminderAt: now }).where(eq(subscriptions.id, row.sub.id));
    await sendReminder(row.sub.id, now);
    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, row.sub.id));
    res.json(after);
  });

  r.post('/tenants/:tenantId/subscriptions/:id/renew', async (req, res) => {
    const input = renewInput.parse(req.body);
    res.json(await renewSubscription(req.params.tenantId, req.params.id, input));
  });

  r.post('/tenants/:tenantId/sales', async (req, res) => {
    const input = z
      .object({
        cliente: z.string().min(1),
        telefono: z.string().optional(),
        aceptaLlamadas: z.boolean().default(true),
        servicio: z.string().min(1),
        dias: z.number().int().positive().default(30),
        precio: z.number().nonnegative(),
        inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        perfil: z.string().optional(),
        pin: z.string().optional(),
        metodo: z.enum(PAYMENT_METHODS).optional(),
      })
      .parse(req.body);
    const sub = await createSale(req.params.tenantId, {
      customer: { name: input.cliente, phone: input.telefono, consentCalls: input.aceptaLlamadas },
      serviceName: input.servicio,
      durationDays: input.dias,
      price: input.precio,
      startDate: input.inicio,
      profileName: input.perfil,
      pin: input.pin,
    });
    res.status(201).json(sub);
  });

  return r;
}

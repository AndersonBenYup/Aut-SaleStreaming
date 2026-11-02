import path from 'node:path';
import { Router } from 'express';
import argon2 from 'argon2';
import { and, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { IANAZone } from 'luxon';
import { z } from 'zod';
import { sheetConnectInput, teamInviteInput, tenantSettingsInput, type Channel } from '@streamcrm/shared';
import { env } from '../../config/env.js';
import { getDb } from '../../db/index.js';
import { plans, subscriptions, tenants, users } from '../../db/schema.js';
import { encrypt } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http.js';
import { normalizePhone } from '../../lib/phone.js';
import { destroyUserSessions, requireRole, tenantOf } from '../../auth/session.js';
import { getTenant, logEvent, planReminder, requestSheetFlush, type Tenant } from '../../modules/subscriptions.js';
import { NotFoundError, scoped } from '../../modules/tenantScope.js';
import { GoogleSheetsClient, loadServiceAccount, spreadsheetIdFromUrl } from '../../sheets/googleClient.js';
import { SALES_FIELDS, SYSTEM_COLUMNS, type SalesField } from '../../sheets/headers.js';
import { parseSales } from '../../sheets/parseRow.js';
import { scanTenantSheet } from '../../sheets/sync.js';

async function planOf(t: Tenant) {
  if (!t.planId) return null;
  const [p] = await getDb().select().from(plans).where(eq(plans.id, t.planId));
  return p ?? null;
}

const publicSettings = (t: Tenant) => ({
  name: t.name,
  country: t.country,
  timezone: t.timezone,
  reminderChannel: t.reminderChannel,
  reminderDaysBefore: t.reminderDaysBefore,
  reminderHour: t.reminderHour,
  allowedStartHour: t.allowedStartHour,
  allowedEndHour: t.allowedEndHour,
  retellFromNumber: t.retellFromNumber,
  whatsappPhoneNumberId: t.whatsappPhoneNumberId,
  hasWhatsappToken: !!t.whatsappTokenEnc,
  whatsappTemplate: t.whatsappTemplate,
  ownerNotifyPhone: t.ownerNotifyPhone,
  staffCanSeePasswords: t.staffCanSeePasswords,
});

function serviceAccountEmail(): string | null {
  try {
    return loadServiceAccount(env().GOOGLE_SERVICE_ACCOUNT_JSON).client_email;
  } catch {
    return null;
  }
}

const sheetInfo = (t: Tenant) => ({
  provider: t.sheetProvider,
  spreadsheetId: t.sheetProvider === 'google' ? t.sheetSpreadsheetId : null,
  url: t.sheetProvider === 'google' && t.sheetSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${t.sheetSpreadsheetId}/edit` : null,
  // Para la hoja local de demo solo se muestra el nombre del archivo.
  fileName: t.sheetProvider === 'xlsx' && t.sheetSpreadsheetId ? path.basename(t.sheetSpreadsheetId) : null,
  salesTab: t.sheetSalesTab,
  accountsTab: t.sheetAccountsTab,
  dateOrder: t.sheetDateOrder,
  lastScanAt: t.sheetLastScanAt,
  lastError: t.sheetLastError,
  stats: t.sheetLastScanStats,
  serviceAccountEmail: serviceAccountEmail(),
});

const FIELD_LABEL: Partial<Record<SalesField, string>> = Object.fromEntries(
  Object.entries(SALES_FIELDS).map(([k, aliases]) => [k, aliases[0]]),
);

export function settingsRouter() {
  const r = Router();

  r.get('/', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const plan = await planOf(t);
    res.json({ ...publicSettings(t), plan: plan && { code: plan.code, name: plan.name, limits: plan.limits } });
  });

  r.patch('/', requireRole('owner'), async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const input = tenantSettingsInput.parse(req.body);
    if (input.timezone && !IANAZone.isValidZone(input.timezone)) throw new HttpError(400, 'Zona horaria inválida');
    const start = input.allowedStartHour ?? t.allowedStartHour;
    const end = input.allowedEndHour ?? t.allowedEndHour;
    if (start >= end) throw new HttpError(400, 'La hora de inicio debe ser menor que la de fin');
    if (input.reminderChannel && input.reminderChannel !== 'manual') {
      const allowed: Channel[] = (await planOf(t))?.limits.channels_allowed ?? ['manual'];
      if (!allowed.includes(input.reminderChannel)) {
        throw new HttpError(400, input.reminderChannel === 'retell' ? 'Tu plan no incluye llamadas con IA' : 'Tu plan no incluye WhatsApp');
      }
    }
    const phoneOrNull = (v: string | null | undefined) => (v === undefined ? undefined : v ? normalizePhone(v, t.country) : null);
    const values = {
      name: input.name,
      timezone: input.timezone,
      country: input.country?.toUpperCase(),
      reminderChannel: input.reminderChannel,
      reminderDaysBefore: input.reminderDaysBefore,
      reminderHour: input.reminderHour,
      allowedStartHour: input.allowedStartHour,
      allowedEndHour: input.allowedEndHour,
      retellFromNumber: phoneOrNull(input.retellFromNumber),
      whatsappPhoneNumberId: input.whatsappPhoneNumberId,
      whatsappTokenEnc: input.whatsappToken === undefined ? undefined : encrypt(input.whatsappToken || null),
      whatsappTemplate: input.whatsappTemplate,
      ownerNotifyPhone: phoneOrNull(input.ownerNotifyPhone),
      staffCanSeePasswords: input.staffCanSeePasswords,
      updatedAt: new Date(),
    };
    const [updated] = await getDb().update(tenants).set(values).where(eq(tenants.id, t.id)).returning();

    // Si cambió cuándo se avisa, se reprograman los avisos que aún no se enviaron.
    const timing = ['timezone', 'reminderDaysBefore', 'reminderHour', 'allowedStartHour', 'allowedEndHour'] as const;
    if (timing.some((k) => input[k] !== undefined && input[k] !== t[k])) {
      const pending = await getDb()
        .select()
        .from(subscriptions)
        .where(scoped(subscriptions, t.id, eq(subscriptions.reminderStatus, 'pendiente'), eq(subscriptions.reminderAttempts, 0), ne(subscriptions.status, 'cancelada')));
      for (const s of pending) {
        await getDb()
          .update(subscriptions)
          .set({ reminderAt: planReminder(updated!, s.endDate), sheetDirty: true, updatedAt: new Date() })
          .where(eq(subscriptions.id, s.id));
      }
      if (pending.length) await requestSheetFlush(t.id);
    }
    await logEvent(getDb(), {
      tenantId: t.id,
      type: 'settings.updated',
      userId: req.auth!.user.id,
      data: { fields: Object.keys(input).filter((k) => k !== 'whatsappToken' || input.whatsappToken !== undefined) },
    });
    res.json(publicSettings(updated!));
  });

  // ---------- Hoja de cálculo ----------

  r.get('/sheet', async (req, res) => {
    res.json(sheetInfo(await getTenant(tenantOf(req))));
  });

  /**
   * Conectar una Google Sheet: prueba leerla con la service account, detecta los encabezados y, si todo está bien,
   * la guarda y la escanea por primera vez.
   */
  r.post('/sheet', requireRole('owner'), async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const input = sheetConnectInput.parse(req.body);
    const email = serviceAccountEmail();
    if (!email) throw new HttpError(400, 'El servidor no tiene configurada la cuenta de Google (GOOGLE_SERVICE_ACCOUNT_JSON). Ver docs/google-sheets.md');
    const spreadsheetId = spreadsheetIdFromUrl(input.url);
    let data;
    try {
      data = await new GoogleSheetsClient(spreadsheetId, env().GOOGLE_SERVICE_ACCOUNT_JSON).read(input.salesTab);
    } catch (err) {
      const msg = (err as Error).message;
      if (/permission|403|caller does not have/i.test(msg)) {
        throw new HttpError(400, `No tengo acceso a la hoja. Compártela como Editor con ${email}`);
      }
      if (/not found|404|unable to parse range/i.test(msg)) {
        throw new HttpError(400, `No encontré la hoja o la pestaña "${input.salesTab}"`);
      }
      throw new HttpError(400, `No pude leer la hoja: ${msg}`);
    }
    if (!data) throw new HttpError(400, `No existe la pestaña "${input.salesTab}"`);
    const parsed = parseSales(data, { country: t.country, dateOrder: input.dateOrder });
    if (!parsed) throw new HttpError(400, 'No encontré los encabezados. Se necesita al menos CLIENTE y una FECHA DE VENCIMIENTO (o FECHA INICIO + VENCIMIENTO en días).');

    const [updated] = await getDb()
      .update(tenants)
      .set({
        sheetProvider: 'google',
        sheetSpreadsheetId: spreadsheetId,
        sheetSalesTab: input.salesTab,
        sheetAccountsTab: input.accountsTab,
        sheetDateOrder: input.dateOrder,
        sheetLastError: null,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, t.id))
      .returning();
    await logEvent(getDb(), { tenantId: t.id, type: 'sheet.connected', userId: req.auth!.user.id, data: { spreadsheetId } });
    const scan = await scanTenantSheet(t.id).catch((err: Error) => ({ error: err.message }));
    const detected = Object.keys(parsed.headers.columns) as SalesField[];
    res.json({
      sheet: sheetInfo(updated!),
      detected: detected.map((f) => FIELD_LABEL[f]),
      missing: (['telefono', 'acepta_llamadas'] as SalesField[]).filter((f) => !detected.includes(f)).map((f) => FIELD_LABEL[f]),
      systemColumnsCreated: SYSTEM_COLUMNS.filter((c) => !detected.includes(c.field)).map((c) => c.header),
      rows: parsed.sales.length,
      invalidRows: parsed.invalidRows.length,
      scan,
    });
  });

  r.delete('/sheet', requireRole('owner'), async (req, res) => {
    const tenantId = tenantOf(req);
    await getDb()
      .update(tenants)
      .set({ sheetProvider: null, sheetSpreadsheetId: null, sheetLastError: null, sheetLastScanStats: null, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
    await logEvent(getDb(), { tenantId, type: 'sheet.disconnected', userId: req.auth!.user.id });
    res.status(204).end();
  });

  /** Escanear ya (sin esperar los 15 minutos). Cualquier usuario del negocio puede hacerlo. */
  r.post('/sheet/scan', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    if (!t.sheetProvider || !t.sheetSpreadsheetId) throw new HttpError(400, 'Primero conecta la hoja del negocio');
    try {
      res.json(await scanTenantSheet(t.id));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });

  return r;
}

// ---------- Equipo ----------

export function teamRouter() {
  const r = Router();
  r.use(requireRole('owner'));

  const columns = { id: users.id, name: users.name, email: users.email, role: users.role, lastLoginAt: users.lastLoginAt, disabledAt: users.disabledAt, createdAt: users.createdAt };

  r.get('/', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const rows = await getDb().select(columns).from(users).where(eq(users.tenantId, t.id)).orderBy(users.createdAt);
    const plan = await planOf(t);
    res.json({ users: rows, maxUsers: plan?.limits.max_users ?? 1 });
  });

  r.post('/', async (req, res) => {
    const t = await getTenant(tenantOf(req));
    const input = teamInviteInput.parse(req.body);
    const db = getDb();
    const max = (await planOf(t))?.limits.max_users ?? 1;
    const [{ n }] = (await db.select({ n: count() }).from(users).where(and(eq(users.tenantId, t.id), isNull(users.disabledAt)))) as [{ n: number }];
    if (n >= max) throw new HttpError(402, `Tu plan permite ${max} usuario${max === 1 ? '' : 's'}. Mejora el plan para agregar más.`);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (exists) throw new HttpError(409, 'Ya existe un usuario con ese email');
    const [u] = await db
      .insert(users)
      .values({ tenantId: t.id, name: input.name, email: input.email, role: input.role, passwordHash: await argon2.hash(input.password) })
      .returning(columns);
    await logEvent(db, { tenantId: t.id, type: 'team.user_added', userId: req.auth!.user.id, data: { email: u!.email, role: u!.role } });
    res.status(201).json(u);
  });

  r.patch('/:id', async (req, res) => {
    const tenantId = tenantOf(req);
    const input = z.object({ role: z.enum(['owner', 'staff']).optional(), disabled: z.boolean().optional() }).parse(req.body);
    if (req.params.id === req.auth!.user.id) throw new HttpError(400, 'No puedes cambiar tu propio usuario');
    const db = getDb();
    const [u] = await db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.tenantId, tenantId)));
    if (!u) throw new NotFoundError('Usuario');
    if (input.disabled === false && u.disabledAt) {
      const t = await getTenant(tenantId);
      const max = (await planOf(t))?.limits.max_users ?? 1;
      const [{ n }] = (await db.select({ n: count() }).from(users).where(and(eq(users.tenantId, tenantId), isNull(users.disabledAt)))) as [{ n: number }];
      if (n >= max) throw new HttpError(402, `Tu plan permite ${max} usuarios activos`);
    }
    await db
      .update(users)
      .set({
        role: input.role ?? u.role,
        disabledAt: input.disabled === undefined ? u.disabledAt : input.disabled ? (u.disabledAt ?? new Date()) : null,
      })
      .where(eq(users.id, u.id));
    if (input.disabled) await destroyUserSessions(u.id);
    await logEvent(db, { tenantId, type: 'team.user_updated', userId: req.auth!.user.id, data: { email: u.email, ...input } });
    res.status(204).end();
  });

  return r;
}

// ---------- Super-admin (mínimo; el panel completo llega en la fase 4) ----------

export function adminRouter() {
  const r = Router();
  r.use(requireRole());
  r.get('/tenants', async (_req, res) => {
    const rows = await getDb()
      .select({
        id: tenants.id,
        name: tenants.name,
        subscriptionStatus: tenants.subscriptionStatus,
        trialEndsAt: tenants.trialEndsAt,
        plan: plans.name,
        createdAt: tenants.createdAt,
        subscriptions: sql<number>`(select count(*)::int from subscriptions s where s.tenant_id = ${tenants.id})`,
        users: sql<number>`(select count(*)::int from users u where u.tenant_id = ${tenants.id})`,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .orderBy(tenants.createdAt);
    res.json(rows);
  });
  return r;
}

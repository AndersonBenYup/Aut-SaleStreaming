import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { env } from '../config/env.js';
import { getDb, type Db } from '../db/index.js';
import { customers, services, streamAccounts, subscriptions, tenants } from '../db/schema.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { todayIn } from '../lib/dates.js';
import {
  computeStatus,
  getTenant,
  guessPlatform,
  logEvent,
  planReminder,
  upsertCustomer,
  upsertService,
  type Subscription,
  type Tenant,
} from '../modules/subscriptions.js';
import { scoped } from '../modules/tenantScope.js';
import { isFormula, shiftFormula, type CellUpdate, type SheetData, type SheetsClient, type SheetValue } from './client.js';
import { GoogleSheetsClient } from './googleClient.js';
import { SYSTEM_COLUMNS, type HeaderMap, type SalesField } from './headers.js';
import { INTENT_LABEL, localDateTime, reminderLabel } from './labels.js';
import { parseAccounts, parseSales, type SheetAccount, type SheetSale } from './parseRow.js';
import { XlsxFileClient } from './xlsxClient.js';

type ClientFactory = (t: Tenant) => SheetsClient | null;

const defaultFactory: ClientFactory = (t) => {
  if (!t.sheetProvider || !t.sheetSpreadsheetId) return null;
  if (t.sheetProvider === 'google') return new GoogleSheetsClient(t.sheetSpreadsheetId, env().GOOGLE_SERVICE_ACCOUNT_JSON);
  if (t.sheetProvider === 'xlsx') return new XlsxFileClient(t.sheetSpreadsheetId);
  return null;
};
let factory: ClientFactory = defaultFactory;
export const setSheetClientFactory = (f: ClientFactory | null) => {
  factory = f ?? defaultFactory;
};
export const sheetClientFor = (t: Tenant) => factory(t);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const rowKey = (s: SheetSale) =>
  createHash('sha256')
    .update([s.customerName.toLowerCase(), s.phone ?? s.phoneRaw ?? '', s.endDate, s.accountEmail ?? '', s.profile ?? ''].join('|'))
    .digest('hex')
    .slice(0, 32);

export interface ScanResult {
  rows: number;
  imported: number;
  updatedFromSheet: number;
  /** filas que siguen solo en la hoja (lejos de vencer) */
  waiting: number;
  invalid: number;
  flushed: number;
}

interface LoadedSheet {
  data: SheetData;
  headers: HeaderMap<SalesField>;
  sales: SheetSale[];
  invalidRows: number[];
  /** encabezados de columnas del sistema que faltaban y hay que escribir */
  headerUpdates: CellUpdate[];
}

async function loadSales(t: Tenant, client: SheetsClient): Promise<LoadedSheet> {
  const data = await client.read(t.sheetSalesTab);
  if (!data) throw new Error(`No existe la pestaña "${t.sheetSalesTab}" en la hoja`);
  const parsed = parseSales(data, { country: t.country, dateOrder: t.sheetDateOrder as 'dmy' | 'mdy' });
  if (!parsed) throw new Error(`No encontré los encabezados en "${t.sheetSalesTab}" (se necesita al menos CLIENTE y una fecha de vencimiento)`);
  const headerUpdates: CellUpdate[] = [];
  for (const sc of SYSTEM_COLUMNS) {
    if (parsed.headers.columns[sc.field] === undefined) {
      const col = ++parsed.headers.lastCol;
      parsed.headers.columns[sc.field] = col;
      headerUpdates.push({ row: parsed.headers.row, col, value: sc.header });
    }
  }
  return { data, ...parsed, headerUpdates };
}

async function loadAccounts(t: Tenant, client: SheetsClient): Promise<Map<string, SheetAccount>> {
  try {
    const data = await client.read(t.sheetAccountsTab);
    if (!data) return new Map();
    return new Map(parseAccounts(data, { dateOrder: t.sheetDateOrder as 'dmy' | 'mdy' }).map((a) => [a.email, a]));
  } catch (err) {
    logger.warn({ err, tenantId: t.id }, 'no se pudo leer la pestaña de cuentas');
    return new Map();
  }
}

/** Celda a escribir solo si la columna existe y no tiene fórmula en esa fila. */
function cell(sheet: LoadedSheet, row: number, field: SalesField, value: SheetValue): CellUpdate | null {
  const col = sheet.headers.columns[field];
  if (col === undefined || isFormula(sheet.data, row, col)) return null;
  return { row, col, value };
}

async function upsertAccount(db: Db, tenantId: string, sale: SheetSale, acc: SheetAccount | undefined): Promise<string | null> {
  if (!sale.accountEmail) return null;
  const password = acc?.password ?? sale.accountPassword;
  const values = {
    tenantId,
    email: sale.accountEmail,
    platform: guessPlatform(acc?.service ?? sale.service ?? ''),
    serviceLabel: acc?.service ?? sale.service,
    passwordEnc: encrypt(password),
    totalProfiles: acc?.totalProfiles ?? 1,
    expiresOn: acc?.expiresOn ?? null,
    cost: String(acc?.cost ?? sale.cost ?? 0),
    provider: acc?.provider ?? null,
    sheetStatus: acc?.status ?? null,
  };
  const [row] = await db
    .insert(streamAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [streamAccounts.tenantId, streamAccounts.email],
      set: { passwordEnc: values.passwordEnc, totalProfiles: values.totalProfiles, expiresOn: values.expiresOn, sheetStatus: values.sheetStatus },
    })
    .returning({ id: streamAccounts.id });
  return row!.id;
}

async function importRow(db: Db, t: Tenant, sale: SheetSale, acc: SheetAccount | undefined, now: Date) {
  const today = todayIn(t.timezone, now);
  const customerId = await upsertCustomer(db, t.id, {
    name: sale.customerName,
    phone: sale.phone,
    // Sin columna de consentimiento en la hoja no se asume permiso para llamadas automáticas.
    consentCalls: sale.consent ?? false,
  });
  const durationDays = sale.durationDays ?? 30;
  const serviceName = sale.service ?? sale.accountLabel ?? 'Servicio';
  const serviceId = await upsertService(db, t.id, serviceName, sale.price ?? 0, durationDays);
  const streamAccountId = await upsertAccount(db, t.id, sale, acc);
  const reminderAt = planReminder(t, sale.endDate, now);
  const [row] = await db
    .insert(subscriptions)
    .values({
      tenantId: t.id,
      customerId,
      serviceId,
      streamAccountId,
      profileName: sale.profile,
      pinEnc: encrypt(sale.pin),
      startDate: sale.startDate ?? sale.endDate,
      endDate: sale.endDate,
      durationDays,
      price: String(sale.price ?? 0),
      cost: String(sale.cost ?? 0),
      status: computeStatus(sale.endDate, today),
      reminderAt,
      reminderStatus: 'pendiente',
      source: 'sheet',
      sheetRowKey: rowKey(sale),
      sheetEndDateSeen: sale.endDate,
      sheetPhoneSeen: sale.phone,
      sheetSyncedAt: now,
    })
    .onConflictDoUpdate({ target: [subscriptions.tenantId, subscriptions.sheetRowKey], set: { sheetSyncedAt: now } })
    .returning();
  return row!;
}

/** El negocio editó la fila en la hoja: la hoja gana y se reprograma el recordatorio. */
async function applySheetEdits(db: Db, t: Tenant, sub: Subscription, sale: SheetSale, now: Date): Promise<boolean> {
  let changed = false;
  if (sale.phone && sale.phone !== sub.sheetPhoneSeen) {
    try {
      await db
        .update(customers)
        .set({ phone: sale.phone, updatedAt: now })
        .where(scoped(customers, t.id, eq(customers.id, sub.customerId)));
    } catch (err) {
      // Otro cliente ya tiene ese número: se registra y se deja como estaba.
      await logEvent(db, { tenantId: t.id, type: 'sheet.phone_conflict', entity: 'subscription', entityId: sub.id, data: { phone: sale.phone } });
    }
    await db.update(subscriptions).set({ sheetPhoneSeen: sale.phone }).where(eq(subscriptions.id, sub.id));
    changed = true;
  }
  if (sale.endDate !== sub.sheetEndDateSeen) {
    const extended = sale.endDate > sub.endDate;
    if (sub.sheetDirty && sub.endDate !== sale.endDate) {
      await logEvent(db, {
        tenantId: t.id,
        type: 'sheet.conflict',
        entity: 'subscription',
        entityId: sub.id,
        data: { sheet: sale.endDate, db: sub.endDate, winner: 'sheet' },
      });
    }
    await db
      .update(subscriptions)
      .set({
        endDate: sale.endDate,
        startDate: sale.startDate ?? sub.startDate,
        durationDays: sale.durationDays ?? sub.durationDays,
        status: computeStatus(sale.endDate, todayIn(t.timezone, now), sub.status),
        reminderAt: planReminder(t, sale.endDate, now),
        ...(extended ? { reminderStatus: 'pendiente', reminderAttempts: 0, renewalIntent: null } : {}),
        sheetEndDateSeen: sale.endDate,
        sheetSyncedAt: now,
        // Se re-escriben INTENCIÓN/RECORDATORIO con el nuevo estado.
        sheetDirty: true,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));
    await logEvent(db, {
      tenantId: t.id,
      type: 'sheet.edited',
      entity: 'subscription',
      entityId: sub.id,
      data: { from: sub.endDate, to: sale.endDate },
    });
    changed = true;
  }
  return changed;
}

/**
 * Recorre la pestaña de ventas. Solo pasan a la BD las filas cuyo recordatorio cae dentro de la ventana
 * (SHEET_IMPORT_WINDOW_HOURS) o que ya vencieron; el resto sigue viviendo solo en la hoja.
 */
export async function scanTenantSheet(tenantId: string, opts: { now?: Date } = {}): Promise<ScanResult> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const t = await getTenant(tenantId, db);
  const client = sheetClientFor(t);
  if (!client) throw new Error('El negocio no tiene una hoja conectada');
  const result: ScanResult = { rows: 0, imported: 0, updatedFromSheet: 0, waiting: 0, invalid: 0, flushed: 0 };

  try {
    const sheet = await loadSales(t, client);
    const accounts = await loadAccounts(t, client);
    const today = todayIn(t.timezone, now);
    const horizon = now.getTime() + env().SHEET_IMPORT_WINDOW_HOURS * 3600_000;
    result.rows = sheet.sales.length;
    result.invalid = sheet.invalidRows.length;

    const ids = [...new Set(sheet.sales.map((s) => s.systemId).filter((id): id is string => !!id && UUID_RE.test(id)))];
    const existing = ids.length
      ? await db.select().from(subscriptions).where(scoped(subscriptions, t.id, inArray(subscriptions.id, ids)))
      : [];
    const byId = new Map(existing.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const updates: CellUpdate[] = [...sheet.headerUpdates];

    for (const sale of sheet.sales) {
      const sub = sale.systemId ? byId.get(sale.systemId) : undefined;
      if (sub && !seen.has(sub.id)) {
        seen.add(sub.id);
        if (await applySheetEdits(db, t, sub, sale, now)) result.updatedFromSheet++;
        continue;
      }
      // ID duplicado (fila copiada) o de otro negocio: se trata como fila nueva.
      if (sale.systemId) {
        const c = cell(sheet, sale.row, 'id_sistema', null);
        if (c) updates.push(c);
      }
      const reminderAt = planReminder(t, sale.endDate, now);
      const due = sale.endDate < today || (reminderAt !== null && reminderAt.getTime() <= horizon);
      if (!due) {
        result.waiting++;
        continue;
      }
      const created = await importRow(db, t, sale, accounts.get(sale.accountEmail ?? ''), now);
      result.imported++;
      for (const c of [
        cell(sheet, sale.row, 'id_sistema', created.id),
        cell(sheet, sale.row, 'recordatorio', reminderLabel(created, t.timezone)),
      ]) {
        if (c) {
          // Si antes se puso null por ID duplicado, el nuevo valor lo reemplaza.
          const i = updates.findIndex((u) => u.row === c.row && u.col === c.col);
          if (i >= 0) updates.splice(i, 1);
          updates.push(c);
        }
      }
    }

    await client.update(t.sheetSalesTab, updates);
    result.flushed = await flushTenantSheet(t.id, { now, client });
    await db
      .update(tenants)
      .set({ sheetLastScanAt: now, sheetLastError: null, sheetLastScanStats: { ...result } })
      .where(eq(tenants.id, t.id));
    if (result.imported || result.updatedFromSheet) {
      await logEvent(db, { tenantId: t.id, type: 'sheet.scan', data: { ...result } });
    }
    return result;
  } catch (err) {
    await db.update(tenants).set({ sheetLastError: (err as Error).message }).where(eq(tenants.id, t.id));
    throw err;
  }
}

function lastDataRow(sheet: LoadedSheet): number {
  let last = sheet.headers.row;
  const keyCols = (['cliente', 'correo', 'fecha_inicio', 'id_sistema'] as SalesField[])
    .map((f) => sheet.headers.columns[f])
    .filter((c): c is number => c !== undefined);
  for (let r = sheet.headers.row + 1; r < sheet.data.values.length; r++) {
    const row = sheet.data.values[r] ?? [];
    if (keyCols.some((c) => row[c] !== null && row[c] !== undefined && String(row[c]).trim() !== '')) last = r;
  }
  return last;
}

/**
 * Escribe en la hoja todo lo que cambió en la BD (sheet_dirty = true): intención, estado del recordatorio,
 * último contacto, resumen y fechas al renovar. Las ventas creadas desde el panel se agregan como filas nuevas.
 * Devuelve cuántas suscripciones se sincronizaron.
 */
export async function flushTenantSheet(tenantId: string, opts: { now?: Date; client?: SheetsClient } = {}): Promise<number> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const t = await getTenant(tenantId, db);
  const client = opts.client ?? sheetClientFor(t);
  if (!client) return 0;

  const dirty = await db
    .select({ sub: subscriptions, customer: customers, service: services, account: streamAccounts })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .leftJoin(services, eq(services.id, subscriptions.serviceId))
    .leftJoin(streamAccounts, eq(streamAccounts.id, subscriptions.streamAccountId))
    .where(scoped(subscriptions, t.id, eq(subscriptions.sheetDirty, true)));
  if (!dirty.length) return 0;

  const sheet = await loadSales(t, client);
  const rowById = new Map(sheet.sales.filter((s) => s.systemId).map((s) => [s.systemId!, s]));
  const updates: CellUpdate[] = [...sheet.headerUpdates];
  let nextRow = lastDataRow(sheet) + 1;
  const templateRow = nextRow - 1 > sheet.headers.row ? nextRow - 1 : null;
  const synced: { id: string; updatedAt: Date; endDate: string; phone: string | null }[] = [];
  const push = (c: CellUpdate | null) => c && updates.push(c);

  for (const { sub, customer, service, account } of dirty) {
    const systemCells = (row: number) => [
      cell(sheet, row, 'intencion', sub.renewalIntent ? INTENT_LABEL[sub.renewalIntent as keyof typeof INTENT_LABEL] : ''),
      cell(sheet, row, 'recordatorio', reminderLabel(sub, t.timezone)),
      cell(sheet, row, 'ultimo_contacto', localDateTime(sub.lastContactAt, t.timezone)),
      cell(sheet, row, 'resumen', sub.lastCallSummary ?? ''),
      cell(sheet, row, 'id_sistema', sub.id),
    ];
    const sale = rowById.get(sub.id);
    if (sale) {
      systemCells(sale.row).forEach(push);
      if (sale.endDate !== sub.endDate) {
        // Renovación: se cambia inicio + días; si FECHA DE VENCIMIENTO es una fórmula, se recalcula sola.
        push(cell(sheet, sale.row, 'fecha_inicio', { date: sub.startDate }));
        if (sale.durationDays !== sub.durationDays) push(cell(sheet, sale.row, 'dias', sub.durationDays));
        push(cell(sheet, sale.row, 'fecha_vencimiento', { date: sub.endDate }));
        if (Number(sub.price) && sale.price !== Number(sub.price)) push(cell(sheet, sale.row, 'precio', Number(sub.price)));
      }
    } else if (sub.source !== 'sheet') {
      // Venta del panel/API: fila nueva copiando las fórmulas de la fila anterior.
      const row = nextRow++;
      const fields: [SalesField, SheetValue][] = [
        ['correo', account?.email ?? null],
        ['contrasena', decrypt(account?.passwordEnc) ?? null],
        ['cliente', customer.name],
        ['telefono', customer.phone],
        ['servicio', service?.name ?? null],
        ['perfil', sub.profileName],
        ['pin', decrypt(sub.pinEnc)],
        ['fecha_inicio', { date: sub.startDate }],
        ['dias', sub.durationDays],
        ['fecha_vencimiento', { date: sub.endDate }],
        ['costo', Number(sub.cost)],
        ['precio', Number(sub.price)],
        ['acepta_llamadas', customer.consentCalls ? 'SI' : 'NO'],
      ];
      const formulaCols = new Set<number>();
      if (templateRow !== null) {
        (sheet.data.formulas[templateRow] ?? []).forEach((f, col) => {
          if (!f || f === '=') return;
          formulaCols.add(col);
          updates.push({ row, col, value: { formula: shiftFormula(f, templateRow + 1, row + 1) } });
        });
      }
      for (const [field, value] of fields) {
        const col = sheet.headers.columns[field];
        if (col !== undefined && !formulaCols.has(col) && value !== null) updates.push({ row, col, value });
      }
      systemCells(row).forEach((c) => c && !formulaCols.has(c.col) && updates.push(c));
    } else {
      // Fila de la hoja que el negocio borró: no se vuelve a crear.
      await logEvent(db, { tenantId: t.id, type: 'sheet.row_missing', entity: 'subscription', entityId: sub.id });
    }
    synced.push({ id: sub.id, updatedAt: sub.updatedAt, endDate: sub.endDate, phone: customer.phone });
  }

  await client.update(t.sheetSalesTab, updates);
  for (const s of synced) {
    // Solo se limpia si nadie modificó la suscripción mientras escribíamos (si no, queda para el próximo flush).
    await db
      .update(subscriptions)
      .set({ sheetDirty: false, sheetEndDateSeen: s.endDate, sheetPhoneSeen: s.phone, sheetSyncedAt: now })
      .where(and(eq(subscriptions.id, s.id), eq(subscriptions.updatedAt, s.updatedAt)));
  }
  return synced.length;
}

/** Escanea todas las hojas conectadas de negocios activos. */
export async function scanAllSheets() {
  const db = getDb();
  const list = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(inArray(tenants.subscriptionStatus, ['trialing', 'active', 'past_due']));
  for (const { id } of list) {
    const t = await getTenant(id, db);
    if (!t.sheetProvider || !t.sheetSpreadsheetId) continue;
    try {
      await scanTenantSheet(id);
    } catch (err) {
      logger.error({ err, tenantId: id }, 'error al escanear la hoja');
    }
  }
}

import { addDays, daysBetween, parseSheetDate } from '../lib/dates.js';
import { parseMoney } from '../lib/money.js';
import { normalizePhone } from '../lib/phone.js';
import {
  ACCOUNT_FIELDS,
  SALES_FIELDS,
  detectHeaders,
  type AccountField,
  type HeaderMap,
  type SalesField,
} from './headers.js';
import type { SheetData } from './client.js';

export interface SheetSale {
  /** fila en la hoja, base 0 */
  row: number;
  systemId: string | null;
  customerName: string;
  phoneRaw: string | null;
  phone: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  accountLabel: string | null;
  service: string | null;
  profile: string | null;
  pin: string | null;
  startDate: string | null;
  durationDays: number | null;
  endDate: string;
  cost: number | null;
  price: number | null;
  /** null = la hoja no tiene la columna */
  consent: boolean | null;
}

export interface SheetAccount {
  row: number;
  status: string | null;
  service: string | null;
  email: string;
  password: string | null;
  totalProfiles: number | null;
  durationDays: number | null;
  createdOn: string | null;
  expiresOn: string | null;
  provider: string | null;
  cost: number | null;
}

export interface ParsedSales {
  headers: HeaderMap<SalesField>;
  sales: SheetSale[];
  /** filas con cliente pero sin fecha de vencimiento interpretable */
  invalidRows: number[];
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s ? s : null;
};

const intOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseMoney(v);
  return n === null ? null : Math.round(n);
};

const yesNo = (v: unknown): boolean | null => {
  const s = text(v)?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return null;
  if (/^(si|s|yes|y|x|1|true|acepta)$/.test(s)) return true;
  if (/^(no|n|0|false)$/.test(s)) return false;
  return null;
};

/** Columnas que suelen venir en celdas combinadas (una cuenta madre para varios clientes). */
const FILL_DOWN: SalesField[] = ['correo', 'contrasena', 'cuenta'];

export function parseSales(data: SheetData, opts: { country: string; dateOrder: 'dmy' | 'mdy' }): ParsedSales | null {
  const headers = detectHeaders(data.values, SALES_FIELDS, ['cliente']);
  if (!headers || headers.columns.cliente === undefined) return null;
  const col = headers.columns;
  const get = (row: unknown[], f: SalesField) => (col[f] === undefined ? null : row[col[f]!]);

  const sales: SheetSale[] = [];
  const invalidRows: number[] = [];
  const carry: Partial<Record<SalesField, unknown>> = {};

  for (let r = headers.row + 1; r < data.values.length; r++) {
    const row = data.values[r] ?? [];
    const customerName = text(get(row, 'cliente'));
    if (!customerName) {
      // Una fila vacía corta el relleno hacia abajo: evita heredar datos de otra tabla.
      if (row.every((c) => text(c) === null)) for (const f of FILL_DOWN) delete carry[f];
      continue;
    }
    for (const f of FILL_DOWN) {
      const v = get(row, f);
      if (text(v) !== null) carry[f] = v;
    }
    const filled = (f: SalesField) => (FILL_DOWN.includes(f) ? (carry[f] ?? null) : get(row, f));

    // "VENCIMIENTO" en muchas hojas es la duración (30) y en otras una fecha: se detecta por el valor.
    const rawDays = get(row, 'dias');
    const daysAsDate = rawDays instanceof Date || (typeof rawDays === 'number' && rawDays > 20000) ? parseSheetDate(rawDays) : null;
    let durationDays = daysAsDate ? null : intOrNull(rawDays);

    const startDate = parseSheetDate(get(row, 'fecha_inicio'), opts.dateOrder);
    let endDate = parseSheetDate(get(row, 'fecha_vencimiento'), opts.dateOrder) ?? daysAsDate;
    if (!endDate && startDate && durationDays) endDate = addDays(startDate, durationDays);
    if (!durationDays && startDate && endDate) durationDays = daysBetween(startDate, endDate);
    if (!endDate) {
      invalidRows.push(r);
      continue;
    }

    const phoneRaw = text(get(row, 'telefono'));
    sales.push({
      row: r,
      systemId: text(get(row, 'id_sistema')),
      customerName,
      phoneRaw,
      phone: normalizePhone(phoneRaw, opts.country),
      accountEmail: text(filled('correo'))?.toLowerCase() ?? null,
      accountPassword: text(filled('contrasena')),
      accountLabel: text(filled('cuenta')),
      service: text(get(row, 'servicio'))?.replace(/\s*\|\s*$/, '') ?? null,
      profile: text(get(row, 'perfil')),
      pin: text(get(row, 'pin')),
      startDate,
      durationDays,
      endDate,
      cost: parseMoney(get(row, 'costo')),
      price: parseMoney(get(row, 'precio')),
      consent: col.acepta_llamadas === undefined ? null : yesNo(get(row, 'acepta_llamadas')),
    });
  }
  return { headers, sales, invalidRows };
}

export function parseAccounts(data: SheetData, opts: { dateOrder: 'dmy' | 'mdy' }): SheetAccount[] {
  const headers = detectHeaders(data.values, ACCOUNT_FIELDS, ['correo', 'perfiles']);
  if (!headers || headers.columns.correo === undefined) return [];
  const col = headers.columns;
  const get = (row: unknown[], f: AccountField) => (col[f] === undefined ? null : row[col[f]!]);
  const out: SheetAccount[] = [];
  for (let r = headers.row + 1; r < data.values.length; r++) {
    const row = data.values[r] ?? [];
    const email = text(get(row, 'correo'))?.toLowerCase();
    if (!email) continue;
    const createdOn = parseSheetDate(get(row, 'fecha_creacion'), opts.dateOrder);
    const durationDays = intOrNull(get(row, 'duracion'));
    out.push({
      row: r,
      status: text(get(row, 'estado'))?.toUpperCase() ?? null,
      service: text(get(row, 'servicio'))?.replace(/\s*\|\s*$/, '') ?? null,
      email,
      password: text(get(row, 'contrasena')),
      totalProfiles: intOrNull(get(row, 'perfiles')),
      durationDays,
      createdOn,
      expiresOn:
        parseSheetDate(get(row, 'fecha_vencimiento'), opts.dateOrder) ??
        (createdOn && durationDays ? addDays(createdOn, durationDays) : null),
      provider: text(get(row, 'proveedor')),
      cost: parseMoney(get(row, 'costo')),
    });
  }
  return out;
}

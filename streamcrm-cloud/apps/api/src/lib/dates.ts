import { DateTime } from 'luxon';

export interface ReminderConfig {
  timezone: string;
  reminderDaysBefore: number;
  reminderHour: number;
  allowedStartHour: number;
  allowedEndHour: number;
}

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del tenant. */
export const todayIn = (tz: string, now = new Date()) => DateTime.fromJSDate(now).setZone(tz).toISODate()!;

export const addDays = (isoDate: string, days: number) => DateTime.fromISO(isoDate).plus({ days }).toISODate()!;

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round(DateTime.fromISO(toIso).diff(DateTime.fromISO(fromIso), 'days').days);

/** Mueve un instante al horario permitido (p. ej. 9:00–20:00 locales). */
export function clampToAllowedWindow(dt: DateTime, startHour: number, endHour: number): DateTime {
  const start = dt.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  const end = dt.set({ hour: endHour, minute: 0, second: 0, millisecond: 0 });
  if (dt < start) return start;
  if (dt >= end) return start.plus({ days: 1 });
  return dt;
}

/**
 * reminder_at = vencimiento − días_antes, a la hora configurada, en la zona horaria del tenant.
 * Si ya pasó, se programa para dentro de 1 minuto (respetando el horario permitido).
 */
export function computeReminderAt(endDate: string, cfg: ReminderConfig, now = new Date()): Date {
  const nowLocal = DateTime.fromJSDate(now).setZone(cfg.timezone);
  let target = DateTime.fromISO(endDate, { zone: cfg.timezone })
    .minus({ days: cfg.reminderDaysBefore })
    .set({ hour: cfg.reminderHour, minute: 0, second: 0, millisecond: 0 });
  if (target <= nowLocal) target = nowLocal.plus({ minutes: 1 }).set({ second: 0, millisecond: 0 });
  return clampToAllowedWindow(target, cfg.allowedStartHour, cfg.allowedEndHour).toJSDate();
}

/** true si ahora es horario permitido para llamar en la zona del tenant. */
export function isWithinAllowedHours(cfg: Pick<ReminderConfig, 'timezone' | 'allowedStartHour' | 'allowedEndHour'>, now = new Date()) {
  const h = DateTime.fromJSDate(now).setZone(cfg.timezone).hour;
  return h >= cfg.allowedStartHour && h < cfg.allowedEndHour;
}

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * Convierte lo que venga en una celda de fecha a AAAA-MM-DD:
 * serial de Sheets/Excel, Date, '2026-10-29', '25-mar-23', '30/03/2023', '4/30/2024'.
 * `order` resuelve la ambigüedad d/m vs m/d cuando ambos valores son ≤ 12.
 */
export function parseSheetDate(value: unknown, order: 'dmy' | 'mdy' = 'dmy'): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // exceljs entrega las fechas como medianoche UTC.
    return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate();
  }
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return null; // fuera de 1954–2119: no es una fecha
    return DateTime.fromObject({ year: 1899, month: 12, day: 30 }, { zone: 'utc' }).plus({ days: Math.floor(value) }).toISODate();
  }
  const text = String(value).trim().toLowerCase();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return build(+m[1]!, +m[2]!, +m[3]!);
  m = text.match(/^(\d{1,2})[-/ .]([a-z]{3})[a-z]*\.?[-/ .](\d{2,4})$/);
  if (m) return MONTHS[m[2]!] ? build(fullYear(+m[3]!), MONTHS[m[2]!]!, +m[1]!) : null;
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = fullYear(+m[3]!);
    if (a > 12) return build(y, b, a);
    if (b > 12) return build(y, a, b);
    return order === 'dmy' ? build(y, b, a) : build(y, a, b);
  }
  if (/^\d+(\.\d+)?$/.test(text)) return parseSheetDate(Number(text), order);
  return null;
}

function build(year: number, month: number, day: number): string | null {
  const dt = DateTime.fromObject({ year, month, day }, { zone: 'utc' });
  return dt.isValid ? dt.toISODate() : null;
}

/** "29 de octubre" para el agente de voz. */
export const dateInWords = (isoDate: string) => DateTime.fromISO(isoDate).setLocale('es').toFormat("d 'de' MMMM");

/** Serial de Sheets (días desde 1899-12-30) para escribir fechas que las fórmulas entiendan. */
export const toSheetSerial = (isoDate: string) =>
  Math.round(DateTime.fromISO(isoDate, { zone: 'utc' }).diff(DateTime.fromObject({ year: 1899, month: 12, day: 30 }, { zone: 'utc' }), 'days').days);

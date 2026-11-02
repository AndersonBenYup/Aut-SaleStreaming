import { DateTime } from 'luxon';

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria del negocio. */
export const todayIn = (tz, now = new Date()) => DateTime.fromJSDate(now).setZone(tz).toISODate();

export const addDays = (isoDate, days) => DateTime.fromISO(isoDate).plus({ days }).toISODate();

export const daysBetween = (fromIso, toIso) =>
  Math.round(DateTime.fromISO(toIso).diff(DateTime.fromISO(fromIso), 'days').days);

export const isValidZone = (tz) => DateTime.local().setZone(tz).isValid;

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid;

/** Mueve un instante al horario permitido (p. ej. 9:00–20:00 locales). */
export function clampToAllowedWindow(dt, startHour, endHour) {
  const start = dt.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  const end = dt.set({ hour: endHour, minute: 0, second: 0, millisecond: 0 });
  if (dt < start) return start;
  if (dt >= end) return start.plus({ days: 1 });
  return dt;
}

/**
 * reminder_at = vencimiento − N días, a la hora configurada, en la zona horaria del negocio.
 * Si ya pasó, dentro de 1 minuto (respetando el horario permitido).
 */
export function computeReminderAt(endDate, cfg, now = new Date()) {
  const nowLocal = DateTime.fromJSDate(now).setZone(cfg.timezone);
  let target = DateTime.fromISO(endDate, { zone: cfg.timezone })
    .minus({ days: cfg.daysBefore })
    .set({ hour: cfg.hour, minute: 0, second: 0, millisecond: 0 });
  if (target <= nowLocal) target = nowLocal.plus({ minutes: 1 }).set({ second: 0, millisecond: 0 });
  return clampToAllowedWindow(target, cfg.startHour, cfg.endHour).toJSDate();
}

export function isWithinAllowedHours(cfg, now = new Date()) {
  const h = DateTime.fromJSDate(now).setZone(cfg.timezone).hour;
  return h >= cfg.startHour && h < cfg.endHour;
}

export const nextAllowed = (cfg, now = new Date(), plus = {}) =>
  clampToAllowedWindow(DateTime.fromJSDate(now).setZone(cfg.timezone).plus(plus), cfg.startHour, cfg.endHour).toJSDate();

/** Inicio del mes local en UTC ISO (para sumar pagos del mes). */
export function monthRange(tz, now = new Date()) {
  const start = DateTime.fromJSDate(now).setZone(tz).startOf('month');
  return { from: start.toUTC().toISO(), to: start.plus({ months: 1 }).toUTC().toISO(), label: start.setLocale('es').toFormat('LLLL yyyy') };
}

/** "30 de octubre" para el agente de voz. */
export const dateInWords = (isoDate) => DateTime.fromISO(isoDate).setLocale('es').toFormat("d 'de' MMMM");

const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const fullYear = (y) => (y < 100 ? 2000 + y : y);
const build = (y, m, d) => {
  const dt = DateTime.fromObject({ year: y, month: m, day: d });
  return dt.isValid ? dt.toISODate() : null;
};

/** Fechas que vienen de un CSV/Excel: 2026-10-29, 29/10/2026, 29-oct-26, serial de Excel. */
export function parseLooseDate(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[-/ .]([a-z]{3})[a-z]*\.?[-/ .](\d{2,4})$/);
  if (m) return MONTHS[m[2]] ? build(fullYear(+m[3]), MONTHS[m[2]], +m[1]) : null;
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])];
    return b > 12 ? build(y, a, b) : build(y, b, a); // día/mes salvo que el segundo número no pueda ser mes
  }
  if (/^\d{5}$/.test(text)) return DateTime.fromObject({ year: 1899, month: 12, day: 30 }).plus({ days: +text }).toISODate();
  return null;
}

import { isValidZone } from './dates.js';
import { HttpError } from './http.js';
import { COUNTRIES, normalizePhone } from './phone.js';
import { EDITABLE, SECRET_KEYS } from './settings.js';

const hour = (v, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 23) throw new HttpError(400, `${name}: hora inválida (0-23)`);
  return String(n);
};

/**
 * Valida y normaliza lo que llega del asistente o de Ajustes.
 * Los secretos vacíos o enmascarados ("••••1234") se ignoran: así no se borran al guardar otra cosa.
 */
export function cleanSettings(input) {
  const out = {};
  for (const key of EDITABLE) {
    if (input[key] === undefined) continue;
    const v = typeof input[key] === 'string' ? input[key].trim() : input[key];
    if (SECRET_KEYS.has(key) && (v === '' || String(v).startsWith('••••'))) continue;
    out[key] = v === null ? '' : String(v);
  }
  if (out.business_name !== undefined && !out.business_name) throw new HttpError(400, 'El nombre del negocio es obligatorio');
  if (out.business_name) out.business_name = out.business_name.slice(0, 80);
  if (out.primary_color !== undefined && !/^#[0-9a-f]{6}$/i.test(out.primary_color)) throw new HttpError(400, 'Color inválido (usa #RRGGBB)');
  if (out.country !== undefined && !COUNTRIES[out.country]) throw new HttpError(400, 'País no soportado');
  if (out.timezone !== undefined && !isValidZone(out.timezone)) throw new HttpError(400, 'Zona horaria inválida');
  if (out.reminder_channel !== undefined && !['retell', 'whatsapp', 'manual'].includes(out.reminder_channel)) throw new HttpError(400, 'Canal inválido');
  if (out.reminder_days_before !== undefined) {
    const n = Number(out.reminder_days_before);
    if (!Number.isInteger(n) || n < 0 || n > 30) throw new HttpError(400, 'Días de aviso inválidos (0-30)');
  }
  if (out.por_vencer_days !== undefined && !(Number(out.por_vencer_days) >= 0)) throw new HttpError(400, 'Días "por vencer" inválidos');
  for (const k of ['reminder_hour', 'allowed_start_hour', 'allowed_end_hour', 'backup_hour']) if (out[k] !== undefined) out[k] = hour(out[k], k);
  if (out.allowed_start_hour !== undefined && out.allowed_end_hour !== undefined && Number(out.allowed_start_hour) >= Number(out.allowed_end_hour)) {
    throw new HttpError(400, 'El horario permitido debe empezar antes de terminar');
  }
  if (out.retell_from_number) {
    const n = normalizePhone(out.retell_from_number, input.country ?? 'PE');
    if (!n) throw new HttpError(400, 'Número saliente de Retell inválido (usa +código)');
    out.retell_from_number = n;
  }
  if (out.session_idle_minutes !== undefined && !(Number(out.session_idle_minutes) >= 5)) throw new HttpError(400, 'La inactividad mínima es 5 minutos');
  if (out.public_url) out.public_url = out.public_url.replace(/\/+$/, '');
  if (out.public_url && !/^https:\/\//.test(out.public_url)) throw new HttpError(400, 'La URL pública debe empezar con https://');
  return out;
}

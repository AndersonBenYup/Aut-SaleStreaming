import { all, get, nowIso, run, tx } from './db.js';
import { decrypt, encrypt } from './crypto.js';
import { addDays, dateInWords, isIsoDate, todayIn } from './dates.js';
import { logEvent } from './events.js';
import { licenseStatus } from './license.js';
import { normalizePhone } from './phone.js';
import { scheduleReminder, statusFor } from './reminders.js';
import { getSettings, reminderConfig } from './settings.js';
import { HttpError } from './http.js';

export const PAYMENT_METHODS = ['yape', 'plin', 'efectivo', 'transferencia', 'otro'];


const str = (v, max = 200) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const num = (v, def = 0) => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? def : Number(v));

// ---------- Clientes ----------

export function customerFields(input, s = getSettings()) {
  const name = str(input.name, 120);
  if (!name) throw new HttpError(400, 'El nombre del cliente es obligatorio');
  let phone = null;
  if (str(input.phone)) {
    phone = normalizePhone(input.phone, s.country);
    if (!phone) throw new HttpError(400, `Teléfono inválido: ${input.phone}`);
  }
  const tags = Array.isArray(input.tags) ? input.tags.join(',') : String(input.tags ?? '');
  return {
    name,
    phone,
    email: str(input.email, 160),
    notes: str(input.notes, 2000),
    tags: tags.split(',').map((t) => t.trim()).filter(Boolean).join(','),
    consent_calls: input.consent_calls ? 1 : 0,
  };
}

export function createCustomer(input, userId) {
  const f = customerFields(input);
  const r = run(
    `INSERT INTO customers (name, phone, email, notes, tags, consent_calls, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    f.name, f.phone, f.email, f.notes, f.tags, f.consent_calls, f.consent_calls ? nowIso() : null,
  );
  logEvent('cliente.creado', { entity: 'customer', entityId: Number(r.lastInsertRowid), userId });
  return Number(r.lastInsertRowid);
}

export function updateCustomer(id, input, userId) {
  const prev = get('SELECT * FROM customers WHERE id = ?', id);
  if (!prev) throw new HttpError(404, 'Cliente no encontrado');
  const f = customerFields({ ...prev, ...input });
  const consentAt = f.consent_calls ? (prev.consent_calls ? prev.consent_at : nowIso()) : null;
  run(
    `UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, tags = ?, consent_calls = ?, consent_at = ?, updated_at = ? WHERE id = ?`,
    f.name, f.phone, f.email, f.notes, f.tags, f.consent_calls, consentAt, nowIso(), id,
  );
  if (prev.consent_calls !== f.consent_calls) logEvent('cliente.consentimiento', { entity: 'customer', entityId: id, userId, data: { consent: !!f.consent_calls } });
}

// ---------- Ventas y suscripciones ----------

export function assertCanAddSubscription(now = new Date()) {
  const lic = licenseStatus(now);
  if (!lic.maxSubscriptions) return;
  const n = get(`SELECT COUNT(*) n FROM subscriptions WHERE status <> 'cancelada'`).n;
  if (n >= lic.maxSubscriptions) {
    throw new HttpError(403, `Tu licencia permite hasta ${lic.maxSubscriptions} suscripciones activas. Amplíala con ${lic.vendor.name} (${lic.vendor.whatsapp}).`);
  }
}

/**
 * Nueva venta: crea (o reutiliza) el cliente, la suscripción, el pago opcional y programa el aviso.
 * input: { customerId? | customer:{...}, serviceId, accountId?, profileName?, pin?, startDate?, endDate?, price?, payment?:{amount, method} }
 */
export function createSale(input, userId, now = new Date()) {
  assertCanAddSubscription(now);
  const s = getSettings();
  const service = input.serviceId ? get('SELECT * FROM services WHERE id = ?', input.serviceId) : null;
  if (!service) throw new HttpError(400, 'Elige un servicio');
  const startDate = input.startDate || todayIn(s.timezone, now);
  if (!isIsoDate(startDate)) throw new HttpError(400, 'Fecha de inicio inválida');
  const endDate = input.endDate || addDays(startDate, service.duration_days);
  if (!isIsoDate(endDate) || endDate < startDate) throw new HttpError(400, 'Fecha de vencimiento inválida');
  const accountId = input.accountId ? Number(input.accountId) : null;
  if (accountId && !get('SELECT id FROM stream_accounts WHERE id = ?', accountId)) throw new HttpError(400, 'Cuenta madre no encontrada');
  const price = num(input.price, service.price);

  return tx(() => {
    let customerId = input.customerId ? Number(input.customerId) : null;
    if (customerId && !get('SELECT id FROM customers WHERE id = ?', customerId)) throw new HttpError(400, 'Cliente no encontrado');
    if (!customerId) {
      const f = customerFields(input.customer ?? {}, s);
      const existing = f.phone ? get('SELECT id FROM customers WHERE phone = ?', f.phone) : null;
      customerId = existing?.id ?? createCustomer(input.customer, userId);
    }
    const r = run(
      `INSERT INTO subscriptions (customer_id, service_id, stream_account_id, profile_name, pin_enc, start_date, end_date, price, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      customerId, service.id, accountId, str(input.profileName, 60), encrypt(str(input.pin, 20)), startDate, endDate, price,
      statusFor(endDate, reminderConfig(s), now), userId,
    );
    const subId = Number(r.lastInsertRowid);
    if (input.payment && num(input.payment.amount) > 0) addPayment(subId, input.payment, userId, now);
    scheduleReminder(subId, now);
    logEvent('venta.creada', { entity: 'subscription', entityId: subId, userId, data: { service: service.name, price } });
    return subId;
  });
}

export function addPayment(subId, { amount, method, note, paidAt }, userId, now = new Date()) {
  const sub = get('SELECT id, customer_id FROM subscriptions WHERE id = ?', subId);
  if (!sub) throw new HttpError(404, 'Suscripción no encontrada');
  const m = String(method ?? 'yape').toLowerCase();
  if (!PAYMENT_METHODS.includes(m)) throw new HttpError(400, 'Método de pago inválido');
  if (!(num(amount) > 0)) throw new HttpError(400, 'Monto inválido');
  run(
    'INSERT INTO payments (subscription_id, customer_id, amount, method, paid_at, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    subId, sub.customer_id, num(amount), m, paidAt ?? nowIso(now), str(note, 300), userId,
  );
}

/**
 * Renovar: registra el pago y extiende desde el vencimiento (o desde hoy si ya venció).
 * Luego reprograma el recordatorio y limpia la intención anterior.
 */
export function renewSubscription(subId, { amount, method, days, note } = {}, userId, now = new Date()) {
  const sub = get(
    `SELECT s.*, sv.duration_days FROM subscriptions s LEFT JOIN services sv ON sv.id = s.service_id WHERE s.id = ?`,
    subId,
  );
  if (!sub) throw new HttpError(404, 'Suscripción no encontrada');
  const s = getSettings();
  const today = todayIn(s.timezone, now);
  const from = sub.end_date < today ? today : sub.end_date;
  const newEnd = addDays(from, num(days, sub.duration_days ?? 30));
  return tx(() => {
    if (sub.status === 'cancelada') assertCanAddSubscription(now);
    addPayment(subId, { amount: amount ?? sub.price, method, note }, userId, now);
    run(
      `UPDATE subscriptions SET end_date = ?, status = ?, last_call_summary = NULL, recording_url = NULL, updated_at = ? WHERE id = ?`,
      newEnd, statusFor(newEnd, reminderConfig(s), now), nowIso(), subId,
    );
    scheduleReminder(subId, now);
    logEvent('renovacion.registrada', { entity: 'subscription', entityId: subId, userId, data: { from: sub.end_date, to: newEnd, amount: num(amount, sub.price) } });
    return newEnd;
  });
}

export function updateSubscription(subId, input, userId, now = new Date()) {
  const prev = get('SELECT * FROM subscriptions WHERE id = ?', subId);
  if (!prev) throw new HttpError(404, 'Suscripción no encontrada');
  const endDate = input.endDate ?? prev.end_date;
  const startDate = input.startDate ?? prev.start_date;
  if (!isIsoDate(endDate) || !isIsoDate(startDate)) throw new HttpError(400, 'Fecha inválida');
  run(
    `UPDATE subscriptions SET service_id = ?, stream_account_id = ?, profile_name = ?, pin_enc = ?, start_date = ?, end_date = ?, price = ?, notes = ?,
       status = CASE WHEN status = 'cancelada' THEN status ELSE ? END, updated_at = ? WHERE id = ?`,
    input.serviceId !== undefined ? Number(input.serviceId) || null : prev.service_id,
    input.accountId !== undefined ? Number(input.accountId) || null : prev.stream_account_id,
    input.profileName !== undefined ? str(input.profileName, 60) : prev.profile_name,
    input.pin !== undefined ? encrypt(str(input.pin, 20)) : prev.pin_enc,
    startDate, endDate,
    input.price !== undefined ? num(input.price) : prev.price,
    input.notes !== undefined ? str(input.notes, 2000) : prev.notes,
    statusFor(endDate, reminderConfig(), now), nowIso(), subId,
  );
  if (endDate !== prev.end_date && prev.status !== 'cancelada') scheduleReminder(subId, now);
  logEvent('suscripcion.editada', { entity: 'subscription', entityId: subId, userId });
}

export function cancelSubscription(subId, userId) {
  const r = run(`UPDATE subscriptions SET status = 'cancelada', reminder_at = NULL, updated_at = ? WHERE id = ?`, nowIso(), subId);
  if (!r.changes) throw new HttpError(404, 'Suscripción no encontrada');
  logEvent('suscripcion.cancelada', { entity: 'subscription', entityId: subId, userId });
}

/** "Avisar ya": el scheduler lo envía en su siguiente vuelta (≤ 60 s). */
export function remindNow(subId, userId, now = new Date()) {
  const r = run(
    `UPDATE subscriptions SET reminder_status = 'pendiente', reminder_at = ?, reminder_attempts = 0, updated_at = ?
     WHERE id = ? AND status <> 'cancelada' AND reminder_status <> 'enviando'`,
    nowIso(now), nowIso(), subId,
  );
  if (!r.changes) throw new HttpError(409, 'No se puede avisar ahora (cancelada o enviándose)');
  logEvent('recordatorio.manual_ya', { entity: 'subscription', entityId: subId, userId });
}

/** Credenciales listas para pegar en WhatsApp. Ver la contraseña queda en la bitácora. */
export function credentialsMessage(subId, userId) {
  const row = get(
    `SELECT s.*, c.name customer_name, sv.name service_name, a.platform, a.email account_email, a.password_enc
     FROM subscriptions s JOIN customers c ON c.id = s.customer_id
     LEFT JOIN services sv ON sv.id = s.service_id LEFT JOIN stream_accounts a ON a.id = s.stream_account_id
     WHERE s.id = ?`,
    subId,
  );
  if (!row) throw new HttpError(404, 'Suscripción no encontrada');
  const s = getSettings();
  const pin = decrypt(row.pin_enc);
  const lines = [
    `*${row.service_name ?? row.platform ?? 'Tu cuenta'}* — ${s.business_name}`,
    row.account_email ? `📧 Correo: ${row.account_email}` : null,
    row.password_enc ? `🔑 Contraseña: ${decrypt(row.password_enc)}` : null,
    row.profile_name ? `👤 Perfil: ${row.profile_name}` : null,
    pin ? `🔢 PIN: ${pin}` : null,
    `📅 Vence: ${dateInWords(row.end_date)}`,
    'Por favor no cambies la contraseña ni el PIN. ¡Gracias por tu compra!',
  ].filter(Boolean);
  logEvent('credenciales.vistas', { entity: 'subscription', entityId: subId, userId, data: { customer: row.customer_name } });
  return lines.join('\n');
}

// ---------- Cuentas madre ----------

/** Perfiles ocupados = suscripciones no canceladas que usan la cuenta. */
export function accountProfiles(accountId) {
  const acc = get('SELECT id, total_profiles FROM stream_accounts WHERE id = ?', accountId);
  if (!acc) throw new HttpError(404, 'Cuenta no encontrada');
  const used = all(
    `SELECT s.id, s.profile_name, c.name customer_name, s.end_date, s.status FROM subscriptions s JOIN customers c ON c.id = s.customer_id
     WHERE s.stream_account_id = ? AND s.status <> 'cancelada' ORDER BY s.profile_name`,
    accountId,
  );
  const usedNames = new Set(used.map((u) => (u.profile_name ?? '').toLowerCase()));
  const free = [];
  for (let i = 1; free.length < acc.total_profiles - used.length && i <= acc.total_profiles + used.length; i++) {
    if (!usedNames.has(`perfil ${i}`)) free.push(`Perfil ${i}`);
  }
  return { total: acc.total_profiles, used, freeCount: Math.max(0, acc.total_profiles - used.length), free };
}

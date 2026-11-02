import { config } from './config.js';
import { all, get, nowIso, run } from './db.js';
import { channels, retellConfig, whatsappConfig } from './channels/index.js';
import { getRetellCall } from './channels/retell.js';
import { addDays, computeReminderAt, dateInWords, daysBetween, isWithinAllowedHours, nextAllowed, todayIn } from './dates.js';
import { logEvent } from './events.js';
import { RETRYABLE_DISCONNECTIONS, interpretIntent } from './intent.js';
import { hasFeature, licenseStatus } from './license.js';
import { waNumber } from './phone.js';
import { getSettings, reminderConfig } from './settings.js';

export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_HOURS = 2;
const STUCK_MINUTES = 10;
const POLL_AFTER_MINUTES = 2;
const POLL_GIVE_UP_DAYS = 2;

const minutesAgo = (now, m) => new Date(now.getTime() - m * 60_000).toISOString();

/** activa | por_vencer | vencida según la fecha de vencimiento. */
export function statusFor(endDate, cfg = reminderConfig(), now = new Date()) {
  const today = todayIn(cfg.timezone, now);
  if (endDate < today) return 'vencida';
  if (endDate <= addDays(today, cfg.porVencerDays)) return 'por_vencer';
  return 'activa';
}

/** (Re)programa el recordatorio de una suscripción desde cero. */
export function scheduleReminder(subId, now = new Date()) {
  const sub = get('SELECT end_date FROM subscriptions WHERE id = ?', subId);
  if (!sub) return null;
  const at = computeReminderAt(sub.end_date, reminderConfig(), now).toISOString();
  run(
    `UPDATE subscriptions SET reminder_at = ?, reminder_status = 'pendiente', reminder_attempts = 0, reminder_channel = NULL,
       renewal_intent = NULL, updated_at = ? WHERE id = ?`,
    at,
    nowIso(),
    subId,
  );
  return at;
}

/** Recalcula activa / por_vencer / vencida (las canceladas no se tocan). */
export function refreshStatuses(now = new Date()) {
  const cfg = reminderConfig();
  const today = todayIn(cfg.timezone, now);
  const limit = addDays(today, cfg.porVencerDays);
  const next = `CASE WHEN end_date < ?1 THEN 'vencida' WHEN end_date <= ?2 THEN 'por_vencer' ELSE 'activa' END`;
  return run(
    `UPDATE subscriptions SET status = ${next}, updated_at = ?3 WHERE status <> 'cancelada' AND status <> ${next}`,
    today,
    limit,
    nowIso(now),
  ).changes;
}

/** Envíos que quedaron "enviando" (corte de luz, cierre del proceso) vuelven a la cola. */
export function releaseStuck(now = new Date()) {
  return run(
    `UPDATE subscriptions SET reminder_status = 'pendiente', updated_at = ? WHERE reminder_status = 'enviando' AND updated_at < ?`,
    nowIso(now),
    minutesAgo(now, STUCK_MINUTES),
  ).changes;
}

/**
 * Toma en un solo UPDATE las suscripciones cuyo aviso ya toca y las marca "enviando".
 * Lo que ya está "enviando" no se vuelve a tomar: nunca hay dos envíos del mismo aviso.
 */
export function claimDue(now = new Date(), limit = 25) {
  return all(
    `UPDATE subscriptions SET reminder_status = 'enviando', updated_at = ?
     WHERE id IN (
       SELECT id FROM subscriptions
       WHERE reminder_status = 'pendiente' AND reminder_at IS NOT NULL AND reminder_at <= ? AND status <> 'cancelada'
       ORDER BY reminder_at LIMIT ?)
     RETURNING id`,
    nowIso(now),
    nowIso(now),
    limit,
  ).map((r) => r.id);
}

const SUB_DETAIL = `
  SELECT s.*, c.name AS customer_name, c.phone, c.consent_calls,
         sv.name AS service_name, sv.platform, sv.duration_days
  FROM subscriptions s
  JOIN customers c ON c.id = s.customer_id
  LEFT JOIN services sv ON sv.id = s.service_id
  WHERE s.id = ?`;

export const subscriptionDetail = (id) => get(SUB_DETAIL, id);

export function buildPayload(row, s = getSettings(), now = new Date()) {
  const today = todayIn(s.timezone, now);
  return {
    subscriptionId: row.id,
    businessName: s.business_name,
    customerName: row.customer_name,
    toNumber: row.phone,
    serviceName: row.service_name ?? row.platform ?? 'servicio',
    profileName: row.profile_name || 'principal',
    endDate: row.end_date,
    endDateWords: dateInWords(row.end_date),
    daysLeft: Math.max(0, daysBetween(today, row.end_date)),
    price: Number(row.price).toFixed(2),
    currency: s.currency,
  };
}

/** Mensaje para enviar a mano por WhatsApp (botón wa.me). */
export function reminderText(p) {
  const when = p.daysLeft > 0 ? `vence el ${p.endDateWords} (en ${p.daysLeft} día${p.daysLeft === 1 ? '' : 's'})` : `vence el ${p.endDateWords}`;
  return (
    `Hola ${p.customerName} 👋, te saluda ${p.businessName}. ` +
    `Tu ${p.serviceName} (perfil ${p.profileName}) ${when}. ` +
    `La renovación cuesta ${p.currency} ${p.price}. ¿Deseas renovar? Respóndenos y coordinamos el pago 🙌`
  );
}

export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

/**
 * Canal para este cliente:
 *  - sin teléfono, canal "manual", o llamada sin consentimiento → lista de aviso manual
 *  - demo → simulado (consola)
 *  - si la licencia no incluye el canal o faltan las claves → manual
 */
export function resolveChannel(row, s, lic) {
  if (!row.phone) return 'manual';
  const pref = s.reminder_channel;
  if (pref === 'manual') return 'manual';
  if (pref === 'retell' && !row.consent_calls) return 'manual';
  if (config.channelOverride === 'console' || lic.mode === 'demo') return 'console';
  if (pref === 'retell') return hasFeature(lic, 'ai_calls') && retellConfig().apiKey ? 'retell' : 'manual';
  if (pref === 'whatsapp') return hasFeature(lic, 'whatsapp') && whatsappConfig().token ? 'whatsapp' : 'manual';
  return 'manual';
}

function reschedule(subId, at, extra = '') {
  run(`UPDATE subscriptions SET reminder_status = 'pendiente', reminder_at = ?, updated_at = ? ${extra} WHERE id = ?`, at.toISOString(), nowIso(), subId);
}

/** Reintento en 2 h (dentro del horario permitido) o "fallido" tras el tercer intento. */
export function retryOrFail(subId, reason, now = new Date()) {
  const sub = get('SELECT reminder_attempts FROM subscriptions WHERE id = ?', subId);
  if (!sub) return;
  if (sub.reminder_attempts >= MAX_ATTEMPTS) {
    run(
      `UPDATE subscriptions SET reminder_status = 'fallido', renewal_intent = 'sin_respuesta', updated_at = ? WHERE id = ?`,
      nowIso(),
      subId,
    );
    logEvent('recordatorio.fallido', { entity: 'subscription', entityId: subId, data: { reason, attempts: sub.reminder_attempts } });
  } else {
    const at = nextAllowed(reminderConfig(), now, { hours: RETRY_AFTER_HOURS });
    reschedule(subId, at);
    logEvent('recordatorio.reintento', { entity: 'subscription', entityId: subId, data: { reason, attempts: sub.reminder_attempts, at } });
  }
}

export async function sendReminder(subId, now = new Date()) {
  const row = subscriptionDetail(subId);
  if (!row || row.reminder_status !== 'enviando') return null;
  const s = getSettings();
  const cfg = reminderConfig(s);
  if (!isWithinAllowedHours(cfg, now)) {
    reschedule(subId, nextAllowed(cfg, now));
    return 'fuera_de_horario';
  }
  const lic = licenseStatus(now);
  const channel = resolveChannel(row, s, lic);
  if (channel === 'manual') {
    run(`UPDATE subscriptions SET reminder_status = 'manual', reminder_channel = 'manual', updated_at = ? WHERE id = ?`, nowIso(), subId);
    logEvent('recordatorio.manual', { entity: 'subscription', entityId: subId });
    return 'manual';
  }
  const payload = buildPayload(row, s, now);
  run('UPDATE subscriptions SET reminder_attempts = reminder_attempts + 1 WHERE id = ?', subId);
  try {
    const { externalId } = await channels[channel].send(payload);
    run(
      `UPDATE subscriptions SET reminder_status = 'enviado', reminder_channel = ?, last_call_id = ?, last_contact_at = ?, updated_at = ? WHERE id = ?`,
      channel,
      externalId || row.last_call_id,
      nowIso(now),
      nowIso(),
      subId,
    );
    if (externalId) {
      run('INSERT OR IGNORE INTO calls (subscription_id, channel, external_id, created_at) VALUES (?, ?, ?, ?)', subId, channel, externalId, nowIso(now));
    }
    logEvent('recordatorio.enviado', { entity: 'subscription', entityId: subId, data: { channel, externalId } });
    return channel;
  } catch (err) {
    logEvent('recordatorio.error', { entity: 'subscription', entityId: subId, data: { channel, error: err.message } });
    retryOrFail(subId, err.message, now);
    return 'error';
  }
}

export async function dispatchDue(now = new Date()) {
  const ids = claimDue(now);
  for (const id of ids) {
    try {
      await sendReminder(id, now);
    } catch (err) {
      console.error(`Error enviando el recordatorio ${id}:`, err);
    }
  }
  return ids.length;
}

/** Guarda la respuesta del cliente. Un "renueva" aparece en "Por cobrar". */
export function applyIntent(subId, intent, { summary, recordingUrl, userId } = {}) {
  run(
    `UPDATE subscriptions SET renewal_intent = ?, reminder_status = CASE WHEN ? = 'sin_respuesta' THEN reminder_status ELSE 'respondido' END,
       last_call_summary = COALESCE(?, last_call_summary), recording_url = COALESCE(?, recording_url), updated_at = ? WHERE id = ?`,
    intent,
    intent,
    summary ?? null,
    recordingUrl ?? null,
    nowIso(),
    subId,
  );
  logEvent('renovacion.intencion', { entity: 'subscription', entityId: subId, userId, data: { intent } });
}

/**
 * Procesa un evento de llamada de Retell (del webhook o del polling). Idempotente:
 * una llamada ya analizada o ya contada como "no contestó" no se vuelve a procesar.
 */
export function handleRetellCall(event, call, now = new Date()) {
  if (!call?.call_id || call.metadata?.test) return 'ignorado';
  const row = get(`SELECT * FROM calls WHERE channel = 'retell' AND external_id = ?`, call.call_id);
  const subId = Number(call.metadata?.subscriptionId ?? row?.subscription_id);
  const sub = subId ? get('SELECT id, last_call_id, reminder_status FROM subscriptions WHERE id = ?', subId) : null;
  if (!sub) return 'ignorado';
  if (row && ['analizada', 'no_contesta'].includes(row.status)) return 'duplicado';
  if (!row) run(`INSERT INTO calls (subscription_id, channel, external_id, created_at) VALUES (?, 'retell', ?, ?)`, subId, call.call_id, nowIso(now));

  run(
    `UPDATE calls SET disconnection_reason = COALESCE(?, disconnection_reason), duration_ms = COALESCE(?, duration_ms),
       recording_url = COALESCE(?, recording_url), cost = COALESCE(?, cost) WHERE channel = 'retell' AND external_id = ?`,
    call.disconnection_reason ?? null,
    call.duration_ms ?? null,
    call.recording_url ?? null,
    call.call_cost?.combined_cost !== undefined ? call.call_cost.combined_cost / 100 : null,
    call.call_id,
  );
  const isCurrent = sub.last_call_id === call.call_id;

  if (RETRYABLE_DISCONNECTIONS.includes(call.disconnection_reason)) {
    run(`UPDATE calls SET status = 'no_contesta', finished_at = ? WHERE channel = 'retell' AND external_id = ?`, nowIso(now), call.call_id);
    if (isCurrent && sub.reminder_status === 'enviado') retryOrFail(subId, call.disconnection_reason, now);
    return 'no_contesta';
  }

  const analysis = call.call_analysis;
  if (event === 'call_analyzed' && analysis) {
    const intent = interpretIntent(analysis.custom_analysis_data?.renovacion) ?? interpretIntent(analysis.call_summary) ?? 'sin_respuesta';
    run(
      `UPDATE calls SET status = 'analizada', summary = ?, intent = ?, finished_at = ? WHERE channel = 'retell' AND external_id = ?`,
      analysis.call_summary ?? null,
      intent,
      nowIso(now),
      call.call_id,
    );
    if (isCurrent) applyIntent(subId, intent, { summary: analysis.call_summary ?? null, recordingUrl: call.recording_url ?? null });
    return intent;
  }
  run(`UPDATE calls SET status = 'finalizada' WHERE channel = 'retell' AND external_id = ? AND status = 'enviada'`, call.call_id);
  return 'finalizada';
}

/**
 * Plan B sin túnel: pregunta a Retell por las llamadas enviadas que no tienen resultado.
 * Una llamada se consulta como máximo cada 2 minutos y se abandona a los 2 días.
 */
export async function pollRetellCalls(now = new Date()) {
  const { apiKey } = retellConfig();
  if (!apiKey) return 0;
  const rows = all(
    `SELECT external_id FROM calls
     WHERE channel = 'retell' AND status IN ('enviada', 'finalizada') AND created_at <= ? AND created_at >= ?
       AND (last_polled_at IS NULL OR last_polled_at <= ?)
     ORDER BY created_at LIMIT 10`,
    minutesAgo(now, POLL_AFTER_MINUTES),
    minutesAgo(now, POLL_GIVE_UP_DAYS * 1440),
    minutesAgo(now, POLL_AFTER_MINUTES),
  );
  let done = 0;
  for (const { external_id: callId } of rows) {
    run(`UPDATE calls SET last_polled_at = ? WHERE channel = 'retell' AND external_id = ?`, nowIso(now), callId);
    try {
      const call = await getRetellCall(callId, apiKey);
      if (!['ended', 'error', 'not_connected'].includes(call.call_status)) continue;
      const hasAnalysis = call.call_analysis && (call.call_analysis.call_summary || call.call_analysis.custom_analysis_data);
      const result = handleRetellCall(hasAnalysis ? 'call_analyzed' : 'call_ended', call, now);
      if (result !== 'finalizada') done++;
    } catch (err) {
      console.warn(`No se pudo consultar la llamada ${callId}: ${err.message}`);
    }
  }
  return done;
}

import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { decrypt, encrypt } from '../crypto.js';
import { parseCsv, toCsv, toExcelXml } from '../csv.js';
import { all, get, nowIso, run, tx } from '../db.js';
import { addDays, isIsoDate, monthRange, parseLooseDate, todayIn } from '../dates.js';
import { logEvent } from '../events.js';
import { HttpError } from '../http.js';
import { RENEWAL_INTENTS } from '../intent.js';
import { buildPayload, reminderText, subscriptionDetail, waLink } from '../reminders.js';
import { getSettings } from '../settings.js';
import {
  accountProfiles, addPayment, cancelSubscription, createCustomer, createSale, credentialsMessage, customerFields,
  remindNow, renewSubscription, updateCustomer, updateSubscription,
} from '../subscriptions.js';

export const apiRouter = Router();
const id = (req) => Number(req.params.id);
const like = (q) => `%${String(q ?? '').trim().replace(/[%_]/g, '')}%`;

// ---------------- Resumen ----------------

const SUB_LIST = `
  SELECT s.id, s.customer_id, c.name customer_name, c.phone, c.consent_calls, s.service_id, sv.name service_name,
         COALESCE(sv.platform, a.platform) platform, s.stream_account_id, a.email account_email, s.profile_name,
         s.start_date, s.end_date, s.price, s.status, s.reminder_at, s.reminder_status, s.reminder_channel,
         s.reminder_attempts, s.renewal_intent, s.last_call_summary, s.recording_url, s.last_contact_at, s.notes,
         (s.pin_enc IS NOT NULL) has_pin
  FROM subscriptions s
  JOIN customers c ON c.id = s.customer_id
  LEFT JOIN services sv ON sv.id = s.service_id
  LEFT JOIN stream_accounts a ON a.id = s.stream_account_id`;

function withWaLink(rows, s) {
  return rows.map((r) => {
    if (!r.phone) return r;
    const p = buildPayload(subscriptionDetail(r.id), s);
    return { ...r, wa_link: waLink(r.phone, reminderText(p)) };
  });
}

apiRouter.get('/dashboard', (req, res) => {
  const s = getSettings();
  const today = todayIn(s.timezone);
  const month = monthRange(s.timezone);
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) n FROM subscriptions GROUP BY status').map((r) => [r.status, r.n]));
  const income = get('SELECT COALESCE(SUM(amount), 0) v FROM payments WHERE paid_at >= ? AND paid_at < ?', month.from, month.to).v;
  const accountsCost = get('SELECT COALESCE(SUM(cost), 0) v FROM stream_accounts WHERE active = 1').v;
  const callsCost = get(`SELECT COALESCE(SUM(cost), 0) v FROM calls WHERE created_at >= ? AND created_at < ?`, month.from, month.to).v;
  res.json({
    today,
    month: month.label,
    currency: s.currency,
    counts: { activa: counts.activa ?? 0, por_vencer: counts.por_vencer ?? 0, vencida: counts.vencida ?? 0, cancelada: counts.cancelada ?? 0 },
    income,
    accountsCost,
    profit: income - accountsCost,
    callsCostUsd: callsCost,
    porCobrar: withWaLink(all(`${SUB_LIST} WHERE s.renewal_intent = 'renueva' AND s.status <> 'cancelada' ORDER BY s.end_date`), s),
    vencen7: all(`${SUB_LIST} WHERE s.status <> 'cancelada' AND s.end_date >= ? AND s.end_date <= ? ORDER BY s.end_date`, today, addDays(today, 7)),
    manuales: withWaLink(all(`${SUB_LIST} WHERE s.reminder_status = 'manual' AND s.status <> 'cancelada' ORDER BY s.end_date`), s),
    accountAlerts: all(
      `SELECT id, platform, email, expires_at, cost FROM stream_accounts WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at`,
      addDays(today, 3),
    ),
  });
});

// ---------------- Clientes ----------------

apiRouter.get('/customers', (req, res) => {
  const q = req.query.q;
  const rows = all(
    `SELECT c.id, c.name, c.phone, c.email, c.tags, c.consent_calls, c.notes,
            (SELECT COUNT(*) FROM subscriptions s WHERE s.customer_id = c.id AND s.status <> 'cancelada') active_subs,
            (SELECT MIN(end_date) FROM subscriptions s WHERE s.customer_id = c.id AND s.status <> 'cancelada') next_end
     FROM customers c
     ${q ? 'WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.tags LIKE ?' : ''}
     ORDER BY c.name COLLATE NOCASE LIMIT ?`,
    ...(q ? [like(q), like(q), like(q), like(q)] : []),
    Math.min(Number(req.query.limit) || 500, 2000),
  );
  res.json({ customers: rows });
});

const CUSTOMER_COLUMNS = [
  { key: 'name', label: 'nombre' }, { key: 'phone', label: 'telefono' }, { key: 'email', label: 'email' },
  { key: 'tags', label: 'etiquetas' }, { key: 'consent', label: 'consentimiento' }, { key: 'notes', label: 'notas' },
  { key: 'service_name', label: 'servicio' }, { key: 'profile_name', label: 'perfil' }, { key: 'start_date', label: 'inicio' },
  { key: 'end_date', label: 'vencimiento' }, { key: 'price', label: 'precio' }, { key: 'status', label: 'estado' },
  { key: 'renewal_intent', label: 'intencion' },
];

/** Exportación sin datos sensibles: nunca contraseñas, PIN ni el correo de la cuenta madre. */
apiRouter.get('/customers/export', (req, res) => {
  const rows = all(
    `SELECT c.name, c.phone, c.email, c.tags, CASE c.consent_calls WHEN 1 THEN 'si' ELSE 'no' END consent, c.notes,
            sv.name service_name, s.profile_name, s.start_date, s.end_date, s.price, s.status, s.renewal_intent
     FROM customers c LEFT JOIN subscriptions s ON s.customer_id = c.id LEFT JOIN services sv ON sv.id = s.service_id
     ORDER BY c.name COLLATE NOCASE, s.end_date`,
  );
  const date = todayIn(getSettings().timezone);
  logEvent('clientes.exportados', { userId: req.user.id, data: { rows: rows.length, format: req.query.format ?? 'csv' } });
  if (req.query.format === 'xls') {
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clientes-${date}.xls"`);
    return res.send(toExcelXml(rows, CUSTOMER_COLUMNS, 'Clientes'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="clientes-${date}.csv"`);
  res.send(toCsv(rows, CUSTOMER_COLUMNS));
});

const pickCol = (row, ...names) => names.map((n) => row[n]).find((v) => v !== undefined && v !== '') ?? '';
const yes = (v) => /^(si|sí|s|1|x|true|yes)$/i.test(String(v).trim());

/** Importa clientes (y su suscripción si la fila trae servicio + vencimiento). Útil para pasar desde Google Sheets. */
apiRouter.post('/customers/import', (req, res) => {
  const rows = parseCsv(req.body?.csv ?? '');
  if (!rows.length) throw new HttpError(400, 'El archivo está vacío o no tiene encabezados');
  const s = getSettings();
  const result = { customers: 0, subscriptions: 0, errors: [] };
  rows.forEach((row, i) => {
    try {
      tx(() => {
        const input = {
          name: pickCol(row, 'nombre', 'cliente', 'name'),
          phone: pickCol(row, 'telefono', 'celular', 'whatsapp', 'phone', 'numero'),
          email: pickCol(row, 'email', 'correo'),
          notes: pickCol(row, 'notas', 'nota', 'notes'),
          tags: pickCol(row, 'etiquetas', 'tags'),
          consent_calls: yes(pickCol(row, 'consentimiento', 'consentimiento_llamadas', 'consent')),
        };
        const f = customerFields(input, s);
        let customerId = f.phone ? get('SELECT id FROM customers WHERE phone = ?', f.phone)?.id : null;
        if (!customerId) {
          customerId = createCustomer(input, req.user.id);
          result.customers++;
        }
        const serviceName = pickCol(row, 'servicio', 'plataforma', 'service');
        const end = parseLooseDate(pickCol(row, 'vencimiento', 'fecha_de_vencimiento', 'vence', 'fin', 'end_date'));
        if (serviceName && end) {
          const price = Number(String(pickCol(row, 'precio', 'monto', 'price')).replace(/[^\d.]/g, '')) || 0;
          let service = get('SELECT id FROM services WHERE name = ? COLLATE NOCASE', serviceName);
          if (!service) {
            const r = run('INSERT INTO services (name, platform, price, duration_days) VALUES (?, ?, ?, 30)', serviceName, serviceName.split(' ')[0], price);
            service = { id: Number(r.lastInsertRowid) };
          }
          const start = parseLooseDate(pickCol(row, 'inicio', 'fecha_de_inicio', 'start_date')) ?? addDays(end, -30);
          createSale({ customerId, serviceId: service.id, profileName: pickCol(row, 'perfil', 'profile'), pin: pickCol(row, 'pin'), startDate: start, endDate: end, price }, req.user.id);
          result.subscriptions++;
        }
      });
    } catch (err) {
      result.errors.push({ row: i + 2, error: err.message });
    }
  });
  logEvent('clientes.importados', { userId: req.user.id, data: { ...result, errors: result.errors.length } });
  res.json(result);
});

apiRouter.post('/customers', (req, res) => {
  const f = customerFields(req.body ?? {});
  if (f.phone && get('SELECT id FROM customers WHERE phone = ?', f.phone)) throw new HttpError(409, 'Ya existe un cliente con ese teléfono');
  res.status(201).json({ id: createCustomer(req.body, req.user.id) });
});

apiRouter.get('/customers/:id', (req, res) => {
  const customer = get('SELECT * FROM customers WHERE id = ?', id(req));
  if (!customer) throw new HttpError(404, 'Cliente no encontrado');
  res.json({
    customer,
    subscriptions: all(`${SUB_LIST} WHERE s.customer_id = ? ORDER BY s.end_date DESC`, id(req)),
    payments: all('SELECT p.*, u.name user_name FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE p.customer_id = ? ORDER BY p.paid_at DESC', id(req)),
    calls: all(
      `SELECT k.* FROM calls k JOIN subscriptions s ON s.id = k.subscription_id WHERE s.customer_id = ? ORDER BY k.created_at DESC LIMIT 100`,
      id(req),
    ),
  });
});

apiRouter.put('/customers/:id', (req, res) => {
  const f = customerFields({ ...get('SELECT * FROM customers WHERE id = ?', id(req)), ...req.body });
  if (f.phone && get('SELECT id FROM customers WHERE phone = ? AND id <> ?', f.phone, id(req))) throw new HttpError(409, 'Otro cliente ya tiene ese teléfono');
  updateCustomer(id(req), req.body ?? {}, req.user.id);
  res.json({ ok: true });
});

apiRouter.delete('/customers/:id', requireAdmin, (req, res) => {
  const r = run('DELETE FROM customers WHERE id = ?', id(req));
  if (!r.changes) throw new HttpError(404, 'Cliente no encontrado');
  logEvent('cliente.eliminado', { entity: 'customer', entityId: id(req), userId: req.user.id });
  res.json({ ok: true });
});

// ---------------- Servicios ----------------

function serviceInput(b) {
  const name = String(b.name ?? '').trim();
  if (!name) throw new HttpError(400, 'El nombre del servicio es obligatorio');
  const duration = Number(b.duration_days ?? 30);
  if (!Number.isInteger(duration) || duration < 1 || duration > 3650) throw new HttpError(400, 'Duración inválida');
  return [name.slice(0, 120), String(b.platform ?? name.split(' ')[0]).trim().slice(0, 60), Number(b.price) || 0, duration, b.active === false ? 0 : 1];
}

apiRouter.get('/services', (req, res) => res.json({ services: all('SELECT * FROM services ORDER BY active DESC, name COLLATE NOCASE') }));
apiRouter.post('/services', (req, res) => {
  const r = run('INSERT INTO services (name, platform, price, duration_days, active) VALUES (?, ?, ?, ?, ?)', ...serviceInput(req.body ?? {}));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
apiRouter.put('/services/:id', (req, res) => {
  const r = run('UPDATE services SET name = ?, platform = ?, price = ?, duration_days = ?, active = ? WHERE id = ?', ...serviceInput(req.body ?? {}), id(req));
  if (!r.changes) throw new HttpError(404, 'Servicio no encontrado');
  res.json({ ok: true });
});

// ---------------- Cuentas madre ----------------

function accountInput(b, prev = {}) {
  const platform = String(b.platform ?? prev.platform ?? '').trim();
  const email = String(b.email ?? prev.email ?? '').trim();
  if (!platform || !email) throw new HttpError(400, 'Plataforma y correo son obligatorios');
  const total = Number(b.total_profiles ?? prev.total_profiles ?? 1);
  if (!Number.isInteger(total) || total < 1 || total > 50) throw new HttpError(400, 'Perfiles totales inválidos');
  const expires = b.expires_at !== undefined ? b.expires_at || null : prev.expires_at ?? null;
  if (expires && !isIsoDate(expires)) throw new HttpError(400, 'Fecha de vencimiento inválida');
  return {
    platform: platform.slice(0, 60),
    email: email.slice(0, 160),
    password_enc: b.password ? encrypt(b.password) : prev.password_enc ?? null,
    total_profiles: total,
    expires_at: expires,
    cost: b.cost !== undefined ? Number(b.cost) || 0 : prev.cost ?? 0,
    notes: b.notes !== undefined ? String(b.notes).slice(0, 2000) : prev.notes ?? null,
    active: b.active === undefined ? prev.active ?? 1 : b.active ? 1 : 0,
  };
}

apiRouter.get('/accounts', (req, res) => {
  const accounts = all(
    `SELECT a.id, a.platform, a.email, a.total_profiles, a.expires_at, a.cost, a.notes, a.active, (a.password_enc IS NOT NULL) has_password,
            (SELECT COUNT(*) FROM subscriptions s WHERE s.stream_account_id = a.id AND s.status <> 'cancelada') used,
            (SELECT COALESCE(SUM(s.price), 0) FROM subscriptions s WHERE s.stream_account_id = a.id AND s.status IN ('activa', 'por_vencer')) revenue
     FROM stream_accounts a ORDER BY a.active DESC, a.platform, a.email`,
  );
  res.json({ accounts: accounts.map((a) => ({ ...a, free: Math.max(0, a.total_profiles - a.used), margin: a.revenue - a.cost })) });
});

apiRouter.post('/accounts', (req, res) => {
  const a = accountInput(req.body ?? {});
  const r = run(
    'INSERT INTO stream_accounts (platform, email, password_enc, total_profiles, expires_at, cost, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    a.platform, a.email, a.password_enc, a.total_profiles, a.expires_at, a.cost, a.notes, a.active,
  );
  logEvent('cuenta.creada', { entity: 'account', entityId: Number(r.lastInsertRowid), userId: req.user.id, data: { platform: a.platform } });
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

apiRouter.put('/accounts/:id', (req, res) => {
  const prev = get('SELECT * FROM stream_accounts WHERE id = ?', id(req));
  if (!prev) throw new HttpError(404, 'Cuenta no encontrada');
  const a = accountInput(req.body ?? {}, prev);
  run(
    'UPDATE stream_accounts SET platform = ?, email = ?, password_enc = ?, total_profiles = ?, expires_at = ?, cost = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?',
    a.platform, a.email, a.password_enc, a.total_profiles, a.expires_at, a.cost, a.notes, a.active, nowIso(), id(req),
  );
  logEvent('cuenta.editada', { entity: 'account', entityId: id(req), userId: req.user.id, data: { passwordChanged: !!req.body?.password } });
  res.json({ ok: true });
});

apiRouter.get('/accounts/:id/profiles', (req, res) => res.json(accountProfiles(id(req))));

/** Ver la contraseña de una cuenta madre: queda en la bitácora con el usuario. */
apiRouter.post('/accounts/:id/reveal', (req, res) => {
  const a = get('SELECT id, platform, email, password_enc FROM stream_accounts WHERE id = ?', id(req));
  if (!a) throw new HttpError(404, 'Cuenta no encontrada');
  logEvent('contrasena.vista', { entity: 'account', entityId: a.id, userId: req.user.id, data: { platform: a.platform, email: a.email } });
  res.json({ password: decrypt(a.password_enc) ?? '' });
});

/** La cuenta madre se pagó otro periodo: corre el vencimiento N días (30 por defecto). */
apiRouter.post('/accounts/:id/renew', (req, res) => {
  const a = get('SELECT * FROM stream_accounts WHERE id = ?', id(req));
  if (!a) throw new HttpError(404, 'Cuenta no encontrada');
  const today = todayIn(getSettings().timezone);
  const from = !a.expires_at || a.expires_at < today ? today : a.expires_at;
  const next = addDays(from, Number(req.body?.days) || 30);
  run('UPDATE stream_accounts SET expires_at = ?, cost = COALESCE(?, cost), updated_at = ? WHERE id = ?', next, req.body?.cost ?? null, nowIso(), a.id);
  logEvent('cuenta.renovada', { entity: 'account', entityId: a.id, userId: req.user.id, data: { to: next } });
  res.json({ expires_at: next });
});

// ---------------- Suscripciones ----------------

apiRouter.get('/subscriptions', (req, res) => {
  const where = [];
  const params = [];
  const { q, status, platform, intent, reminder } = req.query;
  if (q) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR sv.name LIKE ? OR s.profile_name LIKE ? OR a.email LIKE ?)');
    params.push(like(q), like(q), like(q), like(q), like(q));
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  } else where.push(`s.status <> 'cancelada'`);
  if (platform) {
    where.push('COALESCE(sv.platform, a.platform) = ?');
    params.push(platform);
  }
  if (intent) {
    where.push(intent === 'ninguna' ? 's.renewal_intent IS NULL' : 's.renewal_intent = ?');
    if (intent !== 'ninguna') params.push(intent);
  }
  if (reminder) {
    where.push('s.reminder_status = ?');
    params.push(reminder);
  }
  const rows = all(`${SUB_LIST} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.end_date LIMIT 2000`, ...params);
  res.json({ subscriptions: rows, platforms: all('SELECT DISTINCT platform FROM services UNION SELECT DISTINCT platform FROM stream_accounts').map((r) => r.platform) });
});

apiRouter.get('/subscriptions/:id', (req, res) => {
  const sub = get(`${SUB_LIST} WHERE s.id = ?`, id(req));
  if (!sub) throw new HttpError(404, 'Suscripción no encontrada');
  res.json({ subscription: sub, payments: all('SELECT * FROM payments WHERE subscription_id = ? ORDER BY paid_at DESC', id(req)) });
});

apiRouter.post('/sales', (req, res) => res.status(201).json({ id: createSale(req.body ?? {}, req.user.id) }));
apiRouter.put('/subscriptions/:id', (req, res) => {
  updateSubscription(id(req), req.body ?? {}, req.user.id);
  res.json({ ok: true });
});
apiRouter.post('/subscriptions/:id/renew', (req, res) => res.json({ end_date: renewSubscription(id(req), req.body ?? {}, req.user.id) }));
apiRouter.post('/subscriptions/:id/payments', (req, res) => {
  addPayment(id(req), req.body ?? {}, req.user.id);
  res.status(201).json({ ok: true });
});
apiRouter.post('/subscriptions/:id/remind', (req, res) => {
  remindNow(id(req), req.user.id);
  res.json({ ok: true, message: 'Se enviará en menos de un minuto' });
});
apiRouter.post('/subscriptions/:id/credentials', (req, res) => res.json({ message: credentialsMessage(id(req), req.user.id) }));
apiRouter.post('/subscriptions/:id/cancel', (req, res) => {
  cancelSubscription(id(req), req.user.id);
  res.json({ ok: true });
});

/** El dueño anota a mano lo que respondió el cliente (WhatsApp manual, llamada propia). */
apiRouter.post('/subscriptions/:id/intent', (req, res) => {
  const intent = req.body?.intent;
  if (!RENEWAL_INTENTS.includes(intent)) throw new HttpError(400, 'Intención inválida');
  const r = run(
    `UPDATE subscriptions SET renewal_intent = ?, reminder_status = 'respondido', last_contact_at = ?, updated_at = ? WHERE id = ?`,
    intent, nowIso(), nowIso(), id(req),
  );
  if (!r.changes) throw new HttpError(404, 'Suscripción no encontrada');
  logEvent('renovacion.intencion', { entity: 'subscription', entityId: id(req), userId: req.user.id, data: { intent, manual: true } });
  res.json({ ok: true });
});

/** Se abrió el enlace wa.me de un aviso manual: ya no aparece en "Recordatorios manuales de hoy". */
apiRouter.post('/subscriptions/:id/manual-sent', (req, res) => {
  const r = run(
    `UPDATE subscriptions SET reminder_status = 'enviado', reminder_channel = 'manual', last_contact_at = ?, updated_at = ? WHERE id = ? AND reminder_status = 'manual'`,
    nowIso(), nowIso(), id(req),
  );
  if (r.changes) logEvent('recordatorio.manual_enviado', { entity: 'subscription', entityId: id(req), userId: req.user.id });
  res.json({ ok: true });
});

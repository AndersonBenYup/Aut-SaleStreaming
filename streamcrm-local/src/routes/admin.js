import express, { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, setEnvValue } from '../config.js';
import { createUser, requireAdmin, validatePassword } from '../auth.js';
import { createBackup, isBackupName, listBackups, restoreBackup } from '../backups.js';
import { removeLogo, saveLogo } from '../branding.js';
import { testCall, testWhatsapp } from '../channelTests.js';
import { retellConfig, whatsappConfig } from '../channels/index.js';
import { hashPassword } from '../crypto.js';
import { all, get, nowIso, run } from '../db.js';
import { computeReminderAt } from '../dates.js';
import { logEvent } from '../events.js';
import { HttpError } from '../http.js';
import { hasFeature, licenseStatus, parseLicense } from '../license.js';
import { COUNTRIES } from '../phone.js';
import { getSettings, publicSettings, reminderConfig, setSettings } from '../settings.js';
import { cleanSettings } from '../settingsInput.js';

export const adminRouter = Router();
const id = (req) => Number(req.params.id);

// ---------------- Licencia (lectura para todos; activar solo admin, aun en solo lectura) ----------------

adminRouter.get('/license', (req, res) => res.json(licenseStatus()));

adminRouter.post('/license', requireAdmin, (req, res) => {
  const r = parseLicense(req.body?.key);
  if (!r.ok) throw new HttpError(400, r.error);
  setSettings({ license_key: String(req.body.key).trim() });
  logEvent('licencia.activada', { userId: req.user.id, data: { licenseId: r.license.licenseId, type: r.license.type } });
  res.json(licenseStatus());
});

// Todo lo de abajo es solo para el administrador (el resto de /api lo atiende apiRouter).
adminRouter.use(['/settings', '/system', '/users', '/events', '/backups'], requireAdmin);

// ---------------- Ajustes ----------------

function tunnelUrl() {
  const f = path.join(config.dataDir, 'tunnel-url.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
}

function lanUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${config.port}`);
}

export function systemInfo() {
  const s = getSettings();
  const publicUrl = s.public_url || tunnelUrl();
  return {
    version: config.version,
    releaseDate: config.releaseDate,
    node: process.version,
    host: config.host,
    port: config.port,
    lanEnabled: config.host === '0.0.0.0',
    lanUrls: config.host === '0.0.0.0' ? lanUrls() : [],
    envFile: config.envFile,
    dataDir: config.dataDir,
    backupDir: config.backupDir,
    tunnelUrl: tunnelUrl(),
    webhookUrl: publicUrl ? `${publicUrl}/webhooks/retell` : '',
    lastBackupAt: s.last_backup_at,
  };
}

adminRouter.get('/settings', (req, res) => {
  res.json({ settings: publicSettings(), system: systemInfo(), countries: COUNTRIES, license: licenseStatus() });
});

adminRouter.put('/settings', (req, res) => {
  const clean = cleanSettings(req.body ?? {});
  const lic = licenseStatus();
  if (!hasFeature(lic, 'branding') && lic.mode !== 'demo') {
    for (const k of ['panel_name', 'primary_color']) delete clean[k];
  }
  const before = reminderConfig();
  setSettings(clean);
  const after = reminderConfig();
  // Si cambió el horario de avisos, se recalculan los que aún no salieron.
  let rescheduled = 0;
  if (['timezone', 'daysBefore', 'hour', 'startHour', 'endHour'].some((k) => before[k] !== after[k])) {
    for (const s of all(`SELECT id, end_date FROM subscriptions WHERE reminder_status = 'pendiente' AND reminder_attempts = 0 AND status <> 'cancelada'`)) {
      run('UPDATE subscriptions SET reminder_at = ? WHERE id = ?', computeReminderAt(s.end_date, after).toISOString(), s.id);
      rescheduled++;
    }
  }
  const changed = Object.keys(clean).map((k) => (k.includes('token') || k.includes('api_key') ? `${k} (secreto)` : k));
  logEvent('ajustes.cambiados', { userId: req.user.id, data: { keys: changed, rescheduled } });
  res.json({ ok: true, settings: publicSettings(), rescheduled });
});

adminRouter.post('/settings/logo', (req, res) => {
  const lic = licenseStatus();
  if (!hasFeature(lic, 'branding') && lic.mode !== 'demo') throw new HttpError(403, 'Tu licencia no incluye marca personalizada');
  saveLogo(req.body?.dataUrl);
  logEvent('ajustes.logo', { userId: req.user.id });
  res.json({ ok: true });
});

adminRouter.delete('/settings/logo', (req, res) => {
  removeLogo();
  res.json({ ok: true });
});

/** Prueba con lo escrito en el formulario; lo que venga vacío o enmascarado se toma de lo guardado. */
const pickSecret = (v, saved) => (v && !String(v).startsWith('••••') ? v : saved);

adminRouter.post('/settings/test-call', async (req, res) => {
  const b = req.body ?? {};
  const saved = retellConfig();
  const r = await testCall(b.phone, {
    apiKey: pickSecret(b.retell_api_key, saved.apiKey),
    agentId: b.retell_agent_id || saved.agentId,
    fromNumber: b.retell_from_number || saved.fromNumber,
  });
  logEvent('prueba.llamada', { userId: req.user.id, data: { callId: r.externalId } });
  res.json({ ok: true, callId: r.externalId });
});

adminRouter.post('/settings/test-whatsapp', async (req, res) => {
  const b = req.body ?? {};
  const saved = whatsappConfig();
  const r = await testWhatsapp(b.phone, {
    phoneNumberId: b.whatsapp_phone_number_id || saved.phoneNumberId,
    token: pickSecret(b.whatsapp_token, saved.token),
    template: b.whatsapp_template || saved.template,
    language: b.whatsapp_language || saved.language,
  });
  logEvent('prueba.whatsapp', { userId: req.user.id });
  res.json({ ok: true, messageId: r.externalId });
});

/** Acceso desde la red local (celular en el mismo WiFi). Requiere reiniciar. */
adminRouter.put('/system/lan', (req, res) => {
  const host = req.body?.enabled ? '0.0.0.0' : '127.0.0.1';
  setEnvValue('HOST', host);
  logEvent('ajustes.red_local', { userId: req.user.id, data: { host } });
  res.json({ ok: true, host, restartRequired: host !== config.host });
});

// ---------------- Usuarios ----------------

adminRouter.get('/users', (req, res) => {
  res.json({ users: all('SELECT id, email, name, role, active, last_login_at, created_at, locked_until FROM users ORDER BY id'), license: licenseStatus() });
});

adminRouter.post('/users', (req, res) => {
  const lic = licenseStatus();
  if (lic.usersCount >= lic.maxUsers) {
    throw new HttpError(403, `Tu licencia permite ${lic.maxUsers} usuario(s). Para más, pide la función multiusuario a ${lic.vendor.name}.`);
  }
  const newId = createUser(req.body ?? {});
  logEvent('usuario.creado', { entity: 'user', entityId: newId, userId: req.user.id, data: { role: req.body?.role } });
  res.status(201).json({ id: newId });
});

adminRouter.put('/users/:id', (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', id(req));
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  const b = req.body ?? {};
  const role = b.role ?? u.role;
  const active = b.active === undefined ? u.active : b.active ? 1 : 0;
  if (!['admin', 'vendedor'].includes(role)) throw new HttpError(400, 'Rol inválido');
  if (u.role === 'admin' && (role !== 'admin' || !active)) {
    const admins = get(`SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1`).n;
    if (admins <= 1) throw new HttpError(400, 'Debe quedar al menos un administrador activo');
  }
  if (b.password) validatePassword(b.password);
  run(
    'UPDATE users SET name = ?, role = ?, active = ?, password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    b.name ?? u.name, role, active, b.password ? hashPassword(b.password) : u.password_hash, u.id,
  );
  if (b.password || !active) run('DELETE FROM sessions WHERE user_id = ?', u.id);
  logEvent('usuario.editado', { entity: 'user', entityId: u.id, userId: req.user.id, data: { role, active: !!active, passwordChanged: !!b.password } });
  res.json({ ok: true });
});

// ---------------- Bitácora ----------------

adminRouter.get('/events', (req, res) => {
  const rows = all(
    `SELECT e.*, u.name user_name, u.email user_email FROM events e LEFT JOIN users u ON u.id = e.user_id
     ${req.query.type ? 'WHERE e.type LIKE ?' : ''} ORDER BY e.id DESC LIMIT ?`,
    ...(req.query.type ? [`${req.query.type}%`] : []),
    Math.min(Number(req.query.limit) || 200, 1000),
  );
  res.json({ events: rows.map((e) => ({ ...e, data: e.data ? JSON.parse(e.data) : null })) });
});

// ---------------- Respaldos ----------------

adminRouter.get('/backups', (req, res) => res.json({ backups: listBackups(), system: systemInfo(), copyDir: getSettings().backup_copy_dir }));

adminRouter.post('/backups', (req, res) => {
  const b = createBackup('manual');
  logEvent('respaldo.creado', { userId: req.user.id, data: { name: b.name } });
  res.status(201).json(b);
});

/** "Descargar respaldo ahora": crea uno nuevo y lo descarga. */
adminRouter.get('/backups/now', (req, res) => {
  const b = createBackup('manual');
  logEvent('respaldo.descargado', { userId: req.user.id, data: { name: b.name } });
  res.download(b.file, b.name);
});

adminRouter.get('/backups/:name', (req, res) => {
  if (!isBackupName(req.params.name)) throw new HttpError(400, 'Nombre inválido');
  const file = path.join(config.backupDir, req.params.name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'No existe');
  res.download(file, req.params.name);
});

/** Restaurar: { name } de la lista, o el archivo .db en el cuerpo (application/octet-stream). */
adminRouter.post('/backups/restore', express.raw({ type: 'application/octet-stream', limit: '1gb' }), (req, res) => {
  const opts = Buffer.isBuffer(req.body) ? { buffer: req.body } : { name: req.body?.name };
  try {
    const r = restoreBackup(opts);
    res.json({ ok: true, ...r, at: nowIso() });
  } catch (err) {
    throw new HttpError(400, err.message);
  }
});

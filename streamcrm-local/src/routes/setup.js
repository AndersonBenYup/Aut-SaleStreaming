import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from '../config.js';
import { get, nowIso, tx } from '../db.js';
import { createSession, createUser, setSessionCookie } from '../auth.js';
import { applyBrandingLogo, brandingDefaults, saveLogo } from '../branding.js';
import { testCall, testWhatsapp } from '../channelTests.js';
import { logEvent } from '../events.js';
import { HttpError } from '../http.js';
import { parseLicense } from '../license.js';
import { COUNTRIES } from '../phone.js';
import { DEFAULTS, setSettings } from '../settings.js';
import { cleanSettings } from '../settingsInput.js';

export const setupRequired = () => !get('SELECT id FROM users LIMIT 1');

export const setupRouter = Router();

// El asistente solo existe mientras no haya ningún usuario.
setupRouter.use((req, res, next) => {
  if (!setupRequired()) return res.status(409).json({ error: 'El sistema ya está configurado' });
  next();
});

setupRouter.get('/defaults', (req, res) => {
  const licenseFile = path.join(ROOT, 'licencia.txt');
  const b = Object.fromEntries(Object.entries(brandingDefaults()).filter(([, v]) => v));
  res.json({
    settings: { ...DEFAULTS, ...b },
    countries: COUNTRIES,
    // Si el vendedor dejó licencia.txt en la carpeta, el asistente la trae ya pegada.
    license: fs.existsSync(licenseFile) ? fs.readFileSync(licenseFile, 'utf8').trim() : '',
    hasBrandingLogo: !!config.branding.logo,
  });
});

setupRouter.post('/test-call', async (req, res) => {
  const { phone, retell_api_key: apiKey, retell_agent_id: agentId, retell_from_number: fromNumber } = req.body ?? {};
  const s = { ...DEFAULTS, ...cleanSettings({ business_name: req.body?.business_name || DEFAULTS.business_name, country: req.body?.country, timezone: req.body?.timezone }) };
  const r = await testCall(phone, { apiKey, agentId, fromNumber }, s);
  res.json({ ok: true, callId: r.externalId });
});

setupRouter.post('/test-whatsapp', async (req, res) => {
  const b = req.body ?? {};
  const s = { ...DEFAULTS, ...cleanSettings({ business_name: b.business_name || DEFAULTS.business_name, country: b.country, timezone: b.timezone }) };
  const r = await testWhatsapp(b.phone, { phoneNumberId: b.whatsapp_phone_number_id, token: b.whatsapp_token, template: b.whatsapp_template, language: b.whatsapp_language }, s);
  res.json({ ok: true, messageId: r.externalId });
});

setupRouter.post('/license-check', (req, res) => {
  const r = parseLicense(req.body?.key);
  if (!r.ok) throw new HttpError(400, r.error);
  res.json({ ok: true, license: r.license });
});

/** Termina el asistente: guarda ajustes, crea el admin, activa licencia o demo e inicia sesión. */
setupRouter.post('/complete', (req, res) => {
  const { settings = {}, admin = {}, licenseKey = '', logo } = req.body ?? {};
  const clean = cleanSettings({ ...settings, business_name: settings.business_name ?? '' });
  if (licenseKey) {
    const r = parseLicense(licenseKey);
    if (!r.ok) throw new HttpError(400, r.error);
  }
  const userId = tx(() => {
    if (!setupRequired()) throw new HttpError(409, 'El sistema ya está configurado');
    setSettings({
      ...clean,
      license_key: licenseKey ? licenseKey.trim() : undefined,
      demo_started_at: nowIso(),
      setup_completed: nowIso(),
    });
    const id = createUser({ email: admin.email, name: admin.name, password: admin.password, role: 'admin' });
    logEvent('setup.completado', { userId: id, data: { license: licenseKey ? 'licencia' : 'demo', channel: clean.reminder_channel } });
    return id;
  });
  if (logo) saveLogo(logo);
  else applyBrandingLogo();
  setSessionCookie(req, res, createSession(userId));
  res.json({ ok: true, envFile: config.envFile, dataDir: config.dataDir, backupDir: config.backupDir });
});

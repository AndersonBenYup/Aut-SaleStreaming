import express from 'express';
import path from 'node:path';
import { verify as retellVerify } from 'retell-sdk';
import { ROOT, config, loadConfig } from './config.js';
import { closeDb, migrate, openDb } from './db.js';
import { requireAuth, requireCsrfHeader } from './auth.js';
import { faviconSvg, logo } from './branding.js';
import { logEvent } from './events.js';
import { licenseStatus, setLicensePublicKey } from './license.js';
import { handleRetellCall } from './reminders.js';
import { getSetting, getSettings } from './settings.js';
import { adminRouter } from './routes/admin.js';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';
import { setupRequired, setupRouter } from './routes/setup.js';

/** Abre la base, aplica migraciones y devuelve la app de Express. Lo usan server.js y las pruebas. */
export function init(overrides = {}) {
  loadConfig(overrides);
  if (overrides.licensePublicKey) setLicensePublicKey(overrides.licensePublicKey);
  closeDb();
  openDb(config.dbFile);
  migrate({ dir: config.migrationsDir, backupDir: config.backupDir, log: overrides.quiet ? undefined : (m) => console.log(m) });
  return createApp();
}

// Rutas que siguen funcionando con la licencia vencida (solo lectura).
const READ_ONLY_ALLOWED = ['/license', '/backups'];

function licenseGuard(req, res, next) {
  if (['GET', 'HEAD'].includes(req.method) || READ_ONLY_ALLOWED.some((p) => req.path.startsWith(p))) return next();
  const lic = licenseStatus();
  if (lic.readOnly) return res.status(403).json({ error: lic.message, readOnly: true });
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });

  // Lo que llega por Cloudflare Tunnel solo puede usar los webhooks: el panel no queda expuesto a internet.
  app.use((req, res, next) => {
    if (req.get('cf-connecting-ip') && !req.path.startsWith('/webhooks/')) {
      return res.status(403).send('El panel de StreamCRM solo está disponible en la computadora del negocio.');
    }
    next();
  });

  // Webhook de Retell: la firma se verifica sobre el cuerpo crudo exacto, por eso va antes de express.json().
  app.post('/webhooks/retell', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const apiKey = getSetting('retell_api_key');
    const signature = req.get('x-retell-signature');
    const valid = !!apiKey && !!signature && (await retellVerify(raw, apiKey, signature).catch(() => false));
    if (!valid) return res.status(401).json({ error: 'Firma inválida' });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    const result = handleRetellCall(body.event, body.call);
    if (!['ignorado', 'duplicado', 'finalizada'].includes(result)) {
      logEvent('webhook.retell', { entity: 'call', data: { event: body.event, callId: body.call?.call_id, result } });
    }
    res.status(204).end();
  });

  app.use(express.json({ limit: '8mb' }));

  /** Datos públicos para pintar el login/asistente con la marca del negocio. */
  app.get('/api/public', (req, res) => {
    const s = getSettings();
    const lic = licenseStatus();
    res.json({
      setupRequired: setupRequired(),
      version: config.version,
      currency: s.currency,
      branding: { name: s.panel_name || s.business_name, businessName: s.business_name, color: s.primary_color, hasLogo: !!logo() },
      license: { mode: lic.mode, readOnly: lic.readOnly, branding: lic.mode === 'demo' || lic.features.includes('branding') },
    });
  });

  app.use('/api', requireCsrfHeader);
  app.use('/api/setup', setupRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth, licenseGuard, adminRouter, apiRouter);

  app.get('/branding/logo', (req, res) => {
    const l = logo();
    if (!l) return res.status(404).end();
    res.type(l.type).sendFile(l.file);
  });
  app.get('/favicon.svg', (req, res) => res.type('image/svg+xml').send(faviconSvg()));

  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

  app.use((err, req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno. Revisa la consola del servidor.' : err.message });
  });
  return app;
}

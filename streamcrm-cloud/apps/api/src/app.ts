import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { verify as retellVerify } from 'retell-sdk';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import {
  extractWhatsappMessages,
  receiveWebhook,
  retellEventId,
  verifyWhatsappSignature,
  type RetellEvent,
} from './modules/webhooks.js';
import { devRouter } from './routes/dev.js';
import { apiRoot } from './bootstrap.js';
import { loadSession, requireAuth, requireTenant } from './auth/session.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/panel/dashboard.js';
import { subscriptionsRouter } from './routes/panel/subscriptions.js';
import { accountsRouter, activityRouter, customersRouter, paymentsRouter, servicesRouter } from './routes/panel/records.js';
import { adminRouter, settingsRouter, teamRouter } from './routes/panel/settings.js';

/** Build del panel (apps/web/dist). Si existe, la API lo sirve en la misma URL. */
const webDist = path.resolve(apiRoot, '../web/dist');

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // Se guarda el body crudo exacto: la firma de Retell y la de WhatsApp se calculan sobre él.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = Buffer.from(buf);
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ---------- Panel ----------
  const api = Router();
  api.use(cookieParser(), loadSession);
  api.use('/auth', authRouter());
  api.use('/admin', requireAuth, adminRouter());
  const tenantApi = Router();
  tenantApi.use(requireAuth, requireTenant);
  tenantApi.use('/dashboard', dashboardRouter());
  tenantApi.use('/subscriptions', subscriptionsRouter());
  tenantApi.use('/customers', customersRouter());
  tenantApi.use('/accounts', accountsRouter());
  tenantApi.use('/payments', paymentsRouter());
  tenantApi.use('/services', servicesRouter());
  tenantApi.use('/activity', activityRouter());
  tenantApi.use('/settings', settingsRouter());
  tenantApi.use('/team', teamRouter());
  api.use(tenantApi);
  api.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });
  app.use('/api', api);

  app.post('/webhooks/retell', async (req, res, next) => {
    try {
      const signature = req.header('x-retell-signature') ?? '';
      const raw = req.rawBody?.toString('utf8') ?? '';
      const valid = signature && raw ? await retellVerify(raw, env().RETELL_API_KEY, signature) : false;
      if (!valid) {
        res.status(401).json({ error: 'Firma inválida' });
        return;
      }
      const event = req.body as RetellEvent;
      if (event?.call?.call_id) await receiveWebhook('retell', retellEventId(event), event, event.call.metadata?.tenantId);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.get('/webhooks/whatsapp', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === env().WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(String(req.query['hub.challenge'] ?? ''));
      return;
    }
    res.status(403).end();
  });

  app.post('/webhooks/whatsapp', async (req, res, next) => {
    try {
      if (!verifyWhatsappSignature(req.rawBody ?? Buffer.alloc(0), req.header('x-hub-signature-256'), env().WHATSAPP_APP_SECRET)) {
        res.status(401).json({ error: 'Firma inválida' });
        return;
      }
      for (const m of extractWhatsappMessages(req.body)) await receiveWebhook('whatsapp', m.messageId, m);
      res.status(200).end();
    } catch (err) {
      next(err);
    }
  });

  if (env().NODE_ENV !== 'production') app.use('/dev', devRouter());

  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // Cualquier otra ruta GET es del panel (React Router).
    app.get(/^\/(?!api|webhooks|dev|health).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      res.status(400).json({ error: first ? `${first.path.join('.') || 'Datos'}: ${first.message}` : 'Datos inválidos', issues: err.issues });
      return;
    }
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 500) logger.error({ err }, 'error no controlado');
    res.status(status).json({ error: status >= 500 ? 'Error interno' : (err as Error).message });
  });

  return app;
}

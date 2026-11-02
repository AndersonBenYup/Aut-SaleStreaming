import { Router, type Request } from 'express';
import argon2 from 'argon2';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { changePasswordInput, loginInput, signupInput } from '@streamcrm/shared';
import { env } from '../config/env.js';
import { getDb } from '../db/index.js';
import { plans, tenants, users } from '../db/schema.js';
import { normalizePhone } from '../lib/phone.js';
import { HttpError } from '../lib/http.js';
import { logEvent } from '../modules/subscriptions.js';
import {
  createSession,
  destroySession,
  destroyUserSessions,
  requireAuth,
  requireRole,
  setSessionTenant,
} from '../auth/session.js';

export const TRIAL_DAYS = 7;

let dummyHash: Promise<string> | undefined;
/** Si el email no existe igual se verifica un hash, para que el tiempo de respuesta no delate qué emails existen. */
const dummy = () => (dummyHash ??= argon2.hash('no-existe-este-usuario'));

/** Lo que el panel necesita saber de la sesión: usuario, negocio activo, plan y el token CSRF. */
export async function sessionInfo(req: Request, csrfToken = req.auth!.csrfToken) {
  const auth = req.auth!;
  let tenant = null;
  if (auth.tenantId) {
    const [row] = await getDb()
      .select({ tenant: tenants, plan: plans })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, auth.tenantId));
    if (row) {
      const t = row.tenant;
      tenant = {
        id: t.id,
        name: t.name,
        timezone: t.timezone,
        subscriptionStatus: t.subscriptionStatus,
        trialEndsAt: t.trialEndsAt,
        activeUntil: t.activeUntil,
        sheetConnected: !!(t.sheetProvider && t.sheetSpreadsheetId),
        staffCanSeePasswords: t.staffCanSeePasswords,
        plan: row.plan ? { code: row.plan.code, name: row.plan.name, price: row.plan.priceMonthly, limits: row.plan.limits } : null,
      };
    }
  }
  return { user: auth.user, tenant, csrfToken };
}

export function authRouter() {
  const r = Router();
  const isTest = env().NODE_ENV === 'test';
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => isTest,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email ?? '').toLowerCase()}`,
    message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  });
  const signupLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 5,
    skip: () => isTest,
    message: { error: 'Demasiados registros desde esta conexión. Intenta más tarde.' },
  });

  r.post('/signup', signupLimiter, async (req, res) => {
    const input = signupInput.parse(req.body);
    const db = getDb();
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (exists) throw new HttpError(409, 'Ya existe una cuenta con ese email');
    const passwordHash = await argon2.hash(input.password);
    // Prueba gratis con el plan Pro (si existe) para que se pueda probar todo, incluidas las llamadas.
    const [pro] = await db.select().from(plans).where(eq(plans.code, 'pro'));
    const user = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.businessName,
          planId: pro?.id ?? null,
          subscriptionStatus: 'trialing',
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000),
          ownerNotifyPhone: normalizePhone(input.whatsapp),
        })
        .returning();
      const [u] = await tx
        .insert(users)
        .values({ tenantId: tenant!.id, email: input.email, name: input.name, role: 'owner', passwordHash })
        .returning();
      return u!;
    });
    await logEvent(db, { tenantId: user.tenantId, type: 'tenant.signup', userId: user.id, data: { email: user.email } });
    const csrf = await createSession(req, res, user);
    req.auth = {
      sessionId: '',
      csrfToken: csrf,
      tenantId: user.tenantId,
      user: { id: user.id, email: user.email, name: user.name, role: 'owner', homeTenantId: user.tenantId },
    };
    res.status(201).json(await sessionInfo(req, csrf));
  });

  r.post('/login', loginLimiter, async (req, res) => {
    const input = loginInput.parse(req.body);
    const db = getDb();
    const [user] = await db.select().from(users).where(and(eq(users.email, input.email), isNull(users.disabledAt)));
    const ok = await argon2.verify(user?.passwordHash ?? (await dummy()), input.password).catch(() => false);
    if (!user || !ok) throw new HttpError(401, 'Email o contraseña incorrectos');
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const csrf = await createSession(req, res, user);
    req.auth = {
      sessionId: '',
      csrfToken: csrf,
      tenantId: user.tenantId,
      user: { id: user.id, email: user.email, name: user.name, role: user.role as 'owner', homeTenantId: user.tenantId },
    };
    res.json(await sessionInfo(req, csrf));
  });

  r.get('/me', async (req, res) => {
    if (!req.auth) throw new HttpError(401, 'Sin sesión');
    res.json(await sessionInfo(req));
  });

  r.post('/logout', requireAuth, async (req, res) => {
    await destroySession(req, res);
    res.status(204).end();
  });

  r.post('/password', requireAuth, async (req, res) => {
    const input = changePasswordInput.parse(req.body);
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.user.id));
    if (!user || !(await argon2.verify(user.passwordHash, input.current))) throw new HttpError(400, 'La contraseña actual no es correcta');
    await db.update(users).set({ passwordHash: await argon2.hash(input.next) }).where(eq(users.id, user.id));
    await destroyUserSessions(user.id, req.auth!.sessionId);
    res.status(204).end();
  });

  /** Super-admin: elegir qué negocio ver en el panel (null = ninguno). */
  r.post('/switch-tenant', requireAuth, requireRole(), async (req, res) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid().nullable() }).parse(req.body);
    if (tenantId) {
      const [t] = await getDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
      if (!t) throw new HttpError(404, 'Negocio no encontrado');
    }
    await setSessionTenant(req.auth!.sessionId, tenantId);
    req.auth!.tenantId = tenantId;
    await logEvent(getDb(), { tenantId, type: 'admin.switch_tenant', userId: req.auth!.user.id });
    res.json(await sessionInfo(req));
  });

  return r;
}

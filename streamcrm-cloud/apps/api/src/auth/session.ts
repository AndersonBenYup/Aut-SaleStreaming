import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { UserRole } from '@streamcrm/shared';
import { env } from '../config/env.js';
import { getDb } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { HttpError } from '../lib/http.js';

export const SESSION_COOKIE = 'sc_session';
export const CSRF_HEADER = 'x-csrf-token';
const SESSION_DAYS = 14;
/** Cada cuánto se renueva la expiración de una sesión en uso (para no escribir en cada request). */
const TOUCH_AFTER_MS = 10 * 60_000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** negocio al que pertenece el usuario (null para el super-admin) */
  homeTenantId: string | null;
}

export interface AuthContext {
  sessionId: string;
  csrfToken: string;
  user: AuthUser;
  /** negocio activo de la sesión */
  tenantId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env().NODE_ENV === 'production',
  path: '/',
});

export async function createSession(req: Request, res: Response, user: { id: string; tenantId: string | null }) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await getDb()
    .insert(sessions)
    .values({
      id: hashToken(token),
      userId: user.id,
      tenantId: user.tenantId,
      csrfToken,
      expiresAt,
      ip: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 300),
    });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), expires: expiresAt });
  return csrfToken;
}

export async function destroySession(req: Request, res: Response) {
  if (req.auth) await getDb().delete(sessions).where(eq(sessions.id, req.auth.sessionId));
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/** Cierra todas las sesiones de un usuario (menos la actual, si se indica). */
export async function destroyUserSessions(userId: string, exceptSessionId?: string) {
  await getDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined));
}

/** Lee la cookie y deja req.auth si la sesión es válida. No rechaza nada: eso lo hace requireAuth. */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) return next();
  const id = hashToken(token);
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), isNull(users.disabledAt)));
  if (!row) return next();
  req.auth = {
    sessionId: id,
    csrfToken: row.session.csrfToken,
    tenantId: row.session.tenantId,
    user: { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role as UserRole, homeTenantId: row.user.tenantId },
  };
  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400_000) })
      .where(eq(sessions.id, id));
  }
  next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfMatches(expected: string, given: string | undefined) {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Exige sesión. En métodos que modifican, exige además el token CSRF en la cabecera x-csrf-token
 * (la cookie es SameSite=Lax y el token solo lo conoce el panel, que lo recibe en /api/auth/me).
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw new HttpError(401, 'Inicia sesión para continuar');
  if (!SAFE_METHODS.has(req.method) && !csrfMatches(req.auth.csrfToken, req.header(CSRF_HEADER))) {
    throw new HttpError(403, 'Token CSRF inválido. Recarga la página.');
  }
  next();
};

/** Exige un negocio activo en la sesión. Después de esto, usar tenantOf(req). */
export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.auth?.tenantId) {
    throw new HttpError(403, req.auth?.user.role === 'superadmin' ? 'Elige un negocio para verlo' : 'Tu usuario no tiene negocio');
  }
  next();
};

export const tenantOf = (req: Request): string => {
  if (!req.auth?.tenantId) throw new HttpError(403, 'Sin negocio activo');
  return req.auth.tenantId;
};

/** El super-admin pasa siempre. */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const role = req.auth?.user.role;
    if (role !== 'superadmin' && !roles.includes(role as UserRole)) throw new HttpError(403, 'No tienes permiso para esto');
    next();
  };

export async function setSessionTenant(sessionId: string, tenantId: string | null) {
  await getDb().update(sessions).set({ tenantId }).where(eq(sessions.id, sessionId));
}

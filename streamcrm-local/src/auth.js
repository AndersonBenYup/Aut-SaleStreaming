import { get, nowIso, run } from './db.js';
import { hashPassword, hmac, randomToken, verifyPassword } from './crypto.js';
import { logEvent } from './events.js';
import { getSettings } from './settings.js';
import { HttpError } from './http.js';

export const COOKIE = 'scrm_sid';
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const unknownFails = new Map(); // intentos con emails que no existen (no revelar si el email existe)

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
}

export function createUser({ email, name, password, role = 'vendedor' }) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Email inválido');
  validatePassword(password);
  if (!['admin', 'vendedor'].includes(role)) throw new HttpError(400, 'Rol inválido');
  if (get('SELECT id FROM users WHERE email = ?', e)) throw new HttpError(409, 'Ya existe un usuario con ese email');
  const r = run('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', e, String(name ?? '').trim(), hashPassword(password), role);
  return Number(r.lastInsertRowid);
}

/** Login con bloqueo temporal: 5 intentos fallidos → 15 minutos sin poder entrar. */
export function login(email, password, now = new Date()) {
  const e = String(email ?? '').trim().toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', e);
  const lockedMsg = (until) => `Demasiados intentos. Intenta de nuevo en ${Math.ceil((until - now) / 60000)} minuto(s).`;
  if (!user) {
    const f = unknownFails.get(e) ?? { n: 0, until: 0 };
    if (f.until > now.getTime()) throw new HttpError(429, lockedMsg(f.until));
    f.n += 1;
    if (f.n >= MAX_FAILS) Object.assign(f, { n: 0, until: now.getTime() + LOCK_MINUTES * 60000 });
    unknownFails.set(e, f);
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  if (user.locked_until && Date.parse(user.locked_until) > now.getTime()) throw new HttpError(429, lockedMsg(Date.parse(user.locked_until)));
  if (!user.active || !verifyPassword(String(password ?? ''), user.password_hash)) {
    const fails = user.failed_attempts + 1;
    if (fails >= MAX_FAILS) {
      run('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?', new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString(), user.id);
      logEvent('login.bloqueado', { entity: 'user', entityId: user.id });
    } else {
      run('UPDATE users SET failed_attempts = ? WHERE id = ?', fails, user.id);
    }
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', nowIso(now), user.id);
  logEvent('login', { entity: 'user', entityId: user.id, userId: user.id });
  return user;
}

export function createSession(userId, now = new Date()) {
  const token = randomToken();
  run('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)', hmac(token), userId, nowIso(now), nowIso(now));
  return token;
}

export function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', hmac(token));
  res.clearCookie(COOKIE, { path: '/' });
}

/** Sesión válida y no inactiva (cierre automático tras N minutos sin uso). */
export function sessionUser(req, now = new Date()) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const hash = hmac(token);
  const row = get(
    `SELECT u.id, u.email, u.name, u.role, u.active, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    hash,
  );
  if (!row || !row.active) return null;
  const idle = Number(getSettings().session_idle_minutes || 30) * 60000;
  if (now.getTime() - Date.parse(row.last_seen_at) > idle) {
    run('DELETE FROM sessions WHERE token_hash = ?', hash);
    return null;
  }
  if (now.getTime() - Date.parse(row.last_seen_at) > 30_000) run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', nowIso(now), hash);
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Tu sesión terminó. Vuelve a ingresar.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  next();
}

/** Protección CSRF: el panel manda este encabezado en todo lo que modifica datos. */
export function requireCsrfHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('x-requested-with') === 'streamcrm') return next();
  res.status(403).json({ error: 'Solicitud rechazada' });
}

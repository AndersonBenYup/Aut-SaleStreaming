import { createPublicKey, verify as edVerify } from 'node:crypto';
import { get } from './db.js';
import { config } from './config.js';
import { getSetting } from './settings.js';
import { LICENSE_PUBLIC_KEY } from './license-public-key.js';

export const FEATURES = ['ai_calls', 'whatsapp', 'multiuser', 'branding'];
export const DEMO = { days: 14, maxSubscriptions: 20, maxUsers: 2 };
const DAY = 86400_000;

let publicKeyPem = LICENSE_PUBLIC_KEY;
/** Solo para las pruebas automáticas (firman con una clave propia). */
export const setLicensePublicKey = (pem) => {
  publicKeyPem = pem;
};

/**
 * Licencia = base64url(JSON) + "." + base64url(firma Ed25519 del primer tramo).
 * Se verifica sin internet: la app solo trae la clave pública.
 */
export function parseLicense(text) {
  const clean = String(text ?? '').replace(/\s+/g, '').replace(/^STREAMCRM-/, '');
  const [body, sig] = clean.split('.');
  if (!body || !sig) return { ok: false, error: 'Formato de licencia inválido' };
  let valid = false;
  try {
    valid = edVerify(null, Buffer.from(body), createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: 'La firma de la licencia no es válida' };
  let lic;
  try {
    lic = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'Contenido de licencia ilegible' };
  }
  if (!lic.licenseId || !['perpetua', 'anual'].includes(lic.type)) return { ok: false, error: 'Licencia incompleta' };
  if (lic.type === 'anual' && !lic.expiresAt) return { ok: false, error: 'La licencia anual no tiene fecha de vencimiento' };
  return { ok: true, license: lic };
}

const contact = () => `${config.vendor.name} (WhatsApp ${config.vendor.whatsapp}${config.vendor.email ? ` · ${config.vendor.email}` : ''})`;

/**
 * Estado efectivo de la licencia:
 *  - active=false → solo lectura y sin envío de recordatorios.
 *  - perpetua: siempre activa; updatesAllowed=false después de supportUntil.
 */
export function licenseStatus(now = new Date()) {
  const usersCount = get('SELECT COUNT(*) n FROM users WHERE active = 1')?.n ?? 0;
  const key = getSetting('license_key');
  if (key) {
    const r = parseLicense(key);
    if (!r.ok) {
      return base({ mode: 'invalida', active: false, message: `La licencia guardada no es válida. Escribe a ${contact()}.` });
    }
    const l = r.license;
    const expiresAt = l.type === 'anual' ? new Date(l.expiresAt) : null;
    const supportUntil = l.supportUntil ? new Date(l.supportUntil) : null;
    const active = l.type === 'perpetua' || expiresAt > now;
    const features = Array.isArray(l.features) ? l.features : [];
    const multi = features.includes('multiuser');
    return base({
      mode: l.type,
      active,
      licenseId: l.licenseId,
      businessName: l.businessName ?? '',
      expiresAt: expiresAt?.toISOString() ?? null,
      daysLeft: expiresAt ? Math.ceil((expiresAt - now) / DAY) : null,
      supportUntil: supportUntil?.toISOString() ?? null,
      updatesAllowed: !supportUntil || supportUntil > now,
      features,
      maxSubscriptions: l.maxSubscriptions ?? null,
      maxUsers: l.maxUsers ?? (multi ? 10 : 1),
      message: active ? '' : `Tu licencia venció. El sistema está en solo lectura y no envía recordatorios. Renueva tu licencia con ${contact()}.`,
    });
  }
  const started = getSetting('demo_started_at');
  const expiresAt = new Date((started ? Date.parse(started) : now.getTime()) + DEMO.days * DAY);
  const active = expiresAt > now;
  return base({
    mode: 'demo',
    active,
    expiresAt: expiresAt.toISOString(),
    daysLeft: Math.ceil((expiresAt - now) / DAY),
    features: [],
    maxSubscriptions: DEMO.maxSubscriptions,
    maxUsers: DEMO.maxUsers,
    message: active
      ? `Modo demo: quedan ${Math.ceil((expiresAt - now) / DAY)} días, hasta ${DEMO.maxSubscriptions} suscripciones y los avisos son simulados. Activa tu licencia con ${contact()}.`
      : `La demo terminó. El sistema está en solo lectura. Activa tu licencia con ${contact()}.`,
  });

  function base(s) {
    return {
      licenseId: null, businessName: '', expiresAt: null, daysLeft: null, supportUntil: null, updatesAllowed: true,
      features: [], maxSubscriptions: null, maxUsers: 1, ...s,
      readOnly: !s.active,
      canSend: s.active,
      usersCount,
      vendor: config.vendor,
    };
  }
}

export const hasFeature = (status, f) => status.features.includes(f);

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { getSettings, setSettings } from './settings.js';
import { HttpError } from './http.js';

// Solo imágenes rasterizadas: un SVG subido podría llevar scripts.
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 1024 * 1024;

const logoFile = () => path.join(config.brandingDir, 'logo');

export function saveLogo(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw new HttpError(400, 'El logo debe ser una imagen PNG, JPG o WEBP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw new HttpError(400, 'El logo no debe pasar de 1 MB');
  fs.writeFileSync(logoFile(), buf);
  setSettings({ has_logo: m[1] });
}

export function removeLogo() {
  fs.rmSync(logoFile(), { force: true });
  setSettings({ has_logo: '' });
}

export function logo() {
  const type = getSettings().has_logo;
  if (!type || !TYPES[type] || !fs.existsSync(logoFile())) return null;
  return { type, file: logoFile() };
}

/** Favicon SVG generado con la inicial y el color del negocio. */
export function faviconSvg() {
  const s = getSettings();
  const color = /^#[0-9a-f]{6}$/i.test(s.primary_color) ? s.primary_color : '#7c3aed';
  const letter = (s.panel_name || s.business_name || 'S').trim().charAt(0).toUpperCase().replace(/[<>&"']/g, '') || 'S';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
}

/**
 * Valores de branding.json (entrega personalizada por el vendedor) que se aplican en el primer uso.
 * { "businessName", "panelName", "primaryColor", "logo": "ruta/relativa.png", "vendor": {...} }
 */
export function brandingDefaults() {
  const b = config.branding;
  return {
    business_name: b.businessName,
    panel_name: b.panelName,
    primary_color: b.primaryColor,
    contact_whatsapp: b.contactWhatsapp,
    country: b.country,
    timezone: b.timezone,
    currency: b.currency,
  };
}

export function applyBrandingLogo() {
  const rel = config.branding.logo;
  if (!rel) return;
  const file = path.resolve(ROOT, rel);
  const ext = path.extname(file).toLowerCase();
  const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
  if (!type || !fs.existsSync(file)) return;
  fs.copyFileSync(file, logoFile());
  setSettings({ has_logo: type });
}

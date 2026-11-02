// Normalización a E.164 sin dependencias. Cubre los países donde se vende el sistema;
// para otros, el número debe escribirse con +código.
export const COUNTRIES = {
  PE: { name: 'Perú', code: '51', national: [9], tz: 'America/Lima', currency: 'S/' },
  MX: { name: 'México', code: '52', national: [10], tz: 'America/Mexico_City', currency: 'MXN $' },
  CO: { name: 'Colombia', code: '57', national: [10], tz: 'America/Bogota', currency: 'COP $' },
  CL: { name: 'Chile', code: '56', national: [9], tz: 'America/Santiago', currency: 'CLP $' },
  EC: { name: 'Ecuador', code: '593', national: [9], tz: 'America/Guayaquil', currency: 'US$' },
  BO: { name: 'Bolivia', code: '591', national: [8], tz: 'America/La_Paz', currency: 'Bs' },
  AR: { name: 'Argentina', code: '54', national: [10], tz: 'America/Argentina/Buenos_Aires', currency: 'ARS $' },
  VE: { name: 'Venezuela', code: '58', national: [10], tz: 'America/Caracas', currency: 'US$' },
  PY: { name: 'Paraguay', code: '595', national: [9], tz: 'America/Asuncion', currency: '₲' },
  UY: { name: 'Uruguay', code: '598', national: [8], tz: 'America/Montevideo', currency: 'UYU $' },
  US: { name: 'Estados Unidos', code: '1', national: [10], tz: 'America/New_York', currency: 'US$' },
  ES: { name: 'España', code: '34', national: [9], tz: 'Europe/Madrid', currency: '€' },
};

/**
 * Devuelve el teléfono en formato E.164 (+51987654321) o null si no es válido.
 * Sin código de país se asume el del negocio.
 */
export function normalizePhone(raw, country = 'PE') {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  text = text.replace(/^00/, '+');
  const intl = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (intl) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;

  const c = COUNTRIES[country] ?? COUNTRIES.PE;
  digits = digits.replace(/^0+/, ''); // prefijo troncal local
  if (c.national.includes(digits.length)) return `+${c.code}${digits}`;
  if (digits.startsWith(c.code) && c.national.includes(digits.length - c.code.length)) return `+${digits}`;
  return null;
}

/** Para enlaces wa.me (sin +). */
export const waNumber = (e164) => String(e164 ?? '').replace(/\D/g, '');

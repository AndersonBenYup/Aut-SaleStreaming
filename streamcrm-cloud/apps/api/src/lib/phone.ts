import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normaliza a E.164. Si el número llega sin código de país se asume el país del tenant (+51 para PE).
 * Devuelve null si no es un número válido.
 */
export function normalizePhone(raw: unknown, country = 'PE'): string | null {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  // Números largos guardados como número en la hoja (p. ej. 51987654321) o con prefijo 00.
  text = text.replace(/^00/, '+');
  const digits = text.replace(/\D/g, '');
  if (!text.startsWith('+') && digits.length > 9) {
    const intl = parsePhoneNumberFromString('+' + digits);
    if (intl?.isValid()) return intl.number;
  }
  const parsed = parsePhoneNumberFromString(text, country as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

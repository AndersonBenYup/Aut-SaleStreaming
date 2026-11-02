import type { RenewalIntent } from './enums.js';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NO = [/\bya no\b/, /\bcancel/, /\bno (quiero|deseo|voy|renuevo|gracias|me interesa)\b/, /^no\b/, /\bno$/, /\bbaja\b/];
const THINK = [/\bpensando\b/, /\bpens(ar|arlo|are)\b/, /\bdespues\b/, /\bluego\b/, /\bmas tarde\b/, /\bno se\b/, /\btal vez\b/, /\bquizas?\b/];
const YES = [/\brenuev/, /\brenueva\b/, /^si\b/, /\bsi\b/, /\bconfirm/, /\bpag(o|a|are|ar)\b/, /\bclaro\b/, /\bdale\b/, /\bok\b/, /\bde acuerdo\b/];

/**
 * Interpreta la intención de renovación desde el enum de Retell o texto libre (WhatsApp).
 * Orden: "ya no" > "pensando" > "no" > "sí", porque frases como "no sé" o "ya no pago"
 * contienen palabras que por sí solas parecen afirmativas o negativas.
 */
export function interpretIntent(raw: unknown): RenewalIntent | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw ? 'renueva' : 'no_renueva';
  const text = normalize(String(raw));
  if (!text) return null;
  if (text === 'renueva' || text === 'no_renueva' || text === 'pensando' || text === 'sin_respuesta') return text;
  if (/\bya no\b/.test(text)) return 'no_renueva';
  if (THINK.some((r) => r.test(text))) return 'pensando';
  if (NO.some((r) => r.test(text))) return 'no_renueva';
  if (YES.some((r) => r.test(text))) return 'renueva';
  return null;
}

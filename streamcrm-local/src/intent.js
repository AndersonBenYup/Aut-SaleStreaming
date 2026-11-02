export const RENEWAL_INTENTS = ['renueva', 'no_renueva', 'pensando', 'sin_respuesta'];

/** Motivos de desconexión de Retell que significan "no contestó": se reintenta. */
export const RETRYABLE_DISCONNECTIONS = [
  'dial_no_answer',
  'dial_busy',
  'dial_failed',
  'voicemail_reached',
  'user_declined',
  'invalid_destination',
  'error_no_audio_received',
];

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NO = [/\bcancel/, /\bno (quiero|deseo|voy|renuevo|gracias|me interesa)\b/, /^no\b/, /\bno$/, /\bbaja\b/];
const THINK = [/\bpensando\b/, /\bpens(ar|arlo|are)\b/, /\bdespues\b/, /\bluego\b/, /\bmas tarde\b/, /\bno se\b/, /\btal vez\b/, /\bquizas?\b/];
const YES = [/\brenuev/, /^si\b/, /\bsi\b/, /\bconfirm/, /\bpag(o|a|are|ar)\b/, /\bclaro\b/, /\bdale\b/, /\bok\b/, /\bde acuerdo\b/];

/**
 * Interpreta la intención de renovación desde el enum de Retell o texto libre.
 * Orden: "ya no" > "pensando" > "no" > "sí", porque frases como "no sé" o "ya no pago"
 * contienen palabras que por sí solas parecen afirmativas o negativas.
 */
export function interpretIntent(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw ? 'renueva' : 'no_renueva';
  const text = normalize(String(raw));
  if (!text) return null;
  if (RENEWAL_INTENTS.includes(text)) return text;
  if (/\bya no\b/.test(text)) return 'no_renueva';
  if (THINK.some((r) => r.test(text))) return 'pensando';
  if (NO.some((r) => r.test(text))) return 'no_renueva';
  if (YES.some((r) => r.test(text))) return 'renueva';
  return null;
}

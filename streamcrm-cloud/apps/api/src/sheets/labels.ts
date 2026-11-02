import { DateTime } from 'luxon';
import type { RenewalIntent } from '@streamcrm/shared';

export const INTENT_LABEL: Record<RenewalIntent, string> = {
  renueva: 'Renueva',
  no_renueva: 'No renueva',
  pensando: 'Lo está pensando',
  sin_respuesta: 'Sin respuesta',
};

const CHANNEL_LABEL: Record<string, string> = {
  retell: 'llamada IA',
  whatsapp: 'WhatsApp',
  console: 'consola',
  manual: 'manual',
};

export const localDateTime = (d: Date | null | undefined, tz: string) =>
  d ? DateTime.fromJSDate(d).setZone(tz).toFormat('dd/MM/yyyy HH:mm') : '';

export function reminderLabel(
  s: { reminderStatus: string; reminderAt: Date | null; reminderAttempts: number; reminderChannelUsed: string | null },
  tz: string,
): string {
  const channel = CHANNEL_LABEL[s.reminderChannelUsed ?? ''] ?? s.reminderChannelUsed ?? '';
  switch (s.reminderStatus) {
    case 'pendiente':
      if (!s.reminderAt) return 'Sin aviso automático';
      return s.reminderAttempts > 0
        ? `Reintento ${s.reminderAttempts + 1} el ${localDateTime(s.reminderAt, tz)}`
        : `Programado ${localDateTime(s.reminderAt, tz)}`;
    case 'enviando':
      return 'Enviando…';
    case 'enviado':
      return `Enviado por ${channel}`;
    case 'respondido':
      return `Respondió (${channel})`;
    case 'fallido':
      return s.reminderChannelUsed === 'manual'
        ? 'Avisar manualmente'
        : `Sin respuesta tras ${s.reminderAttempts} intento${s.reminderAttempts === 1 ? '' : 's'}`;
    default:
      return s.reminderStatus;
  }
}

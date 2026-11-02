import type { EventRow, Intent, PaymentMethod, SubStatus } from './types';

const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
export const fmtMoney = (n: number | string | null | undefined) => money.format(Number(n ?? 0));

/** "2026-10-30" → "30 oct 2026" (sin desfase por zona horaria). */
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const fmtDateTime = (iso: string | null | undefined, timeZone?: string) =>
  iso
    ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone })
    : '—';

export function fmtRelative(iso: string | null | undefined) {
  if (!iso) return 'nunca';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  return `hace ${Math.round(diff / 86400)} días`;
}

export function fmtDaysLeft(days: number) {
  if (days === 0) return 'vence hoy';
  if (days === 1) return 'vence mañana';
  if (days > 0) return `en ${days} días`;
  if (days === -1) return 'venció ayer';
  return `venció hace ${-days} días`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const STATUS_LABEL: Record<SubStatus, string> = {
  activa: 'Activa',
  por_vencer: 'Por vencer',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
};

export const INTENT_LABEL: Record<Intent, string> = {
  renueva: 'Renueva',
  no_renueva: 'No renueva',
  pensando: 'Lo está pensando',
  sin_respuesta: 'Sin respuesta',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  yape: 'Yape',
  plin: 'Plin',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
};

export const CHANNEL_LABEL: Record<string, string> = {
  retell: 'Llamada IA',
  whatsapp: 'WhatsApp',
  console: 'Consola (prueba)',
  manual: 'Manual',
};

export const ROLE_LABEL: Record<string, string> = { superadmin: 'Super-admin', owner: 'Dueño', staff: 'Vendedor' };

/** Texto en español para cada evento del historial. */
export function eventText(e: EventRow): string {
  const d = (e.data ?? {}) as Record<string, any>;
  switch (e.type) {
    case 'subscription.created':
      return `Venta nueva: ${d.customer ?? ''} · ${d.service ?? ''}`;
    case 'subscription.renewed':
      return `Renovó hasta el ${fmtDate(d.to)} · ${fmtMoney(d.amount)} (${METHOD_LABEL[d.method as PaymentMethod] ?? d.method})`;
    case 'subscription.intent':
      return `Respuesta del cliente: ${INTENT_LABEL[d.intent as Intent] ?? d.intent}`;
    case 'subscription.intent_manual':
      return `Respuesta registrada a mano: ${INTENT_LABEL[d.intent as Intent] ?? d.intent}`;
    case 'subscription.canceled':
      return 'Suscripción cancelada';
    case 'reminder.sent':
      return `Aviso enviado por ${CHANNEL_LABEL[d.channel] ?? d.channel} (intento ${d.attempt})`;
    case 'reminder.retry':
      return `No contestó: se reintenta el ${fmtDateTime(d.at)}`;
    case 'reminder.failed':
      return `Sin respuesta tras ${d.attempts} intentos`;
    case 'reminder.manual':
      return 'Aviso reprogramado para ahora';
    case 'sheet.scan':
      return `Hoja leída: ${d.imported ?? 0} filas nuevas en el sistema, ${d.updatedFromSheet ?? 0} actualizadas desde la hoja`;
    case 'sheet.connected':
      return 'Hoja de Google conectada';
    case 'sheet.disconnected':
      return 'Hoja desconectada';
    case 'sheet.row_missing':
      return 'Una fila ya no está en la hoja (se borró)';
    case 'settings.updated':
      return 'Ajustes actualizados';
    case 'team.user_added':
      return `Usuario agregado: ${d.email}`;
    case 'team.user_updated':
      return `Usuario modificado: ${d.email}`;
    case 'account.password_viewed':
      return 'Se vio la contraseña de una cuenta';
    case 'customer.updated':
      return 'Datos de cliente actualizados';
    case 'tenant.signup':
      return 'Negocio registrado';
    case 'admin.switch_tenant':
      return 'Soporte entró al negocio';
    default:
      return e.type;
  }
}

/** Enlace de WhatsApp con el mensaje de recordatorio ya escrito. */
export function whatsappLink(phone: string | null, text: string) {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

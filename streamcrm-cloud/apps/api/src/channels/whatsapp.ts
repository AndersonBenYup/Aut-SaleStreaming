import type { ReminderChannel } from './types.js';

export const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

/** WhatsApp Cloud API con la plantilla aprobada (5 parámetros: cliente, servicio, fecha, precio, negocio). */
export const whatsappChannel: ReminderChannel = {
  name: 'whatsapp',
  async send(p, cfg) {
    if (!cfg.whatsappPhoneNumberId || !cfg.whatsappToken) throw new Error('WhatsApp no está configurado para este negocio');
    const res = await fetch(`${WHATSAPP_API}/${cfg.whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: p.toNumber.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: cfg.whatsappTemplate ?? 'recordatorio_renovacion',
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [p.customerName, p.serviceName, p.endDateWords, `S/ ${p.price}`, p.businessName].map((text) => ({
                type: 'text',
                text,
              })),
            },
          ],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { externalId: body.messages?.[0]?.id ?? '' };
  },
};

export interface WhatsappCredentials {
  phoneNumberId: string;
  token: string;
}

/** Mensaje de texto libre (solo dentro de las 24 h desde el último mensaje del cliente). */
export async function sendWhatsappText(cred: WhatsappCredentials, to: string, text: string) {
  const res = await fetch(`${WHATSAPP_API}/${cred.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'text',
      text: { body: text.slice(0, 4096), preview_url: false },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`WhatsApp respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { messages?: { id: string }[] };
  return { externalId: body.messages?.[0]?.id ?? '' };
}

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type ImageMediaType = (typeof IMAGE_TYPES)[number];

/** Descarga una imagen que mandó el cliente (p. ej. la captura de Yape). Devuelve base64. */
export async function downloadWhatsappImage(cred: WhatsappCredentials, mediaId: string) {
  const auth = { Authorization: `Bearer ${cred.token}` };
  const meta = await fetch(`${WHATSAPP_API}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(20_000) });
  if (!meta.ok) throw new Error(`WhatsApp (media) respondió ${meta.status}`);
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  const mediaType = (info.mime_type ?? '').split(';')[0]!.trim() as ImageMediaType;
  if (!info.url || !IMAGE_TYPES.includes(mediaType)) throw new Error(`Imagen no soportada: ${info.mime_type}`);
  if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error('Imagen demasiado grande');
  const file = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
  if (!file.ok) throw new Error(`WhatsApp (descarga) respondió ${file.status}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error('Imagen demasiado grande');
  return { mediaType, data: bytes.toString('base64') };
}

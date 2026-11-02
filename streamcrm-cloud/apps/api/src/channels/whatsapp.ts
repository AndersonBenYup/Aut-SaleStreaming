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

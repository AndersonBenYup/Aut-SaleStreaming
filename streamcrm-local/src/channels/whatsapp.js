export const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

/** WhatsApp Cloud API con la plantilla aprobada (5 parámetros: cliente, servicio, fecha, precio, negocio). */
export async function sendWhatsappTemplate(p, cfg) {
  if (!cfg.phoneNumberId || !cfg.token) throw new Error('WhatsApp no está configurado (phone_number_id y token)');
  const res = await fetch(`${WHATSAPP_API}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: p.toNumber.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: cfg.template || 'recordatorio_renovacion',
        language: { code: cfg.language || 'es' },
        components: [
          {
            type: 'body',
            parameters: [p.customerName, p.serviceName, p.endDateWords, `${p.currency} ${p.price}`, p.businessName].map((text) => ({
              type: 'text',
              text: String(text),
            })),
          },
        ],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return { externalId: body.messages?.[0]?.id ?? '' };
}

import { randomBytes } from 'node:crypto';
import { getSetting } from '../settings.js';
import { createRetellCall } from './retell.js';
import { sendWhatsappTemplate } from './whatsapp.js';

export const retellConfig = () => ({
  apiKey: getSetting('retell_api_key'),
  agentId: getSetting('retell_agent_id'),
  fromNumber: getSetting('retell_from_number'),
});

export const whatsappConfig = () => ({
  phoneNumberId: getSetting('whatsapp_phone_number_id'),
  token: getSetting('whatsapp_token'),
  template: getSetting('whatsapp_template'),
  language: getSetting('whatsapp_language'),
});

/** Canales de envío. Las pruebas reemplazan `fetch`, no estos objetos. */
export const channels = {
  retell: { send: (p) => createRetellCall(p, retellConfig()) },
  whatsapp: { send: (p) => sendWhatsappTemplate(p, whatsappConfig()) },
  // Demo y pruebas: no sale nada, solo se imprime.
  console: {
    async send(p) {
      console.log(`📞 [simulado] ${p.customerName} ${p.toNumber}: ${p.serviceName} vence el ${p.endDateWords} (${p.currency} ${p.price})`);
      return { externalId: `sim-${randomBytes(6).toString('hex')}` };
    },
  },
};

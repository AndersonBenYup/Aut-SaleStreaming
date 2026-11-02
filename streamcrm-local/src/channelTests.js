import { createRetellCall } from './channels/retell.js';
import { sendWhatsappTemplate } from './channels/whatsapp.js';
import { addDays, dateInWords, todayIn } from './dates.js';
import { HttpError } from './http.js';
import { normalizePhone } from './phone.js';
import { getSettings } from './settings.js';

function samplePayload(phone, s) {
  const to = normalizePhone(phone, s.country);
  if (!to) throw new HttpError(400, 'Escribe un número válido para la prueba');
  const end = addDays(todayIn(s.timezone), 2);
  return {
    subscriptionId: null,
    businessName: s.business_name,
    customerName: 'Prueba',
    toNumber: to,
    serviceName: 'Netflix 1 perfil',
    profileName: 'Prueba',
    endDate: end,
    endDateWords: dateInWords(end),
    daysLeft: 2,
    price: '15.00',
    currency: s.currency,
  };
}

/** "Probar llamada a mi número": usa las claves del formulario (o las guardadas). */
export async function testCall(phone, cfg, s = getSettings()) {
  try {
    return await createRetellCall(samplePayload(phone, s), cfg);
  } catch (err) {
    throw err instanceof HttpError ? err : new HttpError(502, err.message);
  }
}

export async function testWhatsapp(phone, cfg, s = getSettings()) {
  try {
    return await sendWhatsappTemplate(samplePayload(phone, s), cfg);
  } catch (err) {
    throw err instanceof HttpError ? err : new HttpError(502, err.message);
  }
}

/**
 * LokiStream · envío por WhatsApp Cloud API (opcional).
 * Si no configuraste WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en las Propiedades del script, no se envía nada
 * y el pedido queda con un enlace wa.me listo para que lo mandes con un clic.
 * Nota: un mensaje de texto libre solo llega si el cliente te escribió en las últimas 24 h
 * (es el caso normal: el pedido entra por WhatsApp).
 */
function sendWhatsAppText_(phone, text) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(PROP.WA_TOKEN);
  var phoneId = props.getProperty(PROP.WA_PHONE_ID);
  if (!token || !phoneId) return { ok: false, reason: 'WhatsApp automático no configurado: envía el mensaje con el ENLACE WHATSAPP.' };
  try {
    var res = UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + phoneId + '/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    return { ok: false, reason: 'WhatsApp respondió ' + code + ': ' + res.getContentText().slice(0, 200) + '. Envía con el ENLACE WHATSAPP.' };
  } catch (err) {
    return { ok: false, reason: 'No se pudo conectar con WhatsApp (' + err.message + '). Envía con el ENLACE WHATSAPP.' };
  }
}

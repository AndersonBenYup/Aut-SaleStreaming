/**
 * LokiStream · la "API" de la hoja, publicada como aplicación web.
 *   GET  ?action=catalog  → catálogo para la web (con caché de 5 minutos)
 *   POST {type:'order',…} → registra un pedido en PEDIDOS
 */

var CATALOG_CACHE_KEY = 'catalog:v1';

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'catalog';
  if (action === 'catalog') return json_(getPublicCatalog_());
  if (action === 'ping') return json_({ ok: true, at: new Date().toISOString() });
  return json_({ ok: false, error: 'Acción desconocida' });
}

function getCatalog_() {
  return buildCatalog(readTables_(CATALOG_TABS));
}

function getPublicCatalog_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CATALOG_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  var catalog = getCatalog_();
  var body = publicCatalog(catalog, new Date().toISOString());
  var text = JSON.stringify(body);
  if (text.length < 95000) cache.put(CATALOG_CACHE_KEY, text, 300);
  return body;
}

function clearCatalogCache_() {
  CacheService.getScriptCache().remove(CATALOG_CACHE_KEY);
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }
  if (payload.type === 'order') return json_(receiveOrder_(payload));
  return json_({ ok: false, error: 'Tipo desconocido' });
}

function receiveOrder_(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'Ocupado, intenta de nuevo' };
  try {
    var catalog = getCatalog_();
    var settings = catalog.settings;
    var res = priceOrder(payload, catalog, settings['CODIGO PAIS']);
    if (!res.ok) {
      if (res.error !== 'spam') log_('Pedido rechazado', toText(payload && payload.id), res.error);
      return { ok: false, error: res.error };
    }
    var order = res.order;

    // Idempotente: si la web reintenta, no se duplica.
    var existing = tableToObjects(values_(TABS.PEDIDOS), FIELDS.PEDIDOS, 3).rows.filter(function (r) {
      return toText(r.id) === order.id;
    });
    if (existing.length) return { ok: true, id: order.id, duplicate: true };

    // Freno simple contra abuso: pedidos por teléfono en la última hora.
    var limit = Number(settings['PEDIDOS POR HORA POR TELEFONO']) || 5;
    var cache = CacheService.getScriptCache();
    var key = 'rate:' + order.phone;
    var count = Number(cache.get(key) || 0);
    if (count >= limit) return { ok: false, error: 'Demasiados pedidos seguidos, escríbenos por WhatsApp' };
    cache.put(key, String(count + 1), 3600);

    appendByFields_(TABS.PEDIDOS, FIELDS.PEDIDOS, {
      id: order.id,
      date: new Date(),
      customer: order.name,
      phone: order.phone,
      detail: orderDetail(order),
      total: order.total,
      status: ORDER_STATUS.NUEVO,
      consent: order.consent ? 'SI' : 'NO',
      items: JSON.stringify(order.lines),
    });
    log_('Pedido recibido', order.id, order.name + ' · ' + formatPEN(order.total));
    return { ok: true, id: order.id, total: order.total };
  } catch (err) {
    log_('Error al recibir pedido', toText(payload && payload.id), err && err.message);
    return { ok: false, error: 'Error interno' };
  } finally {
    lock.releaseLock();
  }
}

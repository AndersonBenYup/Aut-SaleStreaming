/**
 * LokiStream · pedidos que llegan desde la web.
 * El navegador manda QUÉ quiere (plataforma, plan, perfiles o un pack), nunca el precio:
 * el precio se calcula aquí con la hoja.
 */

var ORDER_ID_RE = /^LK-[A-Z0-9]{4,10}$/;

/**
 * Valida y cotiza un pedido. Devuelve { ok, error?, order? }.
 * order = { id, name, phone, consent, lines: [{ kind, platformId, platformName, planLabel, months, profiles, unitPrice, total, packId?, packName? }], total }
 */
function priceOrder(payload, catalog, countryCode) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Pedido vacío' };
  if (payload.website) return { ok: false, error: 'spam' }; // campo trampa para bots
  var id = toText(payload.id).toUpperCase();
  if (!ORDER_ID_RE.test(id)) return { ok: false, error: 'ID de pedido inválido' };
  var customer = payload.customer || {};
  var name = toText(customer.name).slice(0, 80);
  var phone = normalizePhone(customer.phone, countryCode);
  if (name.length < 2) return { ok: false, error: 'Falta el nombre' };
  if (!phone) return { ok: false, error: 'Teléfono inválido' };
  var items = Array.isArray(payload.items) ? payload.items.slice(0, 20) : [];
  if (!items.length) return { ok: false, error: 'El pedido no tiene productos' };

  var byId = {};
  catalog.platforms.forEach(function (p) { byId[p.id] = p; });
  var packsById = {};
  catalog.packs.forEach(function (p) { packsById[p.id] = p; });

  var lines = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    if (it.packId) {
      var pack = packsById[toText(it.packId)];
      if (!pack) return { ok: false, error: 'Pack desconocido: ' + it.packId };
      lines.push({ kind: 'pack', packId: pack.id, packName: pack.name, total: pack.price, profiles: 1, months: 1, platforms: pack.platforms.slice() });
      continue;
    }
    var p = byId[toText(it.platformId).toLowerCase()];
    if (!p) return { ok: false, error: 'Plataforma desconocida: ' + it.platformId };
    var plan = p.plans.filter(function (x) { return x.id === toText(it.planId); })[0];
    if (!plan) return { ok: false, error: 'Plan desconocido para ' + p.name };
    var profiles = Math.round(toNumber(it.profiles) || 1);
    if (profiles < 1 || profiles > 6) return { ok: false, error: 'Perfiles fuera de rango (1 a 6)' };
    lines.push({
      kind: 'platform',
      platformId: p.id,
      platformName: p.name,
      planId: plan.id,
      planLabel: plan.label,
      months: plan.months,
      profiles: profiles,
      unitPrice: plan.price,
      total: round2(plan.price * profiles),
    });
  }
  var total = round2(lines.reduce(function (s, l) { return s + l.total; }, 0));
  return { ok: true, order: { id: id, name: name, phone: phone, consent: payload.consent === true, lines: lines, total: total } };
}

/** Texto legible para la columna DETALLE. */
function orderDetail(order) {
  return order.lines
    .map(function (l) {
      if (l.kind === 'pack') return l.packName + ' (1 mes) – ' + formatPEN(l.total);
      return l.platformName + ' – ' + l.profiles + (l.profiles === 1 ? ' perfil' : ' perfiles') + ' × ' + l.planLabel + ' – ' + formatPEN(l.total);
    })
    .join('\n');
}

/**
 * Convierte las líneas del pedido en perfiles a entregar: un pack se abre en una plataforma por perfil.
 * El precio del pack se reparte en partes iguales para que la GANANCIA de VENTAS cuadre.
 */
function expandOrderLines(order, catalog) {
  var byId = {};
  catalog.platforms.forEach(function (p) { byId[p.id] = p; });
  var out = [];
  order.lines.forEach(function (l) {
    if (l.kind === 'pack') {
      var share = round2(l.total / l.platforms.length);
      l.platforms.forEach(function (pid) {
        var p = byId[pid];
        out.push({ platformId: pid, platformName: p ? p.name : pid, months: 1, planLabel: '1 mes', unitPrice: share, profiles: 1, pack: l.packName });
      });
    } else {
      out.push({ platformId: l.platformId, platformName: l.platformName, months: l.months, planLabel: l.planLabel, unitPrice: l.unitPrice, profiles: l.profiles });
    }
  });
  return out;
}

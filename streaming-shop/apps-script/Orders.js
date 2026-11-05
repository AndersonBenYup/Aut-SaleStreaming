/**
 * LokiStream · pedidos que llegan desde la web.
 * El navegador manda QUÉ quiere (plataforma, plan, perfiles o un pack), nunca el precio:
 * el precio se calcula aquí con la hoja.
 */

var ORDER_ID_RE = /^LK-[A-Z0-9]{4,10}$/;

/**
 * Precio acordado por el vendedor de WhatsApp: solo se acepta si viene con la clave del bot
 * y queda entre el PRECIO MINIMO y el precio de lista. Sin precio acordado se cobra el de lista.
 */
function agreedPrice(item, list, min, trusted) {
  if (!trusted || item.price === undefined || item.price === null || item.price === '') return { ok: true, price: list };
  var p = toNumber(item.price);
  if (p === null || isNaN(p)) return { ok: false, error: 'Precio acordado inválido' };
  p = round2(p);
  if (p < min || p > list) return { ok: false, error: 'Precio acordado fuera de rango' };
  return { ok: true, price: p };
}

/**
 * Valida y cotiza un pedido. Devuelve { ok, error?, order? }.
 * opts.trusted: viene del vendedor de WhatsApp (clave BOT_API_KEY) y puede traer un precio acordado por ítem.
 * order = { id, name, phone, consent, lines: [{ kind, platformId, platformName, planLabel, months, profiles, unitPrice, total, packId?, packName? }], total }
 */
function priceOrder(payload, catalog, countryCode, opts) {
  var trusted = !!(opts && opts.trusted);
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
      var packPrice = agreedPrice(it, pack.price, pack.minPrice === undefined ? pack.price : pack.minPrice, trusted);
      if (!packPrice.ok) return packPrice;
      lines.push({ kind: 'pack', packId: pack.id, packName: pack.name, total: packPrice.price, profiles: 1, months: 1, platforms: pack.platforms.slice() });
      continue;
    }
    var p = byId[toText(it.platformId).toLowerCase()];
    if (!p) return { ok: false, error: 'Plataforma desconocida: ' + it.platformId };
    var plan = p.plans.filter(function (x) { return x.id === toText(it.planId); })[0];
    if (!plan) return { ok: false, error: 'Plan desconocido para ' + p.name };
    var profiles = Math.round(toNumber(it.profiles) || 1);
    if (profiles < 1 || profiles > 6) return { ok: false, error: 'Perfiles fuera de rango (1 a 6)' };
    var unit = agreedPrice(it, plan.price, plan.minPrice === undefined ? plan.price : plan.minPrice, trusted);
    if (!unit.ok) return unit;
    lines.push({
      kind: 'platform',
      platformId: p.id,
      platformName: p.name,
      planId: plan.id,
      planLabel: plan.label,
      months: plan.months,
      profiles: profiles,
      unitPrice: unit.price,
      total: round2(unit.price * profiles),
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

/** Texto para NOTAS con lo que se leyó del comprobante y si el monto coincide con el TOTAL del pedido. */
function paymentClaimSummary(claim, orderTotal) {
  var amount = toNumber(claim.amount);
  var amountText = amount === null
    ? 'monto no legible'
    : formatPEN(amount) + (orderTotal !== null && round2(amount) === round2(orderTotal) ? ' (coincide)' : ' (NO coincide con ' + formatPEN(orderTotal) + ')');
  return [
    'Comprobante ' + (toText(claim.method) || 'de pago'),
    amountText,
    claim.operation ? 'op. ' + toText(claim.operation).slice(0, 40) : '',
    claim.payer ? 'de ' + toText(claim.payer).slice(0, 60) : '',
  ].filter(Boolean).join(' · ');
}

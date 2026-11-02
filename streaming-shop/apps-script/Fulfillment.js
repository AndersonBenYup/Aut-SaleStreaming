/**
 * LokiStream · de "Pagado" a "Entregado".
 * Busca perfiles libres en CUENTAS, crea las filas en VENTAS (formato StreamCRM) y arma el mensaje con los accesos.
 * Todo lo de este archivo es puro: recibe datos y devuelve qué escribir.
 */

var INACTIVE_ACCOUNT = /^(VENCID|INACTIV|CAID|BLOQUE|SUSPEND|BAJA|NO USAR)/;
var INACTIVE_SALE = /^(CANCEL|ANULAD|DEVUELT|BAJA)/;

/** ¿El servicio escrito en la hoja ("NETFLIX", "Disney Plus") corresponde a esta plataforma? */
function serviceMatches(service, platform) {
  var s = normalizeName(service).replace(/ PLUS$/, '');
  if (!s) return false;
  var names = [platform.name, platform.id, platform.platformName, platform.platformId]
    .map(normalizeName)
    .filter(Boolean)
    .map(function (n) { return n.replace(/ PLUS$/, ''); });
  return names.some(function (n) {
    return n === s || n.indexOf(s + ' ') === 0 || s.indexOf(n + ' ') === 0;
  });
}

function profileNumber(label) {
  var m = toText(label).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * accounts: [{ _row, estado, servicio, correo, contrasena, perfiles, fecha_vencimiento, costo }] (filas de CUENTAS)
 * sales:    [{ correo, perfil, fecha_vencimiento, estado }] (filas de VENTAS)
 * lines:    salida de expandOrderLines()
 * Devuelve { ok, assignments: [{ line, account, profile, start, end, days }], missing: [{ platformName, count }] }
 * Es todo o nada: si falta un perfil, no se asigna ninguno.
 */
function allocateProfiles(lines, accounts, sales, today, daysPerMonth) {
  var dpm = daysPerMonth || 30;
  var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Perfiles ocupados por cuenta (ventas vigentes)
  var used = {};
  sales.forEach(function (s) {
    var email = toText(s.correo).toLowerCase();
    if (!email) return;
    if (INACTIVE_SALE.test(normalizeHeader(s.estado))) return;
    var end = parseDate(s.fecha_vencimiento);
    if (end && end < start) return;
    (used[email] = used[email] || []).push(profileNumber(s.perfil));
  });

  var pool = accounts
    .map(function (a) {
      var email = toText(a.correo).toLowerCase();
      var total = Math.round(toNumber(a.perfiles) || 0);
      return {
        row: a._row,
        email: email,
        password: toText(a.contrasena),
        service: toText(a.servicio),
        total: total,
        expires: parseDate(a.fecha_vencimiento),
        costPerProfile: toNumber(a.costo) !== null && total > 0 ? round2(toNumber(a.costo) / total) : null,
        active: !INACTIVE_ACCOUNT.test(normalizeHeader(a.estado)),
        taken: (used[email] || []).slice(),
      };
    })
    .filter(function (a) { return a.email && a.active && a.total > 0 && (!a.expires || a.expires >= start); });

  var assignments = [];
  var missingBy = {};

  lines.forEach(function (line) {
    var end = addDays(start, line.months * dpm);
    for (var k = 0; k < line.profiles; k++) {
      var candidates = pool
        .filter(function (a) { return serviceMatches(a.service, line) && a.taken.length < a.total; })
        .sort(function (a, b) {
          // 1) que la cuenta dure al menos lo que dura la venta, 2) llenar primero la más ocupada, 3) la que vence antes
          var ca = !a.expires || a.expires >= end ? 0 : 1;
          var cb = !b.expires || b.expires >= end ? 0 : 1;
          if (ca !== cb) return ca - cb;
          var fa = a.total - a.taken.length;
          var fb = b.total - b.taken.length;
          if (fa !== fb) return fa - fb;
          return (a.expires ? a.expires.getTime() : Infinity) - (b.expires ? b.expires.getTime() : Infinity);
        });
      var acc = candidates[0];
      if (!acc) {
        missingBy[line.platformName] = (missingBy[line.platformName] || 0) + 1;
        continue;
      }
      var n = 1;
      while (acc.taken.indexOf(n) > -1) n++;
      acc.taken.push(n);
      assignments.push({
        line: line,
        account: acc,
        profile: 'Perfil ' + n,
        start: start,
        end: end,
        days: line.months * dpm,
        accountEndsBefore: !!(acc.expires && acc.expires < end),
      });
    }
  });

  var missing = Object.keys(missingBy).map(function (k) { return { platformName: k, count: missingBy[k] }; });
  return { ok: missing.length === 0, assignments: missing.length ? [] : assignments, missing: missing };
}

/** Valores para una fila de VENTAS, por campo (se escriben en la columna que corresponda). */
function saleRowFields(assignment, order) {
  return {
    correo: assignment.account.email,
    contrasena: assignment.account.password,
    cliente: order.name,
    telefono: order.phone,
    servicio: assignment.line.platformName,
    perfil: assignment.profile,
    pin: '',
    fecha_inicio: assignment.start,
    dias: assignment.days,
    fecha_vencimiento: assignment.end,
    estado: 'ACTIVO',
    cuenta: assignment.account.service + ' · ' + assignment.account.email,
    costo: assignment.account.costPerProfile === null ? '' : assignment.account.costPerProfile,
    precio: assignment.line.unitPrice,
    acepta_llamadas: order.consent ? 'SI' : 'NO',
    pedido: order.id,
  };
}

function firstName(name) {
  return toText(name).split(/\s+/)[0] || '';
}

/** Mensaje de WhatsApp con los accesos de todo el pedido. */
function credentialsMessage(order, assignments, brand) {
  var blocks = assignments.map(function (a) {
    return [
      '*' + a.line.platformName + '* · ' + a.line.planLabel + ', vence el ' + formatDMY(a.end),
      'Correo: ' + a.account.email,
      'Contraseña: ' + a.account.password,
      'Perfil: ' + a.profile,
    ].join('\n');
  });
  return [
    'Hola ' + firstName(order.name) + ', tu pedido ' + order.id + ' está listo.',
    '',
    blocks.join('\n\n'),
    '',
    'Usa solo tu perfil y no cambies la contraseña. Si algo falla, escríbenos por aquí y lo resolvemos.',
    'Gracias por comprar en ' + (brand || 'LokiStream') + '.',
  ].join('\n');
}

/** Rehace las líneas del pedido a partir de la columna ITEMS (JSON guardado al recibirlo). */
function orderFromRow(row, countryCode) {
  var items = [];
  try {
    items = JSON.parse(toText(row.items) || '[]');
  } catch (e) {
    items = [];
  }
  return {
    id: toText(row.id),
    name: toText(row.customer),
    phone: normalizePhone(row.phone, countryCode),
    consent: toBool(row.consent, false),
    lines: items,
  };
}

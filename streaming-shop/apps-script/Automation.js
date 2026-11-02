/**
 * LokiStream · automatizaciones de la hoja.
 * - Al cambiar un pedido a "Pagado": asigna perfiles, crea las ventas y envía (o prepara) los accesos.
 * - Al editar el catálogo: la web ve el cambio en segundos (se borra la caché).
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LokiStream')
    .addItem('Procesar pedido de la fila seleccionada', 'procesarPedidoSeleccionado')
    .addItem('Revisar catálogo (errores)', 'revisarCatalogo')
    .addItem('Actualizar la web ahora', 'actualizarWebAhora')
    .addSeparator()
    .addItem('Instalar o reparar la hoja', 'instalarLokiStream')
    .addToUi();
}

/** Trigger instalable "al editar" (lo crea instalarLokiStream). */
function alEditarHoja(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var name = sh.getName();
  if (CATALOG_TABS.indexOf(name) > -1) {
    clearCatalogCache_();
    return;
  }
  if (name !== TABS.PEDIDOS) return;
  var header = detectHeaderRow(values_(TABS.PEDIDOS).slice(0, 10), FIELDS.PEDIDOS, 3);
  if (!header || header.columns.status === undefined) return;
  var statusCol = header.columns.status + 1;
  if (e.range.getColumn() > statusCol || e.range.getLastColumn() < statusCol) return;
  for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    if (r <= header.row + 1) continue;
    var value = sh.getRange(r, statusCol).getValue();
    if (normalizeHeader(value) === normalizeHeader(ORDER_STATUS.PAGADO)) procesarPedido_(r);
  }
}

function procesarPedidoSeleccionado() {
  var range = SpreadsheetApp.getActiveRange();
  if (!range || range.getSheet().getName() !== TABS.PEDIDOS) {
    SpreadsheetApp.getUi().alert('Selecciona una fila de la pestaña PEDIDOS.');
    return;
  }
  var result = procesarPedido_(range.getRow());
  SpreadsheetApp.getActive().toast(result, 'LokiStream', 8);
}

/** Procesa un pedido pagado. Devuelve un texto con el resultado (también queda en NOTAS y LOG). */
function procesarPedido_(rowNumber) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 'Otro proceso está usando la hoja, intenta de nuevo.';
  try {
    var rows = tableToObjects(values_(TABS.PEDIDOS), FIELDS.PEDIDOS, 3).rows;
    var row = rows.filter(function (r) { return r._row === rowNumber; })[0];
    if (!row) return 'Esa fila no es un pedido.';
    var status = normalizeHeader(row.status);
    if (status === normalizeHeader(ORDER_STATUS.ENTREGADO) || status === normalizeHeader(ORDER_STATUS.LISTO)) {
      return 'El pedido ' + row.id + ' ya fue procesado.';
    }

    var catalog = getCatalog_();
    var settings = catalog.settings;
    var order = orderFromRow(row, settings['CODIGO PAIS']);
    if (!order.lines.length) {
      setFields_(TABS.PEDIDOS, FIELDS.PEDIDOS, rowNumber, { status: ORDER_STATUS.ERROR, notes: 'La columna ITEMS está vacía o dañada: asigna los perfiles a mano.' });
      return 'Pedido sin ITEMS.';
    }
    if (!order.phone) {
      setFields_(TABS.PEDIDOS, FIELDS.PEDIDOS, rowNumber, { status: ORDER_STATUS.ERROR, notes: 'Teléfono inválido.' });
      return 'Teléfono inválido.';
    }

    var lines = expandOrderLines(order, catalog);
    var accounts = tableToObjects(values_(TABS.CUENTAS), FIELDS.CUENTAS, 3).rows;
    var sales = tableToObjects(values_(TABS.VENTAS), FIELDS.VENTAS, 3).rows;
    var plan = allocateProfiles(lines, accounts, sales, new Date(), Number(settings['DIAS POR MES']) || 30);

    if (!plan.ok) {
      var faltan = plan.missing.map(function (m) { return m.count + ' de ' + m.platformName; }).join(', ');
      setFields_(TABS.PEDIDOS, FIELDS.PEDIDOS, rowNumber, { status: ORDER_STATUS.SIN_STOCK, notes: 'Faltan perfiles libres: ' + faltan + '. Agrega cuentas en CUENTAS y vuelve a poner "Pagado".' });
      log_('Sin stock', order.id, faltan);
      return 'Sin stock: ' + faltan;
    }

    plan.assignments.forEach(function (a) {
      appendByFields_(TABS.VENTAS, FIELDS.VENTAS, saleRowFields(a, order), {
        dias_restantes: function (r, h) {
          return h.columns.fecha_vencimiento === undefined ? '' : '=' + columnLetter(h.columns.fecha_vencimiento) + r + '-TODAY()';
        },
        ganancia: function (r, h) {
          if (h.columns.precio === undefined || h.columns.costo === undefined) return '';
          return '=' + columnLetter(h.columns.precio) + r + '-' + columnLetter(h.columns.costo) + r;
        },
      });
    });

    var message = credentialsMessage(order, plan.assignments, settings.MARCA);
    var warnings = plan.assignments.filter(function (a) { return a.accountEndsBefore; }).map(function (a) {
      return a.account.email + ' vence antes que la venta';
    });
    var sent = sendWhatsAppText_(order.phone, message);
    setFields_(TABS.PEDIDOS, FIELDS.PEDIDOS, rowNumber, {
      status: sent.ok ? ORDER_STATUS.ENTREGADO : ORDER_STATUS.LISTO,
      message: message,
      link: sent.ok ? '' : waLink(order.phone, message),
      notes: [plan.assignments.length + ' perfil(es) creados en VENTAS.']
        .concat(sent.ok ? ['Accesos enviados por WhatsApp.'] : [sent.reason])
        .concat(warnings.length ? ['Atención: ' + warnings.join('; ')] : [])
        .join(' '),
    });
    log_('Pedido procesado', order.id, sent.ok ? 'entregado por WhatsApp' : 'listo para enviar');
    return sent.ok ? 'Pedido ' + order.id + ' entregado por WhatsApp.' : 'Pedido ' + order.id + ' listo: abre el ENLACE WHATSAPP para enviarlo.';
  } catch (err) {
    log_('Error al procesar', String(rowNumber), err && err.message);
    try {
      setFields_(TABS.PEDIDOS, FIELDS.PEDIDOS, rowNumber, { status: ORDER_STATUS.ERROR, notes: String(err && err.message) });
    } catch (e2) {}
    return 'Error: ' + (err && err.message);
  } finally {
    lock.releaseLock();
  }
}

function revisarCatalogo() {
  var catalog = getCatalog_();
  var ui = SpreadsheetApp.getUi();
  if (!catalog.errors.length) {
    ui.alert('Catálogo correcto: ' + catalog.platforms.length + ' plataformas, ' + catalog.packs.length + ' packs y ' + catalog.faq.length + ' preguntas publicadas.');
    return;
  }
  ui.alert('Filas con problemas (no se publican):\n\n' + catalog.errors.map(function (e) {
    return e.tab + ' fila ' + e.row + ': ' + e.error;
  }).join('\n'));
}

function actualizarWebAhora() {
  clearCatalogCache_();
  SpreadsheetApp.getActive().toast('Listo: la web mostrará los cambios en su próxima carga.', 'LokiStream', 5);
}

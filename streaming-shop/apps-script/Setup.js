/**
 * LokiStream · instalación.
 * Ejecuta instalarLokiStream() una vez (o desde el menú LokiStream). Es seguro repetirlo:
 * crea lo que falte, no borra tus datos y vuelve a crear el trigger.
 */

var TAB_COLORS = {
  AJUSTES: '#ff5a36', PLATAFORMAS: '#ff5a36', PLANES: '#ff5a36', PACKS: '#ff5a36', FAQ: '#ff5a36',
  PEDIDOS: '#25d366', VENTAS: '#1f6feb', CUENTAS: '#1f6feb', LOG: '#6b6b7b',
};

function instalarLokiStream() {
  var ss = ss_();
  var created = [];
  Object.keys(TABS).forEach(function (key) {
    var name = TABS[key];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      created.push(name);
    }
    if (sh.getLastRow() === 0) {
      var headers = HEADERS[key];
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#111116').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      var seed = typeof SEED !== 'undefined' ? SEED[key] : null;
      if (seed && seed.length) sh.getRange(2, 1, seed.length, headers.length).setValues(seed.map(function (r) {
        var line = r.slice(0, headers.length);
        while (line.length < headers.length) line.push('');
        return line;
      }));
      sh.autoResizeColumns(1, headers.length);
    }
    sh.setTabColor(TAB_COLORS[key] || null);
  });

  applyValidation_();

  // Trigger instalable: necesario para enviar WhatsApp y crear ventas al editar.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'alEditarHoja') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('alEditarHoja').forSpreadsheet(ss).onEdit().create();

  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);

  clearCatalogCache_();
  log_('Instalación', '', created.length ? 'Pestañas creadas: ' + created.join(', ') : 'Todo estaba creado; trigger reinstalado');
  try {
    SpreadsheetApp.getUi().alert(
      'LokiStream listo',
      (created.length ? 'Creé: ' + created.join(', ') + '.\n\n' : '') +
        'Siguiente paso: Implementar → Nueva implementación → Aplicación web (Ejecutar como: yo · Acceso: cualquier persona). ' +
        'Copia la URL que termina en /exec y pégala en VITE_SHEETS_API_URL de la web.',
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (e) {
    // Sin interfaz (ejecutado desde el editor sin hoja abierta): no pasa nada.
  }
}

function applyValidation_() {
  var statuses = Object.keys(ORDER_STATUS).map(function (k) { return ORDER_STATUS[k]; });
  setListValidation_(TABS.PEDIDOS, FIELDS.PEDIDOS, 'status', statuses);
  setListValidation_(TABS.PEDIDOS, FIELDS.PEDIDOS, 'consent', ['SI', 'NO']);
  ['PLATAFORMAS', 'PLANES', 'PACKS', 'FAQ'].forEach(function (key) {
    setCheckbox_(TABS[key], FIELDS[key], 'active');
  });
  setCheckbox_(TABS.PACKS, FIELDS.PACKS, 'highlight');
}

function columnFor_(tab, fields, field) {
  var header = detectHeaderRow(values_(tab).slice(0, 10), fields, 2);
  if (!header || header.columns[field] === undefined) return null;
  return { sheet: sheet_(tab), col: header.columns[field] + 1, firstRow: header.row + 2 };
}

function setListValidation_(tab, fields, field, list) {
  var c = columnFor_(tab, fields, field);
  if (!c) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build();
  c.sheet.getRange(c.firstRow, c.col, c.sheet.getMaxRows() - c.firstRow + 1, 1).setDataValidation(rule);
}

function setCheckbox_(tab, fields, field) {
  var c = columnFor_(tab, fields, field);
  if (!c) return;
  var last = Math.max(c.sheet.getLastRow(), c.firstRow);
  c.sheet.getRange(c.firstRow, c.col, last - c.firstRow + 1, 1).insertCheckboxes();
}

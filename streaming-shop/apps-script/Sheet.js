/** LokiStream · lectura y escritura en la hoja (usa SpreadsheetApp). */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  return ss_().getSheetByName(name);
}

function values_(name) {
  var sh = sheet_(name);
  if (!sh || sh.getLastRow() === 0) return [];
  return sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), 1)).getValues();
}

function readTables_(names) {
  var out = {};
  names.forEach(function (n) { out[n] = values_(n); });
  return out;
}

function settings_() {
  return readSettings(values_(TABS.AJUSTES));
}

/**
 * Agrega una fila escribiendo cada campo en su columna (según los encabezados reales de la pestaña).
 * `formulas` es { campo: function(rowNumber, header) → '=...' } para columnas calculadas.
 * Devuelve el número de fila escrita.
 */
function appendByFields_(tabName, fields, data, formulas) {
  var sh = sheet_(tabName);
  if (!sh) throw new Error('No existe la pestaña ' + tabName + '. Usa el menú LokiStream → Instalar o reparar la hoja.');
  var header = detectHeaderRow(values_(tabName).slice(0, 10), fields, 2);
  if (!header) throw new Error('No encuentro los encabezados de ' + tabName);
  var width = Math.max(header.lastCol + 1, sh.getLastColumn());
  var line = [];
  for (var c = 0; c < width; c++) line.push('');
  Object.keys(data).forEach(function (field) {
    var col = header.columns[field];
    if (col !== undefined) line[col] = data[field];
  });
  var rowNumber = sh.getLastRow() + 1;
  if (formulas) {
    Object.keys(formulas).forEach(function (field) {
      var col = header.columns[field];
      if (col !== undefined) line[col] = formulas[field](rowNumber, header);
    });
  }
  sh.getRange(rowNumber, 1, 1, width).setValues([line]);
  return rowNumber;
}

/** Escribe campos sueltos en una fila existente. */
function setFields_(tabName, fields, rowNumber, data) {
  var sh = sheet_(tabName);
  var header = detectHeaderRow(values_(tabName).slice(0, 10), fields, 2);
  Object.keys(data).forEach(function (field) {
    var col = header.columns[field];
    if (col !== undefined) sh.getRange(rowNumber, col + 1).setValue(data[field]);
  });
}

function log_(action, ref, result) {
  try {
    var sh = sheet_(TABS.LOG);
    if (!sh) return;
    sh.appendRow([new Date(), action, ref || '', String(result || '').slice(0, 500)]);
  } catch (e) {
    console.error('No se pudo escribir en LOG', e);
  }
}

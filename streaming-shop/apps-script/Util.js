/** LokiStream · utilidades puras (sin APIs de Google, se prueban con Vitest). */

function normalizeHeader(h) {
  return String(h === null || h === undefined ? '' : h)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Normaliza un nombre para compararlo: "Disney+" → "DISNEY", "Prime Video" → "PRIME VIDEO". */
function normalizeName(s) {
  return normalizeHeader(s);
}

/**
 * Busca la fila de encabezados (en las primeras 10) y devuelve { row, columns, lastCol }.
 * `columns[campo]` es el índice base 0 de la columna. Necesita reconocer al menos `min` campos.
 */
function detectHeaderRow(values, fields, min) {
  var lookup = {};
  Object.keys(fields).forEach(function (field) {
    fields[field].forEach(function (alias) {
      if (!(alias in lookup)) lookup[alias] = field;
    });
  });
  var need = min === undefined ? 2 : min;
  var best = null;
  var bestCount = 0;
  for (var r = 0; r < Math.min(values.length, 10); r++) {
    var columns = {};
    var count = 0;
    var lastCol = -1;
    (values[r] || []).forEach(function (cell, c) {
      var norm = normalizeHeader(cell);
      if (!norm) return;
      lastCol = c;
      var field = lookup[norm];
      if (field && columns[field] === undefined) {
        columns[field] = c;
        count++;
      }
    });
    if (count >= need && count > bestCount) {
      best = { row: r, columns: columns, lastCol: lastCol };
      bestCount = count;
    }
  }
  return best;
}

/** Convierte una tabla (con su fila de encabezados) en objetos { _row, campo: valor }. _row es base 1, como en la hoja. */
function tableToObjects(values, fields, min) {
  var header = detectHeaderRow(values, fields, min);
  if (!header) return { header: null, rows: [] };
  var rows = [];
  for (var r = header.row + 1; r < values.length; r++) {
    var line = values[r] || [];
    var obj = { _row: r + 1 };
    var empty = true;
    Object.keys(header.columns).forEach(function (field) {
      var v = line[header.columns[field]];
      if (v !== '' && v !== null && v !== undefined) empty = false;
      obj[field] = v;
    });
    if (!empty) rows.push(obj);
  }
  return { header: header, rows: rows };
}

function isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function toText(v) {
  if (v === null || v === undefined) return '';
  if (isDate(v)) return toISODate(v);
  return String(v).trim();
}

/** "S/ 1,250.50", "15", 15 → número. Vacío o inválido → null. */
function toNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = toText(v).replace(/[^0-9,.\-]/g, '');
  if (!s) return null;
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/,/g, '');
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/** Casillas y texto: TRUE, "sí", "x", "1" → true. Vacío → valor por defecto. */
function toBool(v, fallback) {
  if (v === true || v === false) return v;
  var s = normalizeHeader(v);
  if (!s) return fallback === undefined ? false : fallback;
  if (/^(SI|S|YES|Y|X|1|TRUE|VERDADERO|ACTIVO)$/.test(s)) return true;
  if (/^(NO|N|0|FALSE|FALSO|INACTIVO)$/.test(s)) return false;
  return fallback === undefined ? false : fallback;
}

/** "a | b | c" o "a, b" → ['a','b','c'] */
function splitList(v, sep) {
  var t = toText(v);
  if (!t) return [];
  var re = sep === ',' ? /\s*,\s*/ : /\s*[|\n]\s*/;
  return t.split(re).map(function (s) { return s.trim(); }).filter(Boolean);
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, ' plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Fecha → 'aaaa-mm-dd' con la hora local del script (America/Lima). */
function toISODate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** Acepta Date, número de serie de hoja, 'aaaa-mm-dd' o 'dd/mm/aaaa'. Devuelve Date (medianoche local) o null. */
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (isDate(v)) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    var base = new Date(1899, 11, 30);
    base.setDate(base.getDate() + Math.floor(v));
    return base;
  }
  var t = String(v).trim();
  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    var y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(y, +m[2] - 1, +m[1]);
  }
  return null;
}

function addDays(date, days) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function formatDMY(d) {
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

function formatPEN(n) {
  return 'S/ ' + (Number(n) || 0).toFixed(2);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Teléfono a formato internacional sin '+': '987 654 321' → '51987654321'. Inválido → ''. */
function normalizePhone(raw, countryCode) {
  var digits = toText(raw).replace(/\D/g, '');
  var cc = String(countryCode || '51');
  if (!digits) return '';
  if (digits.indexOf('00') === 0) digits = digits.slice(2);
  if (digits.length === 9 && digits.charAt(0) === '9' && cc === '51') return cc + digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return '';
}

function waLink(phone, text) {
  return 'https://wa.me/' + String(phone).replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
}

/** Letra de columna para fórmulas: 0 → A, 26 → AA. */
function columnLetter(index) {
  var s = '';
  var n = index + 1;
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

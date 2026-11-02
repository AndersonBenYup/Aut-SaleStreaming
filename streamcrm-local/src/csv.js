// CSV compatible con Excel (UTF-8 con BOM) y exportación .xls (XML de Excel 2003) sin dependencias.

const needsQuote = /[",;\n\r]/;
const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return needsQuote.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(rows, columns) {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

const xml = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

export function toExcelXml(rows, columns, sheet = 'Datos') {
  const row = (vals) => `<Row>${vals.map((v) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${xml(v)}</Data></Cell>`).join('')}</Row>`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    `<Worksheet ss:Name="${xml(sheet)}"><Table>` +
    row(columns.map((c) => c.label)) +
    rows.map((r) => row(columns.map((c) => r[c.key] ?? ''))).join('') +
    '</Table></Worksheet></Workbook>'
  );
}

/** Lee CSV con separador , ; o tabulador (detectado en la primera línea). Devuelve objetos por encabezado. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = [';', '\t', ','].map((s) => [s, firstLine.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.some((v) => v.trim()));
  if (!header) return [];
  const keys = header.map(headerKey);
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** "Teléfono" → "telefono", "Fecha de vencimiento" → "fecha_de_vencimiento" */
export const headerKey = (h) =>
  h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

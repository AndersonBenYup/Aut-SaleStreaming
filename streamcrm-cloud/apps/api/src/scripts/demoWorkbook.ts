import ExcelJS from 'exceljs';
import { addDays, daysBetween } from '../lib/dates.js';

/**
 * Libro de ejemplo con el formato de un negocio típico de streaming (basado en las capturas excel*.png):
 * pestañas VENTAS, CUENTAS y LISTAS. Todos los datos son ficticios.
 */

interface DemoAccount {
  key: string;
  status: 'DISPONIBLE' | 'VENDIDO';
  service: string;
  email: string;
  password: string;
  profiles: number;
  duration: number;
  createdOffset: number;
  provider: string;
  cost: number;
}

interface DemoSale {
  account: string;
  name: string;
  phone: string | null;
  service: string;
  profile: string;
  pin: string;
  /** días desde hoy hasta el vencimiento */
  endOffset: number;
  days: number;
  cost: number;
  price: number;
  consent: boolean;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: 'N1', status: 'VENDIDO', service: 'NETFLIX', email: 'netflix.cuenta1@example.com', password: 'Ntf-Demo-01', profiles: 5, duration: 30, createdOffset: -20, provider: 'Proveedor Lima', cost: 45 },
  { key: 'N2', status: 'DISPONIBLE', service: 'NETFLIX', email: 'netflix.cuenta2@example.com', password: 'Ntf-Demo-02', profiles: 5, duration: 30, createdOffset: -10, provider: 'Proveedor Lima', cost: 45 },
  { key: 'D1', status: 'VENDIDO', service: 'DISNEY Plus', email: 'disney.cuenta1@example.com', password: 'Dsn-Demo-01', profiles: 4, duration: 30, createdOffset: -25, provider: 'Proveedor Norte', cost: 30 },
  { key: 'M1', status: 'DISPONIBLE', service: 'MAX', email: 'max.cuenta1@example.com', password: 'Max-Demo-01', profiles: 5, duration: 30, createdOffset: -15, provider: 'Proveedor Norte', cost: 25 },
  { key: 'P1', status: 'DISPONIBLE', service: 'AMAZON PRIME', email: 'prime.cuenta1@example.com', password: 'Prm-Demo-01', profiles: 6, duration: 30, createdOffset: -12, provider: 'Proveedor Lima', cost: 20 },
  { key: 'S1', status: 'VENDIDO', service: 'SPOTIFY Familiar', email: 'spotify.familia@example.com', password: 'Spt-Demo-01', profiles: 6, duration: 30, createdOffset: -5, provider: 'Proveedor Sur', cost: 28 },
  { key: 'Y1', status: 'DISPONIBLE', service: 'YOUTUBE PREMIUM', email: 'youtube.familia@example.com', password: 'Ytb-Demo-01', profiles: 6, duration: 30, createdOffset: -3, provider: 'Proveedor Sur', cost: 26 },
  { key: 'PA', status: 'DISPONIBLE', service: 'PARAMOUNT Plus', email: 'paramount.cuenta1@example.com', password: 'Prt-Demo-01', profiles: 4, duration: 30, createdOffset: -1, provider: 'Proveedor Lima', cost: 18 },
];

/** Cubre todos los estados: 3 vencidas, 2 vencen hoy, 4 de 1 a 3 días, 7 a más de 3 días. */
export const DEMO_SALES: DemoSale[] = [
  { account: 'N1', name: 'Andrés Quispe', phone: '987 654 301', service: 'NETFLIX 1 Perfil', profile: 'Andrés', pin: '1301', endOffset: -10, days: 30, cost: 9, price: 15, consent: true },
  { account: 'N1', name: 'Lucía Mamani', phone: '+51 987654302', service: 'NETFLIX 1 Perfil', profile: 'Lucía', pin: '1302', endOffset: -5, days: 30, cost: 9, price: 15, consent: true },
  { account: 'N1', name: 'Camila Rojas', phone: '51987654303', service: 'NETFLIX 1 Perfil', profile: 'Camila', pin: '1303', endOffset: -1, days: 30, cost: 9, price: 15, consent: true },
  { account: 'N1', name: 'Jorge Huamán', phone: '987-654-304', service: 'NETFLIX 1 Perfil', profile: 'Jorge', pin: '1304', endOffset: 0, days: 30, cost: 9, price: 15, consent: true },
  { account: 'D1', name: 'María Flores', phone: '987654305', service: 'DISNEY Plus 1 Perfil', profile: 'María', pin: '2305', endOffset: 0, days: 30, cost: 7.5, price: 12, consent: true },
  { account: 'D1', name: 'Luis Torres', phone: '987654306', service: 'DISNEY Plus 1 Perfil', profile: 'Luis', pin: '2306', endOffset: 1, days: 30, cost: 7.5, price: 12, consent: true },
  { account: 'M1', name: 'Rosa Chávez', phone: '987654307', service: 'MAX 1 Perfil', profile: 'Rosa', pin: '3307', endOffset: 2, days: 30, cost: 5, price: 10, consent: true },
  { account: 'P1', name: 'Pedro Sánchez', phone: '987654308', service: 'AMAZON PRIME 1 Perfil', profile: 'Pedro', pin: '4308', endOffset: 2, days: 30, cost: 3.5, price: 10, consent: false },
  { account: 'S1', name: 'Sofía Ramírez', phone: '987654309', service: 'SPOTIFY Familiar', profile: 'Sofía', pin: '', endOffset: 3, days: 30, cost: 4.7, price: 12, consent: true },
  { account: 'Y1', name: 'Diego Castillo', phone: '987654310', service: 'YOUTUBE PREMIUM', profile: 'Diego', pin: '', endOffset: 5, days: 30, cost: 4.4, price: 12, consent: true },
  { account: 'N2', name: 'Valeria Díaz', phone: '987654311', service: 'NETFLIX 1 Perfil', profile: 'Valeria', pin: '1311', endOffset: 8, days: 30, cost: 9, price: 15, consent: true },
  { account: 'N2', name: 'Miguel Vargas', phone: '987654312', service: 'NETFLIX 1 Perfil', profile: 'Miguel', pin: '1312', endOffset: 12, days: 30, cost: 9, price: 15, consent: true },
  { account: 'M1', name: 'Ana Gutiérrez', phone: null, service: 'MAX 1 Perfil', profile: 'Ana', pin: '3313', endOffset: 15, days: 30, cost: 5, price: 10, consent: true },
  { account: 'D1', name: 'Carlos Mendoza', phone: '987654314', service: 'DISNEY Plus 1 Perfil', profile: 'Carlos', pin: '2314', endOffset: 20, days: 30, cost: 7.5, price: 12, consent: true },
  { account: 'S1', name: 'Elena Paredes', phone: '987654315', service: 'SPOTIFY Familiar', profile: 'Elena', pin: '', endOffset: 25, days: 90, cost: 14, price: 33, consent: true },
  { account: 'Y1', name: 'Sebastián Cruz', phone: '987654316', service: 'YOUTUBE PREMIUM', profile: 'Sebastián', pin: '', endOffset: 28, days: 30, cost: 4.4, price: 12, consent: true },
];

const YELLOW = 'FFFFFF00';
const BROWN = 'FF843C0C';
const RED = 'FFC00000';
const BLACK = 'FF000000';
const MONEY = '"S/ "#,##0.00';

const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

export const VENTAS_HEADERS = [
  'CORREO', 'CONTRASEÑA', 'CLIENTE', 'TELÉFONO', 'SERVICIO', 'PERFIL', 'PIN', 'FECHA INICIO', 'VENCIMIENTO',
  'FECHA DE VENCIMIENTO', 'ESTADO', 'DÍAS RESTANTES', 'CUENTA', 'V/U', 'V/V', 'GANANCIA', 'ACEPTA LLAMADAS',
  'INTENCIÓN', 'RECORDATORIO', 'ÚLTIMO CONTACTO', 'RESUMEN LLAMADA', 'ID SISTEMA',
];

export async function buildDemoWorkbook(file: string, today: string, opts: { withSystemColumns?: boolean } = {}) {
  const withSystem = opts.withSystemColumns ?? true;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StreamCRM Cloud';
  wb.calcProperties.fullCalcOnLoad = true;

  // ---------------- VENTAS ----------------
  const ws = wb.addWorksheet('VENTAS', { views: [{ state: 'frozen', ySplit: 2 }] });
  const headers = withSystem ? VENTAS_HEADERS : VENTAS_HEADERS.slice(0, 17);
  ws.getCell('A1').value = 'FECHA ACTUAL';
  ws.getCell('A1').fill = fill(BROWN);
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell('B1').value = { formula: 'TODAY()', result: utcDate(today) } as ExcelJS.CellFormulaValue;
  ws.getCell('B1').numFmt = 'dd/mm/yyyy';
  ws.getCell('B1').fill = fill(BROWN);
  ws.getCell('B1').font = { bold: true, color: { argb: 'FFFFFFFF' } };

  headers.forEach((h, i) => {
    const c = ws.getRow(2).getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = fill(i >= 17 ? 'FFB4C6E7' : YELLOW); // columnas del sistema en azul
    c.border = thin;
  });
  ws.getRow(2).height = 30;

  const accounts = new Map(DEMO_ACCOUNTS.map((a) => [a.key, a]));
  const ordered = [...DEMO_SALES].sort((a, b) => a.account.localeCompare(b.account) || a.endOffset - b.endOffset);
  const startRow = 3;
  ordered.forEach((s, i) => {
    const r = startRow + i;
    const acc = accounts.get(s.account)!;
    const end = addDays(today, s.endOffset);
    const start = addDays(end, -s.days);
    const left = daysBetween(today, end);
    const estado = left < 0 ? `vencido hace ${-left} días` : left === 0 ? 'vence hoy' : `faltan ${left} días`;
    const row = ws.getRow(r);
    row.values = [
      acc.email,
      acc.password,
      s.name,
      s.phone ?? '',
      s.service,
      s.profile,
      s.pin,
      utcDate(start),
      s.days,
      { formula: `H${r}+I${r}`, result: utcDate(end) },
      { formula: `IF(C${r}="","",IF(L${r}<0,"vencido hace "&-L${r}&" días",IF(L${r}=0,"vence hoy","faltan "&L${r}&" días")))`, result: estado },
      { formula: `J${r}-$B$1`, result: left },
      `CUENTA ${s.account}`,
      s.cost,
      s.price,
      { formula: `O${r}-N${r}`, result: Math.round((s.price - s.cost) * 100) / 100 },
      s.consent ? 'SI' : 'NO',
    ] as ExcelJS.CellValue[];
    row.getCell(8).numFmt = 'dd-mmm-yy';
    row.getCell(10).numFmt = 'dd-mmm-yy';
    for (const c of [14, 15, 16]) row.getCell(c).numFmt = MONEY;
    for (let c = 1; c <= headers.length; c++) row.getCell(c).border = thin;
    const estadoCell = row.getCell(11);
    estadoCell.fill = fill(left < 0 ? 'FFFF0000' : left === 0 ? 'FFFFC000' : left <= 3 ? YELLOW : 'FF00B050');
    estadoCell.font = { color: { argb: left > 3 || left < 0 ? 'FFFFFFFF' : BLACK } };
    estadoCell.alignment = { horizontal: 'center' };
  });
  const lastRow = startRow + ordered.length - 1;

  // Celdas combinadas para cuentas compartidas (como en excel 3): una cuenta madre, varios clientes.
  let groupStart = startRow;
  for (let r = startRow + 1; r <= lastRow + 1; r++) {
    const prev = ordered[r - 1 - startRow]!.account;
    const cur = r <= lastRow ? ordered[r - startRow]!.account : null;
    if (cur !== prev) {
      if (r - 1 > groupStart) {
        for (const col of ['A', 'B', 'M']) {
          ws.mergeCells(`${col}${groupStart}:${col}${r - 1}`);
          ws.getCell(`${col}${groupStart}`).alignment = { vertical: 'middle', horizontal: 'center' };
        }
      }
      groupStart = r;
    }
  }

  // Resumen (como en excel 1-2), a la derecha de la tabla.
  const sumCol = headers.length + 2;
  const L = `L${startRow}:L500`;
  const left = ordered.map((s) => s.endOffset);
  const summary: [string, string, number, string][] = [
    ['VENCIDAS', `COUNTIF(${L},"<0")`, left.filter((d) => d < 0).length, 'FFFF0000'],
    ['VENCE HOY', `COUNTIF(${L},0)`, left.filter((d) => d === 0).length, 'FFFFC000'],
    ['DE 1 A 3 DÍAS', `COUNTIFS(${L},">=1",${L},"<=3")`, left.filter((d) => d >= 1 && d <= 3).length, YELLOW],
    ['FALTAN MÁS DE 3 DÍAS', `COUNTIF(${L},">3")`, left.filter((d) => d > 3).length, 'FF00B050'],
    ['GANANCIA GENERAL', `SUM(P${startRow}:P500)`, Math.round(ordered.reduce((a, s) => a + s.price - s.cost, 0) * 100) / 100, 'FF00B050'],
  ];
  summary.forEach(([label, formula, result, color], i) => {
    const h = ws.getRow(1).getCell(sumCol + i);
    h.value = label;
    h.font = { bold: true };
    h.fill = fill(YELLOW);
    h.alignment = { horizontal: 'center', wrapText: true };
    h.border = thin;
    const v = ws.getRow(2).getCell(sumCol + i);
    v.value = { formula, result } as ExcelJS.CellFormulaValue;
    v.fill = fill(color);
    v.alignment = { horizontal: 'center' };
    v.border = thin;
    if (label === 'GANANCIA GENERAL') v.numFmt = MONEY;
  });

  const widths = [28, 14, 18, 15, 22, 11, 7, 12, 12, 13, 18, 9, 11, 10, 10, 11, 10, 16, 24, 17, 40, 38];
  widths.slice(0, headers.length).forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let i = 0; i < summary.length; i++) ws.getColumn(sumCol + i).width = 14;

  // ---------------- CUENTAS ----------------
  const wc = wb.addWorksheet('CUENTAS', { views: [{ state: 'frozen', ySplit: 1 }] });
  const accHeaders = ['ESTADO', 'SUSCRIPCIÓN', 'CORREO/USUARIO', 'CONTRASEÑA', 'PERFILES', 'DURACION DIAS', 'FECHA DE CREACION', 'FECHA DE VENCIMIENTO', 'PROVEEDOR', 'DIAS', 'PRECIO'];
  accHeaders.forEach((h, i) => {
    const c = wc.getRow(1).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(BLACK);
    c.alignment = { horizontal: 'center' };
  });
  DEMO_ACCOUNTS.forEach((a, i) => {
    const r = i + 2;
    const created = addDays(today, a.createdOffset);
    const expires = addDays(created, a.duration);
    const row = wc.getRow(r);
    row.values = [
      a.status,
      `${a.service} |`,
      a.email,
      a.password,
      a.profiles,
      a.duration,
      utcDate(created),
      { formula: `G${r}+F${r}`, result: utcDate(expires) },
      a.provider,
      { formula: `H${r}-TODAY()`, result: daysBetween(today, expires) },
      a.cost,
    ] as ExcelJS.CellValue[];
    row.getCell(7).numFmt = 'dd/mm/yyyy';
    row.getCell(8).numFmt = 'dd/mm/yyyy';
    row.getCell(11).numFmt = MONEY;
    row.getCell(1).fill = fill(a.status === 'DISPONIBLE' ? 'FFFFC000' : BLACK);
    row.getCell(1).font = { bold: true, color: { argb: a.status === 'DISPONIBLE' ? BLACK : 'FFFFFFFF' } };
    row.getCell(8).fill = fill('FF00B050');
    for (const c of [2, 3, 4]) row.getCell(c).fill = fill('FFFFD966');
  });
  [12, 22, 30, 14, 9, 13, 16, 18, 16, 7, 11].forEach((w, i) => (wc.getColumn(i + 1).width = w));

  // ---------------- LISTAS ----------------
  const wl = wb.addWorksheet('LISTAS');
  wl.getCell('B2').value = 'PROVEEDORES';
  wl.getCell('C2').value = 'NUMERO CELULAR';
  wl.getCell('E2').value = 'TIPO DE VENTA';
  wl.getCell('G2').value = 'MENSAJES';
  for (const a of ['B2', 'C2', 'E2', 'G2']) {
    wl.getCell(a).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wl.getCell(a).fill = fill(BLACK);
  }
  [
    ['Proveedor Lima', '+51 900 000 001'],
    ['Proveedor Norte', '+51 900 000 002'],
    ['Proveedor Sur', '+51 900 000 003'],
  ].forEach(([p, n], i) => {
    wl.getCell(`B${i + 3}`).value = p;
    wl.getCell(`C${i + 3}`).value = n;
  });
  const tipos = [
    'NETFLIX |', 'NETFLIX 1 Perfil |', 'NETFLIX 2 Perfiles |', 'AMAZON PRIME |', 'AMAZON PRIME 1 Perfil |',
    'DISNEY Plus |', 'DISNEY Plus 1 Perfil |', 'MAX |', 'MAX 1 Perfil |', 'SPOTIFY Familiar |', 'YOUTUBE PREMIUM |', 'PARAMOUNT Plus |',
  ];
  tipos.forEach((t, i) => (wl.getCell(`E${i + 3}`).value = t));
  [
    'Hola, los datos de acceso para su servicio son:%0A %0A',
    'No agregue ni modifique ninguna información de la cuenta.%0A',
    'Úselo solo en un dispositivo a la vez.%0A',
    'Hola, su servicio ha sido renovado satisfactoriamente:%0A %0A',
    'Hola, por seguridad hemos actualizado su servicio:%0A %0A',
    '_Disfrute de nuestro servicio, gracias por confiar en nosotros._',
  ].forEach((m, i) => (wl.getCell(`G${i + 3}`).value = m));
  wl.getColumn(2).width = 18;
  wl.getColumn(3).width = 18;
  wl.getColumn(5).width = 26;
  wl.getColumn(7).width = 60;

  await wb.xlsx.writeFile(file);
  return { sales: ordered.length, accounts: DEMO_ACCOUNTS.length };
}

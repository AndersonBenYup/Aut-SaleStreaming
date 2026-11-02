import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/index.js';
import { customers, subscriptions, tenants } from '../src/db/schema.js';

/** 10:00 en Lima del 29/10/2026 (Lima = UTC−5). */
export const NOW = new Date('2026-10-29T15:00:00Z');
export const TODAY = '2026-10-29';

export const tmpFile = (name: string) => path.join(mkdtempSync(path.join(os.tmpdir(), 'streamcrm-sheet-')), name);

export async function createTenant(values: Partial<typeof tenants.$inferInsert> = {}) {
  const [t] = await getDb()
    .insert(tenants)
    .values({ name: 'Negocio Test', subscriptionStatus: 'active', ...values })
    .returning();
  return t!;
}

export async function subsOf(tenantId: string) {
  return getDb()
    .select({ sub: subscriptions, customer: customers })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(eq(subscriptions.tenantId, tenantId));
}

/** Lee una celda del .xlsx por encabezado (fila de encabezados = headerRow, base 1). */
export async function readXlsx(file: string, tab = 'VENTAS', headerRow = 2) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(tab)!;
  const headers: string[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: true }, (c, col) => (headers[col] = String(c.value ?? '')));
  const col = (h: string) => headers.findIndex((x) => x === h);
  return {
    ws,
    headers,
    col,
    /** valor plano (resultado si es fórmula) */
    get(row: number, header: string) {
      const v = ws.getRow(row).getCell(col(header)).value as any;
      if (v && typeof v === 'object' && 'formula' in v) return v.result;
      if (v && typeof v === 'object' && 'text' in v) return v.text;
      return v;
    },
    formula(row: number, header: string): string | undefined {
      const v = ws.getRow(row).getCell(col(header)).value as any;
      return v && typeof v === 'object' ? v.formula : undefined;
    },
    findRow(header: string, value: string) {
      for (let r = headerRow + 1; r <= ws.rowCount; r++) if (String(this.get(r, header) ?? '') === value) return r;
      return -1;
    },
  };
}

/**
 * Hoja con el formato EXACTO de la captura excel.png (sin columnas del sistema), más TELÉFONO:
 * CORREO | CONTRASEÑA | CLIENTE | TELÉFONO | FECHA INICIO | VENCIMIENTO | FECHA DE VENCIMIENTO (=E+F) | ESTADO | CUENTA | V/U | V/V | GANANCIA
 */
export async function buildSimpleSheet(
  file: string,
  rows: { email: string; password: string; name: string; phone: string; start: string; days: number; account: string; cost: number; price: number }[],
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VENTAS');
  ws.getCell('A1').value = 'FECHA ACTUAL';
  ws.getCell('B1').value = new Date(`${TODAY}T00:00:00Z`);
  ws.getRow(2).values = ['CORREO', 'CONTRASEÑA', 'CLIENTE', 'TELÉFONO', 'FECHA INICIO', 'VENCIMIENTO', 'FECHA DE VENCIMIENTO', 'ESTADO', 'CUENTA', 'V/U', 'V/V', 'GANANCIA'];
  rows.forEach((x, i) => {
    const r = i + 3;
    const start = new Date(`${x.start}T00:00:00Z`);
    const end = new Date(start.getTime() + x.days * 86400_000);
    ws.getRow(r).values = [
      x.email,
      x.password,
      x.name,
      x.phone,
      start,
      x.days,
      { formula: `E${r}+F${r}`, result: end },
      { formula: `IF(G${r}<$B$1,"vencido","faltan "&(G${r}-$B$1)&" días")`, result: 'x' },
      x.account,
      x.cost,
      x.price,
      { formula: `K${r}-J${r}`, result: x.price - x.cost },
    ] as ExcelJS.CellValue[];
  });
  await wb.xlsx.writeFile(file);
}

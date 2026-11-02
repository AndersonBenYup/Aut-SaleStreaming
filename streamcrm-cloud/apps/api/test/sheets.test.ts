import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import { payments, streamAccounts, subscriptions } from '../src/db/schema.js';
import { applyIntent, createSale, renewSubscription } from '../src/modules/subscriptions.js';
import { flushTenantSheet, scanTenantSheet } from '../src/sheets/sync.js';
import { buildDemoWorkbook } from '../src/scripts/demoWorkbook.js';
import { NOW, TODAY, buildSimpleSheet, createTenant, readXlsx, subsOf, tmpFile } from './helpers.js';

async function demoTenant(withSystemColumns = false) {
  const file = tmpFile('demo.xlsx');
  await buildDemoWorkbook(file, TODAY, { withSystemColumns });
  const tenant = await createTenant({ sheetProvider: 'xlsx', sheetSpreadsheetId: file });
  return { file, tenant };
}

describe('escaneo perezoso de la hoja', () => {
  it('solo pasan a la BD las filas próximas a vencer o vencidas; el resto se queda en la hoja', async () => {
    const { tenant } = await demoTenant();
    const r = await scanTenantSheet(tenant.id, { now: NOW });
    // 3 vencidas + 2 hoy + 4 de 1 a 3 días = 9; las 7 de más de 3 días siguen solo en la hoja.
    expect(r).toMatchObject({ rows: 16, imported: 9, waiting: 7, invalid: 0 });
    const subs = await subsOf(tenant.id);
    expect(subs).toHaveLength(9);
    expect(subs.every((s) => s.sub.source === 'sheet')).toBe(true);
  });

  it('crea las columnas del sistema si faltan y escribe el ID en cada fila importada', async () => {
    const { file, tenant } = await demoTenant(false);
    await scanTenantSheet(tenant.id, { now: NOW });
    const x = await readXlsx(file);
    for (const h of ['INTENCIÓN', 'RECORDATORIO', 'ÚLTIMO CONTACTO', 'RESUMEN LLAMADA', 'ID SISTEMA']) expect(x.col(h)).toBeGreaterThan(0);
    const subs = await subsOf(tenant.id);
    for (const { sub, customer } of subs) {
      const row = x.findRow('CLIENTE', customer.name);
      expect(x.get(row, 'ID SISTEMA')).toBe(sub.id);
    }
    // Las filas lejanas no tienen ID.
    expect(x.get(x.findRow('CLIENTE', 'Sebastián Cruz'), 'ID SISTEMA')).toBeFalsy();
  });

  it('escanear dos veces no duplica nada', async () => {
    const { tenant } = await demoTenant();
    await scanTenantSheet(tenant.id, { now: NOW });
    const again = await scanTenantSheet(tenant.id, { now: NOW });
    expect(again.imported).toBe(0);
    expect(await subsOf(tenant.id)).toHaveLength(9);
  });

  it('con el paso de los días entran las demás filas', async () => {
    const { tenant } = await demoTenant();
    await scanTenantSheet(tenant.id, { now: NOW });
    const later = await scanTenantSheet(tenant.id, { now: new Date(NOW.getTime() + 30 * 86400_000) });
    expect(later.imported).toBe(7);
    expect(await subsOf(tenant.id)).toHaveLength(16);
  });

  it('interpreta celdas combinadas, teléfonos en varios formatos y la columna de consentimiento', async () => {
    const { tenant } = await demoTenant();
    await scanTenantSheet(tenant.id, { now: NOW });
    const subs = await subsOf(tenant.id);
    const by = (n: string) => subs.find((s) => s.customer.name === n)!;
    // Lucía y Camila están en celdas combinadas de la cuenta netflix.cuenta1.
    const [acc] = await getDb().select().from(streamAccounts).where(eq(streamAccounts.id, by('Camila Rojas').sub.streamAccountId!));
    expect(acc!.email).toBe('netflix.cuenta1@example.com');
    expect(acc!.passwordEnc).not.toContain('Ntf-Demo-01'); // cifrada
    expect(acc!.totalProfiles).toBe(5); // dato de la pestaña CUENTAS
    expect(by('Lucía Mamani').sub.streamAccountId).toBe(acc!.id);
    expect(by('Lucía Mamani').customer.phone).toBe('+51987654302');
    expect(by('Camila Rojas').customer.phone).toBe('+51987654303');
    expect(by('Jorge Huamán').customer.phone).toBe('+51987654304');
    expect(by('Pedro Sánchez').customer.consentCalls).toBe(false);
    expect(by('Luis Torres').customer.consentCalls).toBe(true);
    // Vencida hace 10 días: se guarda pero sin aviso automático.
    expect(by('Andrés Quispe').sub.reminderAt).toBeNull();
    expect(by('Andrés Quispe').sub.status).toBe('vencida');
    expect(by('Luis Torres').sub.status).toBe('por_vencer');
  });
});

describe('escritura de vuelta en la hoja', () => {
  it('la respuesta del cliente llega a la fila correcta aunque reordenen la hoja', async () => {
    const file = tmpFile('simple.xlsx');
    await buildSimpleSheet(file, [
      { email: 'a@x.com', password: 'p1', name: 'ANDRES', phone: '911111111', start: '2026-10-01', days: 30, account: 'CUENTA 1', cost: 8, price: 15 },
      { email: 'b@x.com', password: 'p2', name: 'LUIS', phone: '922222222', start: '2026-10-02', days: 30, account: 'CUENTA 2', cost: 8, price: 15 },
    ]);
    const tenant = await createTenant({ sheetProvider: 'xlsx', sheetSpreadsheetId: file });
    expect((await scanTenantSheet(tenant.id, { now: NOW })).imported).toBe(2);

    // El negocio inserta una fila arriba: LUIS y ANDRES bajan.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    wb.getWorksheet('VENTAS')!.spliceRows(3, 0, ['c@x.com', 'p3', 'NUEVA', '933333333', new Date('2026-10-20T00:00:00Z'), 30, null, null, 'CUENTA 3', 8, 15]);
    await wb.xlsx.writeFile(file);

    const luis = (await subsOf(tenant.id)).find((s) => s.customer.name === 'LUIS')!;
    await applyIntent(getDb(), luis.sub, 'renueva', { lastCallSummary: 'Dijo que sí renueva' });
    await flushTenantSheet(tenant.id, { now: NOW });

    const x = await readXlsx(file);
    const row = x.findRow('CLIENTE', 'LUIS');
    expect(row).toBe(5);
    expect(x.get(row, 'INTENCIÓN')).toBe('Renueva');
    expect(x.get(row, 'RESUMEN LLAMADA')).toBe('Dijo que sí renueva');
    expect(x.get(x.findRow('CLIENTE', 'ANDRES'), 'INTENCIÓN')).toBeFalsy();
    const [after] = await getDb().select().from(subscriptions).where(eq(subscriptions.id, luis.sub.id));
    expect(after!.sheetDirty).toBe(false);
  });

  it('renovar registra el pago y actualiza las fechas en la hoja sin pisar la fórmula', async () => {
    const file = tmpFile('simple.xlsx');
    await buildSimpleSheet(file, [
      { email: 'a@x.com', password: 'p1', name: 'ANDRES', phone: '911111111', start: '2026-10-01', days: 30, account: 'CUENTA 1', cost: 8, price: 15 },
    ]);
    const tenant = await createTenant({ sheetProvider: 'xlsx', sheetSpreadsheetId: file });
    await scanTenantSheet(tenant.id, { now: NOW });
    const [{ sub }] = await subsOf(tenant.id);
    expect(sub!.endDate).toBe('2026-10-31');

    await renewSubscription(tenant.id, sub!.id, { amount: 15, method: 'yape' }, { now: NOW });

    const pays = await getDb().select().from(payments).where(eq(payments.subscriptionId, sub!.id));
    expect(pays).toHaveLength(1);
    expect(pays[0]!.method).toBe('yape');

    const x = await readXlsx(file);
    expect((x.get(3, 'FECHA INICIO') as Date).toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(x.formula(3, 'FECHA DE VENCIMIENTO')).toBe('E3+F3'); // la fórmula sigue ahí
    expect(x.formula(3, 'GANANCIA')).toBe('K3-J3');

    // Un nuevo escaneo lee 31/10 + 30 = 30/11 y no lo toma como edición del negocio.
    const r = await scanTenantSheet(tenant.id, { now: NOW });
    expect(r.updatedFromSheet).toBe(0);
    const [{ sub: renewed }] = await subsOf(tenant.id);
    expect(renewed!.endDate).toBe('2026-11-30');
    expect(renewed!.renewalIntent).toBeNull();
  });

  it('si el negocio cambia la fecha en la hoja, la hoja gana y se reprograma el aviso', async () => {
    const file = tmpFile('simple.xlsx');
    await buildSimpleSheet(file, [
      { email: 'a@x.com', password: 'p1', name: 'ANDRES', phone: '911111111', start: '2026-10-01', days: 30, account: 'CUENTA 1', cost: 8, price: 15 },
    ]);
    const tenant = await createTenant({ sheetProvider: 'xlsx', sheetSpreadsheetId: file });
    await scanTenantSheet(tenant.id, { now: NOW });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.getWorksheet('VENTAS')!;
    ws.getCell('E3').value = new Date('2026-11-15T00:00:00Z'); // la renovó a mano
    ws.getCell('G3').value = { formula: 'E3+F3' } as ExcelJS.CellFormulaValue;
    await wb.xlsx.writeFile(file);

    const r = await scanTenantSheet(tenant.id, { now: NOW });
    expect(r.updatedFromSheet).toBe(1);
    const [{ sub }] = await subsOf(tenant.id);
    expect(sub!.endDate).toBe('2026-12-15');
    expect(sub!.reminderAt!.toISOString()).toBe('2026-12-13T15:00:00.000Z'); // 2 días antes, 10:00 Lima
  });

  it('una venta del panel se agrega como fila nueva copiando las fórmulas', async () => {
    const { file, tenant } = await demoTenant(true);
    const sub = await createSale(
      tenant.id,
      { customer: { name: 'Nuevo Cliente', phone: '999 888 777', consentCalls: true }, serviceName: 'NETFLIX 1 Perfil', durationDays: 30, price: 15, startDate: TODAY, profileName: 'Nuevo', pin: '9999' },
      { now: NOW },
    );
    const x = await readXlsx(file);
    const row = x.findRow('CLIENTE', 'Nuevo Cliente');
    expect(row).toBe(19); // después de las 16 ventas (filas 3–18)
    expect(x.get(row, 'TELÉFONO')).toBe('+51999888777');
    expect(x.get(row, 'ID SISTEMA')).toBe(sub.id);
    expect(x.get(row, 'PIN')).toBe('9999');
    expect(x.formula(row, 'FECHA DE VENCIMIENTO')).toBe(`H${row}+I${row}`);
    expect(x.formula(row, 'DÍAS RESTANTES')).toBe(`J${row}-$B$1`);
    // Un escaneo posterior no la vuelve a importar.
    const r = await scanTenantSheet(tenant.id, { now: NOW });
    expect((await subsOf(tenant.id)).filter((s) => s.customer.name === 'Nuevo Cliente')).toHaveLength(1);
    expect(r.rows).toBe(17);
  });
});

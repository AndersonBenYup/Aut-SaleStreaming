import { describe, expect, it } from 'vitest';
import { interpretIntent } from '@streamcrm/shared';
import { computeReminderAt, parseSheetDate } from '../src/lib/dates.js';
import { parseMoney } from '../src/lib/money.js';
import { normalizePhone } from '../src/lib/phone.js';
import { decrypt, encrypt } from '../src/lib/crypto.js';
import { detectHeaders, SALES_FIELDS } from '../src/sheets/headers.js';
import { shiftFormula } from '../src/sheets/client.js';

describe('fechas de la hoja', () => {
  it.each([
    ['2026-10-29', '2026-10-29'],
    ['25-mar-23', '2023-03-25'],
    ['29-abr-23', '2023-04-29'],
    ['30/03/2023', '2023-03-30'],
    ['4/30/2024', '2024-04-30'],
    ['05/04/2024', '2024-04-05'], // ambiguo → d/m (Perú)
    [46324, '2026-10-29'], // serial de Google Sheets (45658 = 01/01/2025)
  ])('%s → %s', (input, expected) => {
    expect(parseSheetDate(input, 'dmy')).toBe(expected);
  });

  it('Date de exceljs (medianoche UTC)', () => {
    expect(parseSheetDate(new Date('2024-04-30T00:00:00Z'))).toBe('2024-04-30');
  });

  it('valores que no son fecha', () => {
    expect(parseSheetDate('hola')).toBeNull();
    expect(parseSheetDate(30)).toBeNull();
    expect(parseSheetDate('')).toBeNull();
  });
});

describe('recordatorio en hora local', () => {
  const cfg = { timezone: 'America/Lima', reminderDaysBefore: 2, reminderHour: 10, allowedStartHour: 9, allowedEndHour: 20 };

  it('vencimiento − 2 días a las 10:00 de Lima (15:00 UTC)', () => {
    const at = computeReminderAt('2026-11-10', cfg, new Date('2026-10-29T15:00:00Z'));
    expect(at.toISOString()).toBe('2026-11-08T15:00:00.000Z');
  });

  it('si ya pasó, en 1 minuto', () => {
    const now = new Date('2026-10-29T16:30:00Z'); // 11:30 Lima
    const at = computeReminderAt('2026-10-30', cfg, now);
    expect(at.toISOString()).toBe('2026-10-29T16:31:00.000Z');
  });

  it('nunca después de las 20:00: pasa al día siguiente a las 9:00', () => {
    const now = new Date('2026-10-30T02:30:00Z'); // 21:30 Lima del 29
    const at = computeReminderAt('2026-10-30', cfg, now);
    expect(at.toISOString()).toBe('2026-10-30T14:00:00.000Z');
  });

  it('nunca antes de las 9:00', () => {
    const at = computeReminderAt('2026-11-10', { ...cfg, reminderHour: 7 }, new Date('2026-10-29T15:00:00Z'));
    expect(at.toISOString()).toBe('2026-11-08T14:00:00.000Z');
  });
});

describe('dinero y teléfonos', () => {
  it.each([
    ['$ 35.000', 35000],
    ['$ 8.000', 8000],
    ['S/ 25.50', 25.5],
    ['1,234.56', 1234.56],
    ['12,5', 12.5],
    [15, 15],
  ])('%s → %s', (input, expected) => expect(parseMoney(input)).toBe(expected));

  it.each([
    ['987 654 321', '+51987654321'],
    ['+51 987654321', '+51987654321'],
    ['51987654321', '+51987654321'],
    ['987-654-321', '+51987654321'],
    ['573232405812', '+573232405812'], // Colombia, como en la captura de LISTAS
  ])('%s → %s', (input, expected) => expect(normalizePhone(input, 'PE')).toBe(expected));

  it('número inválido', () => expect(normalizePhone('123', 'PE')).toBeNull());
});

describe('interpretación de la intención', () => {
  it.each([
    ['renueva', 'renueva'],
    ['Sí, claro', 'renueva'],
    ['si confirmo', 'renueva'],
    ['ok le pago mañana', 'renueva'],
    ['no', 'no_renueva'],
    ['ya no, gracias', 'no_renueva'],
    ['quiero cancelar', 'no_renueva'],
    ['ya no pago', 'no_renueva'],
    ['déjame pensarlo', 'pensando'],
    ['después te aviso', 'pensando'],
    ['no sé todavía', 'pensando'],
    ['luego', 'pensando'],
  ])('"%s" → %s', (text, expected) => expect(interpretIntent(text)).toBe(expected));

  it('texto sin intención', () => expect(interpretIntent('¿quién habla?')).toBeNull());
});

describe('encabezados de la hoja', () => {
  it('reconoce el formato de la captura (VENCIMIENTO = días, V/V = precio)', () => {
    const values = [
      ['FECHA ACTUAL', '30/03/2023'],
      ['CORREO', 'CONTRASEÑA', 'CLIENTE', 'FECHA INICIO', 'VENCIMIENTO', 'FECHA DE VENCIMIENTO', 'ESTADO', '', 'CUENTA', 'V/U', 'V/V', 'GANANCIA'],
    ];
    const h = detectHeaders(values, SALES_FIELDS, ['cliente'])!;
    expect(h.row).toBe(1);
    expect(h.columns).toMatchObject({ correo: 0, contrasena: 1, cliente: 2, fecha_inicio: 3, dias: 4, fecha_vencimiento: 5, cuenta: 8, costo: 9, precio: 10, ganancia: 11 });
  });
});

describe('cifrado', () => {
  it('AES-256-GCM ida y vuelta, con IV distinto cada vez', () => {
    const a = encrypt('bruse98')!;
    expect(a).not.toContain('bruse98');
    expect(encrypt('bruse98')).not.toBe(a);
    expect(decrypt(a)).toBe('bruse98');
  });
});

it('copia fórmulas a otra fila respetando las referencias absolutas', () => {
  expect(shiftFormula('=J4-$B$1', 4, 9)).toBe('=J9-$B$1');
  expect(shiftFormula('=IF(C4="","",L4)', 4, 5)).toBe('=IF(C5="","",L5)');
});

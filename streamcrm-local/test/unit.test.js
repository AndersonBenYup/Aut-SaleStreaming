import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReminderAt, nextAllowed, parseLooseDate } from '../src/dates.js';
import { interpretIntent } from '../src/intent.js';
import { normalizePhone } from '../src/phone.js';
import { parseCsv, toCsv } from '../src/csv.js';

const cfg = { timezone: 'America/Lima', daysBefore: 2, hour: 10, startHour: 9, endHour: 20 };

test('reminder_at: vencimiento − 2 días a las 10:00 de Lima', () => {
  assert.equal(computeReminderAt('2030-01-15', cfg, new Date('2030-01-01T00:00:00Z')).toISOString(), '2030-01-13T15:00:00.000Z');
});

test('reminder_at ya pasado → dentro de 1 minuto, pero dentro del horario permitido', () => {
  // 12:00 Lima → 12:01
  assert.equal(computeReminderAt('2030-01-14', cfg, new Date('2030-01-13T17:00:20Z')).toISOString(), '2030-01-13T17:01:00.000Z');
  // 22:00 Lima → mañana 9:00
  assert.equal(computeReminderAt('2030-01-14', cfg, new Date('2030-01-14T03:00:00Z')).toISOString(), '2030-01-14T14:00:00.000Z');
});

test('reintento +2 h respeta el horario: 19:00 → 9:00 del día siguiente', () => {
  assert.equal(nextAllowed(cfg, new Date('2030-01-13T17:00:00Z'), { hours: 2 }).toISOString(), '2030-01-13T19:00:00.000Z');
  assert.equal(nextAllowed(cfg, new Date('2030-01-14T00:00:00Z'), { hours: 2 }).toISOString(), '2030-01-14T14:00:00.000Z');
});

test('teléfonos a E.164', () => {
  assert.equal(normalizePhone('987 654 321'), '+51987654321');
  assert.equal(normalizePhone('51987654321'), '+51987654321');
  assert.equal(normalizePhone('+52 55 1234 5678'), '+525512345678');
  assert.equal(normalizePhone('3001234567', 'CO'), '+573001234567');
  assert.equal(normalizePhone('123'), null);
});

test('intención: enum y texto libre', () => {
  assert.equal(interpretIntent('renueva'), 'renueva');
  assert.equal(interpretIntent('Sí, renuevo'), 'renueva');
  assert.equal(interpretIntent('ya no pago'), 'no_renueva');
  assert.equal(interpretIntent('no sé, lo pienso'), 'pensando');
  assert.equal(interpretIntent(''), null);
});

test('CSV con ; y fechas sueltas', () => {
  const rows = parseCsv('﻿Nombre;Teléfono;Vencimiento\n"Pérez; Ana";987654321;29/10/2026\n');
  assert.deepEqual(rows, [{ nombre: 'Pérez; Ana', telefono: '987654321', vencimiento: '29/10/2026' }]);
  assert.equal(parseLooseDate('29/10/2026'), '2026-10-29');
  assert.equal(parseLooseDate('25-mar-23'), '2023-03-25');
  assert.equal(toCsv([{ a: 'x,y' }], [{ key: 'a', label: 'A' }]), '﻿A\r\n"x,y"\r\n');
});

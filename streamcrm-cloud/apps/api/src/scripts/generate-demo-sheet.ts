import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { apiRoot } from '../bootstrap.js';
import { todayIn } from '../lib/dates.js';
import { buildDemoWorkbook } from './demoWorkbook.js';

const out = path.resolve(apiRoot, '../../ejemplos/streamcrm-demo.xlsx');
mkdirSync(path.dirname(out), { recursive: true });
const today = todayIn('America/Lima');
const r = await buildDemoWorkbook(out, today);
console.log(`✔ Hoja de ejemplo creada: ${out}`);
console.log(`  ${r.sales} ventas y ${r.accounts} cuentas madre, con fechas relativas a hoy (${today}).`);
console.log('  Para Google Sheets: Archivo → Importar → Subir → "Reemplazar hoja de cálculo".');

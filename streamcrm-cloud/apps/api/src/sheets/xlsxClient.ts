import ExcelJS from 'exceljs';
import type { CellUpdate, SheetData, SheetsClient } from './client.js';

const locks = new Map<string, Promise<unknown>>();

/** Serializa el acceso a cada archivo para que dos jobs no se pisen al escribir. */
function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    file,
    next.catch(() => undefined),
  );
  return next;
}

function cellValue(cell: ExcelJS.Cell): { value: unknown; formula: string | null } {
  if (cell.isMerged && cell.master.address !== cell.address) return { value: null, formula: null }; // igual que Google
  const v = cell.value as unknown;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ('formula' in o || 'sharedFormula' in o) {
      const f = (o.formula as string | undefined) ?? cell.formula;
      return { value: o.result ?? null, formula: f ? `=${f}` : '=' };
    }
    if ('richText' in o) return { value: (o.richText as { text: string }[]).map((r) => r.text).join(''), formula: null };
    if ('text' in o) return { value: o.text, formula: null };
    if ('error' in o) return { value: null, formula: null };
  }
  return { value: v ?? null, formula: null };
}

/**
 * Implementación sobre un archivo .xlsx local. Sirve para desarrollar sin credenciales de Google y en los tests.
 * Mismo comportamiento que Google Sheets: celdas combinadas solo tienen valor en la primera, fórmulas de solo lectura.
 */
export class XlsxFileClient implements SheetsClient {
  constructor(private file: string) {}

  read(tab: string): Promise<SheetData | null> {
    return withLock(this.file, async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(this.file);
      const ws = wb.getWorksheet(tab);
      if (!ws) return null;
      const values: unknown[][] = [];
      const formulas: (string | null)[][] = [];
      for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const vr: unknown[] = [];
        const fr: (string | null)[] = [];
        for (let c = 1; c <= ws.columnCount; c++) {
          const { value, formula } = cellValue(row.getCell(c));
          vr.push(value);
          fr.push(formula);
        }
        values.push(vr);
        formulas.push(fr);
      }
      return { values, formulas };
    });
  }

  update(tab: string, updates: CellUpdate[]): Promise<void> {
    if (!updates.length) return Promise.resolve();
    return withLock(this.file, async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(this.file);
      const ws = wb.getWorksheet(tab);
      if (!ws) throw new Error(`La pestaña ${tab} no existe`);
      const touchedRows = new Set<number>();
      for (const u of updates) {
        const cell = ws.getRow(u.row + 1).getCell(u.col + 1);
        if (cellValue(cell).formula) continue; // nunca pisar fórmulas
        const v = u.value;
        if (v && typeof v === 'object' && 'date' in v) {
          cell.value = new Date(`${v.date}T00:00:00Z`);
          if (!cell.numFmt || cell.numFmt === 'General') cell.numFmt = 'dd/mm/yyyy';
        } else if (v && typeof v === 'object') {
          cell.value = { formula: v.formula.replace(/^=/, '') } as ExcelJS.CellFormulaValue;
        } else {
          cell.value = v ?? null;
        }
        touchedRows.add(u.row + 1);
      }
      // A diferencia de Google, Excel no recalcula al guardar: se borra el resultado en caché de las fórmulas
      // de las filas tocadas (el lector cae a inicio + días) y se fuerza el recálculo al abrir el archivo.
      for (const r of touchedRows) {
        ws.getRow(r).eachCell((cell) => {
          const cv = cell.value as Record<string, unknown> | null;
          if (cv && typeof cv === 'object' && 'formula' in cv && 'result' in cv) {
            cell.value = { formula: cv.formula as string } as ExcelJS.CellFormulaValue;
          }
        });
      }
      wb.calcProperties.fullCalcOnLoad = true;
      await wb.xlsx.writeFile(this.file);
    });
  }
}

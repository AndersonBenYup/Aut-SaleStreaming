/**
 * Valor que se escribe en una celda. `{ date }` se guarda como fecha real (no texto) y
 * `{ formula }` como fórmula (p. ej. "=J5-$B$1").
 */
export type SheetValue = string | number | null | { date: string } | { formula: string };

export interface SheetData {
  /** Valores sin formato, base 0. Las fechas pueden venir como serial (Google) o Date (xlsx). */
  values: unknown[][];
  /** Texto de la fórmula ("=D3+E3") o null. Las celdas con fórmula nunca se sobrescriben. */
  formulas: (string | null)[][];
}

export interface CellUpdate {
  /** base 0 */
  row: number;
  /** base 0 */
  col: number;
  value: SheetValue;
}

export interface SheetsClient {
  /** Devuelve null si la pestaña no existe. */
  read(tab: string): Promise<SheetData | null>;
  update(tab: string, updates: CellUpdate[]): Promise<void>;
}

export const isFormula = (data: SheetData, row: number, col: number) => Boolean(data.formulas[row]?.[col]);

export const columnLetter = (col: number): string => {
  let n = col + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/**
 * Copia una fórmula de una fila a otra moviendo las referencias relativas a esa fila:
 * shiftFormula("=J4-$B$1", 4, 9) → "=J9-$B$1". Las referencias con $ en la fila no se tocan.
 */
export const shiftFormula = (formula: string, fromRow1: number, toRow1: number) =>
  formula.replace(/(\$?[A-Z]{1,3})(\d+)\b/g, (m, colRef: string, row: string) =>
    Number(row) === fromRow1 && !m.includes(`$${row}`) ? `${colRef}${toRow1}` : m,
  );

export const normalizeHeader = (h: unknown) =>
  String(h ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

/** Campos de la pestaña de ventas. Los alias se comparan con el encabezado normalizado (exacto). */
export const SALES_FIELDS = {
  correo: ['CORREO', 'CORREO USUARIO', 'USUARIO', 'EMAIL', 'CORREO CUENTA'],
  contrasena: ['CONTRASENA', 'CLAVE', 'PASSWORD', 'CONTRASENA CUENTA'],
  cliente: ['CLIENTE', 'NOMBRE', 'NOMBRE CLIENTE', 'NOMBRE DEL CLIENTE'],
  telefono: ['TELEFONO', 'CELULAR', 'WHATSAPP', 'NUMERO', 'CEL', 'TELEFONO CLIENTE', 'NUMERO CELULAR'],
  servicio: ['SERVICIO', 'SUSCRIPCION', 'PLATAFORMA', 'TIPO DE VENTA'],
  perfil: ['PERFIL', 'NOMBRE PERFIL', 'NOMBRE DEL PERFIL'],
  pin: ['PIN'],
  fecha_inicio: ['FECHA INICIO', 'FECHA DE INICIO', 'INICIO', 'FECHA COMPRA', 'FECHA DE COMPRA'],
  dias: ['VENCIMIENTO', 'DIAS', 'DURACION', 'DURACION DIAS', 'DIAS DE SERVICIO'],
  fecha_vencimiento: ['FECHA DE VENCIMIENTO', 'FECHA VENCIMIENTO', 'VENCE', 'FECHA FIN', 'FECHA DE CORTE'],
  estado: ['ESTADO'],
  dias_restantes: ['DIAS RESTANTES', 'FALTAN'],
  cuenta: ['CUENTA', 'CUENTA MADRE'],
  costo: ['V U', 'VALOR UNITARIO', 'COSTO'],
  precio: ['V V', 'VALOR VENTA', 'PRECIO', 'MONTO', 'PRECIO VENTA'],
  ganancia: ['GANANCIA'],
  acepta_llamadas: ['ACEPTA LLAMADAS', 'CONSENTIMIENTO', 'ACEPTA AVISOS'],
  intencion: ['INTENCION'],
  recordatorio: ['RECORDATORIO'],
  ultimo_contacto: ['ULTIMO CONTACTO'],
  resumen: ['RESUMEN LLAMADA', 'RESUMEN'],
  id_sistema: ['ID SISTEMA'],
} as const;
export type SalesField = keyof typeof SALES_FIELDS;

/** Columnas que escribe el sistema; se crean al final si no existen. */
export const SYSTEM_COLUMNS: { field: SalesField; header: string }[] = [
  { field: 'intencion', header: 'INTENCIÓN' },
  { field: 'recordatorio', header: 'RECORDATORIO' },
  { field: 'ultimo_contacto', header: 'ÚLTIMO CONTACTO' },
  { field: 'resumen', header: 'RESUMEN LLAMADA' },
  { field: 'id_sistema', header: 'ID SISTEMA' },
];

export const ACCOUNT_FIELDS = {
  estado: ['ESTADO'],
  servicio: ['SUSCRIPCION', 'SERVICIO', 'PLATAFORMA'],
  correo: ['CORREO USUARIO', 'CORREO', 'USUARIO', 'EMAIL'],
  contrasena: ['CONTRASENA', 'CLAVE', 'PASSWORD'],
  perfiles: ['PERFILES', 'NUMERO DE PERFILES'],
  duracion: ['DURACION DIAS', 'DURACION', 'DIAS DE SERVICIO'],
  fecha_creacion: ['FECHA DE CREACION', 'FECHA CREACION', 'FECHA INICIO'],
  fecha_vencimiento: ['FECHA DE VENCIMIENTO', 'FECHA VENCIMIENTO', 'VENCE'],
  proveedor: ['PROVEEDOR'],
  costo: ['PRECIO', 'COSTO'],
} as const;
export type AccountField = keyof typeof ACCOUNT_FIELDS;

export interface HeaderMap<F extends string> {
  /** fila de encabezados, base 0 */
  row: number;
  columns: Partial<Record<F, number>>;
  /** última columna con encabezado */
  lastCol: number;
}

/**
 * Busca la fila de encabezados en las primeras 15 filas: la que reconoce más campos,
 * con al menos 3 y que incluya alguno de los obligatorios.
 */
export function detectHeaders<F extends string>(
  values: unknown[][],
  fields: Record<F, readonly string[]>,
  required: NoInfer<F>[],
): HeaderMap<F> | null {
  const lookup = new Map<string, F>();
  for (const [field, aliases] of Object.entries(fields) as [F, readonly string[]][]) {
    for (const alias of aliases) if (!lookup.has(alias)) lookup.set(alias, field);
  }
  let best: HeaderMap<F> | null = null;
  let bestCount = 0;
  for (let r = 0; r < Math.min(values.length, 15); r++) {
    const columns: Partial<Record<F, number>> = {};
    let count = 0;
    let lastCol = -1;
    (values[r] ?? []).forEach((cell, c) => {
      const norm = normalizeHeader(cell);
      if (!norm) return;
      lastCol = c;
      const field = lookup.get(norm);
      if (field && columns[field] === undefined) {
        columns[field] = c;
        count++;
      }
    });
    if (count >= 3 && required.some((f) => columns[f] !== undefined) && count > bestCount) {
      best = { row: r, columns, lastCol };
      bestCount = count;
    }
  }
  return best;
}

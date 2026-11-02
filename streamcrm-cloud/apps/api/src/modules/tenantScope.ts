import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Toda consulta de negocio pasa por aquí: agrega `tenant_id = :tenantId` a las condiciones.
 * Uso: db.select().from(customers).where(scoped(customers, tenantId, eq(customers.id, id)))
 */
export function scoped(table: { tenantId: PgColumn }, tenantId: string, ...conds: (SQL | undefined)[]): SQL {
  if (!tenantId) throw new Error('tenantId requerido');
  return and(eq(table.tenantId, tenantId), ...conds)!;
}

export class NotFoundError extends Error {
  status = 404;
  constructor(what = 'Recurso') {
    super(`${what} no encontrado`);
  }
}

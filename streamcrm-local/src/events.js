import { run } from './db.js';

/** Registra algo en la bitácora. `data` nunca debe llevar contraseñas ni tokens. */
export function logEvent(type, { entity = null, entityId = null, userId = null, data = null } = {}) {
  run(
    'INSERT INTO events (type, entity, entity_id, user_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    type,
    entity,
    entityId,
    userId,
    data ? JSON.stringify(data) : null,
    new Date().toISOString(),
  );
}

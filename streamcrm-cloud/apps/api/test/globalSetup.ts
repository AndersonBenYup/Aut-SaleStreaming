import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { startEmbeddedPostgres } from '../src/db/embedded.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Un Postgres 16 real y desechable para toda la corrida de pruebas. */
export default async function setup(project: TestProject) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'streamcrm-test-pg-'));
  const pg = await startEmbeddedPostgres({ dataDir: dir, port: 54331, persistent: false });
  project.provide('databaseUrl', pg.url);
  return async () => {
    await pg.stop();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // En Windows Postgres puede tardar en soltar los archivos; es un directorio temporal.
    }
  };
}

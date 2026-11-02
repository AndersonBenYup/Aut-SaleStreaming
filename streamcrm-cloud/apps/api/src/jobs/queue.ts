import { PgBoss } from 'pg-boss';
import { logger } from '../lib/logger.js';

export type JobHandler<T = unknown> = (data: T) => Promise<void>;

export interface SendOptions {
  /** Si ya hay un job con esta clave en cola, no se encola otro. */
  singletonKey?: string;
  startAfterSeconds?: number;
}

const handlers = new Map<string, JobHandler<any>>();
let boss: PgBoss | undefined;

export function registerJob<T>(name: string, handler: JobHandler<T>) {
  handlers.set(name, handler);
}

/**
 * Encola un job. Sin pg-boss iniciado (tests, scripts) se ejecuta en línea y se espera su resultado,
 * así las pruebas son deterministas.
 */
export async function enqueue<T extends object>(name: string, data: T, opts: SendOptions = {}) {
  if (!boss) {
    const h = handlers.get(name);
    if (!h) throw new Error(`Job sin handler: ${name}`);
    await h(data);
    return;
  }
  await boss.send(name, data, {
    singletonKey: opts.singletonKey,
    startAfter: opts.startAfterSeconds,
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
  });
}

export async function startQueue(databaseUrl: string, schedules: { name: string; cron: string }[]) {
  boss = new PgBoss({ connectionString: databaseUrl });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss'));
  await boss.start();
  for (const name of handlers.keys()) {
    await boss.createQueue(name).catch(() => undefined);
    await boss.work<object>(name, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) await handlers.get(name)!(job.data);
    });
  }
  for (const s of schedules) await boss.schedule(s.name, s.cron, {}, { tz: 'UTC' });
  return boss;
}

export async function stopQueue() {
  await boss?.stop({ graceful: true });
  boss = undefined;
}

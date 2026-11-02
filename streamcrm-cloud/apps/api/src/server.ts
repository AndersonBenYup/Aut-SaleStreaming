import './config/dotenv.js';
import { createApp } from './app.js';
import { bootDatabase } from './bootstrap.js';
import { env } from './config/env.js';
import { registerJobs, schedules } from './jobs/index.js';
import { startQueue, stopQueue } from './jobs/queue.js';
import { logger } from './lib/logger.js';

const db = await bootDatabase();
registerJobs();
await startQueue(db.url, schedules());

const server = createApp().listen(env().PORT, () => {
  logger.info(`StreamCRM API en ${env().PUBLIC_URL} (puerto ${env().PORT})`);
});

const shutdown = async () => {
  logger.info('Apagando…');
  server.close();
  await stopQueue();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

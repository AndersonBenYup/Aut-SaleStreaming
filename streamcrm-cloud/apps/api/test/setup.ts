import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { loadEnv, setEnvForTests } from '../src/config/env.js';
import { connect, disconnect, getDb, runMigrations } from '../src/db/index.js';
import { registerJobs } from '../src/jobs/index.js';
import { setSheetClientFactory } from '../src/sheets/sync.js';

export const TEST_RETELL_KEY = 'key_test_retell_123';
export const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

setEnvForTests(
  loadEnv({
    NODE_ENV: 'test',
    ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    RETELL_API_KEY: TEST_RETELL_KEY,
    RETELL_FROM_NUMBER: '+15550000000',
    DATABASE_URL: inject('databaseUrl'),
    DEV_ALLOWED_NUMBERS: '+51987654305,+51987654306,+51987654307,+51987654308,+51987654309,+51911111111,+51922222222',
  }),
);
registerJobs();

beforeAll(async () => {
  connect(inject('databaseUrl'));
  await runMigrations();
});

beforeEach(async () => {
  setSheetClientFactory(null);
  await getDb().execute(
    sql`truncate table tenants, plans, users, webhook_events, events restart identity cascade`,
  );
});

afterAll(async () => {
  await disconnect();
});

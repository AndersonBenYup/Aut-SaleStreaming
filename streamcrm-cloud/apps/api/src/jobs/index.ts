import { env } from '../config/env.js';
import { dispatchDueReminders } from '../modules/reminders.js';
import { recalcStatuses } from '../modules/subscriptions.js';
import { processWebhook } from '../modules/webhooks.js';
import { flushTenantSheet, scanAllSheets, scanTenantSheet } from '../sheets/sync.js';
import { registerJob } from './queue.js';

export function registerJobs() {
  registerJob<{ id: string }>('process-webhook', ({ id }) => processWebhook(id));
  registerJob<{ tenantId: string }>('sheet-flush', async ({ tenantId }) => {
    await flushTenantSheet(tenantId);
  });
  registerJob<{ tenantId: string }>('sheet-scan', async ({ tenantId }) => {
    await scanTenantSheet(tenantId);
  });
  registerJob('sheet-scan-all', () => scanAllSheets());
  registerJob('tick', async () => {
    await recalcStatuses();
    await dispatchDueReminders();
  });
}

export const schedules = () => [
  { name: 'tick', cron: '* * * * *' },
  { name: 'sheet-scan-all', cron: env().SHEET_SCAN_CRON },
];

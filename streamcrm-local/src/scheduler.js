import { maybeDailyBackup } from './backups.js';
import { licenseStatus } from './license.js';
import { dispatchDue, pollRetellCalls, refreshStatuses, releaseStuck } from './reminders.js';

let timer = null;
let running = false;

/**
 * Una vuelta del scheduler (cada 60 s). Todo el estado vive en SQLite, así que si la PC se apaga
 * los avisos pendientes salen en cuanto vuelve a arrancar.
 */
export async function tick(now = new Date()) {
  if (running) return { skipped: true };
  running = true;
  try {
    const statuses = refreshStatuses(now);
    const released = releaseStuck(now);
    const lic = licenseStatus(now);
    const sent = lic.canSend ? await dispatchDue(now) : 0;
    const polled = await pollRetellCalls(now);
    const backup = maybeDailyBackup(now);
    return { statuses, released, sent, polled, backup: backup?.name ?? null, canSend: lic.canSend };
  } finally {
    running = false;
  }
}

export function startScheduler(intervalMs = 60_000) {
  const run = () => tick().catch((err) => console.error('Error en el scheduler:', err));
  setTimeout(run, 3000);
  timer = setInterval(run, intervalMs);
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}

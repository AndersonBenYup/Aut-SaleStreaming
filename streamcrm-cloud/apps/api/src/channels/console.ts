import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';
import type { ReminderChannel } from './types.js';

/** Canal de desarrollo: no llama a nadie, solo muestra en consola lo que se enviaría. */
export const consoleChannel: ReminderChannel = {
  name: 'console',
  async send(p) {
    const externalId = `console_${randomUUID()}`;
    logger.info(
      { to: p.toNumber, subscriptionId: p.subscriptionId, externalId },
      `📞 [console] ${p.businessName} → ${p.customerName}: tu ${p.serviceName} (perfil ${p.profileName}) ` +
        (p.expired ? `venció el ${p.endDateWords}` : p.daysLeft === 0 ? 'vence hoy' : `vence el ${p.endDateWords}, en ${p.daysLeft} días`) +
        `. Renovación S/ ${p.price}`,
    );
    return { externalId };
  },
};

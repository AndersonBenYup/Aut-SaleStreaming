import { env } from '../config/env.js';
import type { ReminderChannel } from './types.js';

export const RETELL_CREATE_CALL_URL = 'https://api.retellai.com/v2/create-phone-call';

export const retellChannel: ReminderChannel = {
  name: 'retell',
  async send(p, cfg) {
    const e = env();
    const from = cfg.retellFromNumber || e.RETELL_FROM_NUMBER;
    if (!e.RETELL_API_KEY || !from) throw new Error('Retell no está configurado (RETELL_API_KEY / número saliente)');
    const res = await fetch(RETELL_CREATE_CALL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.RETELL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_number: from,
        to_number: p.toNumber,
        override_agent_id: e.RETELL_AGENT_ID || undefined,
        metadata: { tenantId: p.tenantId, subscriptionId: p.subscriptionId },
        retell_llm_dynamic_variables: {
          businessName: p.businessName,
          customerName: p.customerName,
          serviceName: p.serviceName,
          profileName: p.profileName,
          endDate: p.endDateWords,
          daysLeft: String(p.daysLeft),
          expired: p.expired ? 'si' : 'no',
          price: p.price,
        },
      }),
    });
    if (!res.ok) throw new Error(`Retell respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { call_id: string };
    return { externalId: body.call_id };
  },
};

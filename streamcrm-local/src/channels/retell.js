export const RETELL_API = 'https://api.retellai.com';

/** Lanza una llamada saliente con el agente del negocio. Devuelve el call_id. */
export async function createRetellCall(p, cfg) {
  if (!cfg.apiKey || !cfg.fromNumber) throw new Error('Retell no está configurado (API key y número saliente)');
  const res = await fetch(`${RETELL_API}/v2/create-phone-call`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_number: cfg.fromNumber,
      to_number: p.toNumber,
      override_agent_id: cfg.agentId || undefined,
      metadata: p.subscriptionId ? { subscriptionId: String(p.subscriptionId) } : { test: true },
      retell_llm_dynamic_variables: {
        businessName: p.businessName,
        customerName: p.customerName,
        serviceName: p.serviceName,
        profileName: p.profileName,
        endDate: p.endDateWords,
        daysLeft: String(p.daysLeft),
        price: p.price,
      },
    }),
  });
  if (!res.ok) throw new Error(`Retell respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return { externalId: body.call_id };
}

/** Respaldo cuando el webhook no llega (PC sin túnel): consulta el estado de la llamada. */
export async function getRetellCall(callId, apiKey) {
  const res = await fetch(`${RETELL_API}/v2/get-call/${encodeURIComponent(callId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Retell get-call respondió ${res.status}`);
  return res.json();
}

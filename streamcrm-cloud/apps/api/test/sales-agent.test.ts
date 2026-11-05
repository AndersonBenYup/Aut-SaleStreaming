import type Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import { chatThreads, salesOffers, subscriptions } from '../src/db/schema.js';
import { encrypt } from '../src/lib/crypto.js';
import { negotiate } from '../src/modules/negotiation.js';
import { buildSystemPrompt, moneyAmounts } from '../src/modules/sales-prompt.js';
import {
  FALLBACK_REPLY,
  handleSalesMessage,
  salesAgentReady,
  setClaudeClient,
  setImageFetcher,
  setTextSender,
} from '../src/modules/sales-agent.js';
import { clearStoreCache, flattenCatalog, setStoreFetch } from '../src/modules/store.js';
import { extractWhatsappMessages, receiveWebhook } from '../src/modules/webhooks.js';
import { createSale } from '../src/modules/subscriptions.js';
import { NOW, createTenant } from './helpers.js';

// ---------------- Regateo (puro) ----------------

describe('regateo', () => {
  const base = { listPrice: 15, minPrice: 14, maxRounds: 2 };

  it('el caso del dueño: piden 13, se ofrece 14 y es el precio final', () => {
    expect(negotiate({ ...base, askedPrice: 13 })).toEqual({ decision: 'contraoferta', price: 14, round: 1, isFinal: true });
    expect(negotiate({ ...base, currentPrice: 14, roundsUsed: 1, askedPrice: 13 })).toEqual({ decision: 'precio_final', price: 14, round: 1, isFinal: true });
  });
  it('acepta si piden algo dentro del escalón, y nunca cobra más de lo vigente', () => {
    expect(negotiate({ ...base, askedPrice: 14.5 })).toMatchObject({ decision: 'acepta', price: 14.5 });
    expect(negotiate({ ...base, askedPrice: 20 })).toMatchObject({ decision: 'acepta', price: 15, round: 0 });
    expect(negotiate({ ...base, currentPrice: 14, roundsUsed: 1, askedPrice: 15 })).toMatchObject({ price: 14 });
  });
  it('baja por escalones y respeta el número de rebajas', () => {
    const wide = { listPrice: 40, minPrice: 30, maxRounds: 2 };
    const r1 = negotiate({ ...wide, askedPrice: 20 });
    expect(r1).toMatchObject({ decision: 'contraoferta', price: 35, isFinal: false });
    const r2 = negotiate({ ...wide, currentPrice: r1.price, roundsUsed: r1.round, askedPrice: 20 });
    expect(r2).toMatchObject({ decision: 'contraoferta', price: 30, isFinal: true });
    const r3 = negotiate({ ...wide, currentPrice: r2.price, roundsUsed: r2.round, askedPrice: 20 });
    expect(r3).toMatchObject({ decision: 'precio_final', price: 30 });
  });
  it('sin precio mínimo o sin rebajas permitidas, el precio es fijo', () => {
    expect(negotiate({ listPrice: 15, minPrice: 15, maxRounds: 2, askedPrice: 10 })).toMatchObject({ decision: 'precio_final', price: 15 });
    expect(negotiate({ ...base, maxRounds: 0, askedPrice: 10 })).toMatchObject({ decision: 'precio_final', price: 15 });
    // un mínimo mal cargado (mayor que la lista) no sube el precio
    expect(negotiate({ listPrice: 15, minPrice: 99, maxRounds: 2 })).toMatchObject({ price: 15 });
  });
});

describe('montos en el texto', () => {
  it('reconoce soles escritos de varias formas', () => {
    expect(moneyAmounts('El perfil está a S/ 15 y el pack S/.35.50')).toEqual([15, 35.5]);
    expect(moneyAmounts('te lo dejo en 14 lucas, o 28 soles los dos')).toEqual([14, 28]);
    expect(moneyAmounts('tengo 2 perfiles libres')).toEqual([]);
  });
});

// ---------------- Tienda simulada (misma regla que Apps Script: precio entre mínimo y lista) ----------------

const RAW_CATALOG = {
  ok: true,
  site: { brand: 'LokiStream', hours: 'Lunes a domingo · 8:00 a 23:00' },
  payment: 'Yape o Plin al 999 999 999',
  platforms: [
    { id: 'netflix', name: 'Netflix', plans: [{ id: '1m', label: '1 mes', months: 1, price: 15, minPrice: 14 }] },
    { id: 'spotify', name: 'Spotify', plans: [{ id: '1m', label: '1 mes', months: 1, price: 10, minPrice: 10 }] },
  ],
  packs: [{ id: 'pack-cine', name: 'Pack Cine', price: 35, minPrice: 32, platforms: ['netflix'] }],
  faq: [{ q: '¿Cómo pago?', a: 'Yape o Plin.' }],
};

interface StoreState {
  orders: any[];
  claims: any[];
}
function fakeStore(): StoreState {
  const state: StoreState = { orders: [], claims: [] };
  setStoreFetch(async (url, init) => {
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
    if (!init?.method || init.method === 'GET') {
      const u = new URL(url);
      return json(u.searchParams.get('key') === 'clave-bot-de-prueba-123' ? RAW_CATALOG : { ok: false, error: 'No autorizado' });
    }
    const body = JSON.parse(String(init.body));
    if (body.botKey !== 'clave-bot-de-prueba-123') return json({ ok: false, error: 'No autorizado' });
    if (body.type === 'payment_claim') {
      state.claims.push(body);
      return json({ ok: true, id: body.id, status: 'Por verificar' });
    }
    let total = 0;
    for (const it of body.items) {
      const plan = it.packId
        ? RAW_CATALOG.packs.find((p) => p.id === it.packId)
        : RAW_CATALOG.platforms.find((p) => p.id === it.platformId)?.plans.find((p) => p.id === it.planId);
      if (!plan || it.price < plan.minPrice || it.price > plan.price) return json({ ok: false, error: 'Precio acordado fuera de rango' });
      total += it.price * (it.profiles ?? 1);
    }
    if (!state.orders.some((o) => o.id === body.id)) state.orders.push(body);
    return json({ ok: true, id: body.id, total });
  });
  return state;
}

// ---------------- Claude simulado: un guion de respuestas ----------------

type Step = (req: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.ContentBlock[] | { refusal: true };
let script: Step[] = [];
const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];

const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Anthropic.TextBlock;
const tool = (name: string, input: object, id = `tu_${Math.random().toString(36).slice(2)}`) =>
  ({ type: 'tool_use', id, name, input, caller: { type: 'direct' } }) as unknown as Anthropic.ToolUseBlock;
/** Último resultado de herramienta que recibió el modelo, como objeto. */
const lastToolResult = (req: Anthropic.MessageCreateParamsNonStreaming) => {
  const last = req.messages[req.messages.length - 1]!;
  const block = (last.content as any[]).find((b) => b.type === 'tool_result');
  return { ...JSON.parse(block.is_error ? '{}' : block.content), _error: block.is_error ? block.content : undefined };
};

function fakeClaude() {
  setClaudeClient({
    messages: {
      async create(req) {
        requests.push(structuredClone(req));
        const step = script.shift();
        if (!step) throw new Error('El guion de Claude se quedó sin pasos');
        const out = step(req);
        const refusal = 'refusal' in out;
        const content = refusal ? [] : out;
        return {
          id: `msg_${requests.length}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content,
          stop_reason: refusal ? 'refusal' : content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
          stop_sequence: null,
          stop_details: null,
          usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
        } as unknown as Anthropic.Message;
      },
    },
  });
}

let sent: { to: string; text: string }[] = [];
let store: StoreState;

beforeEach(() => {
  script = [];
  requests.length = 0;
  sent = [];
  clearStoreCache();
  store = fakeStore();
  fakeClaude();
  setTextSender(async (_t, to, t) => {
    sent.push({ to, text: t });
  });
  setImageFetcher(async () => ({ mediaType: 'image/jpeg', data: 'aGVsbG8=' }));
});
afterEach(() => {
  setClaudeClient(undefined);
  setTextSender(null);
});

async function sellerTenant(values: Record<string, unknown> = {}) {
  return createTenant({
    salesAgentEnabled: true,
    storeApiUrl: 'https://script.google.com/macros/s/TEST/exec',
    storeBotKeyEnc: encrypt('clave-bot-de-prueba-123'),
    ownerNotifyPhone: '+51911111111',
    whatsappPhoneNumberId: 'PNID-1',
    ...values,
  });
}
let seq = 0;
const msg = (textBody: string, extra: Partial<{ imageId: string; from: string }> = {}) => ({
  messageId: `wamid.${++seq}`,
  from: extra.from ?? '51987654321',
  text: textBody,
  imageId: extra.imageId,
});
const thread = async (tenantId: string) => (await getDb().select().from(chatThreads).where(eq(chatThreads.tenantId, tenantId)))[0]!;

// ---------------- Conversaciones ----------------

describe('vendedor por WhatsApp', () => {
  it('cotiza, regatea de 15 a 14 y cierra el pedido con el precio acordado', async () => {
    const t = await sellerTenant();
    expect(salesAgentReady(t)).toBe(true);

    script = [() => [text('Hola causa 👋 el perfil de Netflix está a S/ 15 al mes. ¿Cuántos necesitas?')]];
    await handleSalesMessage(t, msg('hola cuanto el netflix'), NOW);
    expect(sent.at(-1)!.text).toContain('S/ 15');
    // El prompt fijo trae el catálogo con precios de lista, pero no los mínimos.
    expect(String(requests[0]!.system)).toContain('netflix:1m');
    expect(String(requests[0]!.system)).not.toContain('S/ 14');
    expect(requests[0]!.model).toBe('claude-haiku-5-5');

    script = [
      () => [tool('cotizar_rebaja', { producto: 'netflix:1m', precio_pedido: 13 })],
      (req) => {
        const r = lastToolResult(req);
        expect(r).toMatchObject({ decision: 'contraoferta', precio_por_perfil: 'S/ 14', es_precio_final: true });
        return [text(`Uy, a ese precio no me sale 😅 lo máximo que te puedo dejar es a ${r.precio_por_perfil}. ¿Te lo separo?`)];
      },
    ];
    await handleSalesMessage(t, msg('déjamelo a 13 pe'), NOW);
    expect(sent.at(-1)!.text).toContain('S/ 14');

    script = [
      () => [tool('crear_pedido', { nombre: 'Ana Torres', productos: [{ producto: 'netflix:1m', perfiles: 1 }], acepta_avisos: true })],
      (req) => {
        const r = lastToolResult(req);
        return [text(`Listo Ana, tu pedido es *${r.pedido}* por *${r.total}*. Yapéame al 999 999 999 y me mandas la captura 🙌`)];
      },
    ];
    await handleSalesMessage(t, msg('ya dale, a nombre de Ana Torres. sí avísame'), NOW);

    expect(store.orders).toHaveLength(1);
    const order = store.orders[0];
    expect(order.items).toEqual([{ platformId: 'netflix', planId: '1m', profiles: 1, price: 14 }]);
    expect(order.customer).toEqual({ name: 'Ana Torres', phone: '51987654321' });
    expect(order.consent).toBe(true);
    expect(sent.at(-1)!.text).toContain(order.id);
    expect(sent.at(-1)!.text).toContain('S/ 14');

    const th = await thread(t.id);
    expect(th.lastOrderId).toBe(order.id);
    expect(th.cacheReadTokens).toBeGreaterThan(0);
    // historial solo-agregar: cada pedido a Claude empieza con el historial anterior intacto
    const first = requests[1]!.messages.slice(0, 2);
    expect(requests.at(-1)!.messages.slice(0, 2)).toEqual(first);
    const [offer] = await getDb().select().from(salesOffers).where(eq(salesOffers.threadId, th.id));
    expect(offer!.usedAt).not.toBeNull();
  });

  it('si la IA inventa un precio, se le pide corregir antes de enviar', async () => {
    const t = await sellerTenant();
    script = [
      () => [text('Para ti te lo dejo a S/ 9, causa')],
      (req) => {
        const last = req.messages.at(-1)!;
        expect(JSON.stringify(last.content)).toContain('S/ 9');
        return [text('Te confirmo: el perfil de Netflix está a S/ 15 al mes.')];
      },
    ];
    await handleSalesMessage(t, msg('precio netflix?'), NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toBe('Te confirmo: el perfil de Netflix está a S/ 15 al mes.');
  });

  it('si insiste con un precio inventado, no lo envía y pasa el chat a una persona', async () => {
    const t = await sellerTenant();
    script = [() => [text('Te lo dejo a S/ 5')], () => [text('Ya, a S/ 5 entonces')]];
    await handleSalesMessage(t, msg('déjamelo baratito'), NOW);
    expect(sent.find((s) => s.to === '+51987654321')!.text).toBe(FALLBACK_REPLY);
    expect(sent.some((s) => s.to === '+51911111111' && /necesita a una persona/.test(s.text))).toBe(true);
    const th = await thread(t.id);
    expect(th.botPausedUntil!.getTime()).toBeGreaterThan(NOW.getTime());

    // Con el chat en pausa el bot no responde ni gasta.
    const before = requests.length;
    await handleSalesMessage(t, msg('hola?'), new Date(NOW.getTime() + 60_000));
    expect(requests.length).toBe(before);
  });

  it('la tienda rechaza un precio por debajo del mínimo aunque el bot lo intente', async () => {
    const t = await sellerTenant();
    // Sin oferta guardada se cobra el precio de lista: el pedido sale a 15, no a lo que diga la IA.
    script = [
      () => [tool('crear_pedido', { nombre: 'Luis', productos: [{ producto: 'netflix:1m', perfiles: 2 }], acepta_avisos: false })],
      (req) => [text(`Listo, tu pedido es ${lastToolResult(req).pedido} por ${lastToolResult(req).total}`)],
    ];
    await handleSalesMessage(t, msg('quiero 2 netflix'), NOW);
    expect(store.orders[0].items[0]).toMatchObject({ profiles: 2, price: 15 });
    expect(sent[0]!.text).toContain('S/ 30');
  });

  it('registra el comprobante solo si llegó una imagen y avisa al dueño', async () => {
    const t = await sellerTenant();
    script = [
      () => [tool('registrar_comprobante', { pedido: 'LK-ABC234', metodo: 'Yape', monto: 14 })],
      (req) => {
        expect(lastToolResult(req)._error).toMatch(/no llegó ninguna imagen/);
        return [text('¿Me mandas la captura del Yape porfa?')];
      },
    ];
    await handleSalesMessage(t, msg('ya pagué'), NOW);
    expect(store.claims).toHaveLength(0);

    script = [
      (req) => {
        const user = req.messages.at(-1)!.content as any[];
        expect(user.some((b) => b.type === 'image')).toBe(true);
        return [tool('registrar_comprobante', { pedido: 'LK-ABC234', metodo: 'Yape', monto: 14, operacion: '00123' })];
      },
      () => [text('Recibido 🙌 lo estoy verificando y apenas se confirme te llegan los accesos por aquí.')],
    ];
    await handleSalesMessage(t, msg('', { imageId: 'media-1' }), NOW);
    expect(store.claims[0]).toMatchObject({ type: 'payment_claim', id: 'LK-ABC234', amount: 14, method: 'Yape', operation: '00123' });
    expect(sent.some((s) => s.to === '+51911111111' && s.text.includes('LK-ABC234'))).toBe(true);
  });

  it('las respuestas a un aviso de vencimiento quedan como intención de renovación', async () => {
    const t = await sellerTenant();
    const sub = await createSale(
      t.id,
      { customer: { name: 'María Flores', phone: '987654321', consentCalls: true }, serviceName: 'NETFLIX 1 Perfil', durationDays: 30, price: 15, startDate: '2026-10-01', profileName: 'María' },
      { now: NOW },
    );
    await getDb().update(subscriptions).set({ reminderStatus: 'enviado' }).where(eq(subscriptions.id, sub.id));
    script = [
      () => [tool('estado_suscripcion', {})],
      (req) => {
        expect(lastToolResult(req).suscripciones[0]).toMatchObject({ servicio: 'NETFLIX 1 Perfil', aviso_enviado: true, precio_renovacion: 'S/ 15' });
        return [tool('confirmar_renovacion', { decision: 'renueva' })];
      },
      () => [text('Bacán María, serían S/ 15. Yapéame al 999 999 999 y me pasas la captura 🙌')],
    ];
    await handleSalesMessage(t, msg('sí renuevo'), NOW);
    const [after] = await getDb().select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(after!.renewalIntent).toBe('renueva');
    expect(after!.reminderStatus).toBe('respondido');
    // El primer mensaje del hilo lleva el contexto: ya es cliente.
    expect(JSON.stringify(requests[0]!.messages[0])).toContain('Ya es cliente: María Flores');
  });

  it('si la API se niega a responder, no guarda el turno y pasa a una persona', async () => {
    const t = await sellerTenant();
    script = [() => ({ refusal: true })];
    await handleSalesMessage(t, msg('mensaje raro'), NOW);
    expect(sent.find((s) => s.to === '+51987654321')!.text).toBe(FALLBACK_REPLY);
    const th = await thread(t.id);
    expect(th.messages).toEqual([]);
    expect(th.botPausedUntil).not.toBeNull();
  });

  it('un hilo nuevo empieza tras 24 h sin mensajes', async () => {
    const t = await sellerTenant();
    script = [() => [text('Hola 👋')], () => [text('Hola de nuevo 👋')]];
    await handleSalesMessage(t, msg('hola'), NOW);
    await handleSalesMessage(t, msg('hola otra vez'), new Date(NOW.getTime() + 25 * 3600_000));
    const rows = await getDb().select().from(chatThreads).where(eq(chatThreads.tenantId, t.id));
    expect(rows).toHaveLength(2);
    expect(requests[1]!.messages).toHaveLength(1);
  });
});

describe('webhook de WhatsApp', () => {
  it('extrae texto, captura de pantalla y nombre de perfil', () => {
    const out = extractWhatsappMessages({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'PNID-1' },
                contacts: [{ wa_id: '51987654321', profile: { name: 'Ana' } }],
                messages: [
                  { from: '51987654321', id: 'wamid.a', type: 'text', text: { body: 'hola' } },
                  { from: '51987654321', id: 'wamid.b', type: 'image', image: { id: 'media-9', caption: 'ahí va' } },
                  { from: '51987654321', id: 'wamid.c', type: 'image', image: { id: 'media-10' } },
                  { from: '51987654321', id: 'wamid.d', type: 'sticker', sticker: { id: 'x' } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(out.map((m) => [m.messageId, m.text, m.imageId, m.profileName])).toEqual([
      ['wamid.a', 'hola', undefined, 'Ana'],
      ['wamid.b', 'ahí va', 'media-9', 'Ana'],
      ['wamid.c', '', 'media-10', 'Ana'],
    ]);
  });

  it('con el vendedor encendido el mensaje lo atiende la IA; apagado, se usa la interpretación por palabras', async () => {
    const t = await sellerTenant();
    script = [() => [text('Hola causa 👋')]];
    await receiveWebhook('whatsapp', 'wamid.x1', { phoneNumberId: 'PNID-1', from: '51987654321', messageId: 'wamid.x1', text: 'hola' });
    expect(sent).toEqual([{ to: '+51987654321', text: 'Hola causa 👋' }]);

    await createTenant({ whatsappPhoneNumberId: 'PNID-2' });
    await receiveWebhook('whatsapp', 'wamid.x2', { phoneNumberId: 'PNID-2', from: '51987654321', messageId: 'wamid.x2', text: 'hola' });
    expect(requests).toHaveLength(1); // el segundo negocio no gastó IA
  });
});

describe('catálogo para el vendedor', () => {
  it('aplana planes y packs y el prompt no expone los mínimos', () => {
    const c = flattenCatalog(RAW_CATALOG);
    expect(c.items.map((i) => [i.key, i.price, i.minPrice])).toEqual([
      ['netflix:1m', 15, 14],
      ['spotify:1m', 10, 10],
      ['pack:pack-cine', 35, 32],
    ]);
    const prompt = buildSystemPrompt(c, null, 2);
    expect(prompt).toContain('Pack Cine (1 mes) (incluye Netflix) — S/ 35');
    expect(prompt).not.toMatch(/S\/ (32|14)\b/);
    expect(prompt).toContain('causa'); // manual de tono por defecto
    expect(buildSystemPrompt(c, 'Habla formal, de usted.', 0)).toContain('Habla formal, de usted.');
  });
});

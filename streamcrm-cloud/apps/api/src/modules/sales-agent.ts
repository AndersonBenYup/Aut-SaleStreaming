/**
 * Vendedor por WhatsApp con IA (Claude Haiku 5.5 por defecto).
 *
 * La IA conversa; los números los pone el servidor:
 *   - las rebajas salen de negotiate() y quedan guardadas en sales_offers,
 *   - el pedido usa el precio guardado, no el que diga el texto,
 *   - la tienda (Apps Script) vuelve a comprobar el PRECIO MINIMO,
 *   - antes de enviar, si la respuesta trae un monto que nadie ofreció, se pide corregirla.
 *
 * El historial de cada chat se guarda tal cual lo devuelve la API y solo se agrega al final
 * (nunca se edita): así la caché del prompt sigue sirviendo y los bloques de razonamiento siguen válidos.
 */
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { env } from '../config/env.js';
import { getDb, getPool, type Db } from '../db/index.js';
import { chatThreads, customers, salesOffers, services, subscriptions } from '../db/schema.js';
import { decrypt } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { normalizePhone } from '../lib/phone.js';
import { downloadWhatsappImage, sendWhatsappText, type WhatsappCredentials } from '../channels/whatsapp.js';
import { formatPrice, negotiate, round2 } from './negotiation.js';
import { buildSystemPrompt, moneyAmounts } from './sales-prompt.js';
import { getOpenRouterClient } from './openrouter-client.js';
import {
  createStoreOrder,
  getStoreCatalog,
  sendPaymentClaim,
  storeConfig,
  type StoreCatalog,
  type StoreConfig,
  type StoreItem,
} from './store.js';
import { applyIntent, logEvent, type Tenant } from './subscriptions.js';

type Thread = typeof chatThreads.$inferSelect;

const THREAD_IDLE_MS = 24 * 3600_000; // la ventana de servicio de WhatsApp
const THREAD_MAX_MESSAGES = 80; // hilo largo → se empieza uno nuevo (no se recorta el viejo)
const OFFER_TTL_MS = 24 * 3600_000;
const HANDOFF_PAUSE_MS = 12 * 3600_000;
const MAX_STEPS = 6;
/** Una respuesta normal de WhatsApp (1 a 3 líneas) nunca llega a esto. Por encima, algunos modelos gratis
 * de OpenRouter filtran su razonamiento interno dentro del texto en vez de mandarlo aparte: se trata igual
 * que un precio inventado (se le pide corregir, y si insiste, pasa a una persona). */
const MAX_REPLY_CHARS = 900;

export const FALLBACK_REPLY = 'Dame un toque, confirmo eso y te escribo al toque 🙌';

// ---------------- Dependencias reemplazables (tests) ----------------

export interface ClaudeClient {
  messages: { create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}
let claude: ClaudeClient | null | undefined;
export const setClaudeClient = (c: ClaudeClient | null | undefined) => {
  claude = c;
};
function getClaude(): ClaudeClient | null {
  if (claude !== undefined) return claude;
  const e = env();
  if (e.SALES_AGENT_PROVIDER === 'openrouter') {
    claude = getOpenRouterClient();
    return claude;
  }
  const key = e.ANTHROPIC_API_KEY;
  claude = key ? (new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 }) as unknown as ClaudeClient) : null;
  return claude;
}

export type TextSender = (t: Tenant, to: string, text: string) => Promise<void>;
const defaultSender: TextSender = async (t, to, text) => {
  const cred = whatsappCredentials(t);
  const e = env();
  if (!cred || (e.NODE_ENV !== 'production' && !e.DEV_ALLOWED_NUMBERS.includes(to))) {
    logger.info({ tenantId: t.id, to }, `💬 [console] ${t.name} → ${to}: ${text}`);
    return;
  }
  await sendWhatsappText(cred, to, text);
};
let sendText: TextSender = defaultSender;
export const setTextSender = (s: TextSender | null) => {
  sendText = s ?? defaultSender;
};

export type ImageFetcher = (t: Tenant, mediaId: string) => Promise<{ mediaType: Anthropic.Base64ImageSource['media_type']; data: string }>;
let fetchImage: ImageFetcher = async (t, mediaId) => {
  const cred = whatsappCredentials(t);
  if (!cred) throw new Error('WhatsApp no está configurado');
  return downloadWhatsappImage(cred, mediaId);
};
export const setImageFetcher = (f: ImageFetcher) => {
  fetchImage = f;
};

function whatsappCredentials(t: Tenant): WhatsappCredentials | null {
  const token = decrypt(t.whatsappTokenEnc);
  return t.whatsappPhoneNumberId && token ? { phoneNumberId: t.whatsappPhoneNumberId, token } : null;
}

// ---------------- Entrada ----------------

export interface IncomingMessage {
  messageId: string;
  from: string;
  text: string;
  imageId?: string;
  profileName?: string;
}

/** ¿Este negocio tiene el vendedor encendido y listo? Si no, se usa la interpretación por palabras. */
export function salesAgentReady(t: Tenant): boolean {
  return t.salesAgentEnabled && !!storeConfig(t) && !!getClaude();
}

/**
 * Atiende un mensaje entrante. Un candado por número evita que dos mensajes seguidos del mismo
 * cliente se procesen a la vez (el segundo espera al primero y ve su respuesta en el historial).
 */
export async function handleSalesMessage(t: Tenant, m: IncomingMessage, now = new Date()) {
  const phone = normalizePhone(m.from, t.country);
  if (!phone) return;
  const lock = await getPool().connect();
  const lockKey = `sales:${t.id}:${phone}`;
  try {
    await lock.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
    await runTurn(getDb(), t, phone, m, now);
  } finally {
    await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => undefined);
    lock.release();
  }
}

async function currentThread(db: Db, t: Tenant, phone: string, now: Date): Promise<Thread> {
  const [last] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.tenantId, t.id), eq(chatThreads.phone, phone)))
    .orderBy(desc(chatThreads.lastMessageAt))
    .limit(1);
  if (last && now.getTime() - last.lastMessageAt.getTime() < THREAD_IDLE_MS && last.messages.length < THREAD_MAX_MESSAGES) return last;
  const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, t.id), eq(customers.phone, phone)));
  const [created] = await db
    .insert(chatThreads)
    .values({ tenantId: t.id, phone, customerId: customer?.id ?? null, lastMessageAt: now, botPausedUntil: last?.botPausedUntil ?? null })
    .returning();
  return created!;
}

/** Contexto que solo va en el primer mensaje del hilo (no cambia el prompt fijo → la caché sigue sirviendo). */
async function firstTurnContext(db: Db, t: Tenant, thread: Thread, m: IncomingMessage, now: Date) {
  const parts = [`[Sistema · contexto, no lo menciones] Fecha: ${now.toLocaleDateString('es-PE', { timeZone: t.timezone, dateStyle: 'full' })}.`];
  if (m.profileName) parts.push(`Nombre en WhatsApp: ${m.profileName.slice(0, 60)}.`);
  if (thread.customerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, thread.customerId));
    if (c) parts.push(`Ya es cliente: ${c.name}. Si pregunta por su cuenta o renovación, usa estado_suscripcion.`);
  } else {
    parts.push('Cliente nuevo (no tiene compras registradas con este número).');
  }
  return parts.join(' ');
}

async function runTurn(db: Db, t: Tenant, phone: string, m: IncomingMessage, now: Date) {
  const client = getClaude();
  const cfg = storeConfig(t);
  if (!client || !cfg) return;
  const thread = await currentThread(db, t, phone, now);
  await logEvent(db, { tenantId: t.id, type: 'whatsapp.inbound', entity: 'chat', entityId: thread.id, data: { text: m.text.slice(0, 500), image: !!m.imageId } });

  if (thread.botPausedUntil && thread.botPausedUntil > now) {
    // Una persona del equipo tiene el chat: el bot no se mete.
    await db.update(chatThreads).set({ lastMessageAt: now }).where(eq(chatThreads.id, thread.id));
    return;
  }

  const catalog = await getStoreCatalog(cfg);
  const system = buildSystemPrompt(catalog, t.salesToneGuide, t.salesMaxDiscountRounds);

  // Mensaje del cliente (texto + captura, si mandó una)
  const content: Anthropic.ContentBlockParam[] = [];
  if (thread.messages.length === 0) content.push({ type: 'text', text: await firstTurnContext(db, t, thread, m, now) });
  let hadImage = false;
  if (m.imageId) {
    try {
      const img = await fetchImage(t, m.imageId);
      content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
      hadImage = true;
    } catch (err) {
      logger.warn({ err, tenantId: t.id }, 'no se pudo descargar la imagen del cliente');
      content.push({ type: 'text', text: '[Sistema] El cliente mandó una imagen que no se pudo abrir: pídele que la reenvíe.' });
    }
  }
  content.push({ type: 'text', text: m.text.trim() || (hadImage ? '(mandó una imagen)' : '(mensaje vacío)') });

  const history = thread.messages as Anthropic.MessageParam[];
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content }];
  const ctx: ToolContext = { db, t, thread, phone, catalog, cfg, hadImage, messageId: m.messageId, now, orderCount: 0, handedOff: false };
  const usage = { input: 0, output: 0, cacheRead: 0 };

  let reply: string | null = null;
  let corrected = false;
  for (let step = 0; step < MAX_STEPS && reply === null; step++) {
    const res = await client.messages.create({
      model: env().SALES_AGENT_MODEL,
      max_tokens: 4000,
      system,
      tools: TOOLS,
      messages,
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
    });
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;

    if (res.stop_reason === 'refusal') {
      // No se guarda nada de este turno (el historial queda como estaba): el chat pasa a una persona.
      messages.length = history.length;
      await handoff(ctx, 'La IA no pudo responder este mensaje');
      reply = FALLBACK_REPLY;
      break;
    }
    messages.push({ role: 'assistant', content: res.content });

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (res.stop_reason === 'tool_use' && toolUses.length) {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) results.push(await runTool(ctx, tu));
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const unknown = moneyAmounts(text).filter((a) => !allowedAmounts(catalog, messages).has(a));
    const tooLong = text.length > MAX_REPLY_CHARS;
    if ((unknown.length || tooLong) && !corrected) {
      corrected = true;
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: tooLong
              ? '[Sistema] Tu respuesta es demasiado larga y parece traer razonamiento interno en vez del mensaje final. Reescríbela: solo el mensaje corto (1 a 3 líneas) que le mandarías al cliente, sin explicar tu proceso.'
              : `[Sistema] Tu respuesta menciona ${unknown.map(formatPrice).join(', ')}, que no es un precio del catálogo ni de las herramientas. Reescríbela usando solo esos precios (para una rebaja, usa cotizar_rebaja).`,
          },
        ],
      });
      continue;
    }
    if (unknown.length || tooLong || !text) {
      await handoff(
        ctx,
        tooLong
          ? `Respuesta demasiado larga (${text.length} caracteres), posible fuga de razonamiento del modelo`
          : unknown.length
            ? `Precio no autorizado en la respuesta: ${unknown.join(', ')}`
            : 'Respuesta vacía',
      );
      reply = FALLBACK_REPLY;
      break;
    }
    reply = text;
  }
  if (reply === null) {
    await handoff(ctx, 'La conversación necesitó demasiados pasos');
    reply = FALLBACK_REPLY;
  }

  await db
    .update(chatThreads)
    .set({
      messages: messages as unknown[],
      lastMessageAt: now,
      inputTokens: thread.inputTokens + usage.input,
      outputTokens: thread.outputTokens + usage.output,
      cacheReadTokens: thread.cacheReadTokens + usage.cacheRead,
      ...(ctx.lastOrderId ? { lastOrderId: ctx.lastOrderId } : {}),
    })
    .where(eq(chatThreads.id, thread.id));
  await sendText(t, phone, reply);
  await logEvent(db, { tenantId: t.id, type: 'sales_agent.reply', entity: 'chat', entityId: thread.id, data: { text: reply.slice(0, 500), usage } });
}

/**
 * Montos que la respuesta puede mencionar: precios del catálogo y los que salieron de las herramientas
 * en este chat, con sus múltiplos por 1–6 perfiles. Lo que propone el cliente no cuenta (el bot no lo repite:
 * "a ese precio no me sale"). El precio que de verdad se cobra lo fija el pedido, no el texto.
 */
function allowedAmounts(c: StoreCatalog, messages: Anthropic.MessageParam[]) {
  const base = new Set<number>(c.items.map((i) => round2(i.price)));
  for (const msg of messages) {
    if (msg.role !== 'user' || typeof msg.content === 'string') continue;
    for (const b of msg.content) {
      if (b.type !== 'tool_result' || b.is_error) continue;
      const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((x) => (x.type === 'text' ? x.text : '')).join(' ');
      for (const a of moneyAmounts(text)) base.add(a);
    }
  }
  const out = new Set<number>();
  for (const p of base) for (let k = 1; k <= 6; k++) out.add(round2(p * k));
  return out;
}

// ---------------- Herramientas ----------------

interface ToolContext {
  db: Db;
  t: Tenant;
  thread: Thread;
  phone: string;
  catalog: StoreCatalog;
  cfg: StoreConfig;
  hadImage: boolean;
  messageId: string;
  now: Date;
  orderCount: number;
  lastOrderId?: string;
  handedOff: boolean;
}

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'cotizar_rebaja',
    description:
      'Úsala cuando el cliente pide rebaja o propone un precio para un producto. Devuelve el precio que puedes ofrecer (acepta, contraoferta o precio final). Sin precio_pedido devuelve el precio vigente.',
    strict: true,
    input_schema: obj(
      {
        producto: { type: 'string', description: 'Código del catálogo, p. ej. netflix:1m o pack:pack-cine' },
        precio_pedido: { type: 'number', description: 'Precio por perfil que propone el cliente, en soles' },
      },
      ['producto'],
    ),
  },
  {
    name: 'crear_pedido',
    description:
      'Registra el pedido cuando el cliente ya aceptó. Usa el precio acordado en este chat (o el de lista). Devuelve el código del pedido, el total y cómo pagar.',
    strict: true,
    input_schema: obj(
      {
        nombre: { type: 'string', description: 'Nombre del cliente' },
        productos: {
          type: 'array',
          items: obj(
            {
              producto: { type: 'string', description: 'Código del catálogo' },
              perfiles: { type: 'integer', description: 'Cantidad de perfiles (1 a 6). Para packs, 1.' },
            },
            ['producto', 'perfiles'],
          ),
        },
        acepta_avisos: { type: 'boolean', description: 'true si aceptó que le avisen por aquí antes de que venza' },
      },
      ['nombre', 'productos', 'acepta_avisos'],
    ),
  },
  {
    name: 'registrar_comprobante',
    description:
      'Úsala cuando el cliente manda la captura del pago (Yape, Plin, transferencia). Copia lo que lees en la imagen. El pedido queda «por verificar»: no lo des por pagado.',
    strict: true,
    input_schema: obj(
      {
        pedido: { type: 'string', description: 'Código LK-… del pedido (si no lo sabes, omítelo: se usa el último del chat)' },
        metodo: { type: 'string', enum: ['Yape', 'Plin', 'Transferencia', 'Otro'] },
        monto: { type: 'number', description: 'Monto que se ve en la captura' },
        operacion: { type: 'string', description: 'Número de operación, si se ve' },
        pagador: { type: 'string', description: 'Nombre de quien pagó, si se ve' },
      },
      ['metodo'],
    ),
  },
  {
    name: 'estado_suscripcion',
    description: 'Muestra las suscripciones de este número: servicio, vencimiento, precio de renovación y si se le envió aviso.',
    strict: true,
    input_schema: obj({}, []),
  },
  {
    name: 'confirmar_renovacion',
    description: 'Registra lo que decidió el cliente sobre la renovación de su suscripción que está por vencer.',
    strict: true,
    input_schema: obj({ decision: { type: 'string', enum: ['renueva', 'no_renueva', 'pensando'] } }, ['decision']),
  },
  {
    name: 'pasar_a_humano',
    description: 'Pasa el chat a una persona del equipo (quejas, problemas de cuenta, pedidos raros, o si lo pide). El bot deja de responder en este chat.',
    strict: true,
    input_schema: obj({ motivo: { type: 'string', description: 'Resumen corto para el dueño' } }, ['motivo']),
  },
];

const ok = (data: unknown) => JSON.stringify(data);
class ToolError extends Error {}

async function runTool(ctx: ToolContext, tu: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const input = (tu.input ?? {}) as Record<string, any>;
  try {
    let out: string;
    switch (tu.name) {
      case 'cotizar_rebaja':
        out = await quote(ctx, String(input.producto ?? ''), typeof input.precio_pedido === 'number' ? input.precio_pedido : null);
        break;
      case 'crear_pedido':
        out = await createOrder(ctx, input);
        break;
      case 'registrar_comprobante':
        out = await paymentClaim(ctx, input);
        break;
      case 'estado_suscripcion':
        out = await subscriptionStatus(ctx);
        break;
      case 'confirmar_renovacion':
        out = await renewalDecision(ctx, String(input.decision ?? ''));
        break;
      case 'pasar_a_humano':
        await handoff(ctx, String(input.motivo ?? 'Sin motivo'));
        out = ok({ ok: true, nota: 'Listo: una persona del equipo continúa este chat. Avísale al cliente que en un ratito le escriben.' });
        break;
      default:
        throw new ToolError(`Herramienta desconocida: ${tu.name}`);
    }
    return { type: 'tool_result', tool_use_id: tu.id, content: out };
  } catch (err) {
    if (!(err instanceof ToolError)) logger.warn({ err, tool: tu.name, tenantId: ctx.t.id }, 'falló una herramienta del vendedor');
    const msg = err instanceof ToolError ? err.message : 'Error interno: no se pudo completar. Si el cliente espera algo, usa pasar_a_humano.';
    return { type: 'tool_result', tool_use_id: tu.id, content: msg, is_error: true };
  }
}

function itemFor(ctx: ToolContext, key: string): StoreItem {
  const item = ctx.catalog.items.find((i) => i.key === key.trim().toLowerCase());
  if (!item) throw new ToolError(`No existe el producto "${key}". Usa un código del catálogo.`);
  return item;
}

async function latestOffer(ctx: ToolContext, key: string) {
  const [o] = await ctx.db
    .select()
    .from(salesOffers)
    .where(and(eq(salesOffers.threadId, ctx.thread.id), eq(salesOffers.itemKey, key), gt(salesOffers.expiresAt, ctx.now), isNull(salesOffers.usedAt)))
    .orderBy(desc(salesOffers.createdAt), desc(salesOffers.round))
    .limit(1);
  return o ?? null;
}

async function quote(ctx: ToolContext, key: string, asked: number | null) {
  const item = itemFor(ctx, key);
  const prev = await latestOffer(ctx, item.key);
  const r = negotiate({
    listPrice: item.price,
    minPrice: item.minPrice,
    currentPrice: prev ? Number(prev.price) : null,
    roundsUsed: prev?.round ?? 0,
    maxRounds: ctx.t.salesMaxDiscountRounds,
    askedPrice: asked,
  });
  await ctx.db.insert(salesOffers).values({
    tenantId: ctx.t.id,
    threadId: ctx.thread.id,
    itemKey: item.key,
    listPrice: String(item.price),
    price: String(r.price),
    round: r.round,
    expiresAt: new Date(ctx.now.getTime() + OFFER_TTL_MS),
  });
  const nota = {
    precio: 'Precio vigente.',
    acepta: 'Puedes aceptar este precio.',
    contraoferta: 'No llega a lo que pidió: ofrece este precio.',
    precio_final: 'Ya no se puede bajar más: este es el precio final.',
  }[r.decision];
  return ok({ producto: item.name, decision: r.decision, precio_por_perfil: formatPrice(r.price), es_precio_final: r.isFinal, nota });
}

/** Mismo código para el mismo mensaje: si el job se reintenta, la tienda no duplica el pedido. */
function orderIdFor(seed: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const h = createHash('sha256').update(seed).digest();
  return 'LK-' + Array.from(h.subarray(0, 6), (b) => alphabet[b % alphabet.length]).join('');
}

async function createOrder(ctx: ToolContext, input: Record<string, any>) {
  const name = String(input.nombre ?? '').trim().slice(0, 80);
  if (name.length < 2) throw new ToolError('Falta el nombre del cliente: pregúntaselo.');
  const productos: { producto: string; perfiles: number }[] = Array.isArray(input.productos) ? input.productos.slice(0, 10) : [];
  if (!productos.length) throw new ToolError('El pedido no tiene productos.');
  const lines = [];
  const offerIds: string[] = [];
  for (const p of productos) {
    const item = itemFor(ctx, String(p.producto ?? ''));
    const isPack = item.key.startsWith('pack:');
    const profiles = isPack ? 1 : Math.round(Number(p.perfiles) || 1);
    if (profiles < 1 || profiles > 6) throw new ToolError('Los perfiles van de 1 a 6 por producto.');
    const offer = await latestOffer(ctx, item.key);
    if (offer) offerIds.push(offer.id);
    lines.push({ key: item.key, profiles, price: offer ? Number(offer.price) : item.price, name: item.name });
  }
  const id = orderIdFor(`${ctx.t.id}:${ctx.messageId}:${ctx.orderCount++}`);
  const res = await createStoreOrder(ctx.cfg, {
    id,
    name,
    phone: ctx.phone,
    consent: input.acepta_avisos === true,
    lines,
    note: `Chat ${ctx.thread.id.slice(0, 8)}`,
  });
  if (!res.ok) throw new ToolError(`La tienda no aceptó el pedido: ${res.error ?? 'sin detalle'}`);
  if (offerIds.length) await ctx.db.update(salesOffers).set({ usedAt: ctx.now }).where(inArray(salesOffers.id, offerIds));
  ctx.lastOrderId = id;
  const total = res.total ?? round2(lines.reduce((s, l) => s + l.price * l.profiles, 0));
  await logEvent(ctx.db, { tenantId: ctx.t.id, type: 'sales_agent.order', entity: 'chat', entityId: ctx.thread.id, data: { orderId: id, total, lines } });
  return ok({
    ok: true,
    pedido: id,
    detalle: lines.map((l) => `${l.name} × ${l.profiles} = ${formatPrice(round2(l.price * l.profiles))}`),
    total: formatPrice(total),
    como_pagar: ctx.catalog.payment,
    siguiente_paso: 'Pásale el código, el total y cómo pagar, y pídele la captura del pago por aquí.',
  });
}

async function paymentClaim(ctx: ToolContext, input: Record<string, any>) {
  if (!ctx.hadImage) throw new ToolError('En este mensaje no llegó ninguna imagen: pídele la captura del pago.');
  const orderId = String(input.pedido ?? ctx.lastOrderId ?? ctx.thread.lastOrderId ?? '').toUpperCase();
  const claim = {
    amount: typeof input.monto === 'number' ? input.monto : null,
    method: String(input.metodo ?? 'Otro'),
    operation: input.operacion ? String(input.operacion) : null,
    payer: input.pagador ? String(input.pagador) : null,
  };
  if (!orderId) {
    // Probablemente una renovación: el dueño la registra desde el panel.
    await notifyOwner(ctx, `💸 ${ctx.phone} mandó un comprobante sin pedido (${claim.method} ${claim.amount ?? '¿?'}). Revisa el chat y registra la renovación.`);
    await logEvent(ctx.db, { tenantId: ctx.t.id, type: 'sales_agent.payment_claim', entity: 'chat', entityId: ctx.thread.id, data: claim });
    return ok({ ok: true, nota: 'Se avisó al equipo para que verifique el pago y registre la renovación.' });
  }
  const res = await sendPaymentClaim(ctx.cfg, { id: orderId, ...claim });
  if (!res.ok) throw new ToolError(`No se pudo registrar el comprobante: ${res.error ?? 'sin detalle'}`);
  await notifyOwner(ctx, `💸 Comprobante para ${orderId} (${claim.method} ${claim.amount ?? '¿?'}). Revísalo y marca «Pagado» en PEDIDOS para enviar los accesos.`);
  await logEvent(ctx.db, { tenantId: ctx.t.id, type: 'sales_agent.payment_claim', entity: 'chat', entityId: ctx.thread.id, data: { orderId, ...claim } });
  return ok({ ok: true, pedido: orderId, estado: res.status ?? 'Por verificar', nota: 'Dile que lo estás verificando y que los accesos le llegan por aquí apenas se confirme.' });
}

async function customerSubscriptions(ctx: ToolContext) {
  const [c] = await ctx.db.select().from(customers).where(and(eq(customers.tenantId, ctx.t.id), eq(customers.phone, ctx.phone)));
  if (!c) return { customer: null, subs: [] };
  const subs = await ctx.db
    .select({ sub: subscriptions, service: services })
    .from(subscriptions)
    .leftJoin(services, eq(services.id, subscriptions.serviceId))
    .where(and(eq(subscriptions.tenantId, ctx.t.id), eq(subscriptions.customerId, c.id)))
    .orderBy(desc(subscriptions.endDate))
    .limit(10);
  return { customer: c, subs };
}

async function subscriptionStatus(ctx: ToolContext) {
  const { customer, subs } = await customerSubscriptions(ctx);
  if (!customer) return ok({ cliente: null, nota: 'Este número no tiene compras registradas.' });
  return ok({
    cliente: customer.name,
    suscripciones: subs
      .filter((s) => s.sub.status !== 'cancelada')
      .map((s) => ({
        servicio: s.service?.name ?? 'servicio',
        perfil: s.sub.profileName,
        vence: s.sub.endDate,
        estado: s.sub.status,
        precio_renovacion: formatPrice(round2(Number(s.sub.price))),
        aviso_enviado: s.sub.reminderStatus === 'enviado' || s.sub.reminderStatus === 'respondido',
      })),
  });
}

async function renewalDecision(ctx: ToolContext, decision: string) {
  if (!['renueva', 'no_renueva', 'pensando'].includes(decision)) throw new ToolError('Decisión inválida.');
  const { customer, subs } = await customerSubscriptions(ctx);
  if (!customer) throw new ToolError('Este número no tiene suscripciones: trátalo como una venta nueva.');
  const target = subs
    .filter((s) => s.sub.status !== 'cancelada')
    .sort((a, b) => (a.sub.reminderStatus === 'enviado' ? -1 : 0) - (b.sub.reminderStatus === 'enviado' ? -1 : 0) || a.sub.endDate.localeCompare(b.sub.endDate))[0];
  if (!target) throw new ToolError('No hay suscripciones vigentes para renovar.');
  await applyIntent(ctx.db, target.sub, decision as 'renueva' | 'no_renueva' | 'pensando', {
    lastCallSummary: `WhatsApp (vendedor IA): ${decision}`,
  });
  const price = formatPrice(round2(Number(target.sub.price)));
  if (decision === 'renueva') {
    await notifyOwner(ctx, `🔁 ${customer.name} (${ctx.phone}) renueva ${target.service?.name ?? 'su suscripción'} por ${price}. Llega el comprobante por el chat.`);
    return ok({ ok: true, servicio: target.service?.name, precio: price, como_pagar: ctx.catalog.payment, siguiente_paso: 'Pásale el monto y cómo pagar, y pídele la captura.' });
  }
  return ok({ ok: true, nota: decision === 'pensando' ? 'Quedó como "lo está pensando".' : 'Quedó como "no renueva". Agradécele sin insistir.' });
}

async function handoff(ctx: ToolContext, reason: string) {
  if (ctx.handedOff) return;
  ctx.handedOff = true;
  await ctx.db
    .update(chatThreads)
    .set({ botPausedUntil: new Date(ctx.now.getTime() + HANDOFF_PAUSE_MS), handoffReason: reason.slice(0, 300) })
    .where(eq(chatThreads.id, ctx.thread.id));
  await notifyOwner(ctx, `🙋 El chat con ${ctx.phone} necesita a una persona: ${reason.slice(0, 200)}`);
  await logEvent(ctx.db, { tenantId: ctx.t.id, type: 'sales_agent.handoff', entity: 'chat', entityId: ctx.thread.id, data: { reason } });
}

async function notifyOwner(ctx: ToolContext, text: string) {
  if (!ctx.t.ownerNotifyPhone) return;
  try {
    await sendText(ctx.t, ctx.t.ownerNotifyPhone, text);
  } catch (err) {
    // Fuera de la ventana de 24 h WhatsApp no deja escribirle al dueño: queda en la actividad del panel.
    logger.warn({ err, tenantId: ctx.t.id }, 'no se pudo avisar al dueño por WhatsApp');
  }
}

/** Reanudar el bot en un chat (desde el panel). */
export async function resumeBot(tenantId: string, threadId: string) {
  await getDb()
    .update(chatThreads)
    .set({ botPausedUntil: null, handoffReason: null })
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.tenantId, tenantId)));
}

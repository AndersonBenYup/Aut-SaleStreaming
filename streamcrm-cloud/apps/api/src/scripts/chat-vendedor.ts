/**
 * Prueba el vendedor por WhatsApp desde la terminal, sin WhatsApp ni Meta.
 *   1. En streaming-shop:  npm run hoja:mock          (tienda simulada en http://localhost:8787/exec)
 *   2. En .env:            ANTHROPIC_API_KEY=sk-ant-…
 *                           o, para probar gratis: SALES_AGENT_PROVIDER=openrouter, OPENROUTER_API_KEY=sk-or-…,
 *                           SALES_AGENT_MODEL=openrouter/free
 *   3. Aquí:               npm run vendedor:chat
 * Escribe como si fueras el cliente. Comandos: /imagen (simula que mandas una captura de Yape),
 * /nuevo (empieza otra conversación), /costo, /salir.
 * Variables opcionales: STORE_URL, STORE_BOT_KEY, TONO (ruta a un .txt con tu manual de tono).
 */
import '../config/dotenv.js';
import { readFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { eq } from 'drizzle-orm';
import { bootDatabase } from '../bootstrap.js';
import { env } from '../config/env.js';
import { getDb } from '../db/index.js';
import { chatThreads, tenants } from '../db/schema.js';
import { encrypt } from '../lib/crypto.js';
import { handleSalesMessage, salesAgentReady, setImageFetcher, setTextSender } from '../modules/sales-agent.js';

// Precios por millón de tokens (US$) para estimar el costo de la prueba.
const PRICES: Record<string, { in: number; out: number; cacheRead: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2 },
};

async function main() {
  const provider = env().SALES_AGENT_PROVIDER;
  if (provider === 'openrouter' ? !env().OPENROUTER_API_KEY : !env().ANTHROPIC_API_KEY) {
    const falta = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY';
    console.error(`Falta ${falta} en el .env de la raíz de streamcrm-cloud (SALES_AGENT_PROVIDER=${provider}).`);
    process.exit(1);
  }
  const db = await bootDatabase();
  const name = 'Vendedor de prueba (terminal)';
  const values = {
    name,
    salesAgentEnabled: true,
    storeApiUrl: process.env.STORE_URL ?? 'http://localhost:8787/exec',
    storeBotKeyEnc: encrypt(process.env.STORE_BOT_KEY ?? 'clave-bot-de-prueba-123'),
    salesToneGuide: process.env.TONO ? readFileSync(process.env.TONO, 'utf8') : null,
    ownerNotifyPhone: '+51900000000',
  };
  let [t] = await getDb().select().from(tenants).where(eq(tenants.name, name));
  if (t) [t] = await getDb().update(tenants).set(values).where(eq(tenants.id, t.id)).returning();
  else [t] = await getDb().insert(tenants).values({ ...values, subscriptionStatus: 'active' }).returning();
  if (!salesAgentReady(t!)) throw new Error('El vendedor no quedó listo (revisa la URL y la clave de la tienda)');

  let phone = `5198${String(Date.now()).slice(-7)}`;
  setTextSender(async (_t, to, text) => {
    if (to === '+51900000000') console.log(`\n   📣 (aviso al dueño) ${text}`);
    else console.log(`\n🤖 ${text}\n`);
  });
  // Una "captura" de Yape mínima: un PNG de 1×1. Sirve para probar el flujo, no la lectura del comprobante.
  setImageFetcher(async () => ({
    mediaType: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  }));

  console.log(`Proveedor: ${provider} · modelo: ${env().SALES_AGENT_MODEL} · tienda: ${values.storeApiUrl}\nEscribe como cliente. /imagen · /nuevo · /costo · /salir\n`);
  const rl = readline.createInterface({ input, output });
  let n = 0;
  try {
    for (;;) {
      const line = (await rl.question('🙂 ')).trim();
      if (!line) continue;
      if (line === '/salir') break;
      if (line === '/nuevo') {
        phone = `5198${String(Date.now()).slice(-7)}`;
        console.log('— conversación nueva —');
        continue;
      }
      if (line === '/costo') {
        const rows = await getDb().select().from(chatThreads).where(eq(chatThreads.tenantId, t!.id));
        const tot = rows.reduce((s, r) => ({ i: s.i + r.inputTokens, o: s.o + r.outputTokens, c: s.c + r.cacheReadTokens }), { i: 0, o: 0, c: 0 });
        if (provider === 'openrouter') {
          console.log(`   tokens: ${tot.i} entrada · ${tot.o} salida ≈ US$ 0.0000 (modelo gratis de OpenRouter)`);
        } else {
          const p = PRICES[env().SALES_AGENT_MODEL] ?? PRICES['claude-haiku-5-5']!;
          const usd = (tot.i * p.in + tot.o * p.out + tot.c * p.cacheRead) / 1e6;
          console.log(`   tokens: ${tot.i} entrada · ${tot.c} desde caché · ${tot.o} salida ≈ US$ ${usd.toFixed(4)} (sin contar la escritura de caché)`);
        }
        continue;
      }
      const isImage = line.startsWith('/imagen');
      await handleSalesMessage(t!, {
        messageId: `terminal-${Date.now()}-${++n}`,
        from: phone,
        text: isImage ? line.slice('/imagen'.length).trim() : line,
        imageId: isImage ? 'terminal-image' : undefined,
      });
    }
  } finally {
    rl.close();
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

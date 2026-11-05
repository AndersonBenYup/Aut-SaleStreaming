import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { chatThreads } from '../../db/schema.js';
import { tenantOf } from '../../auth/session.js';
import { resumeBot } from '../../modules/sales-agent.js';
import { NotFoundError } from '../../modules/tenantScope.js';

/** Texto visible de un mensaje del historial (sin razonamiento, herramientas ni avisos del sistema). */
function visibleText(m: any): string | null {
  const blocks = typeof m?.content === 'string' ? [{ type: 'text', text: m.content }] : (m?.content ?? []);
  const text = blocks
    .filter((b: any) => b?.type === 'text' && !String(b.text).startsWith('[Sistema'))
    .map((b: any) => b.text)
    .join('\n')
    .trim();
  const image = blocks.some((b: any) => b?.type === 'image');
  return text || (image ? '📷 (imagen)' : null);
}

/** Chats del vendedor por WhatsApp: costo, si está en pausa y la conversación legible. */
export function chatsRouter() {
  const r = Router();

  r.get('/', async (req, res) => {
    const rows = await getDb()
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.tenantId, tenantOf(req)))
      .orderBy(desc(chatThreads.lastMessageAt))
      .limit(100);
    res.json(
      rows.map((c) => ({
        id: c.id,
        phone: c.phone,
        lastMessageAt: c.lastMessageAt,
        paused: !!c.botPausedUntil && c.botPausedUntil > new Date(),
        handoffReason: c.handoffReason,
        lastOrderId: c.lastOrderId,
        tokens: { input: c.inputTokens, output: c.outputTokens, cacheRead: c.cacheReadTokens },
      })),
    );
  });

  r.get('/:id', async (req, res) => {
    const [c] = await getDb()
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.id, req.params.id), eq(chatThreads.tenantId, tenantOf(req))));
    if (!c) throw new NotFoundError('Chat');
    const transcript = (c.messages as any[])
      .map((m) => ({ from: m.role === 'assistant' ? 'bot' : 'cliente', text: visibleText(m) }))
      .filter((m) => m.text);
    res.json({ id: c.id, phone: c.phone, paused: !!c.botPausedUntil && c.botPausedUntil > new Date(), handoffReason: c.handoffReason, transcript });
  });

  /** El dueño terminó de atender: el bot vuelve a responder en este chat. */
  r.post('/:id/resume', async (req, res) => {
    await resumeBot(tenantOf(req), req.params.id);
    res.status(204).end();
  });

  /** El dueño toma el chat: el bot deja de responder 24 h. */
  r.post('/:id/pause', async (req, res) => {
    const [c] = await getDb()
      .update(chatThreads)
      .set({ botPausedUntil: new Date(Date.now() + 24 * 3600_000), handoffReason: 'Pausado desde el panel' })
      .where(and(eq(chatThreads.id, req.params.id), eq(chatThreads.tenantId, tenantOf(req))))
      .returning({ id: chatThreads.id });
    if (!c) throw new NotFoundError('Chat');
    res.status(204).end();
  });

  return r;
}

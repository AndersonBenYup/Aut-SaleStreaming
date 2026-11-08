/**
 * Adaptador: hace que OpenRouter (API compatible con OpenAI) se vea como el `ClaudeClient` que usa
 * sales-agent.ts, para poder probar el vendedor con modelos gratis sin tocar el resto del módulo.
 *
 * Traduce en la ida: `system` + `tools` + `messages` (formato Anthropic) → Chat Completions de OpenAI.
 * Traduce en la vuelta: la respuesta de OpenRouter → un `Anthropic.Message` (bloques `text`/`tool_use`,
 * `stop_reason`, `usage`), para que runTurn() no sepa ni le importe qué proveedor respondió.
 */
import type Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';

export interface ClaudeClient {
  messages: { create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

let raw: OpenAI | null | undefined;
function getRawClient(): OpenAI | null {
  if (raw !== undefined) return raw;
  const key = env().OPENROUTER_API_KEY;
  raw = key ? new OpenAI({ apiKey: key, baseURL: OPENROUTER_BASE_URL }) : null;
  return raw;
}
/** Para tests: fuerza (o limpia, con undefined) el cliente crudo de OpenAI/OpenRouter. */
export const setOpenRouterRawClient = (c: OpenAI | null | undefined) => {
  raw = c;
};

export function getOpenRouterClient(): ClaudeClient | null {
  const client = getRawClient();
  if (!client) return null;
  return { messages: { create: (p) => callOpenRouter(client, p) } };
}

async function callOpenRouter(client: OpenAI, p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  const messages = toOpenAiMessages(typeof p.system === 'string' ? p.system : '', p.messages);
  const tools = Array.isArray(p.tools) && p.tools.length ? toOpenAiTools(p.tools as Anthropic.Tool[]) : undefined;
  const res = await client.chat.completions.create({
    model: p.model,
    max_tokens: p.max_tokens,
    messages,
    ...(tools ? { tools } : {}),
  });
  return toAnthropicMessage(res);
}

function toOpenAiTools(tools: Anthropic.Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
  }));
}

/** El historial completo siempre llega en forma Anthropic (es lo que guarda y reenvía sales-agent.ts). */
function toOpenAiMessages(system: string, messages: Anthropic.MessageParam[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (m.role === 'user') {
      const toolResults = blocks.filter((b: any) => b.type === 'tool_result') as Anthropic.ToolResultBlockParam[];
      const rest = blocks.filter((b: any) => b.type !== 'tool_result');
      for (const tr of toolResults) {
        const content =
          typeof tr.content === 'string' ? tr.content : (tr.content ?? []).map((c: any) => (c.type === 'text' ? c.text : '')).join(' ');
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content });
      }
      if (rest.length) {
        const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = rest.map((b: any) => {
          if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
          return { type: 'text', text: String(b.text ?? '') };
        });
        out.push({ role: 'user', content });
      }
    } else {
      const text = blocks
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
      const toolUses = blocks.filter((b: any) => b.type === 'tool_use');
      const tool_calls = toolUses.length
        ? toolUses.map((b: any) => ({ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }))
        : undefined;
      out.push({ role: 'assistant', content: text || null, ...(tool_calls ? { tool_calls } : {}) } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam);
    }
  }
  return out;
}

function toAnthropicMessage(res: OpenAI.Chat.Completions.ChatCompletion): Anthropic.Message {
  const choice = res.choices[0];
  const msg = choice?.message;
  const content: Anthropic.ContentBlock[] = [];
  if (msg?.content) content.push({ type: 'text', text: msg.content, citations: null } as unknown as Anthropic.TextBlock);
  for (const tc of msg?.tool_calls ?? []) {
    if (tc.type !== 'function') continue;
    let input: unknown = {};
    try {
      input = JSON.parse(tc.function.arguments || '{}');
    } catch {
      input = {};
    }
    content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input } as unknown as Anthropic.ToolUseBlock);
  }
  const stop_reason = choice?.finish_reason === 'tool_calls' ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
  return {
    id: res.id,
    type: 'message',
    role: 'assistant',
    model: res.model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: res.usage?.prompt_tokens ?? 0,
      output_tokens: res.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

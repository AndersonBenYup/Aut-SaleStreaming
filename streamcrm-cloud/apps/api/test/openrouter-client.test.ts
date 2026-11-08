import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { afterEach, describe, expect, it } from 'vitest';
import { getOpenRouterClient, setOpenRouterRawClient } from '../src/modules/openrouter-client.js';

afterEach(() => {
  setOpenRouterRawClient(undefined);
});

function fakeRaw(create: (req: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming) => OpenAI.Chat.Completions.ChatCompletion) {
  setOpenRouterRawClient({ chat: { completions: { create } } } as unknown as OpenAI);
}

const TOOLS: Anthropic.Tool[] = [
  { name: 'cotizar_rebaja', description: 'Rebaja un producto', input_schema: { type: 'object', properties: { producto: { type: 'string' } }, required: ['producto'] } },
];

describe('adaptador de OpenRouter (formato OpenAI) hacia la forma de Anthropic que usa sales-agent.ts', () => {
  it('manda el system prompt, las herramientas traducidas y el mensaje del cliente', async () => {
    let seen: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming | null = null;
    fakeRaw((req) => {
      seen = req;
      return {
        id: 'r1',
        model: 'openrouter/free',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Hola causa 👋', refusal: null } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      } as unknown as OpenAI.Chat.Completions.ChatCompletion;
    });
    const client = getOpenRouterClient()!;
    const res = await client.messages.create({
      model: 'openrouter/free',
      max_tokens: 4000,
      system: 'Eres el vendedor de LokiStream.',
      tools: TOOLS,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hola, cuánto el netflix?' }] }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    expect(seen!.messages[0]).toEqual({ role: 'system', content: 'Eres el vendedor de LokiStream.' });
    expect(seen!.messages[1]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'hola, cuánto el netflix?' }] });
    expect(seen!.tools).toEqual([{ type: 'function', function: { name: 'cotizar_rebaja', description: 'Rebaja un producto', parameters: TOOLS[0]!.input_schema } }]);

    expect(res.stop_reason).toBe('end_turn');
    expect(res.content).toEqual([{ type: 'text', text: 'Hola causa 👋', citations: null }]);
    expect(res.usage.input_tokens).toBe(100);
    expect(res.usage.output_tokens).toBe(20);
    expect(res.usage.cache_read_input_tokens).toBe(0);
  });

  it('convierte una llamada a herramienta en un bloque tool_use con el input ya parseado', async () => {
    fakeRaw(() => ({
      id: 'r2',
      model: 'openrouter/free',
      choices: [
        {
          index: 0,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            refusal: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'cotizar_rebaja', arguments: '{"producto":"netflix:1m","precio_pedido":13}' } }],
          },
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    }) as unknown as OpenAI.Chat.Completions.ChatCompletion);
    const client = getOpenRouterClient()!;
    const res = await client.messages.create({
      model: 'openrouter/free',
      max_tokens: 4000,
      system: 's',
      tools: TOOLS,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'déjamelo a 13' }] }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    expect(res.stop_reason).toBe('tool_use');
    expect(res.content).toEqual([{ type: 'tool_use', id: 'call_1', name: 'cotizar_rebaja', input: { producto: 'netflix:1m', precio_pedido: 13 } }]);
  });

  it('un historial con tool_result de Anthropic se manda como mensajes role:"tool" de OpenAI', async () => {
    let seen: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming | null = null;
    fakeRaw((req) => {
      seen = req;
      return {
        id: 'r3',
        model: 'openrouter/free',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'listo', refusal: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      } as unknown as OpenAI.Chat.Completions.ChatCompletion;
    });
    const client = getOpenRouterClient()!;
    await client.messages.create({
      model: 'openrouter/free',
      max_tokens: 4000,
      system: 's',
      tools: TOOLS,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'déjamelo a 13' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'cotizar_rebaja', input: { producto: 'netflix:1m' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"precio_por_perfil":"S/ 14"}' }] },
      ] as unknown as Anthropic.MessageParam[],
    } as Anthropic.MessageCreateParamsNonStreaming);

    expect(seen!.messages[2]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'cotizar_rebaja' } }] });
    expect(seen!.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"precio_por_perfil":"S/ 14"}' });
  });

  it('convierte un bloque de imagen a image_url en base64', async () => {
    let seen: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming | null = null;
    fakeRaw((req) => {
      seen = req;
      return {
        id: 'r4',
        model: 'openrouter/free',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'recibido', refusal: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      } as unknown as OpenAI.Chat.Completions.ChatCompletion;
    });
    const client = getOpenRouterClient()!;
    await client.messages.create({
      model: 'openrouter/free',
      max_tokens: 4000,
      system: 's',
      tools: TOOLS,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' } }] }] as unknown as Anthropic.MessageParam[],
    } as Anthropic.MessageCreateParamsNonStreaming);

    expect(seen!.messages[1]).toEqual({ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aGVsbG8=' } }] });
  });

  it('sin OPENROUTER_API_KEY ni cliente forzado, no hay cliente', () => {
    setOpenRouterRawClient(null);
    expect(getOpenRouterClient()).toBeNull();
  });
});

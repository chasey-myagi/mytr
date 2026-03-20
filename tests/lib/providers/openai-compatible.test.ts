import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from '@/lib/providers/openai-compatible';
import type { TranslateRequest } from '@/lib/providers/types';

const mockRequest: TranslateRequest = {
  text: 'Hello world',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  style: 'natural',
};

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct name', () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });
    expect(provider.name).toBe('openai-compatible');
  });

  it('sends correct request format', async () => {
    const mockResponse = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'),
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockResponse,
    }));

    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.translate(mockRequest)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('你好');
    expect(fetch).toHaveBeenCalledOnce();

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.openai.com/v1/chat/completions');

    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.stream).toBe(true);
    expect(body.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    }));

    const provider = new OpenAICompatibleProvider({
      apiKey: 'bad-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });

    const chunks: string[] = [];
    await expect(async () => {
      for await (const chunk of provider.translate(mockRequest)) {
        chunks.push(chunk);
      }
    }).rejects.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProvider } from '@/lib/providers/claude';
import type { TranslateRequest } from '@/lib/providers/types';

const mockRequest: TranslateRequest = {
  text: 'Hello world',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  style: 'natural',
};

describe('ClaudeProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct name', () => {
    const provider = new ClaudeProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    });
    expect(provider.name).toBe('claude');
  });

  it('sends correct Anthropic Messages API format', async () => {
    const mockResponse = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n'));
        controller.enqueue(enc.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockResponse,
    }));

    const provider = new ClaudeProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.translate(mockRequest)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('你好');

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.anthropic.com/v1/messages');

    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBeDefined();

    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.stream).toBe(true);
    expect(body.system).toBeDefined();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    }));

    const provider = new ClaudeProvider({
      apiKey: 'bad-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    });

    await expect(async () => {
      for await (const _chunk of provider.translate(mockRequest)) {
        // consume
      }
    }).rejects.toThrow();
  });
});

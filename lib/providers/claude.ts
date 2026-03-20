import type { TranslationProvider, TranslateRequest } from './types';
import { buildSystemPrompt } from '../prompt/builder';

interface ClaudeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class ClaudeProvider implements TranslationProvider {
  name = 'claude' as const;
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  async *translate(request: TranslateRequest): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(request.targetLang, request.style, request.customPrompt ?? '');

    const messages: Array<{ role: string; content: string }> = [];
    if (request.context) {
      messages.push({ role: 'user', content: request.context });
      messages.push({ role: 'assistant', content: '好的，我了解了页面上下文。请提供需要翻译的内容。' });
    }
    messages.push({ role: 'user', content: request.text });

    const url = `${this.config.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        stream: true,
      }),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Claude API response has no body — streaming not supported in this environment');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice('data: '.length);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }
  }
}

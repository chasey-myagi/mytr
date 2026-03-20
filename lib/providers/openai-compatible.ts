import type { TranslationProvider, TranslateRequest } from './types';
import { buildSystemPrompt } from '../prompt/builder';

interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class OpenAICompatibleProvider implements TranslationProvider {
  name = 'openai-compatible' as const;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  async *translate(request: TranslateRequest): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(request.targetLang, request.style, '');
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (request.context) {
      messages.push({ role: 'user', content: request.context });
    }

    messages.push({ role: 'user', content: request.text });

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const reader = response.body!.getReader();
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice('data: '.length);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  }
}

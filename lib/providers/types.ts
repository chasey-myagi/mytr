export interface TranslateRequest {
  text: string;
  sourceLang: string | 'auto';
  targetLang: string;
  style: string;
  context?: string;
}

export interface TranslationProvider {
  name: string;
  translate(request: TranslateRequest): AsyncIterable<string>;
}

export interface ProviderConfig {
  provider: 'openai-compatible' | 'claude';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type DisplayMode = 'bilingual' | 'target-only' | 'source-only';

export interface TextBlock {
  id: string;
  element: Element;
  text: string;
}

export type TranslationStatus = 'idle' | 'translating' | 'paused' | 'error';

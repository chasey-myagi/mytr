import { describe, it, expect } from 'vitest';
import {
  type TranslatePageMessage,
  type TranslateSelectionMessage,
  type StopTranslationMessage,
  type TranslationChunkResponse,
  type MessageMap,
  createMessage,
} from '@/lib/messaging/bridge';

describe('messaging bridge', () => {
  it('creates a translate-page message with correct shape', () => {
    const msg = createMessage('translate-page', {
      tabId: 1,
      pageContext: { title: 'Test', hostname: 'example.com' },
    });
    expect(msg.type).toBe('translate-page');
    expect(msg.payload.tabId).toBe(1);
    expect(msg.payload.pageContext.title).toBe('Test');
  });

  it('creates a translate-selection message', () => {
    const msg = createMessage('translate-selection', {
      text: 'hello',
      tabId: 1,
    });
    expect(msg.type).toBe('translate-selection');
    expect(msg.payload.text).toBe('hello');
  });

  it('creates a stop-translation message', () => {
    const msg = createMessage('stop-translation', { tabId: 1 });
    expect(msg.type).toBe('stop-translation');
  });
});

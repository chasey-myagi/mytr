import { TranslationCache } from '../lib/storage/cache';
import { getProviderConfig, getPreferences } from '../lib/storage/settings';
import { OpenAICompatibleProvider } from '../lib/providers/openai-compatible';
import { ClaudeProvider } from '../lib/providers/claude';
import { parseSepStream } from '../lib/translator/batcher';
import { buildTranslationContent } from '../lib/prompt/builder';
import { createMessage } from '../lib/messaging/bridge';
import type { TranslationProvider } from '../lib/providers/types';
import type { TranslateBatchPayload, TranslateSelectionPayload } from '../lib/messaging/bridge';

const cache = new TranslationCache();

// Track active abort controllers per tab
const activeTranslations = new Map<number, AbortController>();

async function getProvider(): Promise<{ provider: TranslationProvider; providerName: string; model: string }> {
  const config = await getProviderConfig();
  let provider: TranslationProvider;
  if (config.provider === 'claude') {
    provider = new ClaudeProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model });
  } else {
    provider = new OpenAICompatibleProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model });
  }
  return { provider, providerName: config.provider, model: config.model };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export default defineBackground(() => {
  // Handle translate-page: fetch settings and forward to content script as extract-and-translate
  chrome.runtime.onMessage.addListener((message, _sender) => {
    if (message.type !== 'translate-page') return;

    const payload = message.payload as { tabId: number; pageContext: { title: string; hostname: string } };
    const targetTabId = payload.tabId;

    (async () => {
      try {
        const [prefs, providerConfig] = await Promise.all([getPreferences(), getProviderConfig()]);

        chrome.tabs.sendMessage(targetTabId, createMessage('extract-and-translate', {
          pageContext: `页面：${payload.pageContext.title}\n来源：${payload.pageContext.hostname}`,
          targetLang: prefs.targetLang,
          sourceLang: prefs.sourceLang,
          style: prefs.style,
          customPrompt: prefs.customPrompt,
          provider: providerConfig.provider,
          model: providerConfig.model,
        }));
      } catch (err) {
        console.error('[mytr] translate-page error:', err);
      }
    })();
  });

  // Handle translate-batch: core translation flow
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type !== 'translate-batch') return;

    const payload = message.payload as TranslateBatchPayload;
    const tabId = sender.tab?.id;
    if (!tabId) return;

    (async () => {
      try {
        // Abort any existing translation for this tab
        activeTranslations.get(tabId)?.abort();
        const abortController = new AbortController();
        activeTranslations.set(tabId, abortController);

        const { provider, providerName, model } = await getProvider();

        // Check cache for each block
        const uncachedBlocks: Array<{ id: string; text: string }> = [];

        for (const block of payload.blocks) {
          const cached = await cache.get(
            block.text,
            payload.sourceLang,
            payload.targetLang,
            providerName,
            model,
          );
          if (cached !== undefined) {
            // Send cached result immediately as a single chunk
            chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
              blockId: block.id,
              chunk: cached,
              done: true,
            }));
          } else {
            uncachedBlocks.push(block);
          }
        }

        if (uncachedBlocks.length === 0 || abortController.signal.aborted) return;

        // Build combined content for uncached blocks
        const content = buildTranslationContent(uncachedBlocks.map((b) => b.text));

        const stream = await withRetry(() =>
          Promise.resolve(provider.translate({
            text: content,
            sourceLang: payload.sourceLang,
            targetLang: payload.targetLang,
            style: payload.style,
            context: payload.pageContext || undefined,
          }))
        );

        const blockIds = uncachedBlocks.map((b) => b.id);
        // Accumulate full text per block for caching
        const blockAccumulated = new Map<string, string>(uncachedBlocks.map((b) => [b.id, '']));

        for await (const segment of parseSepStream(stream, uncachedBlocks.length)) {
          if (abortController.signal.aborted) break;

          const blockId = blockIds[segment.index];
          if (!blockId) continue;

          chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
            blockId,
            chunk: segment.text,
            done: false,
          }));

          blockAccumulated.set(blockId, (blockAccumulated.get(blockId) ?? '') + segment.text);
        }

        if (abortController.signal.aborted) return;

        // Send done signals and persist to cache
        for (let i = 0; i < blockIds.length; i++) {
          const blockId = blockIds[i];
          const block = uncachedBlocks[i];
          const fullTranslation = blockAccumulated.get(blockId) ?? '';

          chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
            blockId,
            chunk: '',
            done: true,
          }));

          if (fullTranslation) {
            await cache.set(
              block.text,
              payload.sourceLang,
              payload.targetLang,
              providerName,
              model,
              fullTranslation,
            );
          }
        }

        activeTranslations.delete(tabId);
      } catch (err) {
        console.error('[mytr] translate-batch error:', err);
      }
    })();
  });

  // Handle translate-selection: stream translation of selected text
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type !== 'translate-selection') return;

    const payload = message.payload as TranslateSelectionPayload;
    const tabId = sender.tab?.id ?? payload.tabId;
    if (!tabId) return;

    (async () => {
      try {
        const [prefs, { provider, providerName, model }] = await Promise.all([
          getPreferences(),
          getProvider(),
        ]);

        // Check cache first
        const cached = await cache.get(
          payload.text,
          prefs.sourceLang,
          prefs.targetLang,
          providerName,
          model,
        );

        if (cached !== undefined) {
          chrome.tabs.sendMessage(tabId, createMessage('selection-chunk', { chunk: cached, done: true }));
          return;
        }

        const stream = provider.translate({
          text: payload.text,
          sourceLang: prefs.sourceLang,
          targetLang: prefs.targetLang,
          style: prefs.style,
          context: undefined,
        });

        let fullTranslation = '';

        for await (const chunk of stream) {
          chrome.tabs.sendMessage(tabId, createMessage('selection-chunk', { chunk, done: false }));
          fullTranslation += chunk;
        }

        chrome.tabs.sendMessage(tabId, createMessage('selection-chunk', { chunk: '', done: true }));

        if (fullTranslation) {
          await cache.set(
            payload.text,
            prefs.sourceLang,
            prefs.targetLang,
            providerName,
            model,
            fullTranslation,
          );
        }
      } catch (err) {
        console.error('[mytr] translate-selection error:', err);
        chrome.tabs.sendMessage(tabId, createMessage('selection-error', {
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();
  });

  // Handle stop-translation: abort active streaming
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'stop-translation') return;

    const payload = message.payload as { tabId: number };
    const controller = activeTranslations.get(payload.tabId);
    if (controller) {
      controller.abort();
      activeTranslations.delete(payload.tabId);
    }
  });

  // Handle keyboard shortcuts: forward as command messages to the active tab's content script
  chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      const tabId = tab.id;

      chrome.tabs.sendMessage(tabId, createMessage('command', { command }));
    });
  });
});

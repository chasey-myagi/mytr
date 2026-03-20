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

// Track active abort controllers per tab — each batch gets its own controller,
// stored in a Set so multiple concurrent batches don't abort each other.
const activeTranslations = new Map<number, Set<AbortController>>();

// Track per-tab selection AbortController (tooltip translations)
const activeSelections = new Map<number, AbortController>();

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
      // Do not retry on client errors (4xx) — they will not succeed on retry
      const msg = err instanceof Error ? err.message : String(err);
      if (/\b(400|401|403)\b/.test(msg)) {
        throw err;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export default defineBackground(() => {
  // Single onMessage listener — use a switch for all message types.
  // Async handlers return `true` so the message channel stays open.
  chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
    if (!message?.type) return;

    switch (message.type) {
      case 'translate-page': {
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
        return true;
      }

      case 'translate-batch': {
        const payload = message.payload as TranslateBatchPayload;
        const tabId = sender.tab?.id;
        if (!tabId) return;

        (async () => {
          try {
            const abortController = new AbortController();

            // Add this batch's controller to the tab's set
            if (!activeTranslations.has(tabId)) {
              activeTranslations.set(tabId, new Set());
            }
            activeTranslations.get(tabId)!.add(abortController);

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

            if (uncachedBlocks.length === 0 || abortController.signal.aborted) {
              activeTranslations.get(tabId)?.delete(abortController);
              return;
            }

            // Build combined content for uncached blocks
            const content = buildTranslationContent(uncachedBlocks.map((b) => b.text));

            const stream = await withRetry(() =>
              Promise.resolve(provider.translate({
                text: content,
                sourceLang: payload.sourceLang,
                targetLang: payload.targetLang,
                style: payload.style,
                context: payload.pageContext || undefined,
                customPrompt: payload.customPrompt || undefined,
                signal: abortController.signal,
              }))
            );

            const blockIds = uncachedBlocks.map((b) => b.id);
            // Accumulate full text per block for caching
            const blockAccumulated = new Map<string, string>(uncachedBlocks.map((b) => [b.id, '']));

            for await (const segment of parseSepStream(stream, uncachedBlocks.length)) {
              if (abortController.signal.aborted) break;

              const blockId = blockIds[segment.index];
              if (!blockId) continue;

              if (!segment.done) {
                // Partial chunk — stream to content script for immediate display
                chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
                  blockId,
                  chunk: segment.text,
                  done: false,
                }));
                blockAccumulated.set(blockId, (blockAccumulated.get(blockId) ?? '') + segment.text);
              } else {
                // Segment finalized by [SEP] or end-of-stream.
                if (segment.text) {
                  chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
                    blockId,
                    chunk: segment.text,
                    done: false,
                  }));
                  blockAccumulated.set(blockId, (blockAccumulated.get(blockId) ?? '') + segment.text);
                }
                chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
                  blockId,
                  chunk: '',
                  done: true,
                }));

                // Persist full accumulated translation to cache
                const fullTranslation = blockAccumulated.get(blockId) ?? '';
                const block = uncachedBlocks[segment.index];
                if (block && fullTranslation) {
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
            }

            // Remove this batch's controller once complete
            activeTranslations.get(tabId)?.delete(abortController);
            if (activeTranslations.get(tabId)?.size === 0) {
              activeTranslations.delete(tabId);
            }
          } catch (err) {
            console.error('[mytr] translate-batch error:', err);
          }
        })();
        return true;
      }

      case 'translate-selection': {
        const payload = message.payload as TranslateSelectionPayload;
        const tabId = sender.tab?.id;
        if (!tabId) return;

        (async () => {
          try {
            // Abort any in-progress selection translation for this tab
            activeSelections.get(tabId)?.abort();
            const abortController = new AbortController();
            activeSelections.set(tabId, abortController);

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
              activeSelections.delete(tabId);
              return;
            }

            const stream = provider.translate({
              text: payload.text,
              sourceLang: prefs.sourceLang,
              targetLang: prefs.targetLang,
              style: prefs.style,
              context: undefined,
              signal: abortController.signal,
            });

            let fullTranslation = '';

            for await (const chunk of stream) {
              if (abortController.signal.aborted) break;
              chrome.tabs.sendMessage(tabId, createMessage('selection-chunk', { chunk, done: false }));
              fullTranslation += chunk;
            }

            if (!abortController.signal.aborted) {
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
            }

            activeSelections.delete(tabId);
          } catch (err) {
            console.error('[mytr] translate-selection error:', err);
            chrome.tabs.sendMessage(tabId, createMessage('selection-error', {
              error: err instanceof Error ? err.message : String(err),
            }));
          }
        })();
        return true;
      }

      case 'stop-translation': {
        // Use sender.tab?.id — content script passes tabId: 0 as a placeholder
        const tabId = sender.tab?.id;
        if (!tabId) return;

        // Abort all active batch controllers for this tab
        const controllers = activeTranslations.get(tabId);
        if (controllers) {
          for (const ctrl of controllers) {
            ctrl.abort();
          }
          activeTranslations.delete(tabId);
        }

        // Abort any active selection translation for this tab
        activeSelections.get(tabId)?.abort();
        activeSelections.delete(tabId);
        break;
      }

      case 'cancel-selection': {
        const tabId = sender.tab?.id;
        if (!tabId) return;
        activeSelections.get(tabId)?.abort();
        activeSelections.delete(tabId);
        break;
      }
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

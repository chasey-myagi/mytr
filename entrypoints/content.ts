import { extractTextBlocks } from '../lib/translator/extractor';
import { injectTranslation, appendToTranslation, removeAllTranslations, setDisplayMode } from '../lib/translator/injector';
import { setupSelectionListeners, createTooltip, appendToTooltip, removeTooltip, getSelectedText } from '../lib/translator/selector';
import { createBatches } from '../lib/translator/batcher';
import { createVisibilityObserver, createMutationWatcher, createRouteWatcher } from '../lib/translator/observer';
import { sendToBackground, createMessage } from '../lib/messaging/bridge';
import { getPreferences, getProviderConfig } from '../lib/storage/settings';
import type { DisplayMode, TextBlock } from '../lib/providers/types';
import type { ExtractAndTranslatePayload } from '../lib/messaging/bridge';

const BATCH_MAX_BLOCKS = 10;
const BATCH_MAX_CHARS = 3000;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    // State
    let isTranslating = false;
    let currentDisplayMode: DisplayMode = 'bilingual';
    let cleanupSelection: (() => void) | null = null;
    let visibilityObserver: { observe: (el: Element) => void; disconnect: () => void } | null = null;
    let mutationWatcher: { disconnect: () => void } | null = null;
    let cleanupRoute: (() => void) | null = null;
    let currentPageContext: ExtractAndTranslatePayload | null = null;

    // Track pending visible elements waiting for translate-batch
    const pendingVisible = new Set<string>(); // blockIds queued for translation
    const pendingBlocks = new Map<string, TextBlock>(); // blockId -> TextBlock

    // Setup selection listeners based on user preferences
    const prefs = await getPreferences().catch(() => null);
    if (prefs) {
      cleanupSelection = setupSelectionListeners(
        (text, rect) => {
          createTooltip(rect);
          sendToBackground('translate-selection', {
            text,
            tabId: 0, // background reads from sender.tab.id
          }).catch(console.error);
        },
        prefs.selectionMode,
      );
    }

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message) => {
      if (!message?.type) return;

      switch (message.type) {
        case 'command':
          handleCommand(message.payload.command);
          break;

        case 'extract-and-translate':
          handleExtractAndTranslate(message.payload as ExtractAndTranslatePayload);
          break;

        case 'translation-chunk':
          handleTranslationChunk(
            message.payload.blockId as string,
            message.payload.chunk as string,
            message.payload.done as boolean,
          );
          break;

        case 'selection-chunk':
          appendToTooltip(message.payload.chunk as string);
          if (message.payload.done) {
            // tooltip stays visible, user closes manually
          }
          break;

        case 'selection-error':
          appendToTooltip(`翻译失败: ${message.payload.error as string}`);
          break;
      }
    });

    function handleCommand(command: string) {
      switch (command) {
        case 'translate-page':
          triggerPageTranslation();
          break;
        case 'stop-translation':
          stopTranslation();
          break;
        case 'toggle-display-mode':
          toggleDisplayMode();
          break;
        case 'translate-selection': {
          const text = getSelectedText();
          if (text) {
            const selection = window.getSelection();
            const range = selection?.getRangeAt(0);
            const rect = range?.getBoundingClientRect();
            if (rect) {
              createTooltip(rect);
              sendToBackground('translate-selection', { text, tabId: 0 }).catch(console.error);
            }
          }
          break;
        }
      }
    }

    async function triggerPageTranslation() {
      try {
        const [prefs, providerConfig] = await Promise.all([getPreferences(), getProviderConfig()]);

        const payload: ExtractAndTranslatePayload = {
          pageContext: `页面：${document.title}\n来源：${location.hostname}`,
          targetLang: prefs.targetLang,
          sourceLang: prefs.sourceLang,
          style: prefs.style,
          customPrompt: prefs.customPrompt,
          provider: providerConfig.provider,
          model: providerConfig.model,
        };

        handleExtractAndTranslate(payload);
      } catch (err) {
        console.error('[mytr] triggerPageTranslation error:', err);
      }
    }

    function handleExtractAndTranslate(payload: ExtractAndTranslatePayload) {
      currentPageContext = payload;
      isTranslating = true;

      // Clean up old observers
      visibilityObserver?.disconnect();
      mutationWatcher?.disconnect();
      cleanupRoute?.();

      // Extract text blocks from current page
      const blocks = extractTextBlocks(document.documentElement);
      if (blocks.length === 0) return;

      // Register all blocks in our pending map
      for (const block of blocks) {
        pendingBlocks.set(block.id, block);
      }

      // Set up IntersectionObserver for lazy translation
      visibilityObserver = createVisibilityObserver((visibleElements) => {
        if (!currentPageContext) return;

        const visibleBlocks: TextBlock[] = [];
        for (const el of visibleElements) {
          const id = el.getAttribute('data-mytr-id');
          if (id && pendingBlocks.has(id) && !pendingVisible.has(id)) {
            visibleBlocks.push(pendingBlocks.get(id)!);
            pendingVisible.add(id);
          }
        }

        if (visibleBlocks.length === 0) return;

        // Create translation elements immediately
        for (const block of visibleBlocks) {
          injectTranslation(block.id, block.element);
        }

        // Send batches to background for translation
        const batches = createBatches(visibleBlocks, BATCH_MAX_BLOCKS, BATCH_MAX_CHARS);
        for (const batch of batches) {
          sendToBackground('translate-batch', {
            blocks: batch.map((b) => ({ id: b.id, text: b.text })),
            content: '',
            pageContext: currentPageContext!.pageContext,
            targetLang: currentPageContext!.targetLang,
            sourceLang: currentPageContext!.sourceLang,
            style: currentPageContext!.style,
            customPrompt: currentPageContext!.customPrompt,
          }).catch(console.error);
        }
      });

      // Observe all block elements
      for (const block of blocks) {
        visibilityObserver.observe(block.element);
      }

      // Watch for DOM mutations (SPA navigation / dynamic content)
      mutationWatcher = createMutationWatcher((addedNodes) => {
        if (!currentPageContext || !isTranslating) return;

        const newBlocks: TextBlock[] = [];
        for (const node of addedNodes) {
          const extracted = extractTextBlocks(node as Element);
          for (const block of extracted) {
            if (!pendingBlocks.has(block.id)) {
              pendingBlocks.set(block.id, block);
              newBlocks.push(block);
            }
          }
        }

        if (newBlocks.length === 0) return;

        for (const block of newBlocks) {
          injectTranslation(block.id, block.element);
          pendingVisible.add(block.id);
        }

        const batches = createBatches(newBlocks, BATCH_MAX_BLOCKS, BATCH_MAX_CHARS);
        for (const batch of batches) {
          sendToBackground('translate-batch', {
            blocks: batch.map((b) => ({ id: b.id, text: b.text })),
            content: '',
            pageContext: currentPageContext!.pageContext,
            targetLang: currentPageContext!.targetLang,
            sourceLang: currentPageContext!.sourceLang,
            style: currentPageContext!.style,
            customPrompt: currentPageContext!.customPrompt,
          }).catch(console.error);
        }
      });

      // Watch for route changes (SPA)
      cleanupRoute = createRouteWatcher(() => {
        stopTranslation();
      });
    }

    function handleTranslationChunk(blockId: string, chunk: string, done: boolean) {
      if (chunk) {
        appendToTranslation(blockId, chunk);
      }
      if (done) {
        pendingBlocks.delete(blockId);
        pendingVisible.delete(blockId);
      }
    }

    function stopTranslation() {
      isTranslating = false;
      currentPageContext = null;
      pendingBlocks.clear();
      pendingVisible.clear();

      visibilityObserver?.disconnect();
      visibilityObserver = null;
      mutationWatcher?.disconnect();
      mutationWatcher = null;
      cleanupRoute?.();
      cleanupRoute = null;

      removeAllTranslations();
      removeTooltip();

      // Notify background to abort streaming
      chrome.tabs.getCurrent?.().then?.(() => {}).catch?.(() => {});
    }

    function toggleDisplayMode() {
      const modes: DisplayMode[] = ['bilingual', 'target-only', 'source-only'];
      const currentIndex = modes.indexOf(currentDisplayMode);
      currentDisplayMode = modes[(currentIndex + 1) % modes.length];
      setDisplayMode(currentDisplayMode);
    }

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      cleanupSelection?.();
      visibilityObserver?.disconnect();
      mutationWatcher?.disconnect();
      cleanupRoute?.();
    });
  },
});

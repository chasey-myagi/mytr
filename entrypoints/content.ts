import { extractTextBlocks } from '../lib/translator/extractor';
import { injectTranslation, appendToTranslation, removeAllTranslations, setDisplayMode } from '../lib/translator/injector';
import { setupSelectionListeners, createTooltip, appendToTooltip, removeTooltip, getSelectedText } from '../lib/translator/selector';
import { createBatches } from '../lib/translator/batcher';
import { createVisibilityObserver, createMutationWatcher, createRouteWatcher, debounce } from '../lib/translator/observer';
import { sendToBackground, createMessage } from '../lib/messaging/bridge';
import { getPreferences, getProviderConfig, getSiteRules } from '../lib/storage/settings';
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

    // Check site rules before registering any listeners
    const [prefs, siteRules] = await Promise.all([
      getPreferences().catch(() => null),
      getSiteRules().catch(() => null),
    ]);

    const hostname = location.hostname;

    if (siteRules?.neverTranslate.includes(hostname)) {
      // Site is in neverTranslate list — do not register any listeners
      return;
    }

    // Wrap removeTooltip so closing always cancels the background selection translation
    function cancelAndRemoveTooltip() {
      removeTooltip();
      sendToBackground('cancel-selection', {}).catch(() => {});
    }

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

    // Auto-trigger page translation if hostname is in alwaysTranslate list
    if (siteRules?.alwaysTranslate.includes(hostname)) {
      triggerPageTranslation().catch(console.error);
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
        case 'close-tooltip':
          cancelAndRemoveTooltip();
          break;
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
          injectTranslation(block.id, block.element, currentPageContext!.targetLang);
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

      // Debounced handler for MutationObserver — SPA reconciliation can fire
      // many mutations in rapid succession; wait 500ms before extracting blocks.
      const debouncedMutationHandler = debounce((addedNodes: Element[]) => {
        if (!currentPageContext || !isTranslating || !visibilityObserver) return;

        for (const node of addedNodes) {
          const extracted = extractTextBlocks(node as Element);
          for (const block of extracted) {
            if (!pendingBlocks.has(block.id)) {
              pendingBlocks.set(block.id, block);
              // Register with visibilityObserver so lazy translation works correctly
              visibilityObserver!.observe(block.element);
            }
          }
        }
      }, 500);

      // Watch for DOM mutations (SPA navigation / dynamic content)
      mutationWatcher = createMutationWatcher((addedNodes) => {
        debouncedMutationHandler(addedNodes);
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
      cancelAndRemoveTooltip();

      // Notify background to abort any ongoing streaming for this tab.
      // tabId: 0 is a placeholder — background uses sender.tab.id instead.
      sendToBackground('stop-translation', { tabId: 0 }).catch(() => {});
    }

    function toggleDisplayMode() {
      const modes: DisplayMode[] = ['bilingual', 'target-only', 'source-only'];
      const currentIndex = modes.indexOf(currentDisplayMode);
      currentDisplayMode = modes[(currentIndex + 1) % modes.length];
      setDisplayMode(currentDisplayMode);
    }

    // Keyboard shortcut: Escape closes tooltip and cancels selection translation
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelAndRemoveTooltip();
      }
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      cleanupSelection?.();
      visibilityObserver?.disconnect();
      mutationWatcher?.disconnect();
      cleanupRoute?.();
    });
  },
});

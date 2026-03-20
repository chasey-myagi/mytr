const MAX_SELECTION_LENGTH = 5000;
const TOOLTIP_ATTR = 'data-mytr-tooltip';

export function getSelectedText(): string {
  return window.getSelection()?.toString().trim() ?? '';
}

export function shouldTranslateSelection(text: string, anchorElement?: Element | null): boolean {
  if (text.length < 2) return false;
  if (text.length > MAX_SELECTION_LENGTH) return false;

  // Reject if selected from a translated element
  if (anchorElement?.closest('.mytr-translation')) return false;

  // Reject if selected from input/textarea/contenteditable
  if (anchorElement) {
    const tag = anchorElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
    if (anchorElement.closest('[contenteditable="true"]')) return false;
  }

  return true;
}

export function createTooltip(selectionRect: DOMRect): HTMLElement {
  removeTooltip();

  const host = document.createElement('div');
  host.setAttribute(TOOLTIP_ATTR, '');
  host.style.position = 'absolute';
  host.style.zIndex = '2147483647';

  // Smart positioning: prefer below, fallback to above
  const spaceBelow = window.innerHeight - selectionRect.bottom;
  const tooltipEstimatedHeight = 150;

  if (spaceBelow >= tooltipEstimatedHeight) {
    host.style.top = `${selectionRect.bottom + window.scrollY + 8}px`;
  } else {
    host.style.top = `${selectionRect.top + window.scrollY - tooltipEstimatedHeight - 8}px`;
  }

  // Horizontal: center on selection, clamp to viewport
  const centerX = selectionRect.left + selectionRect.width / 2;
  const tooltipWidth = 350;
  let left = centerX - tooltipWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
  host.style.left = `${left}px`;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      @keyframes mytr-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes mytr-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }
      @keyframes mytr-blink {
        50% { opacity: 0; }
      }
      .mytr-tooltip {
        background: #1e1e2e;
        color: #cdd6f4;
        border-radius: 8px;
        border: 1px solid rgba(69, 71, 90, 0.6);
        border-top: 2px solid rgba(137, 180, 250, 0.3);
        padding: 12px 16px;
        font-size: 14px;
        line-height: 1.6;
        max-width: ${tooltipWidth}px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
        font-family: system-ui, sans-serif;
        word-wrap: break-word;
        animation: mytr-fade-in 0.15s ease;
      }
      .mytr-tooltip-loading {
        animation: mytr-pulse 1.5s ease-in-out infinite;
      }
      .mytr-tooltip-streaming::after {
        content: '|';
        animation: mytr-blink 1s step-end infinite;
        opacity: 0.4;
        margin-left: 1px;
      }
    </style>
    <div class="mytr-tooltip">
      <span class="mytr-tooltip-content mytr-tooltip-loading">翻译中...</span>
    </div>
  `;

  document.body.appendChild(host);
  return shadow.querySelector('.mytr-tooltip-content')!;
}

export function appendToTooltip(text: string): void {
  const host = document.querySelector(`[${TOOLTIP_ATTR}]`);
  if (!host?.shadowRoot) return;
  const content = host.shadowRoot.querySelector('.mytr-tooltip-content');
  if (!content) return;

  if (content.classList.contains('mytr-tooltip-loading')) {
    content.classList.remove('mytr-tooltip-loading');
    content.classList.add('mytr-tooltip-streaming');
    content.textContent = '';
  }
  content.textContent = (content.textContent ?? '') + text;
}

export function markTooltipDone(): void {
  const host = document.querySelector(`[${TOOLTIP_ATTR}]`);
  if (!host?.shadowRoot) return;
  const content = host.shadowRoot.querySelector('.mytr-tooltip-content');
  if (!content) return;
  content.classList.remove('mytr-tooltip-streaming');
}

export function removeTooltip(): void {
  document.querySelector(`[${TOOLTIP_ATTR}]`)?.remove();
}

export function setupSelectionListeners(
  onSelect: (text: string, rect: DOMRect) => void,
  mode: 'auto' | 'shortcut',
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleSelection = () => {
    const text = getSelectedText();
    if (!text) return;

    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode?.parentElement;
    if (!shouldTranslateSelection(text, anchorElement)) return;

    const range = selection?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (!rect) return;

    onSelect(text, rect);
  };

  const debouncedHandle = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSelection, 200);
  };

  if (mode === 'auto') {
    document.addEventListener('mouseup', debouncedHandle);
    document.addEventListener('selectionchange', debouncedHandle);
  }

  // Close on Escape or click outside
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') removeTooltip();
  };

  const handleMousedown = (e: MouseEvent) => {
    const tooltip = document.querySelector(`[${TOOLTIP_ATTR}]`);
    if (tooltip && !tooltip.contains(e.target as Node)) {
      removeTooltip();
    }
  };

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousedown', handleMousedown);

  return () => {
    clearTimeout(debounceTimer);
    document.removeEventListener('mouseup', debouncedHandle);
    document.removeEventListener('selectionchange', debouncedHandle);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('mousedown', handleMousedown);
  };
}

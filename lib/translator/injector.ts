import type { DisplayMode } from '../providers/types';

const STYLE_TAG_ID = 'mytr-styles';

const STYLES = `
.mytr-translation {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  border-left: 2px solid rgba(137, 180, 250, 0.3);
  padding-left: 8px;
  margin-top: 4px;
  opacity: 0.8;
}

.mytr-translation.mytr-streaming::after {
  content: '|';
  animation: mytr-blink 1s step-end infinite;
  opacity: 0.5;
}

@keyframes mytr-blink {
  50% { opacity: 0; }
}
`.trim();

export function ensureStylesInjected(): void {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

export function injectTranslation(blockId: string, sourceElement: Element, targetLang = 'zh'): HTMLElement {
  // Check if translation already exists
  const existing = document.querySelector(`[data-mytr-for="${blockId}"]`) as HTMLElement;
  if (existing) return existing;

  ensureStylesInjected();

  const translation = document.createElement(sourceElement.tagName);
  translation.className = 'mytr-translation mytr-streaming';
  translation.setAttribute('data-mytr-for', blockId);
  translation.setAttribute('lang', targetLang);

  sourceElement.after(translation);
  return translation;
}

export function appendToTranslation(blockId: string, text: string): void {
  const el = document.querySelector(`[data-mytr-for="${blockId}"]`);
  if (el) {
    el.textContent = (el.textContent ?? '') + text;
  }
}

export function markStreamingDone(blockId: string): void {
  const el = document.querySelector(`[data-mytr-for="${blockId}"]`);
  if (el) {
    el.classList.remove('mytr-streaming');
  }
}

export function removeAllTranslations(): void {
  document.querySelectorAll('.mytr-translation').forEach((el) => el.remove());
  document.querySelectorAll('[data-mytr-id]').forEach((el) => {
    el.removeAttribute('data-mytr-id');
  });
}

export function setDisplayMode(mode: DisplayMode): void {
  const sources = document.querySelectorAll('[data-mytr-id]') as NodeListOf<HTMLElement>;
  const targets = document.querySelectorAll('.mytr-translation') as NodeListOf<HTMLElement>;

  for (const el of sources) {
    el.style.display = mode === 'target-only' ? 'none' : '';
  }
  for (const el of targets) {
    el.style.display = mode === 'source-only' ? 'none' : '';
  }
}

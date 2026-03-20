import type { DisplayMode } from '../providers/types';

export function injectTranslation(blockId: string, sourceElement: Element, targetLang = 'zh'): HTMLElement {
  // Check if translation already exists
  const existing = document.querySelector(`[data-mytr-for="${blockId}"]`) as HTMLElement;
  if (existing) return existing;

  const translation = document.createElement(sourceElement.tagName);
  translation.className = 'mytr-translation';
  translation.setAttribute('data-mytr-for', blockId);
  translation.setAttribute('lang', targetLang);

  // Style: visually distinguish from source
  translation.style.opacity = '0.85';
  translation.style.borderLeft = '3px solid #4F46E5';
  translation.style.paddingLeft = '8px';
  translation.style.marginTop = '4px';

  sourceElement.after(translation);
  return translation;
}

export function appendToTranslation(blockId: string, text: string): void {
  const el = document.querySelector(`[data-mytr-for="${blockId}"]`);
  if (el) {
    el.textContent = (el.textContent ?? '') + text;
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

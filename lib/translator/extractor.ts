import type { TextBlock } from '../providers/types';

const TRANSLATABLE_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TD', 'TH', 'BLOCKQUOTE', 'DD', 'DT', 'FIGCAPTION',
]);

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
  'NAV', 'FOOTER', 'HEADER', 'ASIDE',
  'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'NOSCRIPT',
]);

export function extractTextBlocks(root: Element): TextBlock[] {
  // Prioritize article/main if present
  const mainContent =
    root.querySelector('article') ??
    root.querySelector('main') ??
    root.querySelector('[role="main"]');

  const container = mainContent ?? root;
  const blocks: TextBlock[] = [];

  walkElement(container, blocks);
  return blocks;
}

function walkElement(element: Element, blocks: TextBlock[]): void {
  const tag = element.tagName;

  if (SKIP_TAGS.has(tag)) return;
  if (element.classList.contains('mytr-translation')) return;
  if (element.hasAttribute('data-mytr-id')) return;

  if (TRANSLATABLE_TAGS.has(tag)) {
    const text = element.textContent?.trim();
    if (text && text.length >= 1 && !isOnlySymbolsOrNumbers(text)) {
      const id = `mytr-${crypto.randomUUID().slice(0, 8)}`;
      element.setAttribute('data-mytr-id', id);
      blocks.push({ id, element, text });
    }
    return; // Don't recurse into translatable elements
  }

  // Recurse into container elements
  for (const child of element.children) {
    walkElement(child, blocks);
  }
}

function isOnlySymbolsOrNumbers(text: string): boolean {
  return /^[\d\s\p{P}\p{S}]+$/u.test(text);
}

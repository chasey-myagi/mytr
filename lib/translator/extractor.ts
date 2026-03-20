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
  const blocks: TextBlock[] = [];

  // Prefer semantic content containers. Use querySelectorAll to capture ALL
  // article and main elements (e.g. GitHub issues, Reddit threads).
  const articles = Array.from(root.querySelectorAll('article'));
  const mains = Array.from(root.querySelectorAll('main'));
  const roleMain = Array.from(root.querySelectorAll('[role="main"]'));

  const containers: Element[] = [...articles, ...mains, ...roleMain];

  // Deduplicate (e.g. a <main> that also has role="main")
  const seen = new Set<Element>();
  const uniqueContainers: Element[] = [];
  for (const el of containers) {
    if (!seen.has(el)) {
      seen.add(el);
      uniqueContainers.push(el);
    }
  }

  if (uniqueContainers.length > 0) {
    for (const container of uniqueContainers) {
      walkElement(container, blocks);
    }
  } else {
    // Fallback: walk the entire root
    walkElement(root, blocks);
  }

  return blocks;
}

function walkElement(element: Element, blocks: TextBlock[]): void {
  const tag = element.tagName;

  if (SKIP_TAGS.has(tag)) return;
  if (element.classList.contains('mytr-translation')) return;
  if (element.hasAttribute('data-mytr-id')) return;

  if (TRANSLATABLE_TAGS.has(tag)) {
    const text = element.textContent?.trim();
    // Skip very short strings (single characters, buttons like "OK", "No")
    if (text && text.length >= 4 && !isOnlySymbolsOrNumbers(text)) {
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

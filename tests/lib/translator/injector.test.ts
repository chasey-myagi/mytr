import { describe, it, expect, beforeEach } from 'vitest';
import {
  injectTranslation,
  appendToTranslation,
  removeAllTranslations,
  setDisplayMode,
  ensureStylesInjected,
  markStreamingDone,
} from '@/lib/translator/injector';
import type { DisplayMode } from '@/lib/providers/types';

beforeEach(() => {
  document.body.innerHTML = '';
  // Clean up injected style tag between tests
  document.getElementById('mytr-styles')?.remove();
});

describe('ensureStylesInjected', () => {
  it('injects a style tag with id mytr-styles', () => {
    ensureStylesInjected();
    const style = document.getElementById('mytr-styles');
    expect(style).not.toBeNull();
    expect(style?.tagName).toBe('STYLE');
  });

  it('only injects one style tag even when called multiple times', () => {
    ensureStylesInjected();
    ensureStylesInjected();
    const styles = document.querySelectorAll('#mytr-styles');
    expect(styles.length).toBe(1);
  });
});

describe('injectTranslation', () => {
  it('inserts a translation element after the source', () => {
    document.body.innerHTML = '<p data-mytr-id="block-1">Hello</p>';
    const source = document.querySelector('p')!;
    injectTranslation('block-1', source);

    const translation = document.querySelector('.mytr-translation');
    expect(translation).not.toBeNull();
    expect(translation?.getAttribute('data-mytr-for')).toBe('block-1');
    expect(source.nextElementSibling).toBe(translation);
  });

  it('does not duplicate if translation already exists', () => {
    document.body.innerHTML = '<p data-mytr-id="block-1">Hello</p>';
    const source = document.querySelector('p')!;
    injectTranslation('block-1', source);
    injectTranslation('block-1', source);

    const translations = document.querySelectorAll('.mytr-translation');
    expect(translations.length).toBe(1);
  });

  it('adds mytr-streaming class by default', () => {
    document.body.innerHTML = '<p data-mytr-id="block-1">Hello</p>';
    const source = document.querySelector('p')!;
    injectTranslation('block-1', source);

    const translation = document.querySelector('.mytr-translation');
    expect(translation?.classList.contains('mytr-streaming')).toBe(true);
  });

  it('injects style tag into head', () => {
    document.body.innerHTML = '<p data-mytr-id="block-1">Hello</p>';
    const source = document.querySelector('p')!;
    injectTranslation('block-1', source);

    expect(document.getElementById('mytr-styles')).not.toBeNull();
  });
});

describe('markStreamingDone', () => {
  it('removes mytr-streaming class from translation element', () => {
    document.body.innerHTML = '<p data-mytr-id="block-1">Hello</p>';
    const source = document.querySelector('p')!;
    injectTranslation('block-1', source);

    markStreamingDone('block-1');

    const translation = document.querySelector('.mytr-translation');
    expect(translation?.classList.contains('mytr-streaming')).toBe(false);
  });

  it('does nothing if element does not exist', () => {
    expect(() => markStreamingDone('nonexistent')).not.toThrow();
  });
});

describe('appendToTranslation', () => {
  it('appends text to existing translation element', () => {
    document.body.innerHTML = '<p data-mytr-id="block-1">Hello</p>';
    const source = document.querySelector('p')!;
    injectTranslation('block-1', source);
    appendToTranslation('block-1', '你');
    appendToTranslation('block-1', '好');

    const translation = document.querySelector('.mytr-translation');
    expect(translation?.textContent).toBe('你好');
  });
});

describe('removeAllTranslations', () => {
  it('removes all translation elements and data attributes', () => {
    document.body.innerHTML =
      '<p data-mytr-id="b1">A</p><p class="mytr-translation" data-mytr-for="b1">甲</p>' +
      '<p data-mytr-id="b2">B</p><p class="mytr-translation" data-mytr-for="b2">乙</p>';

    removeAllTranslations();

    expect(document.querySelectorAll('.mytr-translation').length).toBe(0);
    expect(document.querySelectorAll('[data-mytr-id]').length).toBe(0);
  });
});

describe('setDisplayMode', () => {
  it('shows both in bilingual mode', () => {
    document.body.innerHTML =
      '<p data-mytr-id="b1">Hello</p><p class="mytr-translation" data-mytr-for="b1">你好</p>';

    setDisplayMode('bilingual');

    const source = document.querySelector('[data-mytr-id]') as HTMLElement;
    const target = document.querySelector('.mytr-translation') as HTMLElement;
    expect(source.style.display).not.toBe('none');
    expect(target.style.display).not.toBe('none');
  });

  it('hides source in target-only mode', () => {
    document.body.innerHTML =
      '<p data-mytr-id="b1">Hello</p><p class="mytr-translation" data-mytr-for="b1">你好</p>';

    setDisplayMode('target-only');

    const source = document.querySelector('[data-mytr-id]') as HTMLElement;
    const target = document.querySelector('.mytr-translation') as HTMLElement;
    expect(source.style.display).toBe('none');
    expect(target.style.display).not.toBe('none');
  });

  it('hides target in source-only mode', () => {
    document.body.innerHTML =
      '<p data-mytr-id="b1">Hello</p><p class="mytr-translation" data-mytr-for="b1">你好</p>';

    setDisplayMode('source-only');

    const source = document.querySelector('[data-mytr-id]') as HTMLElement;
    const target = document.querySelector('.mytr-translation') as HTMLElement;
    expect(source.style.display).not.toBe('none');
    expect(target.style.display).toBe('none');
  });
});

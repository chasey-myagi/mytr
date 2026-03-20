import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSelectedText, shouldTranslateSelection, createTooltip, removeTooltip } from '@/lib/translator/selector';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('getSelectedText', () => {
  it('returns empty string when nothing selected', () => {
    expect(getSelectedText()).toBe('');
  });
});

describe('shouldTranslateSelection', () => {
  it('rejects text shorter than 2 characters', () => {
    expect(shouldTranslateSelection('a')).toBe(false);
  });

  it('accepts text of 2+ characters', () => {
    expect(shouldTranslateSelection('hello')).toBe(true);
  });

  it('rejects text that is too long', () => {
    expect(shouldTranslateSelection('a'.repeat(5001))).toBe(false);
  });

  it('rejects text from translated elements', () => {
    document.body.innerHTML = '<p class="mytr-translation">translated</p>';
    const el = document.querySelector('.mytr-translation')!;
    expect(shouldTranslateSelection('translated', el)).toBe(false);
  });
});

describe('createTooltip / removeTooltip', () => {
  it('creates a shadow DOM tooltip container', () => {
    const rect = { top: 100, bottom: 120, left: 50, right: 200, width: 150, height: 20 };
    const tooltip = createTooltip(rect as DOMRect);
    expect(tooltip).not.toBeNull();
    expect(document.querySelector('[data-mytr-tooltip]')).not.toBeNull();
  });

  it('removes existing tooltip before creating new one', () => {
    const rect = { top: 100, bottom: 120, left: 50, right: 200, width: 150, height: 20 };
    createTooltip(rect as DOMRect);
    createTooltip(rect as DOMRect);
    expect(document.querySelectorAll('[data-mytr-tooltip]').length).toBe(1);
  });

  it('removeTooltip removes the tooltip', () => {
    const rect = { top: 100, bottom: 120, left: 50, right: 200, width: 150, height: 20 };
    createTooltip(rect as DOMRect);
    removeTooltip();
    expect(document.querySelector('[data-mytr-tooltip]')).toBeNull();
  });
});

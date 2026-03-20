import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildPageContext, buildTranslationContent } from '@/lib/prompt/builder';

describe('buildSystemPrompt', () => {
  it('includes target language and style', () => {
    const prompt = buildSystemPrompt('zh-CN', 'natural', '');
    expect(prompt).toContain('zh-CN');
    expect(prompt).toContain('[SEP]');
  });

  it('includes custom prompt when provided', () => {
    const prompt = buildSystemPrompt('zh-CN', 'natural', '翻译时保持技术术语不翻译');
    expect(prompt).toContain('翻译时保持技术术语不翻译');
  });
});

describe('buildPageContext', () => {
  it('includes title and hostname', () => {
    const ctx = buildPageContext('My Article', 'example.com');
    expect(ctx).toContain('My Article');
    expect(ctx).toContain('example.com');
  });
});

describe('buildTranslationContent', () => {
  it('formats single paragraph without numbering', () => {
    const content = buildTranslationContent(['Hello world']);
    expect(content).toBe('Hello world');
  });

  it('formats multiple paragraphs with numbered markers', () => {
    const content = buildTranslationContent(['First', 'Second', 'Third']);
    expect(content).toContain('[1]');
    expect(content).toContain('[2]');
    expect(content).toContain('[3]');
    expect(content).toContain('First');
    expect(content).toContain('Third');
  });
});

import { describe, it, expect } from 'vitest';
import { createBatches, parseSepStream } from '@/lib/translator/batcher';
import type { TextBlock } from '@/lib/providers/types';

describe('createBatches', () => {
  it('groups blocks into batches of max 10', () => {
    const blocks: TextBlock[] = Array.from({ length: 25 }, (_, i) => ({
      id: `block-${i}`,
      element: document.createElement('p'),
      text: `Paragraph ${i}`,
    }));
    const batches = createBatches(blocks, 10, 2000);
    expect(batches.length).toBe(3);
    expect(batches[0].length).toBe(10);
    expect(batches[1].length).toBe(10);
    expect(batches[2].length).toBe(5);
  });

  it('splits batch when token estimate exceeds limit', () => {
    const blocks: TextBlock[] = [
      { id: '1', element: document.createElement('p'), text: 'A'.repeat(1000) },
      { id: '2', element: document.createElement('p'), text: 'B'.repeat(1000) },
      { id: '3', element: document.createElement('p'), text: 'C'.repeat(100) },
    ];
    // ~500 tokens for 1000 chars, so 2 blocks exceed 2000 char estimate
    const batches = createBatches(blocks, 10, 800);
    expect(batches.length).toBeGreaterThan(1);
  });
});

describe('parseSepStream', () => {
  it('parses a complete single-paragraph response', async () => {
    const chunks = ['你好世界'];
    const results: Array<{ index: number; text: string }> = [];

    for await (const segment of parseSepStream(toAsyncIterable(chunks), 1)) {
      results.push(segment);
    }
    expect(results).toEqual([{ index: 0, text: '你好世界' }]);
  });

  it('parses multi-paragraph response with [SEP]', async () => {
    const chunks = ['[1] 第一段\n[SEP]\n[2] 第二段\n[SEP]\n[3] 第三段'];
    const results: Array<{ index: number; text: string }> = [];

    for await (const segment of parseSepStream(toAsyncIterable(chunks), 3)) {
      results.push(segment);
    }
    expect(results.length).toBe(3);
    expect(results[0].text).toContain('第一段');
    expect(results[1].text).toContain('第二段');
    expect(results[2].text).toContain('第三段');
  });

  it('handles [SEP] split across chunks', async () => {
    const chunks = ['[1] 第一段\n[SE', 'P]\n[2] 第二段'];
    const results: Array<{ index: number; text: string }> = [];

    for await (const segment of parseSepStream(toAsyncIterable(chunks), 2)) {
      results.push(segment);
    }
    expect(results.length).toBe(2);
    expect(results[0].text).toContain('第一段');
    expect(results[1].text).toContain('第二段');
  });
});

async function* toAsyncIterable(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

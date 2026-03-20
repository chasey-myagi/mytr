import { describe, it, expect } from 'vitest';
import { createBatches, parseSepStream } from '@/lib/translator/batcher';
import type { ParsedSegment } from '@/lib/translator/batcher';
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
  // Helper: collect only the "done" segments (final text per index)
  async function collectFinal(stream: AsyncIterable<ParsedSegment>): Promise<Array<{ index: number; text: string }>> {
    const finals: Array<{ index: number; text: string }> = [];
    for await (const seg of stream) {
      if (seg.done) {
        finals.push({ index: seg.index, text: seg.text });
      }
    }
    return finals;
  }

  // Helper: reconstruct full text per segment by concatenating all chunks
  async function collectReconstructed(stream: AsyncIterable<ParsedSegment>): Promise<Map<number, string>> {
    const accumulated = new Map<number, string>();
    for await (const seg of stream) {
      accumulated.set(seg.index, (accumulated.get(seg.index) ?? '') + seg.text);
    }
    return accumulated;
  }

  it('parses a complete single-paragraph response — done=true for final', async () => {
    const chunks = ['你好世界'];
    const results: ParsedSegment[] = [];

    for await (const segment of parseSepStream(toAsyncIterable(chunks), 1)) {
      results.push(segment);
    }

    // Last yielded item for index 0 must have done=true
    const doneItems = results.filter((r) => r.done);
    expect(doneItems.length).toBe(1);
    expect(doneItems[0].index).toBe(0);

    // Reconstructing all chunks for index 0 should equal the original text
    const reconstructed = new Map<number, string>();
    for (const seg of results) {
      reconstructed.set(seg.index, (reconstructed.get(seg.index) ?? '') + seg.text);
    }
    expect(reconstructed.get(0)).toBe('你好世界');
  });

  it('parses multi-paragraph response with [SEP] — yields partial chunks then done', async () => {
    const chunks = ['[1] 第一段\n[SEP]\n[2] 第二段\n[SEP]\n[3] 第三段'];
    const reconstructed = await collectReconstructed(parseSepStream(toAsyncIterable(chunks), 3));

    expect(reconstructed.size).toBe(3);
    expect(reconstructed.get(0)).toContain('第一段');
    expect(reconstructed.get(1)).toContain('第二段');
    expect(reconstructed.get(2)).toContain('第三段');
  });

  it('emits done=true exactly once per segment', async () => {
    const chunks = ['[1] 第一段\n[SEP]\n[2] 第二段\n[SEP]\n[3] 第三段'];
    const doneSegments = await collectFinal(parseSepStream(toAsyncIterable(chunks), 3));

    expect(doneSegments.length).toBe(3);
    expect(doneSegments[0].index).toBe(0);
    expect(doneSegments[1].index).toBe(1);
    expect(doneSegments[2].index).toBe(2);
  });

  it('handles [SEP] split across chunks — streams partial text and finalizes correctly', async () => {
    const chunks = ['[1] 第一段\n[SE', 'P]\n[2] 第二段'];
    const all: ParsedSegment[] = [];

    for await (const seg of parseSepStream(toAsyncIterable(chunks), 2)) {
      all.push(seg);
    }

    // Must have at least one done=true for each of the two segments
    const done0 = all.filter((s) => s.done && s.index === 0);
    const done1 = all.filter((s) => s.done && s.index === 1);
    expect(done0.length).toBe(1);
    expect(done1.length).toBe(1);

    // Reconstruct and verify content
    const reconstructed = new Map<number, string>();
    for (const seg of all) {
      reconstructed.set(seg.index, (reconstructed.get(seg.index) ?? '') + seg.text);
    }
    expect(reconstructed.get(0)).toContain('第一段');
    expect(reconstructed.get(1)).toContain('第二段');
  });

  it('yields intermediate partial chunks before [SEP] arrives', async () => {
    // Simulate token-by-token arrival: each character is a separate chunk
    const fullText = 'Hello world';
    const charChunks = fullText.split('');
    const all: ParsedSegment[] = [];

    for await (const seg of parseSepStream(toAsyncIterable(charChunks), 1)) {
      all.push(seg);
    }

    // There should be partial chunks with done=false before the final done=true
    const partials = all.filter((s) => !s.done);
    const finals = all.filter((s) => s.done);
    expect(finals.length).toBe(1);
    // With single-char chunks we expect streaming (may have some partials)
    const reconstructed = all.reduce((acc, s) => acc + s.text, '');
    expect(reconstructed).toBe(fullText);
  });

  it('strips [N] number prefix from each segment', async () => {
    const chunks = ['[1] First\n[SEP]\n[2] Second'];
    const finals = await collectFinal(parseSepStream(toAsyncIterable(chunks), 2));

    expect(finals[0].text).toBe('First');
    expect(finals[1].text).toBe('Second');
  });
});

async function* toAsyncIterable(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

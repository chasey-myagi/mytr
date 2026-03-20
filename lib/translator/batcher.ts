import type { TextBlock } from '../providers/types';

export function createBatches(
  blocks: TextBlock[],
  maxBlocks: number,
  maxChars: number,
): TextBlock[][] {
  const batches: TextBlock[][] = [];
  let current: TextBlock[] = [];
  let currentChars = 0;

  for (const block of blocks) {
    const blockChars = block.text.length;

    if (current.length >= maxBlocks || (currentChars + blockChars > maxChars && current.length > 0)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(block);
    currentChars += blockChars;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export interface ParsedSegment {
  index: number;
  text: string;
}

export async function* parseSepStream(
  stream: AsyncIterable<string>,
  expectedCount: number,
): AsyncIterable<ParsedSegment> {
  let buffer = '';
  let segmentIndex = 0;

  for await (const chunk of stream) {
    buffer += chunk;

    // Try to extract complete segments separated by [SEP]
    while (true) {
      const sepIndex = buffer.indexOf('[SEP]');
      if (sepIndex === -1) break;

      const segment = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + '[SEP]'.length);

      if (segment) {
        yield { index: segmentIndex, text: stripNumberPrefix(segment) };
        segmentIndex++;
      }
    }
  }

  // Yield remaining buffer as last segment
  const remaining = buffer.trim();
  if (remaining) {
    yield { index: segmentIndex, text: stripNumberPrefix(remaining) };
  }
}

function stripNumberPrefix(text: string): string {
  // Remove leading [N] marker if present
  return text.replace(/^\[\d+\]\s*/, '');
}

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
  done: boolean;
}

export async function* parseSepStream(
  stream: AsyncIterable<string>,
  expectedCount: number,
): AsyncIterable<ParsedSegment> {
  // buffer holds unconsumed input; segmentBuffer holds text accumulated for current segment
  let buffer = '';
  let segmentBuffer = '';
  let segmentIndex = 0;
  // Track whether the current segment has had its number prefix stripped already
  let prefixStripped = false;

  for await (const chunk of stream) {
    buffer += chunk;

    // Process as much of the buffer as possible
    while (buffer.length > 0) {
      const sepIndex = buffer.indexOf('[SEP]');

      if (sepIndex === -1) {
        // No complete [SEP] in buffer — but guard against partial [SEP] at the end.
        // Keep up to 4 trailing characters in reserve in case [SEP] is split across chunks.
        const safeLength = Math.max(0, buffer.length - 4);
        if (safeLength === 0) break;

        const safe = buffer.slice(0, safeLength);
        buffer = buffer.slice(safeLength);

        // Strip leading number prefix from the very first emission of each segment
        let emit = safe;
        if (!prefixStripped) {
          const combined = segmentBuffer + emit;
          const stripped = stripNumberPrefix(combined);
          if (stripped !== combined) {
            // Prefix was present and stripped
            segmentBuffer = '';
            emit = stripped;
            prefixStripped = true;
          } else if (combined.length >= 10) {
            // Enough data to know there's no prefix — commit it
            segmentBuffer = '';
            emit = combined;
            prefixStripped = true;
          } else {
            // Accumulate a bit more before deciding
            segmentBuffer = combined;
            break;
          }
        }

        if (emit) {
          yield { index: segmentIndex, text: emit, done: false };
        }
      } else {
        // [SEP] found — finalize current segment
        const beforeSep = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + '[SEP]'.length);

        let finalText = segmentBuffer + beforeSep;
        segmentBuffer = '';
        prefixStripped = false;

        finalText = stripNumberPrefix(finalText).trim();

        if (segmentIndex >= expectedCount) {
          console.warn(
            `[mytr] parseSepStream: yielded segment index ${segmentIndex} exceeds expectedCount ${expectedCount}`,
          );
        }

        yield { index: segmentIndex, text: finalText, done: true };
        segmentIndex++;
      }
    }
  }

  // Flush any remaining content as the last segment
  let remaining = (segmentBuffer + buffer).trim();
  remaining = stripNumberPrefix(remaining).trim();

  if (remaining) {
    if (segmentIndex >= expectedCount) {
      console.warn(
        `[mytr] parseSepStream: yielded segment index ${segmentIndex} exceeds expectedCount ${expectedCount}`,
      );
    }
    yield { index: segmentIndex, text: remaining, done: true };
  }
}

function stripNumberPrefix(text: string): string {
  // Remove leading [N] marker if present
  return text.replace(/^\[\d+\]\s*/, '');
}

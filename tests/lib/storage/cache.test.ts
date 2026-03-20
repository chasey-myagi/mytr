import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorageMocks } from '../../setup';
import { TranslationCache } from '@/lib/storage/cache';

let cache: TranslationCache;

beforeEach(() => {
  resetStorageMocks();
  cache = new TranslationCache();
});

describe('TranslationCache', () => {
  it('returns undefined for cache miss', async () => {
    const result = await cache.get('hello', 'auto', 'zh-CN', 'openai', 'gpt-4o');
    expect(result).toBeUndefined();
  });

  it('stores and retrieves a translation', async () => {
    await cache.set('hello', 'auto', 'zh-CN', 'openai', 'gpt-4o', '你好');
    const result = await cache.get('hello', 'auto', 'zh-CN', 'openai', 'gpt-4o');
    expect(result).toBe('你好');
  });

  it('returns undefined for different target lang', async () => {
    await cache.set('hello', 'auto', 'zh-CN', 'openai', 'gpt-4o', '你好');
    const result = await cache.get('hello', 'auto', 'ja', 'openai', 'gpt-4o');
    expect(result).toBeUndefined();
  });

  it('clears all cached translations', async () => {
    await cache.set('hello', 'auto', 'zh-CN', 'openai', 'gpt-4o', '你好');
    await cache.clear();
    const result = await cache.get('hello', 'auto', 'zh-CN', 'openai', 'gpt-4o');
    expect(result).toBeUndefined();
  });
});

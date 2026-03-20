const CACHE_KEY = 'translationCache';
const MAX_ENTRIES = 5000;

interface CacheEntry {
  value: string;
  timestamp: number;
}

type CacheStore = Record<string, CacheEntry>;

async function makeKey(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
  model: string,
): Promise<string> {
  const raw = `${sourceLang}|${targetLang}|${provider}|${model}|${text}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class TranslationCache {
  private store: CacheStore | null = null;

  private async load(): Promise<CacheStore> {
    if (this.store) return this.store;
    const data = await chrome.storage.local.get({ [CACHE_KEY]: {} });
    this.store = data[CACHE_KEY] as CacheStore;
    return this.store;
  }

  private async save(): Promise<void> {
    if (!this.store) return;
    await chrome.storage.local.set({ [CACHE_KEY]: this.store });
  }

  async get(
    text: string,
    sourceLang: string,
    targetLang: string,
    provider: string,
    model: string,
  ): Promise<string | undefined> {
    const store = await this.load();
    const key = await makeKey(text, sourceLang, targetLang, provider, model);
    const entry = store[key];
    if (!entry) return undefined;
    // LRU ordering is based on set() time, not last-access time. We intentionally
    // skip updating the timestamp here to avoid a full chrome.storage.local write
    // on every cache hit. This means infrequently-read entries may be evicted
    // before recently-read-but-older ones — an acceptable approximation of LRU.
    return entry.value;
  }

  async set(
    text: string,
    sourceLang: string,
    targetLang: string,
    provider: string,
    model: string,
    translation: string,
  ): Promise<void> {
    const store = await this.load();
    const key = await makeKey(text, sourceLang, targetLang, provider, model);
    store[key] = { value: translation, timestamp: Date.now() };
    await this.evictIfNeeded();
    await this.save();
  }

  private async evictIfNeeded(): Promise<void> {
    if (!this.store) return;
    const keys = Object.keys(this.store);
    if (keys.length <= MAX_ENTRIES) return;

    // Sort by timestamp ascending (oldest first), remove oldest
    const sorted = keys.sort(
      (a, b) => this.store![a].timestamp - this.store![b].timestamp,
    );
    const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
    for (const key of toRemove) {
      delete this.store[key];
    }
  }

  async clear(): Promise<void> {
    this.store = {};
    await this.save();
  }
}

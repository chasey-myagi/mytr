# mytr P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working browser translation extension with full-page bilingual translation, selection translation, AI engine management, popup settings, and keyboard shortcuts.

**Architecture:** WXT browser extension with three entry points: Background service worker (AI API calls, translation orchestration, caching), Content script (pure TS, DOM extraction/injection), and Popup (Svelte 5 settings UI). Communication via `chrome.runtime.sendMessage`.

**Tech Stack:** WXT, Svelte 5, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-mytr-browser-translator-design.md`

---

## File Structure

```
mytr/
├── wxt.config.ts                          # WXT config with Svelte module + commands
├── package.json
├── tsconfig.json
│
├── entrypoints/
│   ├── background.ts                      # Service worker: translation orchestration, API dispatch
│   ├── content.ts                         # Content script bootstrap: listens for commands, lazy-loads translator
│   └── popup/
│       ├── index.html                     # Popup HTML shell
│       ├── main.ts                        # Svelte 5 mount
│       ├── App.svelte                     # Root popup component
│       ├── ProviderSettings.svelte        # API key, base URL, model config
│       ├── PreferenceSettings.svelte      # Target lang, style, custom prompt
│       ├── BehaviorSettings.svelte        # Selection mode toggle
│       └── SiteRules.svelte              # Whitelist / blacklist management
│
├── lib/
│   ├── providers/
│   │   ├── types.ts                       # TranslationProvider, TranslateRequest, ProviderConfig
│   │   ├── openai-compatible.ts           # OpenAI-compatible streaming provider
│   │   └── claude.ts                      # Anthropic Messages API provider
│   │
│   ├── translator/
│   │   ├── extractor.ts                   # DOM traversal, text block extraction, main-content detection
│   │   ├── injector.ts                    # Translation result injection (paragraph-level, streaming)
│   │   ├── selector.ts                    # Selection detection, Shadow DOM tooltip, smart positioning
│   │   ├── batcher.ts                     # Batch paragraphs, stream-parse [SEP], buffer management
│   │   └── observer.ts                    # MutationObserver + IntersectionObserver coordination
│   │
│   ├── prompt/
│   │   └── builder.ts                     # Three-layer prompt construction (system + page context + content)
│   │
│   ├── storage/
│   │   ├── settings.ts                    # Settings read/write (sync for prefs, local for API keys)
│   │   └── cache.ts                       # Translation cache with LRU eviction
│   │
│   └── messaging/
│       └── bridge.ts                      # Type-safe message protocol between content ↔ background
│
├── assets/
│   └── icon.svg                           # Extension icon (single SVG, WXT generates sizes)
│
└── tests/
    ├── lib/
    │   ├── providers/
    │   │   ├── openai-compatible.test.ts
    │   │   └── claude.test.ts
    │   ├── translator/
    │   │   ├── extractor.test.ts
    │   │   ├── injector.test.ts
    │   │   ├── selector.test.ts
    │   │   ├── batcher.test.ts
    │   │   └── observer.test.ts
    │   ├── prompt/
    │   │   └── builder.test.ts
    │   ├── storage/
    │   │   ├── settings.test.ts
    │   │   └── cache.test.ts
    │   └── messaging/
    │       └── bridge.test.ts
    └── setup.ts                           # Test setup: mock chrome APIs
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `assets/icon.svg`
- Create: `tests/setup.ts`

- [ ] **Step 1: Initialize WXT project with Svelte 5**

```bash
cd /Users/chasey/Dev/browser-extensions/mytr
pnpm init
pnpm add -D wxt @wxt-dev/module-svelte typescript
pnpm add svelte
```

- [ ] **Step 2: Create wxt.config.ts**

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'mytr',
    description: 'AI-powered browser translation extension',
    permissions: ['activeTab', 'storage', 'unlimitedStorage'],
    commands: {
      'translate-page': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: 'Translate current page',
      },
      'stop-translation': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Stop translation / clear translations',
      },
      'toggle-display-mode': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Toggle display mode (bilingual / target only / source only)',
      },
      'translate-selection': {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: 'Translate selected text',
      },
    },
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["**/*.ts", "**/*.svelte"],
  "exclude": ["node_modules", ".output", ".wxt"]
}
```

- [ ] **Step 4: Install test dependencies and create test setup**

```bash
pnpm add -D vitest jsdom @vitest/coverage-v8
```

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Create `tests/setup.ts`:
```typescript
// tests/setup.ts
// Mock chrome.storage API for tests
const storageData: Record<string, Record<string, unknown>> = {
  sync: {},
  local: {},
};

function createStorageArea(area: 'sync' | 'local') {
  return {
    get: async (keys?: string | string[] | Record<string, unknown>) => {
      if (!keys) return { ...storageData[area] };
      if (typeof keys === 'string') {
        return { [keys]: storageData[area][keys] };
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          result[key] = storageData[area][key];
        }
        return result;
      }
      // keys is defaults object
      const result: Record<string, unknown> = {};
      for (const [key, defaultVal] of Object.entries(keys)) {
        result[key] = storageData[area][key] ?? defaultVal;
      }
      return result;
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(storageData[area], items);
    },
    remove: async (keys: string | string[]) => {
      const keyArr = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyArr) {
        delete storageData[area][key];
      }
    },
    clear: async () => {
      storageData[area] = {};
    },
  };
}

const chromeMock = {
  storage: {
    sync: createStorageArea('sync'),
    local: createStorageArea('local'),
  },
  runtime: {
    sendMessage: async () => ({}),
    onMessage: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
};

// @ts-expect-error mock
globalThis.chrome = chromeMock;

export function resetStorageMocks() {
  storageData.sync = {};
  storageData.local = {};
}
```

Add vitest config to `wxt.config.ts` or create `vitest.config.ts`:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
```

- [ ] **Step 5: Create placeholder icon**

Create `assets/icon.svg` — a simple placeholder SVG:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="16" fill="#4F46E5"/>
  <text x="64" y="80" text-anchor="middle" font-size="64" font-family="system-ui" fill="white" font-weight="bold">译</text>
</svg>
```

- [ ] **Step 6: Verify project builds**

```bash
pnpm wxt prepare
```

Expected: `.wxt/` directory created with type definitions.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold WXT + Svelte 5 + TypeScript project"
```

---

### Task 2: Type Definitions & Message Protocol

**Files:**
- Create: `lib/providers/types.ts`
- Create: `lib/messaging/bridge.ts`
- Create: `tests/lib/messaging/bridge.test.ts`

- [ ] **Step 1: Write provider type definitions**

```typescript
// lib/providers/types.ts
export interface TranslateRequest {
  text: string;
  sourceLang: string | 'auto';
  targetLang: string;
  style: string;
  context?: string;
}

export interface TranslationProvider {
  name: string;
  translate(request: TranslateRequest): AsyncIterable<string>;
}

export interface ProviderConfig {
  provider: 'openai-compatible' | 'claude';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type DisplayMode = 'bilingual' | 'target-only' | 'source-only';

export interface TextBlock {
  id: string;
  element: Element;
  text: string;
}

export type TranslationStatus = 'idle' | 'translating' | 'paused' | 'error';
```

- [ ] **Step 2: Write failing test for message bridge**

```typescript
// tests/lib/messaging/bridge.test.ts
import { describe, it, expect } from 'vitest';
import {
  type TranslatePageMessage,
  type TranslateSelectionMessage,
  type StopTranslationMessage,
  type TranslationChunkResponse,
  type MessageMap,
  createMessage,
} from '@/lib/messaging/bridge';

describe('messaging bridge', () => {
  it('creates a translate-page message with correct shape', () => {
    const msg = createMessage('translate-page', {
      tabId: 1,
      pageContext: { title: 'Test', hostname: 'example.com' },
    });
    expect(msg.type).toBe('translate-page');
    expect(msg.payload.tabId).toBe(1);
    expect(msg.payload.pageContext.title).toBe('Test');
  });

  it('creates a translate-selection message', () => {
    const msg = createMessage('translate-selection', {
      text: 'hello',
      tabId: 1,
    });
    expect(msg.type).toBe('translate-selection');
    expect(msg.payload.text).toBe('hello');
  });

  it('creates a stop-translation message', () => {
    const msg = createMessage('stop-translation', { tabId: 1 });
    expect(msg.type).toBe('stop-translation');
  });
});
```

Run: `pnpm vitest run tests/lib/messaging/bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement message bridge**

```typescript
// lib/messaging/bridge.ts
export interface PageContext {
  title: string;
  hostname: string;
}

export interface TranslatePagePayload {
  tabId: number;
  pageContext: PageContext;
}

export interface TranslateSelectionPayload {
  text: string;
  tabId: number;
}

export interface StopTranslationPayload {
  tabId: number;
}

export interface TranslationChunkPayload {
  blockId: string;
  chunk: string;
  done: boolean;
}

export interface ToggleDisplayModePayload {
  tabId: number;
}

export interface TranslateBatchPayload {
  blocks: Array<{ id: string; text: string }>;
  content: string;
  pageContext: string;
  targetLang: string;
  sourceLang: string;
  style: string;
  customPrompt: string;
}

export interface SelectionChunkPayload {
  chunk: string;
  done: boolean;
}

export interface SelectionErrorPayload {
  error: string;
}

export interface CommandPayload {
  command: string;
}

export interface ExtractAndTranslatePayload {
  pageContext: string;
  targetLang: string;
  sourceLang: string;
  style: string;
  customPrompt: string;
  provider: string;
  model: string;
}

export interface MessageMap {
  'translate-page': TranslatePagePayload;
  'translate-selection': TranslateSelectionPayload;
  'stop-translation': StopTranslationPayload;
  'translation-chunk': TranslationChunkPayload;
  'toggle-display-mode': ToggleDisplayModePayload;
  'translate-batch': TranslateBatchPayload;
  'selection-chunk': SelectionChunkPayload;
  'selection-error': SelectionErrorPayload;
  'command': CommandPayload;
  'extract-and-translate': ExtractAndTranslatePayload;
}

export interface Message<T extends keyof MessageMap = keyof MessageMap> {
  type: T;
  payload: MessageMap[T];
}

export function createMessage<T extends keyof MessageMap>(
  type: T,
  payload: MessageMap[T],
): Message<T> {
  return { type, payload };
}

export async function sendToBackground<T extends keyof MessageMap>(
  type: T,
  payload: MessageMap[T],
): Promise<void> {
  await chrome.runtime.sendMessage(createMessage(type, payload));
}

export function onMessage<T extends keyof MessageMap>(
  type: T,
  handler: (payload: MessageMap[T], sender: chrome.runtime.MessageSender) => void | Promise<void>,
): () => void {
  const listener = (
    message: Message,
    sender: chrome.runtime.MessageSender,
  ) => {
    if (message.type === type) {
      handler(message.payload as MessageMap[T], sender);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/messaging/bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/providers/types.ts lib/messaging/bridge.ts tests/lib/messaging/bridge.test.ts
git commit -m "feat: add type definitions and type-safe message bridge"
```

---

### Task 3: Settings Storage

**Files:**
- Create: `lib/storage/settings.ts`
- Create: `tests/lib/storage/settings.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/storage/settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetStorageMocks } from '../../setup';
import {
  getProviderConfig,
  saveProviderConfig,
  getPreferences,
  savePreferences,
  getSiteRules,
  saveSiteRules,
  type Preferences,
  type SiteRules,
} from '@/lib/storage/settings';
import type { ProviderConfig } from '@/lib/providers/types';

beforeEach(() => {
  resetStorageMocks();
});

describe('provider config (stored in local)', () => {
  it('returns default config when nothing saved', async () => {
    const config = await getProviderConfig();
    expect(config.provider).toBe('openai-compatible');
    expect(config.apiKey).toBe('');
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.model).toBe('gpt-4o-mini');
  });

  it('saves and retrieves provider config', async () => {
    const config: ProviderConfig = {
      provider: 'claude',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    };
    await saveProviderConfig(config);
    const result = await getProviderConfig();
    expect(result).toEqual(config);
  });
});

describe('preferences (stored in sync)', () => {
  it('returns defaults when nothing saved', async () => {
    const prefs = await getPreferences();
    expect(prefs.targetLang).toBe('zh-CN');
    expect(prefs.style).toBe('natural');
    expect(prefs.selectionMode).toBe('auto');
  });

  it('saves and retrieves preferences', async () => {
    await savePreferences({ targetLang: 'ja', style: 'academic' });
    const prefs = await getPreferences();
    expect(prefs.targetLang).toBe('ja');
    expect(prefs.style).toBe('academic');
  });
});

describe('site rules (stored in sync)', () => {
  it('returns empty lists by default', async () => {
    const rules = await getSiteRules();
    expect(rules.alwaysTranslate).toEqual([]);
    expect(rules.neverTranslate).toEqual([]);
  });

  it('saves and retrieves site rules', async () => {
    const rules: SiteRules = {
      alwaysTranslate: ['example.com'],
      neverTranslate: ['localhost'],
    };
    await saveSiteRules(rules);
    const result = await getSiteRules();
    expect(result).toEqual(rules);
  });
});
```

Run: `pnpm vitest run tests/lib/storage/settings.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement settings storage**

```typescript
// lib/storage/settings.ts
import type { ProviderConfig } from '../providers/types';

export interface Preferences {
  targetLang: string;
  sourceLang: string;
  style: string;
  customPrompt: string;
  selectionMode: 'auto' | 'shortcut';
}

export interface SiteRules {
  alwaysTranslate: string[];
  neverTranslate: string[];
}

const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'openai-compatible',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

const DEFAULT_PREFERENCES: Preferences = {
  targetLang: 'zh-CN',
  sourceLang: 'auto',
  style: 'natural',
  customPrompt: '',
  selectionMode: 'auto',
};

const DEFAULT_SITE_RULES: SiteRules = {
  alwaysTranslate: [],
  neverTranslate: [],
};

// API Key stored in local (sensitive)
export async function getProviderConfig(): Promise<ProviderConfig> {
  const data = await chrome.storage.local.get({
    providerConfig: DEFAULT_PROVIDER_CONFIG,
  });
  return data.providerConfig as ProviderConfig;
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await chrome.storage.local.set({ providerConfig: config });
}

// Preferences stored in sync (non-sensitive, cross-device)
export async function getPreferences(): Promise<Preferences> {
  const data = await chrome.storage.sync.get({
    preferences: DEFAULT_PREFERENCES,
  });
  return data.preferences as Preferences;
}

export async function savePreferences(partial: Partial<Preferences>): Promise<void> {
  const current = await getPreferences();
  await chrome.storage.sync.set({
    preferences: { ...current, ...partial },
  });
}

// Site rules stored in sync
export async function getSiteRules(): Promise<SiteRules> {
  const data = await chrome.storage.sync.get({
    siteRules: DEFAULT_SITE_RULES,
  });
  return data.siteRules as SiteRules;
}

export async function saveSiteRules(rules: SiteRules): Promise<void> {
  await chrome.storage.sync.set({ siteRules: rules });
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/storage/settings.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/storage/settings.ts tests/lib/storage/settings.test.ts
git commit -m "feat: add settings storage with sync/local split"
```

---

### Task 4: Translation Cache

**Files:**
- Create: `lib/storage/cache.ts`
- Create: `tests/lib/storage/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/storage/cache.test.ts
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
```

Run: `pnpm vitest run tests/lib/storage/cache.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement translation cache**

```typescript
// lib/storage/cache.ts
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
    // Update timestamp for LRU
    entry.timestamp = Date.now();
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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/storage/cache.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/storage/cache.ts tests/lib/storage/cache.test.ts
git commit -m "feat: add translation cache with LRU eviction"
```

---

### Task 5: Prompt Builder

**Files:**
- Create: `lib/prompt/builder.ts`
- Create: `tests/lib/prompt/builder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/prompt/builder.test.ts
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
```

Run: `pnpm vitest run tests/lib/prompt/builder.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement prompt builder**

```typescript
// lib/prompt/builder.ts
export function buildSystemPrompt(
  targetLang: string,
  style: string,
  customPrompt: string,
): string {
  const styleMap: Record<string, string> = {
    natural: '自然流畅，符合目标语言的表达习惯',
    academic: '学术严谨，使用专业术语',
    casual: '口语化，轻松自然',
    literal: '直译，尽可能保留原文结构',
  };

  const styleDesc = styleMap[style] ?? style;

  let prompt = `你是一个专业翻译器。将以下文本翻译成${targetLang}。
风格要求：${styleDesc}
规则：
- 只输出译文，不要解释
- 保留原文中的代码、URL、专有名词不翻译
- 多段翻译时，每段译文前标注对应编号如 [1]、[2]，段间用 [SEP] 分隔
- 保持原文的格式标记（加粗、斜体等）`;

  if (customPrompt) {
    prompt += `\n\n用户附加要求：\n${customPrompt}`;
  }

  return prompt;
}

export function buildPageContext(title: string, hostname: string): string {
  return `页面：${title}\n来源：${hostname}`;
}

export function buildTranslationContent(paragraphs: string[]): string {
  if (paragraphs.length === 1) {
    return paragraphs[0];
  }
  return paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/prompt/builder.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/prompt/builder.ts tests/lib/prompt/builder.test.ts
git commit -m "feat: add three-layer prompt builder"
```

---

### Task 6: Batch Processor with [SEP] Stream Parsing

**Files:**
- Create: `lib/translator/batcher.ts`
- Create: `tests/lib/translator/batcher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/translator/batcher.test.ts
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
```

Run: `pnpm vitest run tests/lib/translator/batcher.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement batcher**

```typescript
// lib/translator/batcher.ts
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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/translator/batcher.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/translator/batcher.ts tests/lib/translator/batcher.test.ts
git commit -m "feat: add batch processor with robust [SEP] stream parsing"
```

---

### Task 7: OpenAI-Compatible Translation Provider

**Files:**
- Create: `lib/providers/openai-compatible.ts`
- Create: `tests/lib/providers/openai-compatible.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/providers/openai-compatible.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAICompatibleProvider } from '@/lib/providers/openai-compatible';
import type { TranslateRequest } from '@/lib/providers/types';

const mockRequest: TranslateRequest = {
  text: 'Hello world',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  style: 'natural',
};

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct name', () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });
    expect(provider.name).toBe('openai-compatible');
  });

  it('sends correct request format', async () => {
    const mockResponse = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'),
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockResponse,
    }));

    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.translate(mockRequest)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('你好');
    expect(fetch).toHaveBeenCalledOnce();

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.openai.com/v1/chat/completions');

    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.stream).toBe(true);
    expect(body.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    }));

    const provider = new OpenAICompatibleProvider({
      apiKey: 'bad-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });

    const chunks: string[] = [];
    await expect(async () => {
      for await (const chunk of provider.translate(mockRequest)) {
        chunks.push(chunk);
      }
    }).rejects.toThrow();
  });
});
```

Run: `pnpm vitest run tests/lib/providers/openai-compatible.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement OpenAI-compatible provider**

```typescript
// lib/providers/openai-compatible.ts
import type { TranslationProvider, TranslateRequest } from './types';
import { buildSystemPrompt, buildPageContext, buildTranslationContent } from '../prompt/builder';

interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class OpenAICompatibleProvider implements TranslationProvider {
  name = 'openai-compatible' as const;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
  }

  async *translate(request: TranslateRequest): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(request.targetLang, request.style, '');
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (request.context) {
      messages.push({ role: 'user', content: request.context });
    }

    messages.push({ role: 'user', content: request.text });

    const url = `${this.config.baseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice('data: '.length);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/providers/openai-compatible.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/providers/openai-compatible.ts tests/lib/providers/openai-compatible.test.ts
git commit -m "feat: add OpenAI-compatible streaming translation provider"
```

---

### Task 8: Claude Translation Provider

**Files:**
- Create: `lib/providers/claude.ts`
- Create: `tests/lib/providers/claude.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/providers/claude.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProvider } from '@/lib/providers/claude';
import type { TranslateRequest } from '@/lib/providers/types';

const mockRequest: TranslateRequest = {
  text: 'Hello world',
  sourceLang: 'auto',
  targetLang: 'zh-CN',
  style: 'natural',
};

describe('ClaudeProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct name', () => {
    const provider = new ClaudeProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    });
    expect(provider.name).toBe('claude');
  });

  it('sends correct Anthropic Messages API format', async () => {
    const mockResponse = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n'));
        controller.enqueue(enc.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: mockResponse,
    }));

    const provider = new ClaudeProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-20250514',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.translate(mockRequest)) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('你好');

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.anthropic.com/v1/messages');

    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBeDefined();

    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.stream).toBe(true);
    expect(body.system).toBeDefined();
  });
});
```

Run: `pnpm vitest run tests/lib/providers/claude.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement Claude provider**

```typescript
// lib/providers/claude.ts
import type { TranslationProvider, TranslateRequest } from './types';
import { buildSystemPrompt } from '../prompt/builder';

interface ClaudeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class ClaudeProvider implements TranslationProvider {
  name = 'claude' as const;
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  async *translate(request: TranslateRequest): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(request.targetLang, request.style, '');

    const messages: Array<{ role: string; content: string }> = [];
    if (request.context) {
      messages.push({ role: 'user', content: request.context });
      messages.push({ role: 'assistant', content: '好的，我了解了页面上下文。请提供需要翻译的内容。' });
    }
    messages.push({ role: 'user', content: request.text });

    const url = `${this.config.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice('data: '.length);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/providers/claude.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/providers/claude.ts tests/lib/providers/claude.test.ts
git commit -m "feat: add Claude (Anthropic Messages API) streaming provider"
```

---

### Task 9: DOM Text Extractor

**Files:**
- Create: `lib/translator/extractor.ts`
- Create: `tests/lib/translator/extractor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/translator/extractor.test.ts
import { describe, it, expect } from 'vitest';
import { extractTextBlocks } from '@/lib/translator/extractor';

function createPage(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('extractTextBlocks', () => {
  it('extracts paragraphs from simple page', () => {
    createPage('<p>Hello world</p><p>Second paragraph</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Hello world');
    expect(blocks[1].text).toBe('Second paragraph');
  });

  it('extracts headings', () => {
    createPage('<h1>Title</h1><p>Content</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Title');
  });

  it('skips script and style elements', () => {
    createPage('<p>Visible</p><script>alert(1)</script><style>.x{}</style>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Visible');
  });

  it('skips code and pre elements', () => {
    createPage('<p>Text</p><pre>code block</pre><code>inline code</code>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
  });

  it('skips nav, footer, header elements', () => {
    createPage('<nav><p>Nav link</p></nav><p>Content</p><footer><p>Footer</p></footer>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Content');
  });

  it('prioritizes article/main content', () => {
    createPage('<p>Outside</p><article><p>Inside article</p></article>');
    const blocks = extractTextBlocks(document.body);
    // When article exists, only extract from article
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Inside article');
  });

  it('falls back to body when no article/main', () => {
    createPage('<div><p>Paragraph 1</p><p>Paragraph 2</p></div>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(2);
  });

  it('skips already-translated elements', () => {
    createPage('<p>Original</p><p class="mytr-translation">已翻译</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Original');
  });

  it('skips empty or whitespace-only text', () => {
    createPage('<p>   </p><p>Real text</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
  });

  it('assigns unique IDs to each block', () => {
    createPage('<p>A</p><p>B</p><p>C</p>');
    const blocks = extractTextBlocks(document.body);
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
  });
});
```

Run: `pnpm vitest run tests/lib/translator/extractor.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement extractor**

```typescript
// lib/translator/extractor.ts
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
  // Prioritize article/main if present
  const mainContent =
    root.querySelector('article') ??
    root.querySelector('main') ??
    root.querySelector('[role="main"]');

  const container = mainContent ?? root;
  const blocks: TextBlock[] = [];

  walkElement(container, blocks);
  return blocks;
}

function walkElement(element: Element, blocks: TextBlock[]): void {
  const tag = element.tagName;

  if (SKIP_TAGS.has(tag)) return;
  if (element.classList.contains('mytr-translation')) return;
  if (element.hasAttribute('data-mytr-id')) return;

  if (TRANSLATABLE_TAGS.has(tag)) {
    const text = element.textContent?.trim();
    if (text && text.length >= 2 && !isOnlySymbolsOrNumbers(text)) {
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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/translator/extractor.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/translator/extractor.ts tests/lib/translator/extractor.test.ts
git commit -m "feat: add DOM text extractor with main-content detection"
```

---

### Task 10: Translation Injector

**Files:**
- Create: `lib/translator/injector.ts`
- Create: `tests/lib/translator/injector.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/translator/injector.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  injectTranslation,
  appendToTranslation,
  removeAllTranslations,
  setDisplayMode,
} from '@/lib/translator/injector';
import type { DisplayMode } from '@/lib/providers/types';

beforeEach(() => {
  document.body.innerHTML = '';
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
```

Run: `pnpm vitest run tests/lib/translator/injector.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement injector**

```typescript
// lib/translator/injector.ts
import type { DisplayMode } from '../providers/types';

export function injectTranslation(blockId: string, sourceElement: Element): HTMLElement {
  // Check if translation already exists
  const existing = document.querySelector(`[data-mytr-for="${blockId}"]`) as HTMLElement;
  if (existing) return existing;

  const translation = document.createElement(sourceElement.tagName);
  translation.className = 'mytr-translation';
  translation.setAttribute('data-mytr-for', blockId);
  translation.setAttribute('lang', 'zh');

  // Style: visually distinguish from source
  translation.style.opacity = '0.85';
  translation.style.borderLeft = '3px solid #4F46E5';
  translation.style.paddingLeft = '8px';
  translation.style.marginTop = '4px';

  sourceElement.after(translation);
  return translation;
}

export function appendToTranslation(blockId: string, text: string): void {
  const el = document.querySelector(`[data-mytr-for="${blockId}"]`);
  if (el) {
    el.textContent = (el.textContent ?? '') + text;
  }
}

export function removeAllTranslations(): void {
  document.querySelectorAll('.mytr-translation').forEach((el) => el.remove());
  document.querySelectorAll('[data-mytr-id]').forEach((el) => {
    el.removeAttribute('data-mytr-id');
  });
}

export function setDisplayMode(mode: DisplayMode): void {
  const sources = document.querySelectorAll('[data-mytr-id]') as NodeListOf<HTMLElement>;
  const targets = document.querySelectorAll('.mytr-translation') as NodeListOf<HTMLElement>;

  for (const el of sources) {
    el.style.display = mode === 'target-only' ? 'none' : '';
  }
  for (const el of targets) {
    el.style.display = mode === 'source-only' ? 'none' : '';
  }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/translator/injector.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/translator/injector.ts tests/lib/translator/injector.test.ts
git commit -m "feat: add translation injector with display mode switching"
```

---

### Task 11: Selection Translator (Shadow DOM Tooltip)

**Files:**
- Create: `lib/translator/selector.ts`
- Create: `tests/lib/translator/selector.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/translator/selector.test.ts
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
```

Run: `pnpm vitest run tests/lib/translator/selector.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement selection translator**

```typescript
// lib/translator/selector.ts
const MAX_SELECTION_LENGTH = 5000;
const TOOLTIP_ID = 'data-mytr-tooltip';

export function getSelectedText(): string {
  return window.getSelection()?.toString().trim() ?? '';
}

export function shouldTranslateSelection(text: string, anchorElement?: Element | null): boolean {
  if (text.length < 2) return false;
  if (text.length > MAX_SELECTION_LENGTH) return false;

  // Reject if selected from a translated element
  if (anchorElement?.closest('.mytr-translation')) return false;

  // Reject if selected from input/textarea/contenteditable
  if (anchorElement) {
    const tag = anchorElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
    if (anchorElement.closest('[contenteditable="true"]')) return false;
  }

  return true;
}

export function createTooltip(selectionRect: DOMRect): HTMLElement {
  removeTooltip();

  const host = document.createElement('div');
  host.setAttribute(TOOLTIP_ID, '');
  host.style.position = 'absolute';
  host.style.zIndex = '2147483647';

  // Smart positioning: prefer below, fallback to above
  const spaceBelow = window.innerHeight - selectionRect.bottom;
  const tooltipEstimatedHeight = 150;

  if (spaceBelow >= tooltipEstimatedHeight) {
    host.style.top = `${selectionRect.bottom + window.scrollY + 8}px`;
  } else {
    host.style.top = `${selectionRect.top + window.scrollY - tooltipEstimatedHeight - 8}px`;
  }

  // Horizontal: center on selection, clamp to viewport
  const centerX = selectionRect.left + selectionRect.width / 2;
  const tooltipWidth = 350;
  let left = centerX - tooltipWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
  host.style.left = `${left}px`;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .mytr-tooltip {
        background: #1e1e2e;
        color: #cdd6f4;
        border-radius: 8px;
        padding: 12px 16px;
        font-size: 14px;
        line-height: 1.6;
        max-width: ${tooltipWidth}px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        font-family: system-ui, sans-serif;
        word-wrap: break-word;
      }
      .mytr-tooltip-loading {
        opacity: 0.6;
      }
    </style>
    <div class="mytr-tooltip">
      <span class="mytr-tooltip-content mytr-tooltip-loading">翻译中...</span>
    </div>
  `;

  document.body.appendChild(host);
  return shadow.querySelector('.mytr-tooltip-content')!;
}

export function appendToTooltip(text: string): void {
  const host = document.querySelector(`[${TOOLTIP_ID}]`);
  if (!host?.shadowRoot) return;
  const content = host.shadowRoot.querySelector('.mytr-tooltip-content');
  if (!content) return;

  if (content.classList.contains('mytr-tooltip-loading')) {
    content.classList.remove('mytr-tooltip-loading');
    content.textContent = '';
  }
  content.textContent = (content.textContent ?? '') + text;
}

export function removeTooltip(): void {
  document.querySelector(`[${TOOLTIP_ID}]`)?.remove();
}

export function setupSelectionListeners(
  onSelect: (text: string, rect: DOMRect) => void,
  mode: 'auto' | 'shortcut',
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleSelection = () => {
    const text = getSelectedText();
    if (!text) return;

    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode?.parentElement;
    if (!shouldTranslateSelection(text, anchorElement)) return;

    const range = selection?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (!rect) return;

    onSelect(text, rect);
  };

  const debouncedHandle = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleSelection, 200);
  };

  if (mode === 'auto') {
    document.addEventListener('mouseup', debouncedHandle);
    document.addEventListener('selectionchange', debouncedHandle);
  }

  // Close on Escape or click outside
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') removeTooltip();
  };

  const handleMousedown = (e: MouseEvent) => {
    const tooltip = document.querySelector(`[${TOOLTIP_ID}]`);
    if (tooltip && !tooltip.contains(e.target as Node)) {
      removeTooltip();
    }
  };

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousedown', handleMousedown);

  return () => {
    clearTimeout(debounceTimer);
    document.removeEventListener('mouseup', debouncedHandle);
    document.removeEventListener('selectionchange', debouncedHandle);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('mousedown', handleMousedown);
  };
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/translator/selector.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/translator/selector.ts tests/lib/translator/selector.test.ts
git commit -m "feat: add selection translator with Shadow DOM tooltip"
```

---

### Task 12: Observer (MutationObserver + IntersectionObserver)

**Files:**
- Create: `lib/translator/observer.ts`
- Create: `tests/lib/translator/observer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/translator/observer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { debounce } from '@/lib/translator/observer';

describe('debounce', () => {
  it('delays function execution', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('resets timer on subsequent calls', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    vi.advanceTimersByTime(200);
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});
```

Run: `pnpm vitest run tests/lib/translator/observer.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement observer**

```typescript
// lib/translator/observer.ts
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function createVisibilityObserver(
  onVisible: (elements: Element[]) => void,
  scrollDebounceMs = 300,
): { observe: (el: Element) => void; disconnect: () => void } {
  const pendingElements: Element[] = [];
  const debouncedFlush = debounce(() => {
    if (pendingElements.length > 0) {
      onVisible([...pendingElements]);
      pendingElements.length = 0;
    }
  }, scrollDebounceMs);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          pendingElements.push(entry.target);
          observer.unobserve(entry.target);
        }
      }
      if (pendingElements.length > 0) {
        debouncedFlush();
      }
    },
    { rootMargin: '200px' }, // Trigger slightly before entering viewport
  );

  return {
    observe: (el: Element) => observer.observe(el),
    disconnect: () => observer.disconnect(),
  };
}

export function createMutationWatcher(
  onNewContent: (addedNodes: Element[]) => void,
): { disconnect: () => void } {
  const observer = new MutationObserver((mutations) => {
    const added: Element[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && !node.classList.contains('mytr-translation')) {
          added.push(node);
        }
      }
    }
    if (added.length > 0) {
      onNewContent(added);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return { disconnect: () => observer.disconnect() };
}

export function createRouteWatcher(onRouteChange: () => void): () => void {
  const handler = () => onRouteChange();
  window.addEventListener('popstate', handler);
  window.addEventListener('hashchange', handler);

  return () => {
    window.removeEventListener('popstate', handler);
    window.removeEventListener('hashchange', handler);
  };
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm vitest run tests/lib/translator/observer.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/translator/observer.ts tests/lib/translator/observer.test.ts
git commit -m "feat: add observers for viewport visibility, DOM mutations, and route changes"
```

---

### Task 13: Background Service Worker

**Files:**
- Create: `entrypoints/background.ts`

This task wires together providers, settings, cache, batcher, and messaging into the background service worker. No unit tests for this entry point — it will be tested via manual integration testing.

- [ ] **Step 1: Implement background service worker**

```typescript
// entrypoints/background.ts
import { OpenAICompatibleProvider } from '@/lib/providers/openai-compatible';
import { ClaudeProvider } from '@/lib/providers/claude';
import type { TranslationProvider, TranslateRequest } from '@/lib/providers/types';
import { getProviderConfig, getPreferences, getSiteRules } from '@/lib/storage/settings';
import { TranslationCache } from '@/lib/storage/cache';
import { buildSystemPrompt, buildPageContext, buildTranslationContent } from '@/lib/prompt/builder';
import { createBatches, parseSepStream } from '@/lib/translator/batcher';
import { onMessage, createMessage, type PageContext } from '@/lib/messaging/bridge';

export default defineBackground({
  main() {
    const cache = new TranslationCache();
    const activeTranslations = new Map<number, AbortController>();

    async function getProvider(): Promise<TranslationProvider> {
      const config = await getProviderConfig();
      if (config.provider === 'claude') {
        return new ClaudeProvider({
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
        });
      }
      return new OpenAICompatibleProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      });
    }

    // Handle translate-page command
    onMessage('translate-page', async (payload, sender) => {
      const tabId = payload.tabId;
      const abort = new AbortController();
      activeTranslations.set(tabId, abort);

      try {
        const provider = await getProvider();
        const prefs = await getPreferences();
        const config = await getProviderConfig();
        const pageCtx = buildPageContext(payload.pageContext.title, payload.pageContext.hostname);

        // Tell content script to extract text blocks, then receive them
        // Content script will send back text blocks via a response
        await chrome.tabs.sendMessage(tabId, {
          type: 'extract-and-translate',
          payload: {
            pageContext: pageCtx,
            targetLang: prefs.targetLang,
            sourceLang: prefs.sourceLang,
            style: prefs.style,
            customPrompt: prefs.customPrompt,
            provider: config.provider,
            model: config.model,
          },
        });
      } catch (err) {
        console.error('Translation failed:', err);
      }
    });

    // Handle translate-selection command
    onMessage('translate-selection', async (payload) => {
      try {
        const provider = await getProvider();
        const prefs = await getPreferences();
        const config = await getProviderConfig();

        // Check cache first
        const cached = await cache.get(
          payload.text, prefs.sourceLang, prefs.targetLang, config.provider, config.model,
        );
        if (cached) {
          await chrome.tabs.sendMessage(payload.tabId, {
            type: 'selection-chunk',
            payload: { chunk: cached, done: true },
          });
          return;
        }

        // Stream translate
        const request: TranslateRequest = {
          text: payload.text,
          sourceLang: prefs.sourceLang,
          targetLang: prefs.targetLang,
          style: prefs.style,
        };

        let fullTranslation = '';
        for await (const chunk of provider.translate(request)) {
          fullTranslation += chunk;
          await chrome.tabs.sendMessage(payload.tabId, {
            type: 'selection-chunk',
            payload: { chunk, done: false },
          });
        }

        await chrome.tabs.sendMessage(payload.tabId, {
          type: 'selection-chunk',
          payload: { chunk: '', done: true },
        });

        // Cache the result
        await cache.set(
          payload.text, prefs.sourceLang, prefs.targetLang,
          config.provider, config.model, fullTranslation,
        );
      } catch (err) {
        console.error('Selection translation failed:', err);
        await chrome.tabs.sendMessage(payload.tabId, {
          type: 'selection-error',
          payload: { error: String(err) },
        });
      }
    });

    // Handle stop-translation command
    onMessage('stop-translation', (payload) => {
      const abort = activeTranslations.get(payload.tabId);
      if (abort) {
        abort.abort();
        activeTranslations.delete(payload.tabId);
      }
    });

    // Handle translate-batch: core page translation flow
    onMessage('translate-batch', async (payload, sender) => {
      const tabId = sender.tab?.id;
      if (!tabId) return;

      try {
        const provider = await getProvider();
        const prefs = await getPreferences();
        const config = await getProviderConfig();
        const { blocks, content, pageContext } = payload;

        // Check cache for each block
        const uncachedBlocks: Array<{ id: string; text: string }> = [];
        for (const block of blocks) {
          const cached = await cache.get(
            block.text, prefs.sourceLang, prefs.targetLang, config.provider, config.model,
          );
          if (cached) {
            // Send cached result immediately
            await chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
              blockId: block.id, chunk: cached, done: true,
            }));
          } else {
            uncachedBlocks.push(block);
          }
        }

        if (uncachedBlocks.length === 0) return;

        // Build request with page context for prompt caching
        const texts = uncachedBlocks.map((b) => b.text);
        const batchContent = buildTranslationContent(texts);
        const request: TranslateRequest = {
          text: batchContent,
          sourceLang: payload.sourceLang,
          targetLang: payload.targetLang,
          style: payload.style,
          context: pageContext,
        };

        // Translate with retry
        const stream = await withRetry(() => provider.translate(request), 3);

        // Parse [SEP] segments and send chunks to content script
        const fullTexts: string[] = [];
        for await (const segment of parseSepStream(stream, uncachedBlocks.length)) {
          const block = uncachedBlocks[segment.index];
          if (!block) continue;

          fullTexts[segment.index] = segment.text;
          await chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
            blockId: block.id, chunk: segment.text, done: true,
          }));
        }

        // Cache results
        for (let i = 0; i < uncachedBlocks.length; i++) {
          if (fullTexts[i]) {
            await cache.set(
              uncachedBlocks[i].text, prefs.sourceLang, prefs.targetLang,
              config.provider, config.model, fullTexts[i],
            );
          }
        }
      } catch (err) {
        console.error('Batch translation failed:', err);
        // Notify content script of error for each block
        for (const block of payload.blocks) {
          await chrome.tabs.sendMessage(tabId, createMessage('translation-chunk', {
            blockId: block.id, chunk: '⚠ 翻译失败', done: true,
          }));
        }
      }
    });

    // Retry helper with exponential backoff
    async function withRetry<T>(
      fn: () => T,
      maxRetries: number,
    ): Promise<T> {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return fn();
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
        }
      }
      throw lastError;
    }

    // Handle keyboard shortcuts
    chrome.commands.onCommand.addListener(async (command) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      switch (command) {
        case 'translate-page':
          await chrome.tabs.sendMessage(tab.id, { type: 'command', payload: { command: 'translate-page' } });
          break;
        case 'stop-translation':
          await chrome.tabs.sendMessage(tab.id, { type: 'command', payload: { command: 'stop-translation' } });
          break;
        case 'toggle-display-mode':
          await chrome.tabs.sendMessage(tab.id, { type: 'command', payload: { command: 'toggle-display-mode' } });
          break;
        case 'translate-selection':
          await chrome.tabs.sendMessage(tab.id, { type: 'command', payload: { command: 'translate-selection' } });
          break;
      }
    });
  },
});
```

- [ ] **Step 2: Verify project builds**

```bash
pnpm wxt build
```

Expected: Build succeeds without errors.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: add background service worker with translation orchestration"
```

---

### Task 14: Content Script

**Files:**
- Create: `entrypoints/content.ts`

This wires together extractor, injector, selector, observer, and messaging into the content script entry point.

- [ ] **Step 1: Implement content script**

```typescript
// entrypoints/content.ts
import { extractTextBlocks } from '@/lib/translator/extractor';
import { injectTranslation, appendToTranslation, removeAllTranslations, setDisplayMode } from '@/lib/translator/injector';
import { setupSelectionListeners, createTooltip, appendToTooltip, removeTooltip, getSelectedText } from '@/lib/translator/selector';
import { createBatches } from '@/lib/translator/batcher';
import { buildPageContext, buildTranslationContent } from '@/lib/prompt/builder';
import { createVisibilityObserver, createMutationWatcher, createRouteWatcher } from '@/lib/translator/observer';
import { sendToBackground } from '@/lib/messaging/bridge';
import { getPreferences, getSiteRules } from '@/lib/storage/settings';
import type { DisplayMode, TextBlock } from '@/lib/providers/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    let displayMode: DisplayMode = 'bilingual';
    let isTranslating = false;
    let cleanupSelection: (() => void) | undefined;

    // Setup selection translation based on preferences
    const prefs = await getPreferences();
    cleanupSelection = setupSelectionListeners(
      async (text, rect) => {
        createTooltip(rect);
        const [tab] = await chrome.runtime.sendMessage({ type: 'get-tab-id' }) ?? [];
        await sendToBackground('translate-selection', {
          text,
          tabId: 0, // Background will use sender.tab.id
        });
      },
      prefs.selectionMode,
    );

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const { type, payload } = message;

      switch (type) {
        case 'command': {
          handleCommand(payload.command);
          break;
        }
        case 'selection-chunk': {
          if (payload.done) {
            // Translation complete
          } else {
            appendToTooltip(payload.chunk);
          }
          break;
        }
        case 'selection-error': {
          removeTooltip();
          console.error('mytr translation error:', payload.error);
          break;
        }
        case 'extract-and-translate': {
          handlePageTranslation(payload);
          break;
        }
        case 'translation-chunk': {
          appendToTranslation(payload.blockId, payload.chunk);
          break;
        }
      }

      sendResponse();
      return true;
    });

    async function handleCommand(command: string) {
      switch (command) {
        case 'translate-page':
          await startPageTranslation();
          break;
        case 'stop-translation':
          stopTranslation();
          break;
        case 'toggle-display-mode':
          toggleDisplayMode();
          break;
        case 'translate-selection': {
          const text = getSelectedText();
          if (text) {
            const selection = window.getSelection();
            const rect = selection?.getRangeAt(0)?.getBoundingClientRect();
            if (rect) {
              createTooltip(rect);
              await sendToBackground('translate-selection', { text, tabId: 0 });
            }
          }
          break;
        }
      }
    }

    async function startPageTranslation() {
      if (isTranslating) return;
      isTranslating = true;

      await sendToBackground('translate-page', {
        tabId: 0,
        pageContext: {
          title: document.title,
          hostname: location.hostname,
        },
      });
    }

    function stopTranslation() {
      isTranslating = false;
      removeAllTranslations();
    }

    function toggleDisplayMode() {
      const modes: DisplayMode[] = ['bilingual', 'target-only', 'source-only'];
      const currentIndex = modes.indexOf(displayMode);
      displayMode = modes[(currentIndex + 1) % modes.length];
      setDisplayMode(displayMode);
    }

    async function handlePageTranslation(config: {
      pageContext: string;
      targetLang: string;
      sourceLang: string;
      style: string;
      customPrompt: string;
      provider: string;
      model: string;
    }) {
      const blocks = extractTextBlocks(document.body);

      // Create translation elements for all blocks
      for (const block of blocks) {
        injectTranslation(block.id, block.element);
      }

      // Setup visibility observer for lazy translation
      const visibilityObserver = createVisibilityObserver(async (visibleElements) => {
        // Find blocks that correspond to visible elements
        const visibleBlocks = blocks.filter((b) =>
          visibleElements.some((el) => el === b.element || el.contains(b.element)),
        );

        if (visibleBlocks.length === 0) return;

        const batches = createBatches(visibleBlocks, 10, 2000);
        for (const batch of batches) {
          const texts = batch.map((b) => b.text);
          const content = buildTranslationContent(texts);

          // Send batch to background for translation
          chrome.runtime.sendMessage({
            type: 'translate-batch',
            payload: {
              blocks: batch.map((b) => ({ id: b.id, text: b.text })),
              content,
              pageContext: config.pageContext,
              targetLang: config.targetLang,
              sourceLang: config.sourceLang,
              style: config.style,
              customPrompt: config.customPrompt,
            },
          });
        }
      });

      for (const block of blocks) {
        visibilityObserver.observe(block.element);
      }

      // Watch for dynamic content
      const mutationWatcher = createMutationWatcher((addedNodes) => {
        for (const node of addedNodes) {
          const newBlocks = extractTextBlocks(node);
          for (const block of newBlocks) {
            injectTranslation(block.id, block.element);
            visibilityObserver.observe(block.element);
            blocks.push(block);
          }
        }
      });

      // Watch for route changes
      const cleanupRoute = createRouteWatcher(() => {
        stopTranslation();
        // Re-translate after a short delay for new content to load
        setTimeout(() => startPageTranslation(), 500);
      });
    }
  },
});
```

- [ ] **Step 2: Verify build**

```bash
pnpm wxt build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.ts
git commit -m "feat: add content script with page translation and selection handling"
```

---

### Task 15: Popup Settings Panel

**Files:**
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.ts`
- Create: `entrypoints/popup/App.svelte`
- Create: `entrypoints/popup/ProviderSettings.svelte`
- Create: `entrypoints/popup/PreferenceSettings.svelte`
- Create: `entrypoints/popup/BehaviorSettings.svelte`
- Create: `entrypoints/popup/SiteRules.svelte`

- [ ] **Step 1: Create popup HTML shell**

```html
<!-- entrypoints/popup/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>mytr Settings</title>
  <style>
    body {
      width: 380px;
      min-height: 480px;
      margin: 0;
      font-family: system-ui, sans-serif;
      background: #1e1e2e;
      color: #cdd6f4;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create Svelte 5 mount point**

```typescript
// entrypoints/popup/main.ts
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
```

- [ ] **Step 3: Create App.svelte root component**

```svelte
<!-- entrypoints/popup/App.svelte -->
<script lang="ts">
  import ProviderSettings from './ProviderSettings.svelte';
  import PreferenceSettings from './PreferenceSettings.svelte';
  import BehaviorSettings from './BehaviorSettings.svelte';
  import SiteRules from './SiteRules.svelte';

  let activeSection = $state<string | null>(null);

  function toggle(section: string) {
    activeSection = activeSection === section ? null : section;
  }

  async function translatePage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'command',
        payload: { command: 'translate-page' },
      });
      window.close();
    }
  }

  async function stopTranslation() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'command',
        payload: { command: 'stop-translation' },
      });
    }
  }
</script>

<div class="popup">
  <h1 class="title">mytr</h1>

  <div class="sections">
    <button class="section-header" onclick={() => toggle('provider')}>
      ▸ 翻译引擎
    </button>
    {#if activeSection === 'provider'}
      <ProviderSettings />
    {/if}

    <button class="section-header" onclick={() => toggle('preferences')}>
      ▸ 翻译偏好
    </button>
    {#if activeSection === 'preferences'}
      <PreferenceSettings />
    {/if}

    <button class="section-header" onclick={() => toggle('behavior')}>
      ▸ 行为设置
    </button>
    {#if activeSection === 'behavior'}
      <BehaviorSettings />
    {/if}

    <button class="section-header" onclick={() => toggle('siterules')}>
      ▸ 网站规则
    </button>
    {#if activeSection === 'siterules'}
      <SiteRules />
    {/if}
  </div>

  <div class="actions">
    <button class="btn primary" onclick={translatePage}>翻译此页</button>
    <button class="btn" onclick={stopTranslation}>停止</button>
  </div>
</div>

<style>
  .popup { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .title { font-size: 18px; font-weight: 700; margin: 0; color: #cba6f7; }
  .sections { display: flex; flex-direction: column; gap: 4px; }
  .section-header {
    background: #313244; border: none; color: #cdd6f4; padding: 10px 12px;
    border-radius: 6px; cursor: pointer; text-align: left; font-size: 14px;
  }
  .section-header:hover { background: #45475a; }
  .actions {
    display: flex; gap: 8px; margin-top: auto; padding-top: 12px;
    border-top: 1px solid #313244;
  }
  .btn {
    flex: 1; padding: 10px; border: none; border-radius: 6px;
    cursor: pointer; font-size: 14px; background: #313244; color: #cdd6f4;
  }
  .btn:hover { background: #45475a; }
  .btn.primary { background: #4F46E5; color: white; }
  .btn.primary:hover { background: #4338CA; }
</style>
```

- [ ] **Step 4: Create ProviderSettings component**

```svelte
<!-- entrypoints/popup/ProviderSettings.svelte -->
<script lang="ts">
  import { getProviderConfig, saveProviderConfig } from '@/lib/storage/settings';
  import type { ProviderConfig } from '@/lib/providers/types';

  let config = $state<ProviderConfig>({
    provider: 'openai-compatible',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  });

  const presets: Record<string, { baseUrl: string; model: string }> = {
    'OpenAI': { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    'DeepSeek': { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    'Claude': { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  };

  import { onMount } from 'svelte';
  onMount(() => {
    getProviderConfig().then((c) => { config = c; });
  });

  async function save() {
    await saveProviderConfig(config);
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (!preset) return;
    config.provider = name === 'Claude' ? 'claude' : 'openai-compatible';
    config.baseUrl = preset.baseUrl;
    config.model = preset.model;
    save();
  }
</script>

<div class="settings">
  <div class="presets">
    {#each Object.keys(presets) as name}
      <button class="preset-btn" onclick={() => applyPreset(name)}>{name}</button>
    {/each}
  </div>

  <label>
    API Key
    <input type="password" bind:value={config.apiKey} onchange={save} placeholder="sk-..." />
  </label>

  <label>
    Base URL
    <input type="text" bind:value={config.baseUrl} onchange={save} />
  </label>

  <label>
    模型
    <input type="text" bind:value={config.model} onchange={save} />
  </label>
</div>

<style>
  .settings { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
  .presets { display: flex; gap: 4px; }
  .preset-btn {
    padding: 4px 8px; border: 1px solid #585b70; border-radius: 4px;
    background: transparent; color: #cdd6f4; cursor: pointer; font-size: 12px;
  }
  .preset-btn:hover { background: #45475a; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #a6adc8; }
  input {
    padding: 6px 8px; border: 1px solid #585b70; border-radius: 4px;
    background: #1e1e2e; color: #cdd6f4; font-size: 13px;
  }
</style>
```

- [ ] **Step 5: Create PreferenceSettings, BehaviorSettings, SiteRules components**

Create each as a minimal Svelte 5 component that reads/writes settings using `lib/storage/settings.ts`. Follow the same pattern as ProviderSettings — `$state` for local state, `$effect` to load, `save()` on change. Refer to `lib/storage/settings.ts` for the available functions:

- **PreferenceSettings**: target language dropdown, style dropdown, custom prompt textarea
- **BehaviorSettings**: selection mode toggle (auto / shortcut)
- **SiteRules**: two lists (always translate / never translate) with add/remove buttons

- [ ] **Step 6: Verify build**

```bash
pnpm wxt build
```

Expected: Build succeeds with popup included.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/popup/
git commit -m "feat: add popup settings panel with provider, preferences, behavior, and site rules"
```

---

### Task 16: Integration Test — Manual Verification

- [ ] **Step 1: Run all unit tests**

```bash
pnpm vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Build and load extension in Chrome**

```bash
pnpm wxt build
```

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `.output/chrome-mv3/`
4. Verify extension icon appears in toolbar

- [ ] **Step 3: Test popup settings**

1. Click extension icon → popup opens
2. Configure API key (use a real key for one of: OpenAI / DeepSeek / Claude)
3. Verify settings persist after closing and reopening popup

- [ ] **Step 4: Test full-page translation**

1. Navigate to an English article (e.g., a Wikipedia page)
2. Press `Alt+Shift+T`
3. Verify: paragraphs get translated with bilingual display
4. Press `Alt+Shift+D` → verify mode toggles
5. Press `Alt+Shift+S` → verify translations cleared

- [ ] **Step 5: Test selection translation**

1. Select some text on a page
2. Verify tooltip appears with translation (auto mode)
3. Press `Esc` → tooltip closes
4. Verify tooltip doesn't appear when selecting inside input fields

- [ ] **Step 6: Fix any issues found during manual testing**

Address any integration bugs discovered. These are expected — this is the first time all pieces come together.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "fix: address integration issues from manual testing"
```

- [ ] **Step 8: Push to GitHub**

```bash
git push -u origin main
```

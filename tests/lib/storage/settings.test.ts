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

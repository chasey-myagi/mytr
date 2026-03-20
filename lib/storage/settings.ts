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

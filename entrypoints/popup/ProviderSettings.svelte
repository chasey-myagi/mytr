<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getProviderConfig, saveProviderConfig } from '../../lib/storage/settings';
  import type { ProviderConfig } from '../../lib/providers/types';

  type Preset = {
    label: string;
    provider: ProviderConfig['provider'];
    baseUrl: string;
    model: string;
  };

  const PRESETS: Preset[] = [
    { label: 'OpenAI', provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { label: 'DeepSeek', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { label: 'Claude', provider: 'claude', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-20241022' },
  ];

  let config = $state<ProviderConfig>({
    provider: 'openai-compatible',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  });

  let saveStatus = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      config = await getProviderConfig();
    } catch (err) {
      console.error('[mytr] Failed to load provider config:', err);
    }
  });

  function applyPreset(preset: Preset) {
    config = { ...config, provider: preset.provider, baseUrl: preset.baseUrl, model: preset.model };
    save();
  }

  async function save() {
    try {
      await saveProviderConfig(config);
      saveStatus = '已保存';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => (saveStatus = ''), 2000);
    } catch (err) {
      saveStatus = '保存失败';
      console.error('[mytr] Failed to save provider config:', err);
    }
  }
</script>

<div class="provider-settings">
  <div class="presets">
    {#each PRESETS as preset}
      <button
        class="preset-btn"
        class:active={config.provider === preset.provider && config.baseUrl === preset.baseUrl}
        onclick={() => applyPreset(preset)}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <div class="field">
    <label for="api-key">API Key</label>
    <input
      id="api-key"
      type="password"
      bind:value={config.apiKey}
      onchange={save}
      placeholder="sk-..."
      autocomplete="off"
    />
    {#if !config.apiKey}
      <div class="api-key-hint">未配置 API Key — 翻译功能需要配置后使用</div>
    {/if}
  </div>

  <div class="field">
    <label for="base-url">Base URL</label>
    <input
      id="base-url"
      type="text"
      bind:value={config.baseUrl}
      onchange={save}
      placeholder="https://api.openai.com/v1"
    />
  </div>

  <div class="field">
    <label for="model">模型</label>
    <input
      id="model"
      type="text"
      bind:value={config.model}
      onchange={save}
      placeholder="gpt-4o-mini"
    />
  </div>

  {#if saveStatus}
    <div class="save-status" transition:fade={{ duration: 150 }}>{saveStatus}</div>
  {/if}
</div>

<style>
  .provider-settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .presets {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: 4px 10px;
    border: 1px solid #45475a;
    border-radius: 4px;
    background: #313244;
    color: #cdd6f4;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover,
  .preset-btn.active {
    background: #89b4fa;
    color: #1e1e2e;
    border-color: #89b4fa;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 12px;
    color: #a6adc8;
    font-weight: 500;
  }

  input {
    padding: 6px 10px;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 6px;
    color: #cdd6f4;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #89b4fa;
  }

  input::placeholder {
    color: #585b70;
  }

  .api-key-hint {
    font-size: 11px;
    color: #a6adc8;
    font-style: italic;
  }

  .save-status {
    font-size: 12px;
    color: #a6e3a1;
    text-align: right;
  }
</style>

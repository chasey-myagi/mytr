<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getPreferences, savePreferences } from '../../lib/storage/settings';
  import type { Preferences } from '../../lib/storage/settings';

  const LANGUAGES = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'ru', label: 'Русский' },
    { value: 'ar', label: 'العربية' },
  ];

  const STYLES = [
    { value: 'natural', label: '自然流畅' },
    { value: 'academic', label: '学术严谨' },
    { value: 'casual', label: '口语化' },
    { value: 'literal', label: '直译' },
  ];

  let prefs = $state<Preferences>({
    targetLang: 'zh-CN',
    sourceLang: 'auto',
    style: 'natural',
    customPrompt: '',
    selectionMode: 'auto',
  });

  let saveStatus = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      prefs = await getPreferences();
    } catch (err) {
      console.error('[mytr] Failed to load preferences:', err);
    }
  });

  async function save() {
    try {
      await savePreferences(prefs);
      saveStatus = '已保存';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => (saveStatus = ''), 2000);
    } catch (err) {
      saveStatus = '保存失败';
      console.error('[mytr] Failed to save preferences:', err);
    }
  }
</script>

<div class="pref-settings">
  <div class="field">
    <label for="target-lang">目标语言</label>
    <select id="target-lang" bind:value={prefs.targetLang} onchange={save}>
      {#each LANGUAGES as lang}
        <option value={lang.value}>{lang.label}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="style">翻译风格</label>
    <select id="style" bind:value={prefs.style} onchange={save}>
      {#each STYLES as s}
        <option value={s.value}>{s.label}</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="custom-prompt">附加提示词</label>
    <textarea
      id="custom-prompt"
      bind:value={prefs.customPrompt}
      onchange={save}
      placeholder="例如：保留术语不翻译，使用港式粤语..."
      rows="3"
    ></textarea>
  </div>

  {#if saveStatus}
    <div class="save-status" transition:fade={{ duration: 150 }}>{saveStatus}</div>
  {/if}
</div>

<style>
  .pref-settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  select,
  textarea {
    padding: 6px 10px;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 6px;
    color: #cdd6f4;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
    font-family: inherit;
  }

  select:focus,
  textarea:focus {
    border-color: #89b4fa;
  }

  textarea {
    resize: vertical;
    line-height: 1.5;
  }

  .save-status {
    font-size: 12px;
    color: #a6e3a1;
    text-align: right;
  }
</style>

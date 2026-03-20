<script lang="ts">
  import { onMount } from 'svelte';
  import { getSiteRules, saveSiteRules } from '../../lib/storage/settings';
  import type { SiteRules } from '../../lib/storage/settings';

  let rules = $state<SiteRules>({
    alwaysTranslate: [],
    neverTranslate: [],
  });

  let newAlways = $state('');
  let newNever = $state('');
  let saveStatus = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      rules = await getSiteRules();
    } catch (err) {
      console.error('[mytr] Failed to load site rules:', err);
    }
  });

  async function save() {
    try {
      await saveSiteRules(rules);
      saveStatus = '已保存';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => (saveStatus = ''), 2000);
    } catch (err) {
      saveStatus = '保存失败';
      console.error('[mytr] Failed to save site rules:', err);
    }
  }

  function addAlways() {
    const host = newAlways.trim();
    if (!host || rules.alwaysTranslate.includes(host)) return;
    rules = { ...rules, alwaysTranslate: [...rules.alwaysTranslate, host] };
    newAlways = '';
    save();
  }

  function removeAlways(host: string) {
    rules = { ...rules, alwaysTranslate: rules.alwaysTranslate.filter((h) => h !== host) };
    save();
  }

  function addNever() {
    const host = newNever.trim();
    if (!host || rules.neverTranslate.includes(host)) return;
    rules = { ...rules, neverTranslate: [...rules.neverTranslate, host] };
    newNever = '';
    save();
  }

  function removeNever(host: string) {
    rules = { ...rules, neverTranslate: rules.neverTranslate.filter((h) => h !== host) };
    save();
  }

  function handleAlwaysKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addAlways();
  }

  function handleNeverKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') addNever();
  }
</script>

<div class="site-rules">
  <div class="rule-section">
    <div class="rule-header">始终翻译</div>
    <div class="rule-list">
      {#each rules.alwaysTranslate as host}
        <div class="rule-item">
          <span class="rule-host">{host}</span>
          <button class="remove-btn" onclick={() => removeAlways(host)} aria-label="删除">✕</button>
        </div>
      {/each}
    </div>
    <div class="rule-input-row">
      <input
        type="text"
        bind:value={newAlways}
        onkeydown={handleAlwaysKeydown}
        placeholder="example.com"
      />
      <button class="add-btn" onclick={addAlways}>添加</button>
    </div>
  </div>

  <div class="rule-section">
    <div class="rule-header">从不翻译</div>
    <div class="rule-list">
      {#each rules.neverTranslate as host}
        <div class="rule-item">
          <span class="rule-host">{host}</span>
          <button class="remove-btn" onclick={() => removeNever(host)} aria-label="删除">✕</button>
        </div>
      {/each}
    </div>
    <div class="rule-input-row">
      <input
        type="text"
        bind:value={newNever}
        onkeydown={handleNeverKeydown}
        placeholder="example.com"
      />
      <button class="add-btn" onclick={addNever}>添加</button>
    </div>
  </div>

  {#if saveStatus}
    <div class="save-status">{saveStatus}</div>
  {/if}
</div>

<style>
  .site-rules {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .rule-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rule-header {
    font-size: 12px;
    color: #a6adc8;
    font-weight: 600;
  }

  .rule-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .rule-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    background: #313244;
    border-radius: 4px;
    font-size: 12px;
  }

  .rule-host {
    color: #cdd6f4;
    word-break: break-all;
  }

  .remove-btn {
    background: none;
    border: none;
    color: #f38ba8;
    cursor: pointer;
    font-size: 11px;
    padding: 0 2px;
    flex-shrink: 0;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #eba0ac;
  }

  .rule-input-row {
    display: flex;
    gap: 6px;
  }

  input {
    flex: 1;
    padding: 5px 8px;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 5px;
    color: #cdd6f4;
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #89b4fa;
  }

  input::placeholder {
    color: #585b70;
  }

  .add-btn {
    padding: 5px 10px;
    background: #45475a;
    border: none;
    border-radius: 5px;
    color: #cdd6f4;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .add-btn:hover {
    background: #89b4fa;
    color: #1e1e2e;
  }

  .save-status {
    font-size: 12px;
    color: #a6e3a1;
    text-align: right;
  }
</style>

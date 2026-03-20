<script lang="ts">
  import { onMount } from 'svelte';
  import { getPreferences, savePreferences } from '../../lib/storage/settings';

  let selectionMode = $state<'auto' | 'shortcut'>('auto');
  let saveStatus = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    try {
      const prefs = await getPreferences();
      selectionMode = prefs.selectionMode;
    } catch (err) {
      console.error('[mytr] Failed to load behavior settings:', err);
    }
  });

  async function save() {
    try {
      await savePreferences({ selectionMode });
      saveStatus = '已保存';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => (saveStatus = ''), 2000);
    } catch (err) {
      saveStatus = '保存失败';
      console.error('[mytr] Failed to save behavior settings:', err);
    }
  }
</script>

<div class="behavior-settings">
  <div class="field">
    <div class="field-label">划词翻译触发方式</div>
    <div class="toggle-group">
      <button
        class="toggle-btn"
        class:active={selectionMode === 'auto'}
        onclick={() => { selectionMode = 'auto'; save(); }}
      >
        自动（划词即翻译）
      </button>
      <button
        class="toggle-btn"
        class:active={selectionMode === 'shortcut'}
        onclick={() => { selectionMode = 'shortcut'; save(); }}
      >
        快捷键（Alt+Shift+Q）
      </button>
    </div>
  </div>

  {#if saveStatus}
    <div class="save-status">{saveStatus}</div>
  {/if}
</div>

<style>
  .behavior-settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 12px;
    color: #a6adc8;
    font-weight: 500;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .toggle-btn {
    padding: 7px 12px;
    border: 1px solid #45475a;
    border-radius: 6px;
    background: #313244;
    color: #cdd6f4;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .toggle-btn:hover {
    border-color: #89b4fa;
  }

  .toggle-btn.active {
    background: #89b4fa;
    color: #1e1e2e;
    border-color: #89b4fa;
    font-weight: 600;
  }

  .save-status {
    font-size: 12px;
    color: #a6e3a1;
    text-align: right;
  }
</style>

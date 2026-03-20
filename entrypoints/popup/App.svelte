<script lang="ts">
  import { createMessage } from '../../lib/messaging/bridge';
  import ProviderSettings from './ProviderSettings.svelte';
  import PreferenceSettings from './PreferenceSettings.svelte';
  import BehaviorSettings from './BehaviorSettings.svelte';
  import SiteRules from './SiteRules.svelte';

  let providerOpen = $state(true);
  let preferenceOpen = $state(true);
  let behaviorOpen = $state(false);
  let siteRulesOpen = $state(false);

  async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
  }

  async function handleTranslate() {
    const tab = await getCurrentTab();
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, createMessage('command', { command: 'translate-page' }));
    window.close();
  }

  async function handleStop() {
    const tab = await getCurrentTab();
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, createMessage('command', { command: 'stop-translation' }));
    window.close();
  }
</script>

<div class="popup">
  <header class="popup-header">
    <span class="logo">mytr</span>
    <div class="actions">
      <button class="btn btn-primary" onclick={handleTranslate}>翻译页面</button>
      <button class="btn btn-secondary" onclick={handleStop}>停止</button>
    </div>
  </header>

  <div class="sections">
    <section class="section">
      <button
        class="section-toggle"
        onclick={() => (providerOpen = !providerOpen)}
        aria-expanded={providerOpen}
      >
        <span>AI 引擎</span>
        <span class="chevron" class:open={providerOpen}>▾</span>
      </button>
      {#if providerOpen}
        <div class="section-body">
          <ProviderSettings />
        </div>
      {/if}
    </section>

    <section class="section">
      <button
        class="section-toggle"
        onclick={() => (preferenceOpen = !preferenceOpen)}
        aria-expanded={preferenceOpen}
      >
        <span>翻译偏好</span>
        <span class="chevron" class:open={preferenceOpen}>▾</span>
      </button>
      {#if preferenceOpen}
        <div class="section-body">
          <PreferenceSettings />
        </div>
      {/if}
    </section>

    <section class="section">
      <button
        class="section-toggle"
        onclick={() => (behaviorOpen = !behaviorOpen)}
        aria-expanded={behaviorOpen}
      >
        <span>划词行为</span>
        <span class="chevron" class:open={behaviorOpen}>▾</span>
      </button>
      {#if behaviorOpen}
        <div class="section-body">
          <BehaviorSettings />
        </div>
      {/if}
    </section>

    <section class="section">
      <button
        class="section-toggle"
        onclick={() => (siteRulesOpen = !siteRulesOpen)}
        aria-expanded={siteRulesOpen}
      >
        <span>网站规则</span>
        <span class="chevron" class:open={siteRulesOpen}>▾</span>
      </button>
      {#if siteRulesOpen}
        <div class="section-body">
          <SiteRules />
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .popup {
    display: flex;
    flex-direction: column;
    min-height: 200px;
  }

  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #313244;
    background: #181825;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .logo {
    font-weight: 700;
    font-size: 16px;
    color: #89b4fa;
    letter-spacing: 0.05em;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.15s;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn-primary {
    background: #89b4fa;
    color: #1e1e2e;
  }

  .btn-secondary {
    background: #313244;
    color: #cdd6f4;
  }

  .sections {
    flex: 1;
  }

  .section {
    border-bottom: 1px solid #313244;
  }

  .section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: transparent;
    border: none;
    color: #cdd6f4;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }

  .section-toggle:hover {
    background: #313244;
  }

  .chevron {
    font-size: 12px;
    transition: transform 0.2s;
    display: inline-block;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .section-body {
    padding: 8px 16px 12px;
    background: #181825;
  }
</style>

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
        description: 'Toggle display mode',
      },
      'translate-selection': {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: 'Translate selected text',
      },
    },
  },
});

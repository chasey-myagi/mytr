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

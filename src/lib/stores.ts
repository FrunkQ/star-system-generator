import { writable } from 'svelte/store';
import type { System } from './types';

// Helper for creating a writable store that persists to localStorage
function persistentWritable<T>(key: string, startValue: T) {
  const storedValue = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  const initialValue = storedValue ? JSON.parse(storedValue) : startValue;
  const store = writable<T>(initialValue);

  if (typeof window !== 'undefined') {
    store.subscribe(value => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}

export const systemStore = writable<System | null>(null);

// G34 phase 5: the runtime `measurementUnit`/`temperatureUnit` stores and the `fmt` formatter
// bundle that hung off them are RETIRED. Display units are per quantity × body type now —
// `unitPrefsStore.ts` holds the runtime copy, `units.ts` the ladders; the legacy starmap fields
// survive only as migration input (`migrateUnitPrefs`).

export const viewportStore = writable({
    pan: { x: 0, y: 0 },
    zoom: 1
});

export const aiSettings = persistentWritable('aiSettings', {
    apiKey: '',
    selectedModel: 'mistralai/mistral-7b-instruct',
    apiEndpoint: 'https://openrouter.ai/api/v1'
});

// A non-persistent store to hold the last-used AI generation settings for the session
export const aiContextStore = writable({
  planet: {
    tags: [],
    style: null,
    length: 500,
  },
  construct: {
    tags: [],
    style: null,
    length: 500,
  }
});
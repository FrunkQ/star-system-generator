import { writable } from 'svelte/store';

export interface AISettings {
  apiKey: string;
  apiEndpoint: string;
  selectedModel: string | null;
}

const defaultSettings: AISettings = {
  apiKey: '',
  apiEndpoint: 'https://openrouter.ai/api/v1',
  selectedModel: null
};

// Function to get initial value from localStorage or use default
const getInitialSettings = (): AISettings => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('stargen_ai_settings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  }
  return defaultSettings;
};

export const aiSettings = writable<AISettings>(getInitialSettings());

export const systemStore = writable<System | null>(null);

export const viewportStore = writable({ panX: 0, panY: 0, zoom: 1 });

// Subscribe to changes and save to localStorage
aiSettings.subscribe(value => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('stargen_ai_settings', JSON.stringify(value));
  }
});

import { writable } from 'svelte/store';

// GM-enforced Field Guide view: the GM picks the skin (and terminal colour) in the Companion
// launcher and it is broadcast to every connected guide — players cannot change it locally.
// Persisted on the GM machine alongside branding so it survives reloads.
export type GuideTheme = 'mono' | 'guide' | 'clean' | 'console' | 'holo';
export type MonoColor = 'green' | 'amber' | 'white' | 'blue' | 'red';

export interface GuideConfig {
  theme: GuideTheme;
  monoColor: MonoColor;
  includeConstructs: boolean;
}

export const MONO_COLORS: Record<MonoColor, { label: string; hex: string }> = {
  green: { label: 'Green', hex: '#74f7b0' },
  amber: { label: 'Amber', hex: '#ffb766' },
  white: { label: 'White', hex: '#e8ecf2' },
  blue:  { label: 'Blue',  hex: '#7fb4ff' },
  red:   { label: 'Red',   hex: '#ff6b6b' },
};

const KEY = 'catalogue-guideconfig';
const DEFAULT: GuideConfig = { theme: 'guide', monoColor: 'green', includeConstructs: true };

const THEMES: GuideTheme[] = ['mono', 'guide', 'clean', 'console', 'holo'];

export function normalizeGuideConfig(v: any): GuideConfig {
  // Old links/configs used 'green'/'amber' as theme keys — fold them into mono + colour.
  let theme = v?.theme;
  let monoColor = v?.monoColor;
  if (theme === 'green') { theme = 'mono'; monoColor = monoColor ?? 'green'; }
  if (theme === 'amber') { theme = 'mono'; monoColor = monoColor ?? 'amber'; }
  return {
    theme: THEMES.includes(theme) ? theme : DEFAULT.theme,
    monoColor: monoColor in MONO_COLORS ? monoColor : DEFAULT.monoColor,
    includeConstructs: typeof v?.includeConstructs === 'boolean' ? v.includeConstructs : DEFAULT.includeConstructs,
  };
}

function load(): GuideConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT };
  try {
    return normalizeGuideConfig(JSON.parse(localStorage.getItem(KEY) || ''));
  } catch {
    return { ...DEFAULT };
  }
}

export const guideConfigStore = writable<GuideConfig>(load());

if (typeof window !== 'undefined') {
  guideConfigStore.subscribe((v) => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
  });
}

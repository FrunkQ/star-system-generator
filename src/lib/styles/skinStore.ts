// G34 phase 4 — the interface SKIN. Per-viewer chrome, persisted in localStorage (like
// pictureBoxStore), never campaign data: units ride the starmap because players inherit
// them; a skin is each viewer's own glasses. Applying it is one attribute on <html> —
// skins.css holds the token values it selects.
import { writable } from 'svelte/store';

export type SkinId = 'modern' | 'classic';

export const SKINS: { id: SkinId; name: string; blurb: string }[] = [
  { id: 'modern', name: 'Modern', blurb: 'Compact type, light-blue highlights, lighter panel grey' },
  { id: 'classic', name: 'Classic', blurb: 'The original look — warm orange on near-black' }
];

const KEY = 'sse-skin';

function load(): SkinId {
  if (typeof localStorage === 'undefined') return 'modern';
  const v = localStorage.getItem(KEY);
  return v === 'classic' || v === 'modern' ? v : 'modern';
}

export const skin = writable<SkinId>(load());

if (typeof document !== 'undefined') {
  skin.subscribe((id) => {
    try { localStorage.setItem(KEY, id); } catch { /* private mode — ignore */ }
    document.documentElement.dataset.skin = id;
  });
}

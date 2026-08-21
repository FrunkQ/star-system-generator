// G34 phase 4+ — the interface SKIN. Per-viewer chrome, persisted in localStorage (like
// pictureBoxStore), never campaign data: units ride the starmap because players inherit
// them; a skin is each viewer's own glasses.
//
// Two layers:
//  - BUILT-IN skins are `:root[data-skin='…']` blocks in skins.css; applying one is one
//    attribute on <html>.
//  - CUSTOM skins are user-made: a NAME, a BASE built-in, and a token override map. Applying
//    one sets data-skin to the base and injects the overrides as a <style> element whose
//    selector (`:root[data-skin]`) ties the base's specificity and wins by source order —
//    while the user's /palette overrides, being inline styles, still beat everything.
import { writable, get } from 'svelte/store';

export type BuiltinSkinId = 'modern' | 'classic' | 'colourblind' | 'nebula';
export type SkinId = string; // a BuiltinSkinId, or 'custom:<id>'

export const SKINS: { id: BuiltinSkinId; name: string; blurb: string }[] = [
  { id: 'modern', name: 'Modern', blurb: 'Compact type, light-blue highlights, lighter panel grey' },
  { id: 'classic', name: 'Classic', blurb: 'The original look — warm orange on near-black' },
  { id: 'colourblind', name: 'Clarity', blurb: 'Colour-blind-friendly chrome (Okabe–Ito), higher contrast' },
  { id: 'nebula', name: 'Nebula', blurb: 'Colourful — indigo rail, deep-blue panels, orchid accent' }
];

export interface CustomSkin {
  id: string;
  name: string;
  base: BuiltinSkinId;
  tokens: Record<string, string>; // '--token' -> colour
}

const KEY = 'sse-skin';
const CUSTOM_KEY = 'sse-custom-skins';
const BUILTIN_IDS = new Set(SKINS.map((s) => s.id as string));

// The values end up inside an injected stylesheet, so only shapes we expect may pass.
const TOKEN_RE = /^--[a-z0-9-]+$/;
const COLOUR_RE = /^#[0-9a-fA-F]{3,8}$/;

function loadCustom(): CustomSkin[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && BUILTIN_IDS.has(s.base));
  } catch {
    return [];
  }
}

function loadSkin(): SkinId {
  if (typeof localStorage === 'undefined') return 'modern';
  const v = localStorage.getItem(KEY);
  if (!v) return 'modern';
  if (BUILTIN_IDS.has(v)) return v;
  if (v.startsWith('custom:')) return v;
  return 'modern';
}

export const customSkins = writable<CustomSkin[]>(loadCustom());
export const skin = writable<SkinId>(loadSkin());

export function customSkinFor(id: SkinId, list: CustomSkin[]): CustomSkin | null {
  return id.startsWith('custom:') ? list.find((s) => `custom:${s.id}` === id) ?? null : null;
}

function apply(id: SkinId, list: CustomSkin[]) {
  if (typeof document === 'undefined') return;
  const custom = customSkinFor(id, list);
  const base: string = custom ? custom.base : BUILTIN_IDS.has(id) ? id : 'modern';
  document.documentElement.dataset.skin = base;

  let el = document.getElementById('sse-custom-skin') as HTMLStyleElement | null;
  if (custom) {
    const body = Object.entries(custom.tokens)
      .filter(([k, v]) => TOKEN_RE.test(k) && COLOUR_RE.test(v))
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
    if (!el) {
      el = document.createElement('style');
      el.id = 'sse-custom-skin';
      document.head.appendChild(el);
    }
    // Same specificity as the base's block, later in source order -> the overrides win.
    el.textContent = `:root[data-skin] { ${body} }`;
  } else if (el) {
    el.remove();
  }
}

if (typeof document !== 'undefined') {
  skin.subscribe((id) => {
    try { localStorage.setItem(KEY, id); } catch { /* private mode — ignore */ }
    apply(id, get(customSkins));
  });
  customSkins.subscribe((list) => {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* ignore */ }
    apply(get(skin), list);
  });
}

export function createCustomSkin(name: string, base: BuiltinSkinId): string {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  customSkins.update((l) => [...l, { id, name: name.trim() || 'My skin', base, tokens: {} }]);
  return id;
}

export function updateCustomSkin(id: string, patch: Partial<Omit<CustomSkin, 'id'>>) {
  customSkins.update((l) => l.map((s) => (s.id === id ? { ...s, ...patch, tokens: patch.tokens ?? s.tokens } : s)));
}

export function deleteCustomSkin(id: string) {
  customSkins.update((l) => l.filter((s) => s.id !== id));
  if (get(skin) === `custom:${id}`) skin.set('modern');
}

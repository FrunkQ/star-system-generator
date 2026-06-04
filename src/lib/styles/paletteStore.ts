// Palette override store — the runtime layer over the static defaults in tokens.css.
// Holds ONLY the tokens the user has changed (token name -> hex), persists them to
// localStorage, and applies each as a CSS-variable override on :root so every consumer
// of var(--token) re-skins live. Removing an override lets the token fall back to its
// tokens.css default. This is the backing store for the /palette settings page and the
// future foundation for skins / colour-blind presets.
//
// JS-side consumers (canvas/SVG rendering in rendering/colors.ts etc.) should read from a
// cache refreshed off this store rather than hardcoding hex — see resolveToken().
import { writable, get } from 'svelte/store';

const KEY = 'sse-palette-overrides';

function load(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export const paletteOverrides = writable<Record<string, string>>(load());

// Apply overrides to :root and persist, reacting to every change. Tracks the previous
// key set so tokens that get reset are removed (and fall back to the tokens.css default).
if (typeof document !== 'undefined') {
  let prevKeys: string[] = [];
  paletteOverrides.subscribe((ov) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ov));
    } catch {
      /* private mode / quota — ignore */
    }
    const root = document.documentElement;
    for (const k of prevKeys) if (!(k in ov)) root.style.removeProperty(k);
    for (const [k, v] of Object.entries(ov)) root.style.setProperty(k, v);
    prevKeys = Object.keys(ov);
  });
}

export function setToken(name: string, value: string) {
  paletteOverrides.update((o) => ({ ...o, [name]: value }));
}

export function resetToken(name: string) {
  paletteOverrides.update((o) => {
    const next = { ...o };
    delete next[name];
    return next;
  });
}

export function resetAll() {
  paletteOverrides.set({});
}

// Resolve a token's current value: the override if set, else the live computed value
// from tokens.css. Used to seed JS-side colour caches for canvas/SVG rendering.
export function resolveToken(name: string, fallback = ''): string {
  const ov = get(paletteOverrides)[name];
  if (ov) return ov;
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return fallback;
}

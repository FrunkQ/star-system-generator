import { writable } from 'svelte/store';

// GM-set in-universe branding for the Field Guide (a company / faction name + optional logo) — the
// "letterhead" that makes the guide feel like that faction's real device. Persisted locally on the
// GM machine and broadcast to connected guides. The logo is a small data URL (size-capped on upload).
// Ship NO trademarked assets by default (FOSS-safe, per the spec) — the GM supplies their own.
export interface Branding { name: string; logo: string | null; }

const KEY = 'catalogue-branding';
const EMPTY: Branding = { name: '', logo: null };

function load(): Branding {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '');
    return { name: typeof v?.name === 'string' ? v.name : '', logo: typeof v?.logo === 'string' ? v.logo : null };
  } catch {
    return { ...EMPTY };
  }
}

export const brandingStore = writable<Branding>(load());

if (typeof window !== 'undefined') {
  brandingStore.subscribe((v) => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
  });
}

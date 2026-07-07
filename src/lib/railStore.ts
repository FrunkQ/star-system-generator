import { writable } from 'svelte/store';

// Whether the left rail is minimised (icon-only). Shared so on-canvas controls (e.g. the
// Reset overlay) can mirror it: show text labels while the rail is expanded ("still
// learning"), collapse to icons once the user has minimised the rail ("has learned").
const KEY = 'sse-rail-collapsed';
const initial = typeof window !== 'undefined' && localStorage.getItem(KEY) === '1';

export const railCollapsed = writable<boolean>(initial);

if (typeof window !== 'undefined') {
  railCollapsed.subscribe((v) => localStorage.setItem(KEY, v ? '1' : '0'));
}

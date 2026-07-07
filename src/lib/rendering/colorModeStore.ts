import { writable } from 'svelte/store';

// Orrery colour mode: true = each body's derived apparent (real) colour; false = the broad
// 4-colour-per-class swatches (quick type read). Toggled from the orrery View controls.
const KEY = 'sse-true-color';
const initial = typeof window !== 'undefined' ? localStorage.getItem(KEY) !== '0' : true; // default: true colour
export const trueColorMode = writable<boolean>(initial);
if (typeof window !== 'undefined') {
  trueColorMode.subscribe((v) => localStorage.setItem(KEY, v ? '1' : '0'));
}

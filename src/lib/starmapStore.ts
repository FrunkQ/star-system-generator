import { writable } from 'svelte/store';
import type { Starmap } from './types';

export const starmapStore = writable<Starmap | null>(null);

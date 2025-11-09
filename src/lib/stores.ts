import { writable } from 'svelte/store';
import type { System, Starmap } from './types';

export const systemStore = writable<System | null>(null);
export const starmapStore = writable<Starmap | null>(null);

export const viewportStore = writable({
    pan: { x: 0, y: 0 },
    zoom: 1
});

export const toytownFactor = writable(0);

export const aiSettings = writable({
    apiKey: '',
    model: 'gemini-pro',
    style: 'default',
    tags: []
});
import { writable, derived } from 'svelte/store';
import type { System, Starmap } from './types';
import {
  formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatSpeedAuto, distanceUnitLabel,
  type MeasurementUnits
} from './units';

// Helper for creating a writable store that persists to localStorage
function persistentWritable<T>(key: string, startValue: T) {
  const storedValue = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  const initialValue = storedValue ? JSON.parse(storedValue) : startValue;
  const store = writable<T>(initialValue);

  if (typeof window !== 'undefined') {
    store.subscribe(value => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}

export const systemStore = writable<System | null>(null);
export const starmapStore = writable<Starmap | null>(null);

// Runtime in-system display unit (km vs miles). SOURCE OF TRUTH is the loaded starmap's `measurementUnits`
// (persisted); this writable is the RUNTIME copy kept in sync by the app on load / settings change, and set
// independently on the projector/player from a broadcast — so display code has one reactive value to read
// regardless of whether a full starmap is present.
export const measurementUnit = writable<MeasurementUnits>('metric');

// Reactive formatter bundle — components read `$fmt.km(value)` etc. and re-render when the unit changes.
// All inputs are SI/native (km, AU, km/s, m/s); only the rendered string differs.
export const fmt = derived(measurementUnit, (u) => ({
  km: (km: number, decimals = 0) => formatDistanceKm(km, u, decimals),         // value in KM
  au: (au: number, decimals = 0) => formatDistanceAu(au, u, decimals),         // value in AU → km/miles (local orbits)
  speedKmS: (kmps: number, decimals = 1) => formatSpeedKmS(kmps, u, decimals), // value in KM/S
  speedMs: (ms: number, decimals = 1) => formatSpeedKmS(ms / 1000, u, decimals), // value in M/S (e.g. Δv)
  speedAuto: (ms: number) => formatSpeedAuto(ms, u),                           // value in M/S, magnitude-aware
  distUnit: distanceUnitLabel(u),                                             // bare "km" | "mi" label
  units: u
}));

export const viewportStore = writable({
    pan: { x: 0, y: 0 },
    zoom: 1
});

export const aiSettings = persistentWritable('aiSettings', {
    apiKey: '',
    selectedModel: 'mistralai/mistral-7b-instruct',
    apiEndpoint: 'https://openrouter.ai/api/v1'
});

// A non-persistent store to hold the last-used AI generation settings for the session
export const aiContextStore = writable({
  planet: {
    tags: [],
    style: null,
    length: 500,
  },
  construct: {
    tags: [],
    style: null,
    length: 500,
  }
});
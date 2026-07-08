// Holo "look" presets. A HoloStyle bundles every look-and-feel knob of the 3D view — the GPU
// filter, the toytown compression, the camera framing, the skybox — so a GM can pick one from a
// single dropdown, tweak it live, and save it as a named preset shared across guides and the
// projector. Persisted locally (like branding). See docs/dev/v2.2-3d-design.md §A10.
import { writable } from 'svelte/store';

export interface HoloStyle {
  filter: string; // GPU post filter id (none / retro_sci_fi_green / …)
  compression: number; // toytown 0 (true scale) .. 1 (fully compressed)
  angleDeg: number; // camera tilt from overhead (0 = top-down, 64 = 3/4)
  whole: boolean; // frame the whole system vs the focused body
  skybox: boolean; // background starfield
  beltDetail: number; // belt particle-budget quality 0..1 (performance; physics sets relative density)
  bodyStyle: 'textured' | 'flat' | 'tint'; // planet/moon surface: true-colour / class colour / holo tint
  background: 'space' | 'green' | 'blue' | 'black'; // dark space, or a chroma-key colour for OBS
  bodySize: number; // 1 = readable (chunky) .. 0 = true physical scale
  grid: 'off' | 'plain' | 'scaled'; // ground reference: none / plain polar grid / grid with AU scale labels
  orbitSpeed: number; // auto view-orbit: how fast the camera slowly circles the focused object (0 = static)
}

export interface HoloPreset extends HoloStyle {
  id: string;
  name: string;
  builtIn?: boolean; // shipped starter (can't be deleted)
}

export const DEFAULT_STYLE: HoloStyle = {
  filter: 'none',
  compression: 0.65,
  angleDeg: 64,
  whole: false,
  skybox: true,
  beltDetail: 0.6,
  bodyStyle: 'textured',
  background: 'space',
  bodySize: 1,
  grid: 'plain',
  orbitSpeed: 0
};

// Shipped starter presets — enough to demo the range and skin the existing guides.
export const STARTER_PRESETS: HoloPreset[] = [
  { id: 'clean', name: 'Clean Hologram', builtIn: true, filter: 'none', compression: 0.65, angleDeg: 64, whole: false, skybox: true, beltDetail: 0.6, bodyStyle: 'textured', background: 'space', bodySize: 1, grid: 'plain', orbitSpeed: 0 },
  { id: 'crt-green', name: 'Green CRT Table', builtIn: true, filter: 'retro_sci_fi_green', compression: 0.7, angleDeg: 62, whole: false, skybox: true, beltDetail: 0.6, bodyStyle: 'textured', background: 'space', bodySize: 1, grid: 'plain', orbitSpeed: 0 },
  { id: 'crt-amber', name: 'Amber Terminal', builtIn: true, filter: 'retro_sci_fi_amber', compression: 0.7, angleDeg: 62, whole: false, skybox: true, beltDetail: 0.6, bodyStyle: 'textured', background: 'space', bodySize: 1, grid: 'plain', orbitSpeed: 0 },
  { id: 'night-ops', name: 'Night Ops', builtIn: true, filter: 'night_vision', compression: 0.6, angleDeg: 55, whole: false, skybox: true, beltDetail: 0.5, bodyStyle: 'textured', background: 'space', bodySize: 1, grid: 'plain', orbitSpeed: 0 },
  { id: 'blueprint', name: 'Blueprint (holo tint)', builtIn: true, filter: 'none', compression: 0.65, angleDeg: 64, whole: false, skybox: true, beltDetail: 0.6, bodyStyle: 'tint', background: 'space', bodySize: 1, grid: 'scaled', orbitSpeed: 0 },
  { id: 'projector', name: 'Projector (top-down, true scale)', builtIn: true, filter: 'none', compression: 0, angleDeg: 0, whole: true, skybox: false, beltDetail: 0.8, bodyStyle: 'textured', background: 'space', bodySize: 0.5, grid: 'scaled', orbitSpeed: 0 },
  { id: 'greenscreen', name: 'Greenscreen (OBS)', builtIn: true, filter: 'none', compression: 0, angleDeg: 0, whole: true, skybox: false, beltDetail: 0.8, bodyStyle: 'textured', background: 'green', bodySize: 0.5, grid: 'off', orbitSpeed: 0 }
];

const KEY = 'holo-presets';

function load(): HoloPreset[] {
  if (typeof localStorage === 'undefined') return [...STARTER_PRESETS];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]') as HoloPreset[];
    const custom = Array.isArray(saved) ? saved.filter((p) => p && !p.builtIn && p.id && p.name) : [];
    return [...STARTER_PRESETS, ...custom];
  } catch {
    return [...STARTER_PRESETS];
  }
}

export const holoPresets = writable<HoloPreset[]>(load());

if (typeof window !== 'undefined') {
  holoPresets.subscribe((list) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.filter((p) => !p.builtIn)));
    } catch { /* ignore quota / privacy-mode failures */ }
  });
}

export function styleOf(preset: HoloPreset): HoloStyle {
  return { filter: preset.filter, compression: preset.compression, angleDeg: preset.angleDeg, whole: preset.whole, skybox: preset.skybox, beltDetail: preset.beltDetail ?? 0.6, bodyStyle: preset.bodyStyle ?? 'textured', background: preset.background ?? 'space', bodySize: preset.bodySize ?? 1, grid: preset.grid ?? 'plain', orbitSpeed: preset.orbitSpeed ?? 0 };
}

// Add a custom preset from the current live style. Id is derived from the name + a short suffix so
// two presets with the same name don't collide.
export function saveHoloPreset(name: string, style: HoloStyle): HoloPreset {
  const clean = name.trim() || 'My Preset';
  const id = 'p-' + clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (clean.length + Math.round(style.angleDeg));
  const preset: HoloPreset = { id, name: clean, ...style };
  holoPresets.update((list) => [...list.filter((p) => p.id !== id), preset]);
  return preset;
}

export function deleteHoloPreset(id: string): void {
  holoPresets.update((list) => list.filter((p) => p.builtIn || p.id !== id));
}

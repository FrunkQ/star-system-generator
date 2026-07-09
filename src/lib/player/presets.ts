// Built-in player presets, defaults, and migration. See presetTypes.ts + the design doc.
import type { HoloStyle } from '$lib/holo/holoStyle';
import type { PlayerPreset, ViewModule, FilterParamValues } from './presetTypes';

// CRT phosphor colours for the consolidated single `crt` filter (replaces the green/amber pair).
export const CRT_GREEN = '#4dff88';
export const CRT_AMBER = '#ffb000';

// A neutral base every preset (and the migration) builds on, so new fields always have a sane value.
export const DEFAULT_PRESET: PlayerPreset = {
  id: 'default',
  name: 'Untitled',
  description: '',
  followGM: false,
  interactive: true,
  cover: { enabled: false, title: '', subtitle: '', body: '', label: '', graphic: null },
  starmapView: 'diagram2d',
  systemView: 'holo3d',
  font: 'system-ui',
  accentColor: '#6aa0ff',
  overlay: null,
  companyName: '',
  footerText: '',
  filter: 'none',
  filterParams: {},
  bodyStyle: 'textured',
  background: 'space',
  grid: 'plain',
  compression: 0.65,
  bodySize: 1,
  beltDetail: 0.6,
  orbitSpeed: 0,
  skybox: true,
  angleDeg: 64,
  lockOverhead: false,
  whole: false,
  labelSize: 11
};

function preset(p: Partial<PlayerPreset> & { id: string; name: string; description: string }): PlayerPreset {
  return { ...DEFAULT_PRESET, builtIn: true, ...p, cover: { ...DEFAULT_PRESET.cover, ...(p.cover ?? {}) } };
}

// The shipped presets — every current artifact as a named card on one list. Projection is just the
// last card (followGM + non-interactive + overhead), not a separate category.
export const BUILTIN_PRESETS: PlayerPreset[] = [
  preset({
    id: 'guide', name: 'The Guide', description: "A traveller's field guide — friendly, illustrated, mostly accurate.",
    systemView: 'diagram2d', bodyStyle: 'textured',
    cover: { enabled: true, title: "DON'T PANIC", subtitle: '', body: '', label: '', graphic: null }
  }),
  preset({
    id: 'datapad', name: 'Datapad', description: 'A hand-held data terminal readout.',
    systemView: 'diagram2d', accentColor: '#5bd7ff'
  }),
  preset({
    id: 'console', name: 'Console', description: 'A ship-console orbital plot.',
    systemView: 'diagram2d', accentColor: '#7dff9e'
  }),
  preset({
    id: 'crt', name: 'CRT Terminal', description: 'A green-phosphor CRT terminal with scanlines.',
    systemView: 'diagram2d', filter: 'crt', filterParams: { phosphor: CRT_GREEN }, accentColor: CRT_GREEN
  }),
  preset({
    id: 'holo', name: 'Holo Table', description: 'A 3D holographic orrery table.',
    systemView: 'holo3d'
  }),
  preset({
    id: 'projection', name: 'Projection (GM-driven)',
    description: 'Overhead table projection that follows the GM. Set Background to Greenscreen for OBS.',
    systemView: 'holo3d', followGM: true, interactive: false, lockOverhead: true, whole: true,
    compression: 0, bodySize: 0.5, skybox: false, angleDeg: 0
  })
];

// Map the old localStorage HoloStyle filter ids onto the consolidated CRT + phosphor param.
function migrateFilter(filter: string): { filter: string; filterParams: FilterParamValues } {
  if (filter === 'retro_sci_fi_green') return { filter: 'crt', filterParams: { phosphor: CRT_GREEN } };
  if (filter === 'retro_sci_fi_amber') return { filter: 'crt', filterParams: { phosphor: CRT_AMBER } };
  return { filter: filter || 'none', filterParams: {} };
}

// Convert a saved HoloStyle preset (localStorage) into a PlayerPreset. These are GM-created player
// presets — a holo 3D system view — so they migrate straight in rather than being dropped.
export function holoPresetToPlayer(hp: HoloStyle & { id?: string; name?: string }): PlayerPreset {
  const { filter, filterParams } = migrateFilter(hp.filter);
  return {
    ...DEFAULT_PRESET,
    id: hp.id ?? 'migrated',
    name: hp.name ?? 'Imported preset',
    description: 'Imported from a saved holo look.',
    systemView: 'holo3d',
    filter, filterParams,
    bodyStyle: hp.bodyStyle ?? 'textured',
    background: hp.background ?? 'space',
    grid: hp.grid ?? 'plain',
    compression: hp.compression ?? 0.65,
    bodySize: hp.bodySize ?? 1,
    beltDetail: hp.beltDetail ?? 0.6,
    orbitSpeed: hp.orbitSpeed ?? 0,
    skybox: hp.skybox ?? true,
    angleDeg: hp.angleDeg ?? 64,
    whole: hp.whole ?? false
  };
}

// Extract the HoloStyle subset a PlayerPreset carries, for feeding HoloView. lockOverhead pins the
// tilt to top-down (the flat-projector look) regardless of the stored angle.
export function holoStyleOf(p: PlayerPreset): HoloStyle {
  return {
    filter: p.filter,
    compression: p.compression,
    angleDeg: p.lockOverhead ? 0 : p.angleDeg,
    whole: p.whole,
    skybox: p.skybox,
    beltDetail: p.beltDetail,
    bodyStyle: p.bodyStyle,
    background: p.background,
    bodySize: p.bodySize,
    grid: p.grid,
    orbitSpeed: p.orbitSpeed,
    labelSize: p.labelSize,
    font: p.font
  };
}

// Slug-based id, made unique against a set of existing ids (deterministic — no RNG).
export function makePresetId(name: string, existing: Iterable<string>): string {
  const base = 'pp-' + (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset');
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Duplicate a preset (built-in or custom) into an editable copy.
export function duplicatePreset(src: PlayerPreset, existing: Iterable<string>): PlayerPreset {
  const name = `${src.name} copy`;
  return { ...structuredClone(src), builtIn: false, id: makePresetId(name, existing), name };
}

const HOLO_PRESETS_KEY = 'holo-presets';

// One-time import of any previously-saved localStorage holo presets into a starmap's preset list.
// Returns the presets to merge (custom only — built-ins ship in code) and clears the key so it only
// happens once. Safe to call with no localStorage (SSR) — returns [].
export function migrateLocalHoloPresets(existingIds: Iterable<string>): PlayerPreset[] {
  if (typeof localStorage === 'undefined') return [];
  let saved: any[] = [];
  try {
    saved = JSON.parse(localStorage.getItem(HOLO_PRESETS_KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(saved) || saved.length === 0) return [];
  const taken = new Set(existingIds);
  const out: PlayerPreset[] = [];
  for (const hp of saved) {
    if (!hp || hp.builtIn || !hp.name) continue;
    const pp = holoPresetToPlayer(hp);
    pp.id = makePresetId(pp.name, taken);
    taken.add(pp.id);
    out.push(pp);
  }
  try { localStorage.removeItem(HOLO_PRESETS_KEY); } catch { /* ignore */ }
  return out;
}

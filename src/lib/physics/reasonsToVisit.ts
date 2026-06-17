// RPG "reasons to visit" / Point-of-Interest tagger. Data-driven: rules are SERIALIZABLE
// declarative conditions (not JS closures) so users can edit raw JSON, import/export PoI packs,
// and a future wizard can build them. Each rule = a tag + category + chance + a `when` expression
// over a flat, documented FEATURE VECTOR (makeup, mass, temperature, derived flags, other tags).
// Tags are emitted with a per-body SEEDED roll (deterministic from body id + system seed). Multiple
// packs STACK — their categories merge and their rules all run.
import type { System, CelestialBody } from '../types';
import { writable, get } from 'svelte/store';
import { makeupFractions } from './makeup';
import { EARTH_MASS_KG } from '../constants';
import { registerPoiCategories, registerPoiTags } from '../tags/tagPresentation';

// ---------------------------------------------------------------------------------------------
// Declarative condition schema. `true` = always. Numeric ops take [field, value]; eq compares a
// field to a string/number/boolean; hasTag / hasTagPrefix test the body's other tags.
// ---------------------------------------------------------------------------------------------
export type PoIExpr =
  | true
  | { all: PoIExpr[] }
  | { any: PoIExpr[] }
  | { not: PoIExpr }
  | { gt: [string, number] }
  | { lt: [string, number] }
  | { gte: [string, number] }
  | { lte: [string, number] }
  | { between: [string, number, number] }
  | { eq: [string, string | number | boolean] }
  | { hasTag: string }
  | { hasTagPrefix: string };

export interface ReasonCategory { id: string; label: string; desc: string; color?: string; textColor?: string; }
// Which body roles a rule is allowed to fire on. Omitted → the classic planet/moon/belt set.
export type PoIRole = 'star' | 'planet' | 'moon' | 'belt' | 'ring' | 'construct';
export const POI_ROLES: PoIRole[] = ['star', 'planet', 'moon', 'belt', 'ring', 'construct'];
export const DEFAULT_POI_ROLES: PoIRole[] = ['planet', 'moon', 'belt'];
export interface PoIRule { id: string; tag: string; category: string; chance: number; when: PoIExpr; enabled?: boolean; label?: string; description?: string; appliesTo?: PoIRole[]; }
export interface PoIPack { id: string; name: string; description: string; enabled: boolean; categories: ReasonCategory[]; rules: PoIRule[]; }

// Feature fields exposed to rule conditions — the wizard reads this for its field picker + ranges.
export interface PoIField { field: string; label: string; type: 'number' | 'bool' | 'string'; min?: number; max?: number; values?: string[]; note: string; }
export const POI_FIELDS: PoIField[] = [
  { field: 'makeup.metal', label: 'Metal fraction', type: 'number', min: 0, max: 1, note: 'Bulk metal (iron/nickel) mass fraction.' },
  { field: 'makeup.rock', label: 'Rock fraction', type: 'number', min: 0, max: 1, note: 'Silicate rock mass fraction.' },
  { field: 'makeup.carbon', label: 'Carbon fraction', type: 'number', min: 0, max: 1, note: 'Carbon/graphite mass fraction.' },
  { field: 'makeup.ice', label: 'Ice fraction', type: 'number', min: 0, max: 1, note: 'Water/volatile ice mass fraction.' },
  { field: 'makeup.gas', label: 'Gas fraction', type: 'number', min: 0, max: 1, note: 'H/He envelope mass fraction (high = a giant).' },
  { field: 'makeup.rockMetal', label: 'Rock+metal', type: 'number', min: 0, max: 1, note: 'Rock plus metal — a "how rocky" sum.' },
  { field: 'makeup.rockIce', label: 'Rock+ice', type: 'number', min: 0, max: 1, note: 'Rock plus ice — typical icy-moon makeup.' },
  { field: 'massMe', label: 'Mass (Earths)', type: 'number', min: 0, max: 4000, note: 'Mass in Earth masses (giants ~50–4000).' },
  { field: 'teqK', label: 'Equilibrium temp (K)', type: 'number', min: 0, max: 4000, note: 'Black-body equilibrium temperature.' },
  { field: 'ecc', label: 'Eccentricity', type: 'number', min: 0, max: 1, note: 'Orbital eccentricity (0 circular).' },
  { field: 'pressure', label: 'Atmos. pressure (bar)', type: 'number', min: 0, max: 1000, note: 'Surface atmospheric pressure.' },
  { field: 'hydroCover', label: 'Liquid coverage', type: 'number', min: 0, max: 1, note: 'Fraction of surface under liquid.' },
  { field: 'ageGyr', label: 'System age (Gyr)', type: 'number', min: 0, max: 13, note: 'Age of the whole system.' },
  { field: 'isGiant', label: 'Is a giant', type: 'bool', note: 'Gas/ice giant (or gas fraction ≥ 0.4).' },
  { field: 'hasAtmo', label: 'Has atmosphere', type: 'bool', note: 'Any atmosphere present.' },
  { field: 'hasO2', label: 'Free oxygen', type: 'bool', note: 'Oxidizing / breathable atmosphere (O₂ > 5%).' },
  { field: 'hasBio', label: 'Has biosphere', type: 'bool', note: 'Life or a habitability tier present.' },
  { field: 'hasRemnant', label: 'Stellar remnant in system', type: 'bool', note: 'A BH/NS/WD/magnetar anchors the system.' },
  { field: 'hasConstructs', label: 'Constructs in system', type: 'bool', note: 'Stations/ships exist in the system.' },
  { field: 'isRareType', label: 'Rare world type', type: 'bool', note: 'Classed ocean/carbon/iron/eyeball/lava/etc.' },
  { field: 'isLegendClass', label: 'Paradise type', type: 'bool', note: 'Ocean or eyeball world (legend bait).' },
  { field: 'roleHint', label: 'Body kind', type: 'string', values: ['planet', 'moon', 'belt'], note: 'planet / moon / belt.' },
  { field: 'hydro', label: 'Surface liquid', type: 'string', values: ['water', 'methane', 'ammonia'], note: 'Dominant surface liquid.' },
  { field: 'regime', label: 'Geology regime', type: 'string', values: ['plate-tectonics', 'stagnant-lid', 'tidal-volcanic', 'cryovolcanic', 'crater', 'inactive'], note: 'Tectonic/volcanic regime.' },
  { field: 'atmMain', label: 'Main atmos. gas', type: 'string', values: ['CO2', 'N2', 'O2', 'CH4', 'H2', 'He'], note: 'Dominant atmospheric gas.' }
];

export interface ReasonsConfig { enabled: boolean; categories: Record<string, boolean>; }
export const REASONS_DEFAULTS: ReasonsConfig = {
  enabled: true,
  // Mysteries & hooks (intrigue) default OFF — it's the most "GM flavour" set; the physical three
  // (resources / science / frontier) are on. Existing users keep their saved choices.
  categories: { resource: true, science: true, frontier: true, intrigue: false }
};

// --- The built-in default pack (the original rules, as data). Order preserved so the seeded roll
//     sequence — and therefore which tags appear — is identical to the hardcoded version. ---
let _rid = 0; const R = (tag: string, category: string, chance: number, when: PoIExpr, appliesTo?: PoIRole[]): PoIRule => ({ id: `d${_rid++}`, tag, category, chance, when, appliesTo });
export const DEFAULT_POI_PACK: PoIPack = {
  id: 'default', name: 'Reasons to Visit (default)', description: 'The built-in physics-driven PoI hooks.', enabled: true,
  categories: [
    { id: 'resource', label: 'Resources', desc: 'Mineable / economic value — fuels, metals, exotics', color: '#d4a843', textColor: '#1a1206' },
    { id: 'science', label: 'Scientific interest', desc: 'Research draws — rare formations, biosignatures, anomalies', color: '#5a9fd0', textColor: '#04121c' },
    { id: 'frontier', label: 'Frontier logistics', desc: 'Refuelling, waystations, gravity assists', color: '#6fae8f', textColor: '#06160f' },
    { id: 'intrigue', label: 'Mysteries & hooks', desc: 'Rumours, signals, legends — pure adventure bait', color: '#b07ad0', textColor: '#160a1c' }
  ],
  rules: [
    // Rocky/solid-world resources — planets & moons (belts have their own ore/rare-metals hooks).
    R('resource/heavy-metals', 'resource', 0.7, { gte: ['makeup.metal', 0.3] }, ['planet', 'moon']),
    R('resource/platinum-group', 'resource', 0.45, { gte: ['makeup.metal', 0.5] }, ['planet', 'moon']),
    R('resource/rare-earths', 'resource', 0.4, { all: [{ gte: ['makeup.metal', 0.2] }, { gte: ['makeup.rock', 0.3] }] }, ['planet', 'moon']),
    R('resource/fissiles', 'resource', 0.3, { all: [{ gte: ['makeup.rockMetal', 0.6] }, { between: ['ageGyr', 0.5, 9] }] }, ['planet', 'moon']),
    // (Gas-giant He-3 is now seeded deterministically from the He in its atmosphere — see the atmosphere
    //  resource pass.) This is the airless-moon regolith He-3 — a ground prospect, so it stays semi-random.
    R('resource/helium-3', 'resource', 0.3, { all: [{ eq: ['hasAtmo', false] }, { gte: ['ageGyr', 3] }, { gt: ['makeup.rockIce', 0.5] }] }, ['moon']),
    R('resource/deuterium', 'resource', 0.4, { any: [{ gte: ['makeup.gas', 0.4] }, { gte: ['hydroCover', 0.3] }] }, ['planet', 'moon']),
    R('resource/water-ice', 'resource', 0.7, { any: [{ gte: ['makeup.ice', 0.3] }, { hasTag: 'structure/icy-shell' }, { all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 250] }, { eq: ['hydro', 'water'] }] }] }, ['planet', 'moon']),
    R('resource/volatiles', 'resource', 0.5, { any: [{ all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 160] }] }, { gte: ['makeup.ice', 0.5] }] }, ['belt', 'moon']),
    R('resource/hydrocarbons', 'resource', 0.8, { eq: ['hydro', 'methane'] }, ['planet', 'moon']),  // surface methane (lakes); CH4 *atmosphere* is seeded deterministically by the atmosphere pass
    R('resource/exotic-crystals', 'resource', 0.25, { all: [{ gte: ['massMe', 2] }, { gte: ['makeup.rockMetal', 0.7] }] }, ['planet', 'moon']),
    R('resource/diamonds', 'resource', 0.4, { all: [{ gte: ['makeup.carbon', 0.3] }, { gte: ['massMe', 0.8] }] }, ['planet', 'moon']),
    R('resource/organics', 'resource', 0.5, { any: [{ eq: ['hasBio', true] }, { hasTag: 'prebiotic-precursor' }, { all: [{ eq: ['hydro', 'water'] }, { between: ['teqK', 250, 330] }] }] }, ['planet', 'moon']),
    R('resource/ore-belt', 'resource', 0.8, true, ['belt']),
    // (resource/oxidizer from O2 is now seeded deterministically by the atmosphere pass — was a chance rule here.)
    R('science/pristine-protoplanetary', 'science', 0.85, { lt: ['ageGyr', 0.5] }, ['planet', 'moon']),
    R('science/biosignature', 'science', 0.95, { eq: ['hasBio', true] }, ['planet', 'moon']),
    R('science/extremophile-niche', 'science', 0.8, { any: [{ eq: ['regime', 'cryovolcanic'] }, { hasTag: 'structure/subsurface-ocean' }, { hasTag: 'habitability/subsurface' }] }, ['planet', 'moon']),
    R('science/tidal-laboratory', 'science', 0.6, { any: [{ hasTag: 'tidal/hotspots' }, { eq: ['regime', 'tidal-volcanic'] }, { hasTag: 'resonance/laplace' }] }, ['planet', 'moon']),
    R('science/impact-record', 'science', 0.3, { any: [{ gt: ['ecc', 0.2] }, { eq: ['regime', 'crater'] }] }, ['planet', 'moon', 'belt']),
    R('science/remnant-proximity', 'science', 0.6, { eq: ['hasRemnant', true] }, ['planet', 'moon']),
    R('science/resonance-showcase', 'science', 0.45, { hasTagPrefix: 'resonance/' }, ['planet', 'moon']),
    R('science/rare-world-type', 'science', 0.6, { eq: ['isRareType', true] }, ['planet', 'moon']),
    R('science/exotic-chemistry', 'science', 0.4, { any: [{ hasTag: 'highly-corrosive' }, { hasTag: 'corrosive' }, { hasTag: 'technosignature' }] }, ['planet', 'moon']),
    R('science/runaway-greenhouse', 'science', 0.5, { any: [{ eq: ['regime', 'stagnant-lid'] }, { hasTag: 'climate/runaway-greenhouse' }] }, ['planet']),
    R('frontier/fuel-depot', 'frontier', 0.6, { any: [{ gte: ['makeup.ice', 0.2] }, { eq: ['hydro', 'water'] }, { all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 250] }, { hasTag: 'structure/icy-shell' }] }] }, ['planet', 'moon']),
    R('frontier/gas-skimming', 'frontier', 0.92, { eq: ['isGiant', true] }, ['planet']),
    R('frontier/life-support', 'frontier', 0.6, { any: [{ eq: ['hasO2', true] }, { all: [{ eq: ['hydro', 'water'] }, { eq: ['hasAtmo', true] }] }] }, ['planet', 'moon']),
    R('frontier/aerobraking', 'frontier', 0.3, { all: [{ eq: ['hasAtmo', true] }, { gte: ['pressure', 0.1] }] }, ['planet', 'moon']),
    R('frontier/gravity-assist', 'frontier', 0.3, { gte: ['massMe', 50] }, ['planet']),
    R('frontier/waystation', 'frontier', 0.2, { gt: ['makeup.rockMetal', 0.4] }, ['moon']),
    R('intrigue/anomalous-signal', 'intrigue', 0.08, true, ['planet', 'moon', 'belt']),
    R('intrigue/derelict-rumour', 'intrigue', 0.18, { eq: ['hasConstructs', true] }, ['planet', 'moon', 'belt']),
    R('intrigue/derelict-rumour', 'intrigue', 0.05, { eq: ['hasConstructs', false] }, ['planet', 'moon', 'belt']),
    R('intrigue/uncharted-feature', 'intrigue', 0.1, true, ['planet', 'moon', 'belt']),
    R('intrigue/legend', 'intrigue', 0.4, { any: [{ hasTag: 'habitability/super' }, { eq: ['isLegendClass', true] }] }, ['planet', 'moon']),
    // Belt-specific hooks. Belts read by temperature (icy outer/Kuiper vs rocky-metallic inner) and
    // orbital excitation (a stirred belt is likely a disrupted differentiated body — a shattered core).
    R('frontier/ice-mining', 'frontier', 0.7, { all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 150] }] }, ['belt']),
    R('resource/rare-metals', 'resource', 0.4, { gte: ['teqK', 150] }, ['belt']),
    R('science/shattered-core', 'science', 0.5, { gt: ['ecc', 0.12] }, ['belt'])
  ]
};

// Backwards-compatible export (the default categories) for the existing Settings UI.
export const REASON_CATEGORIES: ReasonCategory[] = DEFAULT_POI_PACK.categories;

// ---------------------------------------------------------------------------------------------
// Stores: per-category enable (+ master) and the list of stacked packs.
// ---------------------------------------------------------------------------------------------
const CFG_KEY = 'reasons-to-visit-config';
// 'resource' is a CORE reason-to-visit category — forced on for every user (it's the backbone of the
// shared resource ledger that fuel sourcing + construct cargo lean on). A saved `resource:false` is
// overridden on load so it can never be turned off.
export const CORE_REASON_CATEGORIES = ['resource'] as const;
function loadConfig(): ReasonsConfig {
  if (typeof localStorage === 'undefined') return structuredClone(REASONS_DEFAULTS);
  try {
    const v = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    return { enabled: v.enabled ?? true, categories: { ...REASONS_DEFAULTS.categories, ...(v.categories || {}), resource: true } };
  } catch { return structuredClone(REASONS_DEFAULTS); }
}
export const reasonsConfig = writable<ReasonsConfig>(loadConfig());

const PACKS_KEY = 'poi-packs';
function loadPacks(): PoIPack[] {
  const def = structuredClone(DEFAULT_POI_PACK);
  if (typeof localStorage === 'undefined') return [def];
  try {
    const saved = JSON.parse(localStorage.getItem(PACKS_KEY) || 'null');
    if (!Array.isArray(saved) || !saved.length) return [def];
    // The built-in pack is user-editable: honour the saved (possibly edited) version if present,
    // otherwise seed the built-in. "Reset" in the editor restores it to DEFAULT_POI_PACK.
    const out: PoIPack[] = [];
    const savedDefault = saved.find((p: PoIPack) => p.id === 'default');
    out.push(savedDefault && Array.isArray(savedDefault.rules) && Array.isArray(savedDefault.categories)
      ? { ...savedDefault, id: 'default' }
      : def);
    for (const p of saved) if (p.id !== 'default' && p && p.id && Array.isArray(p.rules)) out.push(p);
    return out;
  } catch { return [def]; }
}
export const poiPacks = writable<PoIPack[]>(loadPacks());

if (typeof window !== 'undefined') {
  reasonsConfig.subscribe((v) => { try { localStorage.setItem(CFG_KEY, JSON.stringify(v)); } catch { /* private */ } });
  poiPacks.subscribe((v) => { try { localStorage.setItem(PACKS_KEY, JSON.stringify(v)); } catch { /* private */ } });
}

// Merged categories across all ENABLED packs (dedup by id; first definition wins).
export function activeCategories(packs: PoIPack[]): ReasonCategory[] {
  const seen = new Map<string, ReasonCategory>();
  for (const p of packs) { if (p.enabled === false) continue; for (const c of p.categories) if (!seen.has(c.id)) seen.set(c.id, c); }
  return [...seen.values()];
}
// Every category across ALL packs (enabled or not) — used to keep the tag presentation layer (chip
// colours, grouping labels) in sync so even a disabled pack's lingering tags still render correctly.
function allCategories(packs: PoIPack[]): ReasonCategory[] {
  const seen = new Map<string, ReasonCategory>();
  for (const p of packs) for (const c of p.categories) if (!seen.has(c.id)) seen.set(c.id, c);
  return [...seen.values()];
}
// Push category styles (colour + label) AND per-rule tag presentation (player name + hover text) into
// tagPresentation whenever the packs change, so a tag like survey/geochem-sample picks up its
// pack-defined colour, heading, label and description. Fires once on init too.
poiPacks.subscribe((p) => {
  registerPoiCategories(allCategories(p));
  registerPoiTags(p.flatMap((pk) => pk.rules).map((r) => ({ key: r.tag, label: r.label, description: r.description })));
});

// --- Import / export (JSON pack files). ---
export function exportPack(pack: PoIPack): string {
  return JSON.stringify({ ...pack, _kind: 'sse-poi-pack', _version: 1 }, null, 2);
}
export function importPack(json: string): PoIPack {
  const p = JSON.parse(json);
  if (!p || !Array.isArray(p.rules) || !Array.isArray(p.categories)) throw new Error('Not a valid PoI pack (needs categories[] and rules[]).');
  return {
    id: p.id && p.id !== 'default' ? String(p.id) : `pack-${Math.abs(hashStr(p.name || json)).toString(36)}`,
    name: String(p.name || 'Imported pack'),
    description: String(p.description || ''),
    enabled: p.enabled !== false,
    categories: p.categories,
    rules: p.rules
  };
}

// --- Starmap embedding: a .json starmap carries its own packs so they travel with the map. The
//     built-in default pack is never embedded (it's always present); only the user's stacked packs. ---
export function packsForStarmap(): PoIPack[] {
  return get(poiPacks).filter((p) => p.id !== 'default');
}
// Merge packs loaded from a starmap into the live store (replace by id, append new ones).
export function mergeStarmapPacks(packs: PoIPack[] | undefined): void {
  if (!Array.isArray(packs) || !packs.length) return;
  poiPacks.update((cur) => {
    const out = [...cur];
    for (const p of packs) {
      if (!p || !p.id || p.id === 'default' || !Array.isArray(p.rules)) continue;
      const i = out.findIndex((x) => x.id === p.id);
      if (i >= 0) out[i] = p; else out.push(p);
    }
    return out;
  });
}
export function applyStarmapReasonsConfig(cfg: ReasonsConfig | undefined): void {
  if (cfg && typeof cfg === 'object' && cfg.categories) {
    reasonsConfig.set({ enabled: cfg.enabled ?? true, categories: { ...REASONS_DEFAULTS.categories, ...cfg.categories } });
  }
}

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG (mulberry32, string-seeded).
// ---------------------------------------------------------------------------------------------
function hashStr(s: string): number {
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const RARE_CLASSES = ['ocean', 'carbon', 'iron', 'eyeball', 'super-earth', 'helium', 'chthonian', 'coreless', 'lava', 'puffy', 'silicate'];

type Features = Record<string, number | string | boolean> & { __tags: Set<string> };
function buildFeatures(b: CelestialBody, ageGyr: number, hasRemnant: boolean, hasConstructs: boolean): Features {
  const mk = makeupFractions(b);
  const classes = b.classes || [];
  const bodyTags = b.tags || [];
  const tags = new Set(bodyTags.map((t) => t.key));
  const f: Features = {
    __tags: tags,
    'makeup.metal': mk.metal, 'makeup.rock': mk.rock, 'makeup.carbon': mk.carbon, 'makeup.ice': mk.ice, 'makeup.gas': mk.gas,
    'makeup.rockMetal': mk.rock + mk.metal, 'makeup.rockIce': mk.rock + mk.ice,
    massMe: (b.massKg || 0) / EARTH_MASS_KG,
    teqK: b.equilibriumTempK || 0,
    ecc: b.orbit?.elements.e || 0,
    pressure: b.atmosphere?.pressure_bar || 0,
    hydroCover: b.hydrosphere?.coverage || 0,
    ageGyr,
    isGiant: classes.some((c) => c.includes('gas-giant') || c.includes('ice-giant')) || mk.gas >= 0.4,
    hasAtmo: !!b.atmosphere && b.atmosphere.name !== 'None',
    hasO2: [...tags].some((k) => k === 'oxidizer' || k.startsWith('breathable-human')) || (b.atmosphere?.composition?.['O2'] ?? 0) > 0.05,
    hasBio: !!b.biosphere || [...tags].some((k) => k.startsWith('habitability/') && k !== 'habitability/none'),
    hasRemnant, hasConstructs,
    isRareType: classes.some((c) => RARE_CLASSES.some((r) => c.includes(r))),
    isLegendClass: classes.some((c) => c.includes('ocean') || c.includes('eyeball')),
    roleHint: b.roleHint || '',
    hydro: b.hydrosphere?.composition || '',
    regime: b.geoActivity?.regime || '',
    atmMain: b.atmosphere?.main || ''
  };
  // Expose the player's own custom tag VALUES as `tag:<key>` fields, so PoI rules can trigger on
  // them (e.g. a hand-added tag faction/control = "Empire" → eq tag:faction/control "Empire", or a
  // numeric danger = "7" → gte tag:danger 5). Only tags that actually carry a value are exposed.
  for (const t of bodyTags) if (t.value != null && t.value !== '') f['tag:' + t.key] = t.value;
  return f;
}

function evalPoI(expr: PoIExpr, f: Features): boolean {
  if (expr === true) return true;
  if ('all' in expr) return expr.all.every((e) => evalPoI(e, f));
  if ('any' in expr) return expr.any.some((e) => evalPoI(e, f));
  if ('not' in expr) return !evalPoI(expr.not, f);
  if ('hasTag' in expr) return f.__tags.has(expr.hasTag);
  if ('hasTagPrefix' in expr) { for (const k of f.__tags) if (k.startsWith(expr.hasTagPrefix)) return true; return false; }
  if ('eq' in expr) return String(f[expr.eq[0]] ?? '') === String(expr.eq[1]);
  // Numeric fields may also arrive as numeric strings (custom tag values are stored as text).
  const numField = (n: string) => { const v = f[n]; if (typeof v === 'number') return v; if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v); return NaN; };
  if ('gt' in expr) return numField(expr.gt[0]) > expr.gt[1];
  if ('lt' in expr) return numField(expr.lt[0]) < expr.lt[1];
  if ('gte' in expr) return numField(expr.gte[0]) >= expr.gte[1];
  if ('lte' in expr) return numField(expr.lte[0]) <= expr.lte[1];
  if ('between' in expr) { const v = numField(expr.between[0]); return v >= expr.between[1] && v <= expr.between[2]; }
  return false;
}

const CAT_PREFIX_OF = (catId: string) => catId + '/';

export function annotateReasonsToVisit(system: System, cfg?: ReasonsConfig, packs?: PoIPack[]): void {
  const conf = cfg ?? get(reasonsConfig);
  const allPacks = packs ?? get(poiPacks);
  const enabledPacks = allPacks.filter((p) => p.enabled !== false);
  // Active rules in stable order: pack order, then rule order (default pack first → identical
  // determinism to the original hardcoded list when only it is active).
  const rules = enabledPacks.flatMap((p) => p.rules.filter((r) => r.enabled !== false));
  // Every category prefix any pack defines — so we clear stale tags even from disabled packs.
  const catPrefixes = [...new Set(allPacks.flatMap((p) => p.categories.map((c) => CAT_PREFIX_OF(c.id))))];

  const stars = system.nodes.filter((n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star') as CelestialBody[];
  const ageGyr = system.age_Gyr ?? 4.6;
  const hasRemnant = stars.some((s) => (s.classes || []).some((c) => /BH|NS|WD|magnetar|neutron|white-dwarf|black-hole/i.test(c)));
  const hasConstructs = system.nodes.some((n) => n.kind === 'construct');

  for (const node of system.nodes) {
    const isConstruct = node.kind === 'construct';
    if (node.kind !== 'body' && !isConstruct) continue;   // skip barycentres
    const b = node as CelestialBody;
    const role = (isConstruct ? 'construct' : (b.roleHint || '')) as PoIRole;
    // Clear stale rule-tags by category prefix — but NEVER a hand-added (manual) tag, even if the
    // player filed it under an existing category (e.g. a custom frontier/my-depot).
    b.tags = (b.tags || []).filter((t) => t.manual || !catPrefixes.some((p) => t.key.startsWith(p)));
    if (!conf.enabled) continue;

    const f = buildFeatures(b, ageGyr, hasRemnant, hasConstructs);
    if (isConstruct) f.roleHint = 'construct';
    const rng = mulberry32(hashStr(`${b.id}|${system.seed || ''}`));
    const added = new Set<string>();
    for (const rule of rules) {
      const roll = rng(); // advance ALWAYS so category/role/pack toggles don't shift other rolls
      const roles = rule.appliesTo && rule.appliesTo.length ? rule.appliesTo : DEFAULT_POI_ROLES;
      if (!roles.includes(role)) continue;
      if (conf.categories[rule.category] === false) continue;
      if (added.has(rule.tag)) continue;
      if (evalPoI(rule.when, f) && roll < rule.chance) { b.tags.push({ key: rule.tag, source: `rule:${rule.id}` }); added.add(rule.tag); }
    }
  }
}

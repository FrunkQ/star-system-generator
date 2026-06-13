// RPG "reasons to visit" tagger — gives every world a hook for why a crew would actually GO there:
// mineable resources, scientific interest, frontier logistics, or a mystery. Inferred from the
// physics (makeup, age, mass, temperature, geology, atmosphere, existing tags) plus a per-body
// SEEDED random roll (deterministic from the body id + system seed, so a system always tags the
// same way). Tags are namespaced by CATEGORY (resource/…, science/…, frontier/…, intrigue/…) so
// the generation settings can switch whole categories on/off. Scientifically plausible, but the
// random roll keeps it from being every-world-has-everything.
import type { System, CelestialBody } from '../types';
import { writable, get } from 'svelte/store';
import { makeupFractions } from './makeup';
import { EARTH_MASS_KG } from '../constants';

export interface ReasonCategory { id: string; label: string; desc: string; }
export const REASON_CATEGORIES: ReasonCategory[] = [
  { id: 'resource', label: 'Resources',          desc: 'Mineable / economic value — fuels, metals, exotics' },
  { id: 'science',  label: 'Scientific interest', desc: 'Research draws — rare formations, biosignatures, anomalies' },
  { id: 'frontier', label: 'Frontier logistics',  desc: 'Refuelling, waystations, gravity assists' },
  { id: 'intrigue', label: 'Mysteries & hooks',   desc: 'Rumours, signals, legends — pure adventure bait' }
];

export interface ReasonsConfig { enabled: boolean; categories: Record<string, boolean>; }
export const REASONS_DEFAULTS: ReasonsConfig = {
  enabled: true,
  categories: { resource: true, science: true, frontier: true, intrigue: true }
};

const KEY = 'reasons-to-visit-config';
function loadConfig(): ReasonsConfig {
  if (typeof localStorage === 'undefined') return structuredClone(REASONS_DEFAULTS);
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { enabled: v.enabled ?? true, categories: { ...REASONS_DEFAULTS.categories, ...(v.categories || {}) } };
  } catch { return structuredClone(REASONS_DEFAULTS); }
}
export const reasonsConfig = writable<ReasonsConfig>(loadConfig());
if (typeof window !== 'undefined') {
  reasonsConfig.subscribe((v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private */ } });
}

// --- Deterministic PRNG (mulberry32, seeded from a string). ---
function hashStr(s: string): number {
  let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface BodyView {
  b: CelestialBody;
  mk: ReturnType<typeof makeupFractions>;
  massMe: number;
  teqK: number;
  tags: Set<string>;
  regime: string;
  isGiant: boolean;
  hasAtmo: boolean;
  pressure: number;
  hydro: string | undefined;
  hydroCover: number;
  hasBio: boolean;
  hasO2: boolean;
  ecc: number;
}
interface Ctx { ageGyr: number; hasRemnant: boolean; hasConstructs: boolean; }

// A rare-type set worth a detour purely for its classification.
const RARE_CLASSES = ['ocean', 'carbon', 'iron', 'eyeball', 'super-earth', 'helium', 'chthonian', 'coreless', 'lava', 'puffy', 'silicate'];

interface Rule { tag: string; cat: string; when: (v: BodyView, c: Ctx) => boolean; chance: number; }
const RULES: Rule[] = [
  // --- resource ---
  { tag: 'resource/heavy-metals',   cat: 'resource', chance: 0.7,  when: (v) => v.mk.metal >= 0.3 },
  { tag: 'resource/platinum-group', cat: 'resource', chance: 0.45, when: (v) => v.mk.metal >= 0.5 },
  { tag: 'resource/rare-earths',    cat: 'resource', chance: 0.4,  when: (v) => v.mk.metal >= 0.2 && v.mk.rock >= 0.3 },
  { tag: 'resource/fissiles',       cat: 'resource', chance: 0.3,  when: (v, c) => (v.mk.rock + v.mk.metal) >= 0.6 && c.ageGyr >= 0.5 && c.ageGyr <= 9 },
  { tag: 'resource/helium-3',       cat: 'resource', chance: 0.6,  when: (v) => v.isGiant },
  { tag: 'resource/helium-3',       cat: 'resource', chance: 0.3,  when: (v, c) => v.b.roleHint === 'moon' && !v.hasAtmo && c.ageGyr >= 3 && (v.mk.rock + v.mk.ice) > 0.5 },
  { tag: 'resource/deuterium',      cat: 'resource', chance: 0.4,  when: (v) => v.mk.gas >= 0.4 || v.hydroCover >= 0.3 },
  { tag: 'resource/water-ice',      cat: 'resource', chance: 0.7,  when: (v) => v.mk.ice >= 0.3 || v.tags.has('structure/icy-shell') || (v.teqK > 0 && v.teqK < 250 && v.hydro === 'water') },
  { tag: 'resource/volatiles',      cat: 'resource', chance: 0.5,  when: (v) => (v.b.roleHint === 'belt' && v.teqK > 0 && v.teqK < 160) || v.mk.ice >= 0.5 },
  { tag: 'resource/hydrocarbons',   cat: 'resource', chance: 0.8,  when: (v) => v.hydro === 'methane' || v.b.atmosphere?.main === 'CH4' },
  { tag: 'resource/exotic-crystals',cat: 'resource', chance: 0.25, when: (v) => v.massMe >= 2 && (v.mk.rock + v.mk.metal) >= 0.7 },
  { tag: 'resource/diamonds',       cat: 'resource', chance: 0.4,  when: (v) => v.mk.carbon >= 0.3 && v.massMe >= 0.8 },
  { tag: 'resource/organics',       cat: 'resource', chance: 0.5,  when: (v) => v.hasBio || v.tags.has('prebiotic-precursor') || (v.hydro === 'water' && v.teqK >= 250 && v.teqK <= 330) },
  { tag: 'resource/ore-belt',       cat: 'resource', chance: 0.8,  when: (v) => v.b.roleHint === 'belt' },
  { tag: 'resource/oxidizer',       cat: 'resource', chance: 0.5,  when: (v) => v.hasO2 },

  // --- science ---
  { tag: 'science/pristine-protoplanetary', cat: 'science', chance: 0.85, when: (_, c) => c.ageGyr < 0.5 },
  { tag: 'science/biosignature',            cat: 'science', chance: 0.95, when: (v) => v.hasBio },
  { tag: 'science/extremophile-niche',      cat: 'science', chance: 0.8,  when: (v) => v.regime === 'cryovolcanic' || v.tags.has('structure/subsurface-ocean') || v.tags.has('habitability/subsurface') },
  { tag: 'science/tidal-laboratory',        cat: 'science', chance: 0.6,  when: (v) => v.tags.has('tidal/hotspots') || v.regime === 'tidal-volcanic' || v.tags.has('resonance/laplace') },
  { tag: 'science/impact-record',           cat: 'science', chance: 0.3,  when: (v) => v.ecc > 0.2 || v.regime === 'crater' },
  { tag: 'science/remnant-proximity',       cat: 'science', chance: 0.6,  when: (_, c) => c.hasRemnant },
  { tag: 'science/resonance-showcase',      cat: 'science', chance: 0.45, when: (v) => [...v.tags].some((t) => t.startsWith('resonance/')) },
  { tag: 'science/rare-world-type',         cat: 'science', chance: 0.6,  when: (v) => (v.b.classes || []).some((c) => RARE_CLASSES.some((r) => c.includes(r))) },
  { tag: 'science/exotic-chemistry',        cat: 'science', chance: 0.4,  when: (v) => v.tags.has('highly-corrosive') || v.tags.has('corrosive') || v.tags.has('technosignature') },
  { tag: 'science/runaway-greenhouse',      cat: 'science', chance: 0.5,  when: (v) => v.regime === 'stagnant-lid' || v.tags.has('climate/runaway-greenhouse') },

  // --- frontier ---
  { tag: 'frontier/fuel-depot',       cat: 'frontier', chance: 0.6,  when: (v) => v.mk.ice >= 0.2 || v.hydro === 'water' || (v.teqK > 0 && v.teqK < 250 && v.tags.has('structure/icy-shell')) },
  // Traveller-style wilderness refuelling: a gas giant's hydrogen is jump fuel — almost any one will do.
  { tag: 'frontier/gas-skimming',     cat: 'frontier', chance: 0.92, when: (v) => v.isGiant },
  { tag: 'frontier/life-support',     cat: 'frontier', chance: 0.6,  when: (v) => v.hasO2 || (v.hydro === 'water' && v.hasAtmo) },
  { tag: 'frontier/aerobraking',      cat: 'frontier', chance: 0.3,  when: (v) => v.hasAtmo && v.pressure >= 0.1 },
  { tag: 'frontier/gravity-assist',   cat: 'frontier', chance: 0.3,  when: (v) => v.massMe >= 50 },
  { tag: 'frontier/waystation',       cat: 'frontier', chance: 0.2,  when: (v) => v.b.roleHint === 'moon' && (v.mk.rock + v.mk.metal) > 0.4 },

  // --- intrigue (pure RPG bait; low odds so it stays special) ---
  { tag: 'intrigue/anomalous-signal', cat: 'intrigue', chance: 0.08, when: () => true },
  { tag: 'intrigue/derelict-rumour',  cat: 'intrigue', chance: 0.18, when: (_, c) => c.hasConstructs },
  { tag: 'intrigue/derelict-rumour',  cat: 'intrigue', chance: 0.05, when: (_, c) => !c.hasConstructs },
  { tag: 'intrigue/uncharted-feature',cat: 'intrigue', chance: 0.1,  when: () => true },
  { tag: 'intrigue/legend',           cat: 'intrigue', chance: 0.4,  when: (v) => v.tags.has('habitability/super') || (v.b.classes || []).some((c) => c.includes('ocean') || c.includes('eyeball')) }
];

const CAT_PREFIXES = REASON_CATEGORIES.map((c) => c.id + '/');

function buildView(b: CelestialBody): BodyView {
  const mk = makeupFractions(b);
  const classes = b.classes || [];
  return {
    b, mk,
    massMe: (b.massKg || 0) / EARTH_MASS_KG,
    teqK: b.equilibriumTempK || 0,
    tags: new Set((b.tags || []).map((t) => t.key)),
    regime: b.geoActivity?.regime || '',
    isGiant: classes.some((c) => c.includes('gas-giant') || c.includes('ice-giant')) || mk.gas >= 0.4,
    hasAtmo: !!b.atmosphere && b.atmosphere.name !== 'None',
    pressure: b.atmosphere?.pressure_bar || 0,
    hydro: b.hydrosphere?.composition,
    hydroCover: b.hydrosphere?.coverage || 0,
    hasBio: !!b.biosphere || (b.tags || []).some((t) => t.key.startsWith('habitability/') && t.key !== 'habitability/none'),
    hasO2: (b.tags || []).some((t) => t.key === 'oxidizer' || t.key.startsWith('breathable-human')) || (b.atmosphere?.composition?.['O2'] ?? 0) > 0.05,
    ecc: b.orbit?.elements.e || 0
  };
}

export function annotateReasonsToVisit(system: System, config?: ReasonsConfig): void {
  const cfg = config ?? get(reasonsConfig);
  const stars = system.nodes.filter((n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star') as CelestialBody[];
  const ctx: Ctx = {
    ageGyr: system.age_Gyr ?? 4.6,
    hasRemnant: stars.some((s) => (s.classes || []).some((c) => /BH|NS|WD|magnetar|neutron|white-dwarf|black-hole/i.test(c))),
    hasConstructs: system.nodes.some((n) => n.kind === 'construct')
  };

  for (const node of system.nodes) {
    if (node.kind !== 'body') continue;
    const b = node as CelestialBody;
    if (!['planet', 'moon', 'belt'].includes(b.roleHint)) continue;
    // Clear our categories first so toggling/regeneration is clean.
    b.tags = (b.tags || []).filter((t) => !CAT_PREFIXES.some((p) => t.key.startsWith(p)));
    if (!cfg.enabled) continue;

    const v = buildView(b);
    const rng = mulberry32(hashStr(`${b.id}|${system.seed || ''}`));
    const added = new Set<string>();
    for (const rule of RULES) {
      const roll = rng(); // advance ALWAYS so category toggles don't shift other rolls
      if (!cfg.categories[rule.cat]) continue;
      if (added.has(rule.tag)) continue;              // a tag with two rules only fires once
      if (rule.when(v, ctx) && roll < rule.chance) { b.tags.push({ key: rule.tag }); added.add(rule.tag); }
    }
  }
}

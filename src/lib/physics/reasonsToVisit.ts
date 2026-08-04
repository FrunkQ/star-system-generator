// RPG "reasons to visit" / Point-of-Interest tagger. Data-driven: rules are SERIALIZABLE
// declarative conditions (not JS closures) so users can edit raw JSON, import/export PoI packs,
// and a future wizard can build them. Each rule = a tag + category + chance + a `when` expression
// over a flat, documented FEATURE VECTOR (makeup, mass, temperature, derived flags, other tags).
// Tags are emitted with a per-body SEEDED roll (deterministic from body id + system seed). Multiple
// packs STACK — their categories merge and their rules all run.
import type { System, CelestialBody } from '../types';
import { derived, get } from 'svelte/store';
import { makeupFractions } from './makeup';
import { EARTH_MASS_KG } from '../constants';
import { stripRuleTags } from '../tags/tagLifecycle';
import { tagCategories, tagRulesEnabled, normalizeTagCategories } from '../tags/tagCategories';

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
  { field: 'regime', label: 'Geology regime', type: 'string', values: ['plate-tectonics', 'stagnant-lid', 'episodic', 'plutonic', 'tidal-volcanic', 'cryovolcanic', 'crater', 'inactive'], note: 'Tectonic/volcanic regime.' },
  { field: 'atmMain', label: 'Main atmos. gas', type: 'string', values: ['CO2', 'N2', 'O2', 'CH4', 'H2', 'He'], note: 'Dominant atmospheric gas.' },
  { field: 'hasNobleGas', label: 'Noble gas in air', type: 'bool', note: 'Atmosphere contains Ar/Kr/Xe/Ne (>0.1%).' }
];

export interface ReasonsConfig { enabled: boolean; categories: Record<string, boolean>; }
// Moved to tags/tagDefaults.ts with the rest of the default data — the migration needs it, and
// reaching back here for it would be the cycle that file exists to avoid.
export { REASONS_DEFAULTS } from '../tags/tagDefaults';
import { REASONS_DEFAULTS } from '../tags/tagDefaults';

// The built-in rule pack (and its rule DSL) moved to tags/tagDefaults.ts — same reason as the
// construct starter set: the store below reads from tagCategories, which would otherwise cycle.
export { DEFAULT_POI_PACK } from '../tags/tagDefaults';
import { DEFAULT_POI_PACK } from '../tags/tagDefaults';

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
// THE STORES MOVED — see tags/tagCategories.ts. What is left here is the RULES VIEW of that store,
// keeping the old names and shapes so every consumer kept working. `poiPacks` is now a single
// synthetic pack assembled from the categories that carry rules; there is no pack identity any more,
// because a pack was only ever a bag of categories and two of them defining the same category was a
// merge conflict nobody could see.
export const reasonsConfig = derived([tagCategories, tagRulesEnabled], ([cats, on]) => ({
  enabled: on,
  categories: Object.fromEntries(cats.map((c) => [c.id, c.enabled]))
} as ReasonsConfig));

export const poiPacks = derived(tagCategories, (cats) => [{
  id: 'default',
  name: 'Tag categories',
  description: 'Assembled from Settings → Tagging.',
  enabled: true,
  categories: cats.map((c) => ({ id: c.id, label: c.shortName || c.longName, desc: c.description, color: c.color, textColor: c.textColor })),
  // Sorted back into the order the rules were authored in — the seeded roll advances per rule, so
  // category-grouped order would re-roll every world in the starmap. See TagRule.seq.
  rules: cats.flatMap((c) => c.rules).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
} as PoIPack]);

// Merged categories across all ENABLED packs (dedup by id; first definition wins).
export function activeCategories(packs: PoIPack[]): ReasonCategory[] {
  const seen = new Map<string, ReasonCategory>();
  for (const p of packs) { if (p.enabled === false) continue; for (const c of p.categories) if (!seen.has(c.id)) seen.set(c.id, c); }
  return [...seen.values()];
}

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
// Saves now embed the unified categories (see tagCategories.categoriesForStarmap), so nothing needs
// to write packs out. These two remain to READ what older starmaps carry.
export function packsForStarmap(): PoIPack[] {
  return [];
}

/** Merge packs from an older starmap: fold each pack's categories and rules into the unified store. */
export function mergeStarmapPacks(packs: PoIPack[] | undefined): void {
  if (!Array.isArray(packs) || !packs.length) return;
  tagCategories.update((cur) => {
    const byId = new Map(cur.map((c) => [c.id, c]));
    for (const p of packs) {
      if (!p || p.enabled === false || !Array.isArray(p.rules)) continue;
      for (const rc of p.categories ?? []) {
        if (!byId.has(rc.id)) {
          byId.set(rc.id, {
            id: rc.id, shortName: rc.label, longName: rc.label, description: rc.desc,
            color: rc.color || '#888888', textColor: rc.textColor,
            appliesTo: ['planet', 'moon', 'belt'], enabled: true, tags: [], rules: []
          } as any);
        }
      }
      for (const r of p.rules) {
        const c = byId.get(r.category);
        if (!c || c.rules.some((x) => x.id === r.id)) continue;
        c.rules = [...c.rules, r as any];
        if (!c.tags.some((t) => t.key === r.tag)) {
          c.tags = [...c.tags, { key: r.tag, label: r.label || r.tag.split('/').slice(1).join(' '), description: r.description }];
        }
      }
    }
    return normalizeTagCategories([...byId.values()]);
  });
}

/** Apply an older starmap's per-category on/off state onto the unified categories. */
export function applyStarmapReasonsConfig(cfg: ReasonsConfig | undefined): void {
  if (!cfg || typeof cfg !== 'object') return;
  if (typeof cfg.enabled === 'boolean') tagRulesEnabled.set(cfg.enabled);
  if (!cfg.categories) return;
  tagCategories.update((cs) => cs.map((c) => (
    cfg.categories[c.id] === undefined ? c : { ...c, enabled: cfg.categories[c.id] !== false }
  )));
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
    hasNobleGas: (() => { const c = b.atmosphere?.composition || {}; return ((c['Ar'] ?? 0) + (c['Kr'] ?? 0) + (c['Xe'] ?? 0) + (c['Ne'] ?? 0)) > 0.001; })(),
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
    // player filed it under an existing category (e.g. a custom frontier/my-depot). stripRuleTags
    // also spares a PHYSICS tag sharing a rule category, which `frontier/*` now has: this pass does
    // not own every key in its namespaces, only the ones a rule emitted.
    b.tags = stripRuleTags(b.tags, catPrefixes);
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

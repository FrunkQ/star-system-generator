// R-19: A PASTED BODY BRINGS THE RULES IT NEEDS.
//
// Custom definitions do not live on the node. They live on the STARMAP, in `rulePackOverrides`, and
// the app builds an effective pack of shipped-plus-overrides (`effectiveRulePack`, `+page.svelte`).
// A clip carries NODES. So copying a planet whose hydrosphere names a GM's custom liquid used to
// paste a body whose `liquidDef()` lookup missed - and phase, appearance and climate all fell back
// to defaults while the paste reported success. Not a crash and not a warning: a planet that is
// subtly wrong in a way the person who pasted it has no way to notice. That is the bug this closes,
// and it was silent for every override kind.
//
// THE ENVELOPE GAINS ONE OPTIONAL KEY, `rulePackOverrides`, carrying the source map's overrides
// whole and unmodified. An engine that ignores it behaves exactly as before.
//
// ONE TABLE, NOT NINE BRANCHES. The nine sections of `RulePackOverrides` are stored in FIVE
// different shapes, and the effective-pack build has a hand-written arm for each. Every question
// this feature asks - what is in here, is it the same as mine, how do I add one - would otherwise
// need its own copy of that nine-way branch, which is four copies of one fact waiting to disagree.
// So the shapes are DATA in `SECTIONS` below and the code above it is shape-agnostic.

import type { RulePack, RulePackOverrides } from '$lib/types';
import { applyListDelta, type PackListDelta } from '$lib/rulepackDelta';
import { allLiquids } from '$lib/physics/liquids';
import { allMorphologies } from '$lib/physics/vegetation';
import { allPigments } from '$lib/physics/pigments';

/**
 * How a section stores its definitions. The five are not a taxonomy anybody designed - they are what
 * `effectiveRulePack` actually reads, measured 2026-09-08, and the merge has to speak all of them.
 *
 *  - `list`     an array of whole records, upserted into the pack's entries by an id field.
 *  - `delta`    `PackListDelta<T> | T[]` laid over the pack's own list. THREE sections, not two:
 *               `liquids` joined `morphologies` and `pigments` at D25, and its TYPE was never
 *               widened to say so (`types.ts`, `liquids?: LiquidDef[]`) - the reader casts.
 *  - `record`   `Record<key, T>`, spread over the pack's own record.
 *  - `weighted` a distribution's entries, `{ weight, value: { name } }`, REPLACING the pack's list
 *               wholesale. The identity is nested one level down, in `value.name`.
 *  - `scalars`  a bag of numbers with no identity at all. Compared and merged whole, per FIELD.
 */
export type SectionShape = 'list' | 'delta' | 'record' | 'weighted' | 'scalars';

export interface SectionDef {
  /** The key on `RulePackOverrides`. */
  readonly key: keyof RulePackOverrides;
  readonly shape: SectionShape;
  /** What identifies one definition within the section. Absent for `scalars`, which has none. */
  readonly idOf?: (record: any) => string | undefined;
  /** The pack's own list, for the three `delta` sections - what an incoming delta is laid against. */
  readonly base?: (pack: RulePack | null | undefined) => any[];
  /** For the report, in the app's voice: "2 liquids", "an engine definition". */
  readonly one: string;
  readonly many: string;
}

/**
 * THE NINE SECTIONS. Ordered as `RulePackOverrides` declares them, so the two files read together.
 *
 * `pigmentModel` is the ninth and it is easy to miss: the hub's brief and this engine's own triage
 * both said EIGHT, because it is the one key that is not a collection. Left out, a campaign's
 * pigment weightings would be the one customisation that silently did not travel.
 */
export const SECTIONS: readonly SectionDef[] = [
  { key: 'fuelDefinitions',   shape: 'list',   idOf: (r) => r?.id,          one: 'fuel definition',      many: 'fuel definitions' },
  { key: 'engineDefinitions', shape: 'list',   idOf: (r) => r?.id,          one: 'engine definition',    many: 'engine definitions' },
  { key: 'sensorDefinitions', shape: 'list',   idOf: (r) => r?.id,          one: 'sensor definition',    many: 'sensor definitions' },
  { key: 'gasPhysics',        shape: 'record', idOf: (r) => r?.__key,       one: 'gas',                  many: 'gases' },
  { key: 'atmosphereCompositions', shape: 'weighted', idOf: (r) => r?.value?.name, one: 'atmosphere preset', many: 'atmosphere presets' },
  { key: 'liquids',     shape: 'delta', idOf: (r) => r?.name, base: (p) => allLiquids(p),      one: 'liquid',     many: 'liquids' },
  { key: 'morphologies', shape: 'delta', idOf: (r) => r?.key, base: (p) => allMorphologies(p), one: 'morphology', many: 'morphologies' },
  { key: 'pigments',    shape: 'delta', idOf: (r) => r?.key, base: (p) => allPigments(p),      one: 'pigment',    many: 'pigments' },
  { key: 'pigmentModel', shape: 'scalars', one: 'pigment model setting', many: 'pigment model settings' }
] as const;

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Shape-check an incoming `rulePackOverrides`, and keep only what this engine can actually merge.
 *
 * THE CONTENT IS NOT THIS READER'S TO EDIT - the same discipline `credits` already follows. Only the
 * SHAPE is checked, so a malformed section cannot poison a save, and a section this build has never
 * heard of is DROPPED RATHER THAN CARRIED. That is the deliberate half: carrying a section nothing
 * can compare would be a promise the merge cannot keep, and the envelope's version gate already
 * covers the honest case of a clip from a newer producer. The hub flagged one such key in advance -
 * `tagVocab` is on `RulePack` but not on `RulePackOverrides`, so a custom tag's definition cannot
 * travel today even though the tag on the node does.
 *
 * Returns undefined when nothing survives, so a caller can omit the key rather than store an empty
 * object - `{}` and "absent" should not be two ways of saying nothing.
 */
export function readClipOverrides(raw: unknown): RulePackOverrides | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, any> = {};
  for (const section of SECTIONS) {
    const value = raw[section.key as string];
    if (value === undefined || value === null) continue;
    const kept = keepIfWellShaped(section, value);
    if (kept !== undefined) out[section.key as string] = kept;
  }
  return Object.keys(out).length ? (out as RulePackOverrides) : undefined;
}

/** One section, checked against its own shape. Undefined means "say nothing" rather than "empty". */
function keepIfWellShaped(section: SectionDef, value: any): any {
  switch (section.shape) {
    case 'list':
    case 'weighted': {
      if (!Array.isArray(value)) return undefined;
      const rows = value.filter((r) => isPlainObject(r) && section.idOf?.(r));
      return rows.length ? rows : undefined;
    }
    case 'record': {
      if (!isPlainObject(value)) return undefined;
      const rows: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) if (k && isPlainObject(v)) rows[k] = v;
      return Object.keys(rows).length ? rows : undefined;
    }
    case 'delta': {
      // BOTH FORMS ARE LEGAL and both arrive: a delta from the biosphere editors, a whole list from
      // the liquids one and from every campaign saved before `rulepackDelta` existed.
      if (Array.isArray(value)) {
        const rows = value.filter((r) => isPlainObject(r) && section.idOf?.(r));
        return rows.length ? rows : undefined;
      }
      if (!isPlainObject(value)) return undefined;
      const order = Array.isArray(value.order) ? value.order.filter((k: any) => typeof k === 'string' && k) : undefined;
      const entries = isPlainObject(value.entries)
        ? Object.fromEntries(Object.entries(value.entries).filter(([k, v]) => k && isPlainObject(v)))
        : undefined;
      const delta: PackListDelta<any> = {};
      if (order?.length) delta.order = order;
      if (entries && Object.keys(entries).length) delta.entries = entries;
      return delta.order || delta.entries ? delta : undefined;
    }
    case 'scalars': {
      if (!isPlainObject(value)) return undefined;
      const rows: Record<string, number> = {};
      for (const [k, v] of Object.entries(value)) if (k && typeof v === 'number' && Number.isFinite(v)) rows[k] = v;
      return Object.keys(rows).length ? rows : undefined;
    }
  }
}

/**
 * THE EFFECTIVE DEFINITIONS a section describes, keyed by identity - the same list the app would
 * end up using, not the edits that produce it.
 *
 * WHY THE APPLIED RESULT AND NOT THE DELTA, which is the decision this whole feature turns on and is
 * written up as CLIP-R1 in the engine map. A delta is a set of edits AGAINST A BASE, so its meaning
 * is not in the delta at all. `{ boilK: 400 }` for "water" against a destination that has no water
 * override is NOT an absent definition to be added - it is a DIFFERENT water from the one the GM
 * already has, and adding it would silently change a definition every body in their campaign reads.
 * Comparing deltas as deltas gets that exactly backwards. It is also unsound across maps: the two
 * sides' deltas were made against two bases, which may be two rule packs or two app versions, so
 * equal deltas can mean different definitions and different deltas the same one.
 *
 * `pack` is the DESTINATION's pack for the destination's own overrides, and the same pack for the
 * incoming ones - deliberately, because the question being asked is what these edits would mean HERE.
 */
export function effectiveDefinitions(
  section: SectionDef,
  overrides: RulePackOverrides | undefined | null,
  pack: RulePack | null | undefined
): Map<string, any> {
  const out = new Map<string, any>();
  const value = overrides?.[section.key] as any;
  if (value === undefined || value === null) return out;
  switch (section.shape) {
    case 'list':
    case 'weighted':
      for (const row of Array.isArray(value) ? value : []) {
        const id = section.idOf?.(row);
        if (id) out.set(id, row);
      }
      return out;
    case 'record':
      for (const [k, v] of Object.entries(value as Record<string, any>)) out.set(k, v);
      return out;
    case 'delta': {
      // The whole point: base + delta, through the ONE function that already knows how a delta is
      // laid over a list, including a deleted field and a reordered hierarchy.
      const base = section.base?.(pack) ?? [];
      const keyOf = (r: any) => String(section.idOf?.(r) ?? '');
      // A delta names only what it CHANGES, so the applied list also carries every untouched base
      // record. Those are not this override's definitions - they are the pack's - and reporting them
      // as arriving would credit a paste with every liquid in the game. Narrow to the keys the
      // override actually speaks about.
      const spoken = new Set<string>(
        Array.isArray(value)
          ? value.map(keyOf)
          : [...Object.keys(value.entries ?? {}), ...((value.order ?? []) as string[])]
      );
      for (const record of applyListDelta(base, value, keyOf)) {
        const id = keyOf(record);
        if (id && spoken.has(id)) out.set(id, record);
      }
      return out;
    }
    case 'scalars':
      // No identity, so the FIELD is the identity: `captureWeight` is one setting a GM can have set
      // differently, and comparing the bag whole would make one changed weight rename all six.
      for (const [k, v] of Object.entries(value as Record<string, any>)) out.set(k, v);
      return out;
  }
}

/**
 * "2 liquids and an engine definition" - one phrase builder, used by the label a GM reads BEFORE a
 * paste and by the report they read AFTER it.
 *
 * Two sentences about the same set of definitions, worded two ways, is the small drift this repo
 * keeps writing rules about: they would disagree the first time a section was added.
 */
export function phraseCounts(counts: ReadonlyMap<keyof RulePackOverrides, number>): string {
  const parts: string[] = [];
  for (const section of SECTIONS) {
    const n = counts.get(section.key) ?? 0;
    if (n <= 0) continue;
    // "an engine definition" rather than "1 engine definition" - the app's voice, and it is what the
    // hub's own example says.
    parts.push(n === 1 ? `${/^[aeiou]/i.test(section.one) ? 'an' : 'a'} ${section.one}` : `${n} ${section.many}`);
  }
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** How many definitions each section actually carries, by the same reckoning the merge will use. */
export function countOverrides(
  overrides: RulePackOverrides | undefined | null,
  pack: RulePack | null | undefined
): Map<keyof RulePackOverrides, number> {
  const counts = new Map<keyof RulePackOverrides, number>();
  for (const section of SECTIONS) {
    const n = effectiveDefinitions(section, overrides, pack).size;
    if (n) counts.set(section.key, n);
  }
  return counts;
}

/** What a clip's rules amount to, in one phrase - "2 liquids and an engine definition". */
export function describeOverrides(
  overrides: RulePackOverrides | undefined | null,
  pack?: RulePack | null
): string {
  return phraseCounts(countOverrides(overrides, pack));
}

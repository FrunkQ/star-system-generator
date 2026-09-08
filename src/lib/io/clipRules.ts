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
import { applyListDelta, makeListDelta, type PackListDelta } from '$lib/rulepackDelta';
import { allLiquids } from '$lib/physics/liquids';
import { allMorphologies } from '$lib/physics/vegetation';
import { allPigments, pigmentModel } from '$lib/physics/pigments';
import { canonicalJson } from './shippedDefaults';
import { buildEffectiveRulePack } from '$lib/rulepack/effectivePack';

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
  /**
   * What THE PACK holds for this section, keyed by identity and in pack order.
   *
   * Two jobs, and they are why this exists for every shape rather than only the delta ones: it is
   * the base an incoming delta is laid against, AND - asked of the destination's EFFECTIVE pack -
   * it is the answer to "what does this campaign use for that definition today?". The second is
   * what makes IDENTICAL mean the right thing: a clip carrying the shipped `water` unchanged must
   * compare identical against a campaign that has no water override at all, because that campaign
   * IS using the shipped water. Comparing against the destination's overrides alone would call it
   * absent and add a redundant override that freezes the definition for good.
   */
  readonly fromPack: (pack: RulePack | null | undefined) => Map<string, any>;
  /**
   * WHICH DEFINITIONS OF THIS SECTION A NODE NAMES, and how to point it somewhere else.
   *
   * This is the engine knowledge the hub deliberately declined to encode - "a hub that guessed would
   * quietly stop carrying a liquid the day somebody named one a new way". It is ONE table entry per
   * section because two callers need it and they must agree: the RENAME has to repoint the pasted
   * nodes at the new name, and the NARROWING has to know what the nodes reference at all.
   *
   * ABSENT MEANS NOT REFERENCED BY NAME, and that is a real answer rather than a gap. Nothing names
   * a pigment: pigments are SCORED across the whole pack, so a pigment override reaches a pasted
   * world through the set and not through a field. Same for `pigmentModel` and for an atmosphere
   * preset, which is a template a body was made from rather than a link it keeps.
   */
  readonly namedBy?: (node: any) => string[];
  readonly repoint?: (node: any, from: string, to: string) => void;
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
/** The morphology key a biosphere layer names, in either of the two forms a save may carry. */
const morphKey = (layer: any): string | undefined =>
  typeof layer === 'string' ? layer : (typeof layer?.morphology === 'string' ? layer.morphology : undefined);

const nonEmpty = (...ids: (string | undefined)[]): string[] =>
  ids.filter((s): s is string => typeof s === 'string' && !!s);

const byId = (rows: any[] | undefined, idOf: (r: any) => string | undefined): Map<string, any> => {
  const out = new Map<string, any>();
  for (const r of rows ?? []) { const id = idOf(r); if (id) out.set(id, r); }
  return out;
};
const asMap = (record: Record<string, any> | undefined): Map<string, any> =>
  new Map(Object.entries(record ?? {}));

export const SECTIONS: readonly SectionDef[] = [
  { key: 'fuelDefinitions', shape: 'list', idOf: (r) => r?.id, one: 'fuel definition', many: 'fuel definitions',
    fromPack: (p) => byId((p as any)?.fuelDefinitions?.entries, (r) => r?.id),
    // A tank names its fuel - and so does an ENGINE DEFINITION, which is why the rename below has to
    // reach the incoming definitions as well as the nodes.
    namedBy: (n) => nonEmpty(...(n?.fuel_tanks ?? []).map((t: any) => t?.fuel_type_id)),
    repoint: (n, from, to) => { for (const t of n?.fuel_tanks ?? []) if (t?.fuel_type_id === from) t.fuel_type_id = to; } },
  { key: 'engineDefinitions', shape: 'list', idOf: (r) => r?.id, one: 'engine definition', many: 'engine definitions',
    fromPack: (p) => byId((p as any)?.engineDefinitions?.entries, (r) => r?.id),
    namedBy: (n) => nonEmpty(...(n?.engines ?? []).map((e: any) => e?.engine_id)),
    repoint: (n, from, to) => { for (const e of n?.engines ?? []) if (e?.engine_id === from) e.engine_id = to; } },
  { key: 'sensorDefinitions', shape: 'list', idOf: (r) => r?.id, one: 'sensor definition', many: 'sensor definitions',
    fromPack: (p) => byId((p as any)?.sensorDefinitions?.entries, (r) => r?.id),
    namedBy: (n) => nonEmpty(...(n?.sensors ?? []).map((s: any) => s?.definition_id)),
    repoint: (n, from, to) => { for (const s of n?.sensors ?? []) if (s?.definition_id === from) s.definition_id = to; } },
  { key: 'gasPhysics', shape: 'record', idOf: (r) => r?.__key, one: 'gas', many: 'gases',
    fromPack: (p) => asMap((p as any)?.gasPhysics),
    // The gas NAMES are the keys of the mixture, and the values are fractions - so a repoint moves
    // the fraction to the new key rather than editing a string.
    namedBy: (n) => Object.keys(n?.atmosphere?.composition ?? {}),
    repoint: (n, from, to) => {
      const c = n?.atmosphere?.composition;
      if (c && from in c) { c[to] = c[from]; delete c[from]; }
    } },
  { key: 'atmosphereCompositions', shape: 'weighted', idOf: (r) => r?.value?.name, one: 'atmosphere preset', many: 'atmosphere presets',
    fromPack: (p) => byId((p as any)?.distributions?.['atmosphere_composition']?.entries, (r) => r?.value?.name) },
  { key: 'liquids', shape: 'delta', idOf: (r) => r?.name, one: 'liquid', many: 'liquids',
    fromPack: (p) => byId(allLiquids(p), (r) => r?.name),
    // `hydrosphere.composition` - the field `liquidDef()` is actually asked for, via
    // `SystemProcessor` and `fluidLayers`. NOTE for anyone comparing against the hub's test clips:
    // those name it `hydrosphere.liquid`, which nothing in this engine reads. Reported on the seam.
    namedBy: (n) => nonEmpty(n?.hydrosphere?.composition),
    repoint: (n, from, to) => { if (n?.hydrosphere?.composition === from) n.hydrosphere.composition = to; } },
  { key: 'morphologies', shape: 'delta', idOf: (r) => r?.key, one: 'morphology', many: 'morphologies',
    fromPack: (p) => byId(allMorphologies(p), (r) => r?.key),
    // Either form a save may carry: a bare string, or a layer record (G19 widened this).
    namedBy: (n) => nonEmpty(...(n?.biosphere?.morphologies ?? []).map(morphKey)),
    repoint: (n, from, to) => {
      const list = n?.biosphere?.morphologies;
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        if (typeof list[i] === 'string') { if (list[i] === from) list[i] = to; }
        else if (list[i]?.morphology === from) list[i].morphology = to;
      }
    } },
  { key: 'pigments', shape: 'delta', idOf: (r) => r?.key, one: 'pigment', many: 'pigments',
    fromPack: (p) => byId(allPigments(p), (r) => r?.key) },
  { key: 'pigmentModel', shape: 'scalars', one: 'pigment model setting', many: 'pigment model settings',
    fromPack: (p) => asMap(pigmentModel(p) as any) }
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
      const base = [...section.fromPack(pack).values()];
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

/**
 * THE THREE ANSWERS, and only one of them is interesting.
 *
 * The owner asked for the middle one by name: *"the receiving end needs to identify duplicates to
 * what it had and discard (i.e. a related object pasted before)."* It is not an edge case - paste a
 * star, then paste one of its planets, and every rule the second clip carries is one the first
 * already brought.
 */
export type Verdict = 'absent' | 'identical' | 'different';

export interface ClipDefinition {
  readonly section: SectionDef;
  readonly id: string;
  readonly verdict: Verdict;
  /** The definition as the clip would have it HERE - the incoming edits applied to this pack. */
  readonly incoming: any;
  /** What this campaign uses today. Absent only when the verdict is `absent`. */
  readonly existing?: any;
}

/**
 * What an incoming clip's rules amount to, definition by definition, against a destination campaign.
 *
 * PER DEFINITION, NEVER PER SECTION. `applyStarmapOverrides` is a shallow section-level spread, right
 * for an editor handing back a whole section and catastrophic here: an incoming `liquids` would
 * replace the GM's entire liquids override rather than joining it. Nothing in this feature goes
 * through that function.
 *
 * THE COMPARISON IGNORES KEY ORDER, and it has to. `{a:1,b:2}` and `{b:2,a:1}` are one definition and
 * two strings, and the order is decided by whatever built the object - a different engine version, a
 * hand-edited save, a round trip through a database. `canonicalJson` is REUSED rather than rewritten:
 * it already sorts keys at every depth and leaves array order alone (a pigment's bands are a
 * sequence; the fields of a band are a set), and it has a measurement behind it. A second
 * canonicaliser is the most obvious way to make this test start disagreeing with itself.
 */
export function compareClipOverrides(
  incoming: RulePackOverrides | undefined | null,
  destination: RulePackOverrides | undefined | null,
  shippedPack: RulePack | null | undefined
): ClipDefinition[] {
  // THE DESTINATION'S EFFECTIVE PACK, through the one function that knows how overrides are applied
  // (`buildEffectiveRulePack`). Asking its overrides alone would be wrong: a campaign with no water
  // override is still USING water, and a clip carrying the shipped water unchanged must compare
  // identical against it rather than adding a redundant override that freezes it for good.
  const destPack = buildEffectiveRulePack(shippedPack, destination) ?? shippedPack;
  const out: ClipDefinition[] = [];
  for (const section of SECTIONS) {
    // The incoming edits are applied against the DESTINATION'S pack, deliberately: the question is
    // not what they meant on the map they came from, it is what they would mean here.
    const arriving = effectiveDefinitions(section, incoming, shippedPack);
    if (!arriving.size) continue;
    const here = section.fromPack(destPack);
    for (const [id, def] of arriving) {
      const existing = here.get(id);
      if (existing === undefined) { out.push({ section, id, verdict: 'absent', incoming: def }); continue; }
      const verdict: Verdict = canonicalJson(def) === canonicalJson(existing) ? 'identical' : 'different';
      out.push({ section, id, verdict, incoming: def, existing });
    }
  }
  return out;
}

/** One definition that arrived under a name the destination already used differently. */
export interface ClipRename {
  readonly section: SectionDef;
  readonly from: string;
  readonly to: string;
  /** True when the destination ALREADY had this renamed copy, so nothing was added for it. */
  readonly reused: boolean;
}

/** One thing that could not be taken and could not be renamed either. */
export interface ClipDeclined {
  readonly section: SectionDef;
  readonly id: string;
  readonly why: string;
}

export interface ClipMerge {
  /** The destination's overrides with everything taken folded in. Undefined when nothing survives. */
  readonly overrides: RulePackOverrides | undefined;
  readonly added: readonly ClipDefinition[];
  readonly renamed: readonly ClipRename[];
  /** Identical to something the destination already had: discarded silently, and rightly. */
  readonly discarded: readonly ClipDefinition[];
  readonly declined: readonly ClipDeclined[];
  /** True when the destination's stored overrides actually changed. */
  readonly changed: boolean;
}

/** "unobtainium (from Contract Reach)" - the source map's own title, which is what a GM recognises. */
function renameFor(id: string, sourceLabel: string | undefined, attempt: number): string {
  const suffix = sourceLabel ? `(from ${sourceLabel})` : '(pasted)';
  return attempt <= 1 ? `${id} ${suffix}` : `${id} ${suffix} ${attempt}`;
}

/** The same definition under a different identity - the one field that IS the name. */
function withId(section: SectionDef, def: any, id: string): any {
  switch (section.key) {
    case 'liquids': return { ...def, name: id };
    case 'morphologies': case 'pigments': return { ...def, key: id };
    case 'atmosphereCompositions': return { ...def, value: { ...def.value, name: id } };
    case 'gasPhysics': return def;                    // the record KEY is the name; the value has none
    default: return { ...def, id };                   // fuel, engine, sensor
  }
}

/** A definition that points at ANOTHER definition follows it when that one is renamed. */
function repointDefinition(renamedSection: SectionDef, def: any, from: string, to: string): void {
  // An engine names its fuel by id. Rename a clashing fuel and leave the engine pointing at the old
  // name, and the GM gets an engine with no fuel - which is the hub's own clip 1 exactly: `q-drive`
  // burns `dt-slush`, and both arrive together.
  if (renamedSection.key === 'fuelDefinitions' && def?.fuel_type_id === from) def.fuel_type_id = to;
}

/**
 * TAKE WHAT IS NEW, DISCARD WHAT IS THE SAME, AND NEVER OVERWRITE WHAT IS DIFFERENT.
 *
 * The third rule is the one that must not be got wrong. Somebody else's "Liquid Unobtainium" is not
 * this GM's, and replacing theirs would silently change bodies they ALREADY HAD - turning a quiet
 * wrong answer on one pasted planet into a quiet wrong answer across a whole campaign. So a clash
 * renames the INCOMING one and the pasted nodes are repointed at the new name; the destination's own
 * definition is never touched.
 *
 * PASTING THE SAME CLIP TWICE MUST BE A NO-OP, and that is why a rename looks for its own previous
 * result before minting another. The second paste of a conflicting clip finds
 * "unobtainium (from Contract Reach)" already there and identical, reuses it, and adds nothing.
 *
 * `opts.nodes` are the pasted nodes, MUTATED IN PLACE to follow any rename. They are already private
 * copies by the time this is called - `cloneClipNodes` has re-minted every id - so this edits the
 * copies and never the clip or the campaign.
 */
export function mergeClipOverrides(
  incoming: RulePackOverrides | undefined | null,
  destination: RulePackOverrides | undefined | null,
  shippedPack: RulePack | null | undefined,
  opts: { sourceLabel?: string; nodes?: any[] } = {}
): ClipMerge {
  const comparisons = compareClipOverrides(incoming, destination, shippedPack);
  const added: ClipDefinition[] = [];
  const renamed: ClipRename[] = [];
  const discarded: ClipDefinition[] = [];
  const declined: ClipDeclined[] = [];

  // Everything is decided against the destination as it stands. `here` is a RUNNING copy, because a
  // rename has to see the names that earlier definitions in the same paste have already taken.
  const destPack = buildEffectiveRulePack(shippedPack, destination) ?? shippedPack;
  const here = new Map<SectionDef, Map<string, any>>();
  const takeUp = new Map<SectionDef, Map<string, any>>();
  for (const section of SECTIONS) here.set(section, new Map(section.fromPack(destPack)));

  const remember = (section: SectionDef, id: string, def: any) => {
    here.get(section)!.set(id, def);
    if (!takeUp.has(section)) takeUp.set(section, new Map());
    takeUp.get(section)!.set(id, def);
  };

  for (const row of comparisons) {
    const { section, id, verdict, incoming: def } = row;
    if (verdict === 'identical') { discarded.push(row); continue; }
    if (verdict === 'absent') { remember(section, id, def); added.push(row); continue; }

    // DIFFERENT. A scalar cannot be renamed - `captureWeight` IS the name - so the honest answer is
    // to keep the GM's and SAY SO, rather than overwrite in silence or refuse the paste. Steer, do
    // not stop: the body still arrives.
    if (section.shape === 'scalars') {
      declined.push({ section, id, why: `${id} is set differently in this campaign, and a setting cannot be renamed - yours was kept` });
      continue;
    }

    const existing = here.get(section)!;
    let taken: string | undefined;
    let reused = false;
    for (let attempt = 1; attempt <= 50; attempt++) {
      const candidate = renameFor(id, opts.sourceLabel, attempt);
      const already = existing.get(candidate);
      if (already === undefined) { taken = candidate; break; }
      // ALREADY HERE, AND THE SAME: this clip has been pasted before. Reuse it and add nothing.
      if (canonicalJson(already) === canonicalJson(withId(section, def, candidate))) {
        taken = candidate; reused = true; break;
      }
    }
    if (!taken) { declined.push({ section, id, why: `${id} could not be given a free name` }); continue; }

    const renamedDef = withId(section, def, taken);
    if (!reused) { remember(section, taken, renamedDef); added.push({ ...row, id: taken, incoming: renamedDef }); }
    renamed.push({ section, from: id, to: taken, reused });
  }

  // THE REPOINT, after every rename is known so one pass settles it. It reaches the incoming
  // DEFINITIONS as well as the nodes, because a definition can name another one.
  for (const r of renamed) {
    for (const node of opts.nodes ?? []) r.section.repoint?.(node, r.from, r.to);
    for (const [, defs] of takeUp) for (const [, d] of defs) repointDefinition(r.section, d, r.from, r.to);
  }

  return {
    overrides: writeBack(destination, takeUp, destPack, shippedPack),
    added, renamed, discarded, declined,
    changed: added.length > 0
  };
}

/**
 * The destination's overrides with the taken definitions folded in - PER DEFINITION, and in the shape
 * each section is actually stored in.
 *
 * THE THREE DELTA SECTIONS ARE WRITTEN BACK AS DELTAS (the owner's decision, 2026-09-08). A whole
 * list would freeze the shipped defaults at the moment of the paste, so every later improvement to
 * the pack would stop reaching that campaign - `rulepackDelta.ts` cost #2, arriving by a paste
 * rather than by an edit.
 */
function writeBack(
  destination: RulePackOverrides | undefined | null,
  takeUp: Map<SectionDef, Map<string, any>>,
  destPack: RulePack | null | undefined,
  shippedPack: RulePack | null | undefined
): RulePackOverrides | undefined {
  if (!takeUp.size) return destination ?? undefined;
  const out: any = { ...(destination ?? {}) };
  for (const [section, defs] of takeUp) {
    if (!defs.size) continue;
    const key = section.key as string;
    switch (section.shape) {
      case 'list':
        // Appended to whatever override was already stored. Never an upsert: nothing here replaces an
        // existing definition, so an id already present cannot reach this point.
        out[key] = [...((destination as any)?.[key] ?? []), ...defs.values()];
        break;
      case 'record':
        out[key] = { ...((destination as any)?.[key] ?? {}), ...Object.fromEntries(defs) };
        break;
      case 'weighted': {
        // A WHOLE-LIST REPLACE section, so the override has to be the whole EFFECTIVE list plus the
        // new entries - writing only the new ones would drop every preset the campaign had.
        out[key] = [...section.fromPack(destPack).values(), ...defs.values()];
        break;
      }
      case 'delta': {
        const base = [...section.fromPack(shippedPack).values()];
        const effective = [...section.fromPack(destPack).values(), ...defs.values()];
        out[key] = makeListDelta(base, effective, (r: any) => String(section.idOf?.(r) ?? ''));
        break;
      }
      case 'scalars':
        out[key] = { ...((destination as any)?.[key] ?? {}), ...Object.fromEntries(defs) };
        break;
    }
    if (out[key] === undefined) delete out[key];
  }
  return Object.keys(out).length ? (out as RulePackOverrides) : undefined;
}

/**
 * SAY WHAT CAME WITH IT, in the app's own voice.
 *
 * "added 2 liquids and an engine definition; renamed unobtainium to unobtainium (from Contract Reach)
 * because you already had one."
 *
 * A GM WHO IS TOLD NOTHING CANNOT TELL THIS FEATURE FROM THE BUG IT FIXES. That is the whole reason
 * this exists: before R-19 a paste that silently dropped a liquid and a paste that silently carried
 * one looked identical from the outside, and so would a paste that silently renamed one.
 *
 * Returns an empty string when there is genuinely nothing to say - the ordinary case of a clip whose
 * rules the campaign already has, which must stay SILENT rather than announcing that it did nothing.
 */
export function describeMerge(merge: ClipMerge): string {
  const clauses: string[] = [];

  if (merge.added.length) {
    const counts = new Map<keyof RulePackOverrides, number>();
    for (const a of merge.added) counts.set(a.section.key, (counts.get(a.section.key) ?? 0) + 1);
    clauses.push(`added ${phraseCounts(counts)}`);
  }

  // Only renames that actually minted a name are worth a sentence. A REUSED one means this clip has
  // been pasted before and the GM has already been told once; saying it again on every repeat paste
  // would be noise about something that did not happen this time.
  const minted = merge.renamed.filter((r) => !r.reused);
  if (minted.length) {
    const listed = minted.slice(0, 3).map((r) => `${r.from} to ${r.to}`).join(', ');
    const rest = minted.length > 3 ? ` and ${minted.length - 3} more` : '';
    clauses.push(`renamed ${listed}${rest} because you already had ${minted.length === 1 ? 'one' : 'those'}`);
  }

  // WHAT COULD NOT BE TAKEN IS SAID TOO. Steer, do not stop: the paste succeeded, and the one thing
  // it could not carry is named rather than swallowed.
  if (merge.declined.length) {
    clauses.push(`kept your own ${merge.declined.map((d) => d.id).join(', ')}`);
  }

  if (!clauses.length) return '';
  const sentence = clauses.join('; ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

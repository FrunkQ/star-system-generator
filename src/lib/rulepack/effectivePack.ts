// WHAT THIS CAMPAIGN'S RULES ACTUALLY ARE - the shipped pack with the GM's overrides laid over it.
//
// THIS IS A MOVE, NOT A CHANGE. Every line below was lifted verbatim out of the reactive block in
// `src/routes/+page.svelte` and is pinned bit-for-bit against the old expression by
// `effectivePack.spec.ts`, which builds both and deep-equals them over every section. Moving a
// number and changing it are two commits, never one.
//
// WHY IT MOVED (R-19). The question "does this campaign already have that definition, and is it the
// same one?" cannot be answered without this merge, and the merge lived inside a Svelte component
// where nothing else could call it. The next thing that needed it would have written a second copy -
// and two answers to "what are this campaign's liquids?" is not a hypothetical fault here: it is
// exactly what B147 was, twice, in the two editors that each kept their own idea of the same list.
//
// THE ORDER OF THE SECTIONS IS PRESERVED EXACTLY, including the two that look inconsistent and are
// not: `atmosphereCompositions` REPLACES the distribution's entries wholesale (it is not keyed), and
// `liquids` goes through `applyListDelta` even though its editor writes a whole list (D25 made the
// reader accept both). Neither is tidied here; a behaviour change hiding inside a refactor is the
// thing the pin exists to catch.
import type { RulePack, RulePackOverrides } from '$lib/types';
import { applyListDelta } from '$lib/rulepackDelta';
import { allLiquids } from '$lib/physics/liquids';
import { allMorphologies } from '$lib/physics/vegetation';
import { allPigments, pigmentModel } from '$lib/physics/pigments';

/**
 * The pack a campaign actually runs on. Returns a DEEP CLONE and never touches the pack it is given -
 * the shipped rule pack is cached and shared, and mutating it would leak one campaign's rules into
 * the next one loaded.
 */
export function buildEffectiveRulePack(
  selectedRulepack: RulePack | null | undefined,
  overrides: RulePackOverrides | null | undefined
): RulePack | undefined {
  if (!selectedRulepack) return undefined;
  // Deep clone to avoid mutating the original rulepack which might be cached
  const pack = JSON.parse(JSON.stringify(selectedRulepack));

  if (overrides) {
    if (overrides.fuelDefinitions && pack.fuelDefinitions) {
      overrides.fuelDefinitions.forEach((f: any) => {
        const idx = pack.fuelDefinitions.entries.findIndex((d: any) => d.id === f.id);
        if (idx !== -1) pack.fuelDefinitions.entries[idx] = f;
        else pack.fuelDefinitions.entries.push(f);
      });
    }

    if (overrides.engineDefinitions && pack.engineDefinitions) {
      overrides.engineDefinitions.forEach((e: any) => {
        const idx = pack.engineDefinitions.entries.findIndex((d: any) => d.id === e.id);
        if (idx !== -1) pack.engineDefinitions.entries[idx] = e;
        else pack.engineDefinitions.entries.push(e);
      });
    }

    if (overrides.sensorDefinitions && pack.sensorDefinitions) {
      overrides.sensorDefinitions.forEach((s: any) => {
        const idx = pack.sensorDefinitions.entries.findIndex((d: any) => d.id === s.id);
        if (idx !== -1) pack.sensorDefinitions.entries[idx] = s;
        else pack.sensorDefinitions.entries.push(s);
      });
    }

    if (overrides.gasPhysics) {
      pack.gasPhysics = { ...pack.gasPhysics, ...overrides.gasPhysics };
    }

    if (overrides.atmosphereCompositions && pack.distributions?.['atmosphere_composition']) {
      pack.distributions['atmosphere_composition'].entries = overrides.atmosphereCompositions;
    }

    // D25: A DELTA, like the two below it, and it used to be a WHOLE-LIST REPLACE. That was the
    // odd one out of three list overrides, and it made shipping a definition WITH a starmap
    // impossible without either dropping every liquid the map did not name or freezing all of
    // them against later improvements (`rulepackDelta.ts` cost #2). `applyListDelta` takes a
    // plain array as it stands, so every campaign saved before this is unaffected.
    if (overrides.liquids) {
      pack.liquids = applyListDelta(allLiquids(pack), overrides.liquids, (l: any) => l.name);
    }

    // DELTAS laid over the pack's own lists, so anything the GM never touched keeps tracking
    // the shipped defaults. applyListDelta also accepts a whole list, which is what campaigns
    // saved before this carry.
    if (overrides.morphologies) {
      pack.morphologies = applyListDelta(allMorphologies(pack), overrides.morphologies, (m) => m.key);
    }
    if (overrides.pigments) {
      pack.pigments = applyListDelta(allPigments(pack), overrides.pigments, (p) => p.key);
    }
    if (overrides.pigmentModel) {
      pack.pigmentModel = { ...pigmentModel(pack), ...overrides.pigmentModel };
    }
  }
  return pack;
}

/**
 * THE PACK A CAMPAIGN IS DERIVED AGAINST WHEN IT IS LOADED - its own rules, not just the shipped ones.
 *
 * Every campaign load (a file, the browser's autosave, a base-map upgrade) strips each system's
 * derived data and re-derives it. Until 3.1.1 that re-derive ran against the SHIPPED pack, so a world
 * breathing a custom gas over an ocean of a custom liquid came back coloured, heated and tagged as
 * though neither existed - 49 derived fields different on the test world, the ocean and sky colours
 * among them - and stayed that way on the starmap, in All Bodies and for players until the GM
 * happened to open that system (the system view derives against the effective pack and converges).
 * The definitions were never lost; the worlds just did not look like it. Same rule as DATA-R48's
 * third point, at the campaign's own door: the rules are known BEFORE the first pass, never after.
 *
 * Falls back to the shipped pack, so a caller always has something to process against.
 */
export function campaignRulePack<P extends RulePack | null | undefined>(
  shippedPack: P,
  campaign: { rulePackOverrides?: RulePackOverrides | null } | null | undefined
): RulePack | P {
  if (!shippedPack || !campaign?.rulePackOverrides) return shippedPack;
  // A LOAD MUST NEVER FAIL BECAUSE OF THIS. A hand-edited or damaged file can carry a section in a
  // shape the merge cannot walk; before 3.1.1 such a campaign still opened (derived against the
  // shipped pack), and it still does.
  try {
    return buildEffectiveRulePack(shippedPack, campaign.rulePackOverrides) ?? shippedPack;
  } catch (e) {
    console.warn('[rules] this campaign\'s custom rules could not be applied while loading; using the shipped pack', e);
    return shippedPack;
  }
}

/**
 * WHAT A SETTINGS EDITOR HANDS BACK, FOLDED INTO THE CAMPAIGN'S OVERRIDES - section by section.
 *
 * Lifted verbatim out of `applyStarmapOverrides` in `src/routes/+page.svelte` (3.1.1), for the same
 * reason the merge above moved: the question "does a second custom gas delete the first?" is only
 * answered by the editor's save AND this fold together, and a gate cannot drive a function that
 * lives inside the page component - it would have had to carry its own copy.
 *
 * IT IS A SHALLOW, SECTION-LEVEL SPREAD, and that is the contract every editor is written against:
 * a section an editor names REPLACES what was stored, a section it does not name is left alone, and
 * a section it names as `undefined` is REMOVED ("no override at all" - the GM changed nothing, or
 * changed it back; storing an empty one would accumulate overrides that say nothing and read as if
 * they said something). So an editor must hand back EVERYTHING it wants kept in a section it names -
 * which is why each one is mounted on the SHIPPED pack (DATA-R47). Right for an editor; never the
 * door for a paste or a loaded file, which join per DEFINITION (`io/clipRules.ts`).
 */
export function applyEditorOverrides(
  stored: RulePackOverrides | null | undefined,
  handedBack: Partial<Record<keyof RulePackOverrides, unknown>> | null | undefined
): RulePackOverrides {
  const next: any = { ...stored, ...handedBack };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next;
}

// A SAVED SYSTEM CARRIES THE RULES ITS CAMPAIGN MADE - the 3.1.1 emergency fix, file half.
//
// Custom definitions - gases, liquids, atmosphere mixes, fuels, engines, sensors, morphologies,
// pigments - do not live on a body. They live on the STARMAP, in `rulePackOverrides`. So a system
// saved on its own ("Save System") was written WITHOUT them, and loading that file into another
// campaign, or into a new one, gave back worlds that still NAMED a custom gas whose definition was
// nowhere. Nothing failed and nothing warned: the atmosphere listed the molecule, and the gas, the
// liquid, the drive and the sensor had simply ceased to exist. That is "every single custom thing we
// created from engines to biospheres gets deleted", and the report with the telling detail - "the
// planets' atmospheres with custom molecules were unchanged".
//
// The owner, 2026-10-04: "They are only saved with star maps. Not system level." And the next day,
// accepting it as a bug: "it may be worth duplicating at save time." THIS IS THAT.
//
// IT IS R-19 WITH A FILE WHERE THE CLIPBOARD WAS, and it deliberately adds no mechanism of its own:
//
//  - THE KEY IS THE ONE A CAMPAIGN AND A CLIP ALREADY USE, `rulePackOverrides`, in the same shape. A
//    reader that does not know it on a system ignores it; a system file from before this has none and
//    loads exactly as it did.
//  - THE WHOLE BAG TRAVELS, not the part this system's objects name (DATA-R50: narrowing wrong is a
//    silent wrong answer, and three sections cannot be narrowed at all). It goes through
//    `readClipOverrides`, the reader's own shape check, so a save cannot write what a load would drop.
//  - THE LOAD JOINS, IT NEVER REPLACES (DATA-R48): a definition the campaign lacks is added, one it
//    already has identically is dropped in silence, and one it has DIFFERENTLY arrives under a new
//    name with the loaded objects repointed at it. The destination's own definition is never touched.
//  - AND IT SAYS WHAT IT DID, through `describeMerge` - a load that silently carried rules would be
//    indistinguishable from the bug it fixes.
//
// A SHIPPED CAMPAIGN FILE GETS THE SAME TREATMENT when a single system is taken out of it (the
// wizard's "load a system from a file" takes a campaign's first system): the campaign's overrides
// were sitting at the top of that file all along and were being left behind.
//
// NOT CARRIED: a PLAYER save. That file is what a GM hands to players, and the campaign's whole
// rules bag would name every drive and sensor in it, hidden ships' included. It is written exactly
// as before; whether it should carry the rules its VISIBLE objects name is the owner's call.
import type { RulePack, RulePackOverrides } from '$lib/types';
import type { ClassifiedSaveFile } from './classify';
import { describeMerge, mergeClipOverrides, readClipOverrides, type ClipMerge } from './clipRules';
import { buildEffectiveRulePack } from '$lib/rulepack/effectivePack';

/** The rules a save brought with it, and whose they are. */
export interface CarriedRules {
  readonly overrides: RulePackOverrides;
  /** The saved system's or campaign's own name - what a renamed definition is labelled "(from ...)". */
  readonly label?: string;
}

/**
 * A system document ready to write, with the campaign's custom definitions beside its nodes.
 * Returns the document UNCHANGED when the campaign has none, so an ordinary system file does not
 * grow an empty key.
 */
export function withCampaignRules<T extends object>(systemDoc: T, campaign: RulePackOverrides | null | undefined): T {
  const overrides = readClipOverrides(campaign);
  return overrides ? { ...systemDoc, rulePackOverrides: overrides } : systemDoc;
}

/**
 * THE RULES A CLASSIFIED SAVE CARRIES, taken OFF a system document on the way.
 *
 * Taken off because a system lives INSIDE a campaign: left on, the key would ride into the store,
 * be written back out inside every later campaign save, and become a second, stale copy of rules
 * whose only home is the starmap. A campaign document keeps its own - it IS the home.
 */
export function takeCarriedRules(classified: ClassifiedSaveFile): CarriedRules | undefined {
  const doc = classified.doc;
  if (!doc || typeof doc !== 'object' || classified.kind === 'unknown') return undefined;
  const overrides = readClipOverrides(doc.rulePackOverrides);
  if (classified.kind === 'system') delete doc.rulePackOverrides;
  if (!overrides) return undefined;
  const label = typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : undefined;
  return { overrides, ...(label ? { label } : {}) };
}

export interface LandedRules {
  /** What the campaign's `rulePackOverrides` should now be. The campaign's own, when nothing changed. */
  readonly overrides: RulePackOverrides | undefined;
  /** The pack to process the arriving system against - the campaign's rules WITH what was taken. */
  readonly pack: RulePack;
  /** What to tell the GM, or '' when there is genuinely nothing to say. */
  readonly note: string;
  readonly merge: ClipMerge;
}

/**
 * FOLD A SAVE'S RULES INTO THE CAMPAIGN RECEIVING IT - before the system is processed, never after
 * (DATA-R48: every derived quantity reads the effective pack, so a world whose ocean names a custom
 * liquid has to be processed against a pack that already knows it).
 *
 * `nodes` are the arriving system's nodes, MUTATED IN PLACE to follow a rename. `shippedPack` must be
 * the pack WITHOUT the campaign's overrides: the delta sections are written back against it.
 *
 * Writes nothing itself. The caller owns the campaign write, so a load is still one store
 * transaction and a refused load leaves the campaign exactly as it was.
 */
export function landCarriedRules(
  carried: CarriedRules | undefined,
  destination: RulePackOverrides | null | undefined,
  shippedPack: RulePack,
  nodes: any[] | undefined
): LandedRules {
  const merge = mergeClipOverrides(carried?.overrides, destination, shippedPack, { sourceLabel: carried?.label, nodes });
  return {
    overrides: merge.overrides,
    pack: buildEffectiveRulePack(shippedPack, merge.overrides) ?? shippedPack,
    note: describeMerge(merge),
    merge
  };
}

// B112 — WHAT A SAVE CARRIES BESIDE THE CAMPAIGN, in one place both export paths call.
//
// The registries used to be assembled inline at two call sites in `routes/+page.svelte` (the normal
// save and the red-zone crash save), each spelling out `poiPacks: packsForStarmap(), reasonsConfig:
// get(reasonsConfig), coiCategories: coiForStarmap()`. Two copies of one decision, in a Svelte route
// where nothing could test either of them — so the rule below is here instead, and the route asks.
//
// THE RULE: a save carries what the GM MADE. An entry identical to what this app ships is not the
// GM's, and a container with nothing in it is not a statement — `poiPacks: []` in every save on
// record says "this campaign has no packs", which is not something anyone chose to record. Omit the
// key and let absence mean absence.
import { coiForStarmap } from '$lib/constructs/coi';
import { packsForStarmap, reasonsConfigForStarmap } from '$lib/physics/reasonsToVisit';

export interface StarmapRegistries {
  poiPacks?: unknown[];
  reasonsConfig?: unknown;
  coiCategories?: unknown[];
}

export function registriesForStarmap(): StarmapRegistries {
  const out: StarmapRegistries = {};
  const packs = packsForStarmap();
  if (packs.length) out.poiPacks = packs;
  const reasons = reasonsConfigForStarmap();
  if (reasons) out.reasonsConfig = reasons;
  const cois = coiForStarmap();
  if (cois.length) out.coiCategories = cois;
  return out;
}

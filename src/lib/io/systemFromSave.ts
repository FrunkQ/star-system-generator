import type { RulePack, System } from '$lib/types';
import type { ClassifiedSaveFile } from './classify';
import { importEmbeddedModels } from '$lib/constructs/modelTransfer';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { takeCarriedRules, type CarriedRules } from './systemRules';

// A CLASSIFIED SAVE TO A SYSTEM THAT CAN BE PLACED ON THE MAP - one answer for every door that places one.
//
// The generation wizard took a saved file this way (G42: a system, or a campaign's first system, in
// either container); R-18 (Stream AA job 3) added two more ways a single system arrives to be placed
// at a spot the GM chooses - picked from the wizard's Explorers list, and delivered by an "Add System
// to SSE" link. Three ways of getting bytes, one thing that happens to them, so the three cannot come
// to disagree about what a placeable system is.
//
// Classification is the CALLER'S, deliberately: `openHubBytes` already classifies whatever a link
// fetched (the one door, DATA-R35), and a second classification of the same bytes would be a second
// answer to "what is this file?". Embedded models go into the local store here, because a system that
// names a model it did not bring would draw as a glyph. The system comes back FIXED UP and NOT
// processed: the caller processes it against the pack of the campaign receiving it.
//
// AND THE RULES THE SAVE CARRIES COME BACK BESIDE IT (3.1.1, `systemRules.ts`): the custom gases,
// liquids, drives and the rest that the system's campaign made. A system file has carried them since
// 3.1.1; a CAMPAIGN file always had them at its top, and this door used to take the first system and
// leave them behind - a world naming a gas whose definition never arrived. They are handed back
// rather than merged here because the merge needs the campaign receiving them, which is the caller's.
export async function systemFromSave(
  classified: ClassifiedSaveFile,
  pack: RulePack
): Promise<{ ok: true; system: System; rules?: CarriedRules } | { ok: false; problem: string }> {
  if (classified.kind === 'unknown') {
    return { ok: false, problem: 'This file is not a Star System Explorer save.\n\n' + (classified.problem ?? '') };
  }
  if (classified.container === 'bundle') await importEmbeddedModels(classified.models).catch(() => 0);
  // Taken OFF a system document before it becomes a system: the rules belong on the campaign.
  const rules = takeCarriedRules(classified);
  const raw = classified.kind === 'system' ? classified.doc : classified.doc?.systems?.[0]?.system;
  if (!raw || !Array.isArray(raw.nodes)) {
    return { ok: false, problem: 'This campaign (starmap) file has no loadable system in it.' };
  }
  return { ok: true, system: fixUpImportedSystem(raw as System, pack), ...(rules ? { rules } : {}) };
}

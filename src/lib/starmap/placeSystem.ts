import type { ContentCredit, Starmap, StarSystemNode, System } from '$lib/types';
import { uniqueSystemId } from './systemIds';
import { parseClockSeconds } from '$lib/temporal/utre';
import { defaultCampaignStartSeconds } from '$lib/temporal/defaults';
import { addContentCredit } from '$lib/io/hubClip';

// PUT A PROCESSED SYSTEM ON THE MAP, AT A POSITION - one function for every door that does it.
//
// Two doors did this and one of them said so of the other: "paste as a new system" on the starmap
// (`pasteClipAsNewSystem`) described itself as landing "through the SAME door the generation wizard
// uses (`placeGeneratedSystem`)" - while building its own node, its own clock stamp and its own
// credit merge beside that function's. They had not drifted yet. They were about to: R-18 (Stream AA
// job 3) sends a system DOWNLOADED from Explorers through the wizard, and that system earns the same
// campaign credit a pasted one does. Adding the credit to one copy would have left the other copy's
// idea of "placing a system" missing it, or the next change to either missing from the other.
//
// So both routes call this. It takes the first free spelling of the system's id ([[A107]] - the
// bundled Sols share one), stamps the node with the campaign's display clock as both did, and puts
// every credit it is handed on the CAMPAIGN through `addContentCredit` (R-16), which merges a second
// placement from the same map into one row. It returns a NEW map, the store's own discipline, and
// never touches the system's contents: what arrives was processed by the caller against the pack
// that caller chose.
export function placeSystemOnMap<M extends Starmap>(
  map: M,
  system: System,
  position: StarSystemNode['position'],
  credits: ReadonlyArray<ContentCredit | undefined> = []
): { map: M; id: string } {
  const id = uniqueSystemId(system.id, map.systems.map((s) => s.id));
  const placed = id === system.id ? system : { ...system, id };
  const displayTimeSec = parseClockSeconds(map.temporal?.displayTimeSec, defaultCampaignStartSeconds()).toString();
  const node: StarSystemNode = { id, name: placed.name, position, system: placed, time: { displayTimeSec } };
  let next = { ...map, systems: [...map.systems, node] } as M;
  for (const credit of credits) next = addContentCredit(next, credit);
  return { map: next, id };
}

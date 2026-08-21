// Naming what an undo step will actually take back: "Mass of Earth", "Deleted Luna II".
//
// WHY IT IS A DIFF AND NOT A LABEL PASSED IN AT THE CALL SITE: there are ~145 places that mutate a
// body and 109 that announce it, and none of them knows it is being recorded - that is the whole
// point of the shadow design (see `systemUndo.ts`). The shadow already holds the BEFORE state, so
// the name of the change is derivable at no extra cost rather than being something every editor has
// to remember to declare.
//
// THIS FILE IS PRESENTATION AND NOTHING ELSE. The map below is a phrasebook for words a GM reads;
// it is NOT a definition of which fields are authored - that lives in exactly one place,
// `importFixup.DERIVED_FIELDS` + `stripBody`, and this file never sees a derived field because it
// is handed two authored slices. A missing entry costs a clumsier word, never a wrong undo.

import type { CelestialBody, System } from '$lib/types';
import type { StarmapShell } from './starmapUndo';

/** Only where the honest word differs from the field name. Everything else is humanised below. */
const PHRASE: Record<string, string> = {
  makeup: 'composition',
  classes: 'type',
  image: 'picture',
  autoClassify: 'type lock',
  object_playerhidden: 'player visibility',
  description_playerhidden: 'description visibility',
  gmNotes: 'GM notes',
  scheduled_journeys: 'flight plan',
  flight_log: 'flight log',
  radiationOutput: 'luminosity',
  ui_parentId: 'host',
  parentId: 'host',
  isNameUserDefined: 'name',
  overrides: 'overrides',
  color: 'colour',
  colour: 'colour'
};

/** `axial_tilt_deg` -> "axial tilt", `massKg` -> "mass", `rotation_period_hours` -> "rotation period". */
function humanise(key: string): string {
  if (PHRASE[key]) return PHRASE[key];
  let s = key
    .replace(/_(deg|hours|kg|km|km2|s|days|ms|au|k)$/i, '')
    .replace(/(Kg|Km|Sec|Ms|Deg|Hours|Days|K)$/, '');
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return s.trim().toLowerCase();
}

function nameOf(node: { name?: string; id: string }): string {
  return node.name || 'a body';
}

/** A list a person would say out loud: "a, b and c". */
function join(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

function sentenceCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function changedKeys(a: any, b: any): string[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out.push(k);
  }
  return out;
}

/**
 * A short phrase for the change between two AUTHORED slices, for the undo button's tooltip.
 * Returns '' when it cannot tell - the caller falls back to a plain "Undo the last edit", which is
 * always true.
 */
export function describeSystemChange(before: System | null, after: System | null, focusId?: string | null): string {
  if (!before || !after) return '';
  const beforeNodes = new Map((before.nodes ?? []).map((n: any) => [n.id, n]));
  const afterNodes = new Map((after.nodes ?? []).map((n: any) => [n.id, n]));

  const added = [...afterNodes.keys()].filter((id) => !beforeNodes.has(id));
  const removed = [...beforeNodes.keys()].filter((id) => !afterNodes.has(id));

  // Structure first: adding and deleting are the edits a GM most wants named.
  if (removed.length === 1 && added.length === 0) return `Deleted ${nameOf(beforeNodes.get(removed[0]) as any)}`;
  if (added.length === 1 && removed.length === 0) return `Added ${nameOf(afterNodes.get(added[0]) as any)}`;
  if (removed.length > 1 && added.length === 0) return `Deleted ${removed.length} bodies`;
  if (added.length > 1 && removed.length === 0) return `Added ${added.length} bodies`;
  if (added.length || removed.length) return `Added ${added.length}, deleted ${removed.length}`;

  // Then field edits, body by body.
  const touched: Array<{ id: string; name: string; fields: string[] }> = [];
  for (const [id, beforeNode] of beforeNodes) {
    const afterNode = afterNodes.get(id) as CelestialBody | undefined;
    if (!afterNode) continue;
    const fields = changedKeys(beforeNode, afterNode);
    if (fields.length) touched.push({ id: String(id), name: nameOf(afterNode as any), fields });
  }

  // THE FOCUSED BODY IS THE CAUSE; ANY OTHER IS A CONSEQUENCE - and naming the cause is the honest
  // description of what the GM did. Give Earth mass and the engine re-derives Luna's rotation period
  // (it is tidally locked), so a pure diff reports "Edits to 2 bodies" for a single slider drag.
  // The GM's selection is information the diff cannot have, so the caller supplies it.
  //
  // NOTE the second reason that diff is noisier than it should be, which is NOT undo's to fix: a
  // fair few fields the processor writes are missing from `importFixup.DERIVED_FIELDS`
  // (`orbitalRadiation`, `irradiationDose`, `volatiles`, `surfaceSpectrum`, `vegetation`,
  // `beltInnerEdgeRadii`, `magneticField`, and `hazard/*` tags), so they survive a strip that exists
  // to remove exactly that. Reported as a finding; when it is fixed this heuristic gets quieter and
  // every saved file gets smaller.
  const focused = focusId ? touched.find((t) => t.id === focusId) : undefined;
  const named = touched.length === 1 ? touched[0] : focused;
  if (named) {
    const { name, fields } = named;
    // MORE THAN THREE FIELDS IS NOT NINE EDITS, AND MUST NOT BE READ AS ONE. Because of the drift
    // noted above, one mass drag moves eight or nine fields on the same body, most of them derived
    // values that only look authored. Counting them would put "9 changes to Earth" on a tooltip for
    // a single slider drag - alarming, and false. "Edit to Earth" is exactly true either way.
    if (fields.length > 3) return `Edit to ${name}`;
    return sentenceCase(`${join(fields.map(humanise))} of ${name}`);
  }
  if (touched.length > 1) return `Edits to ${touched.length} bodies`;

  // Nothing on a body: the system's own fields (its name, description, GM notes, tags).
  const systemFields = changedKeys(
    { ...before, nodes: undefined },
    { ...after, nodes: undefined }
  ).filter((k) => k !== 'nodes' && k !== 'isManuallyEdited');
  if (systemFields.length === 1) return sentenceCase(`${humanise(systemFields[0])} of the system`);
  if (systemFields.length > 1) return `${systemFields.length} changes to the system`;
  return '';
}

/**
 * The same job for the CAMPAIGN's layout - moving, renaming, adding or deleting a system, the
 * routes, the map's own description and notes. Same contract: '' when it cannot tell.
 */
export function describeStarmapChange(before: StarmapShell | null, after: StarmapShell | null): string {
  if (!before || !after) return '';
  const b = new Map(before.systems.map((s) => [s.id, s]));
  const a = new Map(after.systems.map((s) => [s.id, s]));
  const added = [...a.keys()].filter((id) => !b.has(id));
  const removed = [...b.keys()].filter((id) => !a.has(id));

  if (removed.length === 1 && !added.length) return `Deleted ${b.get(removed[0])!.name || 'a system'}`;
  if (added.length === 1 && !removed.length) return `Added ${a.get(added[0])!.name || 'a system'}`;
  if (removed.length > 1 && !added.length) return `Deleted ${removed.length} systems`;
  if (added.length > 1 && !removed.length) return `Added ${added.length} systems`;
  if (added.length || removed.length) return `Added ${added.length}, deleted ${removed.length}`;

  const moved: string[] = [];
  const renamed: string[] = [];
  const resectored: string[] = [];
  for (const [id, was] of b) {
    const now = a.get(id)!;
    if (JSON.stringify(was.position) !== JSON.stringify(now.position)) moved.push(now.name);
    if (was.name !== now.name) renamed.push(now.name);
    if (was.subsectorId !== now.subsectorId) resectored.push(now.name);
  }
  if (renamed.length === 1) return `Renamed ${renamed[0]}`;
  if (renamed.length > 1) return `Renamed ${renamed.length} systems`;
  if (moved.length === 1) return `Moved ${moved[0]}`;
  if (moved.length > 1) return `Moved ${moved.length} systems`;
  if (resectored.length === 1) return `Subsector of ${resectored[0]}`;
  if (resectored.length > 1) return `Subsector of ${resectored.length} systems`;

  if (JSON.stringify(before.routes) !== JSON.stringify(after.routes)) {
    const d = (after.routes?.length ?? 0) - (before.routes?.length ?? 0);
    if (d > 0) return d === 1 ? 'Added a route' : `Added ${d} routes`;
    if (d < 0) return -d === 1 ? 'Deleted a route' : `Deleted ${-d} routes`;
    return 'Edited a route';
  }
  if (before.name !== after.name) return 'Name of the starmap';
  if (before.description !== after.description) return 'Description of the starmap';
  if (before.gmNotes !== after.gmNotes) return 'GM notes of the starmap';
  return '';
}

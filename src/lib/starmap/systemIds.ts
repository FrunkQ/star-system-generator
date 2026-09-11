import type { StarSystemNode } from '$lib/types';

// A SYSTEM'S ID MUST BE UNIQUE ON ITS MAP, AND THE BUNDLED EXAMPLES SHARE THEIRS (A107).
//
// The shipped Sol examples (`Sol_2030-System.json`, `Sol_Expanse-System.json`) both carry the STABLE id
// `solar-system` - deliberately, so a real-astronomy rebuild can find its own systems again. The wizard
// dropped a system on the map with its id verbatim, so the second Sol duplicated the first's id, the
// save wrote it without complaint, and the next load refused the WHOLE campaign with "Duplicate System
// ID". The owner's own map did exactly that on 2026-09-11, and the hub it was uploaded to lost every
// body of both Sols to a unique-key clash while listing them in the counts.
//
// Two jobs, one rule: a NEW system takes the first free spelling of its id at the door, and a map that
// already carries duplicates is REPAIRED on load rather than refused - the second keeps its bodies and
// gains a suffix, and the loader says so. Steer, don't stop.
//
// The suffix is `-2`, `-3`, ...: readable, stable across reloads once saved, and the same shape the hub
// gives a second `my-starmap`. Routes and journeys name systems by id, so the FIRST occurrence keeps the
// original id and anything pointing at it still resolves; a route that meant the second one cannot be
// told apart from one that meant the first, which is the one thing this cannot repair.

export function uniqueSystemId(id: string, taken: Iterable<string>): string {
  const have = taken instanceof Set ? taken : new Set(taken);
  if (!have.has(id)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}-${n}`;
    if (!have.has(candidate)) return candidate;
  }
}

export interface SystemIdRename { from: string; to: string; name: string }

/**
 * Keeps the first system with a given id as it is and re-ids every later duplicate, outer and inner
 * (`system.id`, when it matched). Returns the SAME array when nothing was duplicated, so a caller can
 * test identity to know whether anything moved.
 */
export function dedupeSystemIds(systems: StarSystemNode[]): { systems: StarSystemNode[]; renamed: SystemIdRename[] } {
  const seen = new Set<string>();
  const renamed: SystemIdRename[] = [];
  let changed = false;
  const out = systems.map((node) => {
    const id = node?.id;
    if (typeof id !== 'string' || !seen.has(id)) { if (typeof id === 'string') seen.add(id); return node; }
    const to = uniqueSystemId(id, seen);
    seen.add(to);
    changed = true;
    renamed.push({ from: id, to, name: node.name });
    const inner = node.system && node.system.id === id ? { ...node.system, id: to } : node.system;
    return { ...node, id: to, system: inner };
  });
  return changed ? { systems: out, renamed } : { systems, renamed };
}

// System topology queries for the WS2 Guide document — the star/planet/belt/moon hierarchy the
// schematic draws and (Phase 3) the navigator walks. Ported verbatim from the legacy Field Guide
// (`CatalogueBrowser.svelte:38-183`) so the new canvas document reads the system EXACTLY as the old
// Guide did: stars biggest-first, orbiters by semi-major axis, belts as blobs, barycentres shown AS
// their dominant member. Pure functions over `System.nodes` — no Svelte, so both the schematic drawer
// and the interactive navigator share one source of truth.
import type { System, CelestialBody, Barycenter } from '$lib/types';
import { AU_KM } from '$lib/constants';

export type Node = CelestialBody | Barycenter;

export function isStar(n: any): boolean {
  return n?.roleHint === 'star'
    || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
}
export function isBeltish(n: any): boolean {
  return n?.roleHint === 'belt' || n?.roleHint === 'ring';
}
export function isBary(n: any): boolean { return n?.kind === 'barycenter'; }

// Semi-major axis in AU (belts/rings fall back to the midpoint of their inner/outer radii).
export function orbitAU(b: any): number {
  const a = b?.orbit?.elements?.a_AU;
  if (typeof a === 'number' && a > 0) return a;
  const inKm = b?.radiusInnerKm, outKm = b?.radiusOuterKm;
  if (typeof inKm === 'number' && typeof outKm === 'number' && outKm > 0) return ((inKm + outKm) / 2) / AU_KM;
  return 0;
}

function nodesOf(system: System, includeConstructs = false): Node[] {
  return (system?.nodes ?? []).filter((n) => includeConstructs || n.kind !== 'construct');
}

// Stars, most-massive first (the diagram's row order).
export function starsOf(system: System): Node[] {
  return nodesOf(system).filter(isStar).sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0));
}

// Direct orbiters of a host (not stars, not moons), inner-to-outer.
function orbiters(system: System, hostId: string): Node[] {
  return nodesOf(system)
    .filter((n: any) => !isStar(n) && (n.parentId === hostId || n.orbit?.hostId === hostId) && n.roleHint !== 'moon')
    .sort((a, b) => (orbitAU(a) || 0) - (orbitAU(b) || 0));
}
export function planetsOf(system: System, hostId: string): Node[] {
  return orbiters(system, hostId).filter((n: any) => n.kind !== 'construct' && !isBeltish(n));
}
export function beltsOf(system: System, hostId: string): Node[] {
  return orbiters(system, hostId).filter((n: any) => n.kind !== 'construct' && isBeltish(n));
}
// Every orbiter incl. belts (the list/navigator order — the only way to pick a belt).
export function listBodiesOf(system: System, hostId: string): Node[] {
  return orbiters(system, hostId).filter((n: any) => n.kind !== 'construct');
}
export function moonsOf(system: System, id: string): Node[] {
  return nodesOf(system)
    .filter((n: any) => n.kind !== 'construct' && (n.parentId === id || n.orbit?.hostId === id) && n.roleHint === 'moon')
    .sort((a: any, b: any) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0));
}
// Constructs attached to a body, split by placement (ON the surface vs ORBITING it).
export function constructsOf(system: System, id: string): { surface: Node[]; orbiting: Node[] } {
  const cs = (system?.nodes ?? []).filter((n: any) => n.kind === 'construct' && (n.parentId === id || n.orbit?.hostId === id));
  const surface = cs.filter((c: any) => String(c.placement || '').toLowerCase() === 'surface');
  return { surface, orbiting: cs.filter((c) => !surface.includes(c)) };
}

// Bodies with no stellar host (rogue planets / unparented objects).
export function roguesOf(system: System): Node[] {
  return nodesOf(system).filter((n: any) =>
    !isStar(n) && n.roleHint !== 'moon' && n.kind !== 'construct' && !n.parentId && !n.orbit?.hostId);
}

// A barycentre is shown AS its dominant member (e.g. Pluto for Pluto-Charon), so displayLabel yields
// the member name and dominantOf gives the body to draw facts/imagery from.
export function membersOf(system: System, bary: any): Node[] {
  const ids: string[] = bary?.memberIds || [];
  const all = nodesOf(system).filter((n) => ids.includes(n.id) || n.parentId === bary.id);
  return [...new Set(all)].sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0));
}
export function dominantOf(system: System, bary: any): Node | null { return membersOf(system, bary)[0] ?? null; }
export function displayLabel(system: System, n: any): string {
  if (isBary(n)) return dominantOf(system, n)?.name ?? n.name;
  return n?.name ?? '';
}

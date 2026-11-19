// HOW MUCH OF A WORLD A PLAYER SURFACE MAY PRINT - one ladder, one veil, one decider.
//
// A GM running Traveller asked to keep orbit distance, period and rotation on the player's body
// panel and hide the atmosphere and air mix, "so they don't get the wrong impression on a planet".
// Hiding the rows alone leaks: the Type row says "Earth Analogue", the derived tag pills say
// "Breathable", the stock artist picture shows oceans, and the class swatch is habitable blue.
//
// So the veil is NOT a list of rows to drop. `observedBody` builds a NEW node from an ALLOW-LIST of
// what a ship could measure from a distance, and every info surface reads that copy. A field the
// engine starts deriving next month is hidden by default, because it is not on the list - the same
// reasoning as `anonymousTag()` (engine-map TAG-25): build the replacement from a constant, never by
// copying and blanking.
//
// IT IS A PRESENTATION VEIL, NOT A SNAPSHOT STRIP, and it says so on purpose. The preset that asks
// for it lives in the player's own window, so the full body still crosses the wire - the same
// accepted trade-off as `liveReadings` (A29). It stops a table reading the answer off the screen; it
// does not stop a player with developer tools.
//
// THE LADDER IS THE SEAM FOR V4's "before and after scanning". Every surface takes a LEVEL, never
// the preset's flag, and `bodyDisclosureFor` is the only function that turns a preset into a level.
// A per-body reveal state is one line there (a scanned body returns 'full' whatever the preset
// says), and nothing downstream changes. If that state is ever applied inside
// `computePlayerSnapshot` instead - which is what would take the data off the wire (TAG-9) - it is
// this same `observedBody` it should call.
import type { Tag } from '$lib/types';
import { tagOrigin, ANONYMOUS_TAG_KEY } from '$lib/tags/tagLifecycle';
import { hasSolidSurface } from '$lib/physics/makeup';

/** `full` = everything the snapshot carries. `observed` = what can be measured from a distance. */
export type BodyDisclosure = 'full' | 'observed';

/**
 * THE ONE DECIDER. Absent means `full`, so every preset and save that predates the field reads
 * exactly as it did. `body` is unused today and is in the signature deliberately: V4's per-body
 * reveal state is read HERE and nowhere else.
 */
export function bodyDisclosureFor(
  preset: { bodyDisclosure?: BodyDisclosure } | null | undefined,
  _body?: unknown
): BodyDisclosure {
  return preset?.bodyDisclosure === 'observed' ? 'observed' : 'full';
}

// What a ship reads from a distance: where it is, how it moves, how it turns, how big and how
// heavy it is - plus the GM's own words about it. Everything else on the node is a derivation.
const OBSERVABLE_FIELDS = [
  'id', 'name', 'kind', 'roleHint', 'parentId', 'ui_parentId', 'placement',
  'orbit', 'orbital_period_days', 'rotation_period_hours', 'axial_tilt_deg', 'tidallyLocked',
  'massKg', 'radiusKm',
  'description' // the GM's prose for players; GM notes never reach a player snapshot at all
] as const;

/**
 * Which nodes the veil applies to: natural bodies that are not stars. A star's card is already
 * what a telescope reads (spectral class, temperature), a construct is built rather than derived,
 * and a barycentre has no facts.
 */
export function isVeilable(n: any): boolean {
  if (!n || n.kind !== 'body') return false;
  if (n.roleHint === 'star') return false;
  return !(Array.isArray(n.classes) && n.classes.some((c: unknown) => String(c).startsWith('star/')));
}

/**
 * A tag a player still sees on a veiled body: one the GM added BY HAND, or the anonymous
 * placeholder a GM's own disclosure choice produced (already a constant with nothing of the
 * original on it). Everything the engine, a rule or the generator wrote is a derivation.
 */
export function isHandAddedTag(t: Tag): boolean {
  return t.key === ANONYMOUS_TAG_KEY || tagOrigin(t) === 'manual';
}

/**
 * The generic type, from what is visibly true: the body's role, and whether there is a surface at
 * all. Never the derived class. A veiled copy carries the answer with it (`observedType`), because
 * the composition that decides "giant" is one of the things the copy no longer has.
 */
export function genericTypeLabel(b: any): string {
  if (typeof b?.observedType === 'string') return b.observedType;
  const role = String(b?.roleHint || 'body');
  if (role === 'planet') return hasSolidSurface(b) ? 'Planet' : 'Gas giant';
  const words = role.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The veiled copy. Built from the allow-list above; nothing else of the node survives. */
export function observedBody<T>(b: T): T {
  if (!isVeilable(b)) return b;
  const src = b as any;
  const out: any = {};
  for (const k of OBSERVABLE_FIELDS) if (src[k] !== undefined) out[k] = src[k];
  out.observedType = genericTypeLabel(src);
  const kept = (Array.isArray(src.tags) ? src.tags : []).filter(isHandAddedTag);
  if (kept.length) out.tags = kept;
  // A stock type picture is chosen BY the derived class, so it is the class in another form. A
  // picture the GM uploaded is the GM's own choice and stays.
  if (src.image?.custom) out.image = src.image;
  return out as T;
}

/** A node at a level. `full` returns the SAME object, so the default path allocates nothing. */
export function discloseBody<T>(b: T, level: BodyDisclosure | undefined): T {
  return level === 'observed' ? observedBody(b) : b;
}

/**
 * A whole system at a level, for a surface that looks bodies up by id (the photo loader, a list).
 * NOT for anything that caches on the system object - the eclipse search does, and wants the real
 * system - and not for the live maps, whose renderers read tags to draw the world.
 */
export function discloseSystem<S extends { nodes: any[] } | null | undefined>(system: S, level: BodyDisclosure | undefined): S {
  if (level !== 'observed' || !system) return system;
  return { ...system, nodes: system.nodes.map((n) => observedBody(n)) } as S;
}

/**
 * The picture mode a body's graphic is drawn in. The live globe and the gallery disc are drawn
 * from the body's own derived data, so a veiled body takes the PLAIN DISC - the generic picture the
 * info block has always had - whichever of the three the preset chose. `photo` and `none` pass
 * through: a photo is settled by which picture survives the veil, and none is none. ONE function,
 * because the document builder reserves the gap and two components fill it, and all three must
 * give the same answer.
 */
export function graphicModeFor<M extends string>(imagery: M, veiled: boolean): M | 'disc' {
  return veiled && (imagery === 'sphere' || imagery === 'flat') ? 'disc' : imagery;
}

// THE CAMPAIGN'S OWN STARS, AS SEEN FROM ONE OF THEM (G9).
//
// The 3D system view has always had a generic starfield behind it — 1600 random points, scenery. This
// turns the CHARTED systems into real stars in that sky: each one at its true direction, its true
// apparent brightness and its own colour, drawn in front of the generic backdrop. A GM can then point
// at a pattern and name it, and the constellation a party sees from Tau Ceti is made of the same
// systems that sit on the GM's starmap.
//
// IT SIDESTEPS THE HARD PROBLEM. These are FAR-FIELD objects on the celestial sphere at effective
// infinity, so all any of them needs is a DIRECTION. No enormous coordinates, no interaction with the
// floating origin, none of the precision work A19 spent a session on.
//
// NOTHING HERE IS NEW PHYSICS — every input already existed and this is assembly:
//   DIRECTION   the starmap has held true 3D positions for every system since the rebuild, so the
//               direction is a vector difference.
//   DISTANCE    `map/systemDistance` already converts map units to the campaign's unit, and it is the
//               module every other consumer goes through.
//   BRIGHTNESS  `radiationOutput` IS the star's luminosity in solar units — the same field the
//               radiation model reads for a source. There is no second luminosity calculation here.
//   COLOUR      `starColorFromTempK`, the existing star-colour derivation.
//
// The colour deliberately comes from TEMPERATURE rather than from `getPlanetColor`, which the starmap
// glyphs use. That function returns a per-CLASS signal swatch chosen to be legible on a map, and it
// reads a Svelte store; a star hanging in a sky is showing you its photosphere, and the physical
// derivation is the one that means that. Adding a third answer — a class-to-colour table of our own —
// is the thing the standing rule forbids, and a hardcoded palette for "what colour is a K dwarf" has
// already been reverted once.
import type { Starmap, System, CelestialBody } from '$lib/types';
import { LY_M, PC_M } from '$lib/constants';
import { systemVisualStars } from '$lib/starmap/systemStars';
import { starColorFromTempK } from '$lib/rendering/apparentColor';
import { systemSeparation, type MapPos } from './systemDistance';

/** Parsecs per light year, from the shipped constants rather than a remembered 3.26. */
const LY_PER_PC = PC_M / LY_M;

/**
 * The Sun's absolute visual magnitude. This is the zero point that makes every other number here a
 * real magnitude rather than an arbitrary brightness scale, and it is why the two anchors work.
 */
export const SOLAR_ABS_MAG = 4.83;

/**
 * The faintest star a good human eye can see from a dark site. Used as the default cut, because a
 * campaign is free to hold systems far enough away to be genuinely invisible and drawing those would
 * be a lie of exactly the kind the honest-list rule warns about.
 */
export const NAKED_EYE_LIMIT = 6.5;

/**
 * How the charted systems are shown in the sky — an ENUM rather than a boolean, following the grid
 * types, because the third state is not "on with an extra".
 *
 *   off     the generic starfield alone, as it has always been.
 *   true    the charted systems at their real direction, magnitude and colour, sitting in front of the
 *           backdrop and otherwise indistinguishable from it. An honest sky.
 *   marked  the same stars, given DIFFRACTION SPIKES and their names.
 *
 * The third mode earns its place on a point worth keeping: diffraction spikes are an INSTRUMENT
 * artifact — the cross thrown by a telescope's secondary-mirror vanes — and not something an eye ever
 * sees. So a spike reads as "this object is ANNOTATED", not as a claim about the sky, which is exactly
 * the honest way to say "these dots are your systems and the rest is scenery". It also answers the
 * question `true` raises on its own: with a dozen real stars among 1,600 scenery ones, which is which?
 */
export type SkyMode = 'off' | 'true' | 'marked';

/** The one picker list, so every surface that offers this offers the same three words. */
export const SKY_MODE_OPTIONS: { value: SkyMode; label: string }[] = [
  { value: 'off',    label: 'None' },
  { value: 'true',   label: 'True sky' },
  { value: 'marked', label: 'Marked (spikes + names)' }
];

/**
 * How faint to go, PER MODE — and the difference is the whole reason the two modes are separate.
 *
 * `true` claims to be a sky, so it stops at the naked-eye limit. Drawing a magnitude-20 red dwarf as a
 * visible dot would be a lie about what anyone standing there could see.
 *
 * `marked` claims to be an INSTRUMENT — that is what a diffraction spike says — so it is not bound by
 * what an eye can do, and it shows every charted system. This is not a liberty; it is the mode's
 * purpose, and it is what makes it useful, because MEASURED, the naked-eye set is far too sparse to
 * find: a 45-degree view covers 3.8% of the celestial sphere, so the bundled map's 13 naked-eye
 * systems put an EXPECTED HALF A STAR on screen at any moment, and in the default framing the real
 * count is zero. All 41 raise that to about 1.6. See the inbox finding — the limit here is the map's
 * density, not the cut, and a campaign with hundreds of systems is where this comes alive.
 */
export function magnitudeLimitFor(mode: SkyMode): number {
  return mode === 'marked' ? Infinity : NAKED_EYE_LIMIT;
}

export interface SkyStar {
  /** The starmap system's id — so a click or a label can be traced back to the map. */
  id: string;
  name: string;
  /** Unit vector from the viewing system toward this one, in the PHYSICS frame (reference plane z=0). */
  dir: { x: number; y: number; z: number };
  /** Apparent visual magnitude as seen from the viewing system. Smaller is brighter; Sirius is -1.46. */
  magnitude: number;
  /** Distance in light years — for a label, and for anyone checking the arithmetic. */
  distanceLy: number;
  /** '#rrggbb', from the primary's photosphere temperature. */
  color: string;
}

/** Absolute magnitude from luminosity in solar units. */
export function absoluteMagnitude(luminositySolar: number): number {
  if (!(luminositySolar > 0)) return Infinity;
  return SOLAR_ABS_MAG - 2.5 * Math.log10(luminositySolar);
}

/** Apparent magnitude of an absolute magnitude seen from `distancePc`. The distance modulus. */
export function apparentMagnitude(absMag: number, distancePc: number): number {
  if (!Number.isFinite(absMag)) return Infinity;
  if (!(distancePc > 0)) return absMag; // co-located: no dimming to apply
  return absMag + 5 * Math.log10(distancePc / 10);
}

/**
 * The luminosity a whole SYSTEM puts out, in solar units, and the temperature of its brightest star.
 *
 * One point per system rather than one per star, because at these ranges a pair is a single point to
 * the eye — Alpha Centauri A and B are a few arcseconds apart at 4.4 ly, well inside what anyone can
 * split — and the starmap draws a system as one place. So the light adds and the colour is the
 * dominant star's.
 *
 * `systemVisualStars` decides WHICH nodes are the stars, rather than that test being written again
 * here; it is the same answer both starmaps draw. A BLACK HOLE is skipped: it is on that list because
 * a map must draw something for it, but a quiescent hole emits no light and an accretion disc is not
 * a photosphere with a colour temperature.
 */
function systemLight(system: System | null | undefined): { luminosity: number; tempK: number } | null {
  const visual = systemVisualStars(system);
  if (!visual.length || !system?.nodes) return null;
  const byId = new Map(system.nodes.map((n) => [n.id, n as CelestialBody]));
  let luminosity = 0;
  let tempK = 0;
  let brightest = 0;
  for (const v of visual) {
    if (v.bh) continue; // no photosphere
    const node = byId.get(v.id);
    if (!node) continue;
    // radiationOutput IS luminosity in L-sun (SystemProcessor: "the luminosity the radiation model
    // reads for a source"). Not recomputed from radius and temperature — that would be the second
    // calculation the item warns about, and the two would drift.
    const l = Number((node as any).radiationOutput ?? (node as any).luminositySolar ?? 0);
    if (!(l > 0)) continue;
    luminosity += l;
    if (l > brightest) { brightest = l; tempK = Number(node.temperatureK ?? 0); }
  }
  if (!(luminosity > 0)) return null;
  return { luminosity, tempK: tempK > 0 ? tempK : 5778 };
}

/**
 * Map units to PARSECS, which is what the distance modulus wants.
 *
 * A DIAGRAMMATIC map has no physical scale at all, so there is no honest magnitude to compute for one.
 * Rather than refuse to draw anything, its own unit is read as light years — the ORDERING and the
 * relative brightnesses are then still right, and only the absolute zero point is invented. That is
 * stated here rather than hidden because it is the one assumption in this file.
 */
function toParsecs(value: number, distanceUnit: string): number {
  const u = String(distanceUnit || 'ly').toLowerCase();
  if (u === 'pc' || u === 'parsec' || u === 'parsecs') return value;
  return value / LY_PER_PC; // ly, and diagrammatic read as ly
}

/**
 * A sky direction in the map's equatorial frame (x = cos dec cos ra, y = cos dec sin ra, z = north)
 * as scene coordinates (the scene is Y-up), WITH ITS HANDEDNESS KEPT.
 *
 * A93: the scene had placed sky sprites at (x, z, y) - the same swap positionToScene uses for bodies.
 * Swapping two axes is an improper rotation: it flips chirality, and every sky it drew was a mirror
 * image - Orion with Betelgeuse on the wrong side. For a fictional system's own layout a consistent
 * mirror is invisible; the SKY is the one thing a user compares with a photograph. So the sky takes a
 * proper rotation, (x, y, z) -> (x, z, -y), and positionToScene is deliberately left alone: changing
 * that would flip every system's orbit direction on screen. Gated absolutely by skyChirality.spec.ts.
 * Engine map RENDER-S49.
 */
export function skyDirToScene(dir: { x: number; y: number; z: number }): [number, number, number] {
  return [dir.x, dir.z, -dir.y];
}

export interface SkyStarOpts {
  /** Drop anything fainter than this. Defaults to the naked-eye limit. */
  magnitudeLimit?: number;
  /** Resolve a system's full `System` — the starmap node may hold it inline or by reference. */
  systemOf?: (node: any) => System | null | undefined;
}

/**
 * Every charted system except the viewer's own, as a star in that system's sky.
 *
 * DEPTH ALWAYS COUNTS HERE, and that is deliberate: `ignoreZForDistances` is a campaign's choice about
 * how far apart things are to TRAVEL, whereas a direction in the sky is inherently three-dimensional.
 * Collapsing z would put every star on one great circle, which is not a simplification but a different
 * sky. Returned brightest-first so a caller that caps the count keeps the ones that matter.
 */
export function skyStarsFor(
  starmap: Starmap | null | undefined,
  viewingSystemId: string | null | undefined,
  opts: SkyStarOpts = {}
): SkyStar[] {
  if (!starmap?.systems?.length || !viewingSystemId) return [];
  const ppu = starmap.scale?.pixelsPerUnit ?? 0;
  if (!(ppu > 0)) return [];
  const here = starmap.systems.find((s: any) => s.id === viewingSystemId) as any;
  if (!here?.position) return [];
  const limit = opts.magnitudeLimit ?? NAKED_EYE_LIMIT;
  const resolve = opts.systemOf ?? ((n: any) => (n?.system ?? null) as System | null);

  const out: SkyStar[] = [];
  for (const node of starmap.systems as any[]) {
    if (!node || node.id === viewingSystemId || !node.position) continue;
    const light = systemLight(resolve(node));
    if (!light) continue;
    const a = here.position as MapPos, b = node.position as MapPos;
    // The campaign's own distance module, so the sky and the route list can never disagree about how
    // far away anything is. ignoreZ is FALSE always — see the note above.
    const distUnits = systemSeparation(a, b, ppu, false);
    const distPc = toParsecs(distUnits, starmap.distanceUnit);
    if (!(distPc > 0)) continue;
    const magnitude = apparentMagnitude(absoluteMagnitude(light.luminosity), distPc);
    if (!Number.isFinite(magnitude) || magnitude > limit) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 0)) continue;
    const [r, g, bl] = starColorFromTempK(light.tempK);
    out.push({
      id: String(node.id),
      name: String(node.name ?? ''),
      dir: { x: dx / len, y: dy / len, z: dz / len },
      magnitude,
      distanceLy: distPc * LY_PER_PC,
      color: '#' + [r, g, bl].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
    });
  }
  return out.sort((p, q) => p.magnitude - q.magnitude);
}

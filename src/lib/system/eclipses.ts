// NEXT ECLIPSE: when does something next cover this body's star, and how dark does it get?
//
// WHERE THE OBSERVER STANDS, because an eclipse happens SOMEWHERE and the answer is meaningless
// without saying where. **You are standing on the body whose data is open, at the point on its
// surface directly under the occulter.** From there exactly two things can pass in front of your
// star: one of your own satellites, or — if you are yourself a moon — the world you orbit. Both are
// "the star gets covered as seen from here", so one rule covers both readings the item asked about,
// and the number it produces (how dark it gets) is something the observer actually experiences.
//
// Standing on the SURFACE rather than at the centre is not a detail. It shortens the distance to a
// close occulter by a whole body radius, and for Luna that 1.7% is the difference between an eclipse
// that just covers the Sun and one that just fails to — which is the entire reason totality exists.
//
// WHAT IS PREDICTED, AND WHAT IS NOT. Real eclipse seasons drift because the orbit's nodes PRECESS.
// This engine holds orbital elements fixed, so the honest description of the answer is "when these
// elements next line up", not an ephemeris. It is exactly right for a game and it should say so
// rather than implying observatory precision — `approximate` is on every prediction for that reason.
//
// COST. A forward search over a propagator is not free, so none of this may run inside a derivation
// pass: it is on demand, from a reader, cached against the clock (see `nextEclipseCached`). B13 is
// the cautionary tale — a per-pass cost that also broke idempotence — and `system/idempotence.test.ts`
// is what would catch a regression. Nothing here is called from `process()`.
//
// The cheap half is the pre-filter. How dark it can EVER get is pure arithmetic on orbital radii, so
// an occulter that could not reach the reporting floor is dismissed without a single propagation.
// That is what stops Deimos — a moving speck at about 1% — from ever costing anything.
//
// The propagator is framed at the source (C9), so a moon arrives in its parent's equatorial plane
// without this file knowing anything about reference frames. It used to call a `framedWorldPositions3D`
// wrapper for that, which no longer exists.
import { AU_KM } from '$lib/constants';
import { computeWorldPositions3D, type Vec3 } from '$lib/physics/worldPositions';
import { starOccluders, bandAlignmentShare, relativeInclinationRad } from '$lib/physics/starlightOcclusion';
import type { System } from '$lib/types';

/**
 * Below this fraction of the star's disc, an eclipse is not worth a GM's attention: the sky does not
 * noticeably darken and nobody at the table would look up. It is also the natural line between an
 * eclipse and a mere TRANSIT — a dot crossing a disc — so the events filtered out here are precisely
 * the ones that do not deserve the word. Deimos from Mars is about 1%; Phobos is about 38% and stays.
 */
export const ECLIPSE_FLOOR = 0.25;

/** How far ahead to look before answering "not for a very long time". */
export const DEFAULT_HORIZON_YEARS = 50;
const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** A hard ceiling on propagator samples, so a pathological system cannot hang a panel render. */
const MAX_SAMPLES = 120000;

export type EclipseKind = 'total' | 'annular' | 'partial';

export interface EclipsePrediction {
  /** Greatest eclipse, ms since epoch — null when it happens EVERY orbit and no single date means anything. */
  timeMs: number | null;
  /** True when the shadow cannot miss: this is a day/night cycle, not an event with a date. */
  everyOrbit: boolean;
  /** The recurrence period when `everyOrbit` — the orbital period the cycle runs on. */
  periodMs: number;
  obscuration: number;       // 0..1 — fraction of the star's disc AREA covered at maximum
  kind: EclipseKind;
  ratio: number;             // occulter angular radius / star angular radius at maximum
  occulterId: string;
  occulterName: string;
  starId: string;
  starName: string;
  /** Always true: elements are held fixed, so this is an alignment, not an ephemeris. */
  approximate: true;
  /** MEGASTRUCTURE entries only (G58): the star is covered AT ALL TIMES from here - the bad-ring
   *  case, said honestly. Stronger than `everyOrbit`; `timeMs` is null and no date ever comes. */
  permanent?: true;
  /** MEGASTRUCTURE entries only: how long each shadow crossing lasts. */
  durationMs?: number;
}

export interface EclipseCandidate {
  id: string;
  name: string;
  /** The darkest this occulter could EVER manage, from the most favourable geometry it can reach. */
  maxObscuration: number;
  /** Why it was dropped, if it was. */
  rejected?: 'below-floor' | 'no-radius' | 'no-period';
}

export interface EclipseOutlook {
  next: EclipsePrediction | null;
  /** G58: shadow crossings CAUSED BY MEGASTRUCTURES - a special entry BESIDE the local eclipses,
   *  never competing with them for the `next` slot ("still need local eclipses" - owner). Pure
   *  arithmetic on the band geometry, no propagation, so it costs nothing to always answer. */
  megastructure?: EclipsePrediction[];
  /** Occulters considered, including the ones dismissed — so the panel can say why there is nothing. */
  candidates: EclipseCandidate[];
  /** How far the search actually reached when it found nothing. */
  searchedToMs: number;
  /** True when the sample ceiling stopped the search rather than the horizon. */
  budgetExhausted: boolean;
}

// --- Angular size: the one helper, used for the star and the occulter alike -------------------

/**
 * The angular RADIUS a sphere subtends, in radians. `asin` rather than the small-angle ratio because
 * a moon seen from its primary's surface is not a small angle: Mars fills 42 degrees of Phobos's sky.
 */
export function angularRadius(radiusKm: number, distanceKm: number): number {
  if (!(radiusKm > 0) || !(distanceKm > 0)) return 0;
  if (distanceKm <= radiusKm) return Math.PI / 2; // inside it — the sky is the object
  return Math.asin(radiusKm / distanceKm);
}

/**
 * Fraction of the star's disc AREA hidden, for two circles of angular radii `starRad` and `occRad`
 * whose centres are `sep` apart. This is the "%age darkness" the reader is shown.
 *
 * THE RATIO IS WHAT DECIDES THE KIND, and it is pure arithmetic:
 *   occRad >= starRad and well centred -> TOTAL (obscuration 1)
 *   occRad <  starRad and well centred -> ANNULAR, a ring of star left over, obscuration (r_o/r_s)^2
 *   anything else that overlaps        -> PARTIAL, the circle-circle lens
 */
export function discObscuration(sep: number, starRad: number, occRad: number): number {
  if (!(starRad > 0) || !(occRad > 0)) return 0;
  if (sep >= starRad + occRad) return 0;              // no contact
  if (sep <= occRad - starRad) return 1;              // star entirely behind the occulter
  const k = occRad / starRad;
  if (sep <= starRad - occRad) return k * k;          // occulter entirely inside the star's disc
  // Circle-circle lens area, over the star's disc area.
  const d = sep, r1 = starRad, r2 = occRad;
  const a1 = Math.acos(Math.min(1, Math.max(-1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1))));
  const a2 = Math.acos(Math.min(1, Math.max(-1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2))));
  const tri = 0.5 * Math.sqrt(Math.max(0,
    (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)));
  return (r1 * r1 * a1 + r2 * r2 * a2 - tri) / (Math.PI * r1 * r1);
}

/** Which word describes this geometry. `ratio` is the occulter's angular radius over the star's. */
export function eclipseKind(sep: number, starRad: number, occRad: number): EclipseKind {
  if (sep <= occRad - starRad) return 'total';
  if (sep <= starRad - occRad) return 'annular';
  return 'partial';
}

// --- Inputs off the nodes ---------------------------------------------------------------------

const radiusKmOf = (n: any): number =>
  Number(n?.radiusKm ?? n?.physical_parameters?.radiusKm ?? 0) || 0;

/**
 * The body's orbital period in ms, taken from the engine's OWN published answer rather than
 * re-derived — `orbital_period_days` is written by the processor, `n_rad_per_s` by the binary pass.
 * Two ways to ask one question is how a second copy starts, so this asks and does not compute.
 */
function periodMsOf(n: any): number {
  const days = Number(n?.orbital_period_days ?? 0);
  if (days > 0) return days * DAY_MS;
  const nrad = Number(n?.orbit?.n_rad_per_s ?? 0);
  if (nrad > 0) return Math.abs((2 * Math.PI) / nrad) * 1000;
  return 0;
}

/**
 * A cut-down copy of the system holding only these bodies and their ancestors.
 *
 * THIS IS THE WHOLE PERFORMANCE STORY. The propagator places EVERY node in the system on every call,
 * and a forward search calls it thousands of times — but an eclipse involves three bodies. Sol has
 * thirty-nine nodes, so handing the search a four-node system does the same work an order of
 * magnitude faster. It is the same propagator on a smaller input, not a faster copy of it, which is
 * the only kind of speed-up worth having here.
 */
function reduceSystem(system: System, ids: string[]): System {
  const byId = new Map<string, any>(system.nodes.map((n) => [n.id, n as any]));
  const keep = new Set<string>();
  for (const id of ids) {
    let cur: any = byId.get(id);
    while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : null; }
  }
  return { ...system, nodes: system.nodes.filter((n) => keep.has(n.id)) };
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x
});
function unit(a: Vec3): Vec3 { const l = len(a); return l > 0 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 }; }
/** Angle between two vectors, via atan2 of the cross and dot — stable at both ends, unlike acos. */
const angleBetween = (a: Vec3, b: Vec3): number => Math.atan2(len(cross(a, b)), dot(a, b));

/** The star this body ultimately orbits: the nearest star up the parent chain, else the system's own. */
function starFor(system: System, bodyId: string): any | null {
  const byId = new Map<string, any>(system.nodes.map((n) => [n.id, n as any]));
  const seen = new Set<string>();
  let cur: any = byId.get(bodyId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parent = cur.parentId ? byId.get(cur.parentId) : null;
    if (parent && parent.kind === 'body' && parent.roleHint === 'star') return parent;
    cur = parent;
  }
  // Multi-star or barycentre-rooted: fall back to the largest star present.
  const stars = system.nodes.filter((n: any) => n.kind === 'body' && n.roleHint === 'star') as any[];
  if (!stars.length) return null;
  return stars.reduce((best, s) => (radiusKmOf(s) > radiusKmOf(best) ? s : best), stars[0]);
}

/** Semi-major axis in km, 0 if there is no orbit. */
const aKmOf = (n: any): number => Number(n?.orbit?.elements?.a_AU ?? 0) * AU_KM;
const eccOf = (n: any): number => Math.min(0.95, Math.max(0, Number(n?.orbit?.elements?.e ?? 0)));

/**
 * HOW THE PAIR IS ARRANGED — worked out once, because the three readings differ only here and every
 * later step wants the same four numbers. Three ternaries spelling this out in three places is how a
 * fourth one ends up disagreeing with the others.
 */
interface PairGeometry {
  hostId: string;    // the body the relative orbit is measured about
  movingId: string;  // the one that traces it
  sepKm: number;     // mean separation of the two bodies
  ecc: number;
  periodMs: number;
}
function pairGeometry(observer: any, occ: any, byId: Map<string, any>): PairGeometry | null {
  if (occ.parentId === observer.id) {                       // your own satellite
    return { hostId: observer.id, movingId: occ.id, sepKm: aKmOf(occ), ecc: eccOf(occ), periodMs: periodMsOf(occ) };
  }
  if (observer.parentId === occ.id) {                       // the world you orbit
    return { hostId: occ.id, movingId: observer.id, sepKm: aKmOf(observer), ecc: eccOf(observer), periodMs: periodMsOf(observer) };
  }
  if (observer.parentId && observer.parentId === occ.parentId && byId.get(observer.parentId)?.kind === 'barycenter') {
    // Barycentre partners: neither orbits the other, but their SEPARATION is the sum of the two
    // orbits about the shared point, and they trace it in one plane with one period.
    const p = Math.max(periodMsOf(observer), periodMsOf(occ)); // they share it; take the sounder figure
    return {
      hostId: occ.id, movingId: observer.id,
      sepKm: aKmOf(observer) + aKmOf(occ), ecc: Math.max(eccOf(observer), eccOf(occ)), periodMs: p
    };
  }
  return null;
}

// --- The pre-filter: how dark could this occulter EVER get, without propagating anything ---------

/**
 * The most favourable geometry an occulter can reach: itself at its closest, the star at its
 * furthest, and the observer standing a body radius nearer. Deliberately optimistic — its only job
 * is to be certain that anything it rejects could never have cleared the floor.
 */
function bestPossibleObscuration(observer: any, occulter: any, star: any, starDistKmMax: number, pair: PairGeometry): number {
  const rOcc = radiusKmOf(occulter);
  const rStar = radiusKmOf(star);
  if (!(rOcc > 0) || !(rStar > 0) || !(starDistKmMax > 0)) return 0;
  // Separation at closest approach: periapsis of the relative orbit, less the observer's own radius.
  const dMin = Math.max(1, pair.sepKm * (1 - pair.ecc) - radiusKmOf(observer));
  const occRad = angularRadius(rOcc, dMin);
  const starRad = angularRadius(rStar, starDistKmMax);
  if (!(starRad > 0)) return 0;
  const k = occRad / starRad;
  return k >= 1 ? 1 : k * k;
}

// --- The search --------------------------------------------------------------------------------

interface Sampler { at(t: number): { sep: number; starRad: number; occRad: number } | null; used: number }

/**
 * Angular separation of the occulter from the star, and both angular radii, as seen by an observer on
 * the surface of `observer` at the sub-occulter point.
 */
function makeSampler(system: System, observerId: string, occulterId: string, starId: string): Sampler {
  const rObs = radiusKmOf(system.nodes.find((n) => n.id === observerId));
  const rOcc = radiusKmOf(system.nodes.find((n) => n.id === occulterId));
  const rStar = radiusKmOf(system.nodes.find((n) => n.id === starId));
  const s: Sampler = {
    used: 0,
    at(t: number) {
      s.used++;
      const pos = computeWorldPositions3D(system, t);
      const B = pos.get(observerId), O = pos.get(occulterId), S = pos.get(starId);
      if (!B || !O || !S) return null;
      // WHERE ON THE SURFACE. Stand where the shadow falls — the point nearest the axis running
      // star -> occulter -> here. That is where the eclipse is deepest, which is what "does this
      // world see an eclipse" means; an eclipse happens SOMEWHERE and this picks the somewhere.
      //
      // Standing under the OCCULTER instead is the obvious choice and it is wrong. It pins the
      // observer to whatever latitude the occulter happens to be over, and for a moon in its
      // primary's equatorial plane that is the equator — so Phobos would appear to transit only at
      // the martian equinoxes, twice a martian year, when in reality its shadow tracks across a wide
      // band of latitudes and rovers see transits through most of the year.
      //
      // The displacement is a whole body radius, which is not a refinement either: it is 1.7% of the
      // distance to Luna, and 1.7% is the difference between an eclipse that just covers the Sun and
      // one that just fails to. Totality exists in that margin.
      const axis = unit(sub(O, S));
      const rObsAu = rObs / AU_KM;
      const eye: Vec3 = { x: B.x - axis.x * rObsAu, y: B.y - axis.y * rObsAu, z: B.z - axis.z * rObsAu };
      const vOcc = sub(O, eye), vStar = sub(S, eye);
      const dOcc = len(vOcc) * AU_KM, dStar = len(vStar) * AU_KM;
      return {
        sep: angleBetween(vOcc, vStar),
        starRad: angularRadius(rStar, dStar),
        occRad: angularRadius(rOcc, dOcc)
      };
    }
  };
  return s;
}

/** Golden-section minimisation of the separation on [lo, hi] — the function is smooth and unimodal there. */
function refineMinimum(sampler: Sampler, lo: number, hi: number, iters = 24): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = sampler.at(c)?.sep ?? Infinity, fd = sampler.at(d)?.sep ?? Infinity;
  for (let i = 0; i < iters && sampler.used < MAX_SAMPLES; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = sampler.at(c)?.sep ?? Infinity; }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = sampler.at(d)?.sep ?? Infinity; }
  }
  return (a + b) / 2;
}

/** The normal of `movingId`'s orbit about `hostId`, from two samples a quarter period apart. */
function orbitNormal(system: System, hostId: string, movingId: string, t0: number, periodMs: number): Vec3 | null {
  const p0 = computeWorldPositions3D(system, t0);
  const p1 = computeWorldPositions3D(system, t0 + periodMs / 4);
  const a = p0.get(movingId), b = p0.get(hostId), c = p1.get(movingId), d = p1.get(hostId);
  if (!a || !b || !c || !d) return null;
  const n = unit(cross(sub(a, b), sub(c, d)));
  return len(n) > 0 ? n : null;
}

/**
 * DOES THE SHADOW EVER MISS? If it cannot, this is not an eclipse with a date — it is a day/night
 * cycle, and the honest answer is "every orbit" rather than a calendar entry that means nothing.
 *
 * A small moon close in around a giant is the case: Io passes into Jupiter's shadow on essentially
 * every one of its 1.77-day orbits, and so do Europa and Ganymede. Answering that with a date would
 * be silly, and SEARCHING for that date would be the most expensive thing this module ever did — the
 * fine step is a fraction of a very short period. So it is settled here, on arithmetic, before any
 * search starts.
 *
 * The test is the season gate's, taken at its worst instead of at a moment. The star's angular
 * distance from the orbit plane can reach PSI, the angle between the moon's orbit plane and the
 * plane the moon's system travels round the star in. If the shadow still reaches at PSI, it reaches
 * always. Apoapsis, so "always" has to hold at the least favourable point of the orbit.
 *
 * THIS IS ALSO WHY A POLAR ORBIT IS NOT CAUGHT BY IT, which is the right behaviour: PSI is about 90
 * degrees there, `a · sin(PSI)` is the whole orbital radius, and the shadow spends most of the year
 * missing entirely. Such a moon has fierce eclipse SEASONS instead, and gets the normal search.
 *
 * CALLISTO IS THE CASE THAT PROVES IT IS NOT JUST "MOONS OF GIANTS". At 1.88 million km its miss
 * distance reaches 109,000 km against Jupiter's 69,911, so it escapes the shadow for part of the
 * cycle — which is exactly what the real Callisto does, and it alone among the Galileans.
 */
function eclipsesEveryOrbit(
  system: System, observerId: string, occulterId: string, starId: string,
  helioId: string, t0: number, pair: PairGeometry, helioPeriodMs: number
): boolean {
  const byId = new Map<string, any>(system.nodes.map((n) => [n.id, n as any]));
  const star = byId.get(starId);
  const moonN = orbitNormal(system, pair.hostId, pair.movingId, t0, pair.periodMs);
  // The plane the whole system travels round the star in. The star direction sweeps this plane out
  // over a year, so the angle between the two planes IS the largest latitude the star can reach.
  const helioN = orbitNormal(system, star.parentId ?? starId, helioId, t0, helioPeriodMs);
  if (!moonN || !helioN) return false;
  const raw = angleBetween(moonN, helioN);
  const psi = Math.min(raw, Math.PI - raw); // retrograde orbits share a plane; take the acute angle
  const aApo = pair.sepKm * (1 + pair.ecc);
  if (!(aApo > 0)) return false;
  const helio = byId.get(helioId);
  const starDistKmMax = aKmOf(helio) * (1 + eccOf(helio)) || 1;
  const starRad = angularRadius(radiusKmOf(star), starDistKmMax);
  return aApo * Math.sin(psi) <= radiusKmOf(byId.get(occulterId)) + radiusKmOf(byId.get(observerId)) + aApo * starRad;
}

/**
 * The ECLIPSE SEASON gate — DOES THE SHADOW REACH US AT ALL THIS SEASON? It is what keeps a fast
 * inner moon affordable, and it is exact geometry rather than a margin.
 *
 * The occulter's shadow runs anti-sunward. Over one orbit the closest that axis comes to the
 * observing body's centre is `a · sin(beta)`, where `a` is the orbital radius and `beta` is the
 * star's angular distance from the ORBIT PLANE — because the orbit is a circle in that plane and the
 * anti-solar direction sits `beta` out of it. If that miss distance exceeds the two bodies' radii
 * plus the shadow's own spread, the shadow passes clean by and no observer anywhere on the surface
 * sees anything. `beta` changes on the SYSTEM's orbital timescale, so a whole non-season is skipped
 * at a coarse stride instead of being stepped through at the occulter's period.
 *
 * MARS IS THE WORKED EXAMPLE, and it is the one that shows why a loose margin was useless. Phobos
 * orbits at 9,365 km inside Mars's equator; Mars's radius is 3,389 km. So the shadow reaches the
 * planet only while |beta| is under about 21 degrees, which is most but NOT all of a martian year —
 * and at the bundled epoch beta is 22.1 degrees, missing the planet by around eighty kilometres.
 * That is why there is no Phobos transit that week, and it is real, not a modelling artefact.
 *
 * The star's angular radius is added as `a · starRad` because a shadow from a finite star spreads:
 * that term is what turns the umbral limit into the penumbral one, and for Luna it moves the gate
 * from 1.28 to 1.55 degrees of solar latitude — very close to the real ecliptic limit.
 */
function seasonGate(system: System, observerId: string, occulterId: string, starId: string, t0: number, pair: PairGeometry) {
  const byId = new Map<string, any>(system.nodes.map((n) => [n.id, n as any]));
  const normal = orbitNormal(system, pair.hostId, pair.movingId, t0, pair.periodMs);
  if (!normal) return null;
  const rObs = radiusKmOf(byId.get(observerId));
  const rOcc = radiusKmOf(byId.get(occulterId));
  const rStar = radiusKmOf(byId.get(starId));
  // Periapsis, so the gate errs towards staying OPEN — a closed gate skips time unlooked at, and the
  // one thing this must never do is step over a real eclipse.
  const aPeri = pair.sepKm * (1 - pair.ecc);
  if (!(aPeri > 0)) return null;
  return (t: number): boolean => {
    const pos = computeWorldPositions3D(system, t);
    const B = pos.get(observerId), S = pos.get(starId);
    if (!B || !S) return true;
    const toStar = sub(S, B);
    const starRad = angularRadius(rStar, len(toStar) * AU_KM);
    const missKm = aPeri * Math.abs(dot(normal, unit(toStar))); // a · sin(beta)
    return missKm <= rOcc + rObs + aPeri * starRad;
  };
}

/**
 * When does `bodyId` next see its star covered by at least `floor` of its disc, and by how much?
 *
 * ON DEMAND ONLY. Never call this from a derivation pass — see the note at the top of the file.
 */
export function nextEclipse(
  system: System | null,
  bodyId: string,
  fromMs: number,
  opts: { floor?: number; horizonMs?: number } = {}
): EclipseOutlook {
  const floor = opts.floor ?? ECLIPSE_FLOOR;
  const horizonMs = opts.horizonMs ?? DEFAULT_HORIZON_YEARS * YEAR_MS;
  const empty: EclipseOutlook = { next: null, candidates: [], searchedToMs: fromMs, budgetExhausted: false };
  if (!system) return empty;

  const byId = new Map<string, any>(system.nodes.map((n) => [n.id, n as any]));
  const body = byId.get(bodyId);
  if (!body || body.kind !== 'body') return empty;
  const star = starFor(system, bodyId);
  if (!star || star.id === bodyId) return empty;

  // G58: THE SHADOW A MEGASTRUCTURE CASTS is not a search problem - a band's crossings are pure
  // arithmetic on the same time-free share the temperature chain uses (starlightOcclusion.ts
  // header), so these entries are computed unconditionally and ride every return below. Isotropic
  // occluders (a swarm, a shell) are STEADY dimming, not an event, and make no entry.
  const megastructure: EclipsePrediction[] = [];
  {
    const helioNode0 = (body.parentId ? byId.get(body.parentId) : null);
    const helio0 = helioNode0 && helioNode0.roleHint !== 'star' && helioNode0.kind === 'body' ? helioNode0 : body;
    const bodyAu = aKmOf(helio0) / AU_KM;
    // Stored periods are the processor's; a hand-authored or half-imported node may lack them,
    // and Kepler answers from a + hostMu regardless - a local fallback, not a periodMsOf change,
    // because the forward-search half deliberately trusts only stored values.
    const mu0 = Number(helio0?.orbit?.hostMu ?? 0);
    const aM0 = aKmOf(helio0) * 1000;
    const helioPeriod0 = periodMsOf(helio0) || (mu0 > 0 && aM0 > 0 ? 2 * Math.PI * Math.sqrt(Math.pow(aM0, 3) / mu0) * 1000 : 0);
    for (const occ of starOccluders(star as any, system.nodes as any[])) {
      if (occ.id === bodyId || occ.bandHalfAngleRad === undefined) continue;
      if (!(bodyAu > occ.radiusAu)) continue; // inside the band's radius: never in its shadow
      const share = bandAlignmentShare(occ.bandHalfAngleRad, relativeInclinationRad(helio0.orbit?.elements, occ.elements));
      if (!(share > 0)) continue;
      const kind: EclipseKind = occ.fraction >= 0.995 ? 'total' : 'partial';
      const base = {
        obscuration: occ.fraction, kind, ratio: 1,
        occulterId: occ.id, occulterName: occ.name,
        starId: star.id, starName: String((star as any).name ?? ''), approximate: true as const
      };
      if (share >= 1 - 1e-12) {
        megastructure.push({ timeMs: null, everyOrbit: false, periodMs: 0, permanent: true, ...base });
      } else if (helioPeriod0 > 0) {
        // Two crossings per orbit (the latitude passes through the band going up and coming down),
        // so the recurrence is half the orbital period and each crossing lasts share x T / 2.
        megastructure.push({
          timeMs: null, everyOrbit: true, periodMs: helioPeriod0 / 2,
          durationMs: (share * helioPeriod0) / 2, ...base
        });
      }
    }
  }
  const withMega = <T extends EclipseOutlook>(o: T): T =>
    megastructure.length ? { ...o, megastructure } : o;

  // How far the star can ever be: the body's own apoapsis about it, plus its parent's if it is a moon.
  const parent = body.parentId ? byId.get(body.parentId) : null;
  const helio = parent && parent.roleHint !== 'star' ? parent : body;
  const starDistKmMax = aKmOf(helio) * (1 + eccOf(helio)) + (helio === body ? 0 : aKmOf(body) * (1 + eccOf(body)));

  // ONE RULE, THREE READINGS: what can get between you and your star? Your own satellites; the world
  // you orbit, if you are a moon; and the partner you share a barycentre with. The third is not an
  // afterthought — Pluto and Charon eclipsed each other every few days through the late eighties,
  // which is how Charon's radius was measured, and a body's parent is the BARYCENTRE in that case so
  // the partner is a sibling rather than a parent or a child.
  const occulters: any[] = system.nodes.filter(
    (n: any) => n.kind === 'body' && n.parentId === bodyId && n.roleHint !== 'ring' && n.roleHint !== 'belt'
  );
  if (parent && parent.kind === 'body' && parent.roleHint !== 'star') occulters.push(parent);
  if (parent && parent.kind === 'barycenter') {
    for (const sid of (parent.memberIds ?? [])) {
      const sib = sid !== bodyId ? byId.get(sid) : null;
      if (sib && sib.kind === 'body') occulters.push(sib);
    }
  }

  const candidates: EclipseCandidate[] = [];
  const viable: { node: any; max: number; pair: PairGeometry }[] = [];
  for (const occ of occulters) {
    const c: EclipseCandidate = { id: occ.id, name: String(occ.name ?? ''), maxObscuration: 0 };
    if (!radiusKmOf(occ) || !radiusKmOf(body)) { c.rejected = 'no-radius'; candidates.push(c); continue; }
    const pair = pairGeometry(body, occ, byId);
    if (!pair || !(pair.periodMs > 0) || !(pair.sepKm > 0)) { c.rejected = 'no-period'; candidates.push(c); continue; }
    c.maxObscuration = bestPossibleObscuration(body, occ, star, starDistKmMax, pair);
    // THE CHEAP HALF: dismissed on arithmetic alone, so a speck never costs a propagation.
    if (c.maxObscuration < floor) { c.rejected = 'below-floor'; candidates.push(c); continue; }
    candidates.push(c);
    viable.push({ node: occ, max: c.maxObscuration, pair });
  }
  if (!viable.length) return withMega({ ...empty, candidates });
  // Shortest period first. Whatever recurs most often is likeliest to give a near date, and the
  // first date found caps every later search — so ordering is worth real time on a moon-rich planet.
  viable.sort((a, b) => a.pair.periodMs - b.pair.periodMs);

  let best: EclipsePrediction | null = null;
  let searchedToMs = fromMs;
  let budgetExhausted = false;
  let spent = 0; // ONE budget across all candidates, so a moon-rich planet cannot cost N times as much
  const helioPeriodMs = periodMsOf(helio) || YEAR_MS;

  // FREE PRE-FILTER TWO: anything whose shadow can never miss is a day/night cycle, answered here
  // with a cadence and no search at all. It dominates a dated answer — you cannot wait less than one
  // orbit — so if one exists there is nothing else worth looking for.
  for (const v of viable) {
    const sub3 = reduceSystem(system, [bodyId, v.node.id, star.id, helio.id]);
    if (!eclipsesEveryOrbit(sub3, bodyId, v.node.id, star.id, helio.id, fromMs, v.pair, helioPeriodMs)) continue;
    const s = makeSampler(sub3, bodyId, v.node.id, star.id).at(fromMs);
    const ratio = s && s.starRad > 0 ? s.occRad / s.starRad : 0;
    return withMega({
      next: {
        timeMs: null, everyOrbit: true, periodMs: v.pair.periodMs,
        obscuration: Math.min(1, ratio * ratio), kind: ratio >= 1 ? 'total' : 'annular', ratio,
        occulterId: v.node.id, occulterName: String(v.node.name ?? ''),
        starId: star.id, starName: String(star.name ?? ''), approximate: true
      },
      candidates, searchedToMs: fromMs, budgetExhausted: false
    });
  }

  for (const v of viable) {
    if (spent >= MAX_SAMPLES) { budgetExhausted = true; break; }
    const limit = best?.timeMs ?? fromMs + horizonMs; // no point searching past a better answer
    const sub3 = reduceSystem(system, [bodyId, v.node.id, star.id, helio.id]);
    const sampler = makeSampler(sub3, bodyId, v.node.id, star.id);
    // 16 samples an orbit. The separation runs smoothly through one broad minimum per orbit, so this
    // brackets it comfortably; the bracket is then closed by golden section, which is where the
    // precision actually comes from. Sampling finer than the bracket needs is pure cost.
    const step = v.pair.periodMs / 16;
    // Gate only when the fine search would be long — i.e. when the occulter is fast relative to the
    // system's own year. When it is slow the fine search is cheap and the gate would only add cost.
    const gate = v.pair.periodMs * 64 < helioPeriodMs
      ? seasonGate(sub3, bodyId, v.node.id, star.id, fromMs, v.pair)
      : null;
    const gateStride = Math.max(step, helioPeriodMs / 512);

    let t = fromMs;
    let prev: number | null = null, cur: number | null = null, tPrev = t, tCur = t;
    let found: EclipsePrediction | null = null;
    while (t < limit && spent + sampler.used < MAX_SAMPLES) {
      if (gate && !gate(t)) { t += gateStride; prev = cur = null; continue; }
      const s = sampler.at(t);
      if (!s) break;
      if (prev !== null && cur !== null && cur <= prev && cur <= s.sep) {
        // Local minimum bracketed by [tPrev, t] — refine and test it.
        const tm = refineMinimum(sampler, tPrev, t);
        const m = sampler.at(tm);
        if (m) {
          const obs = discObscuration(m.sep, m.starRad, m.occRad);
          if (obs >= floor) {
            found = {
              timeMs: tm, everyOrbit: false, periodMs: v.pair.periodMs,
              obscuration: obs, kind: eclipseKind(m.sep, m.starRad, m.occRad),
              ratio: m.starRad > 0 ? m.occRad / m.starRad : 0,
              occulterId: v.node.id, occulterName: String(v.node.name ?? ''),
              starId: star.id, starName: String(star.name ?? ''), approximate: true
            };
            break;
          }
        }
      }
      prev = cur; cur = s.sep; tPrev = tCur; tCur = t;
      t += step;
    }
    spent += sampler.used;
    if (spent >= MAX_SAMPLES) budgetExhausted = true;
    searchedToMs = Math.max(searchedToMs, Math.min(t, limit));
    if (found && (!best || found.timeMs! < best.timeMs!)) best = found;
  }

  return withMega({ next: best, candidates, searchedToMs, budgetExhausted });
}

// --- Caching: compute when a reader asks, and again only once the answer has expired -------------

interface CacheEntry { system: System; from: number; validToMs: number; outlook: EclipseOutlook }
const cache = new Map<string, CacheEntry>();

/**
 * The reader-facing entry point: the same answer as `nextEclipse`, computed at most once until the
 * event it predicted has actually passed.
 *
 * That is the whole caching rule and it comes straight from how the thing is read — a panel showing a
 * date only needs a new date once the old one is behind the clock. A "nothing found" answer is cached
 * against the horizon it searched to, because that is the expensive case and re-running it on every
 * render is what would hurt.
 *
 * Keyed on the system OBJECT as well as its id, so any edit that replaces the system drops the entry
 * rather than serving an answer derived from bodies that have since changed.
 */
export function nextEclipseCached(
  system: System | null,
  bodyId: string,
  nowMs: number,
  opts: { floor?: number; horizonMs?: number } = {}
): EclipseOutlook | null {
  if (!system) return null;
  const key = `${system.id}:${bodyId}`;
  const hit = cache.get(key);
  if (hit && hit.system === system && nowMs >= hit.from && nowMs < hit.validToMs) return hit.outlook;
  const outlook = nextEclipse(system, bodyId, nowMs, opts);
  // An every-orbit cycle has no date to expire, so it holds until the system itself changes.
  const validToMs = outlook.next?.everyOrbit ? Infinity : (outlook.next?.timeMs ?? outlook.searchedToMs);
  cache.set(key, { system, from: nowMs, validToMs, outlook });
  return outlook;
}

/** Drop everything — for tests, and for a wholesale campaign reload. */
export function clearEclipseCache(): void { cache.clear(); }

// --- Presentation: one wording, so every surface says the same thing ----------------------------

/** A duration as something a person would say, rather than a number of milliseconds. */
function saySpan(ms: number): string {
  if (ms < DAY_MS) return `${(ms / 3600_000).toFixed(1)} h`;
  // Days stay days out past a year: "in 107 d" is something you can plan around, "in 0.3 y" is not.
  if (ms < 400 * DAY_MS) return `${Math.round(ms / DAY_MS)} d`;
  return `${(ms / YEAR_MS).toFixed(1)} y`;
}

/**
 * The one sentence this feature produces, built here rather than at each surface — the same string
 * has to reach the GM panel, the printed player report and the info panels on the player views, and
 * three places writing it is three places to drift.
 *
 * The CALENDAR is not this module's business: a campaign defines its own, so an absolute date only
 * appears if the caller hands over a formatter. Without one it still says WHEN, relatively, which is
 * the more useful half at a table anyway.
 */
export function describeEclipse(
  p: EclipsePrediction, nowMs: number, formatDate?: (ms: number) => string
): string {
  const depth = p.obscuration >= 0.995 ? 'total' : `${Math.round(p.obscuration * 100)}% ${p.kind}`;
  // G58: a megastructure's standing shadow has no date and never will - say the standing thing.
  if (p.permanent) return `permanent - ${depth} (${p.occulterName})`;
  if (p.everyOrbit) {
    const each = p.durationMs ? ` for ~${saySpan(p.durationMs)}` : '';
    return `every ${saySpan(p.periodMs)}${each} - ${depth} (${p.occulterName})`;
  }
  const when = formatDate ? formatDate(p.timeMs!) : `in ${saySpan(Math.max(0, p.timeMs! - nowMs))}`;
  return `${when} - ${depth} (${p.occulterName})`;
}

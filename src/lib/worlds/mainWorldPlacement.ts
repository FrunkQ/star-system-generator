// WHERE A MAIN WORLD GOES, AND WHAT IT IS (G87).
//
// A user, through the owner: "could you maybe add an option when importing Traveller sector data to
// always place the system's main world inside the habitable area? Because the tool often places the
// main worlds at such orbits that they have some unreasonable surface temperatures, either way too
// high or way too low."
//
// THE CAUSE WAS A TABLE OF SOL'S SPACING STANDING IN FOR A DERIVATION THE ENGINE ALREADY DOES.
// `traveller/importer.ts` carried `HZ_ANCHORS` per spectral LETTER (O:11, B:9, A:7, F:5, G:3, K:2,
// M:0) indexing a hardcoded `BODE_TABLE` of AU slots, so EVERY G star put its main world at 0.85 AU
// and every M star at 0.17 AU whatever their luminosity. A late M dwarf's real band is nearer
// 0.03-0.08 AU, so 0.17 AU is a frozen world; a bright G0 V's band sits beyond 1 AU, so 0.85 AU is a
// hot one. That is the NEVER ASSUME AN EARTH/SOL BASELINE rule and the SCATTERED CONSTANTS rule
// broken in the same eight lines, two modules away from `physics/zones.ts`, which derives the real
// band from the star's own luminosity and has all along.
//
// SO THIS MODULE CONTAINS NO SPECTRAL-CLASS TABLE AND NO AU TABLE. It asks the engine where the band
// is and answers inside it. If it ever grows one, the bug is back.
//
// THE OWNER'S DESIGN, and each sentence is a rule below:
//   "shortlist a bundle of planet types that come with decent atmospheres... ensure we include one
//    that is 'humanish compatible'"            -> a ranked CANDIDATE list, passed in, never hardcoded
//   "we don't want them all entirely earth like; some will require breathing masks"
//                                              -> a TOLERANCE LADDER: breathable / mask / sealed
//   "they will always TRY and pop a main world down unless it couldn't have a decent population,
//    even if they have to live underground occasionally"
//                                              -> work DOWN the ladder; decline only as a last act,
//                                                 and SAY SO
//   "sometimes the main world is actually a moon (of a gas giant presumably)"
//                                              -> answer a HOST, not just an orbit
//   "this needs to be deterministic so the same object fires for each user in the same way"
//                                              -> seeded from the system's own identity, never array
//                                                 order and never a clock
//
// AND TRAVELLER'S OWN DATA IS THE AUTHORITY, WHICH IS THE STEER-DON'T-STOP RULE ARRIVING FROM THE
// OTHER SIDE. A world the UWP declares hostile is not quietly moved somewhere pleasant: the user
// asked for that bypass in the same breath as the request, and the two agree.
import type { Barycenter, CelestialBody, RulePack } from '$lib/types';
import { calculateGoldilocksZone } from '$lib/physics/zones';
import { SeededRNG } from '$lib/traveller/rng';
// THE ORBIT SOLVER IS SHARED, NOT COPIED. `worlds/orbitSolver` answers "where does this star produce
// THAT?" for anything - a temperature, a range, a solvent's liquid band - and the owner asked for it
// as a reusable authoring feature in its own right. This module is its first caller, not its owner.
import { fitOrbit, minimumOrbitAU, temperatureAtOrbit } from './orbitSolver';

/** Kilometres in an astronomical unit, for the moon orbit below. */
const AU_KM = 149597870.7;

/**
 * How far into the habitable zone a breathable world may be spread, as a fraction of the band.
 *
 * The INNER half only. The outer half of a conservative band needs a thick CO2 greenhouse to stay
 * liquid at all, which a breathable nitrogen-oxygen atmosphere does not provide - measured, a world
 * placed out there came back at 204 K with no surface liquid. Half is the honest reach of "cold, but
 * people live here".
 */
const BREATHABLE_BAND_SPREAD = 0.5;

// ---------------------------------------------------------------- reading the shortlist from the pack
//
// The profiles and the bypass codes are `planets.json distributions.main_world_profiles` and
// `.main_world_bypass_codes` (G87 job 2). They are DATA because the owner asked for a shortlist he
// can tweak, and because a list of world types living in a placement module is the same fault as a
// table of AU slots living in an importer.
//
// A PACK THAT DECLARES NEITHER STILL WORKS. The fallbacks below are the minimum honest answer - one
// sealed profile that accepts any atmosphere, and no bypass codes - so an older or third-party pack
// degrades to "place it in the band and say people need suits" rather than to an exception.

/** The shortlist, in the order the pack declares it. */
export function mainWorldProfilesFromPack(pack: RulePack | null | undefined): MainWorldCandidate[] {
  const entries = (pack?.distributions as any)?.['main_world_profiles']?.entries;
  if (!Array.isArray(entries) || !entries.length) {
    return [{ template: 'planet/terrestrial', grade: 'sealed', atmosphere: [0, 15] }];
  }
  return entries.map((e: any) => e.value as MainWorldCandidate);
}

/** The trade codes that forbid moving a world. */
export function mainWorldBypassCodesFromPack(pack: RulePack | null | undefined): string[] {
  const entries = (pack?.distributions as any)?.['main_world_bypass_codes']?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.map((e: any) => String(e.value));
}

/** How much a human needs to survive outside. The owner's ladder, in order. */
export type ToleranceGrade = 'breathable' | 'mask' | 'sealed';

export const TOLERANCE_ORDER: ToleranceGrade[] = ['breathable', 'mask', 'sealed'];

/**
 * One entry from the shortlist. THE LIST IS PASSED IN, NOT DEFINED HERE - it is rule-pack data
 * (`planets.json distributions.main_world_profiles`), because the owner asked for a shortlist he can
 * tweak and because a list of world types in a placement module is the same fault as a table of AU
 * slots in an importer.
 *
 * `template` AND `readsAs` ARE NOT THE SAME KIND OF THING, and conflating them would break a
 * standing rule. `template` is a GENERATION template - a real `statTemplates` key, of which the pack
 * has exactly three - and it is an INPUT. `readsAs` is what the CLASSIFIER is expected to make of
 * the finished world (`planet/earth-like`, `planet/ocean`, and the sixty-odd others) and it is
 * DERIVED: those names are classifier fingerprints matched from the world's own physics, so handing
 * one to the generator would be a derived class used as a physics input, which is PHY-1's corollary
 * and what `system/idempotence.test.ts` exists to catch. `readsAs` is documentation for the GM and
 * for the reason text. Nothing may pass it to generation, and `mainWorldPlacement.spec.ts` asserts
 * that `template` is always one of the pack's real keys.
 */
export interface MainWorldCandidate {
  /** A GENERATION template: a real `statTemplates` key. An input. */
  template: string;
  /** What the classifier is EXPECTED to call the result. Derived, documentation only, never an input. */
  readsAs?: string;
  grade: ToleranceGrade;
  /** Inclusive UWP atmosphere digits this profile can honestly express. */
  atmosphere: [number, number];
  /** Inclusive UWP hydrographics digits, when the profile demands them. */
  hydrographics?: [number, number];
}

/** The UWP's physical block, already decoded to numbers, plus the codes Traveller stamps on it. */
export interface MainWorldFacts {
  sizeDigit: number;
  atmosphereDigit: number;
  hydrographicsDigit: number;
  populationDigit: number;
  tradeCodes: string[];
  /**
   * The temperature range the world's own atmosphere template declares, when the pack has one -
   * `atmospheres.json distributions.atmosphere_composition`, where all seventeen Traveller templates
   * carry a `temp_range_K`. THIS IS WHAT DECIDES THE ORBIT. Absent, the world is centred in the band.
   */
  atmosphereTempRangeK?: [number, number] | null;
}

export interface MainWorldContext {
  /** The star the world belongs to - Traveller's own answer, not ours to choose. */
  star: CelestialBody;
  /** The system as it stands, so an occupied band can be seen. */
  nodes: (CelestialBody | Barycenter)[];
  /** The shortlist, ranked best-first within each grade. Pack data. */
  candidates: MainWorldCandidate[];
  /** Trade codes that forbid moving this world. Pack data. */
  bypassTradeCodes: string[];
  /** The system's own identity. NEVER a clock and never an array index. */
  seed: string;
}

export interface MainWorldPlacement {
  /** Whose orbit the world sits in: the star, or a giant already holding the band. */
  host: { id: string; kind: 'star' | 'giant' };
  /** Semi-major axis about THAT host, in AU. */
  a_AU: number;
  /** The GENERATION template to build with. Never a derived class. */
  template: string | null;
  /** What the classifier is expected to make of it - for the GM, never fed back in. */
  readsAs: string | null;
  grade: ToleranceGrade | null;
  /** True when this module chose the orbit; false when it declined or was bypassed. */
  placed: boolean;
  /** True when a trade code forbade moving the world - the caller keeps its own behaviour. */
  bypassed: boolean;
  /** Plain words, for a GM and for a session reading this back in six months. */
  reason: string;
  /** The band this was decided against, so a caller can report it. */
  zone: { inner: number; outer: number };
}

// THE ORBIT COMES FROM THE TEMPERATURE THE ATMOSPHERE ITSELF DECLARES, and this replaced a table of
// band FRACTIONS I had guessed at - "thicker air traps more heat, so it can sit further out". That
// premise is wrong in this engine and the browser proved it: an M5 V main world with a dense N2/O2
// atmosphere, placed in the outer half of the conservative habitable zone, came out at 204 K
// (-69 C) with "no surface liquid (frozen?)" and a habitability temperature score of ZERO. Its
// `greenhouseTempK` was 0.35 K - because the conservative band's OUTER edge is defined by a
// CO2-dominated maximum greenhouse, and a nitrogen-oxygen atmosphere gets almost none of it.
//
// A GUESSED RULE OF THUMB PUT THE WORLD IN THE BAND AND STILL FROZE IT, WHICH IS THE USER'S ACTUAL
// COMPLAINT ("unreasonable surface temperatures, either way too high or way too low") ARRIVING BY A
// NEW ROUTE. Being inside the habitable zone was never the goal; being at a liveable temperature is,
// and the two are not the same thing.
//
// AND THE PACK ALREADY SAYS WHAT EACH ATMOSPHERE WANTS. Every one of the seventeen Traveller
// atmosphere templates in `atmospheres.json distributions.atmosphere_composition` carries its own
// `temp_range_K`: Traveller-6 (Standard, Earth-like) 280-310, Traveller-B (Corrosive, Venusian)
// 700-750, Traveller-F (Thin/Low, Methane) 80-120. So the world is placed at the orbit that gives it
// the temperature ITS OWN atmosphere declares - which needs no fractions, no spectral classes and no
// Sol baseline, and which puts a Venusian world in close and a methane world far out, both correctly.

const inRange = (v: number, range?: [number, number]) => !range || (v >= range[0] && v <= range[1]);

/**
 * The temperature range an atmosphere template usefully declares, or null when it does not.
 *
 * A VERY WIDE RANGE IS NOT A TEMPERATURE, IT IS A SHRUG. Traveller-0 (Vacuum/Trace) says 10-1000 K,
 * which is the template declining to constrain anything; fitting to the middle of it would place an
 * airless rock at 505 K for a reason nobody stated. Anything spanning more than eight-fold is
 * treated as unstated, and the world is centred in the habitable zone instead.
 */
export function usableTempRange(tempRangeK: [number, number] | null | undefined): [number, number] | null {
  if (!Array.isArray(tempRangeK) || tempRangeK.length !== 2) return null;
  const [lo, hi] = tempRangeK;
  if (!(lo > 0) || !(hi > 0) || hi < lo) return null;
  if (hi / lo > 8) return null;
  return [lo, hi];
}

/**
 * A GIANT ALREADY HOLDING THE BAND, if there is one.
 *
 * The owner's edge case, and the rule is his: "sometimes the main world is actually a moon (of a gas
 * giant presumably)". Traveller's own generation says that when the habitable orbit is taken by a
 * giant, the UWP does not break - the main world becomes a SATELLITE of that giant and still sits in
 * the star's habitable zone, which preserves every environmental requirement the UWP states.
 *
 * THIS IS A DIFFERENT ROUTE FROM THE `Sa` TRADE CODE, and they must not be confused. `Sa` is
 * Traveller DECLARING the main world a satellite, and it wins whatever the band looks like. This is
 * the band being OCCUPIED and the world becoming a moon as a consequence. One is data, one is
 * derived, and both end at the same answer shape - which is the whole reason this returns a host.
 */
export function giantOccupyingBand(
  nodes: (CelestialBody | Barycenter)[],
  starId: string,
  zone: { inner: number; outer: number }
): CelestialBody | null {
  const giants = nodes.filter((n): n is CelestialBody => {
    if ((n as CelestialBody).kind !== 'body') return false;
    const b = n as CelestialBody;
    if (b.parentId !== starId) return false;
    const a = b.orbit?.elements?.a_AU;
    if (!(typeof a === 'number' && a >= zone.inner && a <= zone.outer)) return false;
    return (b.classes ?? []).some((c) => /gas-giant|ice-giant|giant/.test(c));
  });
  // Deterministic when several qualify: the heaviest, then the id, never array order.
  return giants.sort((a, b) => (b.massKg ?? 0) - (a.massKg ?? 0) || a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * WHERE THIS MAIN WORLD GOES AND WHAT IT IS. Pure: same inputs, same answer, on every machine.
 *
 * Nothing here writes to a body. The caller decides what to do with the answer, which is what lets
 * the same model serve the Traveller importer and, later, the Traveller creation system.
 */
export function placeMainWorld(facts: MainWorldFacts, context: MainWorldContext): MainWorldPlacement {
  const { star, nodes, candidates, bypassTradeCodes, seed } = context;
  const zone = calculateGoldilocksZone(star, nodes);
  // EVERY FIELD HAS A DEFAULT HERE, and that is not tidiness: the two SUCCESS paths below spread this
  // and set only what they change, so a field missing from it comes back `undefined` from exactly the
  // paths that matter most. `bypassed` did, and the gate caught it before the importer ever saw it.
  const base = {
    host: { id: star.id, kind: 'star' as const },
    zone,
    template: null as string | null,
    readsAs: null as string | null,
    grade: null as ToleranceGrade | null,
    placed: false,
    bypassed: false
  };

  // 1. TRAVELLER'S DATA WINS. A world its own codes declare hostile is not moved anywhere kinder.
  const hostile = facts.tradeCodes.filter((c) => bypassTradeCodes.includes(c));
  if (hostile.length) {
    return {
      ...base,
      a_AU: 0,
      placed: false,
      bypassed: true,
      reason: `Traveller marks this world ${hostile.join(', ')}, so its orbit is left exactly as the sector data implies. A world meant to be hostile stays hostile.`
    };
  }

  // 2. WHICH TYPE, working DOWN the tolerance ladder. The best grade the UWP can honestly support -
  //    never a nicer one than its own atmosphere and oceans allow.
  const fits = candidates.filter(
    (c) => inRange(facts.atmosphereDigit, c.atmosphere) && inRange(facts.hydrographicsDigit, c.hydrographics)
  );
  const chosen =
    TOLERANCE_ORDER.map((g) => fits.find((c) => c.grade === g)).find(Boolean) ?? null;

  // 3. ALWAYS TRY TO PLACE SOMEBODY. Declining is a last act and it says why - it never falls back
  //    silently, which is what the old table did by existing.
  if (!chosen) {
    return {
      ...base,
      a_AU: 0,
      placed: false,
      bypassed: false,
      reason: `No main-world type in the shortlist can express atmosphere ${facts.atmosphereDigit} with hydrographics ${facts.hydrographicsDigit}, so this world is left where the sector data puts it rather than being made into something it is not.`
    };
  }

  // 4. WHERE. The orbit at which this star heats the world to the temperature its own atmosphere
  //    declares - not a fraction of the band, which is what froze a dense-atmosphere world at 204 K.
  //    Deterministic from the system's own identity, so two GMs importing the same sector agree.
  const rng = new SeededRNG(`${seed}|main-world-placement`);
  const starFigures = { temperatureK: star.temperatureK ?? 0, radiusKm: star.radiusKm ?? 0 };
  const range = usableTempRange(facts.atmosphereTempRangeK);
  // AIM AT THE LOW END OF THE DECLARED RANGE, NOT ITS MIDDLE. The template states a SURFACE
  // temperature and this solves an EQUILIBRIUM one, and an atmosphere can only warm a world - so the
  // equilibrium figure is a FLOOR. Aiming at the bottom of the range leaves the greenhouse somewhere
  // to put the world; aiming at the middle guarantees overshooting whenever the air is thick.
  const fit = range
    ? fitOrbit(starFigures, { kind: 'temperature', targetK: range[0], label: `${range[0]}-${range[1]} K, the range its own atmosphere declares` })
    : null;
  const solved = fit?.orbitAU ?? null;
  const targetK = fit ? Math.round(fit.temperatureK) : null;

  // A SHIRT-SLEEVE WORLD IS HELD INSIDE THE BAND WHATEVER ITS TEMPLATE ASKS FOR. The owner's rule:
  // atmosphere 4-9 must be in the habitable zone, or the UWP invalidates itself - liquid water at a
  // standard pressure is what those digits MEAN.
  //
  // BUT "SHIRT-SLEEVE" IS THE ATMOSPHERE, NOT THE WEATHER, and the band is not a comfort rating.
  // Owner, 2026-09-08: "some discomfort allowed... shirtsleeve can mean 'big coat' and a breather
  // mask". So a breathable world is not pinned to the band's warm inner edge, which would make every
  // main world in a sector sit at the same relative spot and read as generated; it is SPREAD across
  // the inner part of the band, seeded from the system's own identity. The warm end is somewhere you
  // would take a jacket, the cold end is somewhere you would take a coat, and both are places people
  // live. The outer half is left to worlds whose own template asks for it.
  const shirtSleeve = facts.atmosphereDigit >= 4 && facts.atmosphereDigit <= 9;
  const jitter = 1 + (rng.next() - 0.5) * 0.06;   // +-3%, so two worlds do not stack exactly
  let starOrbitAU: number;
  let where: string;
  // A PHYSICAL FLOOR, not a taste one. A template asking for 700-750 K (Traveller-B, the Venusian
  // case) solves to a very close orbit, because this engine reaches those temperatures by proximity
  // rather than by the runaway greenhouse that actually does it on Venus. Twenty stellar radii is
  // where a rocky body stops surviving as one; nothing is placed inside it whatever its template says.
  const floorAU = minimumOrbitAU(starFigures);
  if (solved != null) {
    // THE JITTER IS APPLIED BEFORE THE CLAMP, NOT AFTER, and the order is the whole point: clamping
    // a shirt-sleeve world to the band's edge and THEN multiplying by 0.97 puts it back outside the
    // band by three per cent, which is exactly what the importer gate caught.
    const withFloor = Math.max(solved * jitter, floorAU);
    if (!shirtSleeve || (withFloor >= zone.inner && withFloor <= zone.outer)) {
      starOrbitAU = withFloor;
      where = `where this star heats it to about ${Math.round(temperatureAtOrbit(starFigures, withFloor) ?? targetK!)} K, which is what its own atmosphere asks for`;
    } else {
      // Inside the band, spread across its inner half - jacket weather at one end, coat weather at
      // the other, and both liveable. Seeded, so a sector's worlds vary and two GMs still agree.
      const spread = zone.inner + (zone.outer - zone.inner) * BREATHABLE_BAND_SPREAD * rng.next();
      starOrbitAU = spread;
      const reachedK = Math.round(temperatureAtOrbit(starFigures, spread) ?? 0);
      where = `inside the habitable zone at about ${reachedK} K, because a breathable atmosphere belongs in that band - warm enough to live in, though you would want a coat`;
    }
  } else {
    // No declared range: centre it in the band, which is the least-committed honest answer.
    starOrbitAU = Math.min(zone.outer, Math.max(zone.inner, (zone.inner + (zone.outer - zone.inner) * 0.35) * jitter));
    where = 'in the middle of the habitable zone, because its atmosphere states no temperature of its own';
  }

  // 5. IS THE BAND ALREADY TAKEN BY A GIANT? Then the world is that giant's moon, and it is still in
  //    the habitable zone - which is the point, and why the UWP survives intact.
  const giant = giantOccupyingBand(nodes, star.id, zone);
  if (giant) {
    const hostRadiusKm = Math.max(1000, giant.radiusKm ?? 1000);
    // 20-80 host radii: far enough to be a world rather than a ring, close enough to be bound.
    // The same span the importer's own satellite path already uses, so the two agree.
    const moonAU = (hostRadiusKm * (20 + 60 * rng.next())) / AU_KM;
    return {
      ...base,
      host: { id: giant.id, kind: 'giant' },
      a_AU: moonAU,
      template: chosen.template,
      readsAs: chosen.readsAs ?? null,
      grade: chosen.grade,
      placed: true,
      reason: `The habitable zone (${zone.inner.toFixed(3)}-${zone.outer.toFixed(3)} AU) is already held by ${giant.name ?? 'a giant'}, so the main world is a moon of it and stays inside the band - which keeps every environmental figure the UWP states. Life outside needs ${describeGrade(chosen.grade)}.`
    };
  }

  return {
    ...base,
    a_AU: starOrbitAU,
    template: chosen.template,
    readsAs: chosen.readsAs ?? null,
    grade: chosen.grade,
    placed: true,
    reason: `Placed at ${starOrbitAU.toFixed(3)} AU - ${where}. This star's habitable zone is ${zone.inner.toFixed(3)}-${zone.outer.toFixed(3)} AU, worked out from its own luminosity rather than assumed from its spectral class. Life outside needs ${describeGrade(chosen.grade)}.`
  };
}

function describeGrade(grade: ToleranceGrade): string {
  if (grade === 'breathable') return 'nothing - the air is breathable';
  if (grade === 'mask') return 'a breathing mask';
  return 'a sealed suit, or a life lived underground';
}

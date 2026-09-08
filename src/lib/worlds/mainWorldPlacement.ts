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
import type { Barycenter, CelestialBody } from '$lib/types';
import { calculateGoldilocksZone } from '$lib/physics/zones';
import { SeededRNG } from '$lib/traveller/rng';

/** How much a human needs to survive outside. The owner's ladder, in order. */
export type ToleranceGrade = 'breathable' | 'mask' | 'sealed';

export const TOLERANCE_ORDER: ToleranceGrade[] = ['breathable', 'mask', 'sealed'];

/**
 * One entry from the shortlist. THE LIST IS PASSED IN, NOT DEFINED HERE - it is rule-pack data
 * (G87 job 2), because the owner asked for a shortlist he can tweak and because a list of world
 * types in a placement module is the same fault as a table of AU slots in an importer.
 */
export interface MainWorldCandidate {
  /** The engine class this world is built as, e.g. `planet/earth-like`. */
  type: string;
  grade: ToleranceGrade;
  /** Inclusive UWP atmosphere digits this type can honestly express. */
  atmosphere: [number, number];
  /** Inclusive UWP hydrographics digits, when the type demands them. */
  hydrographics?: [number, number];
}

/** The UWP's physical block, already decoded to numbers, plus the codes Traveller stamps on it. */
export interface MainWorldFacts {
  sizeDigit: number;
  atmosphereDigit: number;
  hydrographicsDigit: number;
  populationDigit: number;
  tradeCodes: string[];
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
  type: string | null;
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

// WHERE IN THE BAND, BY WHAT THE WORLD IS WEARING. A fraction of the way from the band's inner edge
// to its outer, because the band is derived per star and a fraction of it travels; an AU figure
// would not. Thicker air traps more heat and can therefore sit FURTHER OUT and stay liveable; thin
// air needs more light and sits nearer in. Airless rock has no preference worth stating, so it takes
// the middle. Exotic and corrosive atmospheres are the Venus and Titan cases and genuinely go
// anywhere, so their range is the whole band.
//
// UWP atmosphere digits: 0 none, 1 trace, 2-3 very thin, 4-5 thin, 6 standard, 7 standard tainted,
// 8-9 dense, A exotic, B corrosive, C insidious, D dense high, E thin low, F unusual.
export const BAND_FRACTION_BY_ATMOSPHERE: Record<string, [number, number]> = {
  vacuum: [0.3, 0.7],   // 0, 1
  thin: [0.15, 0.45],   // 2, 3, 4, 5, E
  standard: [0.3, 0.65], // 6, 7
  dense: [0.5, 0.85],   // 8, 9, D
  exotic: [0.1, 0.9]    // A, B, C, F
};

/** Which band-fraction family a UWP atmosphere digit belongs to. */
export function atmosphereFamily(digit: number): keyof typeof BAND_FRACTION_BY_ATMOSPHERE {
  if (digit <= 1) return 'vacuum';
  if (digit <= 5 || digit === 14) return 'thin'; // 14 = 'E', thin low
  if (digit <= 7) return 'standard';
  if (digit === 8 || digit === 9 || digit === 13) return 'dense'; // 13 = 'D', dense high
  return 'exotic'; // A, B, C, F
}

const inRange = (v: number, range?: [number, number]) => !range || (v >= range[0] && v <= range[1]);

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
    type: null as string | null,
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

  // 4. WHERE IN THE BAND. Deterministic from the system's own identity, so two GMs importing the
  //    same sector get the same sky.
  const rng = new SeededRNG(`${seed}|main-world-placement`);
  const [lo, hi] = BAND_FRACTION_BY_ATMOSPHERE[atmosphereFamily(facts.atmosphereDigit)];
  const fraction = lo + (hi - lo) * rng.next();
  const starOrbitAU = zone.inner + (zone.outer - zone.inner) * fraction;

  // 5. IS THE BAND ALREADY TAKEN BY A GIANT? Then the world is that giant's moon, and it is still in
  //    the habitable zone - which is the point, and why the UWP survives intact.
  const giant = giantOccupyingBand(nodes, star.id, zone);
  if (giant) {
    const hostRadiusKm = Math.max(1000, giant.radiusKm ?? 1000);
    const AU_KM = 149597870.7;
    // 20-80 host radii: far enough to be a world rather than a ring, close enough to be bound.
    // The same span the importer's own satellite path already uses, so the two agree.
    const moonAU = (hostRadiusKm * (20 + 60 * rng.next())) / AU_KM;
    return {
      ...base,
      host: { id: giant.id, kind: 'giant' },
      a_AU: moonAU,
      type: chosen.type,
      grade: chosen.grade,
      placed: true,
      reason: `The habitable zone (${zone.inner.toFixed(3)}-${zone.outer.toFixed(3)} AU) is already held by ${giant.name ?? 'a giant'}, so the main world is a moon of it and stays inside the band - which keeps every environmental figure the UWP states. Life outside needs ${describeGrade(chosen.grade)}.`
    };
  }

  return {
    ...base,
    a_AU: starOrbitAU,
    type: chosen.type,
    grade: chosen.grade,
    placed: true,
    reason: `Placed at ${starOrbitAU.toFixed(3)} AU, inside this star's own habitable zone of ${zone.inner.toFixed(3)}-${zone.outer.toFixed(3)} AU, derived from its luminosity rather than assumed from its spectral class. Life outside needs ${describeGrade(chosen.grade)}.`
  };
}

function describeGrade(grade: ToleranceGrade): string {
  if (grade === 'breathable') return 'nothing - the air is breathable';
  if (grade === 'mask') return 'a breathing mask';
  return 'a sealed suit, or a life lived underground';
}

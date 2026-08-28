// §4c — "add by viable type". Given a planet TYPE (its classifier fingerprint) and an orbit, build a
// body with randomised parameters that will CLASSIFY as that type. The fingerprint bands ARE the
// recipe: pick a value inside each defining band (mass, radius/makeup, hydrosphere, atmosphere,
// biosphere…). The orbit sets temperature, so a type is only offered where its T_eq band fits —
// which is why a biome/life world can be dropped into the Goldilocks zone and a lava world can't.
import type { CelestialBody, Fingerprint, FingerprintBand, Makeup } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM, LIQUIDS } from '$lib/constants';
import { radiusReFromMassMakeup, gasThermalInflationFactor } from '$lib/physics/makeup';

type RNG = () => number;

function pick(band: FingerprintBand | undefined, rng: RNG, fallback: number): number {
  if (Array.isArray(band) && typeof band[0] === 'number') {
    const [lo, hi] = band as [number, number];
    return lo + rng() * (hi - lo);
  }
  return fallback;
}
// Log-uniform pick — for a band that spans orders of magnitude (giant masses), so the draw isn't biased
// to the high end. A helium giant's [10, 4000] M⊕ band then favours a ~Jupiter mass, not a brown dwarf.
function pickLog(band: FingerprintBand | undefined, rng: RNG, fallback: number): number {
  if (Array.isArray(band) && typeof band[0] === 'number') {
    const lo = Math.max(1e-6, band[0] as number), hi = Math.max(lo, band[1] as number);
    return Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)));
  }
  return fallback;
}
function pickStr(band: FingerprintBand | undefined): string | undefined {
  if (typeof band === 'string') return band;
  if (Array.isArray(band) && typeof band[0] === 'string') return (band as string[])[0];
  return undefined;
}

// Pick a hydrosphere solvent that is actually LIQUID at this orbit's equilibrium temperature, so any
// solvent — not just water — can appear on a generated world where physics allows: a cryo world gets
// nitrogen/methane/ethane, a hot world sulfuric acid or a magma/molten-iron sea. Excludes 'internal'
// derived-only fluids (cloud-deck / interior layers, never surface oceans). Only used when the type's
// fingerprint does NOT pin a composition — a water/methane ocean type keeps its designed solvent.
// Falls back to water when nothing fits (the processor's phase check then reads it honestly).
function pickSolventForTemp(teqK: number | undefined, rng: RNG): string {
  const t = teqK ?? 288;
  const candidates = LIQUIDS.filter((l) => l.family !== 'internal' && t >= l.meltK && t <= l.boilK);
  if (!candidates.length) return 'water';
  return candidates[Math.floor(rng() * candidates.length)].name;
}

// Greenhouse COLD-EDGE slack (Kelvin). The fingerprint T_eq bands are the BARE equilibrium
// temperature (no atmosphere) — but we KNOW these particular types carry a greenhouse-warming
// atmosphere by definition (Earth's own T_eq is 255 K / −18 °C; its 1-bar greenhouse lifts the
// surface to 288 K). So when offering them in the picker we extend the COLD edge downward by the
// greenhouse warming that type can plausibly muster, so an Earth-like/ocean world is still offered
// at an orbit whose bare T_eq looks "too cold". (Cold edge only — the warm edge is the real
// runaway-greenhouse limit and is NOT extended.) The generator then gives the body that atmosphere.
const GREENHOUSE_COLD_SLACK_K: { test: RegExp; k: number }[] = [
  { test: /hycean/, k: 80 },                                                  // H2 envelope — very strong greenhouse
  { test: /ocean|earth-analogue|earth-like|superhabitable|forest|jungle|swamp|eyeball/, k: 40 }, // Earth-class N2/CO2/H2O
  { test: /desert|ammonia/, k: 20 },                                          // thinner / alternative greenhouse
];
function greenhouseColdSlackK(cls: string): number {
  return GREENHOUSE_COLD_SLACK_K.find((g) => g.test.test(cls))?.k ?? 0;
}

// Types DESIGNED to hold a liquid-WATER ocean kept liquid by a greenhouse atmosphere — these get an
// orbit-sized atmosphere in the generator. Deliberately EXCLUDES frozen worlds (ice) and dry worlds
// (desert/barren) so they stay as designed. Earth-analogue/-like/superhabitable are here too: their
// fingerprint gives only an O2 biosignature (greenhouse 0), so without this they freeze at T_eq.
const LIQUID_WATER_TYPE = /ocean|earth-analogue|earth-like|superhabitable|forest|jungle|swamp|eyeball/;

// Invert the processor's greenhouse model (MEASURED at ~1 bar: 0.04 % CO2 → +23.5 K, 0.1 % → +34.5 K,
// 0.4 % → +58 K …) to the CO2 fraction whose warming is `d` K. Used to size a habitable atmosphere to
// the orbit's coldness so the surface clears freezing.
const GH_TABLE: [number, number][] = [[0.0004, 23.5], [0.001, 34.5], [0.002, 45.2], [0.004, 58], [0.008, 72.7], [0.015, 87.6], [0.03, 105]];
function co2FractionForWarming(d: number): number {
  if (d <= GH_TABLE[0][1]) return GH_TABLE[0][0];
  for (let i = 1; i < GH_TABLE.length; i++) {
    if (d <= GH_TABLE[i][1]) { const [f0, d0] = GH_TABLE[i - 1], [f1, d1] = GH_TABLE[i]; return f0 + (f1 - f0) * ((d - d0) / (d1 - d0)); }
  }
  return GH_TABLE[GH_TABLE.length - 1][0];
}

// A moon caps at ~10% of its host's mass (Pluto–Charon, ~12%, is the extreme before it reads as a
// double planet / barycentre rather than a satellite).
export const MOON_MASS_CAP = 0.1;
// A host at/above this mass (ice-giant scale and up) can hold LARGER, atmosphered, watery moons
// (Titan, Europa, Ganymede); a terrestrial-scale host can only manage small airless/icy rock.
const GIANT_HOST_ME = 15;
// Surface / atmosphere / biosphere types that imply a SUBSTANTIAL world — implausible as a small rocky
// planet's moon, but fine around a giant. Airless / icy / volcanic rock (barren, crater, ice, lava,
// desert) stays available to any host, so a terrestrial's moon defaults to airless rock.
const SUBSTANTIAL_MOON = /ocean|hycean|forest|jungle|swamp|terrestrial|earth-analogue|earth-like|superhabitable|methane|ammonia|phosphorus|chlorine|fluorine|sulfur/;

/**
 * ONE VIABILITY MODEL FOR BOTH THE MANUAL PICKER AND THE GENERATOR.
 *
 * "Which types could exist HERE" is asked twice in this codebase — by the "Add planet/moon here…"
 * picker and by the generator choosing a type for a slot — and the standing rule is that two
 * places answering one question will drift. So this is the single answer, and the two callers
 * differ only in what they do with it:
 *
 *   - THE PICKER shows the gates at the top and lets the GM switch any of them OFF to see the wider
 *     menu DESPITE the physics. Hand authoring is hand authoring; the gates are guidance, and the
 *     tags will say what is implausible about the result.
 *   - THE GENERATOR keeps every gate ON and then SELECTS within the viable set using the knobs —
 *     rarity, metallicity, star affinity. Physics decides what CAN be here; the knobs decide which
 *     of those actually IS.
 *
 * Every gate reads a band the TYPE DECLARES (its classifier fingerprint) — temperature, mass, age —
 * so a type's own definition carries where it can be born. Adding a gate means adding a band to the
 * vocabulary, not a special case to a function.
 */

/** Which physical gates to apply. Every field defaults to ON; the picker exposes them as toggles. */
export interface ViabilityGates {
  temperature?: boolean;   // the orbit's T_eq against the type's Teq_K / SurfaceTemp_K band
  mass?: boolean;          // for a moon: fits under its host; for a planet: is a PLANET, not a pebble
  age?: boolean;           // the system's age against the type's age_Gyr band
  tidalLock?: boolean;     // a type that requires locking, only where the orbit can produce it
  hostFit?: boolean;       // moons: no giants; substantial moons need a giant host
  placementMass?: boolean; // G43/G45: a co-placement ceiling — the type must fit under the limit the PLACEMENT imposes (a pair's Gascheau limit for a trojan, the test-particle bar for a circumbinary body)
}
export const ALL_GATES: Required<ViabilityGates> = { temperature: true, mass: true, age: true, tidalLock: true, hostFit: true, placementMass: true };

/** Everything the viability question needs. Missing fields switch the gates that need them off. */
export interface SlotContext {
  role: 'planet' | 'moon';
  teqK: number;
  hostMassKg?: number;      // the direct host (star for a planet, planet for a moon)
  ageGyr?: number;          // the system's age; the age gate needs it
  canTidallyLock?: boolean; // from predictTidalLock at this orbit; the lock gate needs it
  planetMassBandMe?: [number, number]; // pack override of PLANET_MASS_BAND_ME (generation_parameters.planet_mass_band_me)
  // G43: set for a trojan placement — the heaviest body the pair's triangular points can hold
  // (physics/lagrange.maxTrojanMassKg). A gate like the others: switchable off, and an over-mass
  // authored trojan is ACCEPTED and wears the instability tags instead of being refused.
  placementMassLimitKg?: number;
}

/**
 * THE PLANET MASS BAND — a primary orbital slot gets a PLANET: not a pebble, and not a star.
 *
 * THE FLOOR. Asteroids, comets, planetesimals and mesoplanets all carry base fingerprints, so before
 * this they competed for planet slots on equal terms with terrestrials — and being rated Common, the
 * rarity ladder FAVOURED them. Measured at v2.1.772: 21% of every "planet" a Sun-like star generated
 * was below Mercury's mass and 13% below Ceres', 18% of those literally asteroids and comets. Then
 * the catch-all classes (`terrestrial`, `desert`, `barren`, `crater`, `ice`) — which declare NO mass
 * band — relabelled the wreckage, so 30% of "terrestrials" were smaller than Mercury. The floor is
 * Mercury-ish. It is also the owner's answer to "too many boring lumps of rock": realistic, perhaps,
 * but nobody plays on them, and it is a slider's job to add them back deliberately, not a default's
 * job to sprinkle them everywhere.
 *
 * THE CEILING. `brown-dwarf` and `ultra-cool-dwarf` (4100–6400 M⊕) are base fingerprints too, and
 * they sit ABOVE the 13 M_J deuterium-burning line (~4130 M⊕) — the engine's own boundary between a
 * planet and a star. Every giant class tops out at 4000 M⊕ for exactly that reason. So without a
 * ceiling a planet slot could be handed a star, and the ceiling is where the two halves of the band
 * agree with each other. It is not a hard cosmic law (a 13 M_J super-Jupiter and a 13 M_J brown
 * dwarf are the same object with two names), which is why it is pack data and switchable.
 *
 * Both edges are gates on the type's DECLARED band, judged at its geometric midpoint. Bodies either
 * side stay in the world — as moons, belt members, or companions — and in the picker when the GM
 * turns the gate off; they just do not take a headline orbit by default. Sol has Pluto; it does not
 * have Pluto at 1 AU.
 */
export const PLANET_MASS_BAND_ME: [number, number] = [0.03, 4130];

export interface GateVerdict { fp: Fingerprint; ok: boolean; failed: Array<keyof ViabilityGates> }

/**
 * Judge every base fingerprint against the context, gate by gate. Returns a verdict per type with
 * WHICH gates it failed, so the picker can say "hidden by the age gate" rather than just hiding it.
 */
export function judgeTypesAt(
  ctx: SlotContext, fingerprints: Fingerprint[], gates: ViabilityGates = ALL_GATES,
  massBandMe: [number, number] = ctx.planetMassBandMe ?? PLANET_MASS_BAND_ME
): GateVerdict[] {
  const SLACK = 0.12; // 12% — matches the classifier's soft edge
  const g = { ...ALL_GATES, ...gates };
  const isMoon = ctx.role === 'moon';
  const hostMe = (ctx.hostMassKg ?? 0) / EARTH_MASS_KG;
  const hostIsGiant = hostMe >= GIANT_HOST_ME;
  const maxMoonMe = hostMe * MOON_MASS_CAP;

  const out: GateVerdict[] = [];
  for (const fp of fingerprints) {
    if (fp.kind !== 'base') continue;
    // A rogue planet is by definition UNBOUND — placing one in an orbit makes it not-rogue, so it is
    // never offered/drawn for a bound slot. Not a gate: there is no setting under which it makes sense.
    if (/rogue/.test(fp.class)) continue;

    const failed: Array<keyof ViabilityGates> = [];
    const mb = fp.match['mass_Me'];
    const massBand = Array.isArray(mb) && typeof mb[0] === 'number' ? (mb as [number, number]) : null;

    // --- hostFit: what a MOON may be at all ---
    if (g.hostFit && isMoon) {
      // A moon can never be a member of the giant family (it orbits one) nor an eyeball (locked to
      // its planet, not the star).
      if (/giant|neptune|jupiter|helium|puff|brown|dwarf|eyeball/.test(fp.class)) failed.push('hostFit');
      // Around a terrestrial-scale host only simple airless/icy/rocky moons are plausible — the
      // substantial atmosphere/ocean/biosphere worlds need a giant host.
      else if (hostMe > 0 && !hostIsGiant && SUBSTANTIAL_MOON.test(fp.class)) failed.push('hostFit');
    }

    // --- mass ---
    if (g.mass) {
      if (isMoon) {
        // A moon must fit under its host: drop any type whose characteristic mass exceeds the cap.
        if (hostMe > 0 && massBand && massBand[0] > maxMoonMe) failed.push('mass');
      } else {
        // A planet slot gets a planet: not a pebble, and not a star. Asteroids and belts never are;
        // otherwise a type is judged on the GEOMETRIC MIDPOINT of its declared band, not its edges —
        // dwarf-planet [0.0005, 0.05] pokes a whisker over the floor at the top and then draws near
        // the bottom, which is how a 'planet' came out lighter than Ceres.
        if (fp.class.startsWith('asteroid/') || fp.class.startsWith('belt/')) failed.push('mass');
        else if (massBand) {
          const lo = Math.max(1e-9, massBand[0]), hi = Math.max(lo, massBand[1]);
          const mid = Math.sqrt(lo * hi);
          if (mid < massBandMe[0] || mid > massBandMe[1]) failed.push('mass');
        }
      }
    }

    // --- placementMass (G43/G45): the type must FIT the ceiling its PLACEMENT imposes ---
    // Judged like the moon cap: the type's declared LOWER band edge against the Gascheau limit, so
    // a type that could only be authored over-mass is hidden while one whose light end fits stays.
    if (g.placementMass && typeof ctx.placementMassLimitKg === 'number' && ctx.placementMassLimitKg >= 0) {
      const limitMe = ctx.placementMassLimitKg / EARTH_MASS_KG;
      if (massBand && massBand[0] > limitMe) failed.push('placementMass');
    }

    // --- age: late formers and early formers ---
    // A type that declares a FORMATION age band can only be BORN inside it. Protoplanets are young;
    // a chthonian needs time to be stripped; a cratered world needs time to accumulate the record.
    // Read from `fp.formation`, NOT `fp.match`: the classifier reads match, and this is one-way — a
    // body that exists classifies as what it is regardless of whether it could have formed yet.
    if (g.age && typeof ctx.ageGyr === 'number') {
      const ab = fp.formation?.['age_Gyr'];
      if (Array.isArray(ab) && typeof ab[0] === 'number') {
        const [lo, hi] = ab as [number, number];
        if (ctx.ageGyr < lo || ctx.ageGyr > hi) failed.push('age');
      }
    }

    // --- tidalLock: a type may not require a circumstance the orbit cannot produce ---
    if (g.tidalLock && ctx.canTidallyLock === false && requiresTidalLock(fp)) failed.push('tidalLock');

    // --- temperature ---
    // WHICHEVER temperature band the type declares. Most surface-describing types key on
    // SurfaceTemp_K (inbox B3, then B6) because that is what their note is about — but this menu is
    // choosing a type for a body that does not exist yet, so a surface temperature is not available
    // and cannot be: it depends on the atmosphere the generator has not given it. Reading the band
    // either way keeps the menu constrained; the cold slack below is exactly the allowance for the
    // greenhouse that will close the gap, and it was written for this. Without this fallback a
    // SurfaceTemp_K type falls through as "no temperature constraint" and lava is offered in the
    // Goldilocks zone — which is what happened to the three eyeball classes at v2.1.283.
    if (g.temperature) {
      const band = fp.match['Teq_K'] ?? fp.match['SurfaceTemp_K'];
      if (Array.isArray(band) && typeof band[0] === 'number') {
        const [lo, hi] = band as [number, number];
        const pad = (hi - lo) * SLACK;
        const okT = ctx.teqK >= lo - pad - greenhouseColdSlackK(fp.class) && ctx.teqK <= hi + pad;
        if (!okT) failed.push('temperature');
      }
    }

    out.push({ fp, ok: failed.length === 0, failed });
  }
  return out;
}

// Which base types could exist at a given equilibrium temperature (and role) around a host of a given
// mass. Kept as the simple entry point — it is judgeTypesAt with every gate on and the verdicts
// reduced to the survivors. Callers that want to explain a hidden type use judgeTypesAt directly.
export function viableTypesAt(
  teqK: number, role: 'planet' | 'moon', fingerprints: Fingerprint[], hostMassKg = 0,
  opts?: { canTidallyLock?: boolean; ageGyr?: number; gates?: ViabilityGates; planetMassBandMe?: [number, number] }
): Fingerprint[] {
  return judgeTypesAt(
    { role, teqK, hostMassKg, ageGyr: opts?.ageGyr, canTidallyLock: opts?.canTidallyLock, planetMassBandMe: opts?.planetMassBandMe },
    fingerprints, opts?.gates ?? ALL_GATES
  ).filter((v) => v.ok).map((v) => v.fp);
}

/**
 * A TYPE MAY NOT REQUIRE A CIRCUMSTANCE THE ORBIT CANNOT PRODUCE.
 *
 * The eyeball classes match on `starTidallyLocked: [1,1]`, and building a body to a fingerprint SETS
 * the fields that fingerprint declares — so drawing an eyeball MAKES the planet tidally locked, and
 * the classifier then agrees with the thing the draw invented. Nothing in the chain ever asked
 * whether the orbit could despin a planet in the time available. Measured at v2.1.763, that put
 * `hot-eyeball` on 28% of every world generated around a Sun-like star, most of them near 0.6 AU
 * where nothing locks in four and a half billion years.
 *
 * `opts.canTidallyLock` is the answer from `predictTidalLock`, asked ONCE per slot with an
 * Earth-sized probe body — the planet does not exist yet, and the lock timescale's a^6 term dwarfs
 * its dependence on the planet's own size, so "could an Earth lock here" is the honest question.
 *
 * OMITTED means ALLOWED. The manual "add by type" picker passes nothing and is unchanged: hand
 * authoring is hand authoring, and the standing rule is to show the problem in tags rather than
 * forbid the choice. This gate is for the GENERATOR, which should not be inventing the circumstance.
 */
export function requiresTidalLock(fp: Fingerprint): boolean {
  const v = fp.match?.['starTidallyLocked'];
  return Array.isArray(v) ? Number(v[0]) >= 1 : Number(v) >= 1;
}

// Build a body of the given type at an orbit. Returns the physical fields to merge onto a new body;
// temperature/geology/colour/etc. are left for the processor to derive.
export function generateBodyOfType(
  fp: Fingerprint,
  ctx: { distAU: number; hostMassKg: number; role: 'planet' | 'moon'; rng?: RNG; teqK?: number }
): Partial<CelestialBody> {
  const rng = ctx.rng ?? Math.random;
  const m = fp.match;
  const out: Partial<CelestialBody> = { classes: [fp.class], tags: [] };

  // --- Mass ---
  const isGiant = /giant|jupiter|neptune|helium|puff|brown/.test(fp.class);
  // A superhabitable world is, by thesis, a SUPER-EARTH (1.3–3.5 Me): more land + a bigger, longer-
  // lived heat engine, which is also what earns the super-habitable mass bonus and keeps it
  // tectonically active when old. So default it into that band unless the fingerprint pins a mass.
  const isSuperhab = /superhabitable/.test(fp.class);
  // A moon that doesn't get its size from a type mass-band defaults to a SMALL airless/icy body
  // (Luna ≈ 0.012 M⊕, Titan ≈ 0.023) rather than an Earth-mass world — it should not be
  // gravitationally significant to its host.
  const massFallback = isGiant ? 50 + rng() * 250
    : isSuperhab ? 1.3 + rng() * 2.2
    : ctx.role === 'moon' ? 0.002 + rng() * 0.03
    : 0.5 + rng() * 1.5;
  // Giants span orders of magnitude in mass — sample that band LOG-uniformly so most come out around a
  // Jupiter rather than piling up at the brown-dwarf top of the band. Everything else stays linear.
  let massMe = (isGiant ? pickLog : pick)(m['mass_Me'], rng, massFallback);
  // A MOON must stay well below its host (else it's a double planet / barycentre, not a satellite).
  if (ctx.role === 'moon' && ctx.hostMassKg > 0) {
    massMe = Math.min(massMe, (ctx.hostMassKg / EARTH_MASS_KG) * MOON_MASS_CAP);
  }
  out.massKg = massMe * EARTH_MASS_KG;

  // --- Composition / size: makeup if the type defines it, else radius/density bands, else derive. ---
  const mk: Makeup = {};
  let hasMakeup = false;
  for (const k of ['metal', 'rock', 'carbon', 'ice', 'gas'] as const) {
    const band = m[`makeup.${k}`];
    if (band) { mk[k] = pick(band, rng, 0); hasMakeup = true; }
  }
  // A designed-habitable rocky world needs a differentiated IRON CORE: the processor reads makeup to
  // build a molten-iron interior layer → a dynamo → a magnetosphere (no spurious "no magnetosphere"
  // −8), and the rocky mass feeds geothermal vigor → plate tectonics (which the super-habitable bonus
  // REQUIRES). Without a makeup these types relied on density inference, which left some without a
  // core. Earth ≈ 32 % metal / 68 % rock.
  if (!hasMakeup && LIQUID_WATER_TYPE.test(fp.class)) {
    mk.metal = 0.32; mk.rock = 0.68; hasMakeup = true;
  }
  // A giant with no explicit makeup is gas-dominated → its radius comes from the giant mass–radius model
  // (degeneracy keeps it ~1 R♃ across a wide mass range) plus thermal inflation, NOT an independent
  // radius/density band. Drawing radius independently of mass left heavy giants at impossible densities
  // (a 2000 M⊕ "helium" giant read as ~21 g/cc). Deriving from mass keeps the density physical.
  if (isGiant && !hasMakeup) {
    mk.gas = 0.92; mk.ice = 0.08; hasMakeup = true;
  }
  if (hasMakeup) {
    out.makeup = mk;
    const inflation = isGiant ? gasThermalInflationFactor(ctx.teqK ?? 0) : 1;
    out.radiusKm = radiusReFromMassMakeup(massMe, mk, inflation) * EARTH_RADIUS_KM;
  } else if (m['radius_Re']) {
    // The fingerprint's radius band is often just an upper bound (a planetesimal is "< 0.1 R⊕"); drawing
    // a radius straight from it INDEPENDENTLY of the mass crushed tiny bodies into impossible densities
    // (a 0.0015 M⊕ planetesimal read as 66 g/cc). Use the band radius only if it implies a physical
    // density; otherwise derive the radius from the mass at rock density (≈ 3.3 g/cc) so a small body is
    // a small body, not a neutron pebble. (Degenerate giants take the makeup path above, not this one.)
    const rRe = pick(m['radius_Re'], rng, 1);
    const densityAtBand = rRe > 0 ? (5.513 * massMe) / (rRe * rRe * rRe) : Infinity;
    out.radiusKm = (densityAtBand > 12 ? Math.cbrt((5.513 * massMe) / 3.3) : rRe) * EARTH_RADIUS_KM;
  } else if (Array.isArray(m['density'])) {
    const d = pick(m['density'], rng, 5.5);
    out.radiusKm = Math.cbrt((5.513 * massMe) / d) * EARTH_RADIUS_KM;
  } else {
    out.radiusKm = Math.cbrt(massMe) * EARTH_RADIUS_KM; // Earth-like default
  }

  // --- Hydrosphere ---
  // Ocean-family types band on `hydrosphere.liquidCoverage` (phase-gated, liquids L2); dryness/ice
  // types still band on raw `hydrosphere.coverage`. Either drives the generated coverage.
  const covBand = m['hydrosphere.liquidCoverage'] ?? m['hydrosphere.coverage'];
  let hydroComp = pickStr(m['hydrosphere.composition']);
  // When the type doesn't pin a solvent, choose one that is liquid at this orbit's temperature so
  // exotic oceans (ammonia, nitrogen, ethane, sulfuric acid, sulfur, H₂S, HCN, magma…) can appear
  // wherever physics allows, instead of always defaulting to water. Designed liquid-WATER types are
  // kept as water — they are defined by a greenhouse atmosphere that holds water liquid at an orbit
  // whose BARE T_eq looks too cold (so a temperature pick would wrongly reject water).
  if (!hydroComp && covBand) {
    hydroComp = LIQUID_WATER_TYPE.test(fp.class) ? 'water' : pickSolventForTemp(ctx.teqK, rng);
  }
  if (covBand || hydroComp) {
    out.hydrosphere = { composition: hydroComp || 'water', coverage: covBand ? pick(covBand, rng, 0.5) : 0.5 };
  }

  // --- Atmosphere ---
  const atmMain = pickStr(m['atm.main']);
  const gasBands = Object.keys(m).filter((k) => k.startsWith('atm.composition.'));
  if (atmMain || gasBands.length || m['atm.pressure_bar']) {
    const composition: Record<string, number> = {};
    for (const k of gasBands) {
      const gas = k.replace('atm.composition.', '');
      composition[gas] = pick(m[k], rng, 0.5);
    }
    const mainGas = atmMain && atmMain !== 'None' ? atmMain : (Object.keys(composition)[0] || 'N2');
    if (mainGas !== 'None' && !composition[mainGas]) composition[mainGas] = 1;
    const pressure = m['atm.pressure_bar'] ? pick(m['atm.pressure_bar'], rng, 1) : (isGiant ? 1000 : 1);
    if (atmMain === 'None') {
      out.atmosphere = { name: 'None', composition: {}, pressure_bar: 0 };
    } else {
      out.atmosphere = { name: mainGas, main: mainGas, composition, pressure_bar: pressure } as any;
    }
  }

  // A liquid-water world is DEFINED by the atmosphere that keeps its ocean liquid. Without one, the
  // surface sits at the bare T_eq (≈ −18 °C at Earth's orbit) and the ocean freezes → 0 % habitable.
  // The fingerprint often gives these types nothing, or only an O2 biosignature (greenhouse 0) — so
  // for the whole liquid-water family we (re)build an Earth-class atmosphere SIZED TO THE ORBIT: keep
  // any O2 the type called for, fill with N2, and add enough CO2 to clear freezing (more CO2 the
  // colder the orbit; none when the orbit is already at/above freezing, where the ocean's own water
  // vapour — added by the processor — suffices). Frozen (ice) and dry (desert) types are excluded.
  if (!isGiant && LIQUID_WATER_TYPE.test(fp.class) && out.hydrosphere?.composition === 'water') {
    const teq = ctx.teqK ?? 255;
    const fCO2 = teq >= 273 ? 0 : co2FractionForWarming(283 - teq);
    const o2 = (out.atmosphere?.composition as any)?.O2 ?? (m['hasBiosphere'] ? 0.21 : 0);
    const composition: Record<string, number> = {};
    if (o2 > 0) composition.O2 = +o2.toFixed(4);
    if (fCO2 > 0) composition.CO2 = +fCO2.toFixed(4);
    composition.N2 = +(1 - (composition.O2 ?? 0) - (composition.CO2 ?? 0)).toFixed(4);
    out.atmosphere = { name: 'N2', main: 'N2', composition, pressure_bar: +(0.95 + rng() * 0.2).toFixed(2) } as any;
  }

  // A liquid-METHANE world (Titan) needs atmospheric PRESSURE to hold its methane seas, but must stay
  // COLD. Give it a thick PURE-N2 atmosphere (Titan ≈ 1.5 bar N2): N2 has no greenhouse, so the world
  // stays at its cold T_eq and the methane stays liquid (any CH4 would warm it past methane's boiling
  // point at the band's warm edge). Only if the type didn't already specify an atmosphere.
  if (!isGiant && out.hydrosphere?.composition === 'methane' && (!out.atmosphere || out.atmosphere.name === 'None')) {
    out.atmosphere = { name: 'N2', main: 'N2', composition: { N2: 1 }, pressure_bar: +(1.2 + rng() * 0.6).toFixed(2) } as any;
  }

  // --- Biosphere: a biome/life type DEMANDS one (the GM placing the type places the life). ---
  if (m['hasBiosphere']) {
    out.biosphere = { complexity: 'complex', coverage: 0.6 + rng() * 0.3 } as any;
  }

  // --- Misc realism ---
  out.rotation_period_hours = m['rotation_period_hours'] ? pick(m['rotation_period_hours'], rng, 24) : 10 + rng() * 30;
  out.magneticField = { strengthGauss: isGiant ? 4 + rng() * 20 : rng() * 1.5 } as any;

  return out;
}

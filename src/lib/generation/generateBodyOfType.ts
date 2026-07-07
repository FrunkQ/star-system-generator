// §4c — "add by viable type". Given a planet TYPE (its classifier fingerprint) and an orbit, build a
// body with randomised parameters that will CLASSIFY as that type. The fingerprint bands ARE the
// recipe: pick a value inside each defining band (mass, radius/makeup, hydrosphere, atmosphere,
// biosphere…). The orbit sets temperature, so a type is only offered where its T_eq band fits —
// which is why a biome/life world can be dropped into the Goldilocks zone and a lava world can't.
import type { CelestialBody, Fingerprint, FingerprintBand, Makeup } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
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

// Which base types could exist at a given equilibrium temperature (and role) around a host of a given
// mass. A type is viable when the orbit's T_eq falls inside its T_eq band (with slack); types without a
// T_eq band are always offered on temperature. Greenhouse types get extra COLD-edge slack. Moons also
// exclude giants/eyeballs, and are MASS-GATED by the host: a terrestrial offers only small airless/icy
// moons; a gas giant offers more (bigger, watery, atmosphered). hostMassKg 0 ⇒ no mass gate.
export function viableTypesAt(teqK: number, role: 'planet' | 'moon', fingerprints: Fingerprint[], hostMassKg = 0): Fingerprint[] {
  const SLACK = 0.12; // 12% — matches the classifier's soft edge
  const isMoon = role === 'moon';
  const hostMe = hostMassKg / EARTH_MASS_KG;
  const hostIsGiant = hostMe >= GIANT_HOST_ME;
  const maxMoonMe = hostMe * MOON_MASS_CAP;
  return fingerprints.filter((fp) => {
    if (fp.kind !== 'base') return false;
    // A rogue planet is by definition UNBOUND — placing one in an orbit makes it not-rogue, so it's
    // never offered/drawn for a bound slot (the classifier still uses it for genuinely unbound bodies).
    if (/rogue/.test(fp.class)) return false;
    // A moon can never be a member of the giant family (it orbits one) nor an eyeball (locked to its
    // planet, not the star). Covers gas/ice giants, neptunes, jupiters, helium & puffy giants, brown/
    // dwarf bodies. (The old filter missed ice-giant / helium / puffy, so moons could be gas giants.)
    if (isMoon && /giant|neptune|jupiter|helium|puff|brown|dwarf|eyeball/.test(fp.class)) return false;
    if (isMoon && hostMe > 0) {
      // A moon must fit under its host: drop any type whose characteristic mass exceeds the moon cap.
      const mb = fp.match['mass_Me'];
      if (Array.isArray(mb) && typeof mb[0] === 'number' && mb[0] > maxMoonMe) return false;
      // Around a terrestrial-scale host, only simple airless/icy/rocky moons are plausible — the
      // substantial atmosphere/ocean/biosphere worlds need a giant host.
      if (!hostIsGiant && SUBSTANTIAL_MOON.test(fp.class)) return false;
    }
    const band = fp.match['Teq_K'];
    if (!Array.isArray(band) || typeof band[0] !== 'number') return true; // no temp constraint
    const [lo, hi] = band as [number, number];
    const pad = (hi - lo) * SLACK;
    return teqK >= lo - pad - greenhouseColdSlackK(fp.class) && teqK <= hi + pad;
  });
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
  const covBand = m['hydrosphere.coverage'];
  const hydroComp = pickStr(m['hydrosphere.composition']);
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

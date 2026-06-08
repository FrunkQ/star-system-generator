// §4c — "add by viable type". Given a planet TYPE (its classifier fingerprint) and an orbit, build a
// body with randomised parameters that will CLASSIFY as that type. The fingerprint bands ARE the
// recipe: pick a value inside each defining band (mass, radius/makeup, hydrosphere, atmosphere,
// biosphere…). The orbit sets temperature, so a type is only offered where its T_eq band fits —
// which is why a biome/life world can be dropped into the Goldilocks zone and a lava world can't.
import type { CelestialBody, Fingerprint, FingerprintBand, Makeup } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
import { radiusReFromMassMakeup } from '$lib/physics/makeup';

type RNG = () => number;

function pick(band: FingerprintBand | undefined, rng: RNG, fallback: number): number {
  if (Array.isArray(band) && typeof band[0] === 'number') {
    const [lo, hi] = band as [number, number];
    return lo + rng() * (hi - lo);
  }
  return fallback;
}
function pickStr(band: FingerprintBand | undefined): string | undefined {
  if (typeof band === 'string') return band;
  if (Array.isArray(band) && typeof band[0] === 'string') return (band as string[])[0];
  return undefined;
}

// Which base types could exist at a given equilibrium temperature (and role). A type is viable when
// the orbit's T_eq falls inside its T_eq band (with a little slack); types without a T_eq band are
// always offered. Moons exclude giants/stars.
export function viableTypesAt(teqK: number, role: 'planet' | 'moon', fingerprints: Fingerprint[]): Fingerprint[] {
  const SLACK = 0.12; // 12% — matches the classifier's soft edge
  return fingerprints.filter((fp) => {
    if (fp.kind !== 'base') return false;
    if (role === 'moon' && /gas-giant|neptune|jupiter|dwarf|brown/.test(fp.class)) return false;
    const band = fp.match['Teq_K'];
    if (!Array.isArray(band) || typeof band[0] !== 'number') return true; // no temp constraint
    const [lo, hi] = band as [number, number];
    const pad = (hi - lo) * SLACK;
    return teqK >= lo - pad && teqK <= hi + pad;
  });
}

// Build a body of the given type at an orbit. Returns the physical fields to merge onto a new body;
// temperature/geology/colour/etc. are left for the processor to derive.
export function generateBodyOfType(
  fp: Fingerprint,
  ctx: { distAU: number; hostMassKg: number; role: 'planet' | 'moon'; rng?: RNG }
): Partial<CelestialBody> {
  const rng = ctx.rng ?? Math.random;
  const m = fp.match;
  const out: Partial<CelestialBody> = { classes: [fp.class], tags: [] };

  // --- Mass ---
  const isGiant = /gas-giant|jupiter|neptune|brown|puff/.test(fp.class);
  const massMe = pick(m['mass_Me'], rng, isGiant ? 50 + rng() * 250 : 0.5 + rng() * 1.5);
  out.massKg = massMe * EARTH_MASS_KG;

  // --- Composition / size: makeup if the type defines it, else radius/density bands, else derive. ---
  const mk: Makeup = {};
  let hasMakeup = false;
  for (const k of ['metal', 'rock', 'carbon', 'ice', 'gas'] as const) {
    const band = m[`makeup.${k}`];
    if (band) { mk[k] = pick(band, rng, 0); hasMakeup = true; }
  }
  if (hasMakeup) {
    out.makeup = mk;
    out.radiusKm = radiusReFromMassMakeup(massMe, mk) * EARTH_RADIUS_KM;
  } else if (m['radius_Re']) {
    out.radiusKm = pick(m['radius_Re'], rng, 1) * EARTH_RADIUS_KM;
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

  // --- Biosphere: a biome/life type DEMANDS one (the GM placing the type places the life). ---
  if (m['hasBiosphere']) {
    out.biosphere = { complexity: 'complex', coverage: 0.6 + rng() * 0.3 } as any;
  }

  // --- Misc realism ---
  out.rotation_period_hours = m['rotation_period_hours'] ? pick(m['rotation_period_hours'], rng, 24) : 10 + rng() * 30;
  out.magneticField = { strengthGauss: isGiant ? 4 + rng() * 20 : rng() * 1.5 } as any;

  return out;
}

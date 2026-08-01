import { describe, it, expect } from 'vitest';
import { photonParticleSplit, calculateStellarRadiationComponents, beltParticleFlux, selfBeltParticleFlux, beltInnerEdgeRadii } from './radiation';
import type { CelestialBody, RulePack } from '$lib/types';

// Phase 04.4 — spectral-class photon/particle split. Cool dwarfs are wind/flare-dominated,
// so their particle fraction rises toward M. Magnetospheres shield particles (not photons),
// so this makes unshielded M-dwarf worlds harsher than Sun-like ones at the same flux.
function star(cls: string): CelestialBody {
  return { classes: [`star/${cls}`] } as unknown as CelestialBody;
}

describe('photonParticleSplit', () => {
  it('keeps Sun-like (G) at the historical 90/10', () => {
    const g = photonParticleSplit(star('G2V'));
    expect(g.ph).toBeCloseTo(0.9, 5);
    expect(g.pa).toBeCloseTo(0.1, 5);
  });

  it('each split sums to 1', () => {
    for (const cls of ['O', 'B', 'A', 'F', 'G', 'K', 'M']) {
      const s = photonParticleSplit(star(cls));
      expect(s.ph + s.pa).toBeCloseTo(1, 5);
    }
  });

  it('particle fraction rises monotonically from hot to cool dwarfs', () => {
    const order = ['B', 'F', 'G', 'K', 'M'].map((c) => photonParticleSplit(star(c)).pa);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
    // M dwarf is markedly more particle-dominated than the Sun.
    expect(photonParticleSplit(star('M8V')).pa).toBeGreaterThan(2 * photonParticleSplit(star('G2V')).pa);
  });

  it('falls back to G for missing/odd classes', () => {
    expect(photonParticleSplit({} as CelestialBody).pa).toBeCloseTo(0.1, 5);
  });
});

// Inbox B8: the mean dose used to be built from the per-star components (which include a FLARE
// term) while the endpoints came from a second, flare-less sum — so on an active star the mean
// could sit up to 20% above its own maximum. All three now come from this one function, and the
// property that matters is that the ordering holds for a FLARING star, which is where it broke.
describe('stellar radiation components — one model for mean and endpoints', () => {
  function flaringSystem(flare: number) {
    const s = {
      id: 'star', kind: 'body', name: 'S', roleHint: 'star', classes: ['star/M5V'],
      massKg: 2e29, radiusKm: 200000, radiationOutput: 0.002, flareActivity: flare
    } as unknown as CelestialBody;
    const p = {
      id: 'p', kind: 'body', name: 'P', roleHint: 'planet', parentId: 'star',
      massKg: 6e24, radiusKm: 6400,
      orbit: { elements: { a_AU: 0.1, e: 0.25, i_deg: 0, Omega_deg: 0, w_deg: 0, M0_deg: 0 } }
    } as unknown as CelestialBody;
    return { nodes: [s, p] as any[], body: p };
  }

  it('the flare dose is in the endpoints as well as the mean', () => {
    const { nodes, body } = flaringSystem(0.8);
    const quiet = flaringSystem(0);
    const near = calculateStellarRadiationComponents(body, nodes, 'near').total;
    const nearQuiet = calculateStellarRadiationComponents(quiet.body, quiet.nodes, 'near').total;
    expect(near).toBeGreaterThan(nearQuiet); // it used to be identical — the term was missing
  });

  it('min <= mean <= max holds on an eccentric orbit round an active star', () => {
    for (const flare of [0, 0.2, 0.5, 0.9]) {
      const { nodes, body } = flaringSystem(flare);
      const min = calculateStellarRadiationComponents(body, nodes, 'far').total;
      const mean = calculateStellarRadiationComponents(body, nodes, 'current').total;
      const max = calculateStellarRadiationComponents(body, nodes, 'near').total;
      expect(min).toBeLessThanOrEqual(mean);
      expect(mean).toBeLessThanOrEqual(max);
      expect(min).toBeLessThan(max); // e = 0.25, so the range is genuinely wide
    }
  });
});

// Inbox B17: a trapped-particle belt around a magnetised, rotating host. The fingerprint of the
// missing term was Io and Europa agreeing to four significant figures (20.9397 / 20.9276), because
// solar distance was the only term either of them had. Calibrated on Io and Callisto ONLY — the two
// Galileans with no field of their own, so no self-shielding is fitted into the law.
describe('magnetospheric belt dose (B17)', () => {
  const AU_KM = 149597870.7;
  const pack = {
    generation_parameters: {
      belt_ref_field_gauss: 4.32, belt_ref_rotation_hours: 9.925,
      belt_peak_dose_sv_per_day: 1451.1, belt_scale_length_host_radii: 1.6324,
      belt_min_host_field_gauss: 0.01
    }
  } as unknown as RulePack;

  const host = (gauss: number, rotH: number, radiusKm = 69911) => ({
    id: 'host', name: 'H', kind: 'body', roleHint: 'planet', radiusKm,
    magneticField: { strengthGauss: gauss }, rotation_period_hours: rotH
  }) as unknown as CelestialBody;
  const moon = (aAU: number) => ({
    id: 'm', name: 'M', kind: 'body', roleHint: 'moon', parentId: 'host',
    orbit: { hostId: 'host', elements: { a_AU: aAU, e: 0, i_deg: 0, Omega_deg: 0, w_deg: 0, M0_deg: 0 } }
  }) as unknown as CelestialBody;
  // engine flux unit -> Sv/day
  const svDay = (flux: number) => (flux * 500) / 1000 / 365;
  const doseAt = (aAU: number, h = host(4.32, 9.925)) => svDay(beltParticleFlux(moon(aAU), [h, moon(aAU)], pack));

  it('reproduces the two anchors it was calibrated on', () => {
    expect(doseAt(0.00282)).toBeCloseTo(36, 0);        // Io, ~36 Sv/day at 6.03 R_J
    expect(doseAt(0.01258) / 1e-4).toBeGreaterThan(0.5); // Callisto, ~1e-4 Sv/day at 26.9 R_J
    expect(doseAt(0.01258) / 1e-4).toBeLessThan(2);
  });

  it('PREDICTS Europa and Ganymede, which it was NOT fitted to, inside a factor of two', () => {
    expect(doseAt(0.00448) / 5.4).toBeGreaterThan(0.5);   // Europa, measured 5.4 Sv/day
    expect(doseAt(0.00448) / 5.4).toBeLessThan(2);
    // Ganymede is the deliberate hold-out: it is the only moon with its own dynamo, and the law
    // does not model that shield, so it should predict HIGH rather than low.
    expect(doseAt(0.00715) / 0.08).toBeGreaterThan(1);
    expect(doseAt(0.00715) / 0.08).toBeLessThan(2);
  });

  it('separates Io from Europa, which is the whole point', () => {
    expect(doseAt(0.00282) / doseAt(0.00448)).toBeGreaterThan(5);
  });

  it('falls off far faster than inverse-square — that is why it is a term, not an emitter', () => {
    // Io -> Callisto is 4.46x the distance. Inverse-square would be ~20x less dose; it is ~360000x.
    expect(doseAt(0.00282) / doseAt(0.01258)).toBeGreaterThan(1e4);
  });

  it('degrades to zero: no field, no spin, or a weak-field host', () => {
    expect(beltParticleFlux(moon(0.00282), [host(0, 9.925), moon(0.00282)], pack)).toBe(0);
    expect(beltParticleFlux(moon(0.00282), [host(4.32, 0), moon(0.00282)], pack)).toBe(0);
    // Luna about Earth: a real field, but 60 Earth radii out.
    expect(doseAt(0.00257, host(0.5014, 24, 6371))).toBeLessThan(1e-9);
  });

  it('Saturn comes out FAR below Jupiter, not merely 18x below', () => {
    const sat = host(0.2396, 10.656, 58232);
    const enceladus = doseAt(0.00159, sat);   // 3.95 R_S
    expect(doseAt(0.00282) / enceladus).toBeGreaterThan(1000); // field ratio alone is only ~18
    expect(doseAt(0.00816, sat)).toBeLessThan(1e-4);           // Titan, 20 R_S — effectively nothing
  });
});

// Inbox B22: a body was never inside its OWN belt, because beltParticleFlux resolves the host as
// parentId — so a planet's host is its star. The fix needs an INNER EDGE, or the same law asked
// about a body's own field reports the belt peak at the centre of the planet.
describe('belt inner edge and the two-figure report (B22)', () => {
  const pack = {
    generation_parameters: {
      belt_ref_field_gauss: 4.32, belt_ref_rotation_hours: 9.925,
      belt_peak_dose_sv_per_day: 1451.1, belt_scale_length_host_radii: 1.6324,
      belt_min_host_field_gauss: 0.01, belt_inner_edge_scale_heights: 150
    }
  } as unknown as RulePack;
  const svDay = (flux: number) => (flux * 500) / 1000 / 365;
  const body = (gauss: number, rotH: number, radiusKm: number, scaleHeightKm: number) => ({
    id: 'b', name: 'B', kind: 'body', roleHint: 'planet', radiusKm,
    magneticField: { strengthGauss: gauss }, rotation_period_hours: rotH,
    atmosphere: { name: 'a', composition: {}, pressure_bar: 1, scaleHeightKm }
  }) as unknown as CelestialBody;

  const EARTH = body(0.5014, 23.934, 6371, 8.401107);
  const JUPITER = body(4.32, 9.925, 69911, 22.257789);
  const SATURN = body(0.2396, 10.656, 58232, 47.302433);

  it('EARTH IS NOT LETHAL: its own belt does not reach its own surface', () => {
    // Without an inner edge this law gives 2.31 Sv/day at the ground — ~300x the real background
    // of 2.4 mSv/yr, on the best-calibrated body in the engine.
    expect(selfBeltParticleFlux(EARTH, pack, 1)).toBe(0);
    expect(beltInnerEdgeRadii(EARTH, pack)).toBeGreaterThan(1.15); // ~1.2 R_E, the measured edge
    expect(beltInnerEdgeRadii(EARTH, pack)).toBeLessThan(1.25);
  });

  it('no giant reaches its own 1-bar level either', () => {
    for (const g of [JUPITER, SATURN]) expect(selfBeltParticleFlux(g, pack, 1)).toBe(0);
  });

  it('but the belt IS there just above the atmosphere, and Jupiter dominates', () => {
    const jup = svDay(selfBeltParticleFlux(JUPITER, pack, beltInnerEdgeRadii(JUPITER, pack)));
    expect(jup).toBeGreaterThan(500);   // ~764 Sv/day, about 21x Io's 36
    expect(jup).toBeLessThan(1100);
    const sat = svDay(selfBeltParticleFlux(SATURN, pack, beltInnerEdgeRadii(SATURN, pack)));
    // Saturn's field is ~18x weaker; its cloud tops must be FAR quieter, not 18x quieter.
    expect(jup / sat).toBeGreaterThan(500);
  });

  it('the edge scales with the ATMOSPHERE, not with the planet', () => {
    // Same planet, ten times the scale height -> a belt held ten times further out.
    const puffy = body(0.5014, 23.934, 6371, 84.01107);
    expect(beltInnerEdgeRadii(puffy, pack) - 1).toBeCloseTo((beltInnerEdgeRadii(EARTH, pack) - 1) * 10, 6);
  });

  it('an AIRLESS body has no absorber, so its belt reaches the ground', () => {
    const airless = { id: 'a', name: 'A', kind: 'body', roleHint: 'moon', radiusKm: 2634,
      magneticField: { strengthGauss: 0.5 }, rotation_period_hours: 171.6 } as unknown as CelestialBody;
    expect(beltInnerEdgeRadii(airless, pack)).toBe(1);
    expect(selfBeltParticleFlux(airless, pack, 1)).toBeGreaterThan(0);
  });
});

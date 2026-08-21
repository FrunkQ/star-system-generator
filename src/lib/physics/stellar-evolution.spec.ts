import { describe, it, expect } from 'vitest';
import { ageStar, getStarLifespanGyr, stellarRadiusAU, isEngulfedAt, flareActivity } from './stellar-evolution';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

const sun = () => ({
  id: 's', temperatureK: 5778, luminositySolar: 1, massKg: SOLAR_MASS_KG, radiusKm: SOLAR_RADIUS_KM,
  spectralClass: 'G', category: 'Main Sequence', luminosityClass: 'V', isRemnant: false,
  pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }
});
const gyr = (n: number) => n * 1e9;

describe('stellar lifespan', () => {
  it('Sun ~10 Gyr; massive stars short, dwarfs long', () => {
    expect(getStarLifespanGyr(SOLAR_MASS_KG)).toBeCloseTo(10, 0);
    expect(getStarLifespanGyr(10 * SOLAR_MASS_KG)).toBeLessThan(0.1);   // ~30 Myr
    expect(getStarLifespanGyr(0.5 * SOLAR_MASS_KG)).toBeGreaterThan(40); // outlives the universe
  });
});

describe('ageStar — believable MS → giant → remnant', () => {
  it('mid-life Sun: still a main-sequence G star, a touch brighter', () => {
    const s = ageStar(sun(), gyr(5));
    expect(s.phase).toBe('main-sequence');
    expect(s.luminositySolar).toBeGreaterThan(1);
    expect(s.spectralClass).toBe('G');
  });

  it('early post-MS Sun: a subgiant/giant, cooler and brighter', () => {
    const s = ageStar(sun(), gyr(11.5));
    expect(s.phase === 'giant' || s.phase === 'subgiant').toBe(true);
    expect(s.temperatureK).toBeLessThan(5500);
    expect(s.luminositySolar).toBeGreaterThan(50);
  });

  it('peak red-giant Sun (~RGB tip): swollen toward ~1 AU, engulfs the inner planets', () => {
    const s = ageStar(sun(), gyr(12.8));
    expect(s.temperatureK).toBeLessThan(3500);      // reddened
    expect(s.luminositySolar).toBeGreaterThan(500); // very luminous
    expect(stellarRadiusAU(s)).toBeGreaterThan(0.5); // swollen toward ~1 AU
    expect(isEngulfedAt(s, 0.4)).toBe(true);        // Mercury/Venus gone
    expect(isEngulfedAt(s, 5)).toBe(false);         // a Jupiter survives
  });

  it('dead Sun: a hot, tiny, dim white dwarf', () => {
    const s = ageStar(sun(), gyr(14));
    expect(s.phase).toBe('white-dwarf');
    expect(s.isDead).toBe(true);
    expect(s.luminositySolar).toBeLessThan(0.1);
    expect(s.radiusKm).toBeLessThan(SOLAR_RADIUS_KM * 0.05); // ~Earth-sized
  });

  it('a 15 M☉ star ends as a neutron star; 30 M☉ as a black hole', () => {
    const heavy = { ...sun(), massKg: 15 * SOLAR_MASS_KG, luminositySolar: 1e4, temperatureK: 30000 };
    expect(ageStar(heavy, gyr(0.5)).phase).toBe('neutron-star');
    const huge = { ...sun(), massKg: 30 * SOLAR_MASS_KG, luminositySolar: 1e5, temperatureK: 40000 };
    expect(ageStar(huge, gyr(0.5)).phase).toBe('black-hole');
  });
});

// B44's sweep: this rule only ever saw the LETTER, so once the luminosity class became a class a
// red supergiant would have drawn the M-DWARF flare rate — the highest in the table.
// A REMNANT IS NOT AUTOMATICALLY QUIET (owner, 2026-08-14). Treating every one as zero was an
// over-correction: what changes is the MECHANISM, not the presence. A quiescent hole has nothing to
// flare from, but a FEEDING one flares from its accretion disc — Sgr A* several times a day — and a
// magnetar flares from field decay, harder than any ordinary star.
describe('flareActivity: a remnant flares from accretion or field, not from a dynamo', () => {
  it('a QUIESCENT hole, an isolated neutron star and an isolated white dwarf are quiet', () => {
    for (const c of ['star/BH', 'star/NS', 'star/WD']) expect(flareActivity(c, 5), c).toBe(0);
  });

  it('an ACCRETING hole flares, and harder the harder it is fed', () => {
    const slow = flareActivity('star/BH_active', 5, 0.1);
    const fast = flareActivity('star/BH_active', 5, 1.0);
    expect(slow).toBeGreaterThan(0.3);
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeLessThanOrEqual(1);
    // …and it beats the most active ordinary star, which is the point.
    expect(fast).toBeGreaterThan(flareActivity('star/M', 0.1));
  });

  it('a quiescent class the GM has set feeding flares too — the accretion decides, not the label', () => {
    expect(flareActivity('star/BH', 5, 0)).toBe(0);
    expect(flareActivity('star/BH', 5, 0.5)).toBeGreaterThan(0.3);
  });

  it('a magnetar flares hardest of all, and neither age nor accretion enters it', () => {
    expect(flareActivity('star/magnetar', 0.1)).toBe(flareActivity('star/magnetar', 12));
    expect(flareActivity('star/magnetar', 5)).toBeGreaterThan(flareActivity('star/M', 0.1));
  });
});

describe('flareActivity distinguishes a giant from a dwarf of the same colour', () => {
  it('an M supergiant is not a scaled-up M dwarf', () => {
    // At 1 Gyr the age factor is near 1, so this compares the CLASS rows rather than the ageing.
    const dwarf = flareActivity('star/M', 1);
    const supergiant = flareActivity('star/M-I', 1);
    expect(dwarf).toBeGreaterThan(0.3);
    expect(supergiant).toBeLessThan(0.1);
    expect(supergiant).toBeLessThan(dwarf / 5);
  });

  it('applies to every evolved band, and to the editor red giant', () => {
    for (const c of ['star/M-I', 'star/K-III', 'star/B-I', 'star/G-III', 'star/red-giant']) {
      expect(flareActivity(c, 5), c).toBeLessThan(0.1);
    }
  });

  it('leaves the main sequence and the remnants exactly as they were', () => {
    // The ladder that already worked: M flares hardest, O/B least, remnants not at all.
    expect(flareActivity('star/M', 5)).toBeGreaterThan(flareActivity('star/K', 5));
    expect(flareActivity('star/K', 5)).toBeGreaterThan(flareActivity('star/G', 5));
    expect(flareActivity('star/G', 5)).toBeGreaterThan(flareActivity('star/B', 5));
    // `star/BH` in particular: 'B' is both the black-hole initial and a spectral letter, and the
    // old first-letter test cancelled itself, giving a QUIESCENT black hole the B-star flare rate.
    for (const c of ['star/WD', 'star/NS', 'star/BH']) expect(flareActivity(c, 5), c).toBe(0);
    // …and young stars still flare harder than old ones.
    expect(flareActivity('star/M', 0.1)).toBeGreaterThan(flareActivity('star/M', 10));
  });
});

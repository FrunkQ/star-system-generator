import { describe, it, expect } from 'vitest';
import { ageStar, getStarLifespanGyr, stellarRadiusAU, isEngulfedAt } from './stellar-evolution';
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

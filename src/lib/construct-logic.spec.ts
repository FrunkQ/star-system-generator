// src/lib/construct-logic.spec.ts
import { describe, it, expect } from 'vitest';
import { drainFuelMassKg, calculateFullConstructSpecs } from './construct-logic';
import type { CelestialBody, RulePack } from './types';

// 1 unit of 'h2' weighs 2 kg.
const rulePack = {
  fuelDefinitions: { id: 'fuel', name: 'Fuel', entries: [{ id: 'h2', density_kg_per_m3: 2 }] },
} as unknown as RulePack;

const makeConstruct = (): CelestialBody =>
  ({
    id: 'ship',
    fuel_tanks: [
      { fuel_type_id: 'h2', current_units: 10 }, // 20 kg
      { fuel_type_id: 'h2', current_units: 5 }, //  10 kg
    ],
  }) as unknown as CelestialBody;

describe('drainFuelMassKg', () => {
  it('drains across tanks in order, emptying the first before touching the second', () => {
    // 24 kg: tank A (20 kg) -> 0, remaining 4 kg; tank B (10 kg) -> 4 kg drained = 2 units, leaving 3.
    const result = drainFuelMassKg(makeConstruct(), rulePack, 24);
    expect(result.fuel_tanks![0].current_units).toBe(0);
    expect(result.fuel_tanks![1].current_units).toBe(3);
  });

  it('partially drains a single tank when it has enough mass', () => {
    // 10 kg from tank A (20 kg) -> 5 units drained, leaving 5; tank B untouched.
    const result = drainFuelMassKg(makeConstruct(), rulePack, 10);
    expect(result.fuel_tanks![0].current_units).toBe(5);
    expect(result.fuel_tanks![1].current_units).toBe(5);
  });

  it('does not mutate the original construct or its tanks', () => {
    const construct = makeConstruct();
    drainFuelMassKg(construct, rulePack, 24);
    expect(construct.fuel_tanks![0].current_units).toBe(10);
    expect(construct.fuel_tanks![1].current_units).toBe(5);
  });

  it('leaves tanks with no matching fuel definition untouched', () => {
    const construct = { id: 'ship', fuel_tanks: [{ fuel_type_id: 'unobtanium', current_units: 7 }] } as unknown as CelestialBody;
    const result = drainFuelMassKg(construct, rulePack, 50);
    expect(result.fuel_tanks![0].current_units).toBe(7);
  });

  it('returns the construct unchanged when it has no tanks or no fuel definitions', () => {
    const noTanks = { id: 'ship' } as unknown as CelestialBody;
    expect(drainFuelMassKg(noTanks, rulePack, 5)).toBe(noTanks);
    const noDefs = makeConstruct();
    expect(drainFuelMassKg(noDefs, {} as RulePack, 5)).toBe(noDefs);
  });
});

// ===============================================================================================
// "EARTH: FAR ORBIT" WAS TWO ANSWERS JOINED WITH A MINUS SIGN.
//
// The host comes from the CALLER; the semi-major axis comes off the NODE. A ship that had flown to
// Earth and never had its record updated carried a 3.05 AU heliocentric orbit while the panel
// resolved its host as Earth - so the band came out of `3.05 AU - Earth's radius`, about 456 million
// km, which falls past every boundary and lands on "Far Orbit". The name was right and the number
// belonged to a different world ([[B97]]).
//
// The rule now: a semi-major axis only describes an altitude above the host it was measured from.
// ===============================================================================================

const EARTH = {
  id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', radiusKm: 6371,
  orbitalBoundaries: {
    hasSurface: true, surface: { max: 0 }, lowOrbit: { max: 2000 }, mediumOrbit: { max: 35000 },
    geosynchronousOrbit: { max: 36000 }, highOrbit: { max: 100000 }
  }
} as unknown as CelestialBody;

const SUN = { id: 'sun', name: 'Sol', kind: 'body', roleHint: 'star', radiusKm: 696000 } as unknown as CelestialBody;

const specRules = {
  engineDefinitions: { entries: [] }, fuelDefinitions: { entries: [] }
} as unknown as RulePack;

/** A ship whose stored orbit names `orbitHost`, described against whatever host the caller found. */
function shipOrbiting(orbitHost: string, a_AU: number): CelestialBody {
  return {
    id: 'ship', name: 'Rocinante', kind: 'construct', roleHint: 'ship',
    parentId: orbitHost, placement: 'Orbit', flight_state: 'Orbiting',
    orbit: { hostId: orbitHost, elements: { a_AU, e: 0 } },
    physical_parameters: { massKg: 250000 }, systems: {}
  } as unknown as CelestialBody;
}

const orbitOf = (ship: CelestialBody, host: CelestialBody | null) =>
  calculateFullConstructSpecs(ship, [], [], host as any).orbit_string;

describe('an orbit band is only claimed when the axis and the host describe each other', () => {
  it('a genuine low Earth orbit still reads as one', () => {
    // 6,536 km from Earth's centre - the parking orbit a healed arrival is given.
    expect(orbitOf(shipOrbiting('earth', 6536 / 149597870.7), EARTH)).toBe('Earth: Low Orbit');
  });

  it('REINSTATING THE FAULT: a stale Sol orbit read against Earth no longer invents a band', () => {
    // This is the owner's ship exactly as saved: host resolved to Earth, orbit still the 3.05 AU
    // heliocentric one. The old arithmetic returned "Far Orbit" with total confidence.
    const stale = shipOrbiting('sun', 3.05);
    expect(orbitOf(stale, EARTH)).not.toBe('Earth: Far Orbit');
    // It says the one true thing it knows: the ship is at Earth, and the altitude is not ours to guess.
    expect(orbitOf(stale, EARTH)).toBe('Earth: Orbit');
  });

  it('...and the same stale axis is not printed as an AU distance from a star either', () => {
    // The other half of the blend, and the easier one to miss: the star branch prints `a_AU` raw, so a
    // ship parked 6,536 km above Earth read as "Sol: 0.00 AU" if anything asked against the star.
    const parked = shipOrbiting('earth', 6536 / 149597870.7);
    expect(orbitOf(parked, SUN)).not.toBe('Sol: 0.00 AU');
  });

  it('a real heliocentric orbit still prints its distance', () => {
    expect(orbitOf(shipOrbiting('sun', 3.05), SUN)).toBe('Sol: 3.05 AU');
  });

  it('a genuinely far orbit is still called far - the band did not just get switched off', () => {
    // 500,000 km above Earth: past every boundary, and this time the axis really is Earth's.
    expect(orbitOf(shipOrbiting('earth', 506371 / 149597870.7), EARTH)).toBe('Earth: Far Orbit');
  });
});

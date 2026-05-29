// src/lib/construct-logic.spec.ts
import { describe, it, expect } from 'vitest';
import { drainFuelMassKg } from './construct-logic';
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

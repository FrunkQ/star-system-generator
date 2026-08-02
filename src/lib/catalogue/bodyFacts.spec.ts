import { describe, it, expect } from 'vitest';
import { bodyFacts } from './bodyFacts';

const val = (b: any, label: string) => bodyFacts(b).find((f) => f.label === label)?.value;

// A33: the reader-facing block must say what each number IS. Two radiation figures on the same body
// are a thousandfold apart, and a third "radiation" statement in the Tags row is not a dose at all.
describe('bodyFacts — radiation rows say what they are', () => {
  const mars: any = {
    id: 'mars', name: 'Mars', kind: 'body', roleHint: 'planet', massKg: 6.4e23, radiusKm: 3390,
    makeup: { rock: 0.7, metal: 0.3 },
    surfaceRadiation: 213.69, surfaceRadiationMin: 178.3, surfaceRadiationMax: 258.43,
    orbitalRadiation: 221.91
  };

  it('prints the mean WITH its unit, and the range on the same scale', () => {
    const v = val(mars, 'Radiation (surface)')!;
    expect(v).toContain('mSv/y');
    expect(v).toContain('214');           // the mean itself, which used not to be shown at all
    expect(v).toContain('(178–258)');     // its range, in the same unit and precision as the mean
  });

  it('scales a fierce environment into Sv rather than printing eight raw digits', () => {
    const io: any = { ...mars, name: 'Io', surfaceRadiation: 12750061.89, surfaceRadiationMin: 12557685.7, surfaceRadiationMax: 12945385.35 };
    const v = val(io, 'Radiation (surface)')!;
    expect(v).toContain('Sv/day');
    expect(v).not.toContain('mSv');
    expect(v).not.toMatch(/\d{7}/); // no raw seven-digit millisievert figure
  });

  it('quotes an orbital environment in its own right unit, not the surface row\'s', () => {
    const earth: any = {
      ...mars, name: 'Earth', surfaceRadiation: 2.3, surfaceRadiationMin: 2.29, surfaceRadiationMax: 2.31,
      orbitalRadiation: 652964.69
    };
    expect(val(earth, 'Radiation (surface)')).toContain('mSv/y');
    expect(val(earth, 'Radiation (in orbit)')).toContain('Sv/y');
  });

  it('drops a range whose ends round to the same figure, rather than printing 2.3-2.3', () => {
    const earth: any = { ...mars, surfaceRadiation: 2.3, surfaceRadiationMin: 2.29, surfaceRadiationMax: 2.31, orbitalRadiation: 2.3 };
    expect(val(earth, 'Radiation (surface)')).toBe('background · 2.3 mSv/y');  // no lethal-dose phrase: the acute model says nothing here
  });

  // B28: the band is the same bucketing the `hazard/radiation` tag uses, and it has to SEPARATE a
  // real mission dose from a lethal one. The old three-band split called Mars and Io both "high",
  // sixty thousand times apart.
  it('does not describe Mars and Io with the same word', () => {
    const io: any = { ...mars, name: 'Io', surfaceRadiation: 13139475 };
    const marsBand = val(mars, 'Radiation (surface)')!.split(' ·')[0];
    const ioBand = val(io, 'Radiation (surface)')!.split(' ·')[0];
    expect(marsBand).toBe('years');   // ~23 years to a median lethal dose — a mission-planning problem
    expect(ioBand).toBe('hours');     // ~3 hours — a different kind of problem entirely
  });

  // B30: the bucket word is a survival time, and the sentence spells it out once — but only while
  // the acute model means anything. "Earth: 2,000 years" is arithmetic, not a prediction.
  it('spells out the survival time, and stops quoting one when it would be nonsense', () => {
    const io: any = { ...mars, name: 'Io', surfaceRadiation: 13139475 };
    expect(val(io, 'Radiation (surface)')).toMatch(/lethal dose in ~3(\.\d)? h/);
    const earth: any = { ...mars, surfaceRadiation: 2.3 };
    expect(val(earth, 'Radiation (surface)')).not.toContain('lethal dose');
  });

  // B26: three kinds of body, not two. A ring has no surface to stand on, but unlike a giant's
  // envelope it is made of small bodies that each do — so the figure is real and only its name was
  // wrong. It is the dose in the ring plane.
  it('names the ring-plane figure for the ring plane, not for a surface it has not got', () => {
    const ring: any = { ...mars, name: "Jupiter's Rings", roleHint: 'ring', classes: ['ring/planetary'], surfaceRadiation: 131496772.6, orbitalRadiation: 131496772.6 };
    expect(val(ring, 'Radiation (in the ring plane)')).toBeDefined();
    expect(val(ring, 'Radiation (surface)')).toBeUndefined();
    // The two places coincide for a ring, so it gets ONE row rather than the same number twice.
    expect(val(ring, 'Radiation (in orbit)')).toBeUndefined();
  });

  // The orbital row only appears when the two genuinely differ — B22's rule, unchanged here.
  it('leaves out the orbital row when it barely differs from the surface', () => {
    expect(val(mars, 'Radiation (in orbit)')).toBeUndefined();
  });
});

// The same sweep, second find: an index printed as a percentage beside a real coverage percentage.
describe('bodyFacts — a score is named as one', () => {
  it('gives habitability a denominator instead of a per-cent sign', () => {
    const b: any = {
      id: 'e', name: 'Earth', kind: 'body', roleHint: 'planet', massKg: 6e24, radiusKm: 6371,
      habitabilityScore: 83, biosphere: { coverage: 0.8 }
    };
    expect(val(b, 'Habitability score')).toBe('83 / 100');
    expect(val(b, 'Habitability')).toBeUndefined();
    expect(val(b, 'Native life')).toBe('present (cover 80%)'); // a genuine fraction keeps its %
  });
});

// A31: with "Live readings" off there was no acceleration or Δv row at all — honest, but a catalogue
// entry for a ship would quote a Δv. The capacity view prints the RATED figures instead: full tanks,
// empty hold, so the row is a property of the ship rather than a restatement of today's fuel and cargo.
describe('bodyFacts — a construct quotes rated performance in capacity mode', () => {
  const pack: any = {
    engineDefinitions: { entries: [{ id: 'e1', name: 'Drive', type: 'Fusion Torch', thrust_kN: 2000, efficiency_isp: 5000, atmo_efficiency: 1 }] },
    fuelDefinitions: { entries: [{ id: 'f1', name: 'Deuterium', density_kg_per_m3: 200 }] }
  };
  const ship: any = {
    id: 'roci', name: 'Rocinante', kind: 'construct', class: 'Ship/Frigate',
    physical_parameters: { massKg: 1_000_000, cargoCapacity_tonnes: 200 },
    engines: [{ engine_id: 'e1', quantity: 1 }],
    fuel_tanks: [{ fuel_type_id: 'f1', capacity_units: 3500, current_units: 2820 }],
    current_cargo_tonnes: 40,
    crew: { current: 4, max: 6 }
  };
  const facts = (live: boolean) => bodyFacts(ship, 'metric', 'C', { rulePack: pack, liveReadings: live });
  const get = (live: boolean, label: string) => facts(live).find((f) => f.label === label)?.value;

  it('shows rated figures with live readings OFF and current ones with it ON', () => {
    expect(get(false, 'Δv (rated, full tanks)')).toBeTruthy();
    expect(get(false, 'Acceleration (rated)')).toMatch(/g, full to empty$/);
    expect(get(false, 'Δv (vacuum)')).toBeUndefined();
    expect(get(false, 'Max acceleration')).toBeUndefined();

    expect(get(true, 'Δv (vacuum)')).toBeTruthy();
    expect(get(true, 'Max acceleration')).toBeTruthy();
    expect(get(true, 'Δv (rated, full tanks)')).toBeUndefined();
  });

  // The whole reason the rated figures use an EMPTY hold: dry mass and fuel capacity are both printed
  // in capacity mode, so a cargo-laden rated Δv would let a reader solve back to the cargo A29 withheld.
  it('does not move with the cargo, so it cannot leak the load A29 withheld', () => {
    const laden = { ...ship, current_cargo_tonnes: 200 };
    const before = get(false, 'Δv (rated, full tanks)');
    const after = bodyFacts(laden as any, 'metric', 'C', { rulePack: pack, liveReadings: false })
      .find((f) => f.label === 'Δv (rated, full tanks)')?.value;
    expect(after).toBe(before);
  });
});

// The gating sweep asked for on 2026-08-01: what belongs on an instrument versus in a reference work.
describe('bodyFacts — a construct block gates by what changes, not by what is interesting', () => {
  const pack: any = {
    engineDefinitions: { entries: [{ id: 'e1', name: 'Drive', type: 'Fusion Torch', thrust_kN: 2000, efficiency_isp: 5000, atmo_efficiency: 1 }] },
    fuelDefinitions: { entries: [{ id: 'f1', name: 'Deuterium', density_kg_per_m3: 200 }] }
  };
  const system: any = { nodes: [{ id: 'ceres', name: 'Ceres' }, { id: 'luna', name: 'Luna' }] };
  const ship: any = {
    id: 'roci', name: 'Rocinante', kind: 'construct',
    physical_parameters: { massKg: 1_000_000, cargoCapacity_tonnes: 200 },
    engines: [{ engine_id: 'e1', quantity: 1 }],
    fuel_tanks: [{ fuel_type_id: 'f1', capacity_units: 3500, current_units: 2820 }],
    current_cargo_tonnes: 40, cargoDescription: 'Ammo & Coffee',
    flight_state: 'Transit', placement: 'Low Orbit',
    autopilot: {
      enabled: true, traversal: 'in-order', repeat: true, planning: 1, drive: 0.5,
      ignoreFuel: false, ignoreSupplies: false,
      legs: [{ action: 'mine', resourceKeys: ['volatile/water-ice'], deliverTo: { kind: 'place', placeId: 'luna' } }]
    }
  };
  const get = (live: boolean, label: string) =>
    bodyFacts(ship, 'metric', 'C', { rulePack: pack, liveReadings: live, system })
      .find((f) => f.label === label)?.value;

  it('keeps both capacities in capacity mode, as capacities', () => {
    expect(get(false, 'Cargo capacity')).toBe('200 t');
    expect(get(false, 'Fuel capacity')).toContain('3,500 m³');
    expect(get(false, 'Cargo')).toBeUndefined();
    expect(get(false, 'Fuel')).toBeUndefined();
  });

  it('shows the manifest and the route only on an instrument', () => {
    expect(get(true, 'Manifest')).toBe('Ammo & Coffee');
    expect(get(true, 'Route')).toBe('Mine water ice → Luna (looping)');
    expect(get(false, 'Manifest')).toBeUndefined();
    expect(get(false, 'Route')).toBeUndefined();
  });

  it('withholds a status, and a location that is only a velocity, from the capacity view', () => {
    expect(get(true, 'Status')).toBe('Transit');
    expect(get(false, 'Status')).toBeUndefined();
    expect(get(false, 'Location')).toBeUndefined();   // under way: no berth to quote
  });

  it('keeps the berth of a construct that is not under way', () => {
    const docked = { ...ship, flight_state: 'Docked', placement: 'Docked at Tycho' };
    const at = (live: boolean) => bodyFacts(docked as any, 'metric', 'C', { rulePack: pack, liveReadings: live, system })
      .find((f) => f.label === 'Location')?.value;
    expect(at(false)).toBeTruthy();
    expect(at(true)).toBeTruthy();
  });
});

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
    expect(val(earth, 'Radiation (surface)')).toBe('low · 2.3 mSv/y');
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

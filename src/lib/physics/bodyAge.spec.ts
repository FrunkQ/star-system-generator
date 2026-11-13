// G94 job 1 - every body carries its own age, and ABSENT MEANS INHERIT, proven both ways.
import { describe, it, expect } from 'vitest';
import { ageOf, setBodyAge, clearBodyAge, hasOwnAge, cosmicNowGyr, systemAgeGyr } from './bodyAge';
import type { CelestialBody } from '$lib/types';

const body = (extra: Partial<CelestialBody> = {}): CelestialBody =>
  ({ id: 'b', name: 'B', kind: 'body', roleHint: 'planet', parentId: null, tags: [], ...extra } as unknown as CelestialBody);

// A system created on 1 September 2026 - the calendar's own stake in the sand.
const EPOCH = Date.UTC(2026, 8, 1, 12);
const sys = (age_Gyr: number) => ({ age_Gyr, epochT0: EPOCH });

describe('bodyAge - the reference date sits on the absolute clock', () => {
  it('a campaign set in our era is 13.787 Gyr after the big bang, derived from the master clock', () => {
    expect(cosmicNowGyr(sys(4.6))).toBeCloseTo(13.787, 3);
  });
  it('the reference date does not depend on the system age', () => {
    expect(cosmicNowGyr(sys(0.1))).toBe(cosmicNowGyr(sys(11)));
  });
});

describe('bodyAge - absent means inherit', () => {
  it('a body with no age of its own is exactly as old as its system', () => {
    expect(ageOf(body(), sys(4.6))).toBe(4.6);
    expect(hasOwnAge(body())).toBe(false);
  });

  it('...and FOLLOWS the system when the system age changes', () => {
    const b = body();
    expect(ageOf(b, sys(1))).toBe(1);
    expect(ageOf(b, sys(9))).toBe(9);
  });

  it('a body WITH an age of its own keeps it when the system age changes', () => {
    const b = body();
    setBodyAge(b, 9.2, sys(4.6));
    expect(hasOwnAge(b)).toBe(true);
    expect(ageOf(b, sys(4.6))).toBeCloseTo(9.2, 9);
    expect(ageOf(b, sys(1))).toBeCloseTo(9.2, 9);     // the system got younger: the body did not
    expect(ageOf(b, sys(12))).toBeCloseTo(9.2, 9);    // nor older
  });

  it('what is stored is a FORMATION TIME on the absolute axis, not a duration', () => {
    const b = body();
    setBodyAge(b, 9.2, sys(4.6));
    expect(b.formationTimeGyr).toBeCloseTo(13.787 - 9.2, 3);   // 4.587 Gyr after the big bang
    expect((b as any).age_Gyr).toBeUndefined();
    expect((b as any).ageGyr).toBeUndefined();
  });

  it('handing the age back DELETES the field, so the body inherits again', () => {
    const b = body();
    setBodyAge(b, 9.2, sys(4.6));
    clearBodyAge(b);
    expect('formationTimeGyr' in b).toBe(false);
    expect(ageOf(b, sys(2))).toBe(2);
  });

  it('an age is never negative, and a system that states no age reads as the one default', () => {
    expect(ageOf(body({ formationTimeGyr: 99 }), sys(4.6))).toBe(0);
    expect(systemAgeGyr({})).toBe(4.6);
    expect(ageOf(body(), null)).toBe(4.6);
  });

  it('a non-finite stored value is not an age of its own', () => {
    expect(ageOf(body({ formationTimeGyr: NaN }), sys(3))).toBe(3);
  });
});

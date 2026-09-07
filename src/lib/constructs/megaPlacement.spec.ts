// G53 phase 1: the placement evaluator's gates. The two §3.5 behaviours are held separately —
// hard greys with a sentence a GM can read; steer tags-and-explains and CANNOT refuse — plus the
// two forgiveness rules: an unknown clause passes, and inHabitableZone promoted to hard is demoted.
import { describe, it, expect } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { megaHardCheck, megaSteerNotes, effectiveMegaRequires, hostHasSurface } from './megaPlacement';
import { megaTypeDef, type MegaTypeDef } from './megaTypes';

const mk = (over: Partial<CelestialBody>): CelestialBody =>
  ({ id: 'n', name: 'Testworld', parentId: null, tags: [], kind: 'body', roleHint: 'planet', ...over }) as CelestialBody;

const earth = (): CelestialBody =>
  mk({
    name: 'Earth', massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: {
      minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000,
      heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false
    }
  });

const sol = (): CelestialBody => mk({ name: 'Sol', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340 });

const def = (key: string): MegaTypeDef => {
  const d = megaTypeDef(key);
  if (!d) throw new Error(`registry has no '${key}'`);
  return d;
};

describe('hard clauses — relevance greys, with a sentence a GM can read', () => {
  it('a space elevator is offered on Earth and greyed in deep space, by name', () => {
    const elevator = def('space-elevator');
    expect(megaHardCheck(elevator.requires, earth(), elevator.explain)).toEqual({ ok: true });
    const star = sol();
    const r = megaHardCheck(elevator.requires, star, elevator.explain);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Sol');        // {host} interpolated — acceptance 3
    expect(r.reason).not.toContain('{host}');
  });

  it('a space elevator is greyed on a world whose geostationary is only a fallback', () => {
    const elevator = def('space-elevator');
    const locked = earth();
    locked.orbitalBoundaries!.isGeoFallback = true;
    const r = megaHardCheck(elevator.requires, locked, elevator.explain);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/geostationary/i);
  });

  it('a space elevator is greyed on a gas giant — a surface clause, not a kind clause', () => {
    const elevator = def('space-elevator');
    const jupiter = mk({ name: 'Jupiter', classes: ['gas-giant'], orbitalBoundaries: earth().orbitalBoundaries });
    expect(hostHasSurface(jupiter)).toBe(false);
    expect(megaHardCheck(elevator.requires, jupiter).ok).toBe(false);
  });

  it('a ringworld is greyed on a planet and offered on a star ("you cant put a death star on a planet. That simple.")', () => {
    const ringworld = def('ringworld');
    expect(megaHardCheck(ringworld.requires, earth(), ringworld.explain).ok).toBe(false);
    expect(megaHardCheck(ringworld.requires, sol(), ringworld.explain).ok).toBe(true);
  });

  it('a Death Star wants a real mass: offered on planets, moons, stars, barycentres; greyed on a belt', () => {
    const ds = def('death-star');
    expect(megaHardCheck(ds.requires, earth()).ok).toBe(true);
    expect(megaHardCheck(ds.requires, sol()).ok).toBe(true);
    expect(megaHardCheck(ds.requires, mk({ name: 'Kuiper', roleHint: 'belt' })).ok).toBe(false);
  });

  it('an unknown hard clause PASSES — greying on a rule this build cannot state refuses for an unreadable reason', () => {
    const r = megaHardCheck({ hard: { minTechLevel: 9 } as never }, earth());
    expect(r.ok).toBe(true);
  });
});

describe('steer clauses — tags and explains, never refuses', () => {
  it('a ringworld at 3 AU gets the goldilocks note with the numbers, and at 1 AU gets silence', () => {
    const ringworld = def('ringworld');
    const star = sol();
    const ctx = { placementAU: 3, goldilocks: { inner: 0.95, outer: 1.67 } };
    const notes = megaSteerNotes(ringworld.requires, star, ctx);
    expect(notes).toHaveLength(1);
    expect(notes[0].tag.key).toBe('mega/outside-goldilocks');
    expect(notes[0].sentence).toContain('3');
    expect(notes[0].sentence).toContain('Sol');
    expect(notes[0].sentence).toMatch(/legitimate/);
    // Whose zone: the sentence names the baseline rather than presenting one band as "the" zone.
    expect(notes[0].sentence).toMatch(/water-and-sunlight/);
    expect(megaSteerNotes(ringworld.requires, star, { placementAU: 1.2, goldilocks: { inner: 0.95, outer: 1.67 } })).toHaveLength(0);
  });

  it('inHabitableZone smuggled into hard is DEMOTED: never greys, still steers', () => {
    const packAuthored = { hard: { hostIsStar: true, inHabitableZone: true } as never, steer: {} };
    const star = sol();
    expect(megaHardCheck(packAuthored, star).ok).toBe(true); // the wall does not hold
    const notes = megaSteerNotes(packAuthored, star, { placementAU: 5, goldilocks: { inner: 0.95, outer: 1.67 } });
    expect(notes.some((n) => n.tag.key === 'mega/outside-goldilocks')).toBe(true); // the recommendation survives
  });

  it('geostationary near the edge of the well is a note, not a wall', () => {
    const elevator = def('space-elevator');
    const smallMoon = earth();
    smallMoon.name = 'Smallmoon';
    smallMoon.orbitalBoundaries!.heoUpperBoundaryKm = 50000; // geo at 35786 = 72% of reach
    const notes = megaSteerNotes(elevator.requires, smallMoon, {});
    expect(notes).toHaveLength(1);
    expect(notes[0].tag.key).toBe('mega/geo-near-hill-edge');
    expect(notes[0].sentence).toContain('Smallmoon');
    // And the hard check still says YES — plausibility never greys.
    expect(megaHardCheck(elevator.requires, smallMoon).ok).toBe(true);
  });

  it('a collector far from its star gets the inverse-square sentence', () => {
    const collector = def('energy-collector');
    const notes = megaSteerNotes(collector.requires, sol(), { placementAU: 10 });
    expect(notes).toHaveLength(1);
    expect(notes[0].tag.key).toBe('mega/far-from-star');
    expect(notes[0].sentence).toMatch(/square/);
  });

  it('a clause whose inputs are missing produces NO note — a warning with no number is a mood', () => {
    const ringworld = def('ringworld');
    // No placement chosen yet, no goldilocks supplied: nothing to measure, nothing said.
    expect(megaSteerNotes(ringworld.requires, sol(), {})).toHaveLength(0);
  });
});

describe('effective requires — the pack wins, the registry is the default', () => {
  it('a template with its own requires overrides the registry record wholesale', () => {
    const d = def('ringworld');
    const template = { requires: { hard: { hostKind: ['planet'] } } } as CelestialBody;
    expect(effectiveMegaRequires(template, d)).toBe(template.requires);
    expect(effectiveMegaRequires({} as CelestialBody, d)).toBe(d.requires);
    // A template naming a type this build does not know, with no requires: nothing gates it.
    expect(effectiveMegaRequires({} as CelestialBody, undefined)).toEqual({});
  });
});

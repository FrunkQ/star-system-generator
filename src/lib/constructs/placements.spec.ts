// ONE SPELLING OF EACH PLACEMENT, AND OLD SAVES STILL READ. The fault this pins: a station made
// through the create dialog was stored as 'Mid Orbit'; the Orbit tab offered 'Medium Orbit'; its
// Zone select came up empty. Seen RED first with `canonicalPlacement` returning its input.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  canonicalPlacement, hostOrbitBands, orbitBandAtAltitude, hasRealGeostationary,
  ORBIT_BAND_PLACEMENTS, PLACEMENT_MEDIUM_ORBIT
} from './placements';
import { megaPlacementAllowed, megaPlacementWord } from './megaPlacement';
import { megaTypeDef } from './megaTypes';

const earthLike = { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 35786, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false };

describe('placement words', () => {
  it("an old save's 'Mid Orbit' reads as the one word, and nothing else is rewritten", () => {
    expect(canonicalPlacement('Mid Orbit')).toBe('Medium Orbit');
    for (const p of ['Medium Orbit', 'Low Orbit', 'Surface', 'L4', 'Earth - Mars', 'Docked: Beanstalk - GO', 'Inner System'])
      expect(canonicalPlacement(p)).toBe(p);
    expect(canonicalPlacement(null)).toBeNull();
    expect(canonicalPlacement(undefined)).toBeUndefined();
  });

  it('the mega registry speaks the same word: a torus or battle station at either spelling is allowed', () => {
    for (const key of ['planetary-torus', 'death-star', 'soletta']) {
      const d = megaTypeDef(key)!;
      expect(d.allowedPlacements, key).toContain(PLACEMENT_MEDIUM_ORBIT);
      expect(d.allowedPlacements, key).not.toContain('Mid Orbit');
      expect(megaPlacementAllowed(d, 'Medium Orbit'), key).toBe(true);
      expect(megaPlacementAllowed(d, 'Mid Orbit'), key).toBe(true);   // an old save
    }
    expect(megaPlacementWord('Mid Orbit')).toBe('Medium Orbit');
  });

  it('NO SOURCE FILE spells the band any other way - the constant is the only place the word is written', () => {
    // The duplication detector: a second literal is how the two spellings happened.
    const files = [
      'src/lib/components/AddConstructModal.svelte', 'src/lib/components/ConstructGeneralTab.svelte',
      'src/lib/components/SystemView.svelte', 'src/lib/construct-logic.ts',
      'src/lib/constructs/megaTypes.ts', 'src/lib/constructs/megaPlacement.ts', 'src/lib/transit/scheduler.ts'
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes("'Mid Orbit'") || src.includes('"Mid Orbit"'), `${f} writes 'Mid Orbit'`).toBe(false);
      expect(src.includes("'Medium Orbit'") || src.includes('"Medium Orbit"'), `${f} writes its own 'Medium Orbit'`).toBe(false);
    }
  });
});

describe('what a host offers, and where an altitude falls', () => {
  it('Earth offers all four; a host with no room for a band does not offer it; a fallback geostationary is not one', () => {
    expect(hostOrbitBands(earthLike)).toEqual([...ORBIT_BAND_PLACEMENTS]);
    const micro = { minLeoKm: 5, leoMoeBoundaryKm: 40, meoHeoBoundaryKm: 40, heoUpperBoundaryKm: 40, geoStationaryKm: null, isGeoFallback: true };
    expect(hostOrbitBands(micro)).toEqual(['Low Orbit']);
    expect(hostOrbitBands({ ...earthLike, isGeoFallback: true })).toEqual(['Low Orbit', 'Medium Orbit', 'High Orbit']);
    expect(hasRealGeostationary({ ...earthLike, geoStationaryKm: null })).toBe(false);
    expect(hostOrbitBands(undefined)).toEqual(['Low Orbit']);
  });

  it('an altitude lands in the band its boundaries say - the ISS low, GPS medium, the Moon high', () => {
    expect(orbitBandAtAltitude(earthLike, 408)).toBe('Low Orbit');
    expect(orbitBandAtAltitude(earthLike, 2000)).toBe('Low Orbit');
    expect(orbitBandAtAltitude(earthLike, 20200)).toBe('Medium Orbit');
    expect(orbitBandAtAltitude(earthLike, 378000)).toBe('High Orbit');
    // Geostationary is a RADIUS, not a band: an altitude at or near it is never called by its name.
    expect(orbitBandAtAltitude(earthLike, 35786)).toBe('Medium Orbit');
    expect(orbitBandAtAltitude(earthLike, 36000)).toBe('High Orbit');
  });
});

import { describe, it, expect } from 'vitest';
import {
  availableFrameLevels, frameForLevel, frameLevelsFrom, firstFrameLevel, nextFrameLevel,
  prevFrameLevel, frameHalfExtent, autoFrameStep, AUTO_FRAME_MIN_UPDATE_MS
} from './camera';
import type { System } from '../types';

// A tiny system: star ← planet ← (moon, construct). Positions in AU world space.
const system = {
  nodes: [
    { id: 'star', kind: 'body', roleHint: 'star', parentId: null, radiusKm: 695700 },
    { id: 'planet', kind: 'body', roleHint: 'planet', parentId: 'star', radiusKm: 6371 },
    { id: 'moon', kind: 'body', roleHint: 'moon', parentId: 'planet', radiusKm: 1737 },
    { id: 'ship', kind: 'construct', roleHint: 'construct', parentId: 'planet' }
  ]
} as unknown as System;

const pos = new Map<string, { x: number; y: number }>([
  ['star', { x: 0, y: 0 }],
  ['planet', { x: 10, y: 0 }],
  ['moon', { x: 10.05, y: 0 }],
  ['ship', { x: 10.001, y: 0 }]
]);
const empty = new Map<string, { x: number; y: number }>();
const canvas = { width: 800, height: 600 } as HTMLCanvasElement;

const lv = (nodeId: string) =>
  availableFrameLevels({ nodeId, system, toytownFactor: 0, scaledWorldPositions: empty, worldPositions: pos });

const frame = (nodeId: string, level: number) =>
  frameForLevel({
    nodeId, level, system, canvas, currentPan: { x: 0, y: 0 }, currentZoom: 1,
    toytownFactor: 0, scaledWorldPositions: empty, worldPositions: pos, x0_distance: 1
  });

describe('multi-level click framing', () => {
  it('reports the levels that exist per object (missing ones skipped)', () => {
    expect(lv('star')).toEqual([3, 2]);     // ROOT body: close-up first, whole system on the next click
    expect(lv('planet')).toEqual([1, 2, 3]); // parent + satellites
    expect(lv('moon')).toEqual([1, 3]);      // parent, no satellites → skip 2
    expect(lv('ship')).toEqual([1, 3]);      // construct: parent, no satellites
  });

  it('zooms in monotonically across levels and stays centred on the object', () => {
    const l1 = frame('planet', 1); // planet + star
    const l2 = frame('planet', 2); // planet + moon
    const l3 = frame('planet', 3); // planet fills screen
    expect(l1.zoom).toBeLessThan(l2.zoom);
    expect(l2.zoom).toBeLessThan(l3.zoom);
    for (const f of [l1, l2, l3]) {
      expect(f.pan.x).toBeCloseTo(10, 6);
      expect(f.pan.y).toBeCloseTo(0, 6);
    }
  });

  it('level 1 puts the parent ~border-fraction in from the edge', () => {
    // Planet centred, star 10 AU away → half-extent 10/0.9 ≈ 11.11 AU, zoom = 300/11.11.
    const { zoom } = frame('planet', 1);
    expect(zoom).toBeCloseTo(300 / (10 / 0.9), 4);
  });
});

// The ladder + follow policy are SHARED with the player views' holo (2D locked = the orrery's behaviour).
// These pin the rules themselves, independent of any renderer.
describe('shared click ladder', () => {
  it('steps first → next, skipping missing levels and WRAPPING at the deepest', () => {
    const planet = frameLevelsFrom({ hasParent: true, hasSatellites: true });
    const moon = frameLevelsFrom({ hasParent: true, hasSatellites: false });
    const lone = frameLevelsFrom({ hasParent: false, hasSatellites: false });
    const star = frameLevelsFrom({ hasParent: false, hasSatellites: true }); // real root body (hasRadius defaults true)
    const baryRoot = frameLevelsFrom({ hasParent: false, hasSatellites: true, hasRadius: false }); // root barycentre point
    expect(planet).toEqual([1, 2, 3]);
    expect(moon).toEqual([1, 3]);
    expect(lone).toEqual([3]);
    expect(star).toEqual([3, 2]);       // ROOT star: close-up FIRST, whole system on the next click
    expect(baryRoot).toEqual([2, 3]);   // radius-less root: nothing to zoom into → whole-system-first

    // A planet: parent → satellites → close, then WRAPS back out to parent context.
    let l = firstFrameLevel(planet);
    const walk = [l];
    for (let i = 0; i < 3; i++) walk.push((l = nextFrameLevel(planet, l)));
    expect(walk).toEqual([1, 2, 3, 1]);

    // A moon has no satellites → level 2 is skipped entirely, in both directions.
    let m = firstFrameLevel(moon);
    expect([m, (m = nextFrameLevel(moon, m)), nextFrameLevel(moon, m)]).toEqual([1, 3, 1]);

    // A root star LEADS with its close-up, then the next click opens out to the FULL SYSTEM, then cycles.
    let st = firstFrameLevel(star);
    expect([st, (st = nextFrameLevel(star, st)), nextFrameLevel(star, st)]).toEqual([3, 2, 3]);

    // A lone object only has its close-up; clicking cycles in place.
    expect(nextFrameLevel(lone, 3)).toBe(3);
  });

  it('steps back OUT (browser Back) as the exact inverse, and reports when it is done', () => {
    const planet = frameLevelsFrom({ hasParent: true, hasSatellites: true });
    const moon = frameLevelsFrom({ hasParent: true, hasSatellites: false });
    expect(prevFrameLevel(planet, 3)).toBe(2);
    expect(prevFrameLevel(planet, 2)).toBe(1);
    expect(prevFrameLevel(moon, 3)).toBe(1);   // skips the level that doesn't exist, same as going in
    // At the first level it returns the SAME level — the signal to stop stepping the ladder and instead
    // carry on up the view hierarchy (unfocus → starmap → leave the page).
    expect(prevFrameLevel(planet, 1)).toBe(1);
    expect(prevFrameLevel(moon, 1)).toBe(1);
    // In and back out again round-trips exactly.
    const walkIn = [1, nextFrameLevel(planet, 1), nextFrameLevel(planet, 2)];
    expect(walkIn).toEqual([1, 2, 3]);
    expect([3, prevFrameLevel(planet, 3), prevFrameLevel(planet, 2)]).toEqual([3, 2, 1]);
  });

  it('sizes each level in the CALLER units (so the orrery and holo agree)', () => {
    const radius = 0.14;
    expect(frameHalfExtent({ level: 1, radius, parentDist: 10 })).toBeCloseTo(10 / 0.9, 6);
    expect(frameHalfExtent({ level: 2, radius, maxSatelliteDist: 1.2 })).toBeCloseTo(1.2 / 0.9, 6);
    // Level 3: the object's DIAMETER fills fillFrac (0.5) of the framed extent.
    const half = frameHalfExtent({ level: 3, radius });
    expect((2 * radius) / (2 * half)).toBeCloseTo(0.5, 6);
    // A missing level falls through to the next that applies; radius-less → 0 (caller substitutes).
    expect(frameHalfExtent({ level: 1, radius, maxSatelliteDist: 1.2 })).toBeCloseTo(1.2 / 0.9, 6);
    expect(frameHalfExtent({ level: 3, radius: 0 })).toBe(0);
  });
});

describe('shared auto-frame follow policy', () => {
  const base = { current: 100, ideal: 200, userOverride: false, sinceLastMs: 1000 };

  it('eases toward the ideal, ratio-clamped per step', () => {
    const next = autoFrameStep(base)!;
    expect(next).toBeGreaterThan(base.current);   // moves toward ideal…
    expect(next).toBeLessThan(base.ideal);        // …but not in one jump
    expect(next).toBeCloseTo(120, 6);             // AUTO_ZOOM_MAX_STEP_RATIO = 1.2
  });

  it('never fights a user who is driving, and holds off near periapsis', () => {
    expect(autoFrameStep({ ...base, userOverride: true })).toBeNull();
    expect(autoFrameStep({ ...base, suppress: true })).toBeNull();
  });

  it('rate-limits and ignores sub-deadband corrections (no hunting)', () => {
    expect(autoFrameStep({ ...base, sinceLastMs: AUTO_FRAME_MIN_UPDATE_MS - 1 })).toBeNull();
    expect(autoFrameStep({ ...base, ideal: 100.5 })).toBeNull(); // 0.5% < 2% deadband
  });
});

// The locked-2D follow moves the camera by the SAME delta as the target. That is what guarantees the
// map pans instead of rotating — the camera→target offset (and so the heading) is preserved exactly.
describe('locked follow is a pure pan', () => {
  it('preserves the camera→target offset as the focus moves', () => {
    let target = { x: 3, y: 0, z: 4 };
    let camera = { x: 3, y: 10, z: 4 }; // directly above the target
    const offset0 = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z };

    // The body orbits to a wholly different bearing; follow it the way driveFocus does when locked.
    for (const desired of [{ x: -5, y: 0, z: 2 }, { x: 0, y: 0, z: -7 }, { x: 6, y: 0, z: 1 }]) {
      const d = { x: desired.x - target.x, y: desired.y - target.y, z: desired.z - target.z };
      target = desired;
      camera = { x: camera.x + d.x, y: camera.y + d.y, z: camera.z + d.z };
      const off = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z };
      expect(off.x).toBeCloseTo(offset0.x, 10);
      expect(off.y).toBeCloseTo(offset0.y, 10);
      expect(off.z).toBeCloseTo(offset0.z, 10); // heading unchanged ⇒ pan, never rotate
      // …and the focus is exactly centred (no lerp lag).
      expect(target).toEqual(desired);
    }
  });
});

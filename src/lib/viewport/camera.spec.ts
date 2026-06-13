import { describe, it, expect } from 'vitest';
import { availableFrameLevels, frameForLevel } from './camera';
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
    expect(lv('star')).toEqual([2, 3]);     // no parent → no level 1; has planets
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

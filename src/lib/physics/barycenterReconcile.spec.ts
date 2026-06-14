import { describe, it, expect } from 'vitest';
import { reconcileBarycenters } from './barycenterReconcile';
import type { System } from '../types';

// A ghost barycentre: nothing actually orbits it (its "members" point elsewhere / it has a dangling
// parent). It should be removed so it doesn't render at the system centre and drag things in.
describe('reconcileBarycenters — ghost cleanup', () => {
  it('removes a barycentre that nothing orbits, leaving the real bodies untouched', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'star', kind: 'body', roleHint: 'star', name: 'A', parentId: null, massKg: 2e30 },
        // a real planet that (correctly) orbits the star directly
        { id: 'hades', kind: 'body', roleHint: 'planet', name: 'Hades', parentId: 'star', massKg: 6e24,
          orbit: { hostId: 'star', hostMu: 1e20, t0: 0, elements: { a_AU: 5.5, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        // a GHOST barycentre: its parent is missing, and its listed members point elsewhere / are gone
        { id: 'ghost-bary', kind: 'barycenter', name: 'Ghost', parentId: 'missing-bary',
          memberIds: ['hades', 'gone'], effectiveMassKg: 1e25,
          orbit: { hostId: 'missing-bary', hostMu: 1e15, t0: 0, elements: { a_AU: 0.0003, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
      ]
    } as unknown as System;

    reconcileBarycenters(sys);

    expect(sys.nodes.some((n) => n.id === 'ghost-bary')).toBe(false);   // ghost removed
    const hades = sys.nodes.find((n) => n.id === 'hades') as any;
    expect(hades).toBeTruthy();                                          // real planet kept
    expect(hades.parentId).toBe('star');                                // still orbits the star, unmoved
    expect(hades.orbit.elements.a_AU).toBeCloseTo(5.5);
  });

  it('keeps a real star barycentre that its stars orbit', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'bary', kind: 'barycenter', name: 'AB', parentId: null, memberIds: ['a', 'b'], effectiveMassKg: 4e30 },
        { id: 'a', kind: 'body', roleHint: 'star', name: 'A', parentId: 'bary', massKg: 2e30,
          orbit: { hostId: 'bary', hostMu: 2e20, t0: 0, elements: { a_AU: 10, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        { id: 'b', kind: 'body', roleHint: 'star', name: 'B', parentId: 'bary', massKg: 2e30,
          orbit: { hostId: 'bary', hostMu: 2e20, t0: 0, elements: { a_AU: 10, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 3.14 } } }
      ]
    } as unknown as System;

    reconcileBarycenters(sys);
    expect(sys.nodes.some((n) => n.id === 'bary')).toBe(true);   // real barycentre survives
  });
});

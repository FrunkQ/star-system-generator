import { describe, it, expect } from 'vitest';
import { propagateState, propagateState3D } from './orbits';
import { AU_KM } from '../constants';

// Minimal orbit node factory. propagateState / propagateState3D only touch `.orbit`.
function node(elements: Partial<{
  a_AU: number; e: number; i_deg: number; Omega_deg: number; omega_deg: number; M0_rad: number;
}>, hostMu = 1.32712440018e20) {
  return {
    orbit: {
      hostId: 'star',
      hostMu,
      t0: 0,
      elements: {
        a_AU: 1, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0,
        ...elements
      }
    }
  };
}

const mag2 = (r: { x: number; y: number }) => Math.hypot(r.x, r.y);
const mag3 = (r: { x: number; y: number; z: number }) => Math.hypot(r.x, r.y, r.z);

// Quarter-period time (ms) for a circular orbit of the given elements.
function quarterPeriodMs(a_AU: number, hostMu: number) {
  const a_m = a_AU * AU_KM * 1000;
  const n = Math.sqrt(hostMu / a_m ** 3); // rad/s
  return (Math.PI / 2 / n) * 1000;
}

describe('propagateState3D', () => {
  it('matches the 2D propagator for a flat orbit (i=0, Omega=0), with z=0', () => {
    const n = node({ a_AU: 1.6, e: 0.2, omega_deg: 35 });
    for (const t of [0, 1e9, 5e9, 2.2e10]) {
      const r2 = propagateState(n, t).r;
      const r3 = propagateState3D(n, t).r;
      expect(r3.x).toBeCloseTo(r2.x, 10);
      expect(r3.y).toBeCloseTo(r2.y, 10);
      expect(r3.z).toBeCloseTo(0, 12);
    }
  });

  it('preserves position magnitude under the 3D rotation (rotation is length-preserving)', () => {
    // The 2D propagator ignores i/Omega, so the perifocal distance is identical; both rotations
    // are orthonormal, so |r_3D(inclined)| must equal |r_2D(same elements)| at every instant.
    const flat = node({ a_AU: 2, e: 0.35, omega_deg: 50 });
    const inclined = node({ a_AU: 2, e: 0.35, omega_deg: 50, i_deg: 40, Omega_deg: 70 });
    for (const t of [0, 3e8, 1.4e9, 9e9]) {
      expect(mag3(propagateState3D(inclined, t).r)).toBeCloseTo(mag2(propagateState(flat, t).r), 6);
    }
  });

  it('confines an i=90, Omega=0, omega=0 orbit to the x-z plane (y stays ~0)', () => {
    const n = node({ a_AU: 1, e: 0, i_deg: 90 });
    let sawNonzeroZ = false;
    for (const t of [0, 2e6, 1e7, 3e7, 6e7]) {
      const r = propagateState3D(n, t).r;
      expect(r.y).toBeCloseTo(0, 9);
      if (Math.abs(r.z) > 1e-3) sawNonzeroZ = true;
    }
    expect(sawNonzeroZ).toBe(true); // the orbit really does leave the reference plane
  });

  it('places an i=90 circular orbit a quarter-period along the +z axis', () => {
    const a_AU = 1;
    const hostMu = 1.32712440018e20;
    const n = node({ a_AU, e: 0, i_deg: 90 });
    const r = propagateState3D(n, quarterPeriodMs(a_AU, hostMu)).r;
    // Perifocal quarter turn from periapsis (a,0) -> (0,a); with i=90 about the node line that maps to +z.
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(0, 9);
    expect(r.z).toBeCloseTo(a_AU, 6);
  });

  it('returns a zero vector for a root/no-orbit node', () => {
    const r = propagateState3D({ orbit: null } as any, 0).r;
    expect(r).toEqual({ x: 0, y: 0, z: 0 });
  });
});

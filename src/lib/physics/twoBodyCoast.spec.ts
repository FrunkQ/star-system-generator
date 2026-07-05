import { describe, it, expect } from 'vitest';
import { keplerUniversal, coastConicAt, hillSpheresAu, rootStarHillAu } from './twoBodyCoast';
import { AU_KM, G } from '../constants';
import type { System } from '../types';

// Normalised units (mu = 1) so the maths is clean: a circular orbit at r=1 has v=1 and period 2π.
const energy = (r: any, v: any, mu = 1) => (v.x * v.x + v.y * v.y) / 2 - mu / Math.hypot(r.x, r.y);

describe('keplerUniversal — deterministic two-body propagation', () => {
  it('advances a circular orbit a quarter then full period', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 1 }; // circular, mu=1
    const q = keplerUniversal(r0, v0, 1, Math.PI / 2); // quarter period
    expect(q.r.x).toBeCloseTo(0, 4);
    expect(q.r.y).toBeCloseTo(1, 4);
    expect(Math.hypot(q.v.x, q.v.y)).toBeCloseTo(1, 4); // speed unchanged on a circle
    const full = keplerUniversal(r0, v0, 1, 2 * Math.PI);
    expect(full.r.x).toBeCloseTo(1, 3);
    expect(full.r.y).toBeCloseTo(0, 3);
  });

  it('is reversible: forward then backward returns the start (deterministic)', () => {
    const r0 = { x: 1.3, y: -0.4 }, v0 = { x: 0.2, y: 0.9 }; // some elliptical orbit
    const fwd = keplerUniversal(r0, v0, 1, 3.7);
    const back = keplerUniversal(fwd.r, fwd.v, 1, -3.7);
    expect(back.r.x).toBeCloseTo(r0.x, 5);
    expect(back.r.y).toBeCloseTo(r0.y, 5);
    expect(back.v.x).toBeCloseTo(v0.x, 5);
    expect(back.v.y).toBeCloseTo(v0.y, 5);
  });

  it('CONSERVES ENERGY on a bound (elliptical) orbit — no spurious gain', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 0.7 }; // v < circular → elliptical, dips toward the centre
    const e0 = energy(r0, v0);
    for (const dt of [0.5, 1.5, 3.0, 5.0, 9.0]) {
      const s = keplerUniversal(r0, v0, 1, dt);
      expect(energy(s.r, s.v)).toBeCloseTo(e0, 6); // same orbital energy at every time
    }
  });

  it('CONSERVES ENERGY through a deep perihelion pass (the slingshot case)', () => {
    // Nearly-radial infall: almost no angular momentum, so it whips past the centre at high speed — exactly
    // where the old step-integrator injected energy and flung the ship out. Energy must stay constant.
    const r0 = { x: 5, y: 0 }, v0 = { x: -0.6, y: 0.02 };
    const e0 = energy(r0, v0);
    for (const dt of [2, 4, 6, 8, 12, 20]) {
      const s = keplerUniversal(r0, v0, 1, dt);
      expect(energy(s.r, s.v)).toBeCloseTo(e0, 5);
    }
  });

  it('CONSERVES ENERGY on an unbound (hyperbolic) escape', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 1.6 }; // v > escape (√2) → hyperbolic
    const e0 = energy(r0, v0);
    expect(e0).toBeGreaterThan(0); // positive energy = unbound
    for (const dt of [1, 3, 7, 15]) {
      const s = keplerUniversal(r0, v0, 1, dt);
      expect(energy(s.r, s.v)).toBeCloseTo(e0, 5);
    }
  });

  it('survives a fast hyperbolic escape sampled YEARS later (no Stumpff overflow → NaN)', () => {
    // Regression: The Canterbury abandoned mid-torch at ~600 km/s, sampled 3.4 years on. The elliptic-style
    // χ guess grows ∝ dt, so √-z blew past cosh/sinh's double-precision ceiling → NaN → the orrery's whole
    // draw loop died (createRadialGradient non-finite). Real SI units to match the field failure.
    const muSun = 6.674e-11 * 1.989e30;
    const AUm = 1.495978707e11;
    const r0 = { x: -2.25 * AUm, y: -0.02 * AUm };
    const v0 = { x: 6e5, y: 1e5 }; // ~608 km/s — deep hyperbolic
    const dt = 3.4 * 365.25 * 86400;
    const s = keplerUniversal(r0, v0, muSun, dt);
    expect(Number.isFinite(s.r.x) && Number.isFinite(s.r.y)).toBe(true);
    expect(Number.isFinite(s.v.x) && Number.isFinite(s.v.y)).toBe(true);
    // Energy conserved (relative — the magnitudes are ~1e11)
    const E0 = (v0.x * v0.x + v0.y * v0.y) / 2 - muSun / Math.hypot(r0.x, r0.y);
    const E1 = (s.v.x * s.v.x + s.v.y * s.v.y) / 2 - muSun / Math.hypot(s.r.x, s.r.y);
    expect(Math.abs(E1 - E0) / Math.abs(E0)).toBeLessThan(1e-6);
    // And it's genuinely gone downrange ~v∞·dt (asymptotic drift), not stuck or teleported
    const gone = Math.hypot(s.r.x - r0.x, s.r.y - r0.y);
    const vMag = Math.hypot(v0.x, v0.y);
    expect(gone).toBeGreaterThan(0.9 * vMag * dt);
    expect(gone).toBeLessThan(1.01 * vMag * dt);
  });

  it('century-scale queries on a closed orbit stay exact (period reduction)', () => {
    const r0 = { x: 1, y: 0 }, v0 = { x: 0, y: 1 }; // circular, mu=1, period 2π
    const s = keplerUniversal(r0, v0, 1, 2 * Math.PI * 10_000 + Math.PI / 2); // 10k revs + a quarter
    expect(s.r.x).toBeCloseTo(0, 4);
    expect(s.r.y).toBeCloseTo(1, 4);
  });
});

// —— Patched-conic SOI layer (coastConicAt) ————————————————————————————————————————————————————————————
// Real SI system: a Sun-mass star at the root + a Jupiter on a circular 5.2 AU orbit. Hill radius
// r_H = 5.2·∛(m_J/3M_☉) ≈ 0.355 AU.
const SOLAR = 1.989e30;
const M_JUP = 1.898e27;
const AU_M = AU_KM * 1000;
const A_JUP = 5.2;
const vJup = Math.sqrt((G * SOLAR) / (A_JUP * AU_M)); // ≈ 13.06 km/s

const star = { id: 'star', kind: 'body', roleHint: 'star', parentId: null, massKg: SOLAR };
const jupiter = {
  id: 'jup', kind: 'body', roleHint: 'planet', parentId: 'star', massKg: M_JUP,
  orbit: { hostId: 'star', hostMu: G * SOLAR, t0: 0, elements: { a_AU: A_JUP, e: 0, M0_rad: 0, omega_deg: 0 } }
};
const sysStarOnly = { id: 'ref', nodes: [star] } as unknown as System;
const sysWithJup = { id: 'jov', nodes: [star, jupiter] } as unknown as System;

describe('hillSpheresAu — planets shaded, stars labelled (incl. root galactic limit)', () => {
  it('a solar-mass root star has a ~2 ly Hill limit, scaling as cbrt(mass)', () => {
    expect(rootStarHillAu(SOLAR) / 63241.077).toBeCloseTo(2.0, 2);           // ~2 ly
    expect(rootStarHillAu(8 * SOLAR) / rootStarHillAu(SOLAR)).toBeCloseTo(2, 5); // cbrt(8) = 2
  });
  it('includes the root star (isStar) plus planets, and marks companion stars', () => {
    const sys = { id: 's', nodes: [
      { id: 'sun', kind: 'body', roleHint: 'star', parentId: null, name: 'Sol', massKg: SOLAR },
      { id: 'jup', kind: 'body', roleHint: 'planet', parentId: 'sun', name: 'Jupiter', massKg: M_JUP, orbit: { hostId: 'sun', hostMu: G * SOLAR, elements: { a_AU: A_JUP } } }
    ] } as unknown as System;
    const hs = hillSpheresAu(sys);
    const sun = hs.find((h) => h.id === 'sun'); const jup = hs.find((h) => h.id === 'jup');
    expect(sun?.isStar).toBe(true);
    expect(jup?.isStar).toBe(false);
    expect(sun!.rAu).toBeGreaterThan(jup!.rAu); // the galactic limit dwarfs a planet Hill sphere
  });
});

describe('coastConicAt — patched-conic SOI handoff', () => {
  it('a drift past Jupiter gets BENT (the fling is back), unlike the star-only conic', () => {
    // Start just inside Jupiter's Hill sphere (0.3 AU sunward of it, boundary at 0.355 AU), moving +y at
    // 5 km/s relative to the planet — a hyperbolic flyby that should exit deflected.
    const p0 = { x: A_JUP - 0.3, y: 0 };
    const v0 = { x: 0, y: vJup + 5000 };
    const AT = 1e7 * 1000; // ~116 days — well past the ~26-day sphere transit
    const patched = coastConicAt(sysWithJup, p0, v0, 0, AT)!;
    const starOnly = coastConicAt(sysStarOnly, p0, v0, 0, AT)!;
    expect(Number.isFinite(patched.position_au.x)).toBe(true);
    const dx = patched.position_au.x - starOnly.position_au.x;
    const dy = patched.position_au.y - starOnly.position_au.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0.02); // Jupiter measurably bent the trajectory
    // ...and the encounter exchanged energy with the planet (a real slingshot, not a cosmetic wiggle).
    const vP = Math.hypot(patched.velocity_ms.x, patched.velocity_ms.y);
    const vS = Math.hypot(starOnly.velocity_ms.x, starOnly.velocity_ms.y);
    expect(Math.abs(vP - vS)).toBeGreaterThan(50);
  });

  it('is query-order independent: incremental scrubbing matches the one-shot answer exactly', () => {
    const p0 = { x: A_JUP - 0.3, y: 0 };
    const v0 = { x: 0, y: vJup + 5000 };
    const AT = 1e7 * 1000;
    const oneShot = coastConicAt(sysWithJup, p0, v0, 0, AT)!;
    // Different system id → different cache track, built by incremental queries instead of one jump.
    const sysB = { id: 'jov-b', nodes: [star, jupiter] } as unknown as System;
    for (const t of [1e6, 3e6, 6e6, 8e6]) coastConicAt(sysB, p0, v0, 0, t * 1000);
    const incremental = coastConicAt(sysB, p0, v0, 0, AT)!;
    expect(incremental.position_au.x).toBeCloseTo(oneShot.position_au.x, 10);
    expect(incremental.position_au.y).toBeCloseTo(oneShot.position_au.y, 10);
    expect(incremental.velocity_ms.x).toBeCloseTo(oneShot.velocity_ms.x, 6);
    expect(incremental.velocity_ms.y).toBeCloseTo(oneShot.velocity_ms.y, 6);
  });

  it('a ship abandoned on a tight orbit INSIDE the sphere is captured — it stays with the planet', () => {
    const rRel = 0.05; // AU from Jupiter, well inside r_H, apo ≪ 0.95·r_H → capture
    const vCircJ = Math.sqrt((G * M_JUP) / (rRel * AU_M)); // ≈ 4.1 km/s circular about Jupiter
    const p0 = { x: A_JUP - rRel, y: 0 };
    const v0 = { x: 0, y: vJup + vCircJ };
    for (const days of [30, 300, 1500]) {
      const at = days * 86400 * 1000;
      const s = coastConicAt(sysWithJup, p0, v0, 0, at)!;
      // Jupiter's own position at t (circular orbit from angle n·t).
      const ang = (vJup / (A_JUP * AU_M)) * days * 86400;
      const jx = A_JUP * Math.cos(ang), jy = A_JUP * Math.sin(ang);
      const d = Math.hypot(s.position_au.x - jx, s.position_au.y - jy);
      expect(d).toBeLessThan(0.1); // still riding with the planet, not off on a sun ellipse
    }
  });

  it('a ship that never reaches any planet band is EXACTLY the pure star conic (pruned, zero cost)', () => {
    const vCirc1 = Math.sqrt((G * SOLAR) / AU_M);
    const p0 = { x: 1, y: 0 }, v0 = { x: 0, y: vCirc1 }; // circular at 1 AU — can't reach 5.2±
    const AT = 5 * 365.25 * 86400 * 1000;
    const patched = coastConicAt(sysWithJup, p0, v0, 0, AT)!;
    const starOnly = coastConicAt(sysStarOnly, p0, v0, 0, AT)!;
    expect(patched.position_au.x).toBeCloseTo(starOnly.position_au.x, 10);
    expect(patched.position_au.y).toBeCloseTo(starOnly.position_au.y, 10);
  });
});

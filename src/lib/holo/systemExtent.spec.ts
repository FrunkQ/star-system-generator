/**
 * A78 — AN EXTENT MUST INCLUDE THE EXTENT OF ITS MEMBERS, NOT JUST THEIR DISTANCES.
 *
 * `rMax` is the framing normaliser: `compressRadius` maps it to `GRID_RADIUS`, `trueScaleFactor` is
 * `gridRadius / rMax`, and the whole-system shot frames `GRID_RADIUS`. It used to measure POSITIONS
 * only — and a star sits at the centre, so its position magnitude is zero and it counted for
 * nothing. A lone red supergiant therefore fell through to the 1 AU fallback while its own radius is
 * 4.18 AU, and drew at ~50 scene units inside a frame of 12.
 *
 * WHAT THIS FILE PINS is the LAW, not the rendering: the extent rule itself, and the consequence
 * that matters (the largest body fits inside the frame the whole-system shot solves for). The scene
 * function is a 1,000-line closure that cannot be called from a test, so the rule is reproduced here
 * from the same shared helpers the scene uses — `physicalRadiusAu`, `trueScaleFactor`,
 * `trueScaleFactor`, `starRadiusScene` — which is what makes the reproduction faithful rather than a second law.
 *
 * RUN AGAINST THE OLD CODE THIS GOES RED: drop the `+ physicalRadiusAu(...)` term from `systemRMax`
 * and the supergiant cases fail with the star four times outside its own frame. That was checked
 * before this file was believed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { physicalRadiusAu, rendersAsStar, trueScaleFactor, starRadiusScene, GRID_RADIUS, STAR_RADIUS } from '$lib/rendering/scaleLaw';
import { AU_KM } from '$lib/constants';
import type { System } from '$lib/types';

/**
 * THE RULE UNDER TEST, in the same shape `scene.ts` uses it. Kept here rather than imported because
 * the scene's copy lives inside `createHoloScene`'s closure; `systemExtent.spec` is therefore a
 * DRIFT RISK, and the guard at the bottom of this file is what catches it.
 */
function systemRMax(system: System, timeMs: number): number {
  const byId = new Map<string, any>((system.nodes as any[]).map((n) => [n.id, n]));
  let rMax = 0;
  for (const [id, p] of computeWorldPositions3D(system, timeMs)) {
    rMax = Math.max(rMax, Math.hypot(p.x, p.y, p.z) + physicalRadiusAu(byId.get(id)));
  }
  if (rMax <= 0) rMax = 1;
  return rMax;
}

const T = 1_800_000_000_000;
const R_SUN_KM = 696_000;

const star = (radiusKm: number, extra: any = {}) => ({
  id: 'star', name: 'Star', kind: 'body', roleHint: 'star', parentId: null,
  massKg: 3e31, radiusKm, ...extra
});
const planet = (id: string, aAu: number, radiusKm = 6371) => ({
  id, name: id, kind: 'body', parentId: 'star', massKg: 6e24, radiusKm,
  orbit: { hostId: 'star', hostMu: 2e21, t0: T, elements: { a_AU: aAu, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
});
const sys = (nodes: any[]): System => ({ id: 's', name: 'S', epochT0: T, nodes } as any);

/** Scene radius the largest star draws at, at TRUE scale — the case that overflowed. */
function starSceneRadiusAtTrueScale(system: System): number {
  const rMax = systemRMax(system, T);
  const s: any = (system.nodes as any[]).find(rendersAsStar);
  return starRadiusScene(s.radiusKm, { bodySize: 0, rMax, gridRadius: GRID_RADIUS });
}

describe('A78 — the system extent includes its members own sizes', () => {
  // Betelgeuse-ish: ~900 solar radii, a true radius of 4.18 AU.
  const SUPERGIANT_KM = 900 * R_SUN_KM;

  it('THE BUG: a lone supergiant used to be framed for 1 AU while being 4.18 AU across', () => {
    const lone = sys([star(SUPERGIANT_KM)]);
    // The old rule: positions only. The star is at the origin, so nothing is measured at all.
    let old = 0;
    for (const p of computeWorldPositions3D(lone, T).values()) old = Math.max(old, Math.hypot(p.x, p.y, p.z));
    expect(old).toBe(0);                       // the star contributed nothing
    expect(physicalRadiusAu(lone.nodes[0])).toBeCloseTo(4.1872, 3);
  });

  it('a lone supergiant now sets the extent from its own limb', () => {
    const lone = sys([star(SUPERGIANT_KM)]);
    expect(systemRMax(lone, T)).toBeCloseTo(4.1872, 3);
  });

  it('AND IT FITS: at true scale the star draws inside the frame, not four times outside it', () => {
    const lone = sys([star(SUPERGIANT_KM)]);
    const drawn = starSceneRadiusAtTrueScale(lone);
    expect(drawn).toBeLessThanOrEqual(GRID_RADIUS + 1e-9);
    // ...and it is a DISC filling the shot rather than a speck: at least half the frame radius.
    expect(drawn).toBeGreaterThan(GRID_RADIUS * 0.5);
  });

  it('a supergiant WITH close-in planets shows the whole system, not a wall of star', () => {
    const withWorlds = sys([star(SUPERGIANT_KM), planet('p1', 1.2), planet('p2', 2.5)]);
    const rMax = systemRMax(withWorlds, T);
    // The star's limb is the extent, because it reaches past both planets.
    expect(rMax).toBeCloseTo(4.1872, 3);
    expect(starSceneRadiusAtTrueScale(withWorlds)).toBeLessThanOrEqual(GRID_RADIUS + 1e-9);
    // The outer planet is inside the frame rather than lost behind the photosphere.
    const posOuter = computeWorldPositions3D(withWorlds, T).get('p2')!;
    expect(Math.hypot(posOuter.x, posOuter.y, posOuter.z)).toBeLessThan(rMax);
  });

  it('an off-centre giant counts its DISTANCE PLUS its radius, not the larger of the two', () => {
    // A companion out at 3 AU whose own limb reaches 2 AU further: the extent is 5, not 3.
    const companion = { ...star(2 * AU_KM, { id: 'b', name: 'B', roleHint: 'star', parentId: 'star' }),
      orbit: { hostId: 'star', hostMu: 2e21, t0: T, elements: { a_AU: 3, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } };
    const binary = sys([star(R_SUN_KM), companion]);
    expect(systemRMax(binary, T)).toBeCloseTo(5, 2);
  });

  it('a system with NO bodies at all still frames something sane', () => {
    expect(systemRMax(sys([]), T)).toBe(1);
    expect(Number.isFinite(trueScaleFactor({ bodySize: 0, rMax: systemRMax(sys([]), T) }))).toBe(true);
  });

  it('a lone ORDINARY star is framed on its own limb too, and reads as a disc', () => {
    const lone = sys([star(R_SUN_KM)]);
    expect(systemRMax(lone, T)).toBeCloseTo(0.004652, 6);
    expect(starSceneRadiusAtTrueScale(lone)).toBeCloseTo(GRID_RADIUS, 6);
  });

  it('the readable end of the dial is untouched — this is a TRUE-scale law', () => {
    const lone = sys([star(SUPERGIANT_KM)]);
    const rMax = systemRMax(lone, T);
    expect(starRadiusScene(SUPERGIANT_KM, { bodySize: 1, rMax, gridRadius: GRID_RADIUS })).toBe(STAR_RADIUS);
  });

  describe('ordinary systems must not move perceptibly', () => {
    const bundled = () => {
      const out: { name: string; system: System }[] = [];
      for (const file of ['Local_Neighbourhood-Starmap.json', 'Local_Neighbourhood_SciFi-Starmap.json']) {
        const map = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps', file), 'utf-8'));
        for (const e of map.systems) if (Array.isArray(e.system?.nodes) && e.system.nodes.length) {
          out.push({ name: `${file} / ${e.name}`, system: e.system });
        }
      }
      return out;
    };

    it('Sol is unmoved to seven significant figures', () => {
      const sol = bundled().find((b) => b.name.endsWith('/ Sol'))!.system;
      let old = 0;
      for (const p of computeWorldPositions3D(sol, T).values()) old = Math.max(old, Math.hypot(p.x, p.y, p.z));
      const rel = Math.abs(systemRMax(sol, T) - old) / old;
      expect(rel).toBeLessThan(1e-6);
    });

    it('EVERY bundled system moves by less than 1%, and the worst is named if it does not', () => {
      const bad: string[] = [];
      for (const { name, system } of bundled()) {
        let old = 0;
        for (const p of computeWorldPositions3D(system, T).values()) old = Math.max(old, Math.hypot(p.x, p.y, p.z));
        if (old <= 0) continue;   // a starless or lone-star entry is the case this item CHANGES
        const rel = Math.abs(systemRMax(system, T) - old) / old;
        if (rel >= 0.01) bad.push(`${name}: ${(rel * 100).toFixed(3)}%`);
      }
      expect(bad, `systems shifted by 1% or more:\n  ${bad.join('\n  ')}`).toEqual([]);
    });
  });

  // DRIFT GUARD, the same shape `motionOnly.spec.ts` uses and for the same reason: the real rule
  // lives inside `createHoloScene`'s closure and cannot be imported, so this file's copy could
  // silently stop describing it. Read the source and require the expression to still be there.
  it('the scene still computes rMax the way this file says it does', () => {
    const src = fs.readFileSync(path.resolve('src/lib/holo/scene.ts'), 'utf-8');
    expect(src).toContain('Math.hypot(p.x, p.y, p.z) + physicalRadiusAu(nodesById.get(id))');
    expect(src).toContain('if (rMax <= 0) rMax = 1;');
  });
});

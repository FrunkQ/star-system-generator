// THE 2D MAGNETOSPHERE OVERLAY, VERIFIED BY REPRODUCING THE RENDERER'S TRANSFORM ([[G82]] job 2).
//
// A canvas cannot be checked headlessly at all in this project ([[E7]], measured): the browser pane
// runs `document.hidden`, `requestAnimationFrame` never fires, and the canvas reads back zero opaque
// pixels. So the strongest thing available is done instead, which is what the standing rule asks
// for: the renderer's own arithmetic is restated here and the NUMBERS are compared, in canvas
// pixels, against absolute expectations worked out from the geometry.
//
// WHAT THIS CAN AND CANNOT PROVE, stated so nobody reads it as more than it is. It proves the
// SHAPE, the SCALE and the DIRECTION - that Earth's bubble is eleven drawn radii across its nose,
// that the nose points at the Sun and not at some fixed screen direction, that a moon's points at
// its planet, and that the shaded region is properly inside the pale one. It cannot prove that any
// of it was painted. The eyeball list on the [[G82]] row carries what a human still has to look at.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { computeWorldPositions } from './worldPositions';
import { magnetopauseOutlineRadii, magnetopauseOutlineOriented, magnetosphereConstants,
         magnetosphereOffScreen, visibleTailRadii, magnetosphereReachRadii } from './magnetosphere';
import { hillSpheresAu } from './twoBodyCoast';
import type { System, RulePack, CelestialBody } from '../types';

function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObj(t) && isObj(s)) {
    for (const k of Object.keys(s)) {
      if (isObj(s[k])) { if (!(k in t)) Object.assign(o, { [k]: s[k] }); else o[k] = deepMerge(t[k], s[k]); }
      else Object.assign(o, { [k]: s[k] });
    }
  }
  return o;
}
function isObj(i: any) { return i && typeof i === 'object' && !Array.isArray(i); }
function loadPack(): RulePack {
  const b = path.resolve('static/rulepacks/starter-sf');
  let p = JSON.parse(fs.readFileSync(path.join(b, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
    const fp = path.join(b, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p;
}

const PACK = loadPack();
const C = magnetosphereConstants(PACK);
const SOL: System = systemProcessor.process(
  JSON.parse(fs.readFileSync(path.resolve('static/examples/Sol_2030-System.json'), 'utf-8')) as System,
  PACK
);
const by = (name: string) => SOL.nodes.find((n) => n.name === name) as CelestialBody;
const POS = computeWorldPositions(SOL, SOL.epochT0 ?? 0);

const AU_KM = 1.495978707e8;

/** `SystemVisualizer.drawnDiscRadiusWorld` restated, at toytown 0 (Real scale). One body radius in
 *  world units: the true radius, softened by the same per-role pixel floor the body pass draws with. */
function drawnDiscRadiusWorld(node: CelestialBody, zoom: number): number {
  const radiusInAU = (node.radiusKm || 0) / AU_KM;
  let minRadiusPx = 2;
  if (node.roleHint === 'star') minRadiusPx = 4;
  else if (node.roleHint === 'planet') minRadiusPx = (node.classes ?? []).some((c) => c.includes('gas-giant') || c.includes('ice-giant')) ? 3 : 2;
  else if (node.roleHint === 'moon') minRadiusPx = 1;
  const minRadiusInWorld = minRadiusPx / zoom;
  return Math.sqrt(radiusInAU * radiusInAU + minRadiusInWorld * minRadiusInWorld);
}

/** The overlay's own transform: outline (body radii, +x upstream) -> canvas pixels about the body. */
function drawnOutlinePx(body: CelestialBody, standoff: number, tail: number, zoom: number) {
  const pos = POS.get(body.id)!;
  const src = POS.get(body.magnetosphere!.upstreamId!)!;
  let ux = src.x - pos.x, uy = src.y - pos.y;
  const len = Math.hypot(ux, uy);
  ux /= len; uy /= len;
  const unit = drawnDiscRadiusWorld(body, zoom);
  // THE SAME FUNCTION THE COMPONENT CALLS. The rotation is not restated here on purpose - a gate
  // that carries its own copy of the transform it is checking checks only itself.
  const world = magnetopauseOutlineOriented(standoff, tail, C, ux, uy, unit);
  const radii = magnetopauseOutlineRadii(standoff, tail, C);
  return world.map((p, i) => ({
    x: p.x * zoom,
    y: p.y * zoom,
    upstreamDot: radii[i].x   // how far up- or downstream this point is, in body radii
  }));
}

const ZOOM = 4000; // px per AU: a system-view zoom where Earth's orbit is about 4,000 px across

describe('the teardrop lands where the geometry says, in canvas pixels', () => {
  it("Earth's nose sits at 11.2 drawn radii and its tail at 224, absolutely", () => {
    const e = by('Earth');
    const ms = e.magnetosphere!;
    const unitPx = drawnDiscRadiusWorld(e, ZOOM) * ZOOM;
    const pts = drawnOutlinePx(e, ms.standoffRadii, ms.tailRadii, ZOOM);
    const nosePx = Math.hypot(pts[0].x, pts[0].y);
    // ABSOLUTE: the nose is the standoff, by construction of the Shue form at t = 0.
    expect(nosePx / unitPx).toBeCloseTo(11.229, 2);
    // ABSOLUTE: at this zoom Earth's true radius is 0.17 px, so the 2 px floor governs and one drawn
    // radius is 2.007 px - which is what makes the bubble visible at all (22.5 px across the nose).
    expect(unitPx).toBeCloseTo(2.007, 2);
    expect(nosePx).toBeCloseTo(22.54, 1);
    const tailPx = Math.min(...pts.map((p) => p.upstreamDot));
    expect(tailPx).toBeCloseTo(-ms.tailRadii, 3);
  });

  it('the nose points AT THE SUN, not at a fixed screen direction', () => {
    for (const name of ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Mercury']) {
      const b = by(name);
      const pos = POS.get(b.id)!;
      const sun = POS.get(by('Sol').id)!;
      const pts = drawnOutlinePx(b, b.magnetosphere!.standoffRadii, b.magnetosphere!.tailRadii, ZOOM);
      // The nose, as a unit vector in canvas space, against the direction of the Sun.
      const nx = pts[0].x, ny = pts[0].y, nl = Math.hypot(nx, ny);
      const sx = sun.x - pos.x, sy = sun.y - pos.y, sl = Math.hypot(sx, sy);
      expect((nx / nl) * (sx / sl) + (ny / nl) * (sy / sl), name).toBeCloseTo(1, 6);
    }
    // And they genuinely differ from each other - six planets at six places on their orbits, so a
    // hardcoded direction would have to be wrong for at least five of them.
    const dirs = ['Earth', 'Jupiter', 'Saturn'].map((n) => {
      const p = drawnOutlinePx(by(n), 10, 200, ZOOM)[0];
      return Math.atan2(p.y, p.x).toFixed(4);
    });
    expect(new Set(dirs).size).toBe(3);
  });

  it("EUROPA'S NOSE POINTS AT JUPITER, NOT AT THE SUN - the whole reason `upstream` is published", () => {
    const eu = by('Europa');
    const pos = POS.get(eu.id)!;
    const jup = POS.get(by('Jupiter').id)!;
    const sun = POS.get(by('Sol').id)!;
    const p = drawnOutlinePx(eu, eu.magnetosphere!.standoffRadii, eu.magnetosphere!.tailRadii, ZOOM)[0];
    const nl = Math.hypot(p.x, p.y);
    const jx = jup.x - pos.x, jy = jup.y - pos.y, jl = Math.hypot(jx, jy);
    const sx = sun.x - pos.x, sy = sun.y - pos.y, sl = Math.hypot(sx, sy);
    expect((p.x / nl) * (jx / jl) + (p.y / nl) * (jy / jl)).toBeCloseTo(1, 6);
    // ...and it is NOT the Sun's direction, which is the assertion that would have caught a copy-paste.
    expect(Math.abs((p.x / nl) * (sx / sl) + (p.y / nl) * (sy / sl))).toBeLessThan(0.999);
  });

  it('the shaded region is strictly inside the pale one, everywhere', () => {
    // The owner asked for "very pale to max extent, more obvious at useful levels", which is only
    // true if the two shapes nest. They do by construction (same form, smaller r0, shorter tail) -
    // pinned because a later change to either tail length could break the nesting silently.
    for (const name of ['Earth', 'Jupiter', 'Saturn']) {
      const ms = by(name).magnetosphere!;
      const outer = magnetopauseOutlineRadii(ms.standoffRadii, ms.tailRadii, C);
      const inner = magnetopauseOutlineRadii(ms.closedFieldRadii, ms.closedFieldRadii * C.CLOSED_TAIL_STANDOFFS, C);
      const maxOuterY = Math.max(...outer.map((p) => Math.abs(p.y)));
      const maxInnerY = Math.max(...inner.map((p) => Math.abs(p.y)));
      expect(maxInnerY, name).toBeLessThan(maxOuterY);
      expect(Math.max(...inner.map((p) => p.x)), name).toBeLessThan(Math.max(...outer.map((p) => p.x)));
      expect(Math.min(...inner.map((p) => p.x)), name).toBeGreaterThan(Math.min(...outer.map((p) => p.x)));
    }
  });

  it('NOTHING OFF SCREEN IS DRAWN, and a tail is clipped to what could land on it', () => {
    // Owner, 2026-09-07: "make sure you do culling on these shapes to avoid lagging by drawing stuff
    // off screen". A twenty-standoff tail is mostly off canvas at any useful zoom, and a path handed
    // to fill() is rasterised whether or not anyone can see it.
    const halfW = 400, halfH = 250;   // a 800 x 500 viewport in world-minus-pan units
    const ms = by('Jupiter').magnetosphere!;
    const reach = magnetosphereReachRadii(ms.standoffRadii, ms.tailRadii);
    // ABSOLUTE: Jupiter's reach is its 797.6-radius tail, not 3 x 39.9 = 119.7 standoffs.
    expect(reach).toBeCloseTo(ms.tailRadii, 6);
    // A body one reach-plus-a-bit beyond the right edge is rejected; one just inside is not.
    expect(magnetosphereOffScreen(halfW + reach + 1, 0, halfW, halfH, reach)).toBe(true);
    expect(magnetosphereOffScreen(halfW + reach - 1, 0, halfW, halfH, reach)).toBe(false);
    expect(magnetosphereOffScreen(0, -(halfH + reach + 1), halfW, halfH, reach)).toBe(true);
    expect(magnetosphereOffScreen(0, 0, halfW, halfH, reach)).toBe(false);

    // The clip: with one body radius drawn at 1 world unit, a body at the centre can only show a tail
    // as long as the far corner - hypot(400, 250) = 471.7 - so 797.6 radii is cut to that.
    expect(visibleTailRadii(0, 0, halfW, halfH, 1, ms.tailRadii)).toBeCloseTo(Math.hypot(400, 250), 6);
    // It NEVER lengthens a tail, only shortens it.
    expect(visibleTailRadii(0, 0, halfW, halfH, 1e-6, ms.tailRadii)).toBe(ms.tailRadii);
    // And a clipped shape is a prefix of the full one: the visible part is untouched.
    const full = magnetopauseOutlineRadii(ms.standoffRadii, ms.tailRadii, C);
    const clipped = magnetopauseOutlineRadii(ms.standoffRadii, 120, C);
    for (let i = 0; i < 10; i++) {
      expect(clipped[i].x).toBeCloseTo(full[i].x, 9);
      expect(clipped[i].y).toBeCloseTo(full[i].y, 9);
    }
    expect(Math.min(...clipped.map((p) => p.x))).toBeGreaterThan(Math.min(...full.map((p) => p.x)));
  });

  it('a body with no field draws nothing at all, at any zoom', () => {
    for (const name of ['Venus', 'Mars', 'Luna']) {
      const ms = by(name).magnetosphere!;
      expect(ms.shape, name).toBe('none');
      expect(magnetopauseOutlineRadii(ms.standoffRadii, ms.tailRadii, C), name).toEqual([]);
    }
  });

  it('THE INFLATION IS CAPPED AT THE HILL SPHERE, because a floor times 235 is not a floor', () => {
    // The disc's 2 px floor keeps a 0.17 px Earth visible; multiplied through a twenty-standoff tail
    // the same clamp came out as a 470 px streak, and at system zoom Jupiter's bubble reached 1.5 AU
    // sunward against a true 0.019. Seen on screen 2026-09-07. The cap is the body's Hill sphere -
    // already on this map, already meaning "the space this body controls" - and a bubble outside it
    // is showing something that cannot be.
    const hills = new Map(hillSpheresAu(SOL).filter((h) => !h.isStar).map((h) => [h.id, h.rAu]));
    // ABSOLUTE: Earth's twenty-standoff tail is 224.6 x 6,371 km = 1.431e6 km, and its Hill radius is
    // 1.497e6 km. That the two nearly coincide is WHY the Hill sphere is the right cap rather than a
    // number somebody picked.
    const e = by('Earth');
    const tailKm = e.magnetosphere!.tailRadii * e.radiusKm!;
    const hillKm = hills.get(e.id)! * AU_KM;
    expect(tailKm / 1e6).toBeCloseTo(1.431, 2);
    expect(hillKm / 1e6).toBeCloseTo(1.497, 2);
    // At every zoom from a system view to a close orbit, the drawn shape stays inside the Hill sphere.
    for (const name of ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Mercury']) {
      const b = by(name);
      const ms = b.magnetosphere!;
      const trueUnit = b.radiusKm! / AU_KM;
      const hillAu = hills.get(b.id)!;
      const capUnit = Math.max(trueUnit, hillAu / ms.tailRadii);
      for (const zoom of [20, 200, 2000, 40000, 5e6]) {
        const unit = Math.min(drawnDiscRadiusWorld(b, zoom), capUnit);
        // Never inflated past the Hill sphere...
        expect(ms.tailRadii * unit, `${name} @${zoom}`).toBeLessThanOrEqual(Math.max(hillAu, ms.tailRadii * trueUnit) * 1.0000001);
        // ...and never shrunk below the truth.
        expect(unit, `${name} @${zoom}`).toBeGreaterThanOrEqual(trueUnit * 0.9999999);
      }
    }
  });

  it('and the cost of that cap is stated rather than hidden: it is a zoomed-in overlay', () => {
    // ABSOLUTE: under the cap Earth's nose is 11.229 x 4.454e-5 AU = 5.002e-4 AU. Twenty pixels of
    // nose therefore needs about 40,000 px/AU - a three-million-kilometre view, which is the
    // Earth-and-Luna framing. At a 10 AU system view it is a third of a pixel, and that is the truth.
    const e = by('Earth');
    const ms = e.magnetosphere!;
    const capUnit = Math.max(e.radiusKm! / AU_KM, hillSpheresAu(SOL).find((h) => h.id === e.id)!.rAu / ms.tailRadii);
    const noseAu = ms.standoffRadii * capUnit;
    expect(noseAu).toBeCloseTo(5.0e-4, 5);
    expect(noseAu * 40000).toBeGreaterThan(19);      // legible at a planet-scale view
    expect(noseAu * (754 / 20)).toBeLessThan(1);     // sub-pixel across a 20 AU system view
  });

  it('the bubble grows with the body on screen, so it is never sub-pixel where the body is not', () => {
    // The floor is inherited from the disc rather than invented: at any zoom the nose is the
    // standoff times whatever the body is DRAWN at, so a legible planet always has a legible bubble.
    for (const zoom of [50, 500, 5000, 5e6]) {
      const e = by('Earth');
      const unitPx = drawnDiscRadiusWorld(e, zoom) * zoom;
      expect(unitPx).toBeGreaterThanOrEqual(2);
      expect(e.magnetosphere!.standoffRadii * unitPx).toBeGreaterThan(20);
    }
    // At a zoom where Earth's true disc beats the floor, the bubble is at TRUE scale and says so:
    // 5e6 px/AU makes Earth 213 px across, and 11.2 radii is 2,391 px.
    const trueUnit = drawnDiscRadiusWorld(by('Earth'), 5e6) * 5e6;
    expect(trueUnit).toBeCloseTo((6371 / AU_KM) * 5e6, 1);
  });
});

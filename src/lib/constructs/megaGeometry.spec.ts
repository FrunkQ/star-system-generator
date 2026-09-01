// G53 phase 3: the geometry, gated headlessly. THREE runs fine in node — it is the CANVAS that E7
// rules out (document.hidden, rAF never fires), not the library — so every claim the builder makes
// about vertices, bounds, windows and the pole-clustering trap is an ordinary assertion here.
// Precedent: `modelViewer.spec.ts` builds meshes and measures their bounding boxes.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMegaGeometry } from './megaGeometry';
import { megaTypeDef, defaultMegaParams, type MegaTypeDef } from './megaTypes';
import { readFileSync } from 'fs';
import type { CelestialBody } from '$lib/types';

const sol = (): CelestialBody =>
  ({ id: 'sol', name: 'Sol', parentId: null, tags: [], kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340 }) as unknown as CelestialBody;
const earth = (): CelestialBody =>
  ({
    id: 'earth', name: 'Earth', parentId: 'sol', tags: [], kind: 'body', roleHint: 'planet',
    massKg: 5.972e24, radiusKm: 6371, rotation_period_hours: 23.934,
    orbitalBoundaries: { minLeoKm: 200, leoMoeBoundaryKm: 2000, meoHeoBoundaryKm: 50000, heoUpperBoundaryKm: 1.47e6, geoStationaryKm: 35786, isGeoFallback: false }
  }) as unknown as CelestialBody;

const def = (key: string): MegaTypeDef => {
  const d = megaTypeDef(key);
  if (!d) throw new Error(`no '${key}'`);
  return d;
};
/** The spec a type produces at defaults on its natural host — the real path, not a hand-built spec. */
const specOf = (key: string, host = sol()) => {
  const d = def(key);
  return d.shape(defaultMegaParams(d, host), host);
};

const positionsOf = (g: THREE.BufferGeometry): Float32Array => g.getAttribute('position').array as Float32Array;
const radiiOf = (g: THREE.BufferGeometry): number[] => {
  const p = positionsOf(g);
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 3) out.push(Math.hypot(p[i], p[i + 1], p[i + 2]));
  return out;
};

describe('the one sphere-section generator', () => {
  it('a Dyson sphere at full coverage closes: a complete sphere at the asked radius', () => {
    const built = buildMegaGeometry(specOf('dyson-sphere'), 3)!;
    expect(built.mode).toBe('faces');
    expect(built.interior).toBe(true);          // the camera lives inside it (§5b.4b)
    const box = new THREE.Box3().setFromBufferAttribute(built.geometry.getAttribute('position') as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(6, 3);           // diameter on every axis
    expect(size.y).toBeCloseTo(6, 3);
    expect(size.z).toBeCloseTo(6, 3);
    for (const r of radiiOf(built.geometry)) expect(r).toBeCloseTo(3, 3);
  });

  it('a HALF-BUILT shell is a longitude wedge — the coverage is visible in the geometry, not faked', () => {
    const d = def('dyson-sphere');
    const half = d.shape({ ...defaultMegaParams(d, sol()), coveragePct: 50 }, sol());
    const built = buildMegaGeometry(half, 3)!;
    const p = positionsOf(built.geometry);
    // Half coverage sweeps phi 0..PI, which in THREE's convention spans z>=0 only (within epsilon).
    let minZ = Infinity;
    for (let i = 0; i < p.length; i += 3) minZ = Math.min(minZ, p[i + 2]);
    expect(minZ).toBeGreaterThan(-1e-6);
    // ...and the closed shell does reach negative z, so the difference is the coverage itself.
    const full = positionsOf(buildMegaGeometry(specOf('dyson-sphere'), 3)!.geometry);
    let fullMinZ = Infinity;
    for (let i = 0; i < full.length; i += 3) fullMinZ = Math.min(fullMinZ, full[i + 2]);
    expect(fullMinZ).toBeLessThan(-2.9);
  });

  it('a ringworld is a narrow equatorial band — flat, not a ball, and still at its full radius', () => {
    const built = buildMegaGeometry(specOf('ringworld'), 4)!;
    const box = new THREE.Box3().setFromBufferAttribute(built.geometry.getAttribute('position') as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(8, 2);                 // full diameter across
    expect(size.z).toBeCloseTo(8, 2);
    expect(size.y).toBeLessThan(0.05);                // a sliver in the spin axis: 1.6e6 km on 1 AU
    for (const r of radiiOf(built.geometry)) expect(r).toBeCloseTo(4, 2);
  });

  it('the faces path emits REAL UVs — a box projection would smear a livery across a 1 AU hoop', () => {
    const built = buildMegaGeometry(specOf('ringworld'), 4)!;
    const uv = built.geometry.getAttribute('uv');
    expect(uv).toBeTruthy();
    expect(uv.count).toBe(built.geometry.getAttribute('position').count);
    let minU = Infinity, maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) { minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i)); }
    expect(minU).toBeGreaterThanOrEqual(-1e-6);
    expect(maxU).toBeLessThanOrEqual(1 + 1e-6);
    expect(maxU - minU).toBeGreaterThan(0.9);         // u runs the ring's whole length
  });
});

describe('the swarm points path', () => {
  it('draws apexes, all on the shell, and the count follows density', () => {
    const d = def('dyson-swarm');
    const at = (density: number) => {
      const spec = d.shape({ ...defaultMegaParams(d, sol()), densityFrac: density }, sol());
      return buildMegaGeometry(spec, 5)!;
    };
    const sparse = at(0.1), dense = at(1);
    expect(sparse.mode).toBe('points');
    expect(dense.geometry.getAttribute('position').count).toBeGreaterThan(
      sparse.geometry.getAttribute('position').count * 2
    );
    for (const r of radiiOf(dense.geometry)) expect(r).toBeCloseTo(5, 6);
  });

  it('DOES NOT BUNCH AT THE POLES — the named trap, measured by latitude bands', () => {
    const d = def('dyson-swarm');
    const built = buildMegaGeometry(d.shape({ ...defaultMegaParams(d, sol()), densityFrac: 1 }, sol()), 5)!;
    const p = positionsOf(built.geometry);
    // Equal-area latitude bands must hold roughly equal counts. A UV sphere would pile up at |y|~r.
    const BANDS = 8;
    const counts = new Array(BANDS).fill(0);
    for (let i = 0; i < p.length; i += 3) {
      const band = Math.min(BANDS - 1, Math.floor(((p[i + 1] / 5 + 1) / 2) * BANDS));  // even in cos(theta) = even in y
      counts[band]++;
    }
    const min = Math.min(...counts), max = Math.max(...counts);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeLessThan(1.25);   // even to within a quarter; a UV sphere is many times worse
  });

  it('is deterministic — the same swarm draws identically on every load (no RNG)', () => {
    const spec = specOf('dyson-swarm');
    const a = positionsOf(buildMegaGeometry(spec, 5)!.geometry);
    const b = positionsOf(buildMegaGeometry(spec, 5)!.geometry);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('the tether', () => {
  const boundsOf = (g: { getAttribute?: (n: string) => { array: ArrayLike<number> } | undefined } & object) => {
    const arr = (g as any).getAttribute('position').array as Float32Array;
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < arr.length; i += 3) {
      minX = Math.min(minX, arr[i]); maxX = Math.max(maxX, arr[i]);
      minY = Math.min(minY, arr[i + 1]); maxY = Math.max(maxY, arr[i + 1]);
    }
    return { minY, maxY, minX, maxX };
  };

  it('is a RIBBON with real drawn width, from the host surface to geostationary, in the host own drawn currency', () => {
    const built = buildMegaGeometry(specOf('space-elevator', earth()), 0, { hostRadiusScene: 0.2, hostRadiusKm: 6371 })!;
    // A 1px WebGL line was invisible against a lit planet limb on every GPU (owner, twice) - the
    // ribbon takes the counterweight's own honest device: drawn width as a READABILITY fraction of
    // the host, so it scales with the world at every zoom and never vanishes into a hairline.
    expect(built.mode).toBe('ribbon');
    const b = boundsOf(built.geometry);
    expect(b.minY).toBeCloseTo(0.2, 6);                     // anchored on the surface
    // The ribbon tops at the COUNTERWEIGHT - the 1.25x margin above geo (the dock test below
    // pins geo itself); on a 6,371 km world that is ~8.0 host radii from the centre.
    expect(b.maxY / 0.2).toBeCloseTo(1 + (35786 * 1.25) / 6371, 3);
    const w = b.maxX - b.minX;
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(built.counterweight!.radiusScene * 2); // thinner than the rock it carries
  });

  it('the ribbon runs PAST geostationary to the counterweight, with the DOCK at geo', () => {
    // The owner's correction (2026-09-01): geo is the dock, not the top - a counterweight AT geo
    // would hold no tension. Ribbon top defaults to 1.25x geo altitude; the dock knob rides at geo.
    const built = buildMegaGeometry(specOf('space-elevator', earth()), 0, { hostRadiusScene: 0.2, hostRadiusKm: 6371 })!;
    const b = boundsOf(built.geometry);
    expect(b.maxY / 0.2).toBeCloseTo(1 + (35786 * 1.25) / 6371, 3);
    expect(built.dock).toBeTruthy();
    expect(built.dock!.atScene / 0.2).toBeCloseTo(1 + 35786 / 6371, 6);          // the geo dock
    expect(built.dock!.atScene).toBeLessThan(built.counterweight!.atScene);       // dock below rock
  });

  it('an authored ribbon length wins over the default margin - but can never sink below geo', () => {
    const built = buildMegaGeometry(specOf('space-elevator', earth()), 0,
      { hostRadiusScene: 0.2, hostRadiusKm: 6371, ribbonLengthKm: 45000 })!;
    expect(boundsOf(built.geometry).maxY / 0.2).toBeCloseTo(1 + 45000 / 6371, 3); // the template's 45,000 km
    const clamped = buildMegaGeometry(specOf('space-elevator', earth()), 0,
      { hostRadiusScene: 0.2, hostRadiusKm: 6371, ribbonLengthKm: 100 })!;        // nonsense: below geo
    expect(boundsOf(clamped.geometry).maxY / 0.2).toBeGreaterThan(1 + 35786 / 6371); // geo still inside
  });

  it('THE SCENE CONTRACT: asked in unit host radius, it returns pure proportion', () => {
    // holo/scene.ts builds the tether with hostRadiusScene 1 and multiplies by the host's LIVE
    // drawn radius every frame (the rule planetary rings follow), because the host's drawn size
    // moves with the body-size dial, the screen floor and the build's system/body level. This
    // pins the half that makes that possible: in unit currency every figure is in HOST RADII.
    const built = buildMegaGeometry(specOf('space-elevator', earth()), 0, { hostRadiusScene: 1, hostRadiusKm: 6371 })!;
    const b = boundsOf(built.geometry);
    expect(b.minY).toBeCloseTo(1, 6);                                  // the anchor IS one host radius (Float32 buffer: 6 places, as above)
    expect(built.dock!.atScene).toBeCloseTo(1 + 35786 / 6371, 6);      // geo, in host radii
    expect(b.maxY).toBeCloseTo(1 + (35786 * 1.25) / 6371, 6);          // the counterweight, likewise
    // And it is genuinely LINEAR in the host radius - the property the per-frame multiply needs.
    const twice = buildMegaGeometry(specOf('space-elevator', earth()), 0, { hostRadiusScene: 2, hostRadiusKm: 6371 })!;
    expect(boundsOf(twice.geometry).maxY).toBeCloseTo(b.maxY * 2, 6);
    expect(twice.dock!.atScene).toBeCloseTo(built.dock!.atScene * 2, 6);
  });

  it('carries a captured-asteroid counterweight at the top of the ribbon', () => {
    const built = buildMegaGeometry(specOf('space-elevator', earth()), 0, { hostRadiusScene: 0.2, hostRadiusKm: 6371 })!;
    expect(built.counterweight).toBeTruthy();
    // The rock rides at the ribbon's TOP - above geo, where a counterweight belongs.
    expect(built.counterweight!.atScene).toBeCloseTo(built.radiusScene, 9);
    // 6 places, not more: the vertex buffer is a Float32Array (~7 significant figures) while
    // `atScene` is a double, so a tighter assertion measures IEEE rounding rather than the code.
    expect(built.counterweight!.atScene).toBeCloseTo(boundsOf(built.geometry).maxY, 6);
    // Its drawn size is a READABILITY fraction of the host, never true scale: a few-km rock on a
    // 6,371 km world would be invisible at every zoom that shows the ribbon.
    expect(built.counterweight!.radiusScene).toBeGreaterThan(0);
    expect(built.counterweight!.radiusScene).toBeLessThan(0.2);   // smaller than the host itself
  });

  it('a world with no real geostationary gets NOTHING rather than an invented ribbon', () => {
    const locked = earth();
    locked.orbitalBoundaries!.isGeoFallback = true;
    expect(buildMegaGeometry(specOf('space-elevator', locked), 0, { hostRadiusScene: 0.2, hostRadiusKm: 6371 })).toBeNull();
  });
});

describe('what this builder deliberately does NOT own', () => {
  it('a spheroid returns null — the scene ellipsoid (RENDER-S13) already serves it, undluplicated', () => {
    expect(buildMegaGeometry(specOf('death-star', earth()), 1)).toBeNull();
  });

  it('every registry type either builds or honestly declines, and none throws', () => {
    for (const key of ['space-elevator', 'planetary-torus', 'ringworld', 'dyson-sphere', 'dyson-swarm', 'energy-collector', 'death-star']) {
      const host = megaTypeDef(key)!.requires.hard?.hostIsStar ? sol() : earth();
      expect(() => buildMegaGeometry(specOf(key, host), 2, { hostRadiusScene: 0.2, hostRadiusKm: host.radiusKm }), key).not.toThrow();
    }
  });
});

// THE CHAIN A REAL NODE TAKES, end to end. The scene's attach function lives inside a 1,000-line
// closure that cannot be called from a test, so this pins everything it does BEFORE touching THREE:
// a node created from the shipped pack template must resolve a registry record, produce a spec and
// build geometry. If this is green and the app still draws an ellipsoid, the fault is the build the
// browser is running, not the logic — which is exactly the question a screenshot cannot settle.
describe('a node created from the shipped pack builds geometry', () => {
  const packMega = JSON.parse(
    readFileSync('static/rulepacks/starter-sf/construct_templates.json', 'utf8')
  ).mega as any[];

  it('every shipped mega template still carries a megaType the registry knows', () => {
    for (const t of packMega) {
      expect(megaTypeDef(t.megaType), `${t.name} -> ${t.megaType}`).toBeDefined();
    }
  });

  it('a ringworld instance, as the picker creates it, yields RING geometry and not a fallback', () => {
    // Exactly what createConstruct does: deep-copy the template, drop the orbit, give it a host.
    const template = packMega.find((t) => t.megaType === 'ringworld')!;
    const node = JSON.parse(JSON.stringify(template));
    delete node.orbit;
    node.id = 'rw-1';
    node.IsTemplate = false;
    node.parentId = 'sol';

    const def = megaTypeDef(node.megaType)!;
    expect(def).toBeDefined();
    const built = buildMegaGeometry(def.shape(defaultMegaParams(def, sol()), sol()), 0.5);
    expect(built, 'the scene would fall back to the ellipsoid if this were null').toBeTruthy();
    expect(built!.mode).toBe('faces');
    // And it is a RING, not the flat lens the ellipsoid stand-in makes from the same dimensions.
    built!.geometry.computeBoundingBox();
    const bb = built!.geometry.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeCloseTo(1, 3);
    expect(bb.max.y - bb.min.y).toBeLessThan(0.02);
  });

  it('a Death Star declines and keeps the ellipsoid — that fallback is intended, not a failure', () => {
    const template = packMega.find((t) => t.megaType === 'death-star')!;
    const def = megaTypeDef(template.megaType)!;
    expect(buildMegaGeometry(def.shape(defaultMegaParams(def, earth()), earth()), 0.5)).toBeNull();
  });
});

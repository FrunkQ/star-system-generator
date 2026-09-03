// G53 phase 3: the geometry, gated headlessly. THREE runs fine in node — it is the CANVAS that E7
// rules out (document.hidden, rAF never fires), not the library — so every claim the builder makes
// about vertices, bounds, windows and the pole-clustering trap is an ordinary assertion here.
// Precedent: `modelViewer.spec.ts` builds meshes and measures their bounding boxes.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMegaGeometry, tetherAltitudesKm, tetherLayout, equatorialAnchor } from './megaGeometry';
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
  // THE CONTRACT (v3.0.267): the builder returns UNIT PARTS and KILOMETRE ALTITUDES; the scene lays
  // them out every frame from three scene distances the SATELLITE LAW supplies (scaleLaw
  // satelliteDrawDistance) - so the dock sits exactly where a station at geostationary sits, and
  // can never overtake the Moon at any dial position. Nothing in here is in scene units.
  const boundsOf = (g: any) => { g.computeBoundingBox(); const bb = g.boundingBox; return { minY: bb.min.y, maxY: bb.max.y }; };
  it('publishes the dock at geostationary and the counterweight a 1.25x design margin above it, in km', () => {
    const alt = tetherAltitudesKm(specOf('space-elevator', earth()) as any);
    expect(alt).not.toBeNull();
    expect(alt!.dockKm).toBeCloseTo(35786, -1);          // Earth GEO altitude, checked not fitted
    expect(alt!.topKm).toBeCloseTo(35786 * 1.25, -1);
  });

  it('an authored ribbon length wins over the default margin - but can never sink below geo', () => {
    const spec = specOf('space-elevator', earth()) as any;
    expect(tetherAltitudesKm(spec, 45000)!.topKm).toBe(45000);
    expect(tetherAltitudesKm(spec, 30000)!.topKm).toBeCloseTo(35786 * 1.25, -1);
  });

  it('a world with no real geostationary gets NOTHING rather than an invented ribbon', () => {
    const noGeo = { ...(specOf('space-elevator', earth()) as any), topAltitudeKm: null };
    expect(tetherAltitudesKm(noGeo)).toBeNull();
    expect(buildMegaGeometry(noGeo, 1)).toBeNull();
  });

  it('builds a UNIT ribbon: a 1x1x1 box the scene stretches, plus the km altitudes it will stretch it to', () => {
    const built = buildMegaGeometry(specOf('space-elevator', earth()), 1)!;
    expect(built.mode).toBe('ribbon');
    const b = boundsOf(built.geometry);
    expect(b.maxY - b.minY).toBeCloseTo(1, 6);
    expect(built.tether!.dockKm).toBeCloseTo(35786, -1);
    expect(built.tether!.topKm).toBeCloseTo(35786 * 1.25, -1);
  });

  it('THE ANCHOR IS ON THE EQUATOR - the shape says so, because geostationary is only stationary there', () => {
    expect((specOf('space-elevator', earth()) as any).anchorLatitudeDeg).toBe(0);
    expect(buildMegaGeometry(specOf('space-elevator', earth()), 1)!.tether!.anchorLatitudeDeg).toBe(0);
  });

  describe('tetherLayout - the per-frame numbers, pure', () => {
    it('stretches the ribbon from the DRAWN surface to the counterweight, dock at geo, sizes as host fractions', () => {
      const L = tetherLayout({ surfaceR: 0.28, dockR: 0.3324, topR: 0.36, pxScene: 0.0005 });
      expect(L.visible).toBe(true);
      expect(L.ribbon.len).toBeCloseTo(0.08, 12);
      expect(L.ribbon.y).toBeCloseTo(0.32, 12);            // centred on its own span
      expect(L.ribbon.w).toBeCloseTo(0.0028, 12);          // 1% of the host's drawn radius
      expect(L.dock.y).toBeCloseTo(0.3324, 12);
      expect(L.dock.r).toBeCloseTo(0.28 * 0.07 * 0.55, 12);
      expect(L.counterweight.y).toBeCloseTo(0.36, 12);
      expect(L.counterweight.r).toBeCloseTo(0.28 * 0.07, 12);
    });
    it('never vanishes into a hairline: width and knobs are floored in SCREEN pixels', () => {
      const L = tetherLayout({ surfaceR: 0.004, dockR: 0.0264, topR: 0.033, pxScene: 0.001 });
      expect(L.ribbon.w).toBeCloseTo(0.0015, 12);          // 1.5 px beats 1% of a floored globe
      expect(L.dock.r).toBeCloseTo(0.002, 12);             // 2 px
      expect(L.counterweight.r).toBeCloseTo(0.0025, 12);   // 2.5 px
    });
    it('HONESTLY HIDES when the whole structure is inside the floored globe (true scale, far out)', () => {
      const L = tetherLayout({ surfaceR: 0.004, dockR: 0.0006, topR: 0.00075, pxScene: 0.001 });
      expect(L.visible).toBe(false);
    });
  });

  describe('equatorialAnchor - the pole fault, closed', () => {
    it('keeps the longitude and drops the latitude', () => {
      const d = equatorialAnchor({ x: 0.3, y: 0.8, z: 0.5 });
      const n = Math.hypot(0.3, 0.5);
      expect(d.y).toBe(0);
      expect(d.x).toBeCloseTo(0.3 / n, 12);
      expect(d.z).toBeCloseTo(0.5 / n, 12);
    });
    it('a polar hash still lands on the equator, deterministically', () => {
      expect(equatorialAnchor({ x: 0, y: 1, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
      expect(equatorialAnchor({ x: 0, y: -1, z: 1e-12 })).toEqual({ x: 1, y: 0, z: 0 });
    });
  });
});

describe('what this builder deliberately does NOT own', () => {
  it('a spheroid returns null — the scene ellipsoid (RENDER-S13) already serves it, undluplicated', () => {
    expect(buildMegaGeometry(specOf('death-star', earth()), 1)).toBeNull();
  });

  it('every registry type either builds or honestly declines, and none throws', () => {
    for (const key of ['space-elevator', 'planetary-torus', 'ringworld', 'dyson-sphere', 'dyson-swarm', 'energy-collector', 'death-star']) {
      const host = megaTypeDef(key)!.requires.hard?.hostIsStar ? sol() : earth();
      expect(() => buildMegaGeometry(specOf(key, host), 2), key).not.toThrow();
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

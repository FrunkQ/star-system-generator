import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBodyLook, isFilledFamily, type BodyLookTextures } from './bodyLook';
import {
  makeGlowTexture, makeHotspotTexture, makePlumeTexture,
  isBlackHoleNode, isFeedingBlackHole, buildHorizonLook, BH_LENS_SHRINK,
  STAR_RIM_SCALE, STAR_RIM_OPACITY, updateStarLook,
  applyLimbDarkening, starCoreWhiteFor, STAR_CORE_MAX, STAR_CORE_COOL_K, STAR_CORE_HOT_K
} from './bodyFeatures';
import derived from '../../../tests/output/solar-system-derived.json';

// WHY THIS SPEC EXISTS. Until Stream K the live holo and the 3D reference gallery each ran their own
// inline assembly over the same twelve `bodyFeatures` builders, and they had already drifted: the
// gallery's star corona was `R * (3.2 + activity * 3)` where the holo's was `radius * (5 + activity
// * 4)`, and the two ran different pulses. Nothing could see that, because no test ever built one
// node twice. This one does: the SAME node through BOTH callers' option sets, compared on the
// FEATURE INVENTORY. If a caller grows a feature the others do not have, this goes red.

const textures: BodyLookTextures = {
  glow: makeGlowTexture(), hotspot: makeHotspotTexture(), plume: makePlumeTexture()
};

const nodes = (derived as any).nodes as any[];
const node = (name: string) => {
  const n = nodes.find((b: any) => b.name === name);
  if (!n) throw new Error(`fixture has no ${name}`);
  return n;
};

/** The holo's options for a lit, textured body at its readable radius. */
const HOLO = { textures, renderStyle: 'filled' as const, bodyStyle: 'textured' as const, unlit: false, atmospheres: true, aurora: 'physics' as const };
/** The gallery's options: one tile size, the showcase posture, the aurora read from the tag. */
const GALLERY = { textures, aurora: 'model' as const, tilt: 'showcase' as const };
/** The size-comparison view's options: the same look, at a TRUE radius, lit by one fixed key. */
const COMPARISON = { textures, aurora: 'model' as const, tilt: 'axial' as const };

// A BLACK HOLE IS NOT A STAR, and every one in this app carries `roleHint: 'star'`. Until 2026-09-06
// the size-comparison strip therefore drew Sagittarius A* as a glowing orange ball with a
// granulation texture, because the assembly tested the roleHint and nothing tested the assembly.
describe('a black hole is a horizon, not a photosphere', () => {
  const bh = (classes: string[], extra: any = {}) => ({
    id: 'bh', name: 'A*', roleHint: 'star', kind: 'body', classes,
    radiusKm: 12e6, massKg: 8.5e36, tags: [], ...extra
  });

  it('knows one when it sees one, in every spelling the app and an import can produce', () => {
    expect(isBlackHoleNode(bh(['star/BH']))).toBe(true);
    expect(isBlackHoleNode(bh(['star/BH_active']))).toBe(true);
    expect(isBlackHoleNode(bh(['BH']))).toBe(true);
    expect(isBlackHoleNode(bh(['star/black-hole']))).toBe(true);
    expect(isBlackHoleNode(bh(['star/G']))).toBe(false);
    expect(isBlackHoleNode(bh([]))).toBe(false);
    expect(isBlackHoleNode(null)).toBe(false);
    expect(isFeedingBlackHole(bh(['star/BH_active']))).toBe(true);
    expect(isFeedingBlackHole(bh(['star/BH'], { accretionEddington: 0.4 }))).toBe(true);
    expect(isFeedingBlackHole(bh(['star/BH']))).toBe(false);
  });

  it('draws NO photosphere, NO corona and no star texture — the fault this branch fixes', () => {
    const look = buildBodyLook(bh(['star/BH']), 100, { ...COMPARISON, photonRing: true });
    expect(look.star).toBeUndefined();                       // no corona/flare rig at all
    const mat = look.mesh.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0x000000);
    expect(mat.map).toBeFalsy();                             // no granulation texture
    // ...and a star of the same shape still gets all of it, or the branch proves nothing.
    const star = buildBodyLook(bh(['star/G']), 100, COMPARISON);
    expect(star.star).toBeDefined();
    expect((star.mesh.material as THREE.MeshBasicMaterial).map).toBeTruthy();
  });

  it('marks the horizon with a photon ring ONLY where nothing else will', () => {
    // The lensed surfaces get their ring from the shader; a painted one beside it is a second,
    // wrong answer. The size comparison has no lensing pass, so without this a black hole is a
    // labelled hole in the strip.
    const withRing = buildBodyLook(bh(['star/BH']), 100, { ...COMPARISON, photonRing: true });
    const without = buildBodyLook(bh(['star/BH']), 100, COMPARISON);
    expect(withRing.mesh.children.length).toBe(1);
    expect(without.mesh.children.length).toBe(0);
    // AND IT MARKS THE MEASUREMENT RATHER THAN INFLATING IT: the ring's INNER edge is the horizon.
    const ring = withRing.mesh.children[0] as THREE.Mesh;
    const geo = ring.geometry as THREE.RingGeometry;
    expect(geo.parameters.innerRadius).toBe(100);
    expect(geo.parameters.outerRadius).toBeLessThanOrEqual(103);
  });

  it('keeps the LENS SHRINK with the lens, and never applies it to a true-scale drawing', () => {
    // The 0.55 exists because a lensing pass magnifies the black it finds; a surface without one
    // that applied it would state that a black hole is 45% smaller than it is - on the one view
    // whose whole claim is true size. `buildHorizonLook` takes a radius and never scales it.
    expect(BH_LENS_SHRINK).toBeGreaterThan(0);
    expect(BH_LENS_SHRINK).toBeLessThan(1);
    const trueScale = buildHorizonLook(1000);
    expect((trueScale.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(1000);
    const lensed = buildHorizonLook(1000 * BH_LENS_SHRINK);
    expect((lensed.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(550);
    // The comparison view asks for the FULL radius, which is what this pins.
    const look = buildBodyLook(bh(['star/BH']), 1000, { ...COMPARISON, photonRing: true });
    expect((look.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(1000);
  });
});

// A STAR SHOULD READ AS A LIGHT SOURCE, on the one view that cannot afford its corona. Owner,
// 2026-09-06: "any chance of them looking brighter - like light sources".
describe("a star's rim bloom", () => {
  const star = { id: 's', name: 'S', roleHint: 'star', kind: 'body', classes: ['star/M5V'], radiusKm: 200000, tags: [] };

  it("is TIGHT to the limb - a fifth of a radius, not the corona's nine", () => {
    // RENDER-S53: the corona is radius * (5 + activity * 4), and on a true-scale strip that made a
    // star read nine times its own diameter. This number is what keeps the bloom honest, so it is
    // the number the gate pins.
    expect(STAR_RIM_SCALE).toBeGreaterThan(1);
    expect(STAR_RIM_SCALE).toBeLessThan(1.5);
    expect(STAR_RIM_OPACITY).toBeLessThan(1);
    const look = buildBodyLook(star, 100, { ...COMPARISON, starRim: true, starDecorations: false });
    const sprite = look.mesh.children.find((c) => c.type === 'Sprite') as THREE.Sprite;
    expect(sprite).toBeTruthy();
    // The sprite's own extent, against the star it is blooming: 100 px radius, 244 px sprite.
    expect(sprite.scale.x).toBeCloseTo(100 * 2 * STAR_RIM_SCALE, 6);
    expect(sprite.scale.x / (100 * 2)).toBeLessThan(1.5);
  });

  it('is OFF unless a caller asks, and never appears on a planet or a black hole', () => {
    expect(buildBodyLook(star, 100, { ...COMPARISON, starDecorations: false })
      .mesh.children.some((c) => c.type === 'Sprite')).toBe(false);
    const bh = { ...star, classes: ['star/BH'] };
    expect(buildBodyLook(bh, 100, { ...COMPARISON, starRim: true })
      .mesh.children.some((c) => c.type === 'Sprite')).toBe(false);
  });
});

describe('what a star DOES survives a true-scale view; what makes it look bigger does not', () => {
  // Owner, 2026-09-06: "would be nice if those jets appeared on the stars that need them in the size
  // comparison view." They could not: `starDecorations: false` was all-or-nothing, and it took the
  // outflows away with the corona. The shape of each feature is what decides which side it falls on.
  const jetting = { id: 'j', kind: 'body', roleHint: 'star', name: 'J', radiusKm: 700000,
                    classes: ['star/G2V'], tags: [{ key: 'stellar/jets', value: 'strong' }] } as any;
  const quiet = { id: 'q', kind: 'body', roleHint: 'star', name: 'Q', radiusKm: 700000,
                  classes: ['star/G2V'], tags: [] } as any;
  const names = (look: any) => {
    const out: string[] = [];
    look.mesh.traverse((o: any) => { if (o.name) out.push(o.name); });
    return out;
  };

  it('keeps the JET on a star with the corona turned off', () => {
    const look = buildBodyLook(jetting, 100, { ...COMPARISON, starDecorations: false });
    expect(names(look)).toContain('stellar-jet');
    expect(look.star).toBeTruthy();
    // ...and the halo it refused is really gone, or the view has quietly bought back its nine radii.
    expect(look.star!.corona).toBeUndefined();
    // AND THE FLARES STAY WITH THE CORONA, asked for point blank so the assertion is not vacuous:
    // they are limb decoration on a view that has said it wants none, and `starDecorations` is what
    // that view said it with.
    const asked = buildBodyLook(jetting, 100, { ...COMPARISON, starDecorations: false, starFlares: true });
    expect(asked.star!.flares.length).toBe(0);
    expect(names(asked)).toContain('stellar-jet');
    // ...and a caller that has NOT turned decorations off gets them when it asks.
    expect(buildBodyLook(jetting, 100, { ...COMPARISON, starFlares: true }).star!.flares.length)
      .toBeGreaterThan(0);
  });

  it('still builds NOTHING for a quiet star with decorations off', () => {
    // The empty case has to stay empty: this is the promise that a measuring view costs nothing it
    // does not need, and the branch above is the only thing that could break it.
    const look = buildBodyLook(quiet, 100, { ...COMPARISON, starDecorations: false });
    expect(names(look)).not.toContain('stellar-jet');
    expect(look.star).toBeFalsy();
  });

  it('keeps the corona for everybody else, by default', () => {
    const look = buildBodyLook(jetting, 100, { ...COMPARISON });
    expect(look.star!.corona).toBeTruthy();
    expect(names(look)).toContain('stellar-jet');
  });

  it('animates a star that has no corona without falling over', () => {
    // `updateStarLook` reached straight into `look.corona` for any active star, and an absent corona
    // would have thrown once a frame - the fault this option could most easily have introduced.
    const look = buildBodyLook(
      { ...jetting, tags: [{ key: 'stellar/jets', value: 'strong' }, { key: 'stellar/activity', value: 'high' }] },
      100, { ...COMPARISON, starDecorations: false });
    expect(look.star).toBeTruthy();
    expect(() => updateStarLook(look.star!, 12.5)).not.toThrow();
  });
});

describe('a star burns white at the centre, and how white follows its TEMPERATURE', () => {
  // Owner, 2026-09-06: "why do stars look so DULL on this?" - about a strip where Vega and Sirius
  // were pastel lavender discs while the M dwarfs three steps away looked vivid. That asymmetry is
  // the whole diagnosis: a hot star's CHROMATICITY is pale (#cad8ff for an A), so a big circle
  // painted flat in it is lavender paint, while an M dwarf's #ffc46f is saturated and survives.
  // Surface brightness goes as T^4, so the hot ones are exactly the ones whose middles are white.

  // The app's own star swatches, which is what the strip actually hands the look.
  const SWATCH = { O: '#9bb0ff', B: '#aabfff', A: '#cad8ff', F: '#f8f7ff', G: '#fff4ea',
                   K: '#ffd2a1', M: '#ffc46f', white: '#ffffff' };

  it('gives a red dwarf NOTHING and a blue-white star all of it', () => {
    // The two ends of the owner's own comparison, in one assertion: the M dwarfs he had no complaint
    // about keep every bit of their orange, and the A stars he did are the ones that burn white.
    expect(starCoreWhiteFor(SWATCH.M)).toBe(0);
    expect(starCoreWhiteFor(SWATCH.K)).toBe(0);
    expect(starCoreWhiteFor(SWATCH.A)).toBeCloseTo(STAR_CORE_MAX, 6);
    expect(starCoreWhiteFor(SWATCH.O)).toBeCloseTo(STAR_CORE_MAX, 6);
  });

  it('puts the Sun between them, warm white in the middle and yellow at the rim', () => {
    // #fff4ea in the working (linear) space is r 1.0, b 0.825, so blue-minus-red is -0.175 and the
    // map gives (0.325 / 0.9) x 0.8 = 0.289. Written out because a ratio test cannot catch a curve
    // that has drifted (PHY-34).
    expect(starCoreWhiteFor(SWATCH.G)).toBeCloseTo(0.289, 2);
    expect(starCoreWhiteFor(SWATCH.G)).toBeLessThan(0.5);   // still plainly a coloured star, not a bulb
  });

  it('never runs backwards along the spectral sequence, and never past the cap', () => {
    const ladder = [SWATCH.M, SWATCH.K, SWATCH.G, SWATCH.F, SWATCH.A, SWATCH.B, SWATCH.O];
    let last = -1;
    for (const hex of ladder) {
      const v = starCoreWhiteFor(hex);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(STAR_CORE_MAX);
      last = v;
    }
    // And the sequence really does move - a flat 0 or a flat cap would pass the loop above.
    expect(starCoreWhiteFor(SWATCH.O) - starCoreWhiteFor(SWATCH.M)).toBeGreaterThan(0.5);
  });

  it('answers a missing or unreadable colour with a number, never a NaN', () => {
    // A NaN here would take the whole shader with it and the disc would render black.
    for (const c of [undefined, null, '']) expect(starCoreWhiteFor(c)).toBe(0);
    for (const c of ['not-a-colour' as any, 0x000000, '#000000', 0xffffff]) {
      const v = starCoreWhiteFor(c);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(STAR_CORE_MAX);
    }
    // A BLACK swatch stays black rather than being bleached: blue-minus-red cannot see brightness,
    // so the peak channel has to. This is the black hole's swatch, and it never takes the star
    // branch - but a law that would whiten it is a law waiting for the day something does.
    expect(starCoreWhiteFor('#000000')).toBe(0);
    // ...and a star DIMMED by something in the way keeps its dimness rather than burning white.
    expect(starCoreWhiteFor('#324050')).toBeLessThan(starCoreWhiteFor('#cad8ff') / 2);
  });

  it('reaches the shader, and is OFF unless asked for', () => {
    // The uniform and the mix have to be there together: either alone is a no-op that would pass a
    // laxer gate. `onBeforeCompile` is where three hands a material its source, so this is the seam.
    const compile = (core?: number) => {
      const mat = new THREE.MeshBasicMaterial();
      applyLimbDarkening(mat, 0.55, core);
      const shader = {
        uniforms: {} as any,
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <dithering_fragment>'
      };
      (mat.onBeforeCompile as any)(shader);
      return shader;
    };
    const on = compile(0.55);
    expect(on.uniforms.uCore.value).toBe(0.55);
    expect(on.fragmentShader).toContain('uniform float uCore;');
    expect(on.fragmentShader).toContain('mix(gl_FragColor.rgb, vec3(1.0), uCore');
    // DEFAULT OFF is the holo's answer and deliberate: there the corona says "light source", and the
    // owner is happy with a star at system level. Only a surface with the corona turned off asks.
    expect(compile().uniforms.uCore.value).toBe(0);
  });

  it('carries the option through the ASSEMBLY, and a star built without it stays flat', () => {
    // The gate above proves the shader honours `uCore`; this one proves the assembly actually hands
    // it over, and hands over ZERO when nobody asked. Without it the holo would quietly acquire the
    // strip's look - the drift this whole spec exists to catch.
    const uCoreOf = (look: any) => {
      const mat = look.mesh.material as THREE.Material;
      const shader = { uniforms: {} as any, vertexShader: '#include <common>\n#include <begin_vertex>',
                       fragmentShader: '#include <common>\n#include <dithering_fragment>' };
      (mat.onBeforeCompile as any)(shader);
      return shader.uniforms.uCore?.value;
    };
    const star = { id: 'x', kind: 'body', roleHint: 'star', name: 'X', radiusKm: 700000,
                   classes: ['star/G2V'], tags: [] } as any;
    expect(uCoreOf(buildBodyLook(star, 100, { ...COMPARISON, starCore: 0.42 }))).toBe(0.42);
    expect(uCoreOf(buildBodyLook(star, 100, { ...COMPARISON }))).toBe(0);
  });

  it('takes the TEMPERATURE where there is one, because the swatch is a legend not a photometry', () => {
    // The owner's own pair, from the bundled Local Neighbourhood. Toliman is a K1V at 5,231 K - only
    // a tenth cooler than the Sun - and its per-letter swatch (#ffd2a1) is far more orange than the
    // real star. Reading the swatch back as a temperature would rob it of a burn it has earned, so
    // the number wins wherever the data has one.
    expect(starCoreWhiteFor(SWATCH.K, 5231)).toBeCloseTo(0.296, 3);      // Toliman
    expect(starCoreWhiteFor(SWATCH.G, 5795)).toBeCloseTo(0.369, 2);      // Rigil Kentaurus
    expect(starCoreWhiteFor(SWATCH.A, 9600)).toBeCloseTo(STAR_CORE_MAX, 6);  // Vega
    expect(starCoreWhiteFor(SWATCH.M, 2992)).toBe(0);                    // Proxima keeps its colour
    // The two Alpha Centauri stars must not come out the SAME, which is what the owner's screenshot
    // showed and what the flat disc was doing to them.
    expect(starCoreWhiteFor(SWATCH.G, 5795)).toBeGreaterThan(starCoreWhiteFor(SWATCH.K, 5231));
    // And the temperature really is in charge: the same swatch, two temperatures, two answers.
    expect(starCoreWhiteFor(SWATCH.K, 9000)).toBeGreaterThan(starCoreWhiteFor(SWATCH.K, 4000));
    expect(starCoreWhiteFor(SWATCH.K, 9000)).toBeGreaterThan(starCoreWhiteFor(SWATCH.K));
    expect(starCoreWhiteFor(SWATCH.M, STAR_CORE_COOL_K)).toBe(0);
    expect(starCoreWhiteFor(SWATCH.M, STAR_CORE_HOT_K)).toBeCloseTo(STAR_CORE_MAX, 6);
  });

  it('falls back to the COLOUR, because half the data has no temperature at all', () => {
    // THE MEASUREMENT THAT DECIDED THE FALLBACK: the bundled Sol's own star node carries no
    // temperature (radius, mass, flare activity, radiation - none). A law reading only the field
    // would have looked fixed on an imported sky and done nothing here.
    const sun = (derived as any).nodes.find((n: any) => n.name === 'Sol');
    expect(sun.roleHint).toBe('star');
    expect(sun.temperatureK).toBeUndefined();
    expect((sun.classes ?? []).length).toBeGreaterThan(0);   // ...but it is classified, so it has a colour
    // ...and the fallback then does the work, landing in the same neighbourhood as the number would.
    expect(starCoreWhiteFor(SWATCH.G)).toBeGreaterThan(0.2);
    expect(starCoreWhiteFor(SWATCH.G, undefined)).toBe(starCoreWhiteFor(SWATCH.G));
    // A temperature of zero or nonsense is NOT a temperature; the colour answers for those too.
    for (const t of [0, -50, NaN, 'hot' as any]) {
      expect(starCoreWhiteFor(SWATCH.A, t)).toBe(starCoreWhiteFor(SWATCH.A));
    }
  });
});

describe('a jetted star is jetted inside its own system (G76)', () => {
    // The tag decides, in the assembly, the way flares already do. Before this the holo's caller passed no
    // strengths and the assembly drew none, so a pulsar read as jetted on the starmap and as a plain star in
    // the holo, the gallery and the size comparison.
    const withTags = (name: string, tags: { key: string; value?: string }[]) => ({ ...node(name), tags: [...(node(name).tags ?? []), ...tags] });
    const jetsOf = (look: any) => (look.star?.group?.children ?? []).filter((c: any) => /jet/i.test(c.name ?? '')).length;
    it('a star tagged stellar/jets carries a jet group; the same star untagged carries none', () => {
      const quiet = buildBodyLook(node('Sol'), 1, HOLO);
      const jetted = buildBodyLook(withTags('Sol', [{ key: 'stellar/jets', value: 'strong' }]), 1, HOLO);
      expect(jetsOf(quiet)).toBe(0);
      expect(jetsOf(jetted)).toBeGreaterThan(0);
    });
    it('an explicit strength still wins over the tag, which is how the 3D starmap drives it', () => {
      const forced = buildBodyLook(node('Sol'), 1, { ...HOLO, starJets: 2 });
      expect(jetsOf(forced)).toBeGreaterThan(0);
      const silenced = buildBodyLook(withTags('Sol', [{ key: 'stellar/jets', value: 'strong' }]), 1, { ...HOLO, starJets: 0 });
      expect(jetsOf(silenced)).toBe(0);
    });
  });

describe('the one body-look assembly', () => {
  it('builds the same FEATURE INVENTORY for one node through every caller', () => {
    // THREE bodies, not the whole system, and each one is here for a feature the others lack:
    // Earth has clouds and an aurora, Io has volcanic vents, Jupiter is a banded giant with a
    // deck stack. Every extra body costs two full procedural equirect textures PER CALLER, and
    // this file's cost is not free to the rest of the suite (see the note at the foot).
    for (const name of ['Earth', 'Io', 'Jupiter']) {
      const n = node(name);
      const holo = buildBodyLook(n, 1, HOLO);
      const gallery = buildBodyLook(n, 1, GALLERY);
      const comparison = buildBodyLook(n, 1, COMPARISON);
      // The aurora SOURCE is the one option that can legitimately change the count (inbox B117), so
      // compare the two callers that read the same source, and check the third against them minus
      // whatever aurora shells it drew.
      expect({ name, ...gallery.inventory() }).toEqual({ name, ...comparison.inventory() });
      const h = holo.inventory(), g = gallery.inventory();
      expect(h.children.filter((c) => c !== 'Mesh').sort()).toEqual(g.children.filter((c) => c !== 'Mesh').sort());
      holo.dispose(); gallery.dispose(); comparison.dispose();
    }
  });

  // G82 job 4. THE FEATURE-INVENTORY GATE IS WHAT RENDER-S53 IS, so a feature added to the assembly
  // has to be added to it too - otherwise the next feature can drift between callers exactly as the
  // corona did, and this file would say nothing.
  describe('the magnetosphere is a feature of the ONE assembly, on every caller at once', () => {
    it('is OFF unless a caller asks for it — on all three option sets', () => {
      const earth = node('Earth');
      for (const [name, opts] of [['holo', HOLO], ['gallery', GALLERY], ['comparison', COMPARISON]] as const) {
        const off = buildBodyLook(earth, 1, opts);
        expect(off.field, name).toBeUndefined();
        off.dispose();
      }
    });

    it('appears for EVERY caller when asked, with the same inventory', () => {
      const earth = node('Earth');
      const h = buildBodyLook(earth, 1, { ...HOLO, magnetospheres: true });
      const g = buildBodyLook(earth, 1, { ...GALLERY, magnetospheres: true });
      const c = buildBodyLook(earth, 1, { ...COMPARISON, magnetospheres: true });
      expect(h.field).toBeTruthy();
      expect(g.field).toBeTruthy();
      expect(c.field).toBeTruthy();
      // The gallery and the comparison read the same aurora source, so they must match exactly.
      expect(g.inventory()).toEqual(c.inventory());
      h.dispose(); g.dispose(); c.dispose();
    });

    it('adds itself to the inventory, so a caller that grew or lost one goes red', () => {
      const earth = node('Earth');
      const off = buildBodyLook(earth, 1, HOLO);
      const on = buildBodyLook(earth, 1, { ...HOLO, magnetospheres: true });
      const a = off.inventory(), b = on.inventory();
      expect(b.children.length).toBeGreaterThan(a.children.length);
      expect(b.materials).toBeGreaterThan(a.materials);
      // TWO surfaces - the magnetopause and the shielded region inside it, which is the nesting the
      // owner's reference images show and the same pair the 2D overlay shades.
      expect(b.children.filter((c) => c === 'Mesh').length - a.children.filter((c) => c === 'Mesh').length)
        .toBeGreaterThanOrEqual(2);
      off.dispose(); on.dispose();
    });

    it('is NOT a child of the globe, because a magnetopause does not spin with the planet', () => {
      const earth = node('Earth');
      const look = buildBodyLook(earth, 1, { ...HOLO, magnetospheres: true });
      let found = false;
      look.mesh.traverse((o) => { if (o === look.field!.group) found = true; });
      expect(found, 'the bubble must be aimed by the caller, not inherited from the globe').toBe(false);
      look.dispose();
    });

    it('aims its nose along whatever direction the caller gives it', () => {
      const earth = node('Earth');
      const look = buildBodyLook(earth, 1, { ...HOLO, magnetospheres: true });
      // The lathe puts the nose at +Y; aiming at +X must rotate +Y onto +X.
      look.field!.aim(new THREE.Vector3(1, 0, 0));
      const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(look.field!.group.quaternion);
      expect(nose.x).toBeCloseTo(1, 6);
      expect(nose.y).toBeCloseTo(0, 6);
      look.field!.aim(new THREE.Vector3(0, 0, -1));
      const nose2 = new THREE.Vector3(0, 1, 0).applyQuaternion(look.field!.group.quaternion);
      expect(nose2.z).toBeCloseTo(-1, 6);
      look.dispose();
    });

    it('scales with the radius it is given, exactly as the globe does', () => {
      const earth = node('Earth');
      const small = buildBodyLook(earth, 1, { ...HOLO, magnetospheres: true });
      const big = buildBodyLook(earth, 100, { ...HOLO, magnetospheres: true });
      const reach = (l: typeof small) => {
        const box = new THREE.Box3().setFromObject(l.field!.group);
        return box.max.y;   // the nose, since the lathe puts it at +Y
      };
      // ABSOLUTE: Earth's PUBLISHED standoff is 11.229 body radii and the 3D draws the READABLE one -
      // 1 + 0.8 ln(11.229) = 2.935 - because a bubble in this view's inflated radii is bigger than the
      // system it sits in, and the whole shape has to fit inside a body framing or it is a wash rather
      // than an object. Same choice this view makes about every globe in it (RENDER-S11); the true
      // figure is on the card and on the 2D map, which draws the real number.
      expect(reach(small)).toBeCloseTo(2.935, 2);
      expect(reach(big) / reach(small)).toBeCloseTo(100, 4);
      small.dispose(); big.dispose();
    });

    it('EVERY SURFACE CARRIES THE BOUNDARY IT IS, so "am I inside?" is asked per surface', () => {
      // Owner, 2026-09-07, on Mercury: the shielded region framed beautifully while the magnetopause -
      // the SAME BODY - painted the whole screen. Mercury's nose is 1.48 radii and its tail is 29.6,
      // so a shot comfortably outside the nose is deep inside the tube, and one camera-to-nose
      // distance cannot tell those two apart. The renderer needs each surface's own equation.
      const look = buildBodyLook(node('Mercury'), 1, { ...HOLO, magnetospheres: true });
      const surfaces: any[] = [];
      look.field!.group.traverse((o) => { if ((o as any).userData?.fieldR0 !== undefined) surfaces.push(o); });
      expect(surfaces.length).toBeGreaterThanOrEqual(2);
      const r0s = surfaces.map((s) => s.userData.fieldR0).sort((a, b) => a - b);
      // ABSOLUTE, in DRAWN radii: Mercury's magnetopause is 1.48 published, which the readable map
      // leaves almost alone at 1.549 - small bubbles are near enough true, and that is the point of a
      // log map. Its shielded region is 0.814 published and passes through untouched, because the map
      // never inflates anything already under one radius.
      expect(r0s[1]).toBeCloseTo(1.314, 2);
      expect(r0s[0]).toBeCloseTo(0.814, 2);
      // The two surfaces still differ enough that one camera distance cannot answer for both.
      const tails = surfaces.map((s) => s.userData.fieldTail).sort((a, b) => a - b);
      expect(tails[1] / tails[0]).toBeGreaterThan(1.4);
      for (const s of surfaces) expect(s.userData.fieldAlpha).toBeCloseTo(0.58, 6);
      look.dispose();
    });

    it("NO PART OF A BELT LIES INSIDE THE BELT'S OWN INNER EDGE", () => {
      // A torus radius is a CENTRELINE and `beltPeakRadii` is an EDGE - the altitude below which the
      // atmosphere absorbs trapped particles into the loss cone ([[B22]]). Seating the tube AROUND
      // that radius instead of ON it buried half of every belt in the app inside its planet: Jupiter's
      // reached 0.48 R_J against a 1.05 R_J edge, and the depth test hid the rest, so the belt looked
      // like it grew out of the globe. All five magnetised worlds did it. Found by another session
      // reading the numbers, 2026-09-07.
      for (const name of ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
        const n = node(name);
        const peak = n.magnetosphere.beltPeakRadii as number;
        expect(peak, name).toBeGreaterThan(1);
        const look = buildBodyLook(n, 1, { ...HOLO, magnetospheres: true });
        let torus: any = null;
        look.mesh.traverse((o: any) => { if (o.geometry?.type === 'TorusGeometry') torus = o; });
        expect(torus, `${name} has no belt torus`).toBeTruthy();
        const p = torus.geometry.parameters;
        // ABSOLUTE: the innermost point of a torus is centreline minus tube, and it must reach the
        // edge exactly - not past it, and not short of it either, or the belt floats detached.
        expect(p.radius - p.tube, name).toBeCloseTo(peak, 6);
        // ...and it must not swallow the globe it rings.
        expect(p.radius + p.tube, name).toBeLessThan(peak + 2);
        look.dispose();
      }
    });

    it('draws nothing for a world that has no bubble', () => {
      for (const name of ['Venus', 'Mars']) {
        const look = buildBodyLook(node(name), 1, { ...HOLO, magnetospheres: true });
        expect(look.field, name).toBeUndefined();
        look.dispose();
      }
    });

    it('disposes everything it built', () => {
      const look = buildBodyLook(node('Earth'), 1, { ...HOLO, magnetospheres: true });
      const mats: THREE.Material[] = [];
      const geos: THREE.BufferGeometry[] = [];
      look.field!.group.traverse((o) => {
        const m = (o as any).material; if (m) mats.push(m);
        const g = (o as any).geometry; if (g) geos.push(g);
      });
      expect(mats.length).toBeGreaterThan(0);
      const disposed: any[] = [];
      for (const m of mats) { const f = m.dispose.bind(m); (m as any).dispose = () => { disposed.push(m); f(); }; }
      for (const g of geos) { const f = g.dispose.bind(g); (g as any).dispose = () => { disposed.push(g); f(); }; }
      look.dispose();
      expect(disposed.length).toBe(mats.length + geos.length);
    });
  });

  it('gives a star a corona through the SHARED star look, at one size, for every caller', () => {
    const sun = node('Sol');
    const a = buildBodyLook(sun, 2, HOLO);
    const b = buildBodyLook(sun, 2, GALLERY);
    expect(a.star).toBeTruthy();
    expect(b.star).toBeTruthy();
    // The number the gallery used to disagree about. `buildStarLook` is now the only place it lives.
    expect(a.star!.coronaScale).toBe(b.star!.coronaScale);
    expect(a.star!.coronaScale).toBeCloseTo(2 * (5 + a.star!.activity * 4), 9);
    expect(a.inventory()).toEqual(b.inventory());
    a.dispose(); b.dispose();
  });

  it('scales every feature with the radius it is given, and questions the radius never', () => {
    const earth = node('Earth');
    const small = buildBodyLook(earth, 0.01, HOLO);
    const big = buildBodyLook(earth, 100, HOLO);
    // Same inventory at both extremes: TRUE scale must not lose a feature that readable scale has.
    expect(small.inventory()).toEqual(big.inventory());
    const rSmall = (small.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    const rBig = (big.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    expect(rSmall).toBe(0.01);
    expect(rBig).toBe(100);
    small.dispose(); big.dispose();
  });

  it('drops every emissive feature in the unlit "2D map" look, and only there', () => {
    const io = node('Io');                  // volcanic: the one body that has vents to lose
    const lit = buildBodyLook(io, 1, HOLO);
    const flat = buildBodyLook(io, 1, { ...HOLO, unlit: true });
    expect(lit.magma.length).toBeGreaterThan(0);
    expect(flat.magma.length).toBe(0);
    expect(flat.inventory().children.length).toBeLessThan(lit.inventory().children.length);
    lit.dispose(); flat.dispose();
  });

  it('knows which render styles it owns — the wire family belongs to the scene', () => {
    expect(isFilledFamily('filled')).toBe(true);
    expect(isFilledFamily('lopoly-filled')).toBe(true);
    expect(isFilledFamily('lopoly-lines')).toBe(true);
    expect(isFilledFamily('wire-glow')).toBe(false);
    expect(isFilledFamily('wire-flat-occ')).toBe(false);
  });

  it('leaves the orientation to the caller unless a posture is asked for', () => {
    // Earth is tilted 23.44 degrees, so a body whose orientation this function DID stamp is easy to
    // tell from one it left alone — and the holo leaves it alone, because it composes that tilt with
    // sidereal spin every frame. Enceladus, whose tilt is zero, cannot tell the two apart at all.
    const earth = node('Earth');
    const owned = buildBodyLook(earth, 1, HOLO);                       // tilt 'none'
    expect(owned.mesh.quaternion.equals(new THREE.Quaternion())).toBe(true);
    const stamped = buildBodyLook(earth, 1, { ...HOLO, tilt: 'axial' as const });
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (23.44 * Math.PI) / 180);
    expect(stamped.mesh.quaternion.angleTo(expected)).toBeLessThan(1e-9);
    owned.dispose(); stamped.dispose();
  });

  it('tips a pole-venting body toward the camera ONLY in the showcase posture', () => {
    // A cryovolcanic body vents from a pole, which is invisible on an upright globe — the gallery
    // tips it so the jets spray at the viewer. Enceladus is the fixture's cryovolcanic moon and its
    // axial tilt is zero, so any rotation at all here is the posture and nothing else.
    const enceladus = node('Enceladus');
    const showcase = buildBodyLook(enceladus, 1, GALLERY);
    const axial = buildBodyLook(enceladus, 1, { ...COMPARISON, tilt: 'axial' as const });
    const tipped = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
    expect(showcase.mesh.quaternion.angleTo(tipped)).toBeLessThan(1e-9);
    expect(axial.mesh.quaternion.equals(new THREE.Quaternion())).toBe(true);
    showcase.dispose(); axial.dispose();
  });
});

// A NOTE ON THIS FILE'S COST, because it is the only test in the suite that builds real procedural
// planet textures. Each `buildBodyLook` on a textured body paints two full equirect canvases pixel
// by pixel, and vitest runs spec files in parallel workers, so the CPU that costs is taken from
// whatever else is running. Adding this file at six bodies pushed `broadcastContract.spec.ts` — a
// real-time BroadcastChannel handshake that takes about 4 seconds against vitest's 5-second default
// — over its timeout, on a suite that was otherwise green. Keep the body list short. The neighbour's
// fragility is recorded on the board ([[B118]]); this file's job is the inventory, not a sweep.

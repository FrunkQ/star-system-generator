// src/lib/holo/comparisonScene.ts
// THE SIZE-COMPARISON SCENE: every object on a map drawn at TRUE relative size, side by side.
//
// It draws bodies and nothing else. The strip's layout, the scale, the ruler, the labels and the
// chrome belong to `SizeComparisonView.svelte`; the laws behind them are pure and live in
// `comparison/layout.ts`. This module takes slots that are already positioned IN PIXELS and puts a
// globe in each one.
//
// FOUR DECISIONS, each of which you should be able to defend to the owner:
//
// 1. IT BINDS NO SIZE LAW. Every other surface draws a body at its READABLE size (RENDER-S11/S41/
//    S43), which deliberately compresses a range no screen can hold. Removing that compression is
//    the entire feature, so the drawn radius here is the caller's true-scale figure and the span map
//    has no say in it. See the engine map entry RENDER-S51.
// 2. AN ORTHOGRAPHIC CAMERA. Perspective makes the nearer body larger, which is exactly the lie this
//    view exists to remove. Its frustum is measured IN PIXELS — one world unit is one CSS pixel — so
//    the DOM overlay's labels, ruler and hit areas line up with the globes by construction rather
//    than by a projection nobody can check.
// 3. ONE FIXED KEY LIGHT from the viewer's upper left, plus a low fill. Every body is lit the same
//    way, which is the poster look: a size comparison in which two worlds are lit differently is a
//    comparison of lighting.
// 4. NO STARFIELD, and a black backdrop. A starfield implies distance, and there is no distance in
//    this view — the objects are side by side, not out there.
//
// A body BELOW THE PIXEL FLOOR never reaches this module at all: the view draws it as a dot in the
// DOM. That is the performance rule as much as the honesty one — a system with two hundred asteroids
// must open in the time the map does, and a texture is only ever built for a globe you can see.
//
// AND THE SIXTH: THE CHROME IS IN THE PICTURE, NOT OVER IT. The labels, the dots, the rings and the
// ruler are drawn to a 2D canvas by `comparison/stripChrome.ts` and composited here as a screen-space
// quad IN FRONT of the globes, so the preset's real GLSL filter treats them exactly as it treats the
// worlds — they bend with a warped CRT instead of floating straight over a bent picture. That is the
// owner's decision of 2026-07-18 (RENDER-S54, inbox B126), and the arcs made it unavoidable: a
// circle concentric with the subject is not something DOM can draw. Picking goes through
// `warpPoint`, the same inverse the holo and the filtered document use.
//
// AND THE FIFTH DECISION: A BLACK HOLE BENDS ITS NEIGHBOURS. The strip runs the SAME stylised
// gravitational-lensing pass the live holo and the reference gallery use (`lensingShader.ts`), so a
// horizon on the strip warps whatever is drawn beside it into arcs over and under a genuinely black
// shadow. That is not decoration on a measuring instrument: the one thing a size comparison cannot
// otherwise say about a black hole is that it is not an object of that size sitting there, and the
// bent world next to it says it in a way no label can. Owner, 2026-09-06: *"be fun to see the world
// next being bent in spacetime"*. The pass runs ONLY while a hole is actually on screen — every
// other frame goes straight to the renderer, exactly as before.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { makeLensingShader, feedDiscEllipse, MAX_LENSES } from './lensingShader';
import { filterRegistry } from './filters/FilterRegistry';
import { buildShaderObject, updateUniforms } from './filters/shaderMaterial';
import { warpUv, warpParamsOfUniforms } from './filters/warpPick';
import type { FilterParamValues } from './filters/schema';
import { slotOffset } from '$lib/comparison/layout';
import { pixelRatioFor, skipFrame } from '$lib/rendering/lowPowerRender';
import { buildBodyLook, type BodyLook, type BodyLookTextures } from './bodyLook';
import {
  makeGlowTexture, makeHotspotTexture, makePlumeTexture, updateStarLook, updateMagma, updatePlumes,
  updateLightning, buildFlatRing, isBlackHoleNode, starCoreWhiteFor
} from './bodyFeatures';

/** One globe to draw: where it goes and how big it is, both already in pixels. */
export interface ComparisonSlot {
  id: string;
  node: any;
  /** Centre along the strip's axis, in px from the strip's start. */
  centrePx: number;
  /** The TRUE drawn diameter in px. Above the floor, or this slot would not be here. */
  diameterPx: number;
  /**
   * Offset ACROSS the strip from its centreline, in px. Zero for every flat order; the ORBIT layout
   * uses it to stack a planet's moons off the line its planets sit on. Ignoring it drew every moon
   * on top of its own planet — seen live, with the labels in the right places and no globes under
   * them, which is the same "the overlay is right so it must be the data" trap as B123.
   */
  crossPx?: number;
  /** The object's colour, already resolved by the map that owns it. */
  colorHex?: string;
  /**
   * A ring system's TRUE drawn radii in px, or absent. Flat-shaded (see `buildFlatRing`), because
   * the question this view asks of a ring is how far it reaches and nothing else.
   */
  ringInnerPx?: number;
  ringOuterPx?: number;
  /** The ring's own colour, where it is not a planet's pale ice and rock — a BH's accretion disc. */
  ringColorHex?: string;
  /**
   * How far the ring is tilted out of the screen plane, in radians, from `ringTiltRad` — 0 is a
   * circle seen face-on, pi/2 a line seen edge-on. It is the HOST'S OBLIQUITY, so Uranus's rings
   * present as a circle and Jupiter's as a sliver, which is the difference a shared angle erased.
   */
  ringTiltRad?: number;
  /**
   * The ring's LEAN in the screen plane, in radians, from `ringRollRad` - the same roll the globe
   * takes, because a ring lies in its planet's equatorial plane. Absent leans nothing.
   */
  ringRollRad?: number;
  /**
   * 0..1, from `ringOpacityAt`: how strongly this ring draws, given how far its planet is from the
   * focus. Only the ring you are looking at is at full strength. Applied per FRAME, so a scroll
   * fades it rather than popping it, and it never rebuilds the ring.
   */
  ringOpacity?: number;
}

export interface ComparisonSceneHandle {
  setSlots(slots: ComparisonSlot[]): void;
  /**
   * The chrome canvas to composite over the globes, or null for none. The CALLER owns it and draws
   * into it; this end only uploads it. Call again after every redraw — the texture is re-uploaded,
   * and recreated outright if the canvas has changed SIZE (see the note in `setChrome`).
   */
  setChrome(canvas: HTMLCanvasElement | null): void;
  /** The preset's real GLSL filter, run over the composed picture. `'none'` removes the pass. */
  setFilter(id: string, params?: FilterParamValues): void;
  /**
   * Screen uv (y-UP, 0..1) -> the SOURCE uv the eye sees there, through whatever the filter is
   * doing. Identity when nothing distorts. This is what a tap has to go through before it can be
   * hit-tested against the layout.
   */
  warpPoint(su: number, sv: number): [number, number];
  /** `scrollPx` is along the strip; `crossScrollPx` is across it (only the orbit layout uses it). */
  setView(axis: 'x' | 'y', scrollPx: number, widthPx: number, heightPx: number, crossScrollPx?: number): void;
  setSelected(id: string | null): void;
  /** How many globes are built right now — the lazy-build gate's own instrument. */
  builtCount(): number;
  dispose(): void;
}

/**
 * A globe is built when it comes within this many viewport-widths of the window and disposed when it
 * leaves — so scrolling never stalls on a texture and an off-screen world costs nothing.
 */
const BUILD_MARGIN_SCREENS = 0.5;
/** A body wider than this many screens is not worth tessellating past: it is a wall of surface. */
const MAX_DRAW_SCREENS = 8;
/**
 * The fallback tilt for a ring whose host has no obliquity authored — see `ringTiltRad` in
 * `comparison/layout.ts`, which is where the real number comes from now. It USED to be the tilt for
 * every ring in the strip, and that is what made Jupiter, Uranus and Neptune all present like
 * Saturn. Kept only so the scene has an answer when the caller sends none.
 *
 * Whatever the angle, the ring's TRUE width still runs along the strip and only the across-axis is
 * foreshortened, so the reading you take off the ruler is exact.
 */
const RING_TILT_FALLBACK_RAD = 1.15;
/** How far a feeding hole's accretion disc dips as it flickers. 0 is a still disc. */
const DISC_FLARE_DEPTH = 0.35;

export function createComparisonScene(canvas: HTMLCanvasElement): ComparisonSceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(pixelRatioFor(false));
  renderer.setClearColor(0x000000, 1);            // black backdrop; no starfield (decision 4)
  const scene = new THREE.Scene();
  // Orthographic (decision 2). The frustum is set from the viewport in px by `setView`.
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1e6, 1e6);

  // One fixed key from the viewer's upper LEFT, a soft fill from the opposite side so the dark limb
  // is not a void, and a little sky ambient. Deliberately not a star's light: the objects here are
  // not in a system together, and lighting them from "their" star would light each one differently.
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-0.6, 0.7, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d6ea, 0.35);
  fill.position.set(0.7, -0.2, 0.6);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x8ea6c4, 0x0a0c12, 0.35));

  const textures: BodyLookTextures = { glow: makeGlowTexture(), hotspot: makeHotspotTexture(), plume: makePlumeTexture() };

  // THE LENSING CHAIN, built once and idle until a black hole is on screen. `composer.render()` is a
  // full-screen pass over a render target; `renderer.render()` is not, so the cheap path stays the
  // default and a strip of ordinary worlds pays nothing for a feature it does not use.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const lensingPass = new ShaderPass(makeLensingShader());
  composer.addPass(lensingPass);

  // THE PRESET'S FILTER, LAST IN THE CHAIN so it treats the composed picture — globes, chrome and
  // any lensing alike. This is the REAL shader rather than the CSS approximation `FilterFrame` runs:
  // the whole point of moving the chrome into the rendered surface is that one pass now covers both.
  const filterRes = new THREE.Vector2(1, 1);
  const filterClock = new THREE.Clock();
  let filterPass: ShaderPass | null = null;
  /** This machine is short of fill rate: drop every alpha-blended extra. See `lowPowerStore`. */
  let lowPower = false;
  let filterId = 'none';
  let filterParams: FilterParamValues = {};
  /**
   * LOW POWER on or off, which on this view means every alpha-blended extra at once: the atmospheric
   * shells, the auroras, and the animated dynamics (storm lightning, magma, cryo plumes).
   *
   * REBUILDS every body, because all of them are children of the look and there is no way to reveal
   * one that was never made - the same reason the holo's own switch rebuilds rather than hiding. And
   * a rebuild rather than a freeze is required for the LIGHTNING in particular: a frozen bolt leaves
   * a permanent strike painted on the cloud tops, which is worse than the flash it replaced.
   */
  function setLowPower(on: boolean): void {
    if (on === lowPower) return;
    lowPower = on;
    // THE PIXEL RATIO IS THE BIGGEST SINGLE LEVER THERE IS on a view like this, and it costs nothing
    // to move: on a retina panel a ratio of 2 is FOUR TIMES the fragments of 1, and fill rate is
    // exactly what an alpha-heavy strip is short of. `setSize` has to follow it or the drawing
    // buffer keeps its old dimensions and nothing changes.
    renderer.setPixelRatio(pixelRatioFor(on));
    renderer.setSize(vw, vh, false);
    composer.setSize(vw, vh);
    for (const id of [...built.keys()]) destroy(id);
  }

  function rebuildFilter(): void {
    if (filterPass) { composer.removePass(filterPass); (filterPass.material as THREE.Material).dispose(); filterPass = null; }
    const def = filterRegistry.get(filterId);
    if (!def || filterId === 'none') return;
    filterPass = new ShaderPass(buildShaderObject(def, { ...filterRegistry.defaultParams(filterId), ...filterParams }, filterRes));
    composer.addPass(filterPass);
  }

  // THE CHROME QUAD. One world unit is one CSS pixel and the camera never turns, so the quad is just
  // a plane the size of the viewport at the middle of the frustum — no projection maths, and the
  // labels land on the globes by construction, which is the same property the DOM overlay had and
  // the reason this view was built in pixels in the first place.
  const chromeMat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const chromeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), chromeMat);
  chromeMesh.renderOrder = 1000;   // after every globe, ring and atmosphere
  chromeMesh.visible = false;
  scene.add(chromeMesh);
  let chromeTex: THREE.CanvasTexture | null = null;

  interface Built {
    look: BodyLook; group: THREE.Group; slot: ComparisonSlot;
    /** `base` is the material's own opacity at build time — the fade multiplies it, never replaces it. */
    ring?: { dispose(): void; mat: THREE.Material & { opacity: number }; mesh: THREE.Mesh; base: number };
    /** Set for a black hole: this body is a lensing centre, and its horizon radius in px. */
    lens?: { radiusPx: number };
    /** True for a FEEDING hole's accretion disc, which flares rather than sitting still. */
    flares?: boolean;
  }
  const built = new Map<string, Built>();
  let slots: ComparisonSlot[] = [];
  let axis: 'x' | 'y' = 'x';
  let scrollPx = 0;
  let crossScrollPx = 0;
  let vw = 1, vh = 1;
  let selected: string | null = null;
  let disposed = false;

  function positionOf(slot: ComparisonSlot): [number, number, number] {
    // The strip runs left to right on a desktop and top to bottom on a phone. Either way the objects
    // are centred on the OTHER axis, so a giant and a moonlet share one centreline and the eye can
    // read the difference off a single edge.
    // Cross offsets grow AWAY from the centreline in the direction a reader calls "down" (or, on a
    // vertical strip, "to the right"), so on the main axis they are negated: the ortho frame's +y is
    // up and its +x is right.
    //
    // RELATIVE TO THE SCROLL, NEVER ABSOLUTE, and it is the whole of [[B134]]: `centrePx` is measured
    // from the start of the strip and is unbounded, because the strip is sorted by size and ONE
    // enormous object puts everything behind it at a coordinate of its own diameter and upwards. At
    // 10^9 a float32 vertex pipeline quantises in steps of ~100 units, so a 150 px star built there
    // has its vertices snapped to a grid coarser than the star and draws as a CUBE. Subtracting the
    // scroll keeps every number the renderer sees inside a viewport of the origin, however long the
    // strip is. Same law the holo has carried since the floating-origin work; same function the
    // chrome uses, which is why the labels were right while the globes were blocks.
    const { along, cross } = slotOffset(slot.centrePx, slot.crossPx ?? 0, scrollPx, crossScrollPx);
    return axis === 'x' ? [along, -cross, 0] : [cross, -along, 0];
  }

  function inWindow(slot: ComparisonSlot): boolean {
    const span = axis === 'x' ? vw : vh;
    const margin = span * BUILD_MARGIN_SCREENS + slot.diameterPx / 2;
    return slot.centrePx > scrollPx - margin && slot.centrePx < scrollPx + span + margin;
  }

  /** Build what has come into view, dispose what has left it. Called every frame; cheap when settled. */
  function reconcile(): void {
    const wanted = new Set<string>();
    for (const slot of slots) {
      if (!inWindow(slot)) continue;
      wanted.add(slot.id);
      const existing = built.get(slot.id);
      if (existing && existing.slot.diameterPx === slot.diameterPx && existing.slot.ringOuterPx === slot.ringOuterPx) {
        existing.slot = slot;   // the cross offset and the scroll both move without a rebuild
        existing.group.position.set(...positionOf(slot));
        continue;
      }
      if (existing) { destroy(slot.id); }
      const group = new THREE.Group();
      group.position.set(...positionOf(slot));
      // The radius is the caller's true-scale figure, straight through (decision 1). The only clamp
      // is a ceiling on TESSELLATION, not on size: a globe that is eight screens across still draws
      // eight screens across, it just stops being subdivided for detail nobody can see.
      const radius = slot.diameterPx / 2;
      const look = buildBodyLook(slot.node, radius, {
        textures,
        // LOW POWER. The strip never passed any of these and so drew every cloud deck, limb glow,
        // haze, aurora and lightning flash on objects that routinely fill the screen - the most
        // expensive thing here by fill rate, and the owner's own example of what a weak machine
        // should be able to drop.
        atmospheres: !lowPower,
        dynamics: !lowPower,
        anisotropy: renderer.capabilities.getMaxAnisotropy(),
        // The published TAG, in line with physics-drives-tags-drives-visuals. The live holo still
        // reads physics directly; the two spellings are recorded on the board as [[B117]].
        aurora: lowPower ? 'off' : 'model',
        // The body's real axial tilt, stamped once. Not the gallery's showcase posture: this view is
        // a measurement, and tipping a world to show off its jets would tilt its silhouette too.
        tilt: 'axial',
        // The colour the MAP resolved for this object. A star node on the starmap carries no
        // `apparentColorHex` of its own — the map derives it — so without this every star drew grey.
        colorHex: slot.colorHex ? new THREE.Color(slot.colorHex).getHex() : undefined,
        // NO CORONA, NO FLARES (see the option's own note): a halo five radii wide would make every
        // star read nine times its true diameter, on the one view that exists to stop exactly that.
        starDecorations: false,
        // ...but a star should still LOOK like a light source. A tight additive bloom on the limb,
        // a fifth of a radius rather than the corona's nine, so nothing here claims to be bigger
        // than its label says. Owner, 2026-09-06.
        starRim: true,
        // ...and the disc burns out to white in the middle, BY TEMPERATURE. Owner, 2026-09-06: "why
        // do stars look so DULL on this?" - with the corona off, a photosphere painted flat at its
        // chromaticity reads as paint rather than as light, and worst of all on the HOT stars, whose
        // colour is palest and whose real surface is the brightest thing in the sky. A red dwarf
        // three steps along the same strip looked fine and gets none of this.
        starCore: starCoreWhiteFor(slot.colorHex, slot.node?.temperatureK),
        // JETS YES, SHED SHELL NO, and the shape is the whole reason. Owner, 2026-09-06: "would be
        // nice if those jets appeared on the stars that need them in the size comparison view."
        // A jet is BIPOLAR - two beams out of the poles - so however far it reaches nobody reads it
        // as the star's width; it says "this thing is doing something". The shed shell is a SPHERE
        // at 11-16 radii, wider than the corona this view already refuses, and a sphere around a
        // sphere is read as size on the one view whose whole claim is size (RENDER-S53). So the
        // shell is turned off here by number rather than by accident.
        starShedding: 0,
        // A BLACK HOLE gets the thin photon ring here and NOWHERE ELSE: this is the one surface
        // that draws a horizon without a lensing pass, so nothing else would mark where it is —
        // and, for the same reason, it draws at the TRUE radius rather than the lensed surfaces'
        // shrunken one (`BH_LENS_SHRINK`, and its note says why that must not travel).
        photonRing: true,
        segments: radius > MAX_DRAW_SCREENS * Math.max(vw, vh) ? { width: 24, height: 16 } : undefined
      });
      group.add(look.mesh);

      // THE RINGS, flat and at true extent. Added to the GROUP rather than to the globe, because the
      // globe turns and a ring that turned with it would sweep through the strip; and TILTED ABOUT
      // THE STRIP'S OWN AXIS, so the reading axis carries the ring's true width and only the other
      // one is foreshortened. Face-on would be a disc the eye reads as a bigger planet; edge-on would
      // be a line. Roughly two-thirds of the way over is the poster's angle.
      let ring: Built['ring'];
      let flares = false;
      if (slot.ringOuterPx && slot.ringInnerPx !== undefined && slot.ringOuterPx > slot.ringInnerPx) {
        const r = buildFlatRing(slot.ringInnerPx, slot.ringOuterPx,
          slot.ringColorHex ? new THREE.Color(slot.ringColorHex).getHex() : undefined);
        const tilt = Number.isFinite(slot.ringTiltRad as number) ? (slot.ringTiltRad as number) : RING_TILT_FALLBACK_RAD;
        // Tilted about the STRIP'S OWN AXIS, so the reading axis carries the ring's true width and
        // only the other one is foreshortened.
        if (axis === 'x') r.mesh.rotation.x = tilt;
        else r.mesh.rotation.y = tilt;
        r.mesh.renderOrder = -1;   // behind the globe, so the near arc does not cut across its face
        // ...AND THEN LEANED WITH THE PLANET ([[B140]]). The globe is rolled about the view axis by
        // its obliquity, so a ring that is only foreshortened runs level across a leaning planet.
        // A PARENT carries the lean and the mesh keeps the foreshortening, which is the order the
        // geometry wants: flatten the ring about its own equator first, then lean the whole
        // assembly. Both rotations on ONE mesh would make the answer depend on three.js's Euler
        // order - the kind of thing that reads as correct until somebody tilts a planet past 90.
        const ringFrame = new THREE.Group();
        ringFrame.rotation.z = Number.isFinite(slot.ringRollRad as number) ? (slot.ringRollRad as number) : 0;
        ringFrame.add(r.mesh);
        group.add(ringFrame);
        const mat = r.mesh.material as THREE.Material & { opacity: number };
        ring = { dispose: r.dispose, mat, mesh: r.mesh, base: mat.opacity };
        // A ring with its OWN colour is an accretion disc rather than ice and rock, and a feeding
        // hole's disc is not a still object: it flickers as the inner edge is fed. `ringColorHex` is
        // the one thing that tells the two apart down here, and it is set nowhere else.
        flares = !!slot.ringColorHex;
      }

      scene.add(group);
      built.set(slot.id, {
        look, group, slot, ring,
        // A black hole is a lensing centre. Its Einstein radius is taken from its OWN drawn radius,
        // which on this view is its true one — so the bend is as big as the hole really is.
        lens: isBlackHoleNode(slot.node) ? { radiusPx: radius } : undefined,
        flares
      });
    }
    for (const id of [...built.keys()]) if (!wanted.has(id)) destroy(id);
  }

  /**
   * THE RING FADE, applied every frame and never a rebuild. Only the ring at the focus is at full
   * strength; the rest fade out with distance and are switched off entirely at zero, so a strip of
   * ringed worlds does not stack four transparent discs over each other. The number comes from the
   * caller (`ringOpacityAt` in `comparison/layout.ts`) — this end only applies it.
   */
  function applyRingFade(): void {
    for (const b of built.values()) {
      if (!b.ring) continue;
      const f = b.slot.ringOpacity ?? 1;
      b.ring.mesh.visible = f > 0.002;
      // A FEEDING HOLE'S DISC FLICKERS. Two slow sines an irrational ratio apart, so it never falls
      // into a visible loop, and it only ever DIMS from full — brightening past the base would make
      // the disc read as denser than the physics says it is at that moment.
      const flare = b.flares
        ? 1 - DISC_FLARE_DEPTH * (0.5 + 0.5 * Math.sin(clock.t * 1.7)) * (0.5 + 0.5 * Math.sin(clock.t * 0.61))
        : 1;
      b.ring.mat.opacity = b.ring.base * f * flare;
    }
  }

  function destroy(id: string): void {
    const b = built.get(id);
    if (!b) return;
    scene.remove(b.group);
    b.look.dispose();
    b.ring?.dispose();
    b.group.traverse((o) => {
      const g = (o as any).geometry; const m = (o as any).material;
      if (g) g.dispose?.();
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm: any) => { mm.map?.dispose?.(); mm.dispose?.(); });
    });
    built.delete(id);
  }

  /**
   * Size and place the chrome quad to cover exactly what the camera sees. Called from `applyCamera`,
   * because the frustum carries the scroll and the quad has to travel with it.
   */
  function placeChrome(): void {
    chromeMesh.scale.set(Math.max(1, camera.right - camera.left), Math.max(1, camera.top - camera.bottom), 1);
    chromeMesh.position.set((camera.left + camera.right) / 2, (camera.top + camera.bottom) / 2, 0);
  }

  function applyCamera(): void {
    // THE FRUSTUM NO LONGER CARRIES THE PAN — the POSITIONS do (see `positionOf`). It is a fixed
    // window on the origin, so `left/right/top/bottom` are small numbers whatever the scroll, and so
    // is every vertex the renderer sees. Putting the pan here instead was [[B134]]: the frustum's
    // edges then ran to 10^9+ on a map carrying one enormous object, and the projection quantised
    // the strip into blocks.
    if (axis === 'x') {
      camera.left = 0; camera.right = vw;
      camera.top = vh / 2; camera.bottom = -vh / 2;
    } else {
      camera.left = -vw / 2; camera.right = vw / 2;
      camera.top = 0; camera.bottom = -vh;
    }
    // AND THE CAMERA MUST NOT BE AIMED. It sits on the axis looking straight down -Z and never
    // rotates. Calling `lookAt` at the scrolled centre instead TURNS an ortho camera, which tilts the
    // whole strip out of the frustum — found live: the labels and hit areas landed correctly and not
    // one globe was drawn.
    camera.position.set(0, 0, 1e5);
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
    placeChrome();
  }

  const _q = new THREE.Quaternion();
  const _y = new THREE.Vector3(0, 1, 0);
  const _lc = new THREE.Vector3();
  const _le = new THREE.Vector3();
  const _right = new THREE.Vector3();

  /**
   * Feed the lensing pass the black holes that are actually on screen, and say how many. Returns 0
   * when there are none, which is the signal to take the cheap render path.
   *
   * The centre and the radius are PROJECTED rather than computed from the slot's pixels, because the
   * shader wants aspect-corrected screen UV and the camera already knows how to produce it — one
   * conversion instead of two that can disagree. Same feed the reference gallery runs.
   */
  function feedLenses(): number {
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    const bh = lensingPass.uniforms.uBH.value as THREE.Vector4[];
    const disc = lensingPass.uniforms.uDisc.value as THREE.Vector4[];
    const discN = lensingPass.uniforms.uDiscN.value as THREE.Vector2[];
    const aspect = vw / Math.max(1, vh);
    let n = 0;
    for (const b of built.values()) {
      if (!b.lens || n >= MAX_LENSES) continue;
      _lc.copy(b.group.position).project(camera);
      if (_lc.x < -1.6 || _lc.x > 1.6 || _lc.y < -1.6 || _lc.y > 1.6) continue;   // off screen: no lens
      _le.copy(b.group.position).addScaledVector(_right, b.lens.radiusPx).project(camera);
      const rC = Math.hypot((_le.x - _lc.x) * 0.5 * aspect, (_le.y - _lc.y) * 0.5);
      if (!(rC > 0.0002)) continue;
      const ringMesh = b.ring?.mesh;
      const outerPx = b.slot.ringOuterPx ?? 0;
      const k = ringMesh && outerPx > 0 ? (b.slot.ringInnerPx ?? 0) / outerPx : 0;
      bh[n].set(_lc.x * 0.5 + 0.5, _lc.y * 0.5 + 0.5, Math.min(0.5, rC * 0.85), k);
      if (ringMesh && outerPx > 0 && b.ring!.mesh.visible) {
        feedDiscEllipse(disc[n], discN[n], ringMesh, b.group.position, outerPx, camera, _lc.x, _lc.y, aspect);
      } else { disc[n].set(0, 0, 0, 0); discN[n].set(0, 0); }
      n++;
    }
    lensingPass.uniforms.uCount.value = n;
    lensingPass.uniforms.uAspect.value = aspect;
    return n;
  }
  let raf = 0;
  const clock = { t: 0 };
  let lastFrameAt = 0;
  function frame(): void {
    if (disposed) return;
    // A FRAME CAP IS THE OTHER HALF OF LOW POWER, and it is the cheapest saving in the file: half the
    // frames is half of everything, and on a strip that is barely moving nobody can tell. Asked for
    // BEFORE any work is done, so a skipped frame really does cost nothing but the callback.
    const nowMs = performance.now();
    if (skipFrame(lowPower, nowMs, lastFrameAt)) { raf = requestAnimationFrame(frame); return; }
    lastFrameAt = nowMs;
    clock.t += 0.016;
    reconcile();
    applyRingFade();
    for (const b of built.values()) {
      // A slow turn, so a globe reads as a globe rather than as a printed circle. Slow on purpose:
      // this is a measuring instrument and a spinning one is harder to compare against its neighbour.
      _q.setFromAxisAngle(_y, 0.016 * 0.12);
      b.look.mesh.quaternion.multiply(_q);
      if (b.look.star) updateStarLook(b.look.star, clock.t);
      if (b.look.magma.length) updateMagma(b.look.magma, clock.t);
      if (b.look.plumes.length) updatePlumes(b.look.plumes, clock.t);
      if (b.look.lightning.length) updateLightning(b.look.lightning, clock.t);
      for (const a of b.look.aurora) {
        const swell = 0.5 + 0.5 * Math.sin(clock.t * 0.45 + a.seed * 6.283);
        a.mat.opacity = a.base * (0.25 + 0.75 * swell);
      }
      for (const c of b.look.clouds) c.mesh.rotation.y = clock.t * c.drift;
      // The selected object is the one the scale was set from; nothing about it is drawn differently,
      // because a highlight that changed its silhouette would change the measurement. The view rings
      // it in the DOM instead.
      void selected;
    }
    // A COMPOSED FRAME COSTS A FULL-SCREEN PASS, so it is only taken when something needs one — a
    // black hole to lens, or a preset filter to run. An ordinary strip on a GM's map pays nothing.
    const lensed = feedLenses() > 0;
    if (lensed || filterPass) {
      if (filterPass) filterPass.uniforms.time.value = filterClock.getElapsedTime();
      composer.render();
    } else renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setSlots(next) { slots = next; },
    setLowPower,
    setChrome(canvas) {
      if (!canvas) {
        chromeMesh.visible = false;
        chromeTex?.dispose(); chromeTex = null; chromeMat.map = null; chromeMat.needsUpdate = true;
        return;
      }
      // A CANVAS OF A DIFFERENT SIZE MUST NOT BE SWAPPED INTO A LIVE TEXTURE. WebGL2 storage is
      // immutable once allocated, so the upload of a resized canvas lands against the old-size
      // storage and FAILS SILENTLY — the quad then stretches the stale bitmap over every new frame.
      // That was A1, and it cost a shipped-but-never-visible resize path; the holo's HUD carries the
      // same note. Recreate on a dimension change; keep the cheap image swap otherwise.
      const old = chromeTex?.image as HTMLCanvasElement | undefined;
      if (!chromeTex || !old || old.width !== canvas.width || old.height !== canvas.height) {
        chromeTex?.dispose();
        chromeTex = new THREE.CanvasTexture(canvas);
        chromeTex.colorSpace = THREE.SRGBColorSpace;
        chromeMat.map = chromeTex;
        chromeMat.needsUpdate = true;
      } else {
        chromeMat.map!.image = canvas;
      }
      chromeTex.needsUpdate = true;
      chromeMesh.visible = true;
      placeChrome();
    },
    setFilter(id, params) {
      const nextId = id || 'none', next = params || {};
      if (nextId === filterId && filterPass) {
        filterParams = next;
        const def = filterRegistry.get(filterId);
        if (def) updateUniforms(filterPass.uniforms, def, { ...filterRegistry.defaultParams(filterId), ...next });
        return;
      }
      if (nextId === filterId && filterId === 'none') return;
      filterId = nextId; filterParams = next; rebuildFilter();
    },
    warpPoint(su, sv) {
      if (!filterPass) return [su, sv];
      return warpUv(su, sv, warpParamsOfUniforms(filterPass.uniforms as any));
    },
    setView(nextAxis, nextScroll, widthPx, heightPx, nextCross = 0) {
      axis = nextAxis;
      scrollPx = nextScroll;
      crossScrollPx = nextCross;
      // NEVER take a 0x0 measurement as a size (RENDER-S30): a momentarily unlaid-out container
      // reports one, and a 2x2 backing store then stretches across the next real frame.
      vw = Math.max(1, widthPx); vh = Math.max(1, heightPx);
      renderer.setSize(vw, vh, false);
      composer.setSize(vw, vh);
      filterRes.set(vw, vh);
      applyCamera();
    },
    setSelected(id) { selected = id; },
    builtCount() { return built.size; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const id of [...built.keys()]) destroy(id);
      textures.glow.dispose(); textures.hotspot.dispose(); textures.plume.dispose();
      chromeTex?.dispose();
      chromeMesh.geometry.dispose(); chromeMat.dispose();
      (lensingPass.material as THREE.Material).dispose();
      if (filterPass) (filterPass.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
    }
  };
}

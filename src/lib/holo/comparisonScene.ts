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
import * as THREE from 'three';
import { buildBodyLook, type BodyLook, type BodyLookTextures } from './bodyLook';
import { makeGlowTexture, makeHotspotTexture, makePlumeTexture, updateStarLook, updateMagma, updatePlumes, updateLightning } from './bodyFeatures';

/** One globe to draw: where it goes and how big it is, both already in pixels. */
export interface ComparisonSlot {
  id: string;
  node: any;
  /** Centre along the strip's axis, in px from the strip's start. */
  centrePx: number;
  /** The TRUE drawn diameter in px. Above the floor, or this slot would not be here. */
  diameterPx: number;
  /** The object's colour, already resolved by the map that owns it. */
  colorHex?: string;
}

export interface ComparisonSceneHandle {
  setSlots(slots: ComparisonSlot[]): void;
  /** `scrollPx` is how far along the strip the window has been scrolled. */
  setView(axis: 'x' | 'y', scrollPx: number, widthPx: number, heightPx: number): void;
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

export function createComparisonScene(canvas: HTMLCanvasElement): ComparisonSceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
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

  interface Built { look: BodyLook; group: THREE.Group; slot: ComparisonSlot }
  const built = new Map<string, Built>();
  let slots: ComparisonSlot[] = [];
  let axis: 'x' | 'y' = 'x';
  let scrollPx = 0;
  let vw = 1, vh = 1;
  let selected: string | null = null;
  let disposed = false;

  function positionOf(slot: ComparisonSlot): [number, number, number] {
    // The strip runs left to right on a desktop and top to bottom on a phone. Either way the objects
    // are centred on the OTHER axis, so a giant and a moonlet share one centreline and the eye can
    // read the difference off a single edge.
    return axis === 'x' ? [slot.centrePx, 0, 0] : [0, -slot.centrePx, 0];
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
      if (existing && existing.slot.diameterPx === slot.diameterPx) {
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
        anisotropy: renderer.capabilities.getMaxAnisotropy(),
        // The published TAG, in line with physics-drives-tags-drives-visuals. The live holo still
        // reads physics directly; the two spellings are recorded on the board as [[B117]].
        aurora: 'model',
        // The body's real axial tilt, stamped once. Not the gallery's showcase posture: this view is
        // a measurement, and tipping a world to show off its jets would tilt its silhouette too.
        tilt: 'axial',
        // The colour the MAP resolved for this object. A star node on the starmap carries no
        // `apparentColorHex` of its own — the map derives it — so without this every star drew grey.
        colorHex: slot.colorHex ? new THREE.Color(slot.colorHex).getHex() : undefined,
        // NO CORONA, NO FLARES (see the option's own note): a halo five radii wide would make every
        // star read nine times its true diameter, on the one view that exists to stop exactly that.
        starDecorations: false,
        segments: radius > MAX_DRAW_SCREENS * Math.max(vw, vh) ? { width: 24, height: 16 } : undefined
      });
      group.add(look.mesh);
      scene.add(group);
      built.set(slot.id, { look, group, slot });
    }
    for (const id of [...built.keys()]) if (!wanted.has(id)) destroy(id);
  }

  function destroy(id: string): void {
    const b = built.get(id);
    if (!b) return;
    scene.remove(b.group);
    b.look.dispose();
    b.group.traverse((o) => {
      const g = (o as any).geometry; const m = (o as any).material;
      if (g) g.dispose?.();
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm: any) => { mm.map?.dispose?.(); mm.dispose?.(); });
    });
    built.delete(id);
  }

  function applyCamera(): void {
    if (axis === 'x') {
      camera.left = scrollPx; camera.right = scrollPx + vw;
      camera.top = vh / 2; camera.bottom = -vh / 2;
    } else {
      camera.left = -vw / 2; camera.right = vw / 2;
      camera.top = -scrollPx; camera.bottom = -scrollPx - vh;
    }
    // THE FRUSTUM CARRIES THE PAN; THE CAMERA MUST NOT ALSO BE AIMED. `left/right/top/bottom` above
    // are already in world (= pixel) coordinates, so the camera sits at the origin looking straight
    // down -Z and never rotates. Calling `lookAt` at the scrolled centre instead TURNS the camera,
    // which tilts the whole strip out of the frustum — found live: the labels and hit areas landed
    // correctly and not one globe was drawn.
    camera.position.set(0, 0, 1e5);
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  const _q = new THREE.Quaternion();
  const _y = new THREE.Vector3(0, 1, 0);
  let raf = 0;
  const clock = { t: 0 };
  function frame(): void {
    if (disposed) return;
    clock.t += 0.016;
    reconcile();
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
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setSlots(next) { slots = next; },
    setView(nextAxis, nextScroll, widthPx, heightPx) {
      axis = nextAxis;
      scrollPx = nextScroll;
      // NEVER take a 0x0 measurement as a size (RENDER-S30): a momentarily unlaid-out container
      // reports one, and a 2x2 backing store then stretches across the next real frame.
      vw = Math.max(1, widthPx); vh = Math.max(1, heightPx);
      renderer.setSize(vw, vh, false);
      applyCamera();
    },
    setSelected(id) { selected = id; },
    builtCount() { return built.size; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const id of [...built.keys()]) destroy(id);
      textures.glow.dispose(); textures.hotspot.dispose(); textures.plume.dispose();
      renderer.dispose();
    }
  };
}

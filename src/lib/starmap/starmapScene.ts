// Imperative three.js controller for the 3D starmap (galaxy) view — the starmap sibling of the holo
// system scene. Systems are billboard stars laid on a ground plane at their map (x,y); multi-star
// systems render as a small cluster (binaries are not one dot). Routes are direct lines BETWEEN THE
// SYSTEMS — through the air, not across the floor (A41): they were plane lines until WS7 gave systems
// a depth, and a route that ignores it ends at a system's projection instead of at its star. A
// fading polar grid (optional, plain or LY-labelled), HTML name labels, orbit/tilt camera, and the
// same GPU filter chain as the system holo. Plain module so the wrapper lazy-loads three into its own
// chunk. Deliberately independent of scene.ts (no orbits/rings/belts) — shares the filter package and,
// since G26, the STAR LOOK builder in holo/bodyFeatures (corona + flares + tag decorations), sized here
// to a screen radius rather than copied.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { filterRegistry } from '$lib/holo/filters/FilterRegistry';
import { buildShaderObject, updateUniforms } from '$lib/holo/filters/shaderMaterial';
import type { FilterParamValues } from '$lib/holo/filters/schema';
import { clusterLayout, clusterHalfExtent, type SizeBand, type GlyphSlot, type GlyphMember } from './starGlyphLaw';
import { ACTIVE_HOLE_FEED_FLOOR } from '$lib/physics/stellarOutflows';
// G26: the star LOOK is the holo's — corona, flares and the tag-driven decorations — from the ONE
// shared builder, sized here to a screen radius. Not a copy of it.
import { buildStarLook, updateStarLook, makeGlowTexture, type StarLookVisual } from '$lib/holo/bodyFeatures';

const GRID_RADIUS = 12; // scene units the map's extent maps to
const HOLO_TINT = 0x63b3ff;
/** 0xRRGGBB → the '#rrggbb' a canvas fillStyle wants. */
const hexOf = (n: number) => '#' + (n >>> 0).toString(16).padStart(6, '0');

// WS7: `z` is the system's DEPTH in map units (absent/0 = on the reference plane). It is rendered as
// scene height, multiplied by the DISPLAY-ONLY exaggeration — which never touches distance maths.
export interface SmSystem {
  id: string; name: string; x: number; y: number; z?: number;
  // What a glyph DRAWS, resolved upstream by systemVisualStars (the band from the luminosity class,
  // the decorations from the star's TAGS). The scene reads these and decides nothing itself.
  stars: {
    color: string; bh?: 'quiescent' | 'active'; edd?: number;
    band?: SizeBand; letter?: string; activity?: number; flares?: boolean; jets?: 0 | 1 | 2; shedding?: 0 | 1 | 2;
  }[];
  /**
   * Roll-up highlight badges for this system, ALREADY RESOLVED by the caller (design 9.4). Resolved
   * outside the scene deliberately: markersFor/rollUpMarkers are audience-blind (TAG-13), so whoever
   * builds this list is the one that decides whether GM tags or a player's redacted snapshot go in.
   * The scene only draws what it is handed.
   */
  markers?: HighlightMarker[];
}
// WS3: routes carry their NAME so the 3D/flat starmap can label them like the 2D editor does — and,
// because the label rides the shared label pipeline, it obeys the Hide-labels override too.
export interface SmRoute { fromId: string; toId: string; dashed?: boolean; name?: string }
// WS3: the shared overlay vocabulary (see lib/map/mapOverlay.ts). Re-exported under the historic name
// so existing importers keep working.
export type { MapOverlay as GridMode } from '$lib/map/mapOverlay';
import { isLattice as isLatticeMode, normaliseOverlay, isHexFamily, hasSubsectors, type MapOverlay } from '$lib/map/mapOverlay';
// Starmap ROLL-UP badges: a system flies the union of what everything inside it carries (design 9.4).
// Same pill shape as the panel chip and the system view — see tags/tagPill.ts.
import { capMarkers, type HighlightMarker } from '$lib/tags/mapHighlights';
import { tagPillMetrics, drawTagPill, drawTagPin, drawTagFlag, tagPillWidth, tagPillText, markerStackStep, TAG_PILL_STEM, TAG_PILL_OVERFLOW_BG, TAG_PILL_OVERFLOW_FG, type MarkerStyleName, pinAside, flagStaffColor, type PinTextMode, type FlagStaffColor } from '$lib/tags/tagPill';
import { latticeFor, hexCentres, travellerHexLabel, subsectorLattice } from '$lib/map/latticeGeometry';
import { niceSeries, formatNice } from '$lib/map/niceInterval';
import { gridFadeWindow } from '$lib/map/gridFade';
import { buildLattice, ringEdges, spokeEdges, type GridEdge } from '$lib/map/gridGeometry';

// An in-scene name label: a canvas-textured sprite in the 3D scene (not a DOM overlay) so the
// post-process filter warps/tints it in lockstep with the system stars. Mirrors scene.ts.
interface LabelSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  text: string;
  aspect: number;      // canvas width / height
  heightRatio: number; // canvas full height / text height — converts labelSizePx to sprite size
  /** The NAME's share of the canvas height — the anchor is a fraction of the FULL height, so growing
   *  the sprite downward with badges would otherwise lift the name away from the glyph. */
  nameFraction: number;
  /** Roll-up badges drawn UNDER the system name, in the same canvas. */
  markers: HighlightMarker[];
  // Optional own colour, overriding the shared label colour. Route names use it so they read as
  // belonging to the LINE rather than to the stars they sit between.
  color?: string;
}

export interface StarmapSceneOptions {
  distanceUnit?: string; // 'ly' | 'pc' | … — the scale label suffix
  onSelect?: (id: string) => void; // fired when the viewer taps a system (live view)
}

export interface StarmapController {
  setData(systems: SmSystem[], routes: SmRoute[]): void;
  setGrid(mode: MapOverlay): void;
  // G10: map units per campaign distance unit, so the SCALED polar rings can report a real distance.
  // Without it the rings label their own map coordinates — see the note in rebuildGrid.
  setDistanceScale(pixelsPerUnit: number): void;
  // The vertical stems down to the reference plane and the rings that mark where they land.
  setDropLines(on: boolean): void;
  // G4's two grid dials. Declared here because the object below returns them and `Starmap3DView`
  // calls them: an interface that omits what its own implementation exports type-errors at BOTH ends
  // and puts four permanent errors in the way of the next real one (A50).
  setGridSkirt(v: number): void;   // 0 flat .. 1 a full depth curtain under each grid line (3D only)
  setGridFalloff(v: number): void; // 0 even .. 1 bright near the focus, gone by the edge
  setZExaggeration(v: number): void; // DISPLAY ONLY — stretches depth for clarity, never distances
  // G26: the GM size scaler. 0 = every star the same size (the old map), 1 = the four luminosity-
  // class bands fully separated. Glyph SIZE and member SPREAD are screen quantities — see starGlyphLaw.
  setStarScale(v: number): void;
  // The BASE glyph size, a multiplier 0.5..2 on the pixel unit every member and its spread are stated
  // in (1 = the size the map shipped with). Owner, 2026-08-19: "the stars themselves could be a little
  // larger... half to double size across the slider".
  setStarSize(v: number): void;
  setRouteGlow(on: boolean): void; // emissive glow on routes (vs plain lines)
  setMono(on: boolean): void; // monochrome palette for tinting filters
  setMapGrid(cfg: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number } | null): void; // GM's snap-grid
  setFlatOverhead(on: boolean): void; // 2D starmap: tilt pinned top-down (never a 3D view)
  setLockRotation(on: boolean): void; // fix the heading (spin), independent of the tilt
  setBackground(bg: string): void;
  setFraming(angleDeg: number): void;
  setLabelsVisible(on: boolean): void;
  setLabelColor(hex: string | null): void;
  setLabelSize(px: number): void;
  setLabelFont(font: string | null): void;
  setMarkerOptions(o: { size?: number; staff?: FlagStaffColor; pinText?: PinTextMode }): void;
  setFilter(id: string, params?: FilterParamValues): void;
  setHud(canvas: HTMLCanvasElement | null): void; // static overlay bitmap composited INTO the filter
  // G16: the campaign's own picture behind the stars, as a FLAT QUAD LYING IN THE MAP PLANE. Not a
  // sky sphere - the owner ruled that out and the sky stays procedural. Null = nothing.
  setMapBackground(cfg: SceneMapBackground | null): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

/**
 * G16 - what this scene needs to draw the map-fixed background, in MAP COORDINATES.
 *
 * The rectangle is worked out by `$lib/map/mapBackground` and handed here already solved, exactly as
 * the GM 2D map receives it. That is the point: two surfaces cannot disagree about where a
 * georeferenced picture sits if neither of them decides. This scene adds only its own fit transform,
 * the same `(mapPos - centre) * k` every system star goes through.
 */
export interface SceneMapBackground {
  url: string;
  cx: number; cy: number;      // centre, map coordinates
  w: number; h: number;        // size, map coordinates
  rotationDeg: number;         // clockwise in the map's own (y-down) sense
  opacity: number;
}

// The PHOTOSPHERE as a sharp disc sprite (shared) — the starmap's stand-in for the holo's textured
// sphere: tinted by the star's colour, darkened toward the limb the way the sphere's material is, a
// one-texel soft edge. The old glyph was ONE soft radial glow (bright centre fading over its whole
// width), which is what read as fuzz up close; the disc is the substance and the shared corona +
// flares around it are the look.
let discTex: THREE.Texture | null = null;
function starDisc(): THREE.Texture {
  if (discTex) return discTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(246,246,246,1)');
  g.addColorStop(0.88, 'rgba(205,205,205,1)');   // limb darkening, as the sphere's material does
  g.addColorStop(0.95, 'rgba(170,170,170,1)');
  g.addColorStop(1, 'rgba(150,150,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  discTex = new THREE.CanvasTexture(c); discTex.colorSpace = THREE.SRGBColorSpace;
  return discTex;
}
// The corona halo the holo uses — ONE texture instance per scene, created lazily in the controller.

// The black-hole glyph, drawn PROCEDURALLY to match the reference gallery: a black event horizon inside
// a bright photon ring; a FEEDING hole adds the edge-on particle blaze — a fuzzy hot-white→orange disc
// whose WIDTH grows with the accretion level, the far side lensed over the top, and the bright near-side
// blade crossing IN FRONT of the hole. Cached per accretion bucket.
const bhTex: Record<string, THREE.Texture> = {};
function bhGlyph(active: boolean, eddington = 0.6): THREE.Texture {
  const e = active ? Math.max(ACTIVE_HOLE_FEED_FLOOR, Math.min(1, eddington || 0.6)) : 0;
  const key = active ? `a${Math.round(e * 10)}` : 'q';
  if (bhTex[key]) return bhTex[key];
  const S = 160, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  const k = S / 100, cx = 50 * k, cy = 50 * k;
  const rx = (22 + e * 26) * k, ry = (2.5 + e * 3.5) * k;
  // Hot-white-in-the-middle blade gradient, fading at the tips. x0..x1 in the CURRENT transform's coords
  // (the blade fills inside a translated context, the arcs stroke in canvas coords).
  const rim = (x0: number, x1: number) => { const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(138,50,18,0)'); g.addColorStop(0.22, 'rgba(240,160,48,1)'); g.addColorStop(0.5, 'rgba(255,244,208,1)');
    g.addColorStop(0.78, 'rgba(240,160,48,1)'); g.addColorStop(1, 'rgba(138,50,18,0)'); return g; };
  const blaze = (rxx: number, ryy: number, alpha: number) => {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ryy / rxx); ctx.globalAlpha = alpha;
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rxx);
    rg.addColorStop(0, 'rgba(255,244,208,0)'); rg.addColorStop(0.24, 'rgba(255,244,208,1)');
    rg.addColorStop(0.45, 'rgba(240,160,48,1)'); rg.addColorStop(0.75, 'rgba(138,50,18,1)'); rg.addColorStop(1, 'rgba(138,50,18,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, rxx, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
  };
  if (e > 0) {
    // The particle blaze: blurred where the browser supports canvas filters (fuzz), layered sharp inside.
    const hasFilter = 'filter' in ctx;
    if (hasFilter) (ctx as any).filter = `blur(${(1.1 + e * 1.7) * k}px)`;
    blaze(rx, ry, 1);
    if (hasFilter) (ctx as any).filter = 'none';
    blaze(rx * 0.72, ry * 0.75, 0.95);
    // Far side lensed over the top, hugging the ring.
    ctx.strokeStyle = rim(cx - rx, cx + rx); ctx.lineWidth = (1.2 + e * 1.2) * k; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(cx - rx * 0.5, cy); ctx.quadraticCurveTo(cx, (28 - e * 4) * k, cx + rx * 0.5, cy); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, 11 * k, 0, 2 * Math.PI); ctx.fill();        // event horizon
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.1 * k; ctx.beginPath(); ctx.arc(cx, cy, 13.4 * k, 0, 2 * Math.PI); ctx.stroke(); // ring glow
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.1 * k; ctx.beginPath(); ctx.arc(cx, cy, 12.2 * k, 0, 2 * Math.PI); ctx.stroke();                  // photon ring
  if (e > 0) {
    // The bright near-side blade crossing IN FRONT of the hole — the signature of the lensed look.
    ctx.save(); ctx.translate(cx, cy + 0.8 * k); ctx.scale(1, ((0.9 + e * 1.1) * k) / (rx * 0.98)); ctx.globalAlpha = 0.95;
    ctx.fillStyle = rim(-rx * 0.98, rx * 0.98); ctx.beginPath(); ctx.arc(0, 0, rx * 0.98, 0, 2 * Math.PI); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  bhTex[key] = t;
  return t;
}

// A soft cross-section band (bright core row fading to transparent edges) for an emissively-glowing
// route: mapped onto a flat ground quad it reads as a glowing filament between two systems.
let routeTex: THREE.Texture | null = null;
function routeGlow(): THREE.Texture {
  if (routeTex) return routeTex;
  const h = 64, c = document.createElement('canvas'); c.width = 4; c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, h);
  routeTex = new THREE.CanvasTexture(c); routeTex.colorSpace = THREE.SRGBColorSpace;
  return routeTex;
}
// Flat unit quad lying in the ground plane, length along local X, width along local Z (glow tex across Z).
const ROUTE_QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export function createStarmapScene(canvas: HTMLCanvasElement, opts: StarmapSceneOptions = {}): StarmapController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x05070c, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 3000);
  const HOME = new THREE.Vector3(0, GRID_RADIUS * 1.15, GRID_RADIUS * 1.5);
  camera.position.copy(HOME);
  scene.add(camera); // so a camera-attached HUD quad (the guide-tip banners) renders via RenderPass → filter

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minDistance = 2;
  controls.maxDistance = GRID_RADIUS * 8;
  controls.minPolarAngle = 0.05;
  // The camera may go UNDER the reference plane (owner, 2026-08-19: "like on system view now") —
  // everything drawn here is two-sided or a billboard, and a map with real depth reads from below
  // as well as above. The flat 2D map pins the tilt overhead instead (setFlatOverhead).
  controls.maxPolarAngle = Math.PI - 0.05;

  let framingAngleRad = (58 * Math.PI) / 180;
  function setFraming(angleDeg: number) {
    framingAngleRad = (Math.max(0, Math.min(85, angleDeg)) * Math.PI) / 180;
    const dist = camera.position.distanceTo(controls.target) || GRID_RADIUS * 2;
    const ca = Math.cos(framingAngleRad), sa = Math.sin(framingAngleRad);
    camera.position.set(controls.target.x, controls.target.y + ca * dist, controls.target.z + sa * dist);
  }

  // --- Background + starfield ---
  const BG: Record<string, number> = { space: 0x05070c, green: 0x00b140, blue: 0x0047bb, black: 0x000000 };
  let background = 'space';
  function setBackground(bg: string) { background = bg; renderer.setClearColor(BG[bg] ?? BG.space, 1); starfield.visible = bg === 'space'; }
  const starfield = buildStarfield();
  scene.add(starfield);

  // --- Grid (LY rings / hex lattice) ---
  let gridMode: MapOverlay = 'plain';
  let routeGlowOn = true; // emissive glow on routes (vs plain lines)
  // Depth tethers: the vertical stem from each system down to the reference plane, and the small ring
  // that marks where it lands. On by default because they are what makes exaggerated depth READABLE —
  // without them you cannot tell above from below — but on a map with real depth and a busy field they
  // are also the dominant clutter, so a GM can drop them.
  let dropLinesOn = true;
  let monoOn = false; // monochrome palette (white/grey) so a tint filter colours the whole map
  let lastData: { systems: SmSystem[]; routes: SmRoute[] } | null = null; // for rebuilds (route-glow / mono toggle)
  const MONO_HEX = 0xdfe6f0;
  const routeColor = () => (monoOn ? MONO_HEX : HOLO_TINT);
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);
  let extent = 1; // world half-extent of the map (map units), for LY labels
  // G10: map units per distance unit. 0 = unknown, in which case the rings fall back to labelling map
  // units, which is at least self-consistent.
  let pixelsPerUnit = 0;
  let mapCx = 0, mapCy = 0, mapK = 1; // the fit transform from setData (scene = (mapPos - c)*k)
  let mapGridCfg: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number } | null = null;
  // WS7 depth exaggeration. True interstellar depth is visually tiny next to the map's spread, so the
  // GM can stretch it for clarity. PURELY VISUAL: distances come from lib/map/systemDistance.ts and
  // never see this value.
  let zExaggeration = 1;
  // The flat "2D map" is the PLAN view: depth collapses entirely, so a system's marker never drifts off
  // its map position and the 2D view stays pixel-honest against the GM map. Depth is a 3D-only reading.
  let flatMode = false;
  // How far the depth curtain drops below each grid line, 0..1 (0 = flat lattice). The old always-on
  // curtain was the equivalent of about 0.5 here, so that is the value that reproduces it.
  let gridSkirt = 0;
  // G4: how hard the grid fades with distance from the focus. 0 = flat brightness everywhere,
  // 1 = the near cells are bright and it is gone by the edge of the field. The numbers it maps to
  // live here rather than being sprinkled through the renderer, and the DIAL is preset data.
  let gridFalloff = 0.5;
  // The fade window is SHARED with the system map (map/gridFade) — this scene's numbers were the
  // working reference when the holo's copy was found to delete its grid instead of fading it (C14),
  // so the shape moved there rather than being duplicated a third time.
  const fadeWindow = () => gridFadeWindow(gridFalloff, GRID_RADIUS);

  function clearGroup(g: THREE.Object3D) {
    g.traverse((o) => { const a = o as any; a.geometry?.dispose?.(); const m = a.material; (Array.isArray(m) ? m : [m]).forEach((x: any) => { x?.map?.dispose?.(); x?.dispose?.(); }); });
    g.clear();
  }
  function makeGridLabel(text: string): THREE.Sprite | null {
    const c = document.createElement('canvas'); const ctx = c.getContext('2d'); if (!ctx) return null;
    c.width = 128; c.height = 40; ctx.font = '600 24px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(180,210,240,0.9)'; ctx.textBaseline = 'middle'; ctx.fillText(text, 6, 22);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(0.9, 0.28, 1); sp.center.set(0, 0.5); return sp;
  }
  // The GM's live snap-grid, drawn at the SAME cell size + origin as the GM map (transformed by the fit),
  // so snapped systems land on the grid exactly like the GM sees them. Overrides the decorative grid.

  // A hex NUMBER label: a small canvas sprite that scales WITH the world (unlike the constant-size name
  // labels), so the digits stay inside their hex as you zoom. Lives in gridGroup, so a grid rebuild
  // disposes it with the lattice.
  function makeHexNumber(text: string, worldH: number): THREE.Sprite | null {
    const c = document.createElement('canvas');
    const px = 64;                                  // texture height; the sprite is scaled in world units
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.font = `600 ${Math.round(px * 0.62)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    c.width = w; c.height = px;
    const ctx2 = c.getContext('2d')!;
    ctx2.font = `600 ${Math.round(px * 0.62)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx2.fillStyle = labelColor;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(text, w / 2, px / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75 }));
    sp.scale.set(worldH * (w / px), worldH, 1);
    return sp;
  }


  // The 2D editor's default snap cell, in MAP units — the fallback when a campaign has no grid config,
  // so a lattice overlay still matches the scale the GM is used to.
  const DEFAULT_MAP_CELL = 50;

  // Lattice geometry from a list of ground edges. Two things happen here that the old flat LineSegments
  // couldn't do:
  //  • RADIAL FADE — alpha falls off with distance from the map centre, so the lattice dissolves instead
  //    of stopping at a hard ragged disc edge ("they could be anywhere").
  //  • DEPTH SKIRT — each edge drops a short curtain that fades to nothing. Seen straight down it's
  //    edge-on and invisible (identical to the 2D map); tilt the view and the grid gains subtle depth.
  // Alpha rides a vec4 colour attribute, so one draw call carries the whole gradient.
  function addLattice(
    edges: GridEdge[], col: THREE.Color, cell: number, fadeFrom: number, fadeTo: number,
    o: { alpha?: number; ribbon?: number; skirt?: number } = {}
  ) {
    // THE LATTICE IS FLAT unless the skirt is asked for. Each edge used to drop a short curtain
    // ALWAYS, which reads as depth on a tilted 3D map and as fuzz on a flat one — and the 2D starmap
    // is this same renderer locked overhead, so it was paying for a depth cue it can never show.
    // Now it is a choice ("Grid depth").
    //
    // The EMISSION now lives in map/gridGeometry, shared with the system map, rather than just the
    // constants: sharing the numbers and not the emitter is exactly how the system map came to square
    // its own colour while these same lines stayed correct. This function keeps only the three-specific
    // half — turning the arrays into objects.
    const { linePos, lineCol, skirtPos, skirtCol } = buildLattice(edges, col, {
      alpha: o.alpha, cell, skirt: o.skirt, ribbon: o.ribbon, y0: 0.01, fade: { from: fadeFrom, to: fadeTo }
    });
    if (!linePos.length) return;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 4));
    // NO `color` on the material: it defaults to white, so the vertex attribute is the ONLY thing
    // tinting these lines. Three multiplies the two (`diffuseColor *= vColor`), so a material that
    // also carried the colour would square it — which is precisely the bug the system map had.
    gridGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })));
    if (!skirtPos.length) return;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(skirtCol, 4));
    gridGroup.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
  }

  // Speaks the SHARED overlay vocabulary (MapOverlay) rather than the 2D snap-grid's legacy spelling.
  // It used to take 'grid' and the one caller translated 'square' -> 'grid' inline, which is two
  // vocabularies for one concept with a translation in exactly one place — the shape a type falls
  // silently through (inbox A37). `normaliseOverlay` already folds every persisted spelling
  // ('grid', 'none', 'travellerHex') into the canonical set, so a stored snap-grid config is accepted
  // here without anyone translating it by hand.
  function renderMapGrid(base: THREE.Color, typeOverride?: MapOverlay, sizeOverride?: number) {
    // A lattice OVERLAY renders as the map-aligned grid at the GM's own cell size, so the player's
    // hexes/squares are the same scale as the GM's map — they used to be an arbitrary GRID_RADIUS/7,
    // which made them several times too big.
    const cfg = {
      type: normaliseOverlay(typeOverride ?? mapGridCfg?.type ?? 'off'),
      size: (sizeOverride ?? mapGridCfg?.size ?? DEFAULT_MAP_CELL)
    };
    if (!isLatticeMode(cfg.type)) return;   // 'off'/polar reach here only through a stale config
    const cell0 = cfg.size * mapK;
    if (cell0 <= 1e-4) return;
    const half = GRID_RADIUS * 2.4;   // well past the map so the lattice fills the view; it fades out below
    const HEX_LABEL_CAP = 400;
    const originX = -mapCx * mapK, originZ = -mapCy * mapK; // scene coords of map (0,0)
    const draw = Math.max(1, Math.ceil(0.22 / cell0)); // thin out if the cells are tiny on screen
    const cell = cell0 * draw;

    // THE LATTICE ITSELF comes from the shared generator (map/latticeGeometry), which the 2D starmap
    // also consumes — so the two views cannot draw different grids for the same settings. Called in
    // SCENE units here (the generator is unit-agnostic); the 2D view calls it in map units.
    //
    // maxSegment is what fixes squares (inbox A37). `addLattice` fades PER VERTEX and drops a segment
    // whose both ends have faded out; an unsegmented square line spans the whole lattice, so both of
    // its endpoints lay beyond the fade radius and EVERY line was culled — the branch ran, built its
    // geometry and drew nothing. Hex edges are one hex wide and never hit it. One cell per segment
    // makes the square path fade exactly as the hex one does.
    // Squares take the THINNED cell (they are drawn per grid line, so a dense map is skipped through);
    // hexes take the true cell, exactly as before — a hex lattice cannot be thinned without moving the
    // centres a system is snapped to. Keeping those separate is what makes hex render unchanged.
    const isHex = isHexFamily(cfg.type);
    const sizeS = (cfg.size / 2) * mapK;                      // hex radius, centre to L/R vertex
    if (isHex && (1.5 * sizeS < 0.06 || Math.sqrt(3) * sizeS < 0.06)) return;  // too dense to be useful
    const geo = { cell: isHex ? cfg.size * mapK : cell, originX, originY: originZ, half, maxSegment: cell };
    const edges: [number, number, number, number][] = latticeFor(cfg.type, geo) as [number, number, number, number][];

    // TRAVELLER NUMBERING (WS3 [Q5]) — the CCRR hex address, from the same centres the edges came
    // from, so a label can never sit in a hex the lattice did not draw. Only when the hexes are big
    // enough on screen to read, and capped, so a zoomed-out sector does not spawn thousands of sprites.
    if (cfg.type === 'traveller-hex') {
      const hd = 1.5 * sizeS, hh = Math.sqrt(3) * sizeS;
      // 0.5 scene units was above a typical hex on a bundled map (GRID_RADIUS is 12, so that is ~24
      // hexes across the whole field) — which is why Traveller hex looked identical to hex. The gate
      // is still a LEGIBILITY gate, just set where a number is actually readable rather than where it
      // is comfortable.
      if (hd >= 0.22) {
        // NUMBER THE POPULATED SUBSECTORS, WHOLE — not every hex on the field, and not only the hexes
        // that hold a star. A blank subsector carries no information and numbering it is just noise;
        // a subsector with something in it gets its full 8x10 addressed, because the point of the
        // numbering is to give a REFERENCE FRAME around what is there, and half a numbered block is
        // no frame at all.
        //
        // It also replaces a cap that was doing real damage: the old code stopped after 400 sprites in
        // ITERATION order, column by column from the left, so on a field of more than 400 hexes the
        // numbering filled the left of the map and simply stopped. Selecting by content rather than
        // truncating by count means the labels that survive are the ones a reader wanted.
        const subKey = (col: number, row: number) => `${Math.floor(col / 8)},${Math.floor(row / 10)}`;
        const populated = new Set<string>();
        for (const sys of lastData?.systems ?? []) {
          const col = Math.round(((sys.x ?? 0) * mapK) / hd);
          const zBase = (Math.abs(col) % 2) * (hh / 2);
          const row = Math.round(((sys.y ?? 0) * mapK - zBase) / hh);
          populated.add(subKey(col, row));
        }
        if (populated.size) {
          const centres = hexCentres(geo)
            .filter((c) => populated.has(subKey(c.col, c.row)))
            .map((c) => ({ c, d: Math.hypot(c.x, c.y) }))
            .sort((p, q) => p.d - q.d)
            .slice(0, HEX_LABEL_CAP);        // backstop only; the filter above does the real work
          for (const { c } of centres) {
            const sp = makeHexNumber(travellerHexLabel(c.col, c.row), hh * 0.22);
            if (sp) { sp.position.set(c.x, 0.03, c.y - hh * 0.3); gridGroup.add(sp); }
          }
        }
      }
    }

    // Fade from the map's own radius out to the generous span, so the lattice covers the view but
    // dissolves rather than ending in a hard ragged edge.
    // Fade in world space from a little past the map out to the span: viewed top-down the visible area
    // sits inside the solid zone so the lattice fills the screen, but tilt the camera and the far field
    // dissolves toward the horizon instead of stretching away as clutter.
    const fw = fadeWindow();
    addLattice(edges, base.clone().multiplyScalar(0.42), cell, fw.from, fw.to, { skirt: gridSkirt });

    // SUBSECTOR BOUNDARIES — what makes a Traveller map read as one rather than as a plain hex field,
    // and the reason hex and Traveller hex were indistinguishable: the numbering is only legible when
    // the hexes are large, but these are sparse (every 8th column, every 10th row) and read at any
    // zoom. Drawn as RIBBONS, because THREE ignores line thickness on nearly every platform. Brighter
    // than the lattice and never skirted — a heavier line, not a deeper one.
    if (hasSubsectors(cfg.type)) {
      const subs = subsectorLattice(geo) as [number, number, number, number][];
      addLattice(subs, base.clone().multiplyScalar(0.85), cell, fw.from, fw.to,
        { alpha: 0.7, ribbon: Math.max(0.012, sizeS * 0.075) });
    }
  }
  function rebuildGrid() {
    clearGroup(gridGroup);
    gridGroup.visible = gridMode !== 'off';
    if (gridMode === 'off') return;
    const base = new THREE.Color(routeColor());
    const unit = (opts.distanceUnit || 'ly').toLowerCase() === 'diagrammatic' ? '' : (opts.distanceUnit || 'ly');
    // The OVERLAY CHOICE WINS, always. This used to defer to the GM's snap-grid whenever one existed,
    // which meant a GM with hexes on made every player overlay render as hexes — pick Polar, get hexes.
    // Mirroring the GM's grid is still available: choose Square / Hex / Traveller hex, which render that
    // very grid at the GM's own cell size and alignment.
    // A LATTICE overlay is the map-aligned grid at the GM's cell size (see renderMapGrid) — never an
    // invented size, so the player's hexes match the GM's map exactly.
    if (isLatticeMode(gridMode)) {
      renderMapGrid(base, gridMode, mapGridCfg?.size ?? DEFAULT_MAP_CELL);
      return;
    }
    // G4: POLAR goes through the SAME addLattice path as the lattices, so it gets the same distance
    // falloff and the same optional depth. It used to be raw LineLoops with a per-ring dim baked in,
    // which is why it could not take either — "every grid type the same treatment" is only true if
    // they share the code that gives the treatment.
    const pf = fadeWindow();
    const ringSegs: GridEdge[] = [];
    const spokeSegs: GridEdge[] = [];
    // G10 — SCALED rings sit at ROUND distances, and they are real distances now.
    //
    // TWO FAULTS, and the second was the serious one. (a) The rings were sixths of the extent, so the
    // label reported whatever radius that landed on — "3.7 ly" is noise wearing a number. They come
    // off the shared 1/2/5 ladder now, so a GM reads 5, 10, 15 and can do arithmetic with it.
    // (b) THE LABELS WERE NEVER CONVERTED OUT OF MAP UNITS. `extent` is in map coordinates and the
    // suffix was the campaign's distance unit, with nothing between them but a comment reading "map
    // units at this ring ~ distance". On the bundled Local Neighbourhood that is a factor of 43.3:
    // the rings read 182 / 364 / ... / 1091 ly across a neighbourhood that is 25 ly to its edge.
    //
    // `plain` keeps its six even decorative rings — it makes no claim, so it needs no ladder.
    const scaled = gridMode === 'scaled';
    const perUnit = pixelsPerUnit > 0 ? pixelsPerUnit : 1;
    const trueExtent = extent / perUnit;   // the map's half-extent in the campaign's OWN unit
    const rings: { radius: number; value: number }[] = scaled
      ? niceSeries(trueExtent, 6).map((v) => ({ radius: (v / trueExtent) * GRID_RADIUS, value: v }))
      : Array.from({ length: 6 }, (_, i) => ({ radius: (GRID_RADIUS / 6) * (i + 1), value: 0 }));
    for (const ring of rings) {
      ringSegs.push(...ringEdges(ring.radius, 72));
      if (scaled) {
        const label = makeGridLabel(`${formatNice(ring.value)}${unit ? ' ' + unit : ''}`);
        if (label) { label.position.set(ring.radius, 0.02, 0); gridGroup.add(label); }
      }
    }
    // Spokes, segmented for the same reason the squares are: a fade evaluated per vertex judges a
    // full-length spoke by its far end and drops the whole thing (inbox A37).
    spokeSegs.push(...spokeEdges(24, GRID_RADIUS, 24));
    addLattice(ringSegs, base.clone().multiplyScalar(0.45), GRID_RADIUS / 6, pf.from, pf.to, { alpha: 0.55, skirt: gridSkirt });
    addLattice(spokeSegs, base.clone().multiplyScalar(0.22), GRID_RADIUS / 6, pf.from, pf.to, { alpha: 0.5, skirt: 0 });
  }
  // Both halves of the tether go together: the ring exists to say where the stem lands, so a ring on
  // its own would be marking the foot of a line nobody can see.
  function setDropLines(on: boolean) {
    const n = on !== false;
    if (n === dropLinesOn) return;
    dropLinesOn = n;
    if (lastData) setData(lastData.systems, lastData.routes);
  }
  function setGrid(mode: MapOverlay) { if (mode === gridMode) return; gridMode = mode; rebuildGrid(); }

  // --- G16: the map background, as a PLANE IN THE MAP PLANE -------------------------------------
  //
  // The owner's revision, 2026-08-17: "On the 3D map we need this as a plane on the player view - so
  // from above it frames right." Looking straight down, this quad frames EXACTLY as the GM 2D map's
  // <image> does, because both are the same rectangle in map coordinates and this scene applies only
  // the same fit transform its system stars get. Tilt the camera and it is seen edge-on, with the
  // systems standing above and below it by their depth - which is the honest picture of what a
  // reference-plane chart is.
  //
  // NOT WRAPPED ON THE SKY SPHERE, deliberately and by owner decision: warping a flat sector map onto
  // a sphere is the cost he judged not worth paying, and the procedural starfield stays.
  //
  // THE PLANE IS REBUILT FROM `rebuildMapBackground` WHENEVER THE FIT TRANSFORM CHANGES, which means
  // after every `setData` - `mapCx`/`mapCy`/`mapK` are recomputed there from the systems' own spread,
  // so a plane built before them would be positioned against a stale fit and drift off the stars the
  // moment a system moved.
  const bgGroup = new THREE.Group();
  bgGroup.renderOrder = -1; // behind the grid, the routes and the stars
  scene.add(bgGroup);
  let mapBgCfg: SceneMapBackground | null = null;
  let mapBgTex: THREE.Texture | null = null;
  let mapBgTexUrl: string | null = null;

  /** Like `clearGroup`, but it must NOT dispose the texture: that is cached across rebuilds, and a
   *  rebuild happens on every `setData`. Disposing it here would blank the picture on the first
   *  reframe and leave nothing to load it again. */
  function clearBackgroundGroup() {
    bgGroup.traverse((o) => {
      const a = o as any;
      a.geometry?.dispose?.();
      const m = a.material;
      (Array.isArray(m) ? m : [m]).forEach((x: any) => x?.dispose?.());
    });
    bgGroup.clear();
  }

  function rebuildMapBackground() {
    clearBackgroundGroup();
    if (!mapBgCfg || !mapBgTex || mapBgCfg.opacity <= 0) return;
    const cfg = mapBgCfg;
    const geo = new THREE.PlaneGeometry(cfg.w * mapK, cfg.h * mapK);
    const mat = new THREE.MeshBasicMaterial({
      map: mapBgTex,
      transparent: true,
      opacity: cfg.opacity,
      // Never write depth: the stars are additive sprites drawn over it, and a background that
      // occludes is a background that eats the map.
      depthWrite: false,
      side: THREE.DoubleSide, // seen from underneath on a low camera, and from below the plane in 3D
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    // ORIENTATION, derived once and stated because it is the part that is easy to get silently wrong.
    // `toScene` sends map x -> world X and map y -> world Z, with world Y as height. A plane rotated
    // -PI/2 about X puts its local +X on world +X and its local +Y on world -Z, so the bitmap's TOP
    // edge lands at the SMALLER map y - which is the top of the GM's map, because map y runs downward.
    // A clockwise turn of `t` in that y-down map frame is a rotation of MINUS t about world Y; the
    // 'YXZ' order applies the Y term after the tilt, which is what makes that true.
    const t = (cfg.rotationDeg * Math.PI) / 180;
    mesh.rotation.set(-Math.PI / 2, -t, 0, 'YXZ');
    // Just below the reference plane, so the grid, the drop-line ticks and the routes all read over it.
    mesh.position.set((cfg.cx - mapCx) * mapK, -0.02, (cfg.cy - mapCy) * mapK);
    mesh.renderOrder = -1;
    bgGroup.add(mesh);
  }

  function setMapBackground(cfg: SceneMapBackground | null) {
    mapBgCfg = cfg;
    if (!cfg) { mapBgTexUrl = null; mapBgTex = null; rebuildMapBackground(); return; }
    if (cfg.url === mapBgTexUrl) { rebuildMapBackground(); return; }
    // A new bitmap: load, then rebuild. The texture is kept OUT of `bgGroup` disposal (clearGroup
    // disposes the material's map) by cloning per rebuild - see below.
    mapBgTexUrl = cfg.url;
    mapBgTex?.dispose();
    mapBgTex = null;
    rebuildMapBackground(); // clear the old picture immediately rather than showing it under a new anchor
    new THREE.TextureLoader().load(cfg.url, (tex) => {
      if (disposed || mapBgTexUrl !== cfg.url) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      mapBgTex = tex;
      rebuildMapBackground();
    });
  }
  function setDistanceScale(v: number) {
    const n = Number.isFinite(v) && v > 0 ? v : 0;
    if (n === pixelsPerUnit) return;
    pixelsPerUnit = n;
    rebuildGrid();
  }
  function setGridSkirt(v: number) {
    const n = Math.max(0, Math.min(1, v || 0));
    if (n === gridSkirt) return;
    gridSkirt = n;
    rebuildGrid();
  }
  function setGridFalloff(v: number) { if (v === gridFalloff) return; gridFalloff = v; rebuildGrid(); }
  // Rebuilds the content because depth is baked into the placed geometry (positions, drop-lines,
  // route lines). Cheap at starmap scale and keeps one code path for placement.
  function setZExaggeration(v: number) {
    const next = Math.max(0, Math.min(50, Number.isFinite(v) ? v : 1));
    if (Math.abs(next - zExaggeration) < 1e-6) return;
    zExaggeration = next;
    if (lastData) setData(lastData.systems, lastData.routes);
  }
  // "2D starmap": the TILT is pinned top-down like the classic flat map — it can never become a 3D view.
  // Zoom and pan stay. Pinned just off true vertical (0.05) because an exactly-overhead orbit camera is
  // gimbal-degenerate (view axis parallel to `up`); at ~3° the ground plane still reads perfectly flat.
  function setFlatOverhead(on: boolean) {
    // Depth is baked into the placement, so switching between the plan view and the 3D view has to rebuild.
    if (on !== flatMode) { flatMode = on; if (lastData) setData(lastData.systems, lastData.routes); }
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = on ? 0.05 : Math.PI - 0.05;
    // Flat map: the primary gesture is PAN — left-drag/one-finger pans (OrbitControls' default puts
    // rotate there); rotate moves to right-drag (azimuth only, and off entirely when heading-locked).
    controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = on ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    controls.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    if (on) setFraming(0);
    controls.update();
  }
  // Fix the heading. Separate from the tilt: a flat map with this OFF can still be spun (azimuth only,
  // since the polar stays clamped) — it just never tilts into a 3D view.
  function setLockRotation(on: boolean) {
    controls.enableRotate = !on;
    controls.update();
  }
  // The GM's live snap-grid config (type + cell size). Null/none → the decorative grid is used instead.
  function setMapGrid(cfg: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number } | null) {
    const same = (!cfg && !mapGridCfg) || (cfg && mapGridCfg && cfg.type === mapGridCfg.type && cfg.size === mapGridCfg.size);
    if (same) return;
    mapGridCfg = cfg && cfg.type !== 'none' ? cfg : null;
    rebuildGrid();
  }
  // Toggle the emissive glow on routes (vs plain lines). Rebuilds the content (routes live there).
  function setRouteGlow(on: boolean) { if (on === routeGlowOn) return; routeGlowOn = on; if (lastData) setData(lastData.systems, lastData.routes); }
  // Monochrome palette: white/grey stars + routes + grid (labels handled by setLabelColor). Rebuilds.
  function setMono(on: boolean) { if (on === monoOn) return; monoOn = on; if (lastData) setData(lastData.systems, lastData.routes); rebuildGrid(); }

  // --- Filter chain (shared package) ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const filterRes = new THREE.Vector2(1, 1);
  const clock = new THREE.Clock();
  let filterPass: ShaderPass | null = null;
  let filterId = 'none';
  let filterParams: FilterParamValues = {};
  function rebuildFilter() {
    if (filterPass) { composer.removePass(filterPass); (filterPass.material as THREE.Material).dispose(); filterPass = null; }
    const def = filterRegistry.get(filterId);
    if (!def || filterId === 'none') return;
    filterPass = new ShaderPass(buildShaderObject(def, { ...filterRegistry.defaultParams(filterId), ...filterParams }, filterRes));
    composer.addPass(filterPass);
  }
  function setFilter(id: string, params?: FilterParamValues) {
    const nextId = id || 'none', nextParams = params || {};
    if (nextId === filterId && filterPass) {
      filterParams = nextParams; const def = filterRegistry.get(filterId);
      if (def) updateUniforms(filterPass.uniforms, def, { ...filterRegistry.defaultParams(filterId), ...nextParams });
      return;
    }
    if (nextId === filterId && filterId === 'none') return;
    filterId = nextId; filterParams = nextParams; rebuildFilter();
  }

  // --- Content: system stars + routes ---
  const content = new THREE.Group();
  scene.add(content);
  // `glyphPx` is the system's glyph reach in SCREEN PIXELS — 0 for a route label, which marks a point
  // on a line rather than an object. It is what the label offsets itself by so the badge stack clears
  // the glyph instead of sitting inside it; see updateLabels. A pixel figure because the glyph IS a
  // pixel figure now (G26/C17): it used to be a scene radius converted per frame.
  //
  // GLYPH_PX is the LAYOUT RADIUS R in screen px — the unit the cluster offsets and the member sizes
  // are stated in (starGlyphLaw). 9 px is the old `R = 0.22` scene units seen from the whole-map
  // framing at a ~800 px tall view, so at scaler 0 the default view is the same size it was. The disc
  // is half of it; the corona reaches to about 1.25-2.25 R, hence the margin the label clears.
  const GLYPH_PX = 9;
  const GLYPH_CORONA_MARGIN = 0.6;
  // The black-hole glyph's full width in layout radii (the art's ring sits at 12.2% of it). 5.4 puts
  // the photon ring at 0.66 radii against a dwarf's 0.5 disc; the old 3.4 put it at 0.41, inside the
  // star's corona — which is why a hole read as smaller than a star.
  const HOLE_GLYPH = 5.4;
  // G26: the GM size scaler, 0 = equal sizes (the old map) .. 1 = the four bands fully separated.
  let starScale = 0;
  // The base-size multiplier on GLYPH_PX, 0.5..2 (1 = as shipped). Every member, spread, hole glyph and
  // label clearance rides it, because they are all stated in that unit.
  let starSize = 1;
  const glyphUnitPx = () => GLYPH_PX * starSize;
  // The shared corona halo — one texture per scene, the holo's makeGlowTexture, made on first use.
  let glowTexShared: THREE.Texture | null = null;
  const coronaTexture = () => (glowTexShared ??= makeGlowTexture());
  const seedOf = (id: string, i: number) => { let h = 2166136261 ^ (i * 977); for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; };
  // One record per drawn STAR (a system has one per member): positioned and scaled per frame.
  interface PlacedStar { group: THREE.Group; center: THREE.Vector3; slot: GlyphSlot; look?: StarLookVisual; sysId: string; index: number }
  let placedStars: PlacedStar[] = [];
  // Badge-only knobs, carried by the preset. Same three the system map takes, so the two agree.
  let markerOpts: { size: number; staff: FlagStaffColor; pinText: PinTextMode } = { size: 1, staff: 'silver', pinText: 'initial' };
  interface Placed { id: string; name: string; center: THREE.Vector3; glyphPx: number; label?: LabelSprite }
  let placed: Placed[] = [];
  let labelsVisible = true;
  let labelColor = '#d6e2f2';
  let labelSizePx = 12;
  let labelFontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  function redrawAllLabels() { for (const p of placed) if (p.label) drawLabel(p.label); }
  const setLabelColor = (hex: string | null) => { labelColor = hex || '#d6e2f2'; redrawAllLabels(); };
  // Clamp matches PlayerPresetEditor's slider range EXACTLY — see the note on holo/scene.setLabelSize.
  const setMarkerOptions = (o: { size?: number; staff?: FlagStaffColor; pinText?: PinTextMode }) => {
    const next = { size: o?.size ?? 1, staff: o?.staff ?? 'silver', pinText: o?.pinText ?? 'initial' } as typeof markerOpts;
    if (next.size === markerOpts.size && next.staff === markerOpts.staff && next.pinText === markerOpts.pinText) return;
    markerOpts = next;
    for (const pl of placed) if (pl.label) drawLabel(pl.label);
  };
  const setLabelSize = (px: number) => { labelSizePx = Math.max(6, Math.min(48, px)); }; // applied via sprite scale
  const setLabelFont = (f: string | null) => { labelFontFamily = f && f.trim() ? f : 'ui-monospace, SFMono-Regular, Menlo, monospace'; redrawAllLabels(); };
  const setLabelsVisible = (on: boolean) => { labelsVisible = on; };

  // A name label as an in-scene sprite (added to `content`, so it warps/tints with the stars).
  function makeLabelSprite(name: string, color?: string, markers: HighlightMarker[] = []): LabelSprite | undefined {
    if (!name) return undefined;
    const canvas = document.createElement('canvas');
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, -0.35); // anchor below the text so it floats above the star glyph
    sprite.renderOrder = 999;
    sprite.visible = false;
    const ls: LabelSprite = { sprite, canvas, text: name, aspect: 1, heightRatio: 1, nameFraction: 1, color, markers };
    drawLabel(ls);
    content.add(sprite);
    return ls;
  }
  function drawLabel(ls: LabelSprite) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const fontPx = 40, pad = 6;
    const font = `600 ${fontPx}px ${labelFontFamily}`;
    const ctx = ls.canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = font;
    const textW = Math.max(1, Math.ceil(ctx.measureText(ls.text).width));
    const nameH = Math.ceil(fontPx * 1.35) + pad * 2;

    // ROLL-UP BADGES under the system name, in this same canvas — one sprite, so a badge cannot drift
    // from the system it belongs to. Sized off the label's font, so the hierarchy holds at any scale.
    const { shown: capped, overflow } = capMarkers(ls.markers ?? []);
    // 0.55 of the name is the badge's NATURAL size here (the starmap's names are the denser of the
    // two surfaces); `markerOpts.size` is the GM's multiplier on top, the same dial the system map uses.
    const pm = tagPillMetrics(fontPx * 0.55 * (markerOpts.size || 1));
    const asideGap = pm.fontPx * 0.45;
    const badges = capped
      .filter((m) => m.style !== 'ring')
      .map((m) => {
        const text = tagPillText(m, markerOpts.pinText);
        const aside = pinAside(m, markerOpts.pinText);
        const asideW = aside ? asideGap + tagPillWidth(aside, pm, ctx) - pm.padX * 2 : 0;
        return {
          text, aside, style: m.style, color: m.color, textColor: m.textColor,
          step: markerStackStep(m.style as MarkerStyleName, pm),
          width: m.style === 'pin' ? pm.height + asideW * 2 : tagPillWidth(text, pm, ctx) + (m.style === 'flag' ? pm.fontPx * 0.09 : 0)
        };
      });
    if (overflow) {
      const text = `+${overflow}`;
      badges.push({ text, aside: '', style: 'label', color: TAG_PILL_OVERFLOW_BG, textColor: TAG_PILL_OVERFLOW_FG,
                    step: pm.rowStep, width: tagPillWidth(text, pm, ctx) });
    }
    const badgeW = badges.length ? Math.max(...badges.map((b) => b.width)) : 0;
    const badgeH = badges.reduce((n, b) => n + b.step, 0);

    const cw = Math.max(textW + pad * 2, Math.ceil(badgeW) + pad * 2);
    const ch = nameH + Math.ceil(badgeH);
    const newW = Math.max(2, Math.round(cw * dpr));
    const newH = Math.max(2, Math.round(ch * dpr));
    const resized = ls.canvas.width !== newW || ls.canvas.height !== newH;
    ls.canvas.width = newW;
    ls.canvas.height = newH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
    ctx.fillStyle = ls.color || labelColor;
    ctx.fillText(ls.text, cw / 2, nameH / 2);

    if (badges.length) {
      ctx.shadowBlur = 0;
      let top = nameH;
      for (const b of badges) {
        if (b.style === 'pin') {
          // The pin keeps the canvas centre so it stays over the system it marks; the name runs to
          // its right, and the badge reserves that width on BOTH sides so the sprite's centre does not
          // move. Same rule as the system map — see holo/scene.ts for the full note.
          const pinX = cw / 2;
          drawTagPin(ctx, b.text, pinX, top + b.step, pm, b.color, b.textColor);
          if (b.aside) {
            ctx.font = pm.font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillStyle = ls.color ?? labelColor;   // chrome, not a second chip
            ctx.fillText(b.aside, pinX + pm.height / 2 + asideGap, top + b.step - pm.fontPx * TAG_PILL_STEM - pm.height * 0.175);
            ctx.textAlign = 'center';
          }
        }
        else if (b.style === 'flag') drawTagFlag(ctx, b.text, (cw - b.width) / 2, top + b.step, pm, b.color, b.textColor, flagStaffColor(markerOpts.staff, b.color));
        else drawTagPill(ctx, b.text, (cw - b.width) / 2, top + b.step / 2, pm, b.color, b.textColor);
        top += b.step;
      }
    }

    ls.aspect = cw / ch;
    ls.heightRatio = ch / fontPx;
    // Hold the NAME's gap above the glyph constant as the sprite grows downward with badges. The
    // final anchor is set per frame in updateLabels, which adds the glyph's apparent radius on top.
    ls.nameFraction = nameH / ch;
    ls.sprite.center.set(0.5, -0.35 * ls.nameFraction);
    // RENDER-B1: GL texture storage is allocated ONCE, so uploading a canvas of a different pixel size
    // silently never lands and the quad keeps stretching the stale bitmap. This path was the one copy
    // of the pair that had never been fixed — latent only because a label's size never used to change.
    const smat = ls.sprite.material as THREE.SpriteMaterial;
    if (resized || !smat.map) {
      smat.map?.dispose();
      smat.map = new THREE.CanvasTexture(ls.canvas);
      smat.needsUpdate = true;
    } else {
      smat.map.needsUpdate = true;
    }
  }

  function clearContent() {
    clearGroup(content);
    placedStars = [];
    for (const p of placed) {
      if (!p.label) continue;
      content.remove(p.label.sprite);
      const mat = p.label.sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose(); mat.dispose();
    }
    placed = [];
  }

  function setData(systems: SmSystem[], routes: SmRoute[]) {
    lastData = { systems, routes };
    clearContent();
    if (!systems.length) return;
    // Normalise map (x,y) into the ground plane, centred, fitting GRID_RADIUS.
    const xs = systems.map((s) => s.x), ys = systems.map((s) => s.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const spanMap = Math.max(maxX - minX, maxY - minY, 1e-6);
    extent = spanMap / 2; // half-extent in map units (for LY labels)
    const k = (GRID_RADIUS * 0.92) / (spanMap / 2);
    mapCx = cx; mapCy = cy; mapK = k; // keep the fit transform so the map-grid aligns to the systems
    // Scene Y is HEIGHT, so a system's depth lifts it off the reference plane (times the display-only
    // exaggeration). The 2D plan view collapses it outright.
    //
    // The exaggeration is applied AS ASKED. An earlier version capped it so the deepest system could never
    // rise past the map's edge-distance, which was sound when the bundled map was flat — but the map now
    // carries real astrometric depth (up to 1508 map units against a 2182-unit spread), so the cap bound
    // immediately and pinned the slider at 1x: the control did nothing at all. A control that silently
    // ignores you is worse than one that lets you overdo it, and the camera can always be zoomed out.
    const effZ = flatMode ? 0 : Math.max(0, zExaggeration);
    const toScene = (x: number, y: number, z = 0) =>
      new THREE.Vector3((x - cx) * k, z * k * effZ, (y - cy) * k);

    const centers = new Map<string, THREE.Vector3>();
    placedStars = [];
    for (const sys of systems) {
      const center = toScene(sys.x, sys.y, sys.z ?? 0);
      centers.set(sys.id, center);
      const stars: SmSystem['stars'] = sys.stars.length ? sys.stars : [{ color: '#8899aa' }];
      // C17 / G26: glyph size and member spread are SCREEN quantities. Each member is a GROUP built
      // at unit layout radius (the disc at 0.5, the corona/flares/decorations about it from the shared
      // builder) and positioned + scaled EVERY FRAME in `updateStars` from the camera distance, so a
      // star is the same pixels wide at every zoom and a triple is the same compact cluster. The old
      // sprite was `R = 0.22` SCENE units with offsets `dx * R` in the same units — light-years of
      // fuzz up close, and Alpha Centauri's three stars as far apart as Sol at a tight zoom.
      const members: GlyphMember[] = stars.map((st) => ({ band: st.band ?? 'dwarf', letter: st.letter, fixed: !!st.bh }));   // a hole's glyph never shrinks
      const slots = clusterLayout(members, starScale);
      stars.forEach((st, i) => {
        const group = new THREE.Group();
        let look: StarLookVisual | undefined;
        if (st.bh) {
          // A black hole is drawn as its schematic glyph (normal-blended, so black reads as black) rather
          // than a colour-tinted star that would vanish on the dark map — the disc blaze sized by the
          // accretion level when feeding, the bare ringed hole when quiescent. It keeps this glyph at
          // every scaler position: a hole must still read as a hole (owner, 2026-08-16).
          const mat = new THREE.SpriteMaterial({ map: bhGlyph(st.bh === 'active', st.edd), color: monoOn ? new THREE.Color(MONO_HEX) : 0xffffff, transparent: true, depthWrite: false });
          const sp = new THREE.Sprite(mat);
          // Sized so the HORIZON reads against a star's disc, not inside its corona (owner, 2026-08-19:
          // holes "much smaller than stars, as likely scaled on the furthest extent of the disc rather
          // than the event horizon"). The glyph art puts the horizon at 11% of the canvas and the
          // photon ring at 12.2%; at HOLE_GLYPH units the ring is 0.66 layout radii — a little wider
          // than a dwarf's 0.5 disc, as a hole's shadow should read. The blaze grows with the feed.
          sp.scale.setScalar(st.bh === 'active' ? HOLE_GLYPH + Math.min(1, st.edd ?? 0.6) * 1.2 : HOLE_GLYPH);
          sp.renderOrder = 2;
          group.add(sp);
          // A FED hole jets (the tag says so — physics/stellarOutflows); a quiescent one carries no
          // tag and gets nothing. Built with no corona: the glyph's blaze is its light.
          if (st.jets) {
            look = buildStarLook(0.5, 0xffffff, 0, seedOf(sys.id, i), coronaTexture(), { jets: st.jets });
            look.corona.visible = false;
            group.add(look.group);
          }
        } else {
          const colorHex = monoOn ? MONO_HEX : new THREE.Color(st.color).getHex();
          // The photosphere: a sharp tinted disc at half the layout radius.
          const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: starDisc(), color: colorHex, transparent: true, depthWrite: false }));
          disc.scale.setScalar(1.0);
          disc.renderOrder = 2;
          group.add(disc);
          // THE INHERITED LOOK: corona sized by activity, timed flares for an active star, the jet and
          // the shed shell when the star's tags carry them. Same builder, same numbers as the holo.
          look = buildStarLook(0.5, colorHex, st.activity ?? 0.22, seedOf(sys.id, i), coronaTexture(), {
            flares: !!st.flares, jets: st.jets ?? 0, shedding: st.shedding ?? 0
          });
          group.add(look.group);
        }
        const slot = slots[i] ?? { dx: 0, dy: 0, scale: 1 };
        group.position.copy(center);
        content.add(group);
        placedStars.push({ group, center, slot, look, sysId: sys.id, index: i });
      });
      const half = clusterHalfExtent(slots);
      // DROP-LINE: without a tether to the reference plane, exaggerated depth is unreadable — you cannot
      // tell above from below, or by how much. Fades out as it descends, and a small tick marks the spot
      // on the plane directly beneath, so the system's 2D position stays legible.
      if (dropLinesOn && Math.abs(center.y) > 1e-4) {
        const foot = new THREE.Vector3(center.x, 0, center.z);
        const dl = new THREE.BufferGeometry();
        dl.setAttribute('position', new THREE.Float32BufferAttribute([center.x, center.y, center.z, foot.x, foot.y, foot.z], 3));
        const base = new THREE.Color(monoOn ? MONO_HEX : routeColor());
        dl.setAttribute('color', new THREE.Float32BufferAttribute([base.r, base.g, base.b, 0.5, base.r, base.g, base.b, 0.06], 4));
        content.add(new THREE.Line(dl, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })));
        const tick = new THREE.Mesh(
          new THREE.RingGeometry(0.06, 0.1, 12),
          new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
        );
        tick.rotation.x = -Math.PI / 2;
        tick.position.set(foot.x, 0.012, foot.z);
        content.add(tick);
      }
      // The label clears the CLUSTER's drawn reach (its top edge plus the corona's margin), in px.
      placed.push({ id: sys.id, name: sys.name, center, glyphPx: (half.h + GLYPH_CORONA_MARGIN) * glyphUnitPx(), label: makeLabelSprite(sys.name, undefined, sys.markers ?? []) });
    }
    // Routes: an emissively-GLOWING filament — a soft additive halo quad + a bright additive core
    // line — so the link reads like a lit hyperlane in both the 2D (overhead) and 3D starmap.
    //
    // A41: an endpoint is the system's `center` STRAIGHT OUT OF `centers` — the very vector the star
    // sprite was placed at, so the route cannot miss the star it joins. It must not be recomputed from
    // the system's raw z: `toScene` folds in the display-only `effZ` exaggeration, and a route rebuilt
    // from raw depth would leave both stars behind the moment the slider is not at 1x. (Losing a
    // coordinate by recomputing it is exactly how A17 went wrong.) The endpoints used to be flattened
    // with `.setY(0.02)`, which is what put routes on the floor.
    //
    // In the 2D plan view (`flatMode`) `effZ` is 0, so every centre is already on the plane and routes
    // stay planar with no special case. THAT IS DELIBERATE AND CORRECT — 2D is the plan view by
    // standing rule, so the SVG `Starmap2DView` and this scene legitimately differ. Do not "fix" 2D.
    const routePts: THREE.Vector3[] = [];
    const routePtsDash: THREE.Vector3[] = [];
    const glowW = GRID_RADIUS * 0.02; // filament half-width in scene units
    // Clearance above the reference plane, so a route between two on-plane systems does not z-fight the
    // grid. Applied as an OFFSET to the true height rather than as an absolute y, so it translates a
    // sloped line instead of flattening it.
    const LIFT = new THREE.Vector3(0, 0.02, 0);
    for (const r of routes) {
      const ca = centers.get(r.fromId), cb = centers.get(r.toId);
      if (!ca || !cb) continue;
      const a = ca.clone().add(LIFT), b = cb.clone().add(LIFT);
      (r.dashed ? routePtsDash : routePts).push(a.clone(), b.clone());
      // Route NAME at the midpoint. Pushed into `placed` so it inherits the whole label pipeline —
      // constant on-screen size, colour/font redraws, and crucially the labelsVisible (Hide labels)
      // gate that system names already obey. Route names used to render unconditionally in 2D and
      // not at all here.
      if (r.name && r.name.trim()) {
        // A41: the midpoint of the LINE, not of its shadow. A midpoint pinned to a fixed height floats
        // off the route as soon as the route has any.
        const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.01, 0));
        // Drawn in the ROUTE's own colour, not the shared label colour: a route name sits between the
        // two stars it joins, so in the star colour it reads as just another star name. Matching the
        // line ties it to the link instead. In mono `routeColor()` IS the mono grey, so the tint
        // filters still see one palette.
        placed.push({ id: `route:${r.fromId}>${r.toId}`, name: r.name, center: mid, glyphPx: 0, label: makeLabelSprite(r.name, hexOf(routeColor())) });
      }
      // Glow band (skipped when the glow is toggled off, or for dashed — the dash reads better plain).
      if (!r.dashed && routeGlowOn) {
        // A41, and this is the half that is NOT a one-liner. The band used to be oriented with
        // `quad.rotation.y = -atan2(dz, dx)` — a YAW, and a quad that can only yaw can only lie flat.
        // Feeding 3D endpoints to the core line alone would have left the halo on the floor beneath it.
        // So orient it with a full basis: local X along the route, local Y (the quad's normal) the part
        // of world-up left after removing the route direction — i.e. the band is as face-up as a sloped
        // line permits, and for a horizontal route it is EXACTLY the old flat quad. `len` is the true
        // 3D length; the old `hypot(dx, dz)` was the length of the shadow and fell short of the stars.
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len > 1e-4) {
          dir.divideScalar(len);
          const nrm = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
          // A near-vertical route has no horizontal-facing normal to prefer; any perpendicular reads the
          // same, since the band is then edge-on to the plane whatever we choose.
          if (nrm.lengthSq() < 1e-8) nrm.set(1, 0, 0).addScaledVector(dir, -dir.x);
          nrm.normalize();
          const side = new THREE.Vector3().crossVectors(dir, nrm); // right-handed: Z = X × Y
          const mat = new THREE.MeshBasicMaterial({ map: routeGlow(), color: routeColor(), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
          const quad = new THREE.Mesh(ROUTE_QUAD.clone(), mat); // clone: clearContent disposes per-route geometry
          quad.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, nrm, side));
          // Sat 0.005 under the core line before; keep that separation ALONG THE NORMAL rather than in
          // world y, or a steep route's halo and line would land in the same plane and z-fight.
          quad.position.copy(a).add(b).multiplyScalar(0.5).addScaledVector(nrm, -0.005);
          quad.scale.set(len, 1, glowW * 2);
          quad.renderOrder = 1;
          content.add(quad);
        }
      }
    }
    const blend = routeGlowOn ? THREE.AdditiveBlending : THREE.NormalBlending; // glow off → plain lines
    const coreMat = () => new THREE.LineBasicMaterial({ color: routeColor(), transparent: true, opacity: routeGlowOn ? 0.95 : 0.55, blending: blend, depthWrite: false });
    if (routePts.length) content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(routePts), coreMat()));
    if (routePtsDash.length) {
      const lm = new THREE.LineDashedMaterial({ color: routeColor(), transparent: true, opacity: routeGlowOn ? 0.9 : 0.5, blending: blend, depthWrite: false, dashSize: 0.3, gapSize: 0.2 });
      const seg = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(routePtsDash), lm);
      seg.computeLineDistances(); content.add(seg);
    }
    rebuildGrid();
    // G16: the fit transform (mapCx/mapCy/mapK) was just recomputed from these systems' own spread,
    // so the background plane has to be re-placed against it. Skipping this is how a georeferenced
    // picture drifts off the stars the moment a system is added or moved.
    rebuildMapBackground();
  }

  // --- Tap-to-select (live view) — pick the nearest system to the pointer, ignoring orbit drags.
  // Distance-in-screen-space is robust and needs no per-sprite raycast bookkeeping.
  let downX = 0, downY = 0, downT = 0;
  function onPointerDown(e: PointerEvent) { downX = e.clientX; downY = e.clientY; downT = performance.now(); }
  function onPointerUp(e: PointerEvent) {
    if (!opts.onSelect) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || performance.now() - downT > 700) return; // a drag, not a tap
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: string | null = null, bestD = 34; // px hit radius
    for (const p of placed) {
      proj.copy(p.center).project(camera);
      if (proj.z > 1) continue;
      const sx = (proj.x * 0.5 + 0.5) * viewW, sy = (-proj.y * 0.5 + 0.5) * viewH;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestD) { bestD = d; best = p.id; }
    }
    if (best) opts.onSelect(best);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  // --- Loop ---
  let raf = 0, disposed = false;
  const proj = new THREE.Vector3();
  let viewW = 1, viewH = 1;
  function updateLabels() {
    for (const p of placed) {
      const ls = p.label;
      if (!ls) continue;
      if (!labelsVisible) { ls.sprite.visible = false; continue; }
      proj.copy(p.center).project(camera);
      if (proj.z > 1) { ls.sprite.visible = false; continue; } // behind the camera
      ls.sprite.visible = true;
      ls.sprite.position.copy(p.center);
      // Constant on-screen size. sizeAttenuation:false → on-screen px = scale · viewH / (2·tan(fov/2)),
      // so scale = px · 2·tan(fov/2) / viewH. Full sprite = labelSizePx·heightRatio so the text lands at px.
      const pxToScale = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
      const hFull = labelSizePx * ls.heightRatio * pxToScale;
      ls.sprite.scale.set(hFull * ls.aspect, hFull, 1);
      // SAME STRATEGY AS THE SYSTEM MAP (owner, 2026-08-17: "follow exactly the same strategy for
      // name/tag placement"): clear the glyph's own drawn reach so the stack sits on its edge, and the
      // name still sits above the badge because that is the canvas order. The glyph is a SCREEN size
      // now (G26/C17), so the clearance is a pixel figure and needs no per-frame conversion — it used
      // to be a world radius divided by the distance, because the sprite grew as you zoomed.
      const hPx = Math.max(1e-6, labelSizePx * ls.heightRatio);
      ls.sprite.center.set(0.5, -(0.35 * ls.nameFraction + p.glyphPx / hPx));
    }
  }
  // C17 / G26 — THE FRAME STEP FOR STARS. A member's world position is its system's centre plus its
  // layout offset in SCREEN-ALIGNED units (the camera's right and up), and its group is scaled so the
  // unit layout radius is GLYPH_PX pixels at this star's DEPTH: world-per-px at camera-space depth z
  // is z * 2 tan(fov/2) / viewH. So every star is the same size on screen at every zoom, a triple is
  // the same compact cluster, and the cluster keeps its shape whatever the tilt. Then the shared
  // animator runs the corona pulse, the flares, the jet flicker and the shell's breath.
  //
  // DEPTH, NOT DISTANCE. A perspective projection scales by the point's z in CAMERA space; the
  // Euclidean distance exceeds it by 1/cos(off-axis angle), which at this fov is 15% in the screen's
  // corners and far more on a star the camera is not looking at — measured: a triple the camera had
  // swung off-axis came out 2.4x its on-axis spread before this was a depth. Screen-aligned offsets at
  // one depth project EXACTLY to dx * GLYPH_PX pixels, wherever the star sits in the frame.
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), camFwd = new THREE.Vector3(), viewP = new THREE.Vector3();
  function updateStars(nowSec: number) {
    if (!placedStars.length) return;
    const pxToScale = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
    camera.updateMatrixWorld();   // this frame's camera, not the last render's
    camera.matrixWorld.extractBasis(camRight, camUp, camFwd);
    for (const ps of placedStars) {
      const depth = -viewP.copy(ps.center).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth <= 1e-6) { ps.group.visible = false; continue; }   // behind the camera
      ps.group.visible = true;
      const rW = glyphUnitPx() * pxToScale * depth;   // the layout radius R, in scene units at this depth
      ps.group.position.copy(ps.center)
        .addScaledVector(camRight, ps.slot.dx * rW)
        .addScaledVector(camUp, -ps.slot.dy * rW);   // layout y runs DOWN the screen, as the 2D map's does
      ps.group.scale.setScalar(rW * ps.slot.scale);
      if (ps.look) updateStarLook(ps.look, nowSec);
    }
  }
  // G26: the scaler moves the layout only — the bands are fixed per star, so no rebuild is needed.
  function relayoutStars() {
    if (!lastData) return;
    const byId = new Map(lastData.systems.map((sy) => [sy.id, sy] as const));
    const halves = new Map<string, number>();
    for (const ps of placedStars) {
      const sy = byId.get(ps.sysId);
      if (!sy) continue;
      const stars: SmSystem['stars'] = sy.stars.length ? sy.stars : [{ color: '#8899aa' }];
      const slots = clusterLayout(stars.map((st) => ({ band: st.band ?? 'dwarf', letter: st.letter, fixed: !!st.bh })), starScale);
      ps.slot = slots[ps.index] ?? ps.slot;
      halves.set(sy.id, clusterHalfExtent(slots).h);
    }
    for (const p of placed) { const h = halves.get(p.id); if (h != null) p.glyphPx = (h + GLYPH_CORONA_MARGIN) * glyphUnitPx(); }
  }
  function setStarScale(v: number) {
    const n = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    if (n === starScale) return;
    starScale = n;
    relayoutStars();
  }
  function setStarSize(v: number) {
    const n = Math.max(0.5, Math.min(2, Number.isFinite(v) && v > 0 ? v : 1));
    if (n === starSize) return;
    starSize = n;
    relayoutStars();   // the per-frame step reads glyphUnitPx(); only the label clearances need restating
  }
  function loop() {
    if (disposed) return;
    const t = clock.getElapsedTime();
    controls.update();
    updateStars(t);  // size + place the star glyphs for THIS camera, before the labels measure them
    updateLabels(); // position/size the in-scene label sprites BEFORE rendering so the filter warps them
    if (filterPass) { filterPass.uniforms.time.value = t; composer.render(); } else renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  function resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    viewW = w; viewH = h;
    renderer.setSize(w, h, false); composer.setSize(w, h); filterRes.set(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    sizeHud();
  }

  // A camera-attached full-frame quad carrying a static overlay bitmap (the guide-tip banners), so it
  // is part of the SAME render the post filter processes — it warps/rolls/tints with the shader.
  let hudMesh: THREE.Mesh | null = null;
  let hudTex: THREE.CanvasTexture | null = null;
  function sizeHud() {
    if (!hudMesh) return;
    const d = 1;
    const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
    hudMesh.scale.set(h * camera.aspect, h, 1);
  }
  function setHud(hud: HTMLCanvasElement | null) {
    if (!hud) {
      if (hudMesh) {
        camera.remove(hudMesh);
        hudTex?.dispose();
        (hudMesh.material as THREE.Material).dispose();
        hudMesh.geometry.dispose();
        hudMesh = null; hudTex = null;
      }
      return;
    }
    if (!hudMesh) {
      hudTex = new THREE.CanvasTexture(hud);
      hudTex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false });
      hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      hudMesh.renderOrder = 30;
      hudMesh.position.set(0, 0, -1);
      camera.add(hudMesh);
    } else {
      // A canvas of a DIFFERENT SIZE must not be swapped into a live texture: WebGL2 texture storage is
      // immutable once allocated (texStorage2D), so the upload of a resized canvas lands against the
      // old-size storage and FAILS SILENTLY — the quad then stretches the stale bitmap over the new
      // frame. That was A1: on every resize the banners were faithfully rebuilt at the new size, with a
      // constant font and re-wrapped text, and the rebuild never reached the screen. Recreate the
      // texture whenever the dimensions move; same-size updates keep the cheap image swap.
      const old = hudTex!.image as HTMLCanvasElement;
      if (old.width !== hud.width || old.height !== hud.height) {
        hudTex!.dispose();
        hudTex = new THREE.CanvasTexture(hud);
        hudTex.colorSpace = THREE.SRGBColorSpace;
        (hudMesh.material as THREE.MeshBasicMaterial).map = hudTex;
        (hudMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      } else {
        (hudMesh.material as THREE.MeshBasicMaterial).map!.image = hud;
      }
    }
    hudTex!.needsUpdate = true;
    sizeHud();
  }

  function dispose() {
    disposed = true; cancelAnimationFrame(raf);
    setHud(null);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    controls.dispose(); clearContent(); clearGroup(gridGroup);
    clearBackgroundGroup(); mapBgTex?.dispose(); mapBgTex = null;
    (starfield.geometry as any)?.dispose?.(); (starfield.material as any)?.dispose?.();
    glowTexShared?.dispose(); glowTexShared = null;
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose(); renderer.dispose();
  }

  rebuildGrid();
  return { setData, setGrid, setDistanceScale, setDropLines, setGridSkirt, setGridFalloff, setZExaggeration, setStarScale, setStarSize, setRouteGlow, setMono, setMapGrid, setFlatOverhead, setLockRotation, setBackground, setFraming, setLabelsVisible, setLabelColor, setLabelSize, setLabelFont, setMarkerOptions, setFilter, setHud, setMapBackground, resize, dispose };
}

function buildStarfield(count = 1400, radius = 900): THREE.Points {
  const pos: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    pos.push(radius * Math.sin(ph) * Math.cos(th), radius * Math.sin(ph) * Math.sin(th), radius * Math.cos(ph));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fb4d0, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
}

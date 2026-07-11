// Imperative three.js controller for the holo (3D) Field Guide view. Kept as a plain module (no
// Svelte) so HoloView.svelte can `await import('./scene')` and three lands in its own lazy chunk,
// leaving the 2D app's bundle untouched. See docs/dev/v2.2-3d-design.md Part A.
//
// This pass: a fading polar grid, a glow-billboard star, flat-colour body spheres and heliocentric
// orbit rings positioned via the shared 3D propagator (inclined orbits genuinely tilt out of the
// plane), belts as debris bands, HTML labels, tap-to-select and camera focus. Distances use a
// tunable log "toytown" compression (slider-ready per docs §A10) so packed inner systems don't
// collapse into a blob. Textured/lit spheroids, skins and GPU filters arrive in later increments.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { filterRegistry } from './filters/FilterRegistry';
import { buildShaderObject, updateUniforms } from './filters/shaderMaterial';
import type { FilterParamValues } from './filters/schema';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { propagateState3D } from '$lib/physics/orbits';
import { getNodeColor, getClassColor } from '$lib/rendering/colors';
import { getPlanetTextureEquirect } from '$lib/rendering/planetTexture';
import { oblatePolarFactor } from '$lib/rendering/bodyShape';
import { rendersAsGiant } from '$lib/physics/makeup';
import { deriveAurora, auroraEmitter } from '$lib/physics/aurora';
import { getVisibleNodeIds } from '$lib/system/visibleNodes';
import { AU_KM, G } from '$lib/constants';
import type { System } from '$lib/types';

const HOLO_TINT = 0x39c6ff; // cyan hologram chrome (skins wire in later)

// Body render style: solid, or an 80s vector wireframe — glowing/flat points, see-through or with the
// back hidden (an invisible depth-writing occluder culls the far-side edges).
export type RenderStyle = 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ';
const GRID_RADIUS = 12; // scene units the outermost data maps to
const ORBIT_SAMPLES = 96;
const R0_AU = 0.35; // log-compression softening radius
const DEFAULT_COMPRESSION = 0.65; // 0 = true scale, 1 = fully log-compressed (GM slider later)
const AU_M = 1.495978707e11;
const STAR_RADIUS = 0.5; // scene-unit radius of a star photosphere sphere

export interface HoloController {
  setSystem(system: System | null): void;
  setTime(ms: number): void;
  focusBody(id: string | null): void;
  // The two framing knobs (surface as GM controls later, docs §A8/§A10): angleDeg is the camera's
  // tilt from straight down (0 = overhead top-down, ~64 = the 3/4 default); whole fits the entire
  // system rather than the focused body. overhead + whole = the projector's top-down plan view.
  setFraming(opts: { angleDeg?: number; whole?: boolean }): void;
  setSkybox(on: boolean): void;
  setBackground(bg: string): void; // 'space' | 'green' | 'blue' | 'black' (greenscreen for OBS)
  setCompression(v: number): void; // toytown level 0 (true scale) .. 1 (fully compressed)
  setBeltDetail(v: number): void; // GM belt particle-budget quality 0..1 (performance)
  setBodyStyle(mode: 'textured' | 'flat' | 'white' | 'tint'): void; // colour selection ('tint' = legacy white)
  setRender(mode: RenderStyle): void; // filled spheres vs 80s vector wireframe (see-through / back-occluded)
  setUnlit(on: boolean): void; // flat lighting (no terminator) for the efficient "2D map" look
  setAuroras(on: boolean): void; // show/hide the emissive polar aurora shells
  setBodySize(v: number): void; // 1 readable .. 0 true physical scale
  setGrid(mode: 'off' | 'plain' | 'scaled'): void; // ground reference grid
  setOrbitSpeed(v: number): void; // auto view-orbit turntable speed 0..1 (0 = static)
  setLabelColor(hex: string | null): void; // in-scene label colour (null = default); matched to CRT phosphor
  setLabelSize(px: number): void; // in-scene label font size
  setLabelFont(font: string | null): void; // in-scene label font-family (theme font)
  setLabelsVisible(on: boolean): void; // momentary show/hide of in-scene labels (not saved)
  setHud(canvas: HTMLCanvasElement | null): void; // static info-card overlay, composited INTO the filter
  // GPU post-processing filter (CRT, night-vision, thermal, …) from the ported Mappadux package.
  setFilter(id: string, params?: FilterParamValues): void;
  resetView(): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export interface HoloOptions {
  onSelect?: (id: string) => void; // fired when the viewer taps a body
  skybox?: boolean; // background starfield (default true); a GM-selectable skybox slot later
}

// An in-scene text label: a canvas-textured sprite living in the 3D scene (NOT a DOM overlay) so the
// post-process filter warps/tints it in lockstep with the bodies, and it stays aligned under CRT
// barrel distortion. Drawn once per text/style change; positioned + sized to a constant screen size
// each frame.
interface LabelSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  text: string;
  aspect: number;    // canvas width / height — keeps the sprite from stretching
  heightRatio: number; // canvas full height / on-screen text height — converts labelSizePx to sprite size
}

interface BodyVisual {
  id: string;
  name: string;
  mesh: THREE.Object3D;
  label?: LabelSprite;
  parentId?: string | null;
  satellite: boolean; // a moon: positioned as a magnified offset around its (compressed) parent
  radiusScene?: number; // rendered radius in scene units (so satellites can sit just outside the parent)
  spinPeriodSec?: number; // sidereal rotation period; drives the texture turning
  tiltQuat?: THREE.Quaternion; // fixed axial-tilt rotation, composed with the live spin each frame
  isConstruct?: boolean; // icon sprite: fixed screen size, focus-driven size/dim states
  physRadiusAu?: number; // true physical radius in AU (for detecting surface-locked constructs)
  // A construct sitting AT (or below) its parent's physical surface: glued to a fixed surface point
  // that co-rotates with the planet's spin, instead of following its own (Keplerian) orbit — so it
  // slides over the surface at the planet's rotation rate. dir0 is that point in the parent's local frame.
  surfaceLock?: { dir0: THREE.Vector3 } | null;
  occluderId?: string | null; // body whose shadow can eclipse this one (a moon's parent planet)
  shadow?: { uStarPos: { value: THREE.Vector3 }; uOcc: { value: THREE.Vector4 }; uHasOcc: { value: number } };
}

// A planetary ring: a particle disc in the planet's tilted equatorial plane, spinning DIFFERENTIALLY
// (inner particles orbit faster — that's what makes the rotation visible on an otherwise symmetric
// ring). The pivot carries the tilt + tracks the planet; the particles advance in the local plane.
interface RingVisual {
  pivot: THREE.Group;
  points: THREE.Points;
  parentId: string;
  radii: Float32Array; // per-particle radius in scene units
  baseAng: Float32Array; // per-particle starting angle
  omega: Float32Array; // per-particle angular rate (rad per sim-second) — Keplerian, inner faster
  t0Sec: number; // sim time at build (seconds)
  planetR: number; // rendered planet radius (scene units) — the shadow-casting sphere for ring shadow
  baseColor: THREE.Color; // unshadowed particle tint
}

// A belt orbits the system centre (origin). Each rock advances around the vertical axis at its
// heliocentric Keplerian rate (inner rocks faster). Rocks are split across texture buckets.
interface BeltVisual {
  group: THREE.Group;
  buckets: { points: THREE.Points; basePos: Float32Array; omega: Float32Array }[];
  t0Sec: number;
  id: string; // node id, so the belt is focusable from the selector like a body
  outerScene: number; // outermost rock's horizontal radius (scene units) — used to frame the whole ring
}

// Analytic eclipse shadow: inject a ray–sphere occlusion test into a MeshStandardMaterial. For each
// fragment, a ray to the star is tested against the occluder sphere (a moon's parent planet); a hit
// darkens the direct light, with a soft penumbra from the occluder edge. Cheap (a few instructions),
// no shadow map. Unique cache key per material so onBeforeCompile runs and binds its own uniforms.
let eclipseMatSeq = 0;
function applyEclipseShadow(mat: THREE.MeshStandardMaterial, penumbraFrac: number) {
  const uStarPos = { value: new THREE.Vector3() };
  const uOcc = { value: new THREE.Vector4() };
  const uHasOcc = { value: 0 };
  const uPenumbra = { value: penumbraFrac }; // fraction of the occluder radius; ~0.03 hard, ~0.4 soft
  const cacheId = 'ecl' + eclipseMatSeq++;
  mat.customProgramCacheKey = () => cacheId;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStarPos = uStarPos;
    shader.uniforms.uOcc = uOcc;
    shader.uniforms.uHasOcc = uHasOcc;
    shader.uniforms.uPenumbra = uPenumbra;
    shader.vertexShader = 'varying vec3 vEclWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vEclWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vEclWorld;\nuniform vec3 uStarPos;\nuniform vec4 uOcc;\nuniform float uHasOcc;\nuniform float uPenumbra;\nvoid main() {')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' +
        'if (uHasOcc > 0.5) {\n' +
        '  vec3 toStar = uStarPos - vEclWorld; float dStar = length(toStar); vec3 Ld = toStar / max(dStar, 1e-4);\n' +
        '  vec3 oc = uOcc.xyz - vEclWorld; float tca = dot(oc, Ld);\n' +
        '  if (tca > 0.0 && tca < dStar) {\n' +
        '    float dd = sqrt(max(dot(oc, oc) - tca * tca, 0.0)); float rr = uOcc.w; float pen = uPenumbra * rr + 0.004;\n' +
        '    float sf = smoothstep(rr - pen, rr + pen, dd);\n' +
        '    reflectedLight.directDiffuse *= sf; reflectedLight.directSpecular *= sf;\n' +
        '  }\n' +
        '}');
  };
  return { uStarPos, uOcc, uHasOcc, uPenumbra };
}

// Construct icons: the 2D orrery's glyph vocabulary (triangle/circle/diamond/cross/square in the
// construct's own colour) drawn once to a small canvas and cached per (shape, colour).
const iconCache = new Map<string, THREE.CanvasTexture>();
function getConstructIconTexture(iconType: string | undefined, color: string): THREE.CanvasTexture {
  const shape = iconType || 'triangle';
  const key = `${shape}|${color}`;
  let tex = iconCache.get(key);
  if (tex) return tex;
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  const m = S * 0.14; // margin
  const size = S - 2 * m;
  const cx = S / 2;
  const cy = S / 2;
  if (shape === 'circle') {
    ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, 2 * Math.PI); ctx.fill();
  } else if (shape === 'diamond') {
    ctx.beginPath(); ctx.moveTo(cx, cy - size / 2); ctx.lineTo(cx + size / 2, cy);
    ctx.lineTo(cx, cy + size / 2); ctx.lineTo(cx - size / 2, cy); ctx.closePath(); ctx.fill();
  } else if (shape === 'cross') {
    const t = size / 3;
    ctx.fillRect(cx - t / 2, cy - size / 2, t, size);
    ctx.fillRect(cx - size / 2, cy - t / 2, size, t);
  } else if (shape === 'square') {
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  } else {
    // triangle (default) — bodies are spheres, constructs read as triangles
    ctx.beginPath(); ctx.moveTo(cx, cy - size / 2); ctx.lineTo(cx + size / 2, cy + size / 2);
    ctx.lineTo(cx - size / 2, cy + size / 2); ctx.closePath(); ctx.fill();
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(key, tex);
  return tex;
}

export function createHoloScene(canvas: HTMLCanvasElement, opts: HoloOptions = {}): HoloController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x05070c, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  const HOME_CAM = new THREE.Vector3(0, GRID_RADIUS * 1.1, GRID_RADIUS * 1.4);
  camera.position.copy(HOME_CAM);
  scene.add(camera); // so camera-attached screen overlays (the HUD info card) render via RenderPass

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  const DEFAULT_MIN_DIST = 0.05;
  controls.minDistance = DEFAULT_MIN_DIST; // overview floor; focusBody tightens it to the focused body's size
  controls.maxDistance = GRID_RADIUS * 6;
  controls.minPolarAngle = Math.PI * 0.06; // don't go fully top-down
  controls.maxPolarAngle = Math.PI * 0.49; // or under the table

  // Ground reference grid: 'off' | 'plain' (even polar rings) | 'scaled' (rings at round AU radii,
  // labelled). 'scaled' depends on the live radial map (compression + rMax), so it rebuilds with the
  // system / spread. Built after compressScalar/rMax are defined (rebuildGrid called there + on change).
  let gridMode: 'off' | 'plain' | 'scaled' = 'plain';
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);

  // Background: 'space' (dark, starfield-friendly) or a flat chroma-key colour for the projector's
  // greenscreen (OBS). Starfield only shows over space (chroma keys need a clean flat background).
  const BG_COLORS: Record<string, number> = { space: 0x05070c, green: 0x00b140, blue: 0x0047bb, black: 0x000000 };
  let skyboxOn = opts.skybox !== false;
  let background = 'space';
  const starfield = buildStarfield();
  scene.add(starfield);
  function applyStarfield() { starfield.visible = skyboxOn && background === 'space'; }
  applyStarfield();
  function setSkybox(on: boolean) { skyboxOn = on; applyStarfield(); }
  function setBackground(bg: string) {
    background = bg;
    renderer.setClearColor(BG_COLORS[bg] ?? BG_COLORS.space, 1);
    applyStarfield();
  }

  // Toytown compression 0..1. Body positions read `compression` live, but orbit rings and belt bands
  // bake it at build time, so a change rebuilds the content (focus preserved). Call on slider RELEASE.
  function setCompression(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    if (clamped === compression) return;
    compression = clamped;
    rebuildContent();
  }

  // GM belt-detail quality knob (0..1). Physics density (belt mass) sets each belt's RELATIVE
  // richness; this multiplies the overall particle budget for performance. Rebuilds the belts.
  function setBeltDetail(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    if (clamped === beltDetail) return;
    beltDetail = clamped;
    rebuildContent();
  }

  // Body COLOUR selection: 'textured' (procedural true colour), 'flat' (per-class swatch), 'white'
  // (rely on a screen filter to colour it). Shared by filled + wireframe renders. Rebuilds the bodies.
  function setBodyStyle(mode: 'textured' | 'flat' | 'white' | 'tint') {
    const m = mode === 'tint' ? 'white' : mode; // 'tint' is the legacy name for 'white'
    if (m === bodyStyle) return;
    bodyStyle = m;
    rebuildContent();
  }

  // Render style: filled spheres, or an 80s vector wireframe (glowing or flat points). Rebuilds bodies.
  function setRender(mode: RenderStyle) {
    if (mode === renderStyle) return;
    renderStyle = mode;
    rebuildContent();
  }

  // Flat lighting: unlit bodies (no day/night terminator) for the "2D map" look + efficiency. Rebuilds.
  function setUnlit(on: boolean) {
    if (on === unlit) return;
    unlit = on;
    rebuildContent();
  }

  // Aurora toggle: no rebuild — updateAuroras just stops modulating (opacity 0) when off.
  function setAuroras(on: boolean) { aurorasOn = on; }

  // Orbit-ring colour follows the body COLOUR selection: white → neutral grey, flat → class swatch,
  // textured → the body's own (true) colour.
  function orbitColor(node: any): number {
    if (bodyStyle === 'white') return 0x8a93a0;
    if (bodyStyle === 'flat') return new THREE.Color(getClassColor(node)).getHex();
    return safeColor(node);
  }

  // Body-size dial: 1 = readable log-scaled sizes (default), 0 = true physical radius at the system's
  // true-scale factor (planets become the tiny dots they really are). Blends between the two.
  function setBodySize(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    if (clamped === bodySize) return;
    bodySize = clamped;
    rebuildContent();
  }

  // Rendered sphere radius for a body, blending its readable size toward its true physical size.
  function bodyRadiusScene(node: any, systemLevel: boolean): number {
    const readable = systemLevel ? bodyRadius(node) : Math.min(bodyRadius(node), 0.1);
    if (bodySize >= 0.999) return readable;
    const km = node.physical_parameters?.radiusKm || node.radiusKm || 3000;
    const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax); // physical radius at the true-scale factor
    return Math.max(0.006, trueScene * (1 - bodySize) + readable * bodySize);
  }

  // Rendered star radius: readable STAR_RADIUS at the top of the dial, blending toward its true
  // physical size (a star is still far larger than any planet, so it stays clearly visible).
  function starRadiusScene(node: any): number {
    if (bodySize >= 0.999) return STAR_RADIUS;
    const km = node.physical_parameters?.radiusKm || node.radiusKm || 696000;
    const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax);
    return Math.max(0.02, trueScene * (1 - bodySize) + STAR_RADIUS * bodySize);
  }

  function rebuildContent() {
    const keepFocus = focusedId;
    if (currentSystem) setSystem(currentSystem);
    if (keepFocus) focusBody(keepFocus);
  }

  // Fill light so the night side of a lit body isn't pure black; the star's own light does the
  // day/night terminator (added per-star in setSystem so it tracks the star's position).
  const ambient = new THREE.HemisphereLight(0xaecbff, 0x0a0e16, 0.35);
  scene.add(ambient);

  // --- GPU post-processing filter chain (Mappadux filter package, ported) ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const filterResolution = new THREE.Vector2(1, 1);
  const filterClock = new THREE.Clock();
  let filterPass: ShaderPass | null = null;
  let filterId = 'none';
  let filterParams: FilterParamValues = {};

  function rebuildFilter() {
    if (filterPass) {
      composer.removePass(filterPass);
      (filterPass.material as THREE.Material).dispose();
      filterPass = null;
    }
    const def = filterRegistry.get(filterId);
    if (!def || filterId === 'none') return;
    const params = { ...filterRegistry.defaultParams(filterId), ...filterParams };
    filterPass = new ShaderPass(buildShaderObject(def, params, filterResolution));
    composer.addPass(filterPass);
  }

  function setFilter(id: string, params?: FilterParamValues) {
    const nextId = id || 'none';
    const nextParams = params || {};
    // Same filter, new param values (a slider drag): update the uniforms in place — no pass rebuild,
    // no flicker. A different filter id still rebuilds the pass.
    if (nextId === filterId && filterPass) {
      filterParams = nextParams;
      const def = filterRegistry.get(filterId);
      if (def) updateUniforms(filterPass.uniforms, def, { ...filterRegistry.defaultParams(filterId), ...nextParams });
      return;
    }
    if (nextId === filterId && filterId === 'none') return;
    filterId = nextId;
    filterParams = nextParams;
    rebuildFilter();
  }

  // In-scene body labels are canvas-textured sprites (see LabelSprite) so the post-process filter warps
  // and tints them exactly like the bodies. Colour/font are baked into the canvas (redraw on change);
  // size is applied per-frame via the sprite scale. Visibility is a momentary GM toggle, not saved.
  let labelsVisible = true;
  let labelColor = '#cfefff';
  let labelSizePx = 11;
  let labelFontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  function redrawAllLabels() { for (const b of bodies) if (b.label) drawLabel(b.label); }
  function setLabelColor(hex: string | null) { labelColor = hex || '#cfefff'; redrawAllLabels(); }
  function setLabelSize(px: number) { labelSizePx = Math.max(6, Math.min(40, px)); } // applied via sprite scale
  function setLabelFont(font: string | null) { labelFontFamily = font && font.trim() ? font : 'ui-monospace, SFMono-Regular, Menlo, monospace'; redrawAllLabels(); }
  function setLabelsVisible(on: boolean) { labelsVisible = on; }

  // HUD: a static, pre-rendered canvas (the body info card) shown as a full-screen quad attached to the
  // camera, so it is part of the SAME render the post-process filter processes — it warps, rolls and
  // tints with the GPU shader exactly like the 3D, no CSS fake needed. The canvas draws the panel where
  // it wants (transparent elsewhere); we only re-upload when it changes.
  let hudMesh: THREE.Mesh | null = null;
  let hudTex: THREE.CanvasTexture | null = null;
  function sizeHud() {
    if (!hudMesh) return;
    const d = 1;
    const h = 2 * d * Math.tan((camera.fov * Math.PI) / 360);
    hudMesh.scale.set(h * camera.aspect, h, 1); // cover the frustum at distance d
  }
  function setHud(canvas: HTMLCanvasElement | null) {
    if (!canvas) {
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
      hudTex = new THREE.CanvasTexture(canvas);
      hudTex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, depthWrite: false });
      hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      hudMesh.renderOrder = 30; // above the 3D + labels, still before the post filter
      hudMesh.position.set(0, 0, -1); // 1 unit in front of the camera
      camera.add(hudMesh);
    } else {
      (hudMesh.material as THREE.MeshBasicMaterial).map!.image = canvas;
    }
    hudTex!.needsUpdate = true;
    sizeHud();
  }

  // Build a label sprite for a body and add it to the scene (so the filter processes it). The text is
  // drawn to a canvas at high resolution; on-screen size is set each frame from labelSizePx.
  function makeLabelSprite(text: string): LabelSprite | undefined {
    if (!text) return undefined;
    const canvas = document.createElement('canvas');
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, -0.25); // anchor below the text so the label floats just above the body
    sprite.renderOrder = 999;      // always drawn on top of the bodies
    sprite.visible = false;
    const ls: LabelSprite = { sprite, canvas, text, aspect: 1, heightRatio: 1 };
    drawLabel(ls);
    scene.add(sprite);
    return ls;
  }
  // (Re)render a label's canvas in the current colour/font. Uses a fixed internal font size for
  // crispness — the displayed size comes from the sprite scale, not this.
  function drawLabel(ls: LabelSprite) {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const fontPx = 40;
    const pad = 6;
    const font = `600 ${fontPx}px ${labelFontFamily}`;
    const ctx = ls.canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = font;
    const textW = Math.max(1, Math.ceil(ctx.measureText(ls.text).width));
    const cw = textW + pad * 2;
    const ch = Math.ceil(fontPx * 1.35) + pad * 2;
    ls.canvas.width = Math.max(2, Math.round(cw * dpr));
    ls.canvas.height = Math.max(2, Math.round(ch * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = labelColor;
    ctx.fillText(ls.text, cw / 2, ch / 2);
    ls.aspect = cw / ch;
    ls.heightRatio = ch / fontPx; // sprite full height ÷ text height
    const map = (ls.sprite.material as THREE.SpriteMaterial).map;
    if (map) map.needsUpdate = true;
  }

  // --- Dynamic content ---
  let currentSystem: System | null = null;
  let bodies: BodyVisual[] = [];
  let bodyById = new Map<string, BodyVisual>();
  let ringVisuals: RingVisual[] = [];
  let beltVisuals: BeltVisual[] = [];
  // Aurora emitters (additive), flickering over time; base opacity scales with strength. Filled bodies
  // use a glow shell (MeshBasicMaterial); wireframe bodies use a few emissive polar arcs (LineBasic).
  let auroraVisuals: { mat: THREE.Material & { opacity: number }; base: number; seed: number }[] = [];
  // Orbit path rings, keyed by node id so they can follow the SAME visibility rule as the names
  // ("if you show a name, show an orbit"). Moon rings carry trackParentId to follow the parent.
  let orbitRings: { id: string; obj: THREE.Object3D; trackParentId?: string }[] = [];
  let starLights: { id: string; light: THREE.PointLight }[] = [];
  let starVisuals: { corona: THREE.Sprite; coronaScale: number; activity: number }[] = [];
  let rMax = 1; // largest heliocentric distance in the system (AU), for the compression normaliser
  let compression = DEFAULT_COMPRESSION;
  let beltDetail = 0.6; // GM quality knob: scales belt particle budget (performance), not physics
  let bodyStyle: 'textured' | 'flat' | 'white' = 'textured'; // COLOUR selection: true-colour / class / white
  let unlit = false; // flat lighting (MeshBasic, no terminator) — the efficient "2D map" look
  let aurorasOn = true; // GM toggle: show the emissive polar aurora shells (updateAuroras hides when off)
  let renderStyle: RenderStyle = 'filled'; // filled spheres vs 80s vector wireframe
  let bodySize = 1; // 1 = readable (chunky), 0 = true physical scale (tiny) — fine-tune body sizes
  let timeMs = 0;
  let viewW = 1;
  let viewH = 1;
  const contentGroup = new THREE.Group();
  scene.add(contentGroup);

  const glowTexture = makeGlowTexture();
  const tmp = new THREE.Vector3();
  const proj = new THREE.Vector3();

  // Radial compression: blend a linear map (r -> GRID_RADIUS·r/rMax) with a log map, by `compression`.
  // Log spreads packed inner planets out while keeping the whole system on the grid.
  function compressScalar(r: number): number {
    if (r <= 0) return 0;
    const lin = (GRID_RADIUS * r) / rMax;
    const log = (GRID_RADIUS * Math.log10(1 + r / R0_AU)) / Math.log10(1 + rMax / R0_AU);
    return lin * (1 - compression) + log * compression;
  }

  // Physics frame: reference plane z=0, in-plane x/y. Map to three's ground (x,z) with out-of-plane
  // height on three's up (y), applying the radial compression in AU space first.
  function positionToScene(p: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
    const r = Math.hypot(p.x, p.y, p.z);
    const k = r > 1e-12 ? compressScalar(r) / r : 0;
    return out.set(p.x * k, p.z * k, p.y * k);
  }

  // Round-AU steps for the labelled grid, thinned to ~6 rings spanning the system's extent.
  function gridAuSteps(): number[] {
    const nice = [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500, 1000];
    const within = nice.filter((a) => a <= rMax * 1.02);
    if (within.length <= 6) return within;
    const step = Math.ceil(within.length / 6);
    return within.filter((_, i) => i % step === 0 || i === within.length - 1);
  }

  function ringPoints(radius: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
    return pts;
  }

  function rebuildGrid() {
    clearGroup(gridGroup);
    gridGroup.visible = gridMode !== 'off';
    if (gridMode === 'off') return;
    const base = new THREE.Color(HOLO_TINT);
    if (gridMode === 'scaled') {
      // Concentric rings at round AU distances (mapped through the live compression), each labelled.
      for (const au of gridAuSteps()) {
        const radius = compressScalar(au);
        if (radius <= 0.02) continue;
        const mat = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.4), transparent: true, opacity: 0.55 });
        gridGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPoints(radius)), mat));
        const label = makeGridLabel(au >= 1 ? `${au} AU` : `${au} AU`);
        if (label) { label.position.set(radius, 0.02, 0); gridGroup.add(label); }
      }
    } else {
      // Plain: six evenly-spaced polar rings (decorative, system-independent).
      for (let ri = 1; ri <= 6; ri++) {
        const radius = (GRID_RADIUS / 6) * ri;
        const col = base.clone().multiplyScalar(0.45 * (1 - (ri - 1) / 8));
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 });
        gridGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPoints(radius)), mat));
      }
    }
    // Radial spokes (both modes).
    const spokes: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      spokes.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * GRID_RADIUS, 0, Math.sin(a) * GRID_RADIUS));
    }
    const spokeMat = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.22), transparent: true, opacity: 0.5 });
    gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), spokeMat));
  }

  function setGrid(mode: 'off' | 'plain' | 'scaled') {
    if (mode === gridMode) return;
    gridMode = mode;
    rebuildGrid();
  }
  rebuildGrid();

  // Auto view-orbit ("turntable"): slowly circle the camera around the current target so the focused
  // object rotates in front of the viewer. 0 = static (manual only). Uses OrbitControls' own
  // autoRotate (driven each frame in the loop) so it composes with damping/user input; paused while
  // the focus ease is still tweening so it doesn't fight the framing shot.
  let orbitSpeed = 0;
  function setOrbitSpeed(v: number) {
    orbitSpeed = Math.max(0, Math.min(1, v));
    controls.autoRotateSpeed = orbitSpeed * 4; // full ≈ one revolution per ~15 s
  }

  // --- Selection (raycast pick) + camera focus ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const UP = new THREE.Vector3(0, 1, 0);
  const desiredTarget = new THREE.Vector3();
  const desiredCam = new THREE.Vector3();
  const outward = new THREE.Vector3();
  let focusedId: string | null = null;
  let focusDrive = 0;
  let visibleSet = new Set<string>(); // which body names show, per the orrery focus rule
  let framingAngleRad = (64 * Math.PI) / 180; // camera tilt from vertical (0 = overhead)
  let framingWhole = false; // frame the whole system instead of the focused body

  function setFraming(o: { angleDeg?: number; whole?: boolean }) {
    if (o.angleDeg != null) framingAngleRad = (Math.max(0, Math.min(85, o.angleDeg)) * Math.PI) / 180;
    if (o.whole != null) framingWhole = o.whole;
    // Let the camera actually reach an overhead framing (OrbitControls otherwise clamps the polar).
    controls.minPolarAngle = Math.min(0.06, framingAngleRad);
    focusDrive = 48; // re-ease into the new framing
  }

  const pointer = new AbortController();
  let downX = 0;
  let downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; }, { signal: pointer.signal });
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // a drag = orbit, not a pick
    const rect = canvas.getBoundingClientRect();
    // Shader-space uv of the cursor (y up). If a distorting filter is active the on-screen image is
    // barrel-warped / rolled / skewed by the post-pass, so the body under the cursor actually lives at
    // the shader's SAMPLE uv — apply the same forward transform the shader does before raycasting, so a
    // tap lands where the eye sees the body even mid-roll.
    let su = (e.clientX - rect.left) / rect.width;
    let sv = 1 - (e.clientY - rect.top) / rect.height;
    if (filterPass) {
      const U = filterPass.uniforms as any;
      const warp = U.uCrtWarp?.value ?? 0, roll = U.uPictureRoll?.value ?? 0, skew = U.uSkew?.value ?? 0, t = U.time?.value ?? 0;
      if (warp || roll || skew) {
        const cx = su * 2 - 1, cy = sv * 2 - 1, d = cx * cx + cy * cy;
        su = (cx * (1 + warp * d) + 1) / 2;
        sv = (cy * (1 + warp * d) + 1) / 2;
        sv = sv + t * roll; sv -= Math.floor(sv);      // fract(sv + time*roll)
        su += (sv - 0.5) * skew;
      }
    }
    ndc.x = su * 2 - 1;
    ndc.y = sv * 2 - 1;
    raycaster.setFromCamera(ndc, camera);
    // Recursive: a body's mesh can be a Group (a star's photosphere+corona, a wireframe body), so hits
    // land on a child — walk up to find the owning body.
    const hits = raycaster.intersectObjects(bodies.map((b) => b.mesh), true);
    if (hits.length) {
      let obj: THREE.Object3D | null = hits[0].object;
      let b: BodyVisual | undefined;
      while (obj && !(b = bodies.find((x) => x.mesh === obj))) obj = obj.parent;
      if (b) { opts.onSelect?.(b.id); return; }
    }
    // Tap assist for the tiny construct icons: a 4 px sprite is untappable, so on a raycast miss
    // pick the nearest construct within ~14 px of the tap in screen space (finger-friendly).
    const tapX = e.clientX - rect.left;
    const tapY = e.clientY - rect.top;
    let best: BodyVisual | null = null;
    let bestD = 14 * 14;
    for (const b of bodies) {
      if (!b.isConstruct) continue;
      proj.copy(b.mesh.position).project(camera);
      if (proj.z > 1) continue;
      const sx = (proj.x * 0.5 + 0.5) * viewW;
      const sy = (-proj.y * 0.5 + 0.5) * viewH;
      const d = (sx - tapX) * (sx - tapX) + (sy - tapY) * (sy - tapY);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) opts.onSelect?.(best.id);
  }, { signal: pointer.signal });

  function frameDistance(b: BodyVisual): number {
    if (b.isConstruct) return Math.max(controls.minDistance * 3, 0.5); // icons have no radius; frame close
    const rad = b.radiusScene ?? 0.2; // rendered radius (scales with the body-size dial), NOT a fixed floor
    return Math.max(controls.minDistance * 1.1, rad * 3.4); // fill a good chunk of the view at any scale
  }

  // Constructs render at fixed SCREEN size (sizeAttenuation: false): full-size when the focus rule
  // has them in view (their parent, a sibling, or they are selected — same rule as naming), tiny and
  // dimmed otherwise so distant traffic can never occlude a world. Scale maths: for a unit sprite
  // quad, on-screen px = scale · viewH / (2·tan(fov/2)).
  const CONSTRUCT_PX_FOCUS = 12;
  const CONSTRUCT_PX_IDLE = 4;
  function updateConstructs() {
    const f = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
    for (const b of bodies) {
      if (!b.isConstruct) continue;
      const inFocus = visibleSet.has(b.id);
      (b.mesh as THREE.Sprite).scale.setScalar((inFocus ? CONSTRUCT_PX_FOCUS : CONSTRUCT_PX_IDLE) * f);
      ((b.mesh as THREE.Sprite).material as THREE.SpriteMaterial).opacity = inFocus ? 1 : 0.45;
    }
  }

  // Ease the camera to the configured framing — either the whole system or the focused body — at the
  // configured tilt (angle from vertical). Then keep the target gently centred so a followed body
  // stays in view as it orbits, without fighting the user's own rotate/zoom.
  function driveFocus() {
    const b = !framingWhole && focusedId ? bodies.find((x) => x.id === focusedId) : undefined;
    // A focused belt isn't a body — it's an annulus about the star, framed specially below.
    const beltFocus = !framingWhole && focusedId && !b ? beltVisuals.find((x) => x.id === focusedId) : undefined;
    let dist: number;
    if (b) {
      const bp = b.mesh.position;
      desiredTarget.copy(bp);
      outward.copy(bp);
      const r = outward.length();
      if (r > 1e-4) outward.multiplyScalar(1 / r);
      else outward.set(0, 0, 1); // star at origin: fall back to a fixed azimuth
      dist = frameDistance(b);
    } else if (framingWhole) {
      desiredTarget.set(0, 0, 0);
      outward.set(0, 0, 1); // azimuth reference for the whole-system framing
      dist = GRID_RADIUS * 1.5;
    } else if (focusedId && beltFocus) {
      // A belt/ring-of-debris is centred on the star: keep the star centred and pull back so the
      // whole annulus fits — same overhead-at-angle shot, framed to the ring rather than one body.
      desiredTarget.set(0, 0, 0);
      outward.set(0, 0, 1);
      dist = Math.max(GRID_RADIUS * 0.4, beltFocus.outerScene * 1.9);
    } else {
      // No focus, per-body framing → leave the camera where the user put it. Still drain focusDrive
      // so a stale ease counter doesn't permanently block the auto view-orbit turntable.
      if (focusDrive > 0) focusDrive--;
      return;
    }
    // Camera offset = tilt from vertical: up·cos(angle) + outward·sin(angle). angle 0 => overhead.
    const ca = Math.cos(framingAngleRad);
    const sa = Math.sin(framingAngleRad);
    desiredCam.copy(desiredTarget).addScaledVector(UP, ca * dist).addScaledVector(outward, sa * dist);
    if (focusDrive > 0) {
      controls.target.lerp(desiredTarget, 0.18);
      camera.position.lerp(desiredCam, 0.14);
      focusDrive--;
    } else {
      controls.target.lerp(desiredTarget, 0.08);
    }
  }

  function focusBody(id: string | null) {
    if (id === focusedId) return;
    focusedId = id;
    // Tighten the min-zoom to the focused body's rendered size so a tiny true-scale world can still be
    // brought up large on screen — the viewer doesn't need to know the size to get the right zoom.
    const rad = id ? (bodies.find((x) => x.id === id)?.radiusScene ?? 0) : 0;
    controls.minDistance = id ? Math.max(0.004, Math.min(DEFAULT_MIN_DIST, rad * 1.15)) : DEFAULT_MIN_DIST;
    focusDrive = id ? 48 : 0; // ~0.8 s of easing toward the framed shot
    visibleSet = getVisibleNodeIds(currentSystem, focusedId);
  }

  function resetView() {
    focusedId = null;
    focusDrive = 0;
    controls.minDistance = DEFAULT_MIN_DIST;
    camera.position.copy(HOME_CAM);
    controls.target.set(0, 0, 0);
    visibleSet = getVisibleNodeIds(currentSystem, null);
  }

  // Dispose every geometry/material/texture under a group, then empty it.
  function clearGroup(g: THREE.Object3D) {
    g.traverse((o) => {
      const any = o as any;
      any.geometry?.dispose?.();
      const m = any.material;
      const disposeMat = (mat: any) => { mat?.map?.dispose?.(); mat?.dispose?.(); };
      if (Array.isArray(m)) m.forEach(disposeMat);
      else disposeMat(m);
    });
    g.clear();
  }

  // A billboarded AU tick label for the scaled grid (fixed screen size so it stays legible).
  function makeGridLabel(text: string): THREE.Sprite | null {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    c.width = 128; c.height = 40;
    ctx.font = '600 24px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(180,210,240,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 6, 22);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.9, 0.28, 1);
    sp.center.set(0, 0.5);
    return sp;
  }

  function clearContent() {
    contentGroup.traverse((o) => {
      const any = o as any;
      any.geometry?.dispose?.();
      const m = any.material;
      const disposeMat = (mat: any) => { mat?.map?.dispose?.(); mat?.dispose?.(); };
      if (Array.isArray(m)) m.forEach(disposeMat);
      else disposeMat(m);
    });
    contentGroup.clear();
    for (const b of bodies) {
      if (!b.label) continue;
      scene.remove(b.label.sprite);
      const mat = b.label.sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    bodies = [];
    bodyById = new Map();
    ringVisuals = [];
    beltVisuals = [];
    orbitRings = [];
    starLights = [];
    starVisuals = [];
    auroraVisuals = [];
  }

  function setSystem(system: System | null) {
    clearContent();
    focusedId = null;
    focusDrive = 0;
    currentSystem = system;
    if (!system) return;

    const nodesById = new Map((system.nodes as any[]).map((n) => [n.id, n]));
    const atmPressure = (n: any) => (n?.atmosphere?.pressure_bar ?? n?.atmosphere?.pressure_atm ?? 0);
    // A thick atmosphere softens a shadow's edge. Fluid (gas/ice) giants count — they're all
    // atmosphere — even if no explicit atmosphere pressure is set on the node.
    const softsShadow = (n: any) => !!n && (atmPressure(n) > 0.02 || rendersAsGiant(n));
    const rootId = (system.nodes.find((n) => n.parentId === null) as any)?.id ?? null;
    // "System-level" = one hop from the root, OR a member of a root-level barycentre (so Pluto and
    // binary-star members read as major bodies on their own heliocentric ring, not as satellites).
    const rootBaryIds = new Set((system.nodes as any[]).filter((n) => n.kind === 'barycenter' && n.parentId === rootId).map((n) => n.id));
    const isSystemLevel = (n: any) => n.parentId === rootId || rootBaryIds.has(n.parentId);

    const pos0 = computeWorldPositions3D(system, timeMs);
    rMax = 0;
    for (const p of pos0.values()) rMax = Math.max(rMax, Math.hypot(p.x, p.y, p.z));
    if (rMax <= 0) rMax = 1;
    rebuildGrid(); // scaled AU rings depend on rMax + compression

    for (const node of system.nodes as any[]) {
      // Belts: a debris band on their (compressed) orbit, never a lone sphere.
      if (isBelt(node)) {
        const belt = buildBeltBand(node, positionToScene, beltDetail, timeMs, renderStyle !== 'filled');
        if (belt) { contentGroup.add(belt.group); beltVisuals.push(belt); }
        continue;
      }
      // Planetary rings: a differentially-spinning particle disc around the parent planet.
      if (node.roleHint === 'ring') {
        const parent = nodesById.get(node.parentId);
        if (parent) {
          const rv = buildPlanetRing(node, parent, bodyRadiusScene(parent, isSystemLevel(parent)), beltDetail, timeMs);
          if (rv) { contentGroup.add(rv.pivot); ringVisuals.push(rv); }
        }
        continue;
      }

      const systemLevel = isSystemLevel(node);

      // Orbit path rings — shown under the SAME rule as the body's name (updateOrbitRings). A
      // system-level orbiter gets a heliocentric ring at the origin; a moon gets a ring in its
      // parent's local frame (scaled by the parent's radial compression) that tracks the parent.
      if (node.orbit && node.kind !== 'construct') {
        if (systemLevel) {
          const ring = buildOrbitRing(node, positionToScene, orbitColor(node));
          if (ring) { contentGroup.add(ring); orbitRings.push({ id: node.id, obj: ring }); }
        } else if (node.parentId) {
          const pHelio = pos0.get(node.parentId);
          const rP = pHelio ? Math.hypot(pHelio.x, pHelio.y, pHelio.z) : 0;
          const kP = rP > 1e-9 ? compressScalar(rP) / rP : 0;
          const parentNode = nodesById.get(node.parentId);
          const parentRad = parentNode ? bodyRadiusScene(parentNode, true) : 0;
          const ring = kP > 0 ? buildMoonOrbitRing(node, kP, compressScalar(rP), parentRad, compression, orbitColor(node)) : null;
          if (ring) { contentGroup.add(ring); orbitRings.push({ id: node.id, obj: ring, trackParentId: node.parentId }); }
        }
      }

      if (node.kind === 'barycenter') continue; // barycentres have a ring but no body of their own

      const isStar = node.roleHint === 'star' || (node.kind === 'body' && node.parentId === null);
      const colorHex = safeColor(node);

      let mesh: THREE.Object3D;
      let shadow: BodyVisual['shadow'];
      if (isStar) {
        const activity = Math.max(0, Math.min(1, (node.flareActivity ?? 0)));
        const starR = starRadiusScene(node); // responds to the body-size dial like the planets
        if (renderStyle.startsWith('wire')) {
          // In wireframe modes the star is a wireframe too (no photosphere/corona): flat draws plain
          // non-emissive polys, glow adds the emissive glowing vertices — same as the other bodies.
          const glow = renderStyle === 'wire-glow' || renderStyle === 'wire-glow-occ';
          const occluded = renderStyle === 'wire-glow-occ' || renderStyle === 'wire-flat-occ';
          mesh = buildWireframeBody(starR, colorHex, glow, occluded);
        } else {
          // Photosphere: an emissive (unlit) textured sphere — granulation + sunspots (spot count
          // scales with the star's flare activity), so you see surface detail and it spins.
          const starMat = new THREE.MeshBasicMaterial();
          const st = new THREE.CanvasTexture(makeStarTexture(colorHex, activity, node.id));
          st.colorSpace = THREE.SRGBColorSpace;
          starMat.map = st;
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(starR, 32, 24), starMat);
          mesh = sphere;
          // Corona: an additive halo ringing the photosphere; bigger/brighter for an active star and
          // pulsing (flaring) over time in updateStarFx. Parented to the sphere so it tracks position;
          // the billboard ignores the sphere's spin.
          const coronaMat = new THREE.SpriteMaterial({ map: glowTexture, color: colorHex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
          const corona = new THREE.Sprite(coronaMat);
          const coronaScale = starR * (5 + activity * 4);
          corona.scale.setScalar(coronaScale);
          sphere.add(corona);
          starVisuals.push({ corona, coronaScale, activity });
        }
        // The star casts light regardless of render style: a point light co-located with it gives the
        // planets a real terminator. decay 0 so the compressed distances don't dim the outer planets.
        const light = new THREE.PointLight(colorHex, 2.2, 0, 0);
        contentGroup.add(light);
        starLights.push({ id: node.id, light });
      } else if (node.kind === 'construct') {
        // Constructs: the 2D orrery's icon glyph as a fixed-screen-size sprite (sized per frame by
        // the focus rule in updateConstructs — full when in the focus set, tiny+dim otherwise).
        const mat = new THREE.SpriteMaterial({
          map: getConstructIconTexture(node.icon_type, node.icon_color || '#ffd24d'),
          sizeAttenuation: false, transparent: true, depthTest: true
        });
        mesh = new THREE.Sprite(mat);
      } else {
        // Moons are capped small so they read as satellites; the whole thing scales with bodySize.
        const radius = bodyRadiusScene(node, systemLevel);
        // Colour selection (shared by filled + wireframe): white / class swatch / true colour.
        const selHex = bodyStyle === 'white' ? 0xffffff
          : bodyStyle === 'flat' ? new THREE.Color(getClassColor(node)).getHex()
          : colorHex;
        const polF = oblatePolarFactor((node as any).oblateness); // spin-axis flattening
        const isLopoly = renderStyle === 'lopoly-filled' || renderStyle === 'lopoly-lines';
        if (renderStyle.startsWith('wire')) {
          // 80s vector wireframe: a low-poly globe as edges (+ glowing vertices for the glow modes),
          // see-through or with the far side occluded, in the selected colour. In TRUE-COLOUR mode a
          // world with a coastline also gets rough filled land facets (indicative continents).
          const glow = renderStyle === 'wire-glow' || renderStyle === 'wire-glow-occ';
          const occluded = renderStyle === 'wire-glow-occ' || renderStyle === 'wire-flat-occ';
          const terrain = bodyStyle === 'textured' ? wireTerrain(node) : null;
          const wf = buildWireframeBody(radius, selHex, glow, occluded, terrain);
          if (polF < 0.999) wf.scale.set(1, polF, 1);
          mesh = wf;
          // Wireframe aurora: don't light the whole body — just add a few flickering emissive polar arcs
          // in the aurora colour (true-colour mode only), so it reads as a vector-display aurora.
          if (bodyStyle === 'textured') {
            const aur = deriveAurora(node as any);
            if (aur.strength > 0.06) {
              const wa = buildWireAurora(radius, auroraEmitter(node as any).hex, aur.strength);
              wf.add(wa.group);
              let seed = 0; for (const ch of String(node.id || 'x')) seed = (seed + ch.charCodeAt(0)) % 997;
              for (const m of wa.mats) auroraVisuals.push({ mat: m, base: m.opacity, seed: seed / 997 });
            }
          }
        } else {
          // Filled family: 'filled' = smooth sphere; 'lopoly-*' = a chunky low-poly globe (flat-shaded
          // facets). Unlit mode ('2D map') stays MeshBasic; lo-poly is always lit so the facets read.
          const useUnlit = unlit && !isLopoly;
          const mat = useUnlit ? new THREE.MeshBasicMaterial() : new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: isLopoly });
          if (bodyStyle === 'white') {
            mat.color.set(0xffffff);
          } else if (bodyStyle === 'flat') {
            mat.color.set(selHex);
          } else {
            const texCanvas = getPlanetTextureEquirect(node); // true-colour procedural surface
            if (texCanvas) {
              const t = new THREE.CanvasTexture(texCanvas);
              t.colorSpace = THREE.SRGBColorSpace;
              mat.map = t;
            } else {
              mat.color.set(colorHex);
            }
          }
          // Moons can be eclipse-shadowed by their parent planet (analytic ray-sphere in the shader).
          // Edge is HARD by default; an atmosphere on the moon OR its shadowing planet softens it.
          // Unlit bodies have no lighting to darken, so eclipses are skipped there.
          if (!systemLevel && !unlit) {
            const soft = softsShadow(node) || softsShadow(nodesById.get(node.parentId));
            shadow = applyEclipseShadow(mat as THREE.MeshStandardMaterial, soft ? 0.4 : 0.03);
          }
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, isLopoly ? 16 : 32, isLopoly ? 10 : 24), mat);
          if (polF < 0.999) sphere.scale.set(1, polF, 1);
          mesh = sphere;
          // Lo-poly LINES: keep the filled facets but add glowing edge lines + vertex points on top.
          if (renderStyle === 'lopoly-lines') {
            const lineMat = new THREE.LineBasicMaterial({ color: selHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.LineSegments(new THREE.WireframeGeometry(sphere.geometry), lineMat));
            const dotMat = new THREE.PointsMaterial({ color: selHex, size: Math.max(0.02, radius * 0.13), sizeAttenuation: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.Points(sphere.geometry, dotMat));
          }
          // Aurora: an additive emissive shell glowing at the (tilted) magnetic poles, flickering over
          // time. deriveAurora needs air + a field + ionising flux — returns 0 otherwise, so most bodies
          // add nothing. Parented to the sphere, so it tracks position + axial tilt (spin is harmless —
          // the ovals are polar rings). Skipped in the flat/unlit "2D map" look.
          if (!unlit) {
            const aur = deriveAurora(node as any);
            if (aur.strength > 0.06) {
              const built = buildAuroraShell(radius, auroraEmitter(node as any).hex, aur.strength);
              sphere.add(built.shell);
              let seed = 0; for (const ch of String(node.id)) seed = (seed + ch.charCodeAt(0)) % 997;
              auroraVisuals.push({ mat: built.mat, base: built.base, seed: seed / 997 });
            }
          }
        }
      }
      contentGroup.add(mesh);

      const isConstruct = node.kind === 'construct';
      // Every body gets a label element; which ones actually show is decided per-frame by the focus
      // visibility rule (getVisibleNodeIds) — so a planet's moons name themselves once it's selected.
      const label = makeLabelSprite(String(node.name ?? ''));
      // Spin: sidereal rotation from the data, composed onto a fixed axial tilt each frame. Stars
      // spin too (their sunspots turn); the corona is a billboard child, unaffected by the spin.
      // Constructs are camera-facing sprites — no spin.
      const spinPeriodSec = !isConstruct ? Math.abs(node.rotation_period_hours || 0) * 3600 || undefined : undefined;
      const tiltRad = ((node.axial_tilt_deg || 0) * Math.PI) / 180;
      const tiltQuat = !isConstruct ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltRad) : undefined;
      // A ship mid-journey is positioned absolutely by the transit sampler — never apply the
      // satellite spread to it, or the spread would distort its transit path.
      const inTransit = isConstruct && (node.scheduled_journeys || []).length > 0;
      const radiusScene = isConstruct ? 0 : (isStar ? starRadiusScene(node) : bodyRadiusScene(node, systemLevel));
      const physRadiusAu = isConstruct ? 0 : (node.physical_parameters?.radiusKm || node.radiusKm || (isStar ? 696000 : 3000)) / AU_KM;
      bodies.push({ id: node.id, name: String(node.name ?? ''), mesh, label, parentId: node.parentId, satellite: !systemLevel && !inTransit, radiusScene, physRadiusAu, spinPeriodSec, tiltQuat, isConstruct, occluderId: !systemLevel ? node.parentId : null, shadow });
    }
    bodyById = new Map(bodies.map((b) => [b.id, b]));
    visibleSet = getVisibleNodeIds(system, focusedId);
    updatePositions();
  }

  const tmpParent = new THREE.Vector3();
  function updatePositions() {
    if (!currentSystem) return;
    const positions = computeWorldPositions3D(currentSystem, timeMs);
    for (const b of bodies) {
      const p = positions.get(b.id);
      if (!p) continue;
      const parent = b.satellite && b.parentId ? positions.get(b.parentId) : undefined;
      if (parent) {
        // Satellite (moon or orbiting construct): the magnified log-spaced offset is a READABILITY
        // device that belongs to the toytown end of the scale — so it is weighted by `compression`.
        // At compression 0 (true scale / projector) satellites sit exactly where physics puts them;
        // at the toytown end they fan out so a moon system doesn't collapse onto the planet.
        positionToScene(parent, tmpParent);
        const ox = p.x - parent.x, oy = p.y - parent.y, oz = p.z - parent.z; // AU offset
        const off = Math.hypot(ox, oy, oz);
        const pv = bodyById.get(b.parentId!);
        // Surface-locked construct: it sits AT (or below) the parent's physical surface, so instead of
        // riding its own orbit it glues to a fixed surface point that co-rotates with the planet's spin.
        // Capture that point (in the parent's local frame) once, then leave the per-frame placement to
        // updateSurfaceConstructs. Threshold 3% ≈ keeps genuine LEO orbiters (ISS/Tiangong) orbiting.
        if (b.isConstruct && off > 1e-12 && pv && pv.physRadiusAu && off <= pv.physRadiusAu * 1.03) {
          if (!b.surfaceLock) {
            const sceneDir = tmp.set(ox, oz, oy).normalize(); // same axis-map as the satellite placement
            const dir0 = sceneDir.clone().applyQuaternion(pv.mesh.quaternion.clone().invert());
            b.surfaceLock = { dir0 };
          }
          continue; // updateSurfaceConstructs positions it each frame from the parent's live spin
        }
        b.surfaceLock = null; // moved above the surface again → back to a normal orbiter
        if (off > 1e-12) {
          const parentR = Math.hypot(parent.x, parent.y, parent.z);
          const parentRad = pv?.radiusScene ?? 0;
          const spreadDist = moonSpread(off, compressScalar(parentR), parentRad); // just outside the parent, ramped by true distance
          const trueDist = off * (compressScalar(Math.hypot(p.x, p.y, p.z)) / Math.max(1e-12, Math.hypot(p.x, p.y, p.z))); // offset under the radial map
          const dist = trueDist * (1 - compression) + spreadDist * compression;
          const k = dist / off;
          // axis-map the raw offset (x, z->y, y->z) and add to the compressed parent position
          b.mesh.position.set(tmpParent.x + ox * k, tmpParent.y + oz * k, tmpParent.z + oy * k);
        } else {
          b.mesh.position.copy(tmpParent);
        }
      } else {
        b.mesh.position.copy(positionToScene(p, tmp));
      }
    }
    // Keep each star's light co-located with the star (matters for binaries; the primary sits at 0).
    for (const s of starLights) {
      const sp = positions.get(s.id);
      if (sp) s.light.position.copy(positionToScene(sp, tmp));
    }
  }

  // Orbit rings follow the name rule: visible exactly when the body's name is (getVisibleNodeIds).
  // Moon rings also track their parent's current scene position.
  function updateOrbitRings() {
    for (const r of orbitRings) {
      r.obj.visible = visibleSet.has(r.id);
      if (r.obj.visible && r.trackParentId) {
        const p = bodyById.get(r.trackParentId);
        if (p) r.obj.position.copy(p.mesh.position);
      }
    }
  }

  const labelWorld = new THREE.Vector3();
  function updateLabels() {
    for (const b of bodies) {
      const ls = b.label;
      if (!ls) continue;
      // Focus-rule naming + momentary hide: only visible bodies name themselves.
      if (!labelsVisible || !visibleSet.has(b.id)) { ls.sprite.visible = false; continue; }
      b.mesh.getWorldPosition(labelWorld);
      proj.copy(labelWorld).project(camera);
      if (proj.z > 1) { ls.sprite.visible = false; continue; } // behind the camera
      ls.sprite.visible = true;
      ls.sprite.position.copy(labelWorld);
      (ls.sprite.material as THREE.SpriteMaterial).opacity = b.id === focusedId ? 1 : 0.85;
      // Constant on-screen size. For a sizeAttenuation:false sprite, on-screen px = scale · viewH /
      // (2·tan(fov/2)), so scale = px · 2·tan(fov/2) / viewH (same conversion the constructs use). The
      // full sprite is labelSizePx·heightRatio tall so the TEXT inside lands at labelSizePx.
      const pxToScale = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
      const hFull = labelSizePx * ls.heightRatio * pxToScale;
      ls.sprite.scale.set(hFull * ls.aspect, hFull, 1);
    }
  }

  function setTime(ms: number) {
    timeMs = ms;
    updatePositions();
  }

  // --- Render loop (continuous so OrbitControls damping stays smooth) ---
  let raf = 0;
  let disposed = false;
  const spinQuat = new THREE.Quaternion();
  const spinAxis = new THREE.Vector3(0, 1, 0);
  function updateSpin() {
    const tSec = timeMs / 1000;
    for (const b of bodies) {
      if (!b.tiltQuat || !b.spinPeriodSec) continue;
      const angle = (tSec / b.spinPeriodSec) * Math.PI * 2;
      spinQuat.setFromAxisAngle(spinAxis, angle); // spin about local (pre-tilt) pole
      b.mesh.quaternion.copy(b.tiltQuat).multiply(spinQuat); // tilt the axis, then spin about it
    }
  }

  // Surface-locked constructs (see BodyVisual.surfaceLock): re-glue each to its fixed surface point,
  // rotated by the parent's LIVE spin+tilt, so it rides the rendered surface exactly — right at the
  // rendered radius at any scale, and turning with the planet. Runs AFTER updateSpin (fresh parent
  // quaternion) and reuses the parent's stable scene position (set by updatePositions on time change).
  const _surfDir = new THREE.Vector3();
  function updateSurfaceConstructs() {
    for (const b of bodies) {
      if (!b.surfaceLock || !b.parentId) continue;
      const pv = bodyById.get(b.parentId);
      if (!pv) continue;
      _surfDir.copy(b.surfaceLock.dir0).applyQuaternion(pv.mesh.quaternion);
      b.mesh.position.copy(pv.mesh.position).addScaledVector(_surfDir, pv.radiusScene ?? 0.01);
    }
  }

  // Flaring: an active star's corona pulses (and flickers brighter) over time; a quiet star is steady.
  function updateStarFx(nowSec: number) {
    for (const s of starVisuals) {
      if (s.activity <= 0.01) continue;
      const pulse = 1 + s.activity * (0.1 * Math.sin(nowSec * 2.3) + 0.06 * Math.sin(nowSec * 6.1));
      s.corona.scale.setScalar(s.coronaScale * pulse);
      (s.corona.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.85 + s.activity * 0.15 * (0.5 + 0.5 * Math.sin(nowSec * 9.3)));
    }
  }

  // Aurora shimmer: modulate each shell's opacity around its strength-based base with a couple of
  // out-of-phase sines (per-body seed) for a slow, uneven flicker.
  function updateAuroras(nowSec: number) {
    for (const a of auroraVisuals) {
      if (!aurorasOn) { a.mat.opacity = 0; continue; } // GM toggle off → hide (additive, so opacity 0 = gone)
      const s = 0.5 + 0.5 * (0.62 * Math.sin(nowSec * 2.6 + a.seed * 6.283) + 0.38 * Math.sin(nowSec * 5.9 + a.seed * 12.57));
      a.mat.opacity = a.base * (0.4 + 0.6 * Math.max(0, Math.min(1, s)));
    }
  }

  // Feed each shadow-capable body its occluder (parent planet) sphere + the primary star position,
  // in scene space, so the shader can do its ray–sphere eclipse test.
  const occCenter = new THREE.Vector3();
  function updateShadows() {
    if (!starLights.length) return;
    const starPos = starLights[0].light.position; // primary star (scene coords)
    for (const b of bodies) {
      if (!b.shadow) continue;
      const occ = b.occluderId ? bodyById.get(b.occluderId) : undefined;
      const geo = occ && (occ.mesh as any).geometry;
      if (occ && geo && !occ.isConstruct) {
        occCenter.copy(occ.mesh.position);
        const rr = geo.parameters?.radius ?? 0.2;
        b.shadow.uOcc.value.set(occCenter.x, occCenter.y, occCenter.z, rr);
        b.shadow.uHasOcc.value = 1;
        b.shadow.uStarPos.value.copy(starPos);
      } else {
        b.shadow.uHasOcc.value = 0;
      }
    }
  }

  // Planetary rings: track the planet, advance each particle by its Keplerian rate (inner faster),
  // and darken the arc that falls in the planet's shadow — the planet's own body casts a shadow band
  // across its rings (the classic Cassini look). The shadow test runs in the pivot's local frame,
  // where the planet centre sits at the origin, so we only need the star direction transformed in.
  const _starLocal = new THREE.Vector3();
  const _shadowDir = new THREE.Vector3();
  function updateRings() {
    const t = timeMs / 1000;
    const starWorld = starLights[0]?.light.position;
    for (const rv of ringVisuals) {
      const parent = bodyById.get(rv.parentId);
      if (parent) rv.pivot.position.copy(parent.mesh.position);
      const dt = t - rv.t0Sec;
      const attr = rv.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      // Star direction in the ring's local (tilted) frame; planet centre is the local origin.
      let hasShadow = false;
      if (starWorld) {
        rv.pivot.updateMatrixWorld();
        _starLocal.copy(starWorld);
        rv.pivot.worldToLocal(_starLocal);
        _shadowDir.copy(_starLocal).multiplyScalar(-1); // planet-centre(origin) → away from star
        if (_shadowDir.lengthSq() > 1e-9) { _shadowDir.normalize(); hasShadow = true; }
      }
      const cattr = rv.points.geometry.getAttribute('color') as THREE.BufferAttribute;
      const carr = cattr.array as Float32Array;
      const cr = rv.baseColor.r, cg = rv.baseColor.g, cb = rv.baseColor.b;
      const pr = rv.planetR;
      for (let i = 0; i < rv.radii.length; i++) {
        const ang = rv.baseAng[i] + rv.omega[i] * dt;
        const r = rv.radii[i];
        const x = r * Math.cos(ang);
        const z = r * Math.sin(ang);
        arr[3 * i] = x;
        arr[3 * i + 2] = z;
        let shade = 1;
        if (hasShadow) {
          // Distance behind the planet along the shadow axis, and perpendicular offset from it.
          const along = x * _shadowDir.x + z * _shadowDir.z; // y is ~0 in the flat ring plane
          if (along > 0) {
            const px = x - along * _shadowDir.x;
            const pz = z - along * _shadowDir.z;
            const perp = Math.hypot(px, pz);
            // Umbra inside the planet radius; soft penumbra over a small band beyond it.
            shade = 0.22 + 0.78 * Math.min(1, Math.max(0, (perp - pr) / (pr * 0.35)));
          }
        }
        carr[3 * i] = cr * shade;
        carr[3 * i + 1] = cg * shade;
        carr[3 * i + 2] = cb * shade;
      }
      attr.needsUpdate = true;
      cattr.needsUpdate = true;
    }
  }

  // Belts orbit the system centre (origin): rotate each rock's base position about the vertical axis
  // by its Keplerian rate. Absolute (base × total angle) so there's no drift.
  function updateBelts() {
    const t = timeMs / 1000;
    for (const bv of beltVisuals) {
      const dt = t - bv.t0Sec;
      for (const bk of bv.buckets) {
        const attr = bk.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const base = bk.basePos;
        for (let i = 0; i < bk.omega.length; i++) {
          const ang = bk.omega[i] * dt;
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const x0 = base[3 * i];
          const z0 = base[3 * i + 2];
          arr[3 * i] = x0 * c - z0 * s;
          arr[3 * i + 2] = x0 * s + z0 * c;
        }
        attr.needsUpdate = true;
      }
    }
  }

  function loop() {
    if (disposed) return;
    const nowSec = filterClock.getElapsedTime();
    driveFocus();
    controls.autoRotate = orbitSpeed > 0 && focusDrive === 0; // turntable, paused during the focus ease
    updateSpin();
    updateSurfaceConstructs();
    updateStarFx(nowSec);
    updateAuroras(nowSec);
    updateConstructs();
    updateShadows();
    updateRings();
    updateBelts();
    updateOrbitRings();
    controls.update();
    updateLabels(); // position/size the in-scene label sprites BEFORE rendering so the filter warps them
    if (filterPass) {
      filterPass.uniforms.time.value = nowSec; // drive scanlines/flicker
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  function resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    filterResolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    sizeHud();
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    controls.dispose();
    clearContent();
    clearGroup(gridGroup);
    (starfield.geometry as any)?.dispose?.();
    (starfield.material as any)?.dispose?.();
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose();
    glowTexture.dispose();
    renderer.dispose();
    pointer.abort();
  }

  return { setSystem, setTime, focusBody, setFraming, setSkybox, setBackground, setCompression, setBeltDetail, setBodyStyle, setRender, setUnlit, setAuroras, setBodySize, setGrid, setOrbitSpeed, setLabelColor, setLabelSize, setLabelFont, setLabelsVisible, setHud, setFilter, resetView, resize, dispose };
}

// ---- helpers ----

function isBelt(node: any): boolean {
  return node.roleHint === 'belt';
}

function safeColor(node: any): number {
  try {
    return new THREE.Color(getNodeColor(node)).getHex();
  } catch {
    return 0x9fb4c8;
  }
}

// Non-physical size: stars are billboards; bodies get a small log-scaled sphere so a moon and a gas
// giant differ without the giant swamping the plot.
function bodyRadius(node: any): number {
  const km = node.physical_parameters?.radiusKm || node.radiusKm || 3000;
  return 0.14 + 0.1 * Math.max(0, Math.log10(km / 1000));
}

type Projector = (p: { x: number; y: number; z: number }, out: THREE.Vector3) => THREE.Vector3;

function orbitPeriodMs(orbit: any): number {
  const n = orbit.n_rad_per_s ?? Math.sqrt((orbit.hostMu || 0) / Math.pow((orbit.elements?.a_AU || 1) * AU_M, 3));
  if (!isFinite(n) || n === 0) return 0;
  return Math.abs((2 * Math.PI) / n) * 1000;
}

function buildOrbitRing(node: any, project: Projector, color: number): THREE.LineLoop | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < ORBIT_SAMPLES; i++) {
    project(propagateState3D(node, t0 + (i / ORBIT_SAMPLES) * period).r, v);
    pts.push(v.clone());
  }
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

// The magnified "toytown" distance of a moon from its planet, in scene units. It is a FRACTION of the
// parent's own orbit radius (localScale = compressScalar(parentR)), so a moon system always stays local
// to its planet and never grows into a neighbouring planet's orbit — even for tightly log-packed inner
// planets (the old fixed 0.45 base made Luna's ring nearly reach Venus). The log term still ranks the
// moons by true distance so a moon system reads correctly (Io in … Callisto out).
function moonSpread(off: number, localScale: number, parentRadius: number): number {
  // Sit just OUTSIDE the rendered planet, then ramp out by true distance. Scaling the base to the
  // parent's rendered radius means a surface / low-orbit object hugs a tiny true-scale planet but still
  // clears a chunky readable one — instead of a fixed base that flung close constructs out into "space".
  return parentRadius * 1.15 + localScale * 0.05 * Math.log10(1 + off / 0.0006);
}

// A moon's orbit path, in its PARENT's local scene frame. Each sample is placed with the SAME magnified
// spread transform the moon's own position uses (see the satellite branch in setTime), so the ring sits
// exactly under the moon. kHelio = the parent's radial compression factor (compressScalar(r)/r);
// localScale = the parent's orbit radius in scene units (compressScalar(r)).
function buildMoonOrbitRing(node: any, kHelio: number, localScale: number, parentRadius: number, compression: number, color: number): THREE.LineLoop | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < ORBIT_SAMPLES; i++) {
    const r = propagateState3D(node, t0 + (i / ORBIT_SAMPLES) * period).r; // moon relative to parent (AU)
    const off = Math.hypot(r.x, r.y, r.z);
    if (off < 1e-12) continue;
    const spreadDist = moonSpread(off, localScale, parentRadius);
    const trueDist = off * kHelio;
    const dist = trueDist * (1 - compression) + spreadDist * compression;
    const k = dist / off;
    pts.push(new THREE.Vector3(r.x * k, r.z * k, r.y * k)); // physics(x,y,z) → scene(x,z,y)
  }
  if (pts.length < 3) return null;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

// An equirect aurora texture: coloured curtains at the two polar rings (transparent elsewhere). Under
// additive blending the alpha carries the glow, so bright rings around the poles emit and the rest adds
// nothing. Horizontal streaks give it a curtain-like shimmer.
function makeAuroraTexture(hex: string): HTMLCanvasElement {
  const w = 160, h = 80;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const col = new THREE.Color(hex);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 = north pole .. 1 = south pole
    const ring = (centre: number) => Math.exp(-Math.pow((v - centre) / 0.085, 2)); // gaussian polar oval
    const band = Math.max(ring(0.15), ring(0.85));
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const streak = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(u * Math.PI * 22 + Math.sin(u * 7) * 2)); // curtains
      const a = Math.max(0, Math.min(1, band * streak));
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Wireframe aurora: a FEW emissive polar arcs (line loops near each pole) in the aurora colour, rather
// than an emissive body — the vector-display take on an aurora. Materials returned for the flicker loop.
function buildWireAurora(radius: number, hex: string, strength: number): { group: THREE.Group; mats: THREE.LineBasicMaterial[] } {
  const g = new THREE.Group();
  const mats: THREE.LineBasicMaterial[] = [];
  const col = new THREE.Color(hex);
  const base = Math.min(0.7, 0.24 + strength * 0.4); // subtle — the flicker takes it lower still
  const R = radius * 1.02;
  const theta = (22 * Math.PI) / 180; // colatitude of the auroral oval, measured from the pole
  const ringR = R * Math.sin(theta), y = R * Math.cos(theta);
  for (const sign of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = ringR * (0.9 + 0.1 * Math.sin(a * 5)); // gentle wobble so it reads as a curtain
      pts.push(new THREE.Vector3(Math.cos(a) * rr, sign * y, Math.sin(a) * rr));
    }
    const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: base, blending: THREE.AdditiveBlending, depthWrite: false });
    mats.push(mat);
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return { group: g, mats };
}

// A flickering aurora glow: an additive emissive shell just above the body. `base` opacity scales with
// aurora strength; the render loop shimmers it around that.
function buildAuroraShell(radius: number, hex: string, strength: number): { shell: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: number } {
  const tex = new THREE.CanvasTexture(makeAuroraTexture(hex));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const base = Math.min(0.85, 0.28 + strength * 0.6);
  mat.opacity = base;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 28, 20), mat);
  shell.renderOrder = 2; // draw over the body surface
  return { shell, mat, base };
}

// Land/sea for the vector globe: the true-colour palette's land + ocean stops and the land fraction.
interface WireTerrain { landHex: string; oceanHex: string; landFrac: number; seed: number; }
function wireTerrain(node: any): WireTerrain | null {
  const ap = node.apparentColor;
  if (!ap || (ap.banding || 0) > 0) return null; // no palette, or a banded giant (no continents)
  const palette: any[] = ap.palette || [];
  const surface = palette.find((p) => p.role === 'surface');
  const ocean = palette.find((p) => p.role === 'ocean');
  if (!surface || !ocean) return null; // need both land AND sea for a recognisable coastline
  const cover = Math.min(0.98, Math.max(0, ocean.weight ?? 0)); // ocean coverage fraction
  if (cover < 0.04 || cover > 0.96) return null; // ~all land / ~all ocean → no shapes worth drawing
  let seed = 0; for (const ch of String(node.id || 'x')) seed = (seed + ch.charCodeAt(0)) % 997;
  return { landHex: surface.hex, oceanHex: ocean.hex, landFrac: 1 - cover, seed };
}

// A smooth blobby field over the unit sphere (seeded) → contiguous "continents" once thresholded.
function terrainNoise(x: number, y: number, z: number, seed: number): number {
  const s = seed * 0.61803;
  return Math.sin(x * 1.7 + s) * Math.cos(y * 1.9 + s * 1.3)
    + 0.6 * Math.sin(x * 3.1 + y * 2.2 + s * 2.1) * Math.cos(z * 2.7 + s * 0.7)
    + 0.4 * Math.sin(z * 4.3 + s * 3.3) * Math.sin(y * 3.7 + s);
}

// Filled low-poly LAND facets for the vector globe: classify each triangle land/ocean by the noise
// field (threshold picked so ~landFrac of facets are land), keep the land ones as flat coloured polys
// just inside the wireframe. Chunky + indicative — the continents of an 80s vector display, not a map.
function buildLandPolys(geo: THREE.SphereGeometry, radius: number, t: WireTerrain): THREE.Mesh | null {
  const src = geo.toNonIndexed();
  const pos = src.attributes.position as THREE.BufferAttribute;
  const tri = pos.count / 3;
  const vals = new Float32Array(tri);
  for (let i = 0; i < tri; i++) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cx += pos.getX(i * 3 + k); cy += pos.getY(i * 3 + k); cz += pos.getZ(i * 3 + k); }
    const inv = 1 / (Math.hypot(cx, cy, cz) || 1);
    vals[i] = terrainNoise(cx * inv, cy * inv, cz * inv, t.seed);
  }
  const thr = [...vals].sort((a, b) => a - b)[Math.floor((1 - t.landFrac) * tri)] ?? Infinity;
  const out: number[] = [];
  for (let i = 0; i < tri; i++) {
    if (vals[i] < thr) continue; // ocean facet → left as wireframe
    for (let k = 0; k < 3; k++) out.push(pos.getX(i * 3 + k) * 0.99, pos.getY(i * 3 + k) * 0.99, pos.getZ(i * 3 + k) * 0.99);
  }
  src.dispose();
  if (!out.length) return null;
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return new THREE.Mesh(lgeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(t.landHex) }));
}

// An 80s vector-display body: a low-poly globe drawn as wireframe EDGES. `glow` ALSO draws the vertices
// as brighter additive points (hotter at the points, like a phosphor vector screen); flat is edges
// only. `occluded` adds an invisible depth-writing sphere so the far-side edges are hidden (a solid
// vector globe) instead of see-through. `terrain` fills the land facets so worlds with coastlines show
// rough continents. Returned as a Group so the caller can tilt/scale/spin it.
function buildWireframeBody(radius: number, color: number, glow: boolean, occluded: boolean, terrain?: WireTerrain | null): THREE.Group {
  const g = new THREE.Group();
  const SEG_LON = 16, SEG_LAT = 10;
  const geo = new THREE.SphereGeometry(radius, SEG_LON, SEG_LAT); // low-poly for the faceted vector look
  if (terrain) {
    const land = buildLandPolys(geo, radius, terrain);
    if (land) g.add(land); // opaque, so it also hides the far side behind the continents
  }
  if (occluded) {
    // Depth-only occluder (no colour) so back edges fail the depth test and vanish. It MUST use the
    // SAME faceting as the wireframe and sit just inside it — a rounder/larger sphere would bulge past
    // the flat facets and clip the near-side edges. Matching segments keeps every occluder facet nested
    // parallel-inside its wireframe facet, so only the far side is hidden; the front stays intact.
    const occ = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.97, SEG_LON, SEG_LAT), new THREE.MeshBasicMaterial({ colorWrite: false }));
    g.add(occ);
  }
  const blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: glow ? 0.55 : 0.85, blending, depthWrite: occluded });
  g.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), lineMat));
  if (glow) {
    // Vertices brighter than lines — the vector-screen highlight. Flat modes omit these.
    const dotMat = new THREE.PointsMaterial({ color, size: Math.max(0.02, radius * 0.16), sizeAttenuation: true, transparent: true, opacity: 1, blending, depthWrite: occluded });
    g.add(new THREE.Points(geo, dotMat));
  }
  return g;
}

// A few irregular "rock" silhouette textures so debris reads as chaotic lumps, not square points.
let rockTextures: THREE.CanvasTexture[] | null = null;
function getRockTextures(): THREE.CanvasTexture[] {
  if (rockTextures) return rockTextures;
  rockTextures = [];
  for (let seed = 0; seed < 4; seed++) {
    const S = 32;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    // A lumpy convex-ish polygon = an irregular rock silhouette (white; tinted by the point colour).
    ctx.fillStyle = '#d4d9df';
    ctx.beginPath();
    const n = 7 + Math.floor(rnd() * 4);
    const cx = S / 2;
    const cy = S / 2;
    const baseR = S * 0.32;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = baseR * (0.6 + rnd() * 0.6);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // A darker facet for a hint of shading.
    ctx.fillStyle = 'rgba(70,80,92,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx + (rnd() - 0.5) * S * 0.2, cy + (rnd() - 0.5) * S * 0.2, S * 0.12, S * 0.09, rnd() * Math.PI, 0, 2 * Math.PI);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    rockTextures.push(tex);
  }
  return rockTextures;
}

// Physical SURFACE mass-density (mass / annulus area) → a 0..1 fraction, log10(σ) over ~[-2.5, 7].
// This is what makes a belt/ring read dense or faint: Saturn's rings (σ ~1e7 kg/m²) dominate; a
// gossamer Jupiter ring (σ ~1e3) or a tenuous asteroid belt (σ ~1e-2) is sparse and dim.
function surfaceDensityFrac(massKg: number, innerKm: number, outerKm: number): number {
  if (!(massKg > 0) || !(outerKm > innerKm)) return 0.4;
  const iM = innerKm * 1000;
  const oM = outerKm * 1000;
  const sigma = massKg / (Math.PI * (oM * oM - iM * iM));
  return Math.max(0.08, Math.min(1, (Math.log10(sigma) + 2.5) / 9.5));
}

// Particle budget for a belt/ring. COUNT follows the object's MASS (log 1e20..1e24 kg → 0..1) — more
// stuff, more chunks — so Saturn's massive rings get a LOT of particles while a faint Uranus/Jupiter
// ring gets few (and, spread over its wide annulus, reads correctly THIN). OPACITY tracks the surface
// density so a gossamer ring is also dim. The GM detail slider scales the whole budget.
function particleBudget(massKg: number, innerKm: number, outerKm: number, quality: number): { count: number; opacity: number } {
  const massFrac = massKg > 0 ? Math.max(0, Math.min(1, (Math.log10(massKg) - 20) / 4)) : 0.3;
  const dens = surfaceDensityFrac(massKg, innerKm, outerKm);
  const count = Math.max(40, Math.min(5000, Math.round(3300 * quality * (0.1 + massFrac * 1.4))));
  return { count, opacity: 0.3 + dens * 0.6 };
}

// A belt: a scatter of irregular debris rocks around its (inclined) orbit, radius-jittered into a
// band. Rock COUNT = the belt's physical density (from mass) × the GM `detail` quality knob; the
// radial spread uses the belt's real inner/outer radius. Rocks are split across a few silhouette
// textures at varied sizes/tints so they read as chaotic rubble. Still cheap — point clouds.
function buildBeltBand(node: any, project: Projector, detail: number, timeMs: number, wire: boolean): BeltVisual | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const hostMu = node.orbit.hostMu || 0; // GM of the belt's host (star / barycentre)
  const quality = 0.3 + Math.max(0, Math.min(1, detail)) * 1.7; // GM performance multiplier 0.3..2.0
  const innerKm = node.radiusInnerKm;
  const outerKm = node.radiusOuterKm;
  const { count: COUNT, opacity: rawOpacity } = particleBudget(node.massKg, innerKm, outerKm, quality);
  // A belt is viewed at whole-system scale (far), so a physically-tenuous surface density would wash
  // out to nothing. Lift it to a clearly-readable dust band — density is carried by the rock COUNT.
  const beltOpacity = Math.max(0.72, rawOpacity);
  // Radial band width from the real inner/outer radius, else a ±12% fallback.
  let widthFrac = 0.12;
  if (innerKm > 0 && outerKm > innerKm) widthFrac = (outerKm - innerKm) / (innerKm + outerKm);
  const rocks = getRockTextures();
  const bucketPos: number[][] = rocks.map(() => []);
  const bucketOmega: number[][] = rocks.map(() => []);
  const v = new THREE.Vector3();
  let outerScene = 0; // outermost rock's horizontal radius, for focus framing
  for (let i = 0; i < COUNT; i++) {
    const jitter = 1 + (Math.random() - 0.5) * 2 * widthFrac;
    const r = propagateState3D(node, t0 + Math.random() * period).r;
    const jx = r.x * jitter, jy = r.y * jitter, jz = r.z * jitter;
    project({ x: jx, y: jy, z: jz }, v);
    const hr = Math.hypot(v.x, v.z);
    if (hr > outerScene) outerScene = hr;
    // Each rock advances at its own heliocentric Keplerian rate (inner rocks faster).
    const rM = Math.hypot(jx, jy, jz) * AU_M;
    const om = hostMu > 0 && rM > 0 ? Math.sqrt(hostMu / (rM * rM * rM)) : 0;
    const b = (Math.random() * rocks.length) | 0;
    bucketPos[b].push(v.x, v.y, v.z);
    bucketOmega[b].push(om);
  }
  const sizes = [0.1, 0.15, 0.2, 0.12];
  const tints = [0xc4cdd8, 0xd2c3ab, 0xb3bcc8, 0xcabfa6]; // grey/brown rubble, lifted to read against space
  const group = new THREE.Group();
  const buckets: BeltVisual['buckets'] = [];
  bucketPos.forEach((arr, i) => {
    if (!arr.length) return;
    const pos = new Float32Array(arr);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Wireframe modes simplify the lumpy rock silhouettes to plain small points (vector-display dots).
    const mat = wire
      ? new THREE.PointsMaterial({ color: tints[i], size: sizes[i] * 0.5, sizeAttenuation: true, transparent: true, opacity: beltOpacity })
      : new THREE.PointsMaterial({
          map: rocks[i], color: tints[i], size: sizes[i], sizeAttenuation: true,
          transparent: true, opacity: beltOpacity, alphaTest: 0.25, depthWrite: false
        });
    const points = new THREE.Points(geo, mat);
    group.add(points);
    buckets.push({ points, basePos: new Float32Array(pos), omega: new Float32Array(bucketOmega[i]) });
  });
  return { group, buckets, t0Sec: timeMs / 1000, id: node.id, outerScene };
}

// A static random starfield backdrop: points on a large sphere, drawn at a fixed screen size
// (no distance attenuation) so they read as pinprick stars regardless of zoom.
function buildStarfield(count = 1600, radius = 900): THREE.Points {
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const s = Math.sin(phi);
    pos.push(radius * s * Math.cos(theta), radius * Math.cos(phi), radius * s * Math.sin(theta));
    const b = 0.5 + Math.random() * 0.5; // brightness
    const warm = Math.random() < 0.15; // a few warm/cool tints among mostly white
    col.push(b, b * (warm ? 0.92 : 1), b * (warm ? 0.85 : 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -1; // behind everything
  return pts;
}

// A star photosphere: base colour + faint granulation + sunspots (dark umbra/penumbra), the spot
// count scaling with flare activity. Seeded from the star id so it's stable frame-to-frame.
function makeStarTexture(colorHex: number, activity: number, seedStr: string): HTMLCanvasElement {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let s = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { s ^= seedStr.charCodeAt(i); s = Math.imul(s, 16777619); }
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const base = new THREE.Color(colorHex);
  const css = (f: number) => `rgb(${Math.round(Math.min(255, base.r * 255 * f))},${Math.round(Math.min(255, base.g * 255 * f))},${Math.round(Math.min(255, base.b * 255 * f))})`;

  ctx.fillStyle = css(1);
  ctx.fillRect(0, 0, W, H);
  // Granulation: many faint brighter/darker cells.
  for (let i = 0; i < 480; i++) {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = css(0.85 + rnd() * 0.3);
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 1.5 + rnd() * 3, 0, 2 * Math.PI);
    ctx.fill();
  }
  // Sunspots: a dark umbra inside a lighter penumbra, clustered off the poles. More when active.
  const spots = Math.round(2 + activity * 12);
  for (let i = 0; i < spots; i++) {
    const x = rnd() * W;
    const y = H * (0.22 + rnd() * 0.56);
    const r = 2 + rnd() * 5;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = css(0.55);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = css(0.3);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.85, r * 0.55, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

// A soft round dot for ring particles (icy grains), cached.
let dotTexture: THREE.CanvasTexture | null = null;
function getDotTexture(): THREE.CanvasTexture {
  if (dotTexture) return dotTexture;
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  dotTexture = new THREE.CanvasTexture(c);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  return dotTexture;
}

// A planetary ring as a particle disc in the planet's equatorial plane. Radii from the ring's real
// inner/outer (relative to the planet's rendered size), particle count from the GM detail knob, and
// per-particle Keplerian angular rate so it spins DIFFERENTIALLY (inner faster) — visible motion on
// an otherwise symmetric ring. Positions are advanced each frame in updateRings.
function buildPlanetRing(node: any, parent: any, planetRenderedR: number, detail: number, timeMs: number): RingVisual | null {
  const planetKm = parent.physical_parameters?.radiusKm || parent.radiusKm || 60000;
  let innerScene: number;
  let outerScene: number;
  if (node.radiusInnerKm > 0 && node.radiusOuterKm > node.radiusInnerKm) {
    innerScene = (node.radiusInnerKm / planetKm) * planetRenderedR;
    outerScene = (node.radiusOuterKm / planetKm) * planetRenderedR;
  } else {
    innerScene = planetRenderedR * 1.35;
    outerScene = planetRenderedR * 2.3;
  }
  innerScene = Math.max(innerScene, planetRenderedR * 1.08); // clear the planet surface
  outerScene = Math.min(outerScene, planetRenderedR * 4.5); // don't let a ring dominate
  if (!(outerScene > innerScene)) return null;

  const massKg = parent.massKg || 0; // planet mass — host for the particles' orbital speed
  const quality = 0.3 + Math.max(0, Math.min(1, detail)) * 1.7;
  const { count, opacity: ringOpacity } = particleBudget(node.massKg, node.radiusInnerKm, node.radiusOuterKm, quality);
  const radii = new Float32Array(count);
  const baseAng = new Float32Array(count);
  const omega = new Float32Array(count);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let rn = Math.random();
    if (rn > 0.46 && rn < 0.54) rn = Math.random() * 0.4; // thin Cassini-style gap
    const r = innerScene + rn * (outerScene - innerScene);
    const ang = Math.random() * Math.PI * 2;
    radii[i] = r;
    baseAng[i] = ang;
    const rM = (r / planetRenderedR) * planetKm * 1000; // this particle's physical radius (m)
    omega[i] = massKg > 0 && rM > 0 ? Math.sqrt((G * massKg) / (rM * rM * rM)) : 0.4 * Math.pow(innerScene / r, 1.5);
    pos[3 * i] = r * Math.cos(ang);
    pos[3 * i + 2] = r * Math.sin(ang);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const baseColor = new THREE.Color(0xcdd6e2);
  // Per-particle colour so updateRings can darken the arc that falls in the planet's shadow.
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { colors[3 * i] = baseColor.r; colors[3 * i + 1] = baseColor.g; colors[3 * i + 2] = baseColor.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const size = Math.max(0.008, planetRenderedR * 0.06);
  const mat = new THREE.PointsMaterial({ map: getDotTexture(), vertexColors: true, size, sizeAttenuation: true, transparent: true, opacity: ringOpacity, depthWrite: false });
  const points = new THREE.Points(geo, mat);

  const pivot = new THREE.Group();
  // Ring plane = planet equator: lay the particles' local +Y normal along the planet's spin axis
  // (tilt = rotation about Z by the axial tilt), matching how the planet sphere is tilted.
  const tiltRad = ((parent.axial_tilt_deg || 0) * Math.PI) / 180;
  pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltRad);
  pivot.add(points);
  return { pivot, points, parentId: parent.id, radii, baseAng, omega, t0Sec: timeMs / 1000, planetR: planetRenderedR, baseColor };
}


function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  // A corona HALO: transparent through the centre (so the photosphere sphere shows) with a bright
  // ring just outside it, fading to nothing — additive-blended around the star.
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

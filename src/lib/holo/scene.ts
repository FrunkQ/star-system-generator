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
import { traceConstructIcon, constructIconShape } from '$lib/constructs/constructIcon';
// G3: the focused construct swaps its glyph sprite for its actual hull - loaded from the
// hash-addressed store and built by the SAME display builder as the import modal's preview and
// the info-block turntable, so every surface renders the one approved form.
import { getModel as getStoredModel } from '$lib/constructs/modelStore';
import { parseModel as parseStoredModel } from '$lib/constructs/modelImport';
import { buildDisplayModel } from '$lib/constructs/modelViewer';
import { requestModel } from '$lib/constructs/modelFetch';
import { sampleJourneyKinematicsAtTime } from '$lib/transit/scheduler';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { filterRegistry } from './filters/FilterRegistry';
import { buildShaderObject, updateUniforms } from './filters/shaderMaterial';
import { makeLensingShader, feedDiscEllipse, MAX_LENSES } from './lensingShader';
import { expandRadius, compressRadius, toSceneAbsolute, toSceneRebased, shouldRebase, type RadialMap } from './floatingOrigin';
import type { FilterParamValues } from './filters/schema';
import { isLattice, forSystemScale, type MapOverlay } from '$lib/map/mapOverlay';
import { gridLevels, niceSeries, formatNice } from '$lib/map/niceInterval';
import { NAKED_EYE_LIMIT, type SkyStar, type SkyMode } from '$lib/map/skyStars';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { toParentEquator } from '$lib/system/satelliteFrame';
import { propagateState3D } from '$lib/physics/orbits';
import { getNodeColor, getClassColor } from '$lib/rendering/colors';
import { getPlanetTextureEquirect, getPlanetTexture, getEmissiveEquirect } from '$lib/rendering/planetTexture';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { lightningStrength } from '$lib/physics/cloudDecks'; // shared feature model (WS1)
import {
  makeHotspotTexture, makePlumeTexture, makeGlowTexture,
  buildMagmaVents, buildCryoPlumes, buildSelfLumGlow, buildAtmoGlow, buildCloudDeck, buildTholinHaze, buildDeckStack,
  applyLimbDarkening, buildStellarFlares, updateStellarFlares, makeStarSurfaceTexture, type FlareVisual, updateMagma, updatePlumes, updateLightning, buildLightning, type LightningVisual, accretionColor,
  type EmissiveVisual
} from './bodyFeatures'; // shared emissive builders (also used by the 3D gallery)
import { debrisDensityFrac, debrisBandAlpha, DEBRIS_RING_COLOR, DEBRIS_BELT_COLOR } from '$lib/rendering/debris';
// The ONE click-ladder ruleset, shared with the GM's 2D orrery (viewport/camera). We measure the
// distances in SCENE units and it hands back a half-extent in the same space — so the holo (2D locked
// overhead AND 3D at its configured tilt) frames a click exactly like the orrery does.
import { frameLevelsFrom, firstFrameLevel, nextFrameLevel, prevFrameLevel, frameHalfExtent, autoFrameStep, FRAME_LEVELS } from '$lib/viewport/camera';
import { contextPeerIds, pairContextIds } from '$lib/system/barycentres';
import { activityStrength, flaresVisibly } from '$lib/physics/stellarActivity';
import { perfCount, perfFrame } from '$lib/perfTrace';
import { oblatePolarFactor } from '$lib/rendering/bodyShape';
import { rendersAsGiant } from '$lib/physics/makeup';
import { deriveAurora, auroraEmitter, auroraEmitters } from '$lib/physics/aurora';
import { getVisibleNodeIds } from '$lib/system/visibleNodes';
import { AU_KM, G } from '$lib/constants';
import type { System } from '$lib/types';

const HOLO_TINT = 0x39c6ff; // cyan hologram chrome (skins wire in later)

// Body render style: solid, or an 80s vector wireframe — glowing/flat points, see-through or with the
// back hidden (an invisible depth-writing occluder culls the far-side edges).
export type RenderStyle = 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ';
// NB there is deliberately NO body-graphics knob here. "Body graphics" (photo / procedural disc / flat
// shape) belongs to the INFO BLOCK — the per-body picture — and never to a system map. The scene once
// carried a flat camera-facing-sprite path for it; it was cut so the map cannot draw one at all.
// Belts & rings: individual tumbling rocks, or the GM orrery's flat translucent band.
export type BeltStyle = 'rocks' | 'band';
const GRID_RADIUS = 12; // scene units the outermost data maps to
// Orbit lines are sampled polylines, and the sample count is a TRUE-SCALE accuracy figure, not a
// smoothness one: the body rides the real ellipse while the line is an N-gon cutting inside it, so the
// gap between them oscillates as the body runs vertex-chord-vertex. At 96 samples that chord error on
// Saturn's orbit is ~14 true Saturn radii — invisible under readable body sizes, but at true scale the
// planet visibly floats OFF its own orbit line, and appears to drift on and off it as it moves. 1024
// brings the error under ~0.1 true radii (the line passes through the planet's disc at any framing).
const ORBIT_SAMPLES = 1024;
const R0_AU = 0.35; // log-compression softening radius
const DEFAULT_COMPRESSION = 0.65; // 0 = true scale, 1 = fully log-compressed (GM slider later)
const AU_M = 1.495978707e11;
const STAR_RADIUS = 0.5; // scene-unit radius of a star photosphere sphere

export interface HoloController {
  setSystem(system: System | null): void;
  setTime(ms: number): void;
  focusBody(id: string | null): void;
  stepFocusUp(): boolean; // browser Back: out one ladder level; false = nothing left to step out of
  setFocusLevel(id: string, level: number): void; // follow the GM's ladder: focus + exact framing level
  setViewportAU(cx: number, cy: number, halfExtentAU: number): void; // follow the GM's manual viewport (rough)
  // The two framing knobs (surface as GM controls later, docs §A8/§A10): angleDeg is the camera's
  // tilt from straight down (0 = overhead top-down, ~64 = the 3/4 default); whole fits the entire
  // system rather than the focused body. overhead + whole = the projector's top-down plan view.
  setFraming(opts: { angleDeg?: number; whole?: boolean; fillFrac?: number }): void;
  setSkybox(on: boolean): void;
  // G9: the campaign's OWN charted systems, drawn as real stars in front of the generic starfield.
  // The list is computed outside (map/skyStars) — this scene knows nothing about starmaps, only about
  // directions and magnitudes it has been handed.
  setSkyStars(stars: SkyStar[], mode: SkyMode): void;
  setBackground(bg: string): void; // 'space' | 'green' | 'blue' | 'black' (greenscreen for OBS)
  setCompression(v: number): void; // toytown level 0 (true scale) .. 1 (fully compressed)
  setBeltDetail(v: number): void; // GM belt particle-budget quality 0..1 (performance)
  setBodyStyle(mode: 'textured' | 'flat' | 'white' | 'tint'): void; // colour selection ('tint' = legacy white)
  setRender(mode: RenderStyle): void; // filled spheres vs 80s vector wireframe (see-through / back-occluded)
  setUnlit(on: boolean): void; // flat lighting (no terminator) for the efficient "2D map" look
  setAuroras(on: boolean): void; // show/hide the emissive polar aurora shells
  setFlatOverhead(on: boolean): void; // "2D map": tilt pinned top-down (+ pan enabled). Never a 3D view.
  setLockRotation(on: boolean): void; // fix the heading: no spin by drag, and follow a body by PANNING
  setBeltStyle(mode: BeltStyle): void; // belts/rings as rocks, or the orrery's flat band
  setBodySize(v: number): void; // 1 readable .. 0 true physical scale
  setGrid(mode: MapOverlay): void; // ground reference overlay (shared vocabulary, lib/map/mapOverlay.ts)
  setGridFalloff(v: number): void; // G4: 0 = even brightness, 1 = bright near the centre and gone by the edge
  setOrbitSpeed(v: number): void; // auto view-orbit turntable speed 0..1 (0 = static)
  setLabelColor(hex: string | null): void; // in-scene label colour (null = default); matched to CRT phosphor
  setLabelSize(px: number): void; // in-scene label font size
  setLabelFont(font: string | null): void; // in-scene label font-family (theme font)
  setLabelsVisible(on: boolean): void; // momentary show/hide of in-scene labels (not saved)
  setHud(canvas: HTMLCanvasElement | null): void; // static info-card overlay, composited INTO the filter
  // GPU post-processing filter (CRT, night-vision, thermal, …) from the ported Mappadux package.
  setFilter(id: string, params?: FilterParamValues): void;
  setLensing(on: boolean): void; // stylised black-hole gravitational lensing (§A13)
  setPortrait(colorHex: string | null, fixed?: boolean): void; // isolated-body PORTRAIT key light in the star's
  // colour at a fixed 3/4 angle (camera-relative; `fixed` = WORLD-fixed for a tidally-locked body). null = off.
  setUserSpin(on: boolean): void; // isolated-body thumbnail: allow hand-drag to spin (rotate only, no zoom)
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
  framingParentId?: string | null; // the click-ladder's parent (a construct's UI host, else the real parent)
  satellite: boolean; // a moon: positioned as a magnified offset around its (compressed) parent
  radiusScene?: number; // rendered radius in scene units (so satellites can sit just outside the parent)
  spinPeriodSec?: number; // sidereal rotation period (SIGNED: negative = retrograde); drives the texture turning
  tiltQuat?: THREE.Quaternion; // fixed axial-tilt rotation, composed with the live spin each frame
  isConstruct?: boolean; // icon sprite: fixed screen size, focus-driven size/dim states
  physRadiusAu?: number; // true physical radius in AU (for detecting surface-locked constructs)
  // The construct DECLARES it is on the surface (`placement: 'Surface'`), which outranks the geometric
  // detection below: a declaration is a statement, the radius comparison is only a guess about one.
  surfaceDeclared?: boolean;
  // C3: the PARENT's axial tilt in radians, for rotating this satellite's orbit into the parent's
  // equatorial plane. Zero for a non-satellite, and zero when the orbit declares `frame: 'ecliptic'` —
  // which is a real physical case, not a data error: beyond roughly 50 host radii the Laplace plane
  // hands over from the parent's equator to the system plane, which is why Luna's 5.145 deg is quoted
  // to the ecliptic while Saturn's inner moons are quoted to Saturn's equator.
  orbitTiltRad?: number;
  // A construct sitting AT (or below) its parent's physical surface: glued to a fixed surface point
  // that co-rotates with the planet's spin, instead of following its own (Keplerian) orbit — so it
  // slides over the surface at the planet's rotation rate. dir0 is that point in the parent's local frame.
  surfaceLock?: { dir0: THREE.Vector3 } | null;
  occluderId?: string | null; // body whose shadow can eclipse this one (a moon's parent planet)
  shadow?: { uStarPos: { value: THREE.Vector3 }; uOcc: { value: THREE.Vector4 }; uHasOcc: { value: number } };
  isBH?: boolean; // a black hole — a lensing centre for the gravitational-lensing pass
  tidallyLocked?: boolean; // keeps one face toward its parent — orientation is geometry-locked, not free-spun
  isStar?: boolean;          // role for the pixel-floor hierarchy (star > planet > moon)
  baseScale?: THREE.Vector3; // the mesh scale set at build (oblateness); the true-scale floor multiplies it
  screenK?: number;          // current true-scale visibility multiplier (1 = drawing at its real size)
  // G3: the construct's 3D hull, shown IN PLACE OF the glyph sprite while this construct is the
  // focus (design §6: the model is the marker, nothing more). Oriented nose-first along its motion
  // (ModelRef convention: nose +Z, drive -Z). Contributes NO radius to clearance or framing.
  shipModel?: THREE.Group | null;
  shipPrev?: THREE.Vector3;  // last frame's position, for the motion direction
  shipFx?: ShipFx | null;    // the drive plume at the stern, driven by the sampled burn
  shipLen?: number;          // the model's long axis in scene units (dial-blended; feeds LOD + framing)
}

interface ShipFx { holder: THREE.Group; cone: THREE.Mesh; glow: THREE.Sprite; light: THREE.PointLight }

// A planetary ring: a particle disc in the planet's tilted equatorial plane, spinning DIFFERENTIALLY
// (inner particles orbit faster — that's what makes the rotation visible on an otherwise symmetric
// ring). The pivot carries the tilt + tracks the planet; the particles advance in the local plane.
interface RingVisual {
  pivot: THREE.Group;
  points: THREE.Points | null; // null for the flat BAND style (no particles to advance)
  bandMesh?: THREE.Mesh | null; // the flat annulus (band style) — shaded per-vertex by the planet's shadow
  parentId: string;
  radii: Float32Array; // per-particle radius in scene units
  baseAng: Float32Array; // per-particle starting angle
  omega: Float32Array; // per-particle angular rate (rad per sim-second) — Keplerian, inner faster
  t0Sec: number; // sim time at build (seconds)
  planetR: number; // rendered planet radius (scene units) — the shadow-casting sphere for ring shadow
  baseColor: THREE.Color; // unshadowed particle tint
  emissiveBase?: Float32Array; // per-particle rgb for a SELF-LUMINOUS disc (a BH accretion disc, temp-
                               // graded hot-inner→red-outer). When present, updateRings paints it
                               // directly (no planet-shadow shading — the disc glows).
}

// A belt orbits the system centre (origin). Each rock advances around the vertical axis at its
// heliocentric Keplerian rate (inner rocks faster). Rocks are split across texture buckets.
interface BeltVisual {
  group: THREE.Group;
  buckets: { points: THREE.Points; basePos: Float32Array; omega: Float32Array }[];
  t0Sec: number;
  id: string; // node id, so the belt is focusable from the selector like a body
  outerScene: number; // outermost rock's horizontal radius (scene units) — used to frame the whole ring
  // The belt's host body. Rocks are baked HOST-relative (the builders sample the belt's own orbit), so
  // the group rides the host's rendered position — a no-op for a star at the origin, but essential when
  // the host itself orbits something (a binary member, or a star knocked off-centre by a stellar
  // barycentre) or the belt smears into a torus spinning about the wrong centre.
  parentId?: string | null;
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
  // The ONE glyph vocabulary (inbox A34). This used to be a private copy of the same five shapes;
  // it agreed with the canonical one only because nobody had added a sixth shape yet.
  traceConstructIcon(ctx, constructIconShape(shape), S / 2, S / 2, size);
  ctx.fill();
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(key, tex);
  return tex;
}

export function createHoloScene(canvas: HTMLCanvasElement, opts: HoloOptions = {}): HoloController {
  // preserveDrawingBuffer keeps the last frame readable after it is presented, which is what lets a
  // caller drawImage() this canvas into another one. Without it a WebGL canvas captured outside its
  // own render callback comes back BLANK — and that capture is how the body graphic gets INSIDE the
  // document's filter pass rather than being composited, unfiltered, on top of it (inbox A38).
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x05070c, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  // Background as scene.background (a colour-managed Color), NOT renderer.setClearColor: a bare clear
  // colour is written to the composer's LINEAR render target without the sRGB->linear decode, so the
  // OutputPass then sRGB-encodes it and lifts the near-black navy into a visibly brighter blue — but
  // ONLY on the composer path (i.e. when a black hole's lensing pass is active). scene.background is
  // decoded consistently whether rendering straight to the canvas or through the composer, so the
  // background matches on both paths. (Proven: clear-colour 5,7,12 -> 38,46,61 via composer; fixed.)
  scene.background = new THREE.Color(0x05070c);
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
  let gridMode: MapOverlay = 'plain';
  // G4: distance falloff on the ground grid, 0 = even brightness (the historical look, and the
  // default here so this view does not change unasked) .. 1 = bright near the centre, gone by the
  // edge of the disc. Alpha is computed from the ABSOLUTE vertex positions, which is what makes it
  // safe under the floating origin: rebasing moves the drawn coordinates, never the absolute ones,
  // so the fade stays pinned to the system rather than sliding with the camera focus.
  let gridFalloff = 0;
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);
  // Absolute float64 masters for the grid's lines and its AU tick labels, so a floating-origin rebase
  // re-emits them instead of rebuilding (the labels are canvas textures; rebuilding churns them). A grid
  // ring can run right past the focused body — at true scale the outermost one sits at rMax, which for
  // Sol is Pluto — so it has to be as steady as the orbit lines are.
  let gridAbs: { obj: THREE.Object3D; abs: Float64Array }[] = [];
  let gridLabels: { sprite: THREE.Sprite; abs: [number, number, number] }[] = [];

  // Background: 'space' (dark, starfield-friendly) or a flat chroma-key colour for the projector's
  // greenscreen (OBS). Starfield only shows over space (chroma keys need a clean flat background).
  const BG_COLORS: Record<string, number> = { space: 0x05070c, green: 0x00b140, blue: 0x0047bb, black: 0x000000 };
  let skyboxOn = opts.skybox !== false;
  let background = 'space';
  const starfield = buildStarfield();
  scene.add(starfield);
  function applyStarfield() { starfield.visible = skyboxOn && background === 'space'; }
  applyStarfield();
  function setSkybox(on: boolean) { skyboxOn = on; applyStarfield(); rebuildSkyStars(); }

  // --- G9: THE CAMPAIGN'S OWN STARS -------------------------------------------------------------
  //
  // Far-field, and that is what makes this cheap: a charted system is a DIRECTION and nothing else, so
  // it goes on a sphere at a fixed radius and never touches the floating origin, the rebase or any of
  // the precision work A19 needed. The generic starfield stays exactly as it was and becomes the
  // backdrop these sit in front of.
  //
  // Just inside the backdrop's 900 so the two cannot z-fight, and rendered after it. Both are far
  // beyond anything in the system, so neither is ever occluded by the orrery.
  const SKY_RADIUS = 860;
  // Sprites rather than one Points cloud, because size and colour are PER STAR here — the whole point
  // is that a derived magnitude is visible — and a dozen sprites is nothing. The backdrop stays a
  // Points cloud because its 1,600 members are all alike.
  const skyGroup = new THREE.Group();
  skyGroup.renderOrder = -1; // in front of the backdrop (-1 too, added first), behind everything else
  scene.add(skyGroup);
  let skyStars: SkyStar[] = [];
  let skyMode: SkyMode = 'off';

  /**
   * Magnitude to a 0..1 brightness. The scale runs from the naked-eye limit down to about Sirius, so
   * the whole visible range is used rather than everything piling up at one end.
   */
  const skyBrightness = (m: number) => Math.max(0, Math.min(1, (NAKED_EYE_LIMIT - m) / (NAKED_EYE_LIMIT + 1.5)));

  // A soft round star image, and the four-vane DIFFRACTION CROSS for the marked mode. Both cached: one
  // texture each, whatever the sky holds.
  let skyDotTex: THREE.CanvasTexture | null = null;
  let skySpikeTex: THREE.CanvasTexture | null = null;
  function skyDot(): THREE.CanvasTexture {
    if (skyDotTex) return skyDotTex;
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    skyDotTex = new THREE.CanvasTexture(c);
    skyDotTex.colorSpace = THREE.SRGBColorSpace;
    return skyDotTex;
  }
  function skySpike(): THREE.CanvasTexture {
    if (skySpikeTex) return skySpikeTex;
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    // Four vanes tapering to nothing, drawn as gradients so the cross fades out rather than stopping.
    // A real secondary-mirror support throws exactly four; anything else would look like a sparkle.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const g = ctx.createLinearGradient(S / 2, S / 2, S / 2 + dx * S / 2, S / 2 + dy * S / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(S / 2, S / 2);
      ctx.lineTo(S / 2 + dx * S / 2, S / 2 + dy * S / 2);
      ctx.stroke();
    }
    skySpikeTex = new THREE.CanvasTexture(c);
    skySpikeTex.colorSpace = THREE.SRGBColorSpace;
    return skySpikeTex;
  }

  function rebuildSkyStars() {
    clearGroup(skyGroup);
    skyGroup.visible = skyMode !== 'off' && skyboxOn && background === 'space';
    if (!skyGroup.visible || !skyStars.length) return;
    const marked = skyMode === 'marked';
    for (const st of skyStars) {
      const b = skyBrightness(st.magnitude);
      // PHYSICS (x, y, z) -> SCENE (x, z, y), the same axis convention positionToScene uses. The
      // starmap's own plane IS the system's reference plane; there is no other frame to relate them
      // by, and both maps already treat map-z as height.
      const pos = new THREE.Vector3(st.dir.x, st.dir.z, st.dir.y).multiplyScalar(SKY_RADIUS);
      const col = new THREE.Color(st.color);
      // World-space size, not screen-space: at a fixed 860 the camera's own wander of a few tens of
      // units changes the angular size by ~3%, so a per-frame resize would buy nothing.
      const size = 3.2 + 9.5 * b;
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({
        map: skyDot(), color: col, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, opacity: 0.45 + 0.55 * b
      }));
      dot.position.copy(pos);
      dot.scale.setScalar(size);
      skyGroup.add(dot);
      if (!marked) continue;
      // SPIKES SCALE WITH BRIGHTNESS, longer on the brighter stars exactly as real astrophotography
      // does — which is what turns the derived magnitude from merely correct into readable.
      const spike = new THREE.Sprite(new THREE.SpriteMaterial({
        map: skySpike(), color: col, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, opacity: 0.3 + 0.5 * b
      }));
      spike.position.copy(pos);
      spike.scale.setScalar(size * (2.6 + 4.4 * b));
      skyGroup.add(spike);
      // Names belong to the ANNOTATED mode only. In `true` the whole point is that these are
      // indistinguishable from the sky, and a floating name would give the game away.
      const label = makeGridLabel(st.name);
      if (label) {
        label.position.copy(pos).add(new THREE.Vector3(size * 0.9, size * 0.5, 0));
        label.scale.multiplyScalar(SKY_RADIUS * 0.028);
        skyGroup.add(label);
      }
    }
  }

  function setSkyStars(stars: SkyStar[], mode: SkyMode) {
    const nextMode: SkyMode = mode ?? 'off';
    // Cheap identity check first: this is re-applied on every prop change and the list is rebuilt by
    // the caller each time, so comparing contents keeps a reactive block from thrashing the geometry.
    const same = nextMode === skyMode && stars.length === skyStars.length
      && stars.every((s, i) => s.id === skyStars[i].id && s.magnitude === skyStars[i].magnitude);
    if (same) return;
    skyStars = stars ?? [];
    skyMode = nextMode;
    rebuildSkyStars();
  }
  function setBackground(bg: string) {
    background = bg;
    // The charted stars share the backdrop's rule — they only make sense over space, never over a
    // chroma key — so they follow it here rather than being left visible on a green screen.
    queueMicrotask(() => rebuildSkyStars());
    // Named preset, OR a raw #rrggbb (used when the holo is embedded — e.g. the Guide document's 3D body
    // graphic — so its ground matches the surrounding page instead of the default navy).
    const named = BG_COLORS[bg];
    (scene.background as THREE.Color).set(named ?? (typeof bg === 'string' && bg[0] === '#' ? bg : BG_COLORS.space));
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


  // Belts & rings: tumbling rocks vs the GM orrery's flat band. Rebuilds.
  function setBeltStyle(mode: BeltStyle) {
    if (mode === beltStyle) return;
    beltStyle = mode;
    rebuildContent();
  }

  // Orbit-ring colour follows the body COLOUR selection: white → neutral grey, flat → class swatch,
  // textured → the body's own (true) colour.
  function orbitColor(node: any): number {
    if (bodyStyle === 'white') return 0x8a93a0;
    if (bodyStyle === 'flat') return new THREE.Color(getClassColor(node)).getHex();
    return safeColor(node);
  }

  // A CONSTRUCT's orbit takes its own glyph colour, lightened, so the line reads as belonging to the
  // station rather than to a world (the same tie the player starmap makes between a route and its name).
  // Under the 'white' body-colour selection everything is deliberately neutral so a screen filter has one
  // palette to tint — an amber line through a monochrome skin would break that, so match the grey instead.
  const CONSTRUCT_ORBIT_LIGHTEN = 0.45; // toward white
  const _white = new THREE.Color(0xffffff);
  function constructOrbitColor(node: any): number {
    let base = 0xffd24d; // the glyph's own default amber
    if (bodyStyle === 'white') base = 0x8a93a0;
    else if (node.icon_color) { try { base = new THREE.Color(node.icon_color).getHex(); } catch { /* keep the default */ } }
    return new THREE.Color(base).lerp(_white, CONSTRUCT_ORBIT_LIGHTEN).getHex();
  }
  /** One entry point for every orbit line, so a construct can never be coloured as a world by mistake. */
  function ringColor(node: any): number {
    return node.kind === 'construct' ? constructOrbitColor(node) : orbitColor(node);
  }

  // Body-size dial: 1 = readable log-scaled sizes (default), 0 = true physical radius at the system's
  // true-scale factor (planets become the tiny dots they really are). Blends between the two.
  function setBodySize(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    if (clamped === bodySize) return;
    bodySize = clamped;
    if (!focusedId) controls.minDistance = unfocusedMinDist(); // the zoom floor is scale-dependent
    rebuildContent();
  }

  // How far a SPRITE is allowed to shrink as the body-size dial leaves "readable". The scene draws a
  // good deal that is a marker rather than geometry — wireframe vertex dots, belt rubble, ring particles
  // — and each of those sizes was picked for the readable end and then used at every setting. At TRUE
  // scale a real body shrinks by three or four orders of magnitude and the sprites did not follow, so
  // the planets sat under a wall of boulders lying across their own orbits. They now shrink with the
  // dial, stopping at 2%, below which a belt would cease to exist rather than read as fine dust.
  // NB sprites ONLY. The minimum body radius is not a sprite: the camera is sized off it, so scaling it
  // down puts the framing distance inside the near plane. Body visibility is a screen-space job.
  function markerScale(): number {
    return bodySize >= 0.999 ? 1 : Math.max(0.02, bodySize);
  }

  // Rendered sphere radius for a body, blending its readable size toward its true physical size.
  function bodyRadiusScene(node: any, systemLevel: boolean): number {
    const readable = systemLevel ? bodyRadius(node) : Math.min(bodyRadius(node), 0.1);
    if (bodySize >= 0.999) return readable;
    const km = node.physical_parameters?.radiusKm || node.radiusKm || 3000;
    const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax); // physical radius at the true-scale factor
    // NO scene-unit floor. This is the GM orrery's model, which is the gold standard for actual size:
    // the body's TRUE radius in world units, with visibility guaranteed by a per-role PIXEL floor at
    // draw time (updateTrueScaleFloor). A floor in scene units destroys the very thing true scale is
    // for — 0.006 sat above every real body's true radius (Earth 1.1e-5, even Sol 1.2e-3), so Sol,
    // Jupiter, Earth and Luna all drew at the identical clamped size. The camera adapts instead: the
    // near plane and minimum zoom follow the framed body's size (see the render loop / focusBody).
    return Math.max(1e-7, trueScene * (1 - bodySize) + readable * bodySize);
  }

  // Rendered star radius: readable STAR_RADIUS at the top of the dial, blending toward its true
  // physical size (a star is still far larger than any planet, so it stays clearly visible).
  function starRadiusScene(node: any): number {
    if (bodySize >= 0.999) return STAR_RADIUS;
    const km = node.physical_parameters?.radiusKm || node.radiusKm || 696000;
    const trueScene = (km / AU_KM) * (GRID_RADIUS / rMax);
    return Math.max(1e-7, trueScene * (1 - bodySize) + STAR_RADIUS * bodySize); // true size; pixel floor at draw time (see bodyRadiusScene)
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

  // Isolated-body PORTRAIT key light: when the document's body thumbnail frames a single planet there is
  // no star node to cast a terminator, so a fabricated star would drag in a stray sphere + corona and skew
  // the aurora flux. Instead a dedicated directional key — coloured by the real star ("the sun provides the
  // colour") — is placed each frame at a fixed 3/4 angle RELATIVE TO THE CAMERA (offscreen, upper-front-
  // side) so the framed body always reads as mostly day with a sliver of night whatever the turntable does.
  let portraitLight: THREE.DirectionalLight | null = null;
  let portraitOn = false;
  let portraitFixed = false; // tidally-locked: light held in WORLD space so the same face stays lit
  const _portR = new THREE.Vector3();
  const _portU = new THREE.Vector3();
  const _portF = new THREE.Vector3();
  function setPortrait(colorHex: string | null, fixed = false) {
    portraitOn = !!colorHex;
    portraitFixed = fixed;
    if (colorHex) {
      if (!portraitLight) {
        portraitLight = new THREE.DirectionalLight(0xffffff, 2.4);
        scene.add(portraitLight);
        scene.add(portraitLight.target);
      }
      portraitLight.color.set(colorHex);
      portraitLight.visible = true;
    } else if (portraitLight) {
      portraitLight.visible = false;
    }
  }
  function updatePortraitLight() {
    if (!portraitLight) return;
    portraitLight.target.position.copy(controls.target);
    if (portraitFixed) {
      // WORLD-fixed key (tidally-locked body): a constant direction, so as the turntable orbits the
      // camera the same physical hemisphere stays lit — the permanent day side sweeps to night correctly.
      portraitLight.position.copy(controls.target).add(_portF.set(3, 1.4, 2));
      return;
    }
    _portR.setFromMatrixColumn(camera.matrixWorld, 0); // camera right
    _portU.setFromMatrixColumn(camera.matrixWorld, 1); // camera up
    _portF.subVectors(camera.position, controls.target).normalize(); // toward the camera
    // Front-dominant (day fills most of the disc) with a side+up offset so one limb falls into night.
    portraitLight.position.copy(controls.target)
      .addScaledVector(_portF, 1.0).addScaledVector(_portR, 0.5).addScaledVector(_portU, 0.4);
  }

  // --- GPU post-processing filter chain (Mappadux filter package, ported) ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Black-hole gravitational lensing pass (§A13). Sits BEFORE the CRT filter so the scene is lensed and
  // then the filter treats the lensed image. Disabled unless a preset turns it on AND a hole is on screen.
  const lensingPass = new ShaderPass(makeLensingShader());
  lensingPass.enabled = false;
  composer.addPass(lensingPass);
  let lensingOn = false;
  // Final sRGB/tone-map — needed so a composer render (lensing on, no CRT filter) matches the direct
  // renderer.render output. DISABLED while a CRT filter is active: the filter stays the last pass and
  // owns the output exactly as before (so filtered views are unchanged).
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
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
    if (!def || filterId === 'none') { outputPass.enabled = true; return; }
    const params = { ...filterRegistry.defaultParams(filterId), ...filterParams };
    filterPass = new ShaderPass(buildShaderObject(def, params, filterResolution));
    composer.insertPass(filterPass, composer.passes.length - 1); // before the OutputPass
    outputPass.enabled = false; // the CRT filter is the final pass now — output unchanged from before
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
      // A canvas of a DIFFERENT SIZE must not be swapped into a live texture: WebGL2 texture storage is
      // immutable once allocated (texStorage2D), so the upload of a resized canvas lands against the
      // old-size storage and FAILS SILENTLY — the quad then stretches the stale bitmap over the new
      // frame. That was A1: on every resize the banners were faithfully rebuilt at the new size, with a
      // constant font and re-wrapped text, and the rebuild never reached the screen. Recreate the
      // texture whenever the dimensions move; same-size updates keep the cheap image swap.
      const old = hudTex!.image as HTMLCanvasElement;
      if (old.width !== canvas.width || old.height !== canvas.height) {
        hudTex!.dispose();
        hudTex = new THREE.CanvasTexture(canvas);
        hudTex.colorSpace = THREE.SRGBColorSpace;
        (hudMesh.material as THREE.MeshBasicMaterial).map = hudTex;
        (hudMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      } else {
        (hudMesh.material as THREE.MeshBasicMaterial).map!.image = canvas;
      }
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
    const newW = Math.max(2, Math.round(cw * dpr));
    const newH = Math.max(2, Math.round(ch * dpr));
    const resized = ls.canvas.width !== newW || ls.canvas.height !== newH;
    ls.canvas.width = newW;
    ls.canvas.height = newH;
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
    // Same immutable-storage rule as the HUD (see setHud): resizing the canvas element does NOT resize
    // the GL texture storage behind it, so a label whose pixel size changed (new font, new text width)
    // needs a fresh texture or its update silently never lands.
    const smat = ls.sprite.material as THREE.SpriteMaterial;
    if (resized || !smat.map) {
      smat.map?.dispose();
      smat.map = new THREE.CanvasTexture(ls.canvas);
      smat.needsUpdate = true;
    } else {
      smat.map.needsUpdate = true;
    }
  }

  // --- Dynamic content ---
  let currentSystem: System | null = null;
  let bodies: BodyVisual[] = [];
  let bodyById = new Map<string, BodyVisual>();
  // Barycentre members: bodyId → the largest CO-MEMBER's rendered radius. A barycentre is an empty
  // point, so the usual parent-globe clearance is zero there — in readable mode Charon vanished
  // INSIDE Pluto. Each member instead clears its partner (both push outward along their own — mutually
  // opposite — offsets, so the pair's separation always exceeds the sum of the rendered radii).
  let baryCoR = new Map<string, number>();
  // A barycentre has a ring but no mesh, so its members' rings cannot track it through `bodyById`. This
  // holds each barycentre's rendered scene point, refreshed with the bodies in updatePositions.
  let baryScene = new Map<string, THREE.Vector3>();
  let ringVisuals: RingVisual[] = [];
  let beltVisuals: BeltVisual[] = [];
  // Aurora emitters (additive), flickering over time; base opacity scales with strength. Filled bodies
  // use a glow shell (MeshBasicMaterial); wireframe bodies use a few emissive polar arcs (LineBasic).
  let auroraVisuals: { mat: THREE.Material & { opacity: number }; base: number; seed: number }[] = [];
  // Volcanic vent glows + cryovolcanic plumes (shared EmissiveVisual from ./bodyFeatures): additive
  // sprites whose opacity is flickered/glistened each frame by updateMagma / updatePlumes.
  let magmaVisuals: EmissiveVisual[] = [];
  let lightningVisuals: LightningVisual[] = [];
  let plumeVisuals: EmissiveVisual[] = [];
  // Cloud decks: a translucent shell per cloudy body, drifted in longitude each frame so it floats over
  // the surface (its own spin, on top of the parent sphere's).
  let cloudVisuals: { mesh: THREE.Object3D; drift: number }[] = [];
  let starFlareVisuals: FlareVisual[] = [];
  // Auto-generated black-hole accretion discs, by BH node id — the lens exempts each disc's projected
  // band so its near side shows in front of the shadow (see lensingShader).
  const bhDiscInfo = new Map<string, { pivot: THREE.Group; inner: number; outer: number }>();
  // Orbit path rings, keyed by node id so they can follow the SAME visibility rule as the names
  // ("if you show a name, show an orbit"). Moon rings carry trackParentId to follow the parent.
  // `abs` = the ring's vertices in ABSOLUTE scene units, kept in float64. A heliocentric ring is the one
  // line a body is judged against, and its buffer is float32, so on a rebase it is re-emitted from this
  // master copy rather than left where it was. See rebaseStaticGeometry.
  let orbitRings: { id: string; obj: THREE.Object3D; trackParentId?: string; abs?: Float64Array; node?: any }[] = [];
  let starLights: { id: string; light: THREE.PointLight }[] = [];
  let starVisuals: { corona: THREE.Sprite; coronaScale: number; activity: number }[] = [];
  let rMax = 1; // largest heliocentric distance in the system (AU), for the compression normaliser
  let compression = DEFAULT_COMPRESSION;
  let beltDetail = 0.6; // GM quality knob: scales belt particle budget (performance), not physics
  let bodyStyle: 'textured' | 'flat' | 'white' = 'textured'; // COLOUR selection: true-colour / class / white
  let unlit = false; // flat lighting (MeshBasic, no terminator) — the efficient "2D map" look
  let aurorasOn = true; // GM toggle: show the emissive polar aurora shells (updateAuroras hides when off)
  let beltStyle: BeltStyle = 'rocks'; // rocks vs the orrery's flat band
  let renderStyle: RenderStyle = 'filled'; // filled spheres vs 80s vector wireframe
  let bodySize = 1; // 1 = readable (chunky), 0 = true physical scale (tiny) — fine-tune body sizes
  let timeMs = 0;
  let viewW = 1;
  let viewH = 1;
  const contentGroup = new THREE.Group();
  scene.add(contentGroup);

  const glowTexture = makeGlowTexture();
  const hotspotTexture = makeHotspotTexture(); // shared filled glow for volcanic vents
  const plumeTexture = makePlumeTexture(); // shared soft white puff for cryovolcanic plumes
  const tmp = new THREE.Vector3();
  const proj = new THREE.Vector3();

  // The live radial map, as one object for ./floatingOrigin. Mutated in place rather than rebuilt:
  // positionToScene is called per body per frame, and a fresh object each time is pure garbage.
  const _radial: RadialMap = { gridRadius: GRID_RADIUS, rMax: 1, r0Au: R0_AU, compression: DEFAULT_COMPRESSION };
  function radialMap(): RadialMap {
    _radial.rMax = rMax;
    _radial.compression = compression;
    return _radial;
  }

  // FLOATING ORIGIN (A19). The scene is drawn RELATIVE TO `sceneOrigin` — a point in absolute (already
  // compressed) scene units that the rebase policy keeps near whatever the camera is looking at. It is
  // (0,0,0) at readable scale and stays there: nothing below moves until the camera gets close enough to
  // a body that float32 stops being able to describe what is around it. See `maybeRebase`.
  //
  // `originShift` is where the SYSTEM CENTRE is drawn, i.e. -sceneOrigin. Anything that used to mean
  // "the star / the middle of the system" by writing (0,0,0) has to say originShift instead.
  const sceneOrigin = new THREE.Vector3();
  const originShift = new THREE.Vector3();

  // Radial compression: blend a linear map (r -> GRID_RADIUS·r/rMax) with a log map, by `compression`.
  // Log spreads packed inner planets out while keeping the whole system on the grid.
  function compressScalar(r: number): number {
    return compressRadius(r, radialMap());
  }

  // Physics frame: reference plane z=0, in-plane x/y. Map to three's ground (x,z) with out-of-plane
  // height on three's up (y), applying the radial compression in AU space first — and THEN the rebase,
  // which is a pure translation and so composes cleanly with the radial (nonlinear) map. Doing it the
  // other way round looks almost right on-axis and is wrong everywhere else.
  function positionToScene(p: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
    return toSceneRebased(p, radialMap(), sceneOrigin, out);
  }

  // The same conversion WITHOUT the rebase. Belts are baked host-relative and re-anchored to their host's
  // rendered position every frame (updateBelts), so they must be built in the absolute frame or the
  // origin would be counted twice.
  function positionToSceneAbs(p: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
    return toSceneAbsolute(p, radialMap(), out);
  }

  /**
   * Move the floating origin by `delta` (expressed in the CURRENT rebased frame), taking the camera with
   * it so the shot does not cut, and re-emitting everything that holds absolute coordinates.
   *
   * What does NOT need touching, and why: bodies, star lights and constructs are recomputed from the
   * propagator through positionToScene; moon orbit rings are stored in their parent's local frame and
   * positioned at the parent; planetary rings track their parent; belts are baked host-relative and
   * re-anchored to the host's rendered position every frame. Only the heliocentric orbit rings and the
   * grid hold absolute vertices, and both keep a float64 master to re-emit from.
   */
  function rebaseOriginBy(delta: THREE.Vector3) {
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) return;
    sceneOrigin.add(delta);
    originShift.copy(sceneOrigin).negate();
    camera.position.sub(delta);
    controls.target.sub(delta);
    emitOrbitRings(); // re-sampled about the new focus where the facets would otherwise show
    rebaseGrid();
    updatePositions(); // bodies + lights into the new frame (they are only recomputed on a time change)
    updateSurfaceConstructs(); // and the constructs glued to them
  }

  // ---- Focus-adaptive orbit rings (A23) ----------------------------------------------------------
  // An orbit ring is a POLYGON, and past a certain zoom you are inside one of its facets: at Pluto's 12
  // scene units, 1024 uniform samples turn 0.35 degrees at each vertex and sag 5.6e-5 units off the true
  // ellipse — more than the whole Pluto-Charon separation. You see it as a kink in a line that should be
  // smooth. Raising the count globally cannot reach it (the kink needs ~16k samples at that zoom, and
  // deeper zoom needs more again) and would cost 16x the buffer and 16x the propagation on every rebuild.
  //
  // So the samples MOVE instead. The same 1024 are redistributed along the orbit, packed into the arc
  // nearest the floating origin and thinned on the far side, which at that zoom is off screen anyway. A
  // ring whose nearest point is well outside the view is left uniform, so in practice one ring re-samples.
  // The refinement follows the CAMERA; the rebase follows precision. Two separate concerns, so the dense
  // arc is centred on the camera's focus rather than on the floating origin — between rebases the target
  // is allowed to drift two thousand camera-distances, which is wider than the dense arc itself.
  const RING_ADAPT_NEAR = 8; // only refine a ring passing within this many camera-distances
  const RING_SAG_FRAC = 1 / 2000; // allowed chord sag, as a fraction of the working distance
  const RING_FOCUS_SLACK = 0.25; // re-emit once the focus has crossed this much of the dense arc
  let lastRingCamDist = 0;
  let lastRingCoreArc = Infinity; // the dense arc's half-width; Infinity when nothing was refined
  const lastRingFocus = new THREE.Vector3(); // absolute scene units, so a rebase does not disturb it
  const _ringFocus = new THREE.Vector3();

  /**
   * A monotonic odd warp of the orbit parameter about the focus. `s` is the sample SPACING at the centre
   * as a fraction of uniform, so density there is 1/s; s = 1 is exactly the uniform sampling everything
   * had before. Cubic in the tail, which keeps it monotonic (f' = s + 3(1-s)y^2 > 0) and lands f(1) = 1
   * so the warp still covers exactly one orbit.
   */
  function warpOrbitParam(x: number, s: number): number {
    const y = Math.abs(2 * x);
    return 0.5 * Math.sign(x) * (s * y + (1 - s) * y * y * y);
  }

  /**
   * Distance from a point to a segment. The ring's proximity has to be measured against its SEGMENTS, not
   * its vertices: on a 1024-gon at 12 scene units the vertices are 0.074 apart, so a nearest-vertex test
   * reports 0.037 for a ring passing exactly THROUGH the point — 46x over the threshold at the zoom where
   * this matters, which is why the refinement below silently never fired.
   */
  function distToSegment(p: THREE.Vector3, a: Float64Array, i: number, j: number): number {
    const ex = a[j] - a[i], ey = a[j + 1] - a[i + 1], ez = a[j + 2] - a[i + 2];
    const px = p.x - a[i], py = p.y - a[i + 1], pz = p.z - a[i + 2];
    const ee = ex * ex + ey * ey + ez * ez;
    const t = ee > 0 ? Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / ee)) : 0;
    return Math.hypot(px - ex * t, py - ey * t, pz - ez * t);
  }

  /** Emit one ring for the current origin, re-sampling about the focus when the facets would show. */
  function emitOrbitRing(r: { obj: THREE.Object3D; abs?: Float64Array; node?: any }, camDist: number, focus: THREE.Vector3): number {
    if (!r.abs) return Infinity;
    // Nearest vertex of the uniform master to the origin — no propagation needed, and it also fixes the
    // orbit parameter the refinement is centred on.
    let best = Infinity, bi = 0;
    for (let i = 0; i < r.abs.length; i += 3) {
      const dx = r.abs[i] - focus.x, dy = r.abs[i + 1] - focus.y, dz = r.abs[i + 2] - focus.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    // ...then how close the CURVE actually comes, via the two segments meeting at that vertex.
    const n = r.abs.length;
    const prev = (bi - 3 + n) % n, next = (bi + 3) % n;
    const dNear = Math.min(distToSegment(focus, r.abs, bi, next), distToSegment(focus, r.abs, prev, bi));
    const period = r.node ? orbitPeriodMs(r.node.orbit) : 0;
    let s = 1;
    if (period > 0 && dNear <= camDist * RING_ADAPT_NEAR) {
      // Chord sag over one facet is R*dTheta^2/8 with dTheta = 2*pi*s/N, so invert that for the tolerance.
      const curveR = Math.max(1e-9, Math.hypot(r.abs[bi], r.abs[bi + 1], r.abs[bi + 2]));
      const tol = Math.max(1e-12, camDist * RING_SAG_FRAC);
      s = (ORBIT_SAMPLES * Math.sqrt((8 * tol) / curveR)) / (2 * Math.PI);
      s = Math.max(0.002, Math.min(1, s));
    }
    if (s >= 0.999) { rebaseStaticGeometry(r.obj, r.abs, sceneOrigin); return Infinity; } // uniform: the master stands
    const attr = (r.obj as any).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
    if (!attr) return Infinity;
    const arr = attr.array as Float32Array;
    const t0 = r.node.orbit.t0 || 0;
    const uCentre = bi / 3 / ORBIT_SAMPLES;
    for (let i = 0; i < ORBIT_SAMPLES; i++) {
      const u = uCentre + warpOrbitParam(i / ORBIT_SAMPLES - 0.5, s);
      positionToSceneAbs(propagateState3D(r.node, t0 + u * period).r, tmp);
      arr[3 * i] = tmp.x - sceneOrigin.x;
      arr[3 * i + 1] = tmp.y - sceneOrigin.y;
      arr[3 * i + 2] = tmp.z - sceneOrigin.z;
    }
    attr.needsUpdate = true;
    (r.obj as any).geometry?.computeBoundingSphere?.();
    // How far the focus may travel before the dense arc no longer covers it (see RING_FOCUS_SLACK).
    return 2 * Math.PI * Math.hypot(r.abs[bi], r.abs[bi + 1], r.abs[bi + 2]) * Math.abs(warpOrbitParam(0.05, s));
  }

  function emitOrbitRings() {
    lastRingCamDist = camera.position.distanceTo(controls.target);
    lastRingFocus.addVectors(sceneOrigin, controls.target); // the focus, in absolute scene units
    lastRingCoreArc = Infinity;
    for (const r of orbitRings) {
      if (!r.abs) continue;
      lastRingCoreArc = Math.min(lastRingCoreArc, emitOrbitRing(r, lastRingCamDist, lastRingFocus));
    }
  }

  /**
   * The rebase POLICY (the threshold itself lives in ./floatingOrigin, where it is under test): keep the
   * camera's target near the origin, but only once float32 can no longer describe what is around it.
   */
  function maybeRebase() {
    // Not mid-ease. The target lerps onto the body over ~48 frames while the distance closes at a similar
    // rate, so the test below would pass on most of those frames and re-emit on each — a hitch, to fix a
    // rounding error nobody can see on a camera that is still flying. One rebase when it settles is right.
    if (focusDrive > 0) return;
    const drift = controls.target.length(); // the target is in rebased units, so this IS the drift
    if (!shouldRebase(drift, camera.position.distanceTo(controls.target))) return;
    rebaseOriginBy(_rebaseDelta.copy(controls.target));
  }
  const _rebaseDelta = new THREE.Vector3();

  /** Put the origin back at the system centre, leaving the camera looking at the same absolute point. */
  function resetOrigin() {
    rebaseOriginBy(_rebaseDelta.copy(originShift));
  }

  /** The same, for when the content is about to be rebuilt anyway — no point re-emitting what is going. */
  function resetOriginForRebuild() {
    if (sceneOrigin.lengthSq() === 0) return;
    camera.position.add(sceneOrigin);
    controls.target.add(sceneOrigin);
    sceneOrigin.set(0, 0, 0);
    originShift.set(0, 0, 0);
  }

  // Round-AU steps for the labelled grid, thinned to ~6 rings spanning the system's extent.
  // G10: the SHARED 1/2/5 ladder (map/niceInterval), the same one the starmap's scaled rings use, so
  // the two views cannot disagree about what a round distance is. The private list this replaced held
  // 3, 30 and 300, which are not on that ladder — harmless in isolation, but two vocabularies for one
  // idea is how the next one drifts.
  function gridAuSteps(): number[] {
    return niceSeries(rMax * 1.02, 6, 6);
  }

  function ringPoints(radius: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
    return pts;
  }

  // Add a grid line built in ABSOLUTE scene units, keeping the float64 master so a rebase can re-emit it.
  function addGridLines(pts: THREE.Vector3[], mat: THREE.Material, loop: boolean) {
    const abs = new Float64Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) { abs[3 * i] = pts[i].x; abs[3 * i + 1] = pts[i].y; abs[3 * i + 2] = pts[i].z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(abs.length), 3));
    // G4 falloff. Per-vertex alpha from the ABSOLUTE position — computed once, never rebased, so the
    // fade stays anchored to the system while the floating origin moves the drawn coordinates.
    if (gridFalloff > 0.001) {
      const f = Math.min(1, gridFalloff);
      const from = GRID_RADIUS * (1 - 0.85 * f);
      const to = from + GRID_RADIUS * (1.1 - 0.55 * f);
      const cols = new Float32Array(pts.length * 4);
      for (let i = 0; i < pts.length; i++) {
        const d = Math.hypot(abs[3 * i], abs[3 * i + 2]);
        const a = d <= from ? 1 : Math.max(0, 1 - (d - from) / Math.max(1e-6, to - from));
        const c = (mat as THREE.LineBasicMaterial).color;
        cols[4 * i] = c.r; cols[4 * i + 1] = c.g; cols[4 * i + 2] = c.b;
        cols[4 * i + 3] = a * ((mat as THREE.LineBasicMaterial).opacity ?? 1);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
      (mat as THREE.LineBasicMaterial).vertexColors = true;
      (mat as THREE.LineBasicMaterial).opacity = 1;
      mat.needsUpdate = true;
    }
    const obj = loop ? new THREE.LineLoop(geo, mat) : new THREE.LineSegments(geo, mat);
    gridGroup.add(obj);
    gridAbs.push({ obj, abs });
    rebaseStaticGeometry(obj, abs, sceneOrigin);
  }

  // Re-emit the grid into the current origin's frame (lines from their masters, labels by translation).
  function rebaseGrid() {
    for (const g of gridAbs) rebaseStaticGeometry(g.obj, g.abs, sceneOrigin);
    for (const l of gridLabels) l.sprite.position.set(l.abs[0] - sceneOrigin.x, l.abs[1] - sceneOrigin.y, l.abs[2] - sceneOrigin.z);
  }

  // --- G10: THE GROUND GRID IS A DISTANCE ------------------------------------------------------
  //
  // It used to be `GRID_RADIUS / 7` — a fraction of the SCENE radius, so it scaled with the view and
  // meant nothing physical. A grid whose cell is a real number of AU turns a decorative plate into a
  // scale reference a GM can read at a glance, which is much the more useful object.
  //
  // WHY NOT `latticeFor` (map/latticeGeometry). The shared lattice generator tiles MAP space with a
  // constant cell, and that
  // is exactly right for the starmaps and the GM's snap grid, which is why it stays. It cannot express
  // this one: the orrery's radial map is NONLINEAR at any toytown compression, so equal steps in AU
  // are not equal steps on screen. These are two different objects, not two copies of one — a constant
  // -cell tiling in map space, and a metric grid in a compressed radial space.
  //
  // WHAT IS EXACT AND WHAT IS NOT, stated rather than discovered later. Each line sits at the scene
  // radius its own AU coordinate maps to, so every line is at the distance it claims ALONG ITS OWN
  // AXIS, and at true scale (compression 0) the whole thing is a genuine uniform square grid. Under
  // compression the cells narrow outward, which matches the orrery beneath them; a mathematically
  // exact image of a square grid under a radial map would be CURVED, and straight lines at compressed
  // positions are the readable approximation of it. The polar rings are the overlay that stays exactly
  // right under compression, which is the honest reason to reach for `scaled` when precision matters.
  let gridLevelMats: { mat: THREE.LineBasicMaterial; coarse: boolean; peak: number }[] = [];
  let gridBuiltFor = { coarse: 0, span: 0 };

  /** Half the AU extent the camera can currently see — what picks the decade. */
  function visibleAu(): number {
    const dist = camera.position.distanceTo(controls.target);
    const halfScene = Math.max(1e-4, dist * Math.tan((camera.fov * Math.PI) / 360));
    // The focus can sit well off the origin, so measure from the far edge of what is on screen.
    const reach = halfScene + controls.target.length();
    return Math.max(1e-6, expandRadius(Math.min(reach, GRID_RADIUS * 4), radialMap()));
  }

  /** Lines at whole multiples of `stepAu`, out to `spanAu`, clipped to the ground disc. */
  function metricLines(stepAu: number, spanAu: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    if (!(stepAu > 0)) return pts;
    const R = GRID_RADIUS;
    const offsets: number[] = [0];
    for (let k = 1; k * stepAu <= spanAu && offsets.length < 400; k++) {
      const o = compressScalar(k * stepAu);
      if (o > R) break;
      offsets.push(o, -o);
    }
    // A run at |offset| reaches sqrt(R^2 - offset^2) each way inside the disc, which is what keeps the
    // plate a DISC rather than a square — the same boundary the old lattice got from `clipRadius`.
    for (const o of offsets) {
      const half = Math.sqrt(Math.max(0, R * R - o * o));
      if (half <= 1e-4) continue;
      // Segmented ONLY when the falloff dial is on. A per-vertex fade evaluated at the ends of a
      // full-width line judges the whole line by its far ends (inbox A37), so it needs pieces — but
      // with the dial at 0, which is this view's default, `addGridLines` writes no colour attribute at
      // all and the pieces buy nothing. One run per line then, which is 65,000 vertices down to a few
      // hundred on the fine level.
      const SEG = gridFalloff > 0.001 ? Math.max(0.25, R / 16) : Infinity;
      for (let a = -half; a < half - 1e-9; a += SEG) {
        const b = Math.min(half, a + SEG);
        pts.push(new THREE.Vector3(a, 0.01, o), new THREE.Vector3(b, 0.01, o));   // along x
        pts.push(new THREE.Vector3(o, 0.01, a), new THREE.Vector3(o, 0.01, b));   // along z
      }
    }
    return pts;
  }

  function buildMetricGrid(base: THREE.Color) {
    gridLevelMats = [];
    const lv = gridLevels(visibleAu(), 6);
    if (!lv) return;
    // Cover a bit more than the view so a pan does not run off the grid, but never the whole system at
    // a fine step — that is how a decade grid spawns ten thousand lines.
    const span = Math.min(rMax * 1.2, visibleAu() * 2.5);
    gridBuiltFor = { coarse: lv.coarse, span };
    for (const [step, coarse] of [[lv.coarse, true], [lv.fine, false]] as [number, boolean][]) {
      const peak = coarse ? 0.42 : 0.30;         // the ghost level is fainter even at full fade-in
      const a = coarse ? 1 - lv.t : lv.t;
      if (a < 0.02) continue;
      const pts = metricLines(step, span);
      if (!pts.length) continue;
      const mat = new THREE.LineBasicMaterial({
        color: base.clone().multiplyScalar(0.4), transparent: true, opacity: peak * a, depthWrite: false
      });
      addGridLines(pts, mat, false);
      gridLevelMats.push({ mat, coarse, peak });
    }
  }

  /**
   * Per frame: slide the two levels' opacities as the zoom moves, and rebuild only when the DECADE
   * itself changes. That split is the whole trick — geometry is expensive and a fade is not, so the
   * crossfade runs continuously while the rebuild happens a handful of times across a whole zoom.
   */
  function updateGridLevels() {
    if (!isLattice(gridMode) || gridMode === 'off' || !gridLevelMats.length) return;
    const lv = gridLevels(visibleAu(), 6);
    if (!lv) return;
    if (lv.coarse !== gridBuiltFor.coarse) { rebuildGrid(); return; }
    for (const g of gridLevelMats) g.mat.opacity = g.peak * (g.coarse ? 1 - lv.t : lv.t);
  }

  function rebuildGrid() {
    clearGroup(gridGroup);
    gridAbs = [];
    gridLabels = [];
    gridGroup.visible = gridMode !== 'off';
    if (gridMode === 'off') return;
    const base = new THREE.Color(HOLO_TINT);
    // WS3 — lattice overlays (square / hex / traveller-hex) on the system's ground plane. The system
    // view draws the Traveller lattice without CCRR numbering: the numbering is a starmap-scale idea
    // (sector/subsector addressing), meaningless inside one system.
    if (isLattice(gridMode)) {
      buildMetricGrid(base);
      return;
    }
    if (gridMode === 'scaled') {
      // Concentric rings at round AU distances (mapped through the live compression), each labelled.
      for (const au of gridAuSteps()) {
        const radius = compressScalar(au);
        if (radius <= 0.02) continue;
        const mat = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.4), transparent: true, opacity: 0.55, depthWrite: false });
        addGridLines(ringPoints(radius), mat, true);
        const label = makeGridLabel(`${formatNice(au)} AU`);
        if (label) {
          gridLabels.push({ sprite: label, abs: [radius, 0.02, 0] });
          label.position.set(radius - sceneOrigin.x, 0.02 - sceneOrigin.y, -sceneOrigin.z);
          gridGroup.add(label);
        }
      }
    } else {
      // Plain: six evenly-spaced polar rings (decorative, system-independent).
      for (let ri = 1; ri <= 6; ri++) {
        const radius = (GRID_RADIUS / 6) * ri;
        const col = base.clone().multiplyScalar(0.45 * (1 - (ri - 1) / 8));
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false });
        addGridLines(ringPoints(radius), mat, true);
      }
    }
    // Radial spokes (both modes).
    const spokes: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      spokes.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * GRID_RADIUS, 0, Math.sin(a) * GRID_RADIUS));
    }
    const spokeMat = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.22), transparent: true, opacity: 0.5, depthWrite: false });
    addGridLines(spokes, spokeMat, false);
  }

  function setGridFalloff(v: number) {
    const n = Math.max(0, Math.min(1, v || 0));
    if (n === gridFalloff) return;
    gridFalloff = n;
    rebuildGrid();
  }

  function setGrid(raw: MapOverlay) {
    // Hexes address interstellar space, not the inside of a system — fold them to the square lattice
    // so a preset authored for a starmap can't paint a jump grid over an orrery.
    const mode = forSystemScale(raw);
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
  const camDir = new THREE.Vector3();      // target→camera offset direction (re-seating the auto-framed distance)
  const followOffset = new THREE.Vector3(); // target→camera offset carried with a followed body (heading + distance)
  // Auto-frame bookkeeping, mirroring the orrery: once the user drives zoom we stop re-framing (never
  // fight them) until the next explicit (re)selection re-engages it.
  let userZoomOverride = false;
  let lastAutoDist = 0;
  let lastAutoDistMs = 0;
  // The orrery's FOLLOW/MANUAL split: following holds until the USER takes the view (a pan drag) —
  // then it's theirs until the next explicit (re)selection re-engages the follow.
  let followEngaged = false;
  // The locked view's heading is an explicit INVARIANT, captured when the lock engages — never derived
  // from the live camera. (Deriving it re-fed the ease's own transient drift back into itself: the
  // target and camera lerp at different rates, so the offset direction swings mid-ease, the polar clamp
  // turns that swing into heading, and the map settled rotated.)
  let lockedHeading = 0;
  const headingDir = new THREE.Vector3();
  let focusedId: string | null = null;
  let focusDrive = 0;
  let visibleSet = new Set<string>(); // which body names show — AND what can be clicked (one rule, both)
  let focusLevel = 1; // the click-ladder level for the focused body (see viewport/camera FRAME_LEVELS)
  let framingAngleRad = (64 * Math.PI) / 180; // camera tilt from vertical (0 = overhead)
  let framingWhole = false; // frame the whole system instead of the focused body
  let frameFillFrac = FRAME_LEVELS.fillFrac; // close-up fill; an isolated portrait raises it (see setFraming)
  // TWO independent ideas — conflating them turned an unlocked 2D map into a 3D one:
  //   flatOverhead — the view is a MAP: the tilt is pinned top-down. A 2D map is always flat.
  //   lockRotate   — the heading is fixed: no spinning by drag, and following a body PANS (below).
  // With flat on and lockRotate off you get a flat map you can still spin (azimuth only) — the tilt
  // stays pinned because OrbitControls clamps the polar, so drag can only change the heading.
  let flatOverhead = false;
  let lockRotate = false;

  // Pin the polar angle. Flat = a top-down map; otherwise let the camera reach the configured framing
  // (OrbitControls would otherwise clamp it). LOCK_POLAR sits a hair off true vertical because an
  // exactly-overhead orbit camera is gimbal-degenerate (view axis parallel to `up`).
  const LOCK_POLAR = 0.02;
  function applyPolarLimits() {
    controls.minPolarAngle = flatOverhead ? LOCK_POLAR : Math.min(0.06, framingAngleRad);
    controls.maxPolarAngle = flatOverhead ? LOCK_POLAR : Math.PI * 0.49;
  }
  // Whole-framed FLAT map = a FIXED plan view (Alex: "just a fixed overhead — no pan/zoom"): freeze the
  // user's pan and zoom too. A whole-framed 3D holo keeps its orbit/zoom (it's a hologram, not a map).
  function applyInteractionLocks() {
    const fixedPlan = flatOverhead && framingWhole;
    controls.enablePan = flatOverhead && !fixedPlan;
    controls.enableZoom = !fixedPlan;
  }

  function setFraming(o: { angleDeg?: number; whole?: boolean; fillFrac?: number }) {
    // Every other setter here bails when handed the value it already holds; this one did not, and it is
    // called from applyStyle on EVERY style object — which is a fresh object on every keystroke in the
    // preset editor. So changing the belt type, or the accent colour, re-armed the ease and threw the
    // camera back to its framed shot, discarding whatever the user had panned or zoomed to. An
    // appearance setting must never move the camera; only a genuine framing change may.
    const nextAngle = o.angleDeg != null ? (Math.max(0, Math.min(85, o.angleDeg)) * Math.PI) / 180 : framingAngleRad;
    const nextWhole = o.whole != null ? o.whole : framingWhole;
    const nextFill = o.fillFrac != null ? Math.max(0.05, Math.min(1, o.fillFrac)) : frameFillFrac;
    if (nextAngle === framingAngleRad && nextWhole === framingWhole && nextFill === frameFillFrac) return;
    framingAngleRad = nextAngle;
    framingWhole = nextWhole;
    if (framingWhole) resetOrigin(); // the whole system in shot: no body is close enough to need a rebase
    frameFillFrac = nextFill;
    applyPolarLimits();
    applyInteractionLocks();
    focusDrive = 48; // re-ease into the new framing
  }

  // The "2D map": the tilt is pinned top-down — it can never become a 3D view. Pan + zoom are enabled
  // (a flat map you can't drag is useless); the 3D holo stays orbit-only. The PRIMARY gesture flips:
  // OrbitControls' default puts rotate on left-drag and pan on right-drag, which on a map reads as
  // "click doesn't pan" — so flat maps get LEFT/one-finger = PAN (rotate moves to right-drag, azimuth
  // only, and dies entirely when the heading is locked).
  function setFlatOverhead(on: boolean) {
    if (on === flatOverhead) return;
    flatOverhead = on;
    applyInteractionLocks();
    controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = on ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    controls.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    applyPolarLimits();
    focusDrive = 48; // ease back to the pinned framing
  }

  // Fix the heading: no spinning by drag, and driveFocus keeps the focus centred by PANNING. Off = the
  // view may rotate (on a flat map the polar stays clamped, so that's an azimuth-only spin).
  function setLockRotation(on: boolean) {
    if (on === lockRotate) return;
    lockRotate = on;
    controls.enableRotate = !on;
    if (on) {
      // Freeze the CURRENT heading — every locked shot is built on this azimuth from here on.
      camDir.subVectors(camera.position, controls.target);
      lockedHeading = Math.hypot(camDir.x, camDir.z) > 1e-6 ? Math.atan2(camDir.x, camDir.z) : 0;
    }
    focusDrive = 48;
  }

  // Info-panel reframe: how many pixels of the right edge are covered by the panel (0 = none). The
  // current value eases toward the target each frame — a gentle slide as the panel opens/closes.
  let viewInsetTarget = 0;
  let viewInsetCur = 0;
  function setViewInset(px: number) {
    viewInsetTarget = Math.max(0, Math.min(px, viewW * 0.6)); // never inset more than 60% of the view
  }

  const pointer = new AbortController();
  let downX = 0;
  let downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; }, { signal: pointer.signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!flatOverhead || e.buttons === 0) return; // pan is the primary drag only on a flat map
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
      followEngaged = false; // the user took the view (the orrery's MANUAL) — stop re-framing it
      focusDrive = 0;        // and don't finish an in-flight ease against their drag
    }
  }, { signal: pointer.signal });
  // The user driving zoom (wheel / pinch) takes the camera off auto-framing — the orrery's rule, so the
  // view never fights someone looking around. Cleared by the next explicit (re)frame (focusBody/pickBody).
  canvas.addEventListener('wheel', () => { userZoomOverride = true; }, { passive: true, signal: pointer.signal });
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
    // Selection obeys the SAME rule as naming (getVisibleNodeIds) — regardless of whether labels are
    // currently drawn. So you always click a planet before its moons (they can't be in the way), and from
    // a moon you can still reach its parent, its peers and other planets/stars — but never another
    // planet's moons.
    const clickable = bodies.filter((b) => visibleSet.has(b.id));
    // Recursive: a body's mesh can be a Group (a star's photosphere+corona, a wireframe body), so hits
    // land on a child — walk up to find the owning body.
    const hits = raycaster.intersectObjects(clickable.map((b) => b.mesh), true);
    if (hits.length) {
      let obj: THREE.Object3D | null = hits[0].object;
      let b: BodyVisual | undefined;
      while (obj && !(b = clickable.find((x) => x.mesh === obj))) obj = obj.parent;
      if (b) { pickBody(b.id); return; }
    }
    // Tap assist for tiny targets: construct icons AND small bodies (a moon at whole-system zoom is a
    // 4 px disc hugging its planet — selectable in principle, unclickable in practice). On a raycast
    // miss, pick the nearest clickable body within ~14 px of the tap in screen space (finger-friendly).
    const tapX = e.clientX - rect.left;
    const tapY = e.clientY - rect.top;
    let best: BodyVisual | null = null;
    let bestD = 14 * 14;
    for (const b of clickable) {
      proj.copy(b.mesh.position).project(camera);
      if (proj.z > 1) continue;
      const sx = (proj.x * 0.5 + 0.5) * viewW;
      const sy = (-proj.y * 0.5 + 0.5) * viewH;
      const d = (sx - tapX) * (sx - tapX) + (sy - tapY) * (sy - tapY);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) pickBody(best.id);
  }, { signal: pointer.signal });

  // A tap. A NEW body starts at its first existing ladder level (focusBody, driven by the app's focus
  // change). Re-tapping the FOCUSED body steps one level deeper — we own that step here because the id
  // doesn't change on a re-tap, so the reactive focusBody() would never re-fire.
  function pickBody(id: string) {
    if (id === focusedId && !framingWhole) { // whole framing: clicks select, never re-frame
      focusLevel = nextFrameLevel(levelsForBody(id), focusLevel);
      focusDrive = 48; // re-ease into the deeper shot
      followEngaged = true;
      userZoomOverride = false; // an explicit re-frame re-engages auto-framing
      lastAutoDist = 0;
    }
    opts.onSelect?.(id);
  }

  // Which of the ladder's levels exist for a body, by the SHARED rule (no parent → no 1; no satellites → no 2).
  // The holo draws no mesh for a barycentre, so a member's parent is only reachable through the shared
  // pair rule — without it every binary star read as the system ROOT here and lost its context level,
  // giving the 3D view a different ladder from the orrery for the same click.
  function levelsForBody(id: string | null): number[] {
    const b = id ? bodyById.get(id) : undefined;
    if (!b) return [3];
    const pid = b.framingParentId ?? null;
    return frameLevelsFrom({
      hasParent: contextPeerIds(currentSystem, b.id, pid).some((pid2) => bodyById.has(pid2)),
      hasSatellites: bodies.some((x) => x.framingParentId === id),
      hasRadius: !b.isConstruct && (b.radiusScene ?? 0) > 0, // a radius-less root keeps whole-system-first
      // A barycentre member's context is only its PARTNER, so it gets one rung further out — the orbit
      // the pair shares — instead of wrapping back in at pair scale.
      hasPairContext: pairContextIds(currentSystem, b.id, pid).some((gp) => bodyById.has(gp))
    });
  }

  // The camera distance that frames the focused body at the CURRENT ladder level. The level→extent maths
  // is the shared ruleset; we measure parent/satellite distances in scene units and convert the returned
  // half-extent into a perspective distance (fitting it into half the viewport's min dimension — exactly
  // what the 2D orrery's zoom does). The framing ANGLE is separate, so 2D (overhead) and 3D (tilted) get
  // identical framing from the same click.
  function frameDistance(b: BodyVisual): number {
    // A modelled construct frames to its HULL (dial-blended length), so "zoom to the ship" comes
    // all the way down to it at true scale; a glyph-only construct keeps the radius-less patch.
    const radius = b.isConstruct ? ((b.shipModel && b.shipLen) ? b.shipLen / 2 : 0) : (b.radiusScene ?? 0);
    // Reach the FURTHEST context peer — for a barycentre member that is the partner star, so the pair
    // frames as a pair from either half (the barycentre point itself has no mesh here).
    let parentDist = 0;
    for (const peerId of contextPeerIds(currentSystem, b.id, b.framingParentId ?? null)) {
      const pv = bodyById.get(peerId);
      if (pv) parentDist = Math.max(parentDist, b.mesh.position.distanceTo(pv.mesh.position));
    }
    let maxSatelliteDist = 0;
    for (const x of bodies) {
      if (x.framingParentId !== b.id) continue;
      maxSatelliteDist = Math.max(maxSatelliteDist, x.mesh.position.distanceTo(b.mesh.position));
    }
    // Level 0 — past the partner, out to whatever the pair as a whole orbits.
    let pairContextDist = 0;
    for (const gpId of pairContextIds(currentSystem, b.id, b.framingParentId ?? null)) {
      const gp = bodyById.get(gpId);
      if (gp) pairContextDist = Math.max(pairContextDist, b.mesh.position.distanceTo(gp.mesh.position));
    }
    // 0 = a radius-less construct at level 3: give it a small patch (its glyph is screen-fixed anyway).
    const half = frameHalfExtent({ level: focusLevel, radius, parentDist, maxSatelliteDist, pairContextDist, config: { ...FRAME_LEVELS, fillFrac: frameFillFrac } })
      || Math.max(0.35, controls.minDistance * 3);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const dist = half / Math.max(1e-6, tan * Math.min(1, camera.aspect));
    return Math.max(controls.minDistance * 1.05, dist);
  }

  // Constructs render at fixed SCREEN size (sizeAttenuation: false): full-size when the focus rule
  // has them in view (their parent, a sibling, or they are selected — same rule as naming), tiny and
  // dimmed otherwise so distant traffic can never occlude a world. Scale maths: for a unit sprite
  // quad, on-screen px = scale · viewH / (2·tan(fov/2)).
  const CONSTRUCT_PX_FOCUS = 12;
  const CONSTRUCT_PX_IDLE = 4;
  // G3: the ship model's LONG AXIS in scene units - the SAME dial blend a body's radius takes
  // (bodyRadiusScene): at the readable end a log-mapped marker length so relative size stays
  // honest (a 1 km cruiser visibly dwarfs a 110 m frigate), at the true end the AUTHORED
  // dimensionsM converted exactly as body radii are (metres -> AU -> the true-scale factor) -
  // genuinely 1:1, which the floating origin makes renderable because a focused ship sits at the
  // origin and float precision is relative. No scene floor (the trap bodyRadiusScene documents):
  // visibility is the pixel LOD's job - below a few pixels the ICON stands in, above it the hull
  // draws, at every dial position. Recomputed on rebuild like the bodies (the dial rebuilds).
  function shipLenScene(node: any): number {
    const dims = node?.physical_parameters?.dimensionsM;
    const lengthM = Math.max(...(Array.isArray(dims) ? dims.map((d: number) => Number(d) || 0) : [0]), 0) || 100;
    const readable = Math.min(0.7, Math.max(0.14, 0.16 + 0.1 * (Math.log10(lengthM) - 1)));
    if (bodySize >= 0.999) return readable;
    const trueScene = ((lengthM / 1000) / AU_KM) * (GRID_RADIUS / rMax);
    return Math.max(1e-10, trueScene * (1 - bodySize) + readable * bodySize);
  }
  const SHIP_MODEL_MIN_PX = 10; // below this the model IS the icon's job
  let buildGen = 0; // invalidates async ship-model loads across setSystem rebuilds

  async function loadShipModel(v: BodyVisual, ref: { hash: string; hadMaterials?: boolean; orient?: [number, number, number, number] }, tint: string, sceneLen: number, gen: number) {
    try {
      const stored = await getStoredModel(ref.hash);
      if (gen !== buildGen) return; // stale build
      if (!stored) {
        // Not local yet (a remote player). One-shot retry when the transport lands it in the
        // store - modelArrived clears the waiter, and the gen guard drops it across rebuilds.
        requestModel(ref.hash, () => { if (gen === buildGen) loadShipModel(v, ref, tint, sceneLen, gen); });
        return;
      }
      const parsed = await parseStoredModel('stored.glb', stored.bytes);
      if (gen !== buildGen) return;
      const g = buildDisplayModel(parsed.object, {
        hadMaterials: ref.hadMaterials ?? true, tintHex: tint, orient: ref.orient ?? null
      });
      g.scale.setScalar(sceneLen);
      g.visible = false; // updateConstructs reveals it when it is big enough on screen (pixel LOD)
      v.shipFx = attachDrivePlume(g);
      contentGroup.add(g);
      v.shipModel = g;
      v.shipLen = sceneLen;
      v.shipPrev = v.mesh.position.clone();
    } catch { /* the glyph sprite simply remains */ }
  }
  // TRUE-SCALE VISIBILITY FLOOR. At the true end of the body-size dial a real planet is a fraction of a
  // pixel across at whole-system framing — Earth is about 0.05 px — so "true" came out as "absent", which
  // is not what the setting means. Any floor written in SCENE units is the wrong instrument for that: it
  // is a fixed size in a world whose zoom is not, so it hides bodies when you are zoomed out and bloats
  // them when you are zoomed in, and either way it flattens Jupiter and Mercury to the same dot. The floor
  // belongs in SCREEN space. A body draws at its true size whenever that reaches MIN_BODY_PX and is never
  // allowed below it, so true proportions appear the moment they can be resolved and nothing ever
  // vanishes. Same principle as the construct glyphs, which have always been sized this way.
  // Readable mode is left alone entirely: its sizes are already chosen to read.
  // Per-ROLE pixel floors, exactly as the GM orrery ranks its markers (star 4 / planet 2 / moon 1 px
  // there): when bodies are too far to resolve they become markers, and the marker hierarchy should
  // still say which is the star, which the planet, which the moon — one shared floor made a framed
  // Earth and its Luna read as equals.
  const MIN_PX_STAR = 3.2, MIN_PX_BODY = 2.2, MIN_PX_MOON = 1.2; // on-screen RADIUS in px
  function updateTrueScaleFloor() {
    const perPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH); // scene units per px at unit distance
    for (const b of bodies) {
      if (b.isConstruct || !b.baseScale) continue;
      let k = 1;
      if (bodySize < 0.999 && (b.radiusScene ?? 0) > 0) {
        const minPx = b.isStar ? MIN_PX_STAR : b.satellite ? MIN_PX_MOON : MIN_PX_BODY;
        const dist = camera.position.distanceTo(b.mesh.position);
        const pxR = (b.radiusScene as number) / Math.max(1e-9, perPx * dist);
        if (pxR < minPx) k = minPx / Math.max(1e-9, pxR);
      }
      if (k === b.screenK) continue;
      b.screenK = k;
      b.mesh.scale.set(b.baseScale.x * k, b.baseScale.y * k, b.baseScale.z * k);
    }
  }

  const _shipLook = new THREE.Vector3();
  const _shipDelta = new THREE.Vector3();
  const _lastOrigin = new THREE.Vector3(NaN, 0, 0); // detects a floating-origin rebase between frames

  // G3: a torch ship BRAKES engines-first, so during a deceleration burn the nose points backwards
  // along the path. Decided from the transit sampler's own velocities (v at t and t+60s), not from
  // screen deltas - compression bends the drawn path but cannot fake a burn. The threshold sits an
  // order of magnitude above solar gravity at 1 AU (~0.006 m/s^2), so a gravity coast that happens
  // to be slowing never reads as a burn. Throttled: one ship, four checks a second.
  const BRAKE_ACCEL_MS2 = 0.05;
  const FULL_PLUME_MS2 = 10; // fallback ceiling (~1 g) when the ship's own capability is unknown
  // Per-construct max acceleration (m/s^2) from the HOST, which holds the rule pack the engine
  // definitions live in - the scene itself never reads pack data. Drives thrust01 = the fraction
  // of the ship's OWN drive being used, so a max burn reads super-bright whatever the hull.
  let shipCapability: Record<string, number> | null = null;
  function setShipCapability(map: Record<string, number> | null) { shipCapability = map; }
  let _burnCache = { id: '', atMs: -Infinity, braking: false, thrust01: 0 };
  function shipBurnState(id: string): { braking: boolean; thrust01: number } {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (_burnCache.id === id && now - _burnCache.atMs < 250) return _burnCache;
    let braking = false, thrust01 = 0;
    const node = currentSystem?.nodes.find((n) => n.id === id) as any;
    if (node?.scheduled_journeys?.length) {
      const k1 = sampleJourneyKinematicsAtTime(currentSystem!, node, timeMs);
      const k2 = k1?.state === 'Transit' ? sampleJourneyKinematicsAtTime(currentSystem!, node, timeMs + 60_000) : null;
      if (k1 && k2) {
        const v1 = k1.velocity_ms as any, v2 = k2.velocity_ms as any;
        const ax = (v2.x - v1.x) / 60, ay = (v2.y - v1.y) / 60, az = ((v2.z ?? 0) - (v1.z ?? 0)) / 60;
        const aMag = Math.hypot(ax, ay, az);
        const dot = ax * v1.x + ay * v1.y + az * (v1.z ?? 0);
        braking = aMag > BRAKE_ACCEL_MS2 && dot < 0;
        const cap = Math.max(0.01, shipCapability?.[id] ?? FULL_PLUME_MS2);
        thrust01 = aMag > BRAKE_ACCEL_MS2 ? Math.min(1, aMag / cap) : 0;
      }
    }
    _burnCache = { id, atMs: now, braking, thrust01 };
    return _burnCache;
  }

  // G3: the drive plume - thrust feedback at the stern. Attached INSIDE the display model at the
  // oriented hull's -Z face centre (the convention makes the nozzle end derivable, no authoring
  // needed), so it rides every flip and turn for free: a braking ship's plume points prograde
  // because the whole ship does. Length and light scale with the SAMPLED acceleration - a coasting
  // ship shows nothing, which is the honest reading. Colour is a hot blue-white for now; exhaust
  // colour per engine belongs in rule-pack DATA when the finish menu lands (recorded follow-up).
  function attachDrivePlume(model: THREE.Group): ShipFx {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const sternZ = box.isEmpty() ? -0.5 : box.min.z;
    const holder = new THREE.Group();
    holder.position.set(0, 0, sternZ);
    // Cone flaring aft: apex at the nozzle, widening along -Z. ConeGeometry points +Y; the
    // rotation maps local +Y onto -Z, so scaling cone.scale.y lengthens the plume astern.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    cone.rotation.x = Math.PI / 2;
    holder.add(cone);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: 0xdff0ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    holder.add(glow);
    const light = new THREE.PointLight(0xbfe2ff, 0, 3.2, 2); // intensity driven per frame
    holder.add(light);
    holder.visible = false;
    model.add(holder);
    return { holder, cone, glow, light };
  }
  function updateConstructs() {
    const f = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
    // A rebase shifts every position by one constant vector; a motion delta measured across it
    // would read as a huge false velocity and slew the ship. Resync instead of orienting.
    const rebased = !_lastOrigin.equals(originShift);
    _lastOrigin.copy(originShift);
    for (const b of bodies) {
      if (!b.isConstruct) continue;
      const inFocus = visibleSet.has(b.id);
      // G3: the hull replaces the glyph whenever it would be BIG ENOUGH TO READ - the pixel LOD
      // from the design (§6/§7), same philosophy as the bodies' A9 floors but inverted: a body
      // too small to see is floored up, a ship too small to read hands back to its icon. At the
      // readable end of the dial a focused ship fills the frame; at true scale it is honestly a
      // dot until the camera comes down to it. The model contributes no radius anywhere.
      const distToCam = camera.position.distanceTo(b.mesh.position);
      const pxLen = (b.shipLen ?? 0) / Math.max(1e-12, f * distToCam);
      const showModel = !!b.shipModel && !b.surfaceLock && pxLen >= SHIP_MODEL_MIN_PX;
      if (b.shipModel) {
        b.shipModel.visible = showModel;
        if (showModel) {
          b.shipModel.position.copy(b.mesh.position);
          if (!b.shipPrev) b.shipPrev = b.mesh.position.clone();
          _shipDelta.copy(b.mesh.position).sub(b.shipPrev);
          const burn = shipBurnState(b.id);
          // Nose-first along its motion (ModelRef convention: nose +Z, drive -Z), wings level to
          // the scene - and FLIPPED during a deceleration burn, because a torch ship brakes
          // engines-first. Holds its last heading when parked or the clock is paused.
          if (!rebased && _shipDelta.lengthSq() > 1e-14) {
            if (burn.braking) _shipDelta.negate();
            b.shipModel.lookAt(_shipLook.copy(b.mesh.position).add(_shipDelta));
          }
          // Drive plume: length and light scale with the fraction of the ship's OWN drive in use -
          // quadratic so a station-keeping puff whispers and a 100% torch burn is SUPER bright and
          // long. Rides the stern inside the model, so the brake flip points it prograde for free.
          const fx = b.shipFx;
          if (fx) {
            const t = burn.thrust01;
            fx.holder.visible = t > 0;
            if (t > 0) {
              const len = 0.3 + 2.6 * t * t + 0.5 * t;         // up to ~3.4 hull-lengths at 100%
              const width = 0.55 + 1.1 * t;
              fx.cone.scale.set(width, len, width);
              fx.cone.position.z = -len / 2;                    // keep the apex at the nozzle
              (fx.cone.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.5 * t;
              fx.glow.scale.setScalar(0.14 + 0.4 * t);
              (fx.glow.material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * t;
              fx.light.intensity = 7 * t * t;                   // the SUPER-bright end is the light
            } else {
              fx.light.intensity = 0;
            }
          }
        } else if (b.shipFx) {
          b.shipFx.holder.visible = false;
          b.shipFx.light.intensity = 0;
        }
        b.shipPrev ? b.shipPrev.copy(b.mesh.position) : (b.shipPrev = b.mesh.position.clone());
      }
      (b.mesh as THREE.Sprite).visible = !showModel;
      (b.mesh as THREE.Sprite).scale.setScalar((inFocus ? CONSTRUCT_PX_FOCUS : CONSTRUCT_PX_IDLE) * f);
      ((b.mesh as THREE.Sprite).material as THREE.SpriteMaterial).opacity = inFocus ? 1 : 0.45;
    }
  }

  // Ease the camera to the configured framing — either the whole system or the focused body — at the
  // configured tilt (angle from vertical). Then keep the target gently centred so a followed body
  // stays in view as it orbits, without fighting the user's own rotate/zoom.
  function driveFocus() {
    const b = !framingWhole && focusedId && followEngaged ? bodies.find((x) => x.id === focusedId) : undefined;
    // A focused belt isn't a body — it's an annulus about the star, framed specially below.
    const beltFocus = !framingWhole && focusedId && followEngaged && !b ? beltVisuals.find((x) => x.id === focusedId) : undefined;
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
      desiredTarget.copy(originShift); // the system centre, wherever the floating origin has put it
      outward.set(0, 0, 1); // azimuth reference for the whole-system framing
      // Everything the scene draws sits inside a sphere of GRID_RADIUS about the origin, by construction
      // (compressScalar maps the outermost body to exactly that). So the honest fit is the BOUNDING
      // SPHERE, not a flat half-extent: at a tilt the near edge of the disc is closer to the camera than
      // the centre and projects larger, which a flat estimate does not see — it left the outer orbits
      // clipping off the bottom of a 64° shot. R / sin(half-fov) fits a sphere of radius R at any tilt.
      // (The old fixed GRID_RADIUS * 1.5 ignored the lens altogether: at fov 45 it framed a half-extent
      // of 7.5 out of the 12 that exist, so "frame whole system" cut off the outer third of everything.)
      const wholeR = GRID_RADIUS * 1.06; // a little border so the outermost orbit is not flush with the edge
      const halfV = (camera.fov * Math.PI) / 360;
      const halfH = Math.atan(Math.tan(halfV) * Math.max(1e-6, camera.aspect));
      dist = wholeR / Math.max(1e-6, Math.sin(Math.min(halfV, halfH)));
    } else if (focusedId && beltFocus) {
      // A belt/ring-of-debris is centred on the star: keep the star centred and pull back so the
      // whole annulus fits — same overhead-at-angle shot, framed to the ring rather than one body.
      desiredTarget.copy(originShift); // a belt is centred on the star, not on the floating origin
      outward.set(0, 0, 1);
      dist = Math.max(GRID_RADIUS * 0.4, beltFocus.outerScene * 1.9);
    } else {
      // No focus, per-body framing → leave the camera where the user put it. Still drain focusDrive
      // so a stale ease counter doesn't permanently block the auto view-orbit turntable.
      if (focusDrive > 0) focusDrive--;
      return;
    }
    if (lockRotate) {
      // Heading locked = BE the GM orrery: the shot is target + distance on a FROZEN heading, placed
      // exactly every frame — rotation is impossible by construction, mid-ease included. (Lerping the
      // camera as a free point let the ease's own transients rotate the settled shot.)
      const pol = flatOverhead ? LOCK_POLAR : framingAngleRad;
      headingDir.set(Math.sin(pol) * Math.sin(lockedHeading), Math.cos(pol), Math.sin(pol) * Math.cos(lockedHeading));
      if (focusDrive > 0) {
        // Ease: the target slides to the body while the DISTANCE eases to the level's framing.
        controls.target.lerp(desiredTarget, 0.18);
        const curD = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).addScaledVector(headingDir, curD + (dist - curD) * 0.14);
        focusDrive--;
        return;
      }
      // Follow: snap the target onto the body (the orrery's renderPan — no easing, or it lags) and
      // keep the user's distance, auto-framing it via the shared policy. Wheel zoom changes the
      // distance; the heading cannot move.
      let d = camera.position.distanceTo(controls.target);
      controls.target.copy(desiredTarget);
      if (!userZoomOverride) {
        const now = performance.now();
        const next = autoFrameStep({
          current: lastAutoDist > 0 ? lastAutoDist : d,
          ideal: dist,                       // the current ladder level's framing distance
          userOverride: userZoomOverride,
          sinceLastMs: now - lastAutoDistMs,
          // This is a camera DISTANCE, not the orrery's zoom scalar — the policy's default floor of
          // 0.05 would hold the camera thousands of radii from a true-scale world. Our floor is the
          // controls' own minimum approach.
          minValue: Math.max(1e-7, controls.minDistance)
        });
        if (next !== null) { d = next; lastAutoDist = next; lastAutoDistMs = now; }
        else if (lastAutoDist > 0) d = lastAutoDist;
      }
      camera.position.copy(controls.target).addScaledVector(headingDir, d);
      return;
    }
    // Camera offset = tilt from vertical: up·cos(angle) + outward·sin(angle). angle 0 => overhead.
    const ca = Math.cos(framingAngleRad);
    const sa = Math.sin(framingAngleRad);
    desiredCam.copy(desiredTarget).addScaledVector(UP, ca * dist).addScaledVector(outward, sa * dist);
    if (focusDrive > 0) {
      controls.target.lerp(desiredTarget, 0.18);
      camera.position.lerp(desiredCam, 0.14);
      // 48 frames of a 0.14 lerp closes about three orders of magnitude, which was always enough for
      // readable-scale distances. Framing a TRUE-scale world spans six — the ease used to expire while
      // the camera was still hundreds of radii out, leaving the planet a marker in an empty frame. So
      // the drive only expires when the shot has actually been reached (or the user grabs the zoom):
      // hold the counter at 1 while the distance is still >5% off the framed ideal.
      const arrived = camera.position.distanceTo(controls.target) <= dist * 1.05;
      if (focusDrive > 1 || arrived || userZoomOverride) focusDrive--;
      return;
    }
    // Free heading (3D): the camera TRAVELS WITH the body, keeping the offset the user has chosen —
    // their heading and their distance — so a selected world stays framed as it moves along its orbit.
    //
    // This used to only re-aim: the target lerped onto the body while the camera stayed where it stood.
    // Turning to track reads well for a second and then fails, because a body orbiting AWAY from a fixed
    // camera gets further away every frame — the shot quietly retreated until the planet was a dot in an
    // empty frame. Rotating in place cannot hold a distance; only travelling with the body can.
    //
    // Everything else still works BECAUSE the offset is what is preserved: dragging orbits the body
    // (OrbitControls rewrites this same offset), the wheel changes its length, the turntable spins it,
    // and re-clicking re-frames through the ladder above, which arms `focusDrive` and eases to the new
    // distance. The target is COPIED, not lerped — a lerp lags a fast-moving moon off centre, which is
    // why the locked-heading branch above copies too.
    followOffset.subVectors(camera.position, controls.target);
    controls.target.copy(desiredTarget);
    camera.position.addVectors(controls.target, followOffset);
  }

  // A planetary RING has no body of its own in the holo — selecting one (GM menu, follow-GM) frames
  // its PARENT PLANET with the ring in shot, matching the orrery's behaviour. Level 2 (planet + its
  // satellites) is the natural "planet and its ring" framing when it exists.
  function ringParentOf(id: string | null): string | null {
    if (!id || !currentSystem) return null;
    const n = (currentSystem.nodes as any[]).find((x) => x.id === id);
    return n && n.roleHint === 'ring' && n.parentId ? n.parentId : null;
  }

  function focusBody(id: string | null) {
    const ringParent = ringParentOf(id);
    if (ringParent) {
      focusBody(ringParent);
      if (!framingWhole && levelsForBody(ringParent).includes(2)) focusLevel = 2;
      return;
    }
    if (id === focusedId) return; // same body: a re-CLICK steps the ladder (see the pointer handler)
    focusedId = id;
    focusLevel = firstFrameLevel(levelsForBody(id)); // a NEW selection starts at its first existing level
    followEngaged = !!id; // a selection (re)engages the follow; a pan drag hands the view to the user
    userZoomOverride = false; // an explicit (re)frame re-engages auto-framing, as in the orrery
    if (framingWhole) { visibleSet = getVisibleNodeIds(currentSystem, focusedId); return; } // whole: select only — the camera never moves
    lastAutoDist = 0;
    // Tighten the min-zoom to the focused body's rendered size so a tiny true-scale world can still be
    // brought up large on screen — the viewer doesn't need to know the size to get the right zoom.
    const bv = id ? bodies.find((x) => x.id === id) : undefined;
    const rad = bv ? (bv.radiusScene || ((bv.shipModel && bv.shipLen) ? bv.shipLen / 2 : 0)) : 0;
    // The lower clamp tracks the body: a true-scale world is ~1e-5 scene units, and a fixed 0.004 clamp
    // would hold the camera thousands of radii out from the thing it just framed. A true-scale SHIP
    // is smaller again (~1e-9), so a modelled construct may take the floor further down.
    const minFloor = bv?.shipModel ? 1e-10 : 1e-6;
    controls.minDistance = id ? Math.max(minFloor, Math.min(DEFAULT_MIN_DIST, rad * 1.15)) : unfocusedMinDist();
    focusDrive = id ? 48 : 0; // ~0.8 s of easing toward the framed shot
    visibleSet = getVisibleNodeIds(currentSystem, focusedId);
  }

  /**
   * Follow the GM's ladder: focus the body AND take its exact framing level (a re-click or Reset View
   * on the GM's side doesn't change the focus id, so the level is the only way to mirror the framing).
   * Under whole framing the camera stays fixed — selection still updates.
   */
  function setFocusLevel(id: string, level: number) {
    const ringParent = ringParentOf(id);
    if (ringParent) { setFocusLevel(ringParent, 2); return; } // a ring frames its planet (+ ring) instead
    if (id !== focusedId) focusBody(id); // selection first (sets first level, name set, min-zoom)
    if (framingWhole) return;            // fixed plan view: select-only
    const levels = levelsForBody(id);
    focusLevel = levels.includes(level) ? level : firstFrameLevel(levels);
    focusDrive = 48; // ease into the GM's shot
    followEngaged = true;
    userZoomOverride = false;
    lastAutoDist = 0;
  }

  /**
   * Step back OUT one ladder level — the inverse of a re-click, for browser Back. Returns false when
   * there's nothing left to step out of (no focus, or already at this object's first level), so the
   * caller can carry on up the view hierarchy: unfocus → back to the starmap → leave the page.
   */
  function stepFocusUp(): boolean {
    if (!focusedId) return false;
    const prev = prevFrameLevel(levelsForBody(focusedId), focusLevel);
    if (prev === focusLevel) return false;
    focusLevel = prev;
    focusDrive = 48; // ease back out to the wider shot
    followEngaged = true;
    userZoomOverride = false; // an explicit re-frame re-engages auto-framing
    lastAutoDist = 0;
    return true;
  }

  /**
   * Follow the GM's MANUAL viewport (rough, by design): centre + half-extent in TRUE AU, mapped through
   * this scene's own compression. 2D keeps its frozen heading; 3D takes the same shot raised to its
   * configured tilt. The GM's hand replaces any local follow until the player (re)selects something.
   */
  function setViewportAU(cx: number, cy: number, halfExtentAU: number) {
    followEngaged = false;
    focusDrive = 0;
    positionToScene({ x: cx, y: cy, z: 0 }, tmp);
    controls.target.copy(tmp);
    // Half-extent through the LOCAL radial compression ratio (global ratio when the centre ≈ origin).
    const rAU = Math.hypot(cx, cy);
    const rScene = Math.hypot(tmp.x, tmp.z);
    const k = rAU > 1e-6 ? rScene / rAU : GRID_RADIUS / Math.max(1e-6, rMax);
    const halfScene = Math.max(1e-4, halfExtentAU * k);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const distV = Math.min(controls.maxDistance, Math.max(controls.minDistance,
      halfScene / Math.max(1e-6, tan * Math.min(1, camera.aspect))));
    const pol = flatOverhead ? LOCK_POLAR : framingAngleRad;
    let az = lockedHeading;
    if (!lockRotate) {
      camDir.subVectors(camera.position, controls.target);
      az = Math.hypot(camDir.x, camDir.z) > 1e-6 ? Math.atan2(camDir.x, camDir.z) : lockedHeading;
    }
    headingDir.set(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az));
    camera.position.copy(controls.target).addScaledVector(headingDir, distV);
  }

  // The wheel-zoom floor when NOTHING is focused. 0.05 scene units is right for readable mode (the
  // bodies are 0.1-0.3 units; closer is inside them) and wrong at true scale, where it holds the camera
  // thousands of radii out — the GM can zoom the orrery onto any moon, and this view could not.
  function unfocusedMinDist(): number {
    return bodySize < 0.999 ? 1e-6 : DEFAULT_MIN_DIST;
  }

  function resetView() {
    focusedId = null;
    focusDrive = 0;
    followEngaged = false;
    lockedHeading = 0; // HOME sits on x=0, azimuth 0
    controls.minDistance = unfocusedMinDist();
    resetOrigin(); // HOME_CAM and the target below are stated in absolute scene coordinates
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
    baryScene = new Map();
    starLights = [];
    starVisuals = [];
    auroraVisuals = [];
    magmaVisuals = [];
    lightningVisuals = [];
    plumeVisuals = [];
    cloudVisuals = [];
    starFlareVisuals = [];
    bhDiscInfo.clear();
  }

  function setSystem(system: System | null) {
    perfCount('holo.setSystem'); // a full scene rebuild — the prime suspect for the random slowdowns
    resetOriginForRebuild(); // everything absolute is about to be re-emitted; build it about the centre
    clearContent();
    buildGen++; // invalidate in-flight async loads (ship models) from the previous system
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

    const baryRingPending: any[] = [];
    const pos0 = computeWorldPositions3D(system, timeMs);
    rMax = 0;
    for (const p of pos0.values()) rMax = Math.max(rMax, Math.hypot(p.x, p.y, p.z));
    if (rMax <= 0) rMax = 1;
    rebuildGrid(); // scaled AU rings depend on rMax + compression

    for (const node of system.nodes as any[]) {
      // Belts: a debris band on their (compressed) orbit, never a lone sphere.
      if (isBelt(node)) {
        const belt = beltStyle === 'band'
          ? buildBeltRing(node, positionToSceneAbs)
          : buildBeltBand(node, positionToSceneAbs, beltDetail, timeMs, renderStyle !== 'filled', markerScale());
        if (belt) { contentGroup.add(belt.group); beltVisuals.push(belt); }
        continue;
      }
      // Planetary rings: a differentially-spinning particle disc around the parent planet.
      if (node.roleHint === 'ring') {
        const parent = nodesById.get(node.parentId);
        if (parent) {
          const rv = beltStyle === 'band'
            ? buildPlanetRingBand(node, parent, bodyRadiusScene(parent, isSystemLevel(parent)))
            : buildPlanetRing(node, parent, bodyRadiusScene(parent, isSystemLevel(parent)), beltDetail, timeMs);
          if (rv) { contentGroup.add(rv.pivot); ringVisuals.push(rv); }
        }
        continue;
      }

      const systemLevel = isSystemLevel(node);

      // Orbit path rings — shown under the SAME rule as the body's name (updateOrbitRings). A
      // system-level orbiter gets a heliocentric ring at the origin; a moon gets a ring in its
      // parent's local frame (scaled by the parent's radial compression) that tracks the parent.
      //
      // Constructs get one too. Two of them do not: a ship carrying scheduled journeys is placed by the
      // transit sampler rather than by its orbit, so a ring drawn from that orbit would be a line it is
      // not on; and a construct sitting ON a surface has no orbit to draw — that one is decided per
      // frame in updateOrbitRings, because the surface lock is itself live (a construct can lift off).
      const isJourneying = node.kind === 'construct' && ((node as any).scheduled_journeys || []).length > 0;
      if (node.orbit && !isJourneying) {
        if (node.parentId && nodesById.get(node.parentId)?.kind === 'barycenter') {
          // A member orbits the PAIR's common point, not the star. Deferred: the clearance that holds the
          // pair apart needs the PARTNER's rendered radius, and that is only known once every body exists.
          baryRingPending.push(node);
        } else if (systemLevel) {
          const ring = buildOrbitRing(node, positionToSceneAbs, ringColor(node));
          if (ring) {
            contentGroup.add(ring.loop);
            orbitRings.push({ id: node.id, obj: ring.loop, abs: ring.abs, node });
            rebaseStaticGeometry(ring.loop, ring.abs, sceneOrigin); // emit into the origin's frame
          }
        } else if (node.parentId) {
          const pHelio = pos0.get(node.parentId);
          const rP = pHelio ? Math.hypot(pHelio.x, pHelio.y, pHelio.z) : 0;
          const kP = rP > 1e-9 ? compressScalar(rP) / rP : 0;
          const parentNode = nodesById.get(node.parentId);
          const parentRad = parentNode ? bodyRadiusScene(parentNode, true) : 0;
          const parentTiltRad = (((parentNode as any)?.axial_tilt_deg || 0) * Math.PI) / 180; // C3: the moon's orbit is in the parent's equator
          // A construct is a fixed-screen-size glyph with no rendered globe, so it contributes no radius
          // to the clearance — exactly as its own placement does (radiusScene is 0 for one).
          const selfRad = node.kind === 'construct' ? 0 : bodyRadiusScene(node, false);
          const ring = kP > 0 ? buildMoonOrbitRing(node, kP, compressScalar(rP), parentRad, selfRad, compression, ringColor(node), parentTiltRad) : null;
          if (ring) { contentGroup.add(ring); orbitRings.push({ id: node.id, obj: ring, trackParentId: node.parentId }); }
        }
      }

      if (node.kind === 'barycenter') continue; // barycentres have a ring but no body of their own

      const isStar = node.roleHint === 'star' || (node.kind === 'body' && node.parentId === null);
      const colorHex = safeColor(node);

      let mesh: THREE.Object3D;
      let shadow: BodyVisual['shadow'];
      if (isStar) {
        // Magnetic activity comes from the stellar/activity TAG, not the raw number: the buckets are
        // the published decision, and they give even a quiet sun a surface you can actually see
        // (raw flareActivity 0.05 drew three invisible specks).
        const activity = activityStrength(node.tags);
        const starR = starRadiusScene(node); // responds to the body-size dial like the planets
        const isBH = isBlackHoleNode(node);
        const feeding = isBH && bhFeeding(node);
        if (renderStyle.startsWith('wire')) {
          // In wireframe modes the star is a wireframe too (no photosphere/corona): flat draws plain
          // non-emissive polys, glow adds the emissive glowing vertices — same as the other bodies.
          const glow = renderStyle === 'wire-glow' || renderStyle === 'wire-glow-occ';
          const occluded = renderStyle === 'wire-glow-occ' || renderStyle === 'wire-flat-occ';
          mesh = buildWireframeBody(starR, colorHex, glow, occluded, null, 0.02 * markerScale());
        } else if (isBH) {
          // Black hole: a pure-black event horizon. A quiescent hole shows only a faint photon-ring
          // glow; a FEEDING hole (star/BH_active or accretionEddington>0) gets a bright, hot white-gold
          // inner glow that flickers over time (matching the hot inner edge of its temperature-graded
          // accretion DISC — a separate ring node, coloured white→yellow→red outward).
          // Drawn far smaller than the lens's shadow mask — the lens magnifies the black it finds at
          // the centre, so a full-size sphere would smear black well past the photon ring and eat the
          // starfield. The shader's horizon mask (sized from radiusScene) is the real shadow.
          const eh = new THREE.Mesh(new THREE.SphereGeometry(starR * 0.55, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
          mesh = eh;
          const edd = Math.max(0, Math.min(1, (node as any).accretionEddington ?? (feeding ? 0.5 : 0)));
          // A black hole is BLACK — no big glow ball (that read as a "crystal ball"). The look is the
          // temperature-graded accretion disc + the gravitational-lensing pass wrapping it + a small
          // photon-ring glint (from the lensing). A quiescent hole is a bare, lensed shadow.
          if (feeding) {
            // Auto-generate a glowing, temperature-graded ACCRETION DISC (real BH systems carry no
            // explicit ring node). It's a normal RingVisual so updateRings spins it + tracks the hole;
            // the lensing pass then wraps its far side over/under the shadow (the Interstellar look).
            const rkm = node.radiusKm || 30;
            const discNode = { id: node.id + '-accretion', massKg: 1e24, radiusInnerKm: rkm * 1.6, radiusOuterKm: rkm * (5 + edd * 4) };
            const disc = buildPlanetRing(discNode as any, node, starR, Math.max(beltDetail, 0.7), timeMs);
            if (disc) {
              contentGroup.add(disc.pivot);
              ringVisuals.push(disc);
              bhDiscInfo.set(node.id, { pivot: disc.pivot, inner: starR * 1.6, outer: starR * (5 + edd * 4) });
            }
          }
        } else {
          // Photosphere: an emissive (unlit) textured sphere — granulation + sunspots (spot count
          // scales with the star's flare activity), so you see surface detail and it spins. Under the
          // lo-poly render the star is faceted too (fewer segments), so it isn't left out of the look.
          const isLopolyStar = renderStyle === 'lopoly-filled' || renderStyle === 'lopoly-lines';
          // NB: no flatShading — a star is emissive/unlit (MeshBasicMaterial ignores normals and warns
          // about the property). The faceted look comes from the reduced segment count below.
          const starMat = new THREE.MeshBasicMaterial();
          const st = new THREE.CanvasTexture(makeStarSurfaceTexture(colorHex, activity, node.id));
          st.colorSpace = THREE.SRGBColorSpace;
          starMat.map = st;
          // Limb darkening — the cue that makes a star read as a sphere. Skipped on the lo-poly
          // styles, where flat facets are the whole point.
          if (!isLopolyStar) applyLimbDarkening(starMat, 0.55);
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(starR, isLopolyStar ? 16 : 32, isLopolyStar ? 10 : 24), starMat);
          mesh = sphere;
          // Flares — only for stars whose magnetic activity actually earns them, so a quiet sun
          // adds nothing to the frame.
          if (!isLopolyStar && flaresVisibly(node.tags)) {
            let fseed = 0; for (const ch of String(node.id)) fseed = (fseed + ch.charCodeAt(0) * 13) % 2147483647;
            const fl = buildStellarFlares(starR, `#${colorHex.toString(16).padStart(6, '0')}`, activity, fseed || 1, glowTexture);
            sphere.add(fl.group);
            starFlareVisuals.push(...fl.flares);
          }
          // Lo-poly LINES: glowing vector edges + vertices over the faceted star, matching the planets.
          if (renderStyle === 'lopoly-lines') {
            const lineMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.LineSegments(new THREE.WireframeGeometry(sphere.geometry), lineMat));
            const dotMat = new THREE.PointsMaterial({ color: colorHex, size: Math.max(0.02 * markerScale(), starR * 0.13), sizeAttenuation: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.Points(sphere.geometry, dotMat));
          }
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
        // A quiescent black hole barely lights its surroundings; a feeding one blazes like a real star.
        const light = new THREE.PointLight(isBH && feeding ? 0xcfe4ff : colorHex, isBH ? (feeding ? 2.4 : 0.12) : 2.2, 0, 0);
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
          const wf = buildWireframeBody(radius, selHex, glow, occluded, terrain, 0.02 * markerScale());
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
              t.wrapS = THREE.RepeatWrapping; // wrap the longitude seam so u=0/u=1 blend (no vertical seam line)
              t.anisotropy = renderer.capabilities.getMaxAnisotropy(); // keep surface detail crisp at the limb
              mat.map = t;
            } else {
              mat.color.set(colorHex);
            }
            // Thermal EMISSION: a super-hot / molten surface glows of its own heat (the molten eyeball's
            // substellar hemisphere, or a uniformly incandescent lava world). Self-lit emissiveMap so it
            // shows against space and on the night side.
            if (!useUnlit) {
              const emCanvas = getEmissiveEquirect(node);
              if (emCanvas) {
                const et = new THREE.CanvasTexture(emCanvas);
                et.colorSpace = THREE.SRGBColorSpace;
                et.anisotropy = renderer.capabilities.getMaxAnisotropy();
                const sm = mat as THREE.MeshStandardMaterial;
                sm.emissiveMap = et; sm.emissive = new THREE.Color(0xffffff); sm.emissiveIntensity = 1.15;
              }
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
            const dotMat = new THREE.PointsMaterial({ color: selHex, size: Math.max(0.02 * markerScale(), radius * 0.13), sizeAttenuation: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.Points(sphere.geometry, dotMat));
          }
          // Aurora: an additive emissive shell glowing at the (tilted) magnetic poles, flickering over
          // time. deriveAurora needs air + a field + ionising flux — returns 0 otherwise, so most bodies
          // add nothing. Parented to the sphere, so it tracks position + axial tilt (spin is harmless —
          // the ovals are polar rings). Skipped in the flat/unlit "2D map" look.
          if (!unlit) {
            const aur = deriveAurora(node as any);
            if (aur.strength > 0.06) {
              // One additive shell per emitting gas, stacked at its physical ALTITUDE (purple N₂ fringe
              // low, green O main, crimson O crown high) and fading independently — so at any moment the
              // sky shows one colour or several, never a merged white.
              const ems = auroraEmitters(node as any);
              let seed = 0; for (const ch of String(node.id)) seed = (seed + ch.charCodeAt(0)) % 997;
              ems.forEach((e, i) => {
                const built = buildAuroraShell(radius, e.hex, aur.strength, e.weight / ems[0].weight, e.altitude);
                sphere.add(built.shell);
                auroraVisuals.push({ mat: built.mat, base: built.base, seed: (seed / 997 + i * 0.31) % 1 });
              });
            }
            // Emissive surface activity (3D-only wins) from the shared appearance model. Volcanism =
            // additive hot-spot vents that flicker like heat (lava world = many white-hot; hotspots = a
            // few orange). Cryovolcanism = icy plume jets venting from a pole, thrown far on a low-gravity
            // world (Enceladus). Both parented to the sphere, so they turn with the surface.
            const appear = deriveAppearance(node as any);
            if (appear.magma) {
              const built = buildMagmaVents(radius, appear.magma, String(node.id), hotspotTexture);
              sphere.add(built.group);
              magmaVisuals.push(...built.visuals);
            }
            if (appear.cryoPlumes) {
              const built = buildCryoPlumes(radius, appear.cryoPlumes, String(node.id), plumeTexture);
              sphere.add(built.group);
              plumeVisuals.push(...built.visuals);
            }
            // Storms firing inside the cloud deck — additive, so they read on the night side the way
            // they actually do from orbit. Needs a deck to fire inside: the tag says a world has the
            // convection for lightning, the clouds are what it lights up.
            const storms = lightningStrength((node as any).tags);
            if (storms > 0 && (appear.clouds || appear.cloudDecks.length)) {
              const deckHex = appear.cloudDecks.at(-1)?.colorHex ?? appear.clouds?.colorHex ?? '#e8eef8';
              let lseed = 5; for (const ch of String(node.id)) lseed = (lseed * 31 + ch.charCodeAt(0)) & 0xffffff;
              const built = buildLightning(radius, deckHex, storms, lseed || 1, glowTexture);
              sphere.add(built.group);
              lightningVisuals.push(...built.visuals);
            }
            // Self-luminous glow (a brown dwarf / hot young sub-stellar body radiating its own heat):
            // a dim, cool corona-like halo coloured by the emission temperature (deep red → amber), like
            // a failed star. Reuses the corona glow sprite at a modest scale — a steady dim glow (not a
            // blazing stellar corona).
            if (appear.selfLumGlow) {
              sphere.add(buildSelfLumGlow(radius, appear.selfLumGlow.colorHex, glowTexture));
            }
            // Atmosphere limb-glow: a thin Fresnel halo hugging the silhouette, coloured by the air/haze.
            if (appear.atmGlow) {
              sphere.add(buildAtmoGlow(radius, appear.atmGlow.colorHex, appear.atmGlow.strength));
            }
            // Cloud deck: a separate translucent shell above the surface that DRIFTS on its own — a
            // patchy deck on Earth-likes, an opaque haze veil on Venus-likes. Parented to the sphere so
            // it tracks position/tilt; its extra local spin (updated each frame) makes it float.
            if (appear.clouds) {
              let cseed = 0; for (const ch of String(node.id)) cseed = (cseed + ch.charCodeAt(0) * 7) % 2147483647;
              // A world with a derived deck STACK gets one shell per deck (Jupiter's ammonia over
              // its ammonium-hydrosulphide); a giant, or anything with no stack, keeps the single
              // baked deck — a giant's clouds ARE its surface, so floating shells read wrong on it.
              const cl = (!appear.clouds.giant && appear.cloudDecks.length > 1)
                ? buildDeckStack(radius, appear.cloudDecks, cseed || 1)
                : buildCloudDeck(radius, appear.clouds.colorHex, appear.clouds.colorHex2, appear.clouds.coverage, cseed || 1, appear.clouds.giant);
              sphere.add(cl.group);
              cloudVisuals.push(...cl.layers);
            }
            // Titan's smog is a HIGH haze — outside the cloud shells, not baked into the surface.
            if (appear.tholin?.atmospheric) {
              sphere.add(buildTholinHaze(radius, appear.tholin.colorHex, appear.tholin.strength));
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
      // Constructs are camera-facing sprites — no spin. The SIGN of rotation_period_hours encodes
      // retrograde spin (negative = spins backwards, e.g. Venus/Uranus), so keep it — updateSpin below
      // reads the sign to turn the right way (prograde matches the orbital/ring/disc sense).
      const spinPeriodSec = !isConstruct ? (node.rotation_period_hours || 0) * 3600 || undefined : undefined;
      const tiltRad = ((node.axial_tilt_deg || 0) * Math.PI) / 180;
      const tiltQuat = !isConstruct ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltRad) : undefined;
      // A ship mid-journey is positioned absolutely by the transit sampler — never apply the
      // satellite spread to it, or the spread would distort its transit path.
      const inTransit = isConstruct && (node.scheduled_journeys || []).length > 0;
      const radiusScene = isConstruct ? 0 : (isStar ? starRadiusScene(node) : bodyRadiusScene(node, systemLevel));
      const physRadiusAu = isConstruct ? 0 : (node.physical_parameters?.radiusKm || node.radiusKm || (isStar ? 696000 : 3000)) / AU_KM;
      // Same test the document builder uses (`constructsOf`, systemTopology.ts) so the two cannot
      // disagree about which constructs are on the ground.
      const surfaceDeclared = isConstruct && String((node as any).placement ?? '').toLowerCase() === 'surface';
      // C3: satellites inherit their parent's equatorial frame unless the orbit declares otherwise.
      const parentTiltDeg = (nodesById.get(node.parentId as string) as any)?.axial_tilt_deg || 0;
      const orbitTiltRad = String((node as any).orbit?.frame ?? '').toLowerCase() === 'ecliptic'
        ? 0
        : (parentTiltDeg * Math.PI) / 180;
      bodies.push({ id: node.id, name: String(node.name ?? ''), mesh, label, parentId: node.parentId, framingParentId: (node as any).ui_parentId || node.parentId || null, satellite: !systemLevel && !inTransit, radiusScene, physRadiusAu, surfaceDeclared, orbitTiltRad, spinPeriodSec, tiltQuat, isConstruct, occluderId: !systemLevel ? node.parentId : null, shadow, isBH: isBlackHoleNode(node), tidallyLocked: !isConstruct && !!(node as any).tidallyLocked, isStar, baseScale: mesh.scale.clone(), screenK: 1 });
      // G3: a construct carrying a 3D model loads it in the background; the sprite stands until
      // (and unless) it lands, and stands permanently on a machine that lacks the binary.
      if (isConstruct && (node as any).model?.hash) {
        loadShipModel(bodies[bodies.length - 1], (node as any).model, (node as any).icon_color || '#ffd24d', shipLenScene(node), buildGen);
      }
    }
    // Parents must be POSITIONED before their satellites each frame (satellites anchor to the parent's
    // rendered globe), so order the bodies by tree depth once here rather than trusting node order.
    const depthOf = (id: string | null | undefined): number => {
      let d = 0;
      let cur = id ? nodesById.get(id) : undefined;
      while (cur && cur.parentId && d < 32) { d++; cur = nodesById.get(cur.parentId); }
      return d;
    };
    bodies.sort((a, b) => depthOf(a.id) - depthOf(b.id));
    bodyById = new Map(bodies.map((b) => [b.id, b]));
    // Partner radii for barycentre members (Pluto↔Charon, binary stars) — see baryCoR above.
    baryCoR = new Map();
    {
      const baryIds = new Set((system.nodes as any[]).filter((n) => n.kind === 'barycenter').map((n) => n.id));
      for (const b of bodies) {
        if (b.isConstruct || !b.parentId || !baryIds.has(b.parentId)) continue;
        let m = 0;
        for (const o of bodies) if (o !== b && !o.isConstruct && o.parentId === b.parentId) m = Math.max(m, o.radiusScene ?? 0);
        if (m > 0) baryCoR.set(b.id, m);
      }
    }
    // Barycentre-member orbit rings, now that every partner radius is known. Each is stored in its
    // barycentre's local frame and positioned at that point every frame, exactly as a moon's ring is.
    for (const id of (system.nodes as any[]).filter((n) => n.kind === 'barycenter').map((n) => n.id)) {
      baryScene.set(id, new THREE.Vector3());
    }
    for (const node of baryRingPending) {
      const pBary = pos0.get(node.parentId);
      const rB = pBary ? Math.hypot(pBary.x, pBary.y, pBary.z) : 0;
      const kHelio = rB > 1e-9 ? compressScalar(rB) / rB : 0;
      if (kHelio <= 0) continue;
      const self = bodyById.get(node.id);
      const ring = buildBaryMemberRing(node, kHelio, self?.radiusScene ?? 0, baryCoR.get(node.id) ?? 0, ringColor(node));
      if (ring) { contentGroup.add(ring); orbitRings.push({ id: node.id, obj: ring, trackParentId: node.parentId }); }
    }
    visibleSet = getVisibleNodeIds(system, focusedId);
    updatePositions();
  }

  const tmpParent = new THREE.Vector3();
  const _satEq = { x: 0, y: 0, z: 0 }; // scratch for the satellite equatorial rotation (C3)
  function updatePositions() {
    if (!currentSystem) return;
    const positions = computeWorldPositions3D(currentSystem, timeMs);
    for (const b of bodies) {
      const p = positions.get(b.id);
      if (!p) continue;
      // Satellites AND barycentre members are placed relative to their (compressed) parent point —
      // members are system-level (not satellites) but still need partner clearance around the bary.
      const coRad = baryCoR.get(b.id) ?? 0;
      const parent = b.parentId && (b.satellite || coRad > 0) ? positions.get(b.parentId) : undefined;
      if (parent) {
        // Satellite (moon or orbiting construct): the magnified log-spaced offset is a READABILITY
        // device that belongs to the toytown end of the scale — so it is weighted by `compression`.
        // At compression 0 (true scale / projector) satellites sit exactly where physics puts them;
        // at the toytown end they fan out so a moon system doesn't collapse onto the planet.
        positionToScene(parent, tmpParent);
        // C3: a SATELLITE's elements are quoted in its parent's equatorial frame, so rotate the
        // parent-relative offset into it — the same rotation the rings use, which is what puts moons
        // and rings in one plane. Barycentre members are system-level, not satellites: they must not be
        // rotated, which is why this is gated on `b.satellite` and not merely on having a parent.
        const rawX = p.x - parent.x, rawY = p.y - parent.y, rawZ = p.z - parent.z; // AU offset, system frame
        const eq = b.satellite ? toParentEquator(rawX, rawY, rawZ, b.orbitTiltRad ?? 0, _satEq) : null;
        const ox = eq ? eq.x : rawX, oy = eq ? eq.y : rawY, oz = eq ? eq.z : rawZ;
        const off = Math.hypot(ox, oy, oz);
        const pv = bodyById.get(b.parentId!);
        // Anchor to the parent's RENDERED position, not its raw compressed physics position: whenever the
        // parent itself is displaced (a barycentre member pushed clear of its partner, or a body that is
        // itself a satellite), its moons and stations must ride the globe they orbit — bodies update in
        // parent-before-child order so this is always current. (Unrendered parents — barycentres — keep
        // the physics anchor.)
        if (pv) tmpParent.copy(pv.mesh.position);
        // Surface-locked construct: it sits AT (or below) the parent's physical surface, so instead of
        // riding its own orbit it glues to a fixed surface point that co-rotates with the planet's spin.
        // Capture that point (in the parent's local frame) once, then leave the per-frame placement to
        // updateSurfaceConstructs. Threshold 3% ≈ keeps genuine LEO orbiters (ISS/Tiangong) orbiting.
        // A DECLARED surface construct locks whatever its offset is. That matters because the honest way
        // to author one is with no orbit at all — every surface construct in the bundled maps carries
        // `placement: "Surface"` and no `orbit`, so `off` is 0, and the `off > 1e-12` guard below used to
        // exclude the very case that most plainly means "on the ground". It then fell past the orbital
        // branch too (also gated on `off`), so it was never positioned at all and simply rendered at the
        // parent's centre, motionless. `physRadiusAu` was never the problem — it has a 3000 km fallback
        // and was always present.
        const declaredOnSurface = !!(b.isConstruct && b.surfaceDeclared && pv);
        if (declaredOnSurface || (b.isConstruct && off > 1e-12 && pv && pv.physRadiusAu && off <= pv.physRadiusAu * 1.03)) {
          if (!b.surfaceLock) {
            // With a real offset the authored direction IS the landing site. With none, pick a stable
            // point from the construct's id — deterministic so it does not wander between reloads, and
            // distinct per construct so two stations on one moon (LV-426 has exactly that) do not stack.
            const sceneDir = off > 1e-12 ? tmp.set(ox, oz, oy).normalize() : surfacePointFromId(b.id, tmp);
            const dir0 = sceneDir.clone().applyQuaternion(pv!.mesh.quaternion.clone().invert());
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
          // Globe-relative clearance: a satellite must always clear the parent's RENDERED surface, so at
          // readable body sizes (big globe) moons/constructs are pushed just outside it, staggered by true
          // orbital order — while at true scale (tiny globe) the floor is tiny and real positions stand.
          const moonRad = b.radiusScene ?? 0;
          // Barycentre member: clear the PARTNER's globe (the bary point itself has no surface). Both
          // members push outward along mutually opposite offsets, so 0.62×(sum of radii) each side
          // keeps the pair separated by ≥1.24× the sum — Charon stays outside Pluto in readable mode.
          // (Their heliocentric orbit line can sit a body-width off in that regime — same trade the
          // moon clearance makes; at true scale the radii are tiny and physics stands.)
          const clearance = coRad > 0
            ? (moonRad + coRad) * 0.62
            : parentRad * 1.12 + moonRad + parentRad * 0.4 * Math.log10(1 + off / 0.0006);
          const blend = coRad > 0 && !b.satellite
            ? trueDist // major bodies never take the moon fan-out — just physics + the clearance floor
            : trueDist * (1 - compression) + spreadDist * compression;
          const dist = Math.max(clearance, blend);
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
    // Barycentres carry no mesh but their members' rings hang off them, so their scene points are kept
    // here alongside the bodies (and so they move with a floating-origin rebase like everything else).
    for (const [id, out] of baryScene) {
      const bp = positions.get(id);
      if (bp) positionToScene(bp, out);
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
      // A construct glued to a surface is not on its orbit, so it must not draw one. The lock is live
      // (updatePositions clears it the moment the thing rises above the globe), so the test is too.
      r.obj.visible = visibleSet.has(r.id) && !bodyById.get(r.id)?.surfaceLock;
      if (r.obj.visible && r.trackParentId) {
        const p = bodyById.get(r.trackParentId);
        if (p) r.obj.position.copy(p.mesh.position);
        else {
          const bp = baryScene.get(r.trackParentId); // a barycentre parent has no mesh to track
          if (bp) r.obj.position.copy(bp);
        }
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
      if (!b.tiltQuat) continue;
      // A tidally-locked body keeps ONE face toward its parent — its orientation is a function of where
      // it is in its orbit, NOT a free clock spin. A plain rate-matched spin (below) starts at an
      // arbitrary phase, so each moon ends up locked at a DIFFERENT constant offset (Mimas faces us,
      // Rhea sits 90° out). Geometry-lock it instead: aim the sub-parent meridian at the parent.
      if (b.tidallyLocked && b.parentId && bodyById.has(b.parentId)) { faceParent(b); continue; }
      if (!b.spinPeriodSec) continue;
      // Negated so a prograde body (positive period) turns +X->+Z about +Y — the SAME sense its moons,
      // rings and belts orbit (all +X->+Z in the ground plane) and the way it orbits its own star. A
      // plain +angle would spin the surface the opposite way (a THREE +Y rotation sends +X->-Z), which
      // is what made planets appear to spin backwards against their discs. A negative period (retrograde)
      // flips the sign back, so Venus/Uranus spin the other way as they should.
      const angle = -(tSec / b.spinPeriodSec) * Math.PI * 2;
      spinQuat.setFromAxisAngle(spinAxis, angle); // spin about local (pre-tilt) pole
      b.mesh.quaternion.copy(b.tiltQuat).multiply(spinQuat); // tilt the axis, then spin about it
    }
  }

  // Aim a tidally-locked body's sub-parent meridian (equirect texture centre = local +X) at its parent,
  // rotating only about its (tilted) pole so the axial tilt is preserved. Runs each frame off the LIVE
  // rendered positions, so the near face tracks the parent through the whole orbit — and, since the
  // crater far-side bias lives at the texture edges, the battered anti-parent hemisphere faces away.
  const _pole = new THREE.Vector3(), _toParent = new THREE.Vector3(), _refX = new THREE.Vector3(), _cross = new THREE.Vector3();
  function faceParent(b: BodyVisual) {
    const pv = bodyById.get(b.parentId!);
    if (!pv) { b.mesh.quaternion.copy(b.tiltQuat!); return; }
    _pole.set(0, 1, 0).applyQuaternion(b.tiltQuat!).normalize();          // world spin axis
    _toParent.copy(pv.mesh.position).sub(b.mesh.position);                 // moon → parent
    _toParent.addScaledVector(_pole, -_toParent.dot(_pole));               // project into the equatorial plane
    if (_toParent.lengthSq() < 1e-12) { b.mesh.quaternion.copy(b.tiltQuat!); return; }
    _toParent.normalize();
    _refX.set(1, 0, 0).applyQuaternion(b.tiltQuat!);                       // where +X points at spin angle 0
    _refX.addScaledVector(_pole, -_refX.dot(_pole)).normalize();
    const angle = Math.atan2(_cross.crossVectors(_refX, _toParent).dot(_pole), _refX.dot(_toParent));
    spinQuat.setFromAxisAngle(spinAxis, angle);
    b.mesh.quaternion.copy(b.tiltQuat!).multiply(spinQuat);
  }

  // Surface-locked constructs (see BodyVisual.surfaceLock): re-glue each to its fixed surface point,
  // rotated by the parent's LIVE spin+tilt, so it rides the rendered surface exactly — right at the
  // rendered radius at any scale, and turning with the planet. Runs AFTER updateSpin (fresh parent
  // quaternion) and reuses the parent's stable scene position (set by updatePositions on time change).
  const _surfDir = new THREE.Vector3();
  /**
   * A stable landing site on the unit sphere, derived from the construct's id. Used when a construct
   * declares it is on the surface but carries no offset to say WHERE — the alternative is the centre of
   * the body, which is what this replaced. Deterministic (same id, same spot, every reload) and spread
   * by latitude as well as longitude so two stations on one small moon do not land on each other.
   */
  function surfacePointFromId(id: string, out: THREE.Vector3): THREE.Vector3 {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    const lon = (((h >>> 0) % 65536) / 65536) * Math.PI * 2;
    const lat = Math.asin((((h >>> 11) % 65536) / 65536) * 2 - 1); // asin keeps it uniform over the sphere
    const cl = Math.cos(lat);
    return out.set(cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
  }

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
      // A slow deep SWELL (each colour layer fades nearly out and back on its own phase — so a mixed sky
      // shows one colour, then both, never a merged white) times a fast shimmer for the curtain flicker.
      const swell = 0.5 + 0.5 * Math.sin(nowSec * 0.45 + a.seed * 6.283);
      const shimmer = 0.5 + 0.5 * (0.62 * Math.sin(nowSec * 2.6 + a.seed * 6.283) + 0.38 * Math.sin(nowSec * 5.9 + a.seed * 12.57));
      a.mat.opacity = a.base * (0.08 + 0.92 * swell) * (0.55 + 0.45 * Math.max(0, Math.min(1, shimmer)));
    }
  }

  // Volcanic vents, cryo plumes and their flicker helpers now live in ./bodyFeatures (shared with the
  // 3D gallery). updateMagma/updatePlumes are called below with this scene's visual arrays.

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
      if (parent) {
        rv.pivot.position.copy(parent.mesh.position);
        // A ring is drawn in multiples of its planet's rendered radius, so when the true-scale floor
        // magnifies the planet the ring has to come with it or Saturn loses its rings at true scale.
        rv.pivot.scale.setScalar(parent.screenK ?? 1);
      }
      if (!rv.points && !rv.bandMesh) continue;
      // Star direction in the ring's local (tilted) frame; planet centre is the local origin.
      let hasShadow = false;
      if (starWorld) {
        rv.pivot.updateMatrixWorld();
        _starLocal.copy(starWorld);
        rv.pivot.worldToLocal(_starLocal);
        _shadowDir.copy(_starLocal).multiplyScalar(-1); // planet-centre(origin) → away from star
        if (_shadowDir.lengthSq() > 1e-9) { _shadowDir.normalize(); hasShadow = true; }
      }
      const cr = rv.baseColor.r, cg = rv.baseColor.g, cb = rv.baseColor.b;
      const pr = rv.planetR;
      // The planet's shadow at a point of the flat ring plane: umbra (0.22) inside the planet radius
      // behind it, soft penumbra over a further 0.35·R. One rule for particles AND the flat band.
      const shadeAt = (x: number, z: number): number => {
        if (!hasShadow) return 1;
        const along = x * _shadowDir.x + z * _shadowDir.z; // y is ~0 in the flat ring plane
        if (along <= 0) return 1;
        const px = x - along * _shadowDir.x;
        const pz = z - along * _shadowDir.z;
        const perp = Math.hypot(px, pz);
        return 0.22 + 0.78 * Math.min(1, Math.max(0, (perp - pr) / (pr * 0.35)));
      };
      if (rv.bandMesh) {
        // The band's vertices never move — only the shadow sweeps around as the planet orbits.
        const geo = rv.bandMesh.geometry;
        const parr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
        const cattrB = geo.getAttribute('color') as THREE.BufferAttribute;
        const carrB = cattrB.array as Float32Array;
        for (let i = 0; i < cattrB.count; i++) {
          const shade = shadeAt(parr[3 * i], parr[3 * i + 2]);
          carrB[3 * i] = cr * shade;
          carrB[3 * i + 1] = cg * shade;
          carrB[3 * i + 2] = cb * shade;
        }
        cattrB.needsUpdate = true;
        continue;
      }
      const dt = t - rv.t0Sec;
      const attr = rv.points!.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const cattr = rv.points!.geometry.getAttribute('color') as THREE.BufferAttribute;
      const carr = cattr.array as Float32Array;
      const eb = rv.emissiveBase; // a glowing accretion disc: paint the temp gradient directly, no shadow
      for (let i = 0; i < rv.radii.length; i++) {
        const ang = rv.baseAng[i] + rv.omega[i] * dt;
        const r = rv.radii[i];
        const x = r * Math.cos(ang);
        const z = r * Math.sin(ang);
        arr[3 * i] = x;
        arr[3 * i + 2] = z;
        if (eb) {
          carr[3 * i] = eb[3 * i]; carr[3 * i + 1] = eb[3 * i + 1]; carr[3 * i + 2] = eb[3 * i + 2];
        } else {
          const shade = shadeAt(x, z);
          carr[3 * i] = cr * shade;
          carr[3 * i + 1] = cg * shade;
          carr[3 * i + 2] = cb * shade;
        }
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
      // Ride the host: rocks are baked host-relative, so the group sits AT the host's rendered position
      // (origin for a lone star — no change; a displaced host takes its belt with it, and the Keplerian
      // rock rotation below then spins about the host, not the scene origin).
      const host = bv.parentId ? bodyById.get(bv.parentId) : undefined;
      // No host mesh (a barycentre, or a belt hung straight off the root): the rocks are baked about the
      // ABSOLUTE origin, so the group has to sit where that origin is drawn. Under no rebase originShift
      // is (0,0,0) and this is exactly what it always did.
      if (host) bv.group.position.copy(host.mesh.position);
      else bv.group.position.copy(originShift);
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

  // Feed the lensing pass each black hole's screen position + Einstein radius (in UV). Projects the
  // hole's scene position and its rendered edge to the screen; the Einstein radius is a multiple of the
  // event-horizon's screen radius. Disables the pass when lensing is off or no hole is on screen.
  const _lensCentre = new THREE.Vector3();
  const _lensEdge = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  function updateLensing() {
    if (!lensingOn) { lensingPass.enabled = false; return; }
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0); // camera's world-space right vector
    const arr = lensingPass.uniforms.uBH.value as THREE.Vector4[];
    const discArr = lensingPass.uniforms.uDisc.value as THREE.Vector4[];
    const discNArr = lensingPass.uniforms.uDiscN.value as THREE.Vector2[];
    const aspect = viewW / Math.max(1, viewH);
    let n = 0;
    for (const b of bodies) {
      if (!b.isBH) continue;
      _lensCentre.copy(b.mesh.position).project(camera);
      if (_lensCentre.z >= 1) continue; // behind the camera / clipped
      _lensEdge.copy(b.mesh.position).addScaledVector(_camRight, b.radiusScene ?? 0.02).project(camera);
      // Horizon screen radius in the shader's aspect-corrected UV space (pixels/height).
      const rC = Math.hypot((_lensEdge.x - _lensCentre.x) * 0.5 * aspect, (_lensEdge.y - _lensCentre.y) * 0.5);
      if (rC <= 0.0002) continue; // too small on screen to bother
      const disc = bhDiscInfo.get(b.id);
      arr[n].set(_lensCentre.x * 0.5 + 0.5, _lensCentre.y * 0.5 + 0.5, Math.min(0.5, rC * 0.85), disc ? disc.inner / disc.outer : 0);
      if (disc) feedDiscEllipse(discArr[n], discNArr[n], disc.pivot, b.mesh.position, disc.outer, camera, _lensCentre.x, _lensCentre.y, aspect);
      else { discArr[n].set(0, 0, 0, 0); discNArr[n].set(0, 0); }
      if (++n >= MAX_LENSES) break;
    }
    lensingPass.uniforms.uCount.value = n;
    lensingPass.uniforms.uAspect.value = aspect;
    lensingPass.enabled = n > 0;
  }
  function setLensing(on: boolean) { lensingOn = on; }
  // Isolated-body thumbnail: let the player drag to SPIN the body by hand. Rotate stays on (OrbitControls
  // default) and whether events even reach the scene is gated by the overlay's pointer-events. In spin
  // mode we kill ZOOM (a drag mustn't zoom the little frame away) and DAMPING (so the globe stops the
  // instant the button is released, rather than coasting). Off restores both for the full 3D view.
  function setUserSpin(on: boolean) { controls.enableZoom = !on; controls.enableDamping = !on; }

  function loop() {
    if (disposed) return;
    perfFrame(performance.now()); // slow-spell tracker (logs only when a 5s window dips below 45fps)
    const nowSec = filterClock.getElapsedTime();
    // Gentle horizontal reframe while the info panel is open: ease a camera VIEW OFFSET that shifts the
    // projection centre left, so the framed body sits in the middle of the VISIBLE strip instead of
    // half-hidden under the panel. Because the offset is part of the projection matrix, picking, label
    // projection and the post filter all stay consistent for free.
    if (viewInsetCur !== viewInsetTarget) {
      viewInsetCur += (viewInsetTarget - viewInsetCur) * 0.08;
      if (Math.abs(viewInsetTarget - viewInsetCur) < 0.5) viewInsetCur = viewInsetTarget;
    }
    if (viewInsetCur > 0.5) camera.setViewOffset(viewW, viewH, viewInsetCur / 2, 0, viewW, viewH);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    maybeRebase(); // A19: keep the origin under the camera before anything reads a scene position
    updateGridLevels(); // G10: crossfade the ground grid's two decades as the zoom moves
    driveFocus();
    // Turntable, paused during the focus ease — and never when the heading is locked: autoRotate spins the
    // camera independently of enableRotate, so the lock has to kill it too or the map still drifts round.
    controls.autoRotate = !lockRotate && orbitSpeed > 0 && focusDrive === 0;
    updateSpin();
    updateSurfaceConstructs();
    updateStarFx(nowSec);
    updateAuroras(nowSec);
    updateMagma(magmaVisuals, nowSec);
    updateLightning(lightningVisuals, nowSec);
    updatePlumes(plumeVisuals, nowSec);
    updateStellarFlares(starFlareVisuals, nowSec);
    for (const c of cloudVisuals) c.mesh.rotation.y = nowSec * c.drift; // clouds drift over the surface
    updateConstructs();
    updateTrueScaleFloor();
    updateShadows();
    updateRings();
    updateBelts();
    updateOrbitRings();
    controls.update();
    // Near plane follows the working distance. Framing a true-scale world puts the camera ~1e-5 scene
    // units out, far inside the fixed 0.01 near plane — the framed body would be clipped away as the
    // camera arrived. Tie near to the camera-target distance (2%, floored well below any body) and the
    // clip always sits between the camera and the subject. Only touched when it moves >20%, so the
    // projection matrix is not rebuilt every frame; zoomed out it returns to the usual 0.01.
    {
      const dT = camera.position.distanceTo(controls.target);
      const wantNear = Math.min(0.01, Math.max(1e-8, dT * 0.02));
      if (wantNear < camera.near * 0.8 || wantNear > camera.near * 1.25) { camera.near = wantNear; camera.updateProjectionMatrix(); }
      // The ring sample density is chosen against the working distance, and the dense arc is laid down
      // around where the camera was looking — so a real zoom re-chooses the one, and a body carrying the
      // camera along its orbit eventually walks out of the other. Only while rebased: an un-rebased scene
      // is always uniform and this must not touch it. One ring re-propagates, so it is cheap to be eager.
      if (sceneOrigin.lengthSq() > 0) {
        const zoomed = dT > lastRingCamDist * 1.6 || dT < lastRingCamDist / 1.6;
        const strayed = _ringFocus.addVectors(sceneOrigin, controls.target).distanceTo(lastRingFocus)
          > lastRingCoreArc * RING_FOCUS_SLACK;
        if (zoomed || strayed) emitOrbitRings();
      }
    }
    if (portraitOn) updatePortraitLight(); // AFTER controls.update so the camera basis is current this frame
    updateLabels(); // position/size the in-scene label sprites BEFORE rendering so the filter warps them
    updateLensing();
    if (filterPass) filterPass.uniforms.time.value = nowSec; // drive scanlines/flicker
    if (filterPass || lensingPass.enabled) composer.render();
    else renderer.render(scene, camera);
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
    (lensingPass.material as THREE.Material)?.dispose();
    composer.dispose();
    glowTexture.dispose();
    hotspotTexture.dispose();
    plumeTexture.dispose();
    renderer.dispose();
    pointer.abort();
  }

  return { setSystem, setTime, focusBody, stepFocusUp, setFocusLevel, setViewportAU, setViewInset, setFraming, setSkybox, setSkyStars, setBackground, setCompression, setBeltDetail, setBodyStyle, setRender, setUnlit, setAuroras, setFlatOverhead, setLockRotation, setBeltStyle, setBodySize, setGrid, setGridFalloff, setOrbitSpeed, setLabelColor, setLabelSize, setLabelFont, setLabelsVisible, setHud, setFilter, setLensing, setPortrait, setUserSpin, setShipCapability, resetView, resize, dispose };
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

// A black hole is a star-class 'star/BH' or 'star/BH_active'. Feeding = the active class, or any
// accretion (Eddington fraction > 0) — drives the bright hot accretion glow vs a bare quiescent horizon.
function isBlackHoleNode(node: any): boolean {
  return (node.classes || []).some((c: string) => String(c).includes('BH') || String(c).includes('black-hole'));
}
function bhFeeding(node: any): boolean {
  return node.classes?.[0] === 'star/BH_active' || ((node.accretionEddington ?? 0) > 0.01);
}

type Projector = (p: { x: number; y: number; z: number }, out: THREE.Vector3) => THREE.Vector3;

function orbitPeriodMs(orbit: any): number {
  const n = orbit.n_rad_per_s ?? Math.sqrt((orbit.hostMu || 0) / Math.pow((orbit.elements?.a_AU || 1) * AU_M, 3));
  if (!isFinite(n) || n === 0) return 0;
  return Math.abs((2 * Math.PI) / n) * 1000;
}

/**
 * A heliocentric orbit path. Sampled once into an ABSOLUTE float64 master copy (`abs`) alongside the
 * float32 buffer the GPU reads: the master is what a rebase re-emits from, so moving the origin costs one
 * pass over an array instead of re-propagating 1024 samples per ring (A19).
 */
function buildOrbitRing(node: any, project: Projector, color: number): { loop: THREE.LineLoop; abs: Float64Array } | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const abs = new Float64Array(ORBIT_SAMPLES * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < ORBIT_SAMPLES; i++) {
    project(propagateState3D(node, t0 + (i / ORBIT_SAMPLES) * period).r, v);
    abs[3 * i] = v.x;
    abs[3 * i + 1] = v.y;
    abs[3 * i + 2] = v.z;
  }
  // depthWrite OFF: a transparent ring must not write depth, or a body sitting ON its own orbit (which is
  // coincident in depth) loses the test along the line and the orbit cuts straight through the disc.
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_SAMPLES * 3), 3));
  return { loop: new THREE.LineLoop(geo, mat), abs };
}

/**
 * Re-emit a static float32 vertex buffer from its absolute float64 master, translated by the current
 * origin. The subtraction happens in float64 and is rounded ONCE, so a vertex near the origin keeps every
 * bit it can — which is the whole point: absolutely, a vertex at scene 12 can only be stated to 9.5e-7.
 */
function rebaseStaticGeometry(obj: THREE.Object3D, abs: Float64Array, origin: THREE.Vector3) {
  const attr = (obj as any).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
  if (!attr) return;
  const arr = attr.array as Float32Array;
  const n = Math.min(arr.length, abs.length);
  for (let i = 0; i < n; i += 3) {
    arr[i] = abs[i] - origin.x;
    arr[i + 1] = abs[i + 1] - origin.y;
    arr[i + 2] = abs[i + 2] - origin.z;
  }
  attr.needsUpdate = true;
  (obj as any).geometry?.computeBoundingSphere?.(); // frustum culling reads this, and the centre just moved
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
// C3's satellite-frame rotation now lives in `system/satelliteFrame.ts`, imported at the top of this
// file. It was private here, so the eclipse search (G8) would have had to write a second copy of it —
// and a second copy of a rotation is how a moon and its own orbit ring end up in different planes.

/**
 * A ring in the PARENT's local scene frame, laid down from a per-sample radial rule. Both callers below
 * share it because the ring has to be built with EXACTLY the transform the body's own placement uses, or
 * the body will not sit on it → keeping the two rules beside each other is what stops them drifting.
 *
 * Local by construction, so the numbers stay small whatever the parent's distance: a floating-origin
 * rebase never has to touch these, the object is simply positioned at the parent each frame.
 */
function buildLocalOrbitRing(node: any, color: number, tiltRad: number, distFor: (off: number) => number): THREE.LineLoop | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const pts: THREE.Vector3[] = [];
  const _eq = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < ORBIT_SAMPLES; i++) {
    const raw = propagateState3D(node, t0 + (i / ORBIT_SAMPLES) * period).r; // relative to the parent (AU)
    const r = tiltRad ? toParentEquator(raw.x, raw.y, raw.z, tiltRad, _eq) : raw;
    const off = Math.hypot(r.x, r.y, r.z);
    if (off < 1e-12) continue;
    const k = distFor(off) / off;
    pts.push(new THREE.Vector3(r.x * k, r.z * k, r.y * k)); // physics(x,y,z) → scene(x,z,y)
  }
  if (pts.length < 3) return null;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false }); // see buildOrbitRing
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

function buildMoonOrbitRing(node: any, kHelio: number, localScale: number, parentRadius: number, moonRadius: number, compression: number, color: number, parentTiltRad = 0): THREE.LineLoop | null {
  const eclipticFramed = String(node?.orbit?.frame ?? '').toLowerCase() === 'ecliptic';
  return buildLocalOrbitRing(node, color, eclipticFramed ? 0 : parentTiltRad, (off) => {
    const spreadDist = moonSpread(off, localScale, parentRadius);
    const trueDist = off * kHelio;
    // Same globe-relative clearance as the moon body (updatePositions), so the ring sits under the moon.
    const clearance = parentRadius * 1.12 + moonRadius + parentRadius * 0.4 * Math.log10(1 + off / 0.0006);
    return Math.max(clearance, trueDist * (1 - compression) + spreadDist * compression);
  });
}

/**
 * A barycentre MEMBER's orbit → Pluto and Charon about their common point, rather than about the star.
 *
 * These had no ring at all. A member is "system-level" by the naming rule, so it took the heliocentric
 * branch, which projects a PARENT-relative propagation as if the parent were the origin. For a planet
 * that is true (its parent IS the star, at the origin); for a member it drew a loop a few times 1e-5
 * scene units across AT THE SUN, inside the star's own globe. So the only line anywhere near a framed
 * Pluto was the BARYCENTRE's heliocentric ring → which the pair straddle by design, and which, being a
 * 1024-gon at 12 scene units, sags a chord 1.4x the whole pair separation off the true ellipse.
 *
 * A member takes no equatorial rotation (its elements are system-framed, not quoted in a partner's
 * equator) and no toytown fan-out. The clearance that holds the pair apart at readable body sizes is the
 * only departure from physics, and it is the same rule the member's own placement uses.
 */
function buildBaryMemberRing(node: any, kHelio: number, memberRadius: number, partnerRadius: number, color: number): THREE.LineLoop | null {
  const clearance = (memberRadius + partnerRadius) * 0.62;
  return buildLocalOrbitRing(node, color, 0, (off) => Math.max(clearance, off * kHelio));
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
// aurora strength; `weight` (0..1, relative to the dominant gas) fades the lower-concentration emitters;
// `altitude` (0 low fringe / 1 main band / 2 high tenuous) sets the shell height so a multi-gas sky
// STACKS physically — Earth's purple nitrogen fringe under the green oxygen band, the crimson oxygen
// crown above. The render loop swells each layer independently around its base.
export function buildAuroraShell(radius: number, hex: string, strength: number, weight = 1, altitude = 1): { shell: THREE.Mesh; mat: THREE.MeshBasicMaterial; base: number } {
  const tex = new THREE.CanvasTexture(makeAuroraTexture(hex));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const base = Math.min(0.85, 0.28 + strength * 0.6) * (0.35 + 0.65 * weight);
  mat.opacity = base;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * (1.04 + altitude * 0.025), 28, 20), mat);
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
function buildWireframeBody(radius: number, color: number, glow: boolean, occluded: boolean, terrain?: WireTerrain | null, dotFloor = 0.02): THREE.Group {
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
    const dotMat = new THREE.PointsMaterial({ color, size: Math.max(dotFloor, radius * 0.16), sizeAttenuation: true, transparent: true, opacity: 1, blending, depthWrite: occluded });
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
/**
 * A belt/ring as a flat translucent BAND — the GM orrery's look, for GMs who want the player map to read
 * like their own. The orrery strokes an annulus whose opacity tracks debris density; we sample the belt's
 * real orbit and sweep a strip between its inner and outer edges, so an eccentric belt bends exactly as it
 * does there (and through the same compression as the rocks would). Density → opacity is the SHARED rule,
 * so a belt is equally solid in both views. Static: no buckets, so updateBelts skips it.
 */
function buildBeltRing(node: any, project: Projector): BeltVisual | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const innerKm = node.radiusInnerKm, outerKm = node.radiusOuterKm;
  // Match buildBeltBand's band width so the two styles cover the same ground (±12% fallback).
  let widthFrac = 0.12;
  if (innerKm > 0 && outerKm > innerKm) widthFrac = (outerKm - innerKm) / (innerKm + outerKm);
  const SAMPLES = 128;
  const inner: THREE.Vector3[] = [], outer: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  let outerScene = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const r = propagateState3D(node, t0 + (i / SAMPLES) * period).r;
    const lo = 1 - widthFrac, hi = 1 + widthFrac;
    project({ x: r.x * lo, y: r.y * lo, z: r.z * lo }, v); inner.push(v.clone());
    project({ x: r.x * hi, y: r.y * hi, z: r.z * hi }, v); outer.push(v.clone());
    outerScene = Math.max(outerScene, Math.hypot(v.x, v.z));
  }
  const pos: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = inner[i], b = outer[i], c = inner[i + 1], d = outer[i + 1];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pos.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const isRing = node.roleHint === 'ring';
  const mat = new THREE.MeshBasicMaterial({
    color: isRing ? DEBRIS_RING_COLOR : DEBRIS_BELT_COLOR,
    transparent: true,
    opacity: debrisBandAlpha(node.roleHint, debrisDensityFrac(node.massKg)),
    side: THREE.DoubleSide,
    depthWrite: false // a translucent band must not punch through the bodies (see buildOrbitRing)
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  return { group, buckets: [], t0Sec: 0, id: node.id, outerScene, parentId: node.parentId ?? null };
}

function buildBeltBand(node: any, project: Projector, detail: number, timeMs: number, wire: boolean, markerFloor = 1): BeltVisual | null {
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
  const sizes = [0.1, 0.15, 0.2, 0.12].map((v) => v * markerFloor); // rubble sprites follow the body-size dial
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
  return { group, buckets, t0Sec: timeMs / 1000, id: node.id, outerScene, parentId: node.parentId ?? null };
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

// (The star photosphere texture lives in bodyFeatures as makeStarSurfaceTexture — shared with the
// 3D reference gallery so both draw the same surface.)

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
// The GM orrery's look for a planetary ring: a flat translucent annulus (a shaded disc with a hole)
// instead of orbiting particles — same radius maths and tilt as the particle ring, opacity from the
// SHARED debris-density rule so it reads exactly as solid as the orrery draws it.
function buildPlanetRingBand(node: any, parent: any, planetRenderedR: number): RingVisual | null {
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

  const geo = new THREE.RingGeometry(innerScene, outerScene, 96, 1);
  geo.rotateX(-Math.PI / 2); // annulus into the pivot's ground plane (its +Y = the ring normal)
  // Vertex colours carry the grey AND the planet's shadow (updateRings darkens the arc behind the
  // planet, same test as the particle ring) — so the material colour stays white.
  const base = new THREE.Color(DEBRIS_RING_COLOR);
  const vcount = geo.getAttribute('position').count;
  const colors = new Float32Array(vcount * 3);
  for (let i = 0; i < vcount; i++) { colors[3 * i] = base.r; colors[3 * i + 1] = base.g; colors[3 * i + 2] = base.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: debrisBandAlpha('ring', debrisDensityFrac(node.massKg)),
    side: THREE.DoubleSide,
    depthWrite: false // translucent: must not punch through bodies (see buildOrbitRing)
  });
  const pivot = new THREE.Group();
  // Ring plane = planet equator, same as the particle ring.
  const tiltRad = ((parent.axial_tilt_deg || 0) * Math.PI) / 180;
  pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltRad);
  const bandMesh = new THREE.Mesh(geo, mat);
  pivot.add(bandMesh);
  return {
    pivot, points: null, bandMesh, parentId: parent.id,
    radii: new Float32Array(0), baseAng: new Float32Array(0), omega: new Float32Array(0),
    t0Sec: 0, planetR: planetRenderedR, baseColor: base
  };
}

function buildPlanetRing(node: any, parent: any, planetRenderedR: number, detail: number, timeMs: number): RingVisual | null {
  const isAccretionDisc = isBlackHoleNode(parent);
  const planetKm = parent.physical_parameters?.radiusKm || parent.radiusKm || 60000;
  let innerScene: number;
  let outerScene: number;
  if (node.radiusInnerKm > 0 && node.radiusOuterKm > node.radiusInnerKm) {
    innerScene = (node.radiusInnerKm / planetKm) * planetRenderedR;
    outerScene = (node.radiusOuterKm / planetKm) * planetRenderedR;
  } else if (isAccretionDisc) {
    innerScene = planetRenderedR * 1.6; // just outside the ISCO
    outerScene = planetRenderedR * 6.5;
  } else {
    innerScene = planetRenderedR * 1.35;
    outerScene = planetRenderedR * 2.3;
  }
  // An accretion disc starts at the ISCO and reaches much further than a planet's ring.
  innerScene = Math.max(innerScene, planetRenderedR * (isAccretionDisc ? 1.4 : 1.08));
  outerScene = Math.min(outerScene, planetRenderedR * (isAccretionDisc ? 9 : 4.5));
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
    // A black hole's true Keplerian rate is relativistic (blur/garbage on screen), so an accretion disc
    // uses a tame VISUAL differential rate (inner faster) instead of the physical one.
    omega[i] = isAccretionDisc
      ? 0.9 * Math.pow(innerScene / r, 1.5)
      : (massKg > 0 && rM > 0 ? Math.sqrt((G * massKg) / (rM * rM * rM)) : 0.4 * Math.pow(innerScene / r, 1.5));
    pos[3 * i] = r * Math.cos(ang);
    pos[3 * i + 2] = r * Math.sin(ang);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // A black hole's ring is a glowing ACCRETION DISC: colour each particle by its radius on the hot-inner
  // → red-outer temperature gradient, self-luminous (additive), rather than a cool icy ring.
  const baseColor = new THREE.Color(isAccretionDisc ? 0xffd060 : 0xcdd6e2);
  const colors = new Float32Array(count * 3);
  let emissiveBase: Float32Array | undefined;
  if (isAccretionDisc) {
    emissiveBase = new Float32Array(count * 3);
    const span = Math.max(1e-6, outerScene - innerScene);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      accretionColor((radii[i] - innerScene) / span, tmp);
      colors[3 * i] = emissiveBase[3 * i] = tmp.r;
      colors[3 * i + 1] = emissiveBase[3 * i + 1] = tmp.g;
      colors[3 * i + 2] = emissiveBase[3 * i + 2] = tmp.b;
    }
  } else {
    // Per-particle colour so updateRings can darken the arc that falls in the planet's shadow.
    for (let i = 0; i < count; i++) { colors[3 * i] = baseColor.r; colors[3 * i + 1] = baseColor.g; colors[3 * i + 2] = baseColor.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Rock size is PROPORTIONAL to the planet, full stop. The old absolute floor (0.008 scene units,
  // later scaled by the body-size dial but stopped at 2%) was still ~26x a true-scale Saturn's whole
  // radius — each "rock" was bigger than the planet, and the ring drew as one fused white slab instead
  // of rocks. Proportional keeps the readable end identical (R*0.06 there is ~the old floor anyway)
  // and at true scale the rocks are simply small, which is what rocks are.
  const size = Math.max(1e-7, planetRenderedR * (isAccretionDisc ? 0.09 : 0.06));
  const mat = new THREE.PointsMaterial({ map: getDotTexture(), vertexColors: true, size, sizeAttenuation: true, transparent: true,
    opacity: isAccretionDisc ? Math.min(1, ringOpacity + 0.35) : ringOpacity, depthWrite: false,
    depthTest: !isAccretionDisc, // the disc draws OVER the horizon so its far half is in the buffer for the lens to wrap
    blending: isAccretionDisc ? THREE.AdditiveBlending : THREE.NormalBlending });
  const points = new THREE.Points(geo, mat);

  const pivot = new THREE.Group();
  // Ring plane = planet equator: lay the particles' local +Y normal along the planet's spin axis
  // (tilt = rotation about Z by the axial tilt), matching how the planet sphere is tilted.
  const tiltRad = ((parent.axial_tilt_deg || 0) * Math.PI) / 180;
  pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltRad);
  pivot.add(points);
  return { pivot, points, parentId: parent.id, radii, baseAng, omega, t0Sec: timeMs / 1000, planetR: planetRenderedR, baseColor, emissiveBase };
}



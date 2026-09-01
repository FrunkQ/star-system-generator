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
import { loadModelBytes, isFetchableFromPeer, modelKey } from '$lib/constructs/modelSource';
import { parseModel as parseStoredModel } from '$lib/constructs/modelImport';
import { buildDisplayModel } from '$lib/constructs/modelViewer';
import { megaTypeDef, instanceMegaParams } from '$lib/constructs/megaTypes';
import type { ExoticCapabilities } from '$lib/constructs/exotics';
import { buildMegaGeometry } from '$lib/constructs/megaGeometry';
import { requestModel } from '$lib/constructs/modelFetch';
import { shipBurnAt } from '$lib/constructs/shipBurn';
// Highlight badges on the player's system view. The pill shape is the SAME object as the panel's tag
// chip (tags/tagPill.ts) — nothing here re-invents its padding, radius or proportions. markersFor is
// audience-blind by design (TAG-13): the tags handed in are already the player's redacted snapshot.
import { markersFor, capMarkers, type MapHighlights, type HighlightMarker } from '$lib/tags/mapHighlights';
import { tagPillMetrics, drawTagPill, drawTagPin, drawTagFlag, tagPillWidth, tagPillText, pinAside, flagStaffColor, markerStackStep, TAG_PILL_STEM, TAG_PILL_OVERFLOW_BG, TAG_PILL_OVERFLOW_FG, type MarkerStyleName, type PinTextMode, type FlagStaffColor } from '$lib/tags/tagPill';
import type { TagCategory } from '$lib/tags/tagCategories';
import { routeOf, routePointAt, routeStateAt, type CompactRoute } from '$lib/constructs/shipRoute';
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
import { isLattice, isHexFamily, type MapOverlay } from '$lib/map/mapOverlay';
import { gridLevels, gridLevelOpacity, GRID_LEVEL_PEAK, niceSeries, formatNice } from '$lib/map/niceInterval';
import { gridFadeWindow, GRID_FADE_OFF } from '$lib/map/gridFade';
import { buildLattice, ringEdges, spokeEdges, type GridEdge } from '$lib/map/gridGeometry';
import { latticeFor } from '$lib/map/latticeGeometry';
import { NAKED_EYE_LIMIT, type SkyStar, type SkyMode } from '$lib/map/skyStars';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { satelliteTiltRad, toParentEquator } from '$lib/system/satelliteFrame';
import { propagateState3D } from '$lib/physics/orbits';
import { getNodeColor, getClassColor } from '$lib/rendering/colors';
import { getPlanetTextureEquirect, getPlanetTexture, getEmissiveEquirect } from '$lib/rendering/planetTexture';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { lightningStrength } from '$lib/physics/cloudDecks'; // shared feature model (WS1)
import {
  makeHotspotTexture, makePlumeTexture, makeGlowTexture,
  buildMagmaVents, buildCryoPlumes, buildSelfLumGlow, buildAtmoGlow, buildCloudDeck, buildTholinHaze, buildDeckStack,
  applyLimbDarkening, buildStarLook, updateStarLook, makeStarSurfaceTexture, type StarLookVisual, updateMagma, updatePlumes, updateLightning, buildLightning, type LightningVisual, accretionColor,
  type EmissiveVisual
} from './bodyFeatures'; // shared emissive builders (also used by the 3D gallery)
import { debrisDensityFrac, debrisBandAlpha, DEBRIS_RING_COLOR, DEBRIS_BELT_COLOR } from '$lib/rendering/debris';
// The ONE click-ladder ruleset, shared with the GM's 2D orrery (viewport/camera). We measure the
// distances in SCENE units and it hands back a half-extent in the same space — so the holo (2D locked
// overhead AND 3D at its configured tilt) frames a click exactly like the orrery does.
import { frameLevelsFrom, firstFrameLevel, nextFrameLevel, prevFrameLevel, FRAME_LEVELS } from '$lib/viewport/camera';
import { frameDistanceFor, wholeSystemDistance, beltDistance, headingDirection, hostWouldOcclude } from '$lib/viewport/shotSolver';
import {
  IDENTITY_OFFSET, composeShot, deriveOffset, clampZoom, wheelZoomSpeed, blendToward, shotReached, isIdentity, ownsDistance,
  type ViewOffset, type Shot
} from '$lib/viewport/cameraRig';
import { contextPeerIds, pairContextIds } from '$lib/system/barycentres';
import { activityStrength, flaresVisibly } from '$lib/physics/stellarActivity';
import { perfCount, perfEvent, perfFrame, perfProvider } from '$lib/perfTrace';
import { oblatePolarFactor } from '$lib/rendering/bodyShape';
import { rendersAsGiant } from '$lib/physics/makeup';
import { deriveAurora, auroraEmitter, auroraEmitters } from '$lib/physics/aurora';
import { getVisibleNodeIds } from '$lib/system/visibleNodes';
import { AU_KM, G } from '$lib/constants';
import {
  GRID_RADIUS as SCALE_GRID_RADIUS, STAR_RADIUS as SCALE_STAR_RADIUS,
  dialBlend as scaleDialBlend, bodyRadiusScene as scaleBodyRadiusScene,
  starRadiusScene as scaleStarRadiusScene, shipLengthScene as scaleShipLengthScene,
  physicalRadiusAu,
  markerScale as scaleMarkerScale, readableBodyRadius, wireDotSize as scaleWireDotSize,
  radiusKmOf, starRadiusKmOf, shipLengthMOf
} from '$lib/rendering/scaleLaw';
import {
  sceneUnitsPerPixel, floorScale, flooredSpanScene, bodyMinRadiusPx, constructMinSpanPx
} from '$lib/rendering/pixelFloor';
import type { System } from '$lib/types';

const HOLO_TINT = 0x39c6ff; // cyan hologram chrome (skins wire in later)

// Body render style: solid, or an 80s vector wireframe — glowing/flat points, see-through or with the
// back hidden (an invisible depth-writing occluder culls the far-side edges).
export type RenderStyle = 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ';
// NB there is deliberately NO body-graphics knob here. "Body graphics" (photo / procedural disc / flat
// shape) belongs to the INFO BLOCK — the per-body picture — and never to a system map. The scene once
// carried a flat camera-facing-sprite path for it; it was cut so the map cannot draw one at all.
// Belts & rings: individual tumbling rocks, or the GM orrery's flat translucent band.
// How a belt or ring is DRAWN, as three independent looks rather than two plus a side effect:
//   rocks  — lumpy textured rubble, the default
//   points — plain vector dots, the 80s-display look
//   band   — the GM orrery's flat grey annulus
// `points` used to have no name of its own. It was what you got when the RENDER style was anything
// other than `filled`, decided inside buildBeltBand from a `wire` flag — so the only way to a dotted
// belt was to make every body a wireframe, and the only way to a wireframe scene was to accept dotted
// belts. Two unrelated choices wired together; owner, 2026-08-17: "better coupled — more flex, less
// confusing". Now the render style says nothing about the belts.
export type BeltStyle = 'rocks' | 'points' | 'band';
// GRID_RADIUS / STAR_RADIUS and the whole size law now live in `rendering/scaleLaw.ts` - pure,
// testable, and the single copy (P1 of docs/dev/camera-framing-redesign.md). Re-exported here only
// so the many existing references in this file keep reading naturally.
const GRID_RADIUS = SCALE_GRID_RADIUS; // scene units the outermost data maps to
// Orbit lines are sampled polylines, and the sample count is a TRUE-SCALE accuracy figure, not a
// smoothness one: the body rides the real ellipse while the line is an N-gon cutting inside it, so the
// gap between them oscillates as the body runs vertex-chord-vertex. At 96 samples that chord error on
// Saturn's orbit is ~14 true Saturn radii — invisible under readable body sizes, but at true scale the
// planet visibly floats OFF its own orbit line, and appears to drift on and off it as it moves. 1024
// brings the error under ~0.1 true radii (the line passes through the planet's disc at any framing).
const ORBIT_SAMPLES = 1024;
// G5 ORBIT-LINE OPACITY. The DESIGNED weights: a system-level ring reads slightly stronger than a
// moon's local one. The dial scales both, so their relationship is a property of these two numbers
// and not of the control. NB these are the ORBIT lines - the GRID's rings and spokes are a separate
// thing with their own dial (gridFalloff, RENDER-S24) and are deliberately untouched by this one.
const ORBIT_OPACITY_HELIO = 0.45;
const ORBIT_OPACITY_LOCAL = 0.4;
const R0_AU = 0.35; // log-compression softening radius
const DEFAULT_COMPRESSION = 0.65; // 0 = true scale, 1 = fully log-compressed (GM slider later)
const AU_M = 1.495978707e11;
const STAR_RADIUS = SCALE_STAR_RADIUS; // scene-unit radius of a star photosphere sphere

export interface HoloController {
  /** `reason` is diagnostic only (P2): it labels the rebuild in the [sse-perf] event ring. */
  setSystem(system: System | null, reason?: string): void;
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
  setSkyStars(stars: SkyStar[], mode: SkyMode, opts?: { boost?: number; labelPx?: number }): void;
  setBackground(bg: string): void; // 'space' | 'green' | 'blue' | 'black' (greenscreen for OBS)
  setCompression(v: number): void; // toytown level 0 (true scale) .. 1 (fully compressed)
  setBeltDetail(v: number): void; // GM belt particle-budget quality 0..1 (performance)
  setBodyStyle(mode: 'textured' | 'flat' | 'white' | 'tint'): void; // colour selection ('tint' = legacy white)
  setRender(mode: RenderStyle): void; // filled spheres vs 80s vector wireframe (see-through / back-occluded)
  setUnlit(on: boolean): void; // flat lighting (no terminator) for the efficient "2D map" look
  setAuroras(on: boolean): void;
  setAtmospheres(on: boolean): void; // PERF: build cloud decks / limb glow / haze at all // show/hide the emissive polar aurora shells
  setFlatOverhead(on: boolean): void; // "2D map": tilt pinned top-down (+ pan enabled). Never a 3D view.
  setLockRotation(on: boolean): void; // fix the heading: no spin by drag, and follow a body by PANNING
  setBeltStyle(mode: BeltStyle): void; // belts/rings as rocks, or the orrery's flat band
  setBodySize(v: number): void; // 1 readable .. 0 true physical scale - the MASTER dial
  /** S2c: the construct dial, as a relative OFFSET on the master. 0 = today's look exactly;
   *  positive slides constructs toward readable, negative toward true scale. */
  setConstructOffset(v: number): void;
  setGrid(mode: MapOverlay): void; // ground reference overlay (shared vocabulary, lib/map/mapOverlay.ts)
  setGridFalloff(v: number): void; // G4: 0 = even brightness, 1 = bright near the centre and gone by the edge
  setGridDepth(v: number): void;   // 0 flat .. 1 a full depth curtain under each grid line (3D only)
  setGridScale(v: number): void;   // lattice cell in AU; 0 = automatic decade ladder
  setGridCellReporter(fn: ((au: number | null, kind: 'square' | 'hex' | null) => void) | null): void;
  setOrbitSpeed(v: number): void; // auto view-orbit turntable speed 0..1 (0 = static)
  setLabelColor(hex: string | null): void; // in-scene label colour (null = default); matched to CRT phosphor
  setLabelSize(px: number): void; // in-scene label font size
  setLabelFont(font: string | null): void; // in-scene label font-family (theme font)
  setLabelsVisible(on: boolean): void; // momentary show/hide of in-scene labels (not saved)
  /** G5: orbit-line strength 0..1, a multiplier of each line's designed opacity. 1 = today's look. */
  setOrbitOpacity(v: number): void;
  /** G5: momentary hide of every orbit line (the A53 pattern) - not part of the style, not saved. */
  setOrbitLinesVisible(on: boolean): void;
  /** Highlight badges under each body's name. Tags must already be redacted for the audience (TAG-13). */
  setHighlights(highlights: MapHighlights, categories: TagCategory[], style?: MarkerStyleName, opts?: MarkerOptions): void;
  setHud(canvas: HTMLCanvasElement | null): void; // static info-card overlay, composited INTO the filter
  // GPU post-processing filter (CRT, night-vision, thermal, …) from the ported Mappadux package.
  setFilter(id: string, params?: FilterParamValues): void;
  setLensing(on: boolean): void; // stylised black-hole gravitational lensing (§A13)
  setPortrait(colorHex: string | null, fixed?: boolean): void; // isolated-body PORTRAIT key light in the star's
  // colour at a fixed 3/4 angle (camera-relative; `fixed` = WORLD-fixed for a tidally-locked body). null = off.
  setUserSpin(on: boolean): void; // isolated-body thumbnail: allow hand-drag to spin (rotate only, no zoom)
  // Move transiting constructs along their published route as the clock runs. ON only while the view
  // FOLLOWS the GM's clock: route playback against an arbitrary local clock would show traffic where
  // it is not (the owner's rule, 2026-08-08 - a scrubbing player is looking around, not tracking).
  setTransitMotion(on: boolean): void;
  // G51: the GM's last reported instant, for a view that is NOT following. A ship is then placed by
  // reading its route at the GM's clock rather than by being handed a stamped position - the same
  // answer, at zero bytes. Null (the default, and the GM's own view) keeps the stamped-vector path.
  setGmClock(ms: number | null): void;
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
  /** Highlight badges drawn UNDER the name, in the same canvas — see drawLabel. */
  markers: HighlightMarker[];
  /** Fraction of the canvas height occupied by the name, so the name keeps its gap above the body. */
  nameFraction: number;
}

/** The badge-only knobs a preset carries: size multiplier, flag staff colour, pin text mode. */
export interface MarkerOptions {
  size?: number;
  staff?: FlagStaffColor;
  pinText?: PinTextMode;
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
  /** A surface-stand exotic's span in HOST-RADIUS units — a measurement, not a switch. Its
   *  geometry is built at unit host radius, so the drawn span is this times the host's live drawn
   *  radius; `shipLen` above is kept in scene units from the two, every frame. */
  megaUnitSpan?: number;
  // G53: a ring, shell or swarm SURROUNDS its host - it is drawn CENTRED on the host at its own
  // orbit's drawn radius, not as a lump sitting at a point on that orbit. Set by attachMegaVolume.
  /** G58 N2: the record's DECLARED capabilities, stamped when the exotic shape attaches -
   *  consumers read these (anchor, framing), never a per-behaviour flag (DATA-R33). Absent on
   *  ordinary constructs AND on a mega that fell back to the hull (parity with the old flags:
   *  a blob behaves like a blob). */
  exotic?: ExoticCapabilities;
  // G53: a space elevator. Its geometry is already built in the HOST's drawn currency and stood up
  // by `updateSurfaceConstructs`, so the per-frame hull scaling must not touch it, and the
  // surface-construct model suppression must not hide it - a tether is the one surface construct
  // whose whole point is that it reaches off the ground.
  // WHICH END IS THE NOSE, as a sign on the model's +Z. The ModelRef convention says nose = +Z, but
  // which end of the long axis is the nose is UNKNOWABLE from geometry - it is an authoring choice,
  // and nothing rendered motion until v2.1.477, so a backwards guess had never been visible. The
  // GM's placed NOZZLES settle it from authored data: they mark the stern, so the nose is the other
  // end (+1 = convention, -1 = this model is authored nose-to-minus-Z). No nozzles = trust the
  // convention.
  noseSign?: number;
  nozzleMeanZ?: number | null; // the evidence noseSign was derived from (null = no nozzles placed)
}

interface PlumeRig { holder: THREE.Group; cone: THREE.Mesh; glow: THREE.Sprite; halo: THREE.Sprite; light: THREE.PointLight }
// One rig per authored nozzle (none authored = one at the stern centre, the old behaviour).
interface ShipFx { rigs: PlumeRig[]; suppressed?: boolean }

// A planetary ring: a particle disc in the planet's tilted equatorial plane, spinning DIFFERENTIALLY
// (inner particles orbit faster — that's what makes the rotation visible on an otherwise symmetric
// ring). The pivot carries the tilt + tracks the planet; the particles advance in the local plane.
interface RingVisual {
  pivot: THREE.Group;
  // Outer radius in scene units, in the PARENT's local frame. Named as BeltVisual names it, and for
  // the same reason: a ring's size is its ORBIT, never a body radius, so this is the only honest
  // input to a framing decision about it (A51). It cannot be derived from `radii` - the flat BAND
  // style has no particles and ships an empty array.
  outerScene: number;
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

// The stand-in hull's SURFACE MARKINGS: the construct's glyph repeated over the shell in a
// contrasting shade, rather than one badge stuck on the side. Painted markings read from every
// angle and at every zoom, which a billboard cannot - and a hull with its own livery looks like a
// craft, where a hull wearing a floating symbol looks like a label.
const hullTexCache = new Map<string, THREE.CanvasTexture>();
function getConstructHullTexture(iconType: string | undefined, color: string): THREE.CanvasTexture {
  const shape = iconType || 'triangle';
  const key = `${shape}|${color}`;
  let tex = hullTexCache.get(key);
  if (tex) return tex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(color);
  // Deep enough that the marking reads as ON the hull rather than beside it, and light enough that
  // the hull still reads as its own colour at a glance.
  ctx.fillStyle = `#${base.clone().multiplyScalar(0.35).getHexString()}`;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = `#${base.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`;
  // Two per tile, offset, so the wrap never lines the glyphs up into a stripe round the hull.
  traceConstructIcon(ctx, constructIconShape(shape), S * 0.3, S * 0.3, S * 0.34);
  ctx.fill();
  traceConstructIcon(ctx, constructIconShape(shape), S * 0.75, S * 0.72, S * 0.26);
  ctx.fill();
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2); // a few times round the shell; more reads as noise at a distance
  hullTexCache.set(key, tex);
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
  // GPU-side resource gauge for the perf trace: geometries/textures three still holds alive. If these
  // climb across setSystem cycles while the scene shows the same thing, something survives clearContent
  // — the leak detector for the rebuild-per-snapshot path. Read only when a [sse-perf] line prints.
  perfProvider('gl', () => ({
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    ...(glContextLost ? { contextLost: glContextLost } : {}),
    ...(glContextRestored ? { contextRestored: glContextRestored } : {})
  }));

  // WEBGL CONTEXT LOSS, AS AN INSTRUMENT. Nothing in this app listened for it before (C10, where it
  // was investigated as a cause and refuted). The blindness is the point rather than the fault: a
  // mobile GPU CAN drop a context under memory pressure, and if it ever does, the app currently
  // cannot tell - the canvas holds its last image, no exception is thrown, nothing reaches
  // [sse-perf] or the diagnostic bundle, and the user has an unreportable freeze that a refresh
  // "fixes". Counting it makes the next report answerable in one line instead of a session.
  //
  // preventDefault on the loss event is what PERMITS a restore; without it the browser may never
  // fire `webglcontextrestored`. The actual recovery (rebuilding the scene on restore) is
  // deliberately NOT built here - build it when a counter says it happens, not before.
  let glContextLost = 0;
  let glContextRestored = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    glContextLost++;
    perfCount('holo.glContextLost');
    console.warn('[holo] WebGL context LOST - the scene is frozen from here; a reload restores it.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    glContextRestored++;
    perfCount('holo.glContextRestored');
    console.warn('[holo] WebGL context restored - the scene is NOT rebuilt automatically yet (C10).');
  });

  const scene = new THREE.Scene();
  // Background as scene.background (a colour-managed Color), NOT renderer.setClearColor: a bare clear
  // colour is written to the composer's LINEAR render target without the sRGB->linear decode, so the
  // OutputPass then sRGB-encodes it and lifts the near-black navy into a visibly brighter blue — but
  // ONLY on the composer path (i.e. when a black hole's lensing pass is active). scene.background is
  // decoded consistently whether rendering straight to the canvas or through the composer, so the
  // background matches on both paths. (Proven: clear-colour 5,7,12 -> 38,46,61 via composer; fixed.)
  scene.background = new THREE.Color(0x05070c);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  // The HOME viewing DIRECTION (a 38-degree elevation, the look everyone is used to). Only the
  // direction is fixed here - see homeCam() for why the DISTANCE cannot be.
  const HOME_DIR = new THREE.Vector3(0, 1.1, 1.4).normalize();
  const _homeCam = new THREE.Vector3();
  /**
   * The entry shot, FITTED to the lens instead of hardcoded. A51(b).
   *
   * This was a fixed position, `GRID_RADIUS * (0, 1.1, 1.4)` - 1.78 x GRID_RADIUS from the centre.
   * At a 45-degree vertical fov that shows +/-0.737 x GRID_RADIUS, while `compressRadius` maps the
   * OUTERMOST body to exactly GRID_RADIUS at every compression setting (both its limbs return
   * gridRadius when r = rMax). So the edge of every system has always been outside the entry frame,
   * and it is invisible in the common case because what sits out there is a faint outer planet -
   * but in a BINARY it is a STAR, which is how the owner met it.
   *
   * `wholeSystemDistance` already solves this properly, is tested, and is what `framingWhole` uses:
   * it fits the bounding SPHERE through the lens and takes the narrower of the two half-angles, so
   * a portrait phone is pulled further back rather than cropping. Same answer, one implementation.
   */
  function homeCam(): THREE.Vector3 {
    const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 1;
    const dist = wholeSystemDistance(GRID_RADIUS, { fovYDeg: camera.fov, aspect });
    return _homeCam.copy(HOME_DIR).multiplyScalar(dist);
  }
  camera.position.copy(homeCam());
  scene.add(camera); // so camera-attached screen overlays (the HUD info card) render via RenderPass

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  const DEFAULT_MIN_DIST = 0.05;
  controls.minDistance = DEFAULT_MIN_DIST; // overview floor; focusBody tightens it to the focused body's size
  controls.maxDistance = GRID_RADIUS * 6;
  // The OPEN range: a 3D view may be flown under the ecliptic (RENDER-S14). These must match what
  // `applyPolarLimits` sets, because that only runs on a FRAMING CHANGE - so whatever is written
  // here is what the view actually has until the user alters a framing setting. Setting the old
  // clamp here and the new one there meant the fix never applied to a view nobody re-framed.
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI - 0.001;

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
  // The system map's "Grid depth" — the same curtain dial the starmap has. 0 = flat.
  let gridDepth = 0;
  // The lattice CELL in AU. 0 = automatic (the decade ladder below); anything else pins the grid to a
  // real distance, which is what lets a GM read "one square is 1 AU" off the map instead of watching
  // the cell resize under them as they zoom.
  let gridScaleAu = 0;
  // What the grid is currently worth, reported outward so a view can print "1 square = 1 AU". Fired
  // only on CHANGE: the value moves when the grid rebuilds or a crossfade hands over, which is rare,
  // and a caption re-rendering every frame would be a needless reactive storm.
  let onGridCell: ((au: number | null, kind: 'square' | 'hex' | null) => void) | null = null;
  let reportedCell: number | null = null;
  /**
   * The level a reader would actually count. Both are drawn through the handover, so "the cell" is
   * whichever one is currently winning — and that is decided by ASKING THE CROSSFADE, not by a
   * threshold of our own. A hardcoded midpoint was wrong within a day: A55's second pass moved the
   * crossfade into the last 40% of a decade (`CROSSFADE_START`), so `t < 0.5` became a region where
   * the coarse level always wins and the caption would have gone on naming it long after the fine
   * level had taken the map. One law, one answer.
   */
  function dominantCell(lv: { coarse: number; fine: number; t: number }): number {
    return gridLevelOpacity('fine', lv.t) > gridLevelOpacity('coarse', lv.t) ? lv.fine : lv.coarse;
  }

  function reportGridCell(au: number | null) {
    if (au === reportedCell) return;
    reportedCell = au;
    onGridCell?.(au, au === null ? null : isHexFamily(gridMode) ? 'hex' : 'square');
  }
  // Curtain materials paired with the line material they hang from, so the coarse/fine crossfade in
  // updateGridLevels moves both. A curtain outliving its faded-out line is the fault this prevents.
  let gridSkirtMats: { line: THREE.LineBasicMaterial; skirt: THREE.MeshBasicMaterial }[] = [];
  // G5: how strongly orbit lines are drawn, 0..1, as a MULTIPLIER of each line's designed opacity.
  // 1 is today's look exactly. A 45-planet import buries its own map under 70 orbit lines, which is
  // what this exists for. `orbitLinesVisible` is the MOMENTARY companion (the A53 pattern): not part
  // of the style, not persisted, and gone on reload.
  let orbitOpacity = 1;
  let orbitLinesVisible = true;
  function setOrbitOpacity(v: number) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
    if (clamped === orbitOpacity) return;
    orbitOpacity = clamped;
    updateOrbitRings(); // takes effect now, not at the next clock tick (the clock may be paused)
  }
  function setOrbitLinesVisible(on: boolean) {
    if (on === orbitLinesVisible) return;
    orbitLinesVisible = on;
    updateOrbitRings();
  }
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
  // 0 = the honest picture: charted stars at their true brightness against a full-strength backdrop.
  // Rising, it BOTH dims the generic starfield and lifts the charted stars, because the thing being
  // asked for is CONTRAST between the two populations and one dial is the honest way to express that
  // — pushing only one of them would run out of room. At 1 the charted stars are deliberately
  // oversaturated, which is a presentation choice and no longer a claim about apparent magnitude.
  let skyBoost = 0;
  // Height of a constellation name in SCREEN pixels. 0 = no names, which is how you look at the
  // spikes alone; the spikes are the annotation and the names are a second, separable layer.
  let skyLabelPx = 11;
  function applyStarfield() {
    starfield.visible = skyboxOn && background === 'space';
    // G9: the generic starfield steps BACK as the charted stars are emphasised. Half the contrast dial
    // is here — dimming the scenery is what lets the real systems read without pushing them past
    // white, and it is why one control drives both.
    (starfield.material as THREE.PointsMaterial).opacity = 0.9 * (1 - 0.8 * skyBoost);
  }
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
  // renderOrder sorts WITHIN a pass, and these are transparent, so this only orders them against the
  // backdrop — it does NOT put them behind the opaque bodies. Occlusion is the depth test's job; see
  // the note on the sprite materials.
  skyGroup.renderOrder = -1;
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
      const size = (3.2 + 9.5 * b) * (1 + 0.55 * skyBoost);
      // DEPTH-TESTED, and this is the whole of the occlusion fix. These are transparent, and THREE
      // draws the entire transparent pass AFTER the opaque one whatever `renderOrder` says — that
      // only sorts within a pass. So a sky sprite with depthTest off paints straight over the globe,
      // which is what put Sol's flare on top of Earth. Tested against the depth buffer it is cut at
      // the limb per pixel, which is also the honest picture: a star behind a planet is occulted.
      // depthWrite stays off so the sky never occludes itself.
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({
        map: skyDot(), color: col, transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, opacity: Math.min(1, (0.45 + 0.55 * b) * (1 + 1.7 * skyBoost))
      }));
      dot.position.copy(pos);
      dot.scale.setScalar(size);
      skyGroup.add(dot);
      if (!marked) continue;
      // SPIKES SCALE WITH BRIGHTNESS, longer on the brighter stars exactly as real astrophotography
      // does — which is what turns the derived magnitude from merely correct into readable.
      const spike = new THREE.Sprite(new THREE.SpriteMaterial({
        map: skySpike(), color: col, transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, opacity: Math.min(1, (0.3 + 0.5 * b) * (1 + 1.7 * skyBoost))
      }));
      spike.position.copy(pos);
      spike.scale.setScalar(size * (2.6 + 4.4 * b));
      skyGroup.add(spike);
      // Names belong to the ANNOTATED mode only. In `true` the whole point is that these are
      // indistinguishable from the sky, and a floating name would give the game away. Within `marked`
      // they are separately switchable — a size of 0 leaves the spikes alone on the sky.
      if (skyLabelPx <= 0) continue;
      // Ask for a height in SCREEN pixels and convert once, here, using the live camera and viewport:
      // at a fixed 860 the camera's own wander changes this by about 3%, so a per-frame resize would
      // buy nothing — but a window resize changes it a lot, which is why resize() rebuilds the sky.
      const worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * SKY_RADIUS) / Math.max(1, viewH);
      // Depth-tested like its star: a name still floating over the planet while the star it points at
      // is hidden behind it is worse than no name, because it labels empty sky.
      const label = makeGridLabel(st.name, skyLabelPx * worldPerPx, true);
      if (label) {
        label.position.copy(pos).add(new THREE.Vector3(size * 0.9, size * 0.5, 0));
        skyGroup.add(label);
      }
    }
  }

  function setSkyStars(stars: SkyStar[], mode: SkyMode, opts: { boost?: number; labelPx?: number } = {}) {
    const nextMode: SkyMode = mode ?? 'off';
    const nextBoost = Math.max(0, Math.min(1, opts.boost ?? 0));
    const nextLabelPx = Math.max(0, Math.min(48, opts.labelPx ?? 11));
    // Cheap identity check first: this is re-applied on every prop change and the list is rebuilt by
    // the caller each time, so comparing contents keeps a reactive block from thrashing the geometry.
    const same = nextMode === skyMode && nextBoost === skyBoost && nextLabelPx === skyLabelPx
      && stars.length === skyStars.length
      && stars.every((s, i) => s.id === skyStars[i].id && s.magnitude === skyStars[i].magnitude);
    if (same) return;
    skyStars = stars ?? [];
    skyMode = nextMode;
    skyBoost = nextBoost;
    skyLabelPx = nextLabelPx;
    applyStarfield();   // the boost dims the backdrop, so it has to be re-applied with the sky
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
    rebuildContent('compression');
  }

  // GM belt-detail quality knob (0..1). Physics density (belt mass) sets each belt's RELATIVE
  // richness; this multiplies the overall particle budget for performance. Rebuilds the belts.
  function setBeltDetail(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    if (clamped === beltDetail) return;
    beltDetail = clamped;
    rebuildContent('beltDetail');
  }

  // Body COLOUR selection: 'textured' (procedural true colour), 'flat' (per-class swatch), 'white'
  // (rely on a screen filter to colour it). Shared by filled + wireframe renders. Rebuilds the bodies.
  function setBodyStyle(mode: 'textured' | 'flat' | 'white' | 'tint') {
    const m = mode === 'tint' ? 'white' : mode; // 'tint' is the legacy name for 'white'
    if (m === bodyStyle) return;
    bodyStyle = m;
    rebuildContent('bodyStyle');
  }

  // Render style: filled spheres, or an 80s vector wireframe (glowing or flat points). Rebuilds bodies.
  function setRender(mode: RenderStyle) {
    if (mode === renderStyle) return;
    renderStyle = mode;
    rebuildContent('render');
  }

  // Flat lighting: unlit bodies (no day/night terminator) for the "2D map" look + efficiency. Rebuilds.
  function setUnlit(on: boolean) {
    if (on === unlit) return;
    unlit = on;
    rebuildContent('unlit');
  }

  // Aurora toggle: no rebuild — updateAuroras just stops modulating (opacity 0) when off.
  function setAuroras(on: boolean) { aurorasOn = on; }
  function setAtmospheres(on: boolean) {
    if (on === atmospheresOn) return;
    atmospheresOn = on;
    rebuildContent('atmospheres');
  }


  // Belts & rings: tumbling rocks vs the GM orrery's flat band. Rebuilds.
  function setBeltStyle(mode: BeltStyle) {
    if (mode === beltStyle) return;
    beltStyle = mode;
    rebuildContent('beltStyle');
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
    rebuildContent('bodySize');
  }

  /** S2c: slide constructs relative to bodies. A rebuild, like the master dial, because the
   *  readable endpoint changes rather than only the transform. */
  function setConstructOffset(v: number) {
    const clamped = Math.max(-1, Math.min(1, Number(v) || 0));
    if (clamped === constructOffset) return;
    constructOffset = clamped;
    rebuildContent('constructOffset');
  }

  // How far a SPRITE is allowed to shrink as the body-size dial leaves "readable". The scene draws a
  // good deal that is a marker rather than geometry — wireframe vertex dots, belt rubble, ring particles
  // — and each of those sizes was picked for the readable end and then used at every setting. At TRUE
  // scale a real body shrinks by three or four orders of magnitude and the sprites did not follow, so
  // the planets sat under a wall of boulders lying across their own orbits. They now shrink with the
  // dial, stopping at 2%, below which a belt would cease to exist rather than read as fine dust.
  // NB sprites ONLY. The minimum body radius is not a sprite: the camera is sized off it, so scaling it
  // down puts the framing distance inside the near plane. Body visibility is a screen-space job.
  // The size law lives in `rendering/scaleLaw.ts` (pure, tested - see scaleLaw.spec.ts). These are
  // the scene's bindings of it: they supply the live dial and the system's true-scale factor and
  // do nothing else. Do NOT reintroduce arithmetic here; it is the copy that goes stale.
  function markerScale(): number {
    return scaleMarkerScale(bodySize);
  }
  /** A wireframe/lo-poly vertex dot for a body of this rendered radius. Binding only (RENDER-S11). */
  function wireDotSize(radiusScene: number): number {
    return scaleWireDotSize(radiusScene, bodySize);
  }
  /** The live dial + system extent, as the pure law wants them. */
  function scaleCtx() {
    return { bodySize, constructOffset, rMax, gridRadius: GRID_RADIUS };
  }

  // Rendered sphere radius for a body, blending its readable size toward its true physical size.
  // GEOMETRIC dial blend (owner request, 2026-08-03): sizes interpolate in LOG space -
  // true^(1-v) * readable^v - so every step of the slider multiplies the size by a constant
  // RATIO. The old linear blend spent 20%-90% of the travel looking near-identical (the readable
  // term dominates a 1e-5 true radius almost immediately) and crammed the whole true-scale
  // transition into 0-5%. Log spacing spreads the change evenly across the dial, and as a free
  // consequence ships shrink faster than planets at equal settings - their readable-to-true
  // ratio is larger, so each step multiplies them down harder.
  function dialBlend(trueScene: number, readable: number): number {
    return scaleDialBlend(trueScene, readable, bodySize);
  }

  function bodyRadiusScene(node: any, systemLevel: boolean): number {
    return scaleBodyRadiusScene(radiusKmOf(node), systemLevel, scaleCtx());
  }

  // Rendered star radius: readable STAR_RADIUS at the top of the dial, blending toward its true
  // physical size (a star is still far larger than any planet, so it stays clearly visible).
  function starRadiusScene(node: any): number {
    return scaleStarRadiusScene(starRadiusKmOf(node), scaleCtx());
  }

  // `reason` names the DIAL that asked, so a style rebuild is never mistaken for a snapshot rebuild
  // in the P2 event ring — they are different bugs and the counters could not tell them apart. Note
  // this path always re-passes the SAME object, so it is the one that legitimately reports sameRef.
  function rebuildContent(reason: string) {
    const keepFocus = focusedId;
    if (currentSystem) setSystem(currentSystem, `style:${reason}`);
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

  // HIGHLIGHT SELECTION. Held here and re-resolved per body, so changing it live re-badges the scene
  // without a rebuild — setSystem is expensive and a highlight change touches only the label canvases.
  let highlights: MapHighlights = [];
  let highlightCategories: TagCategory[] = [];
  let highlightStyle: MarkerStyleName = 'label';
  // Size, staff colour and pin text ride together because all three only ever change the BADGE, and
  // all three invalidate exactly the same thing: every label canvas. One object, one guard, one redraw.
  let markerOpts: MarkerOptions = { size: 1, staff: 'silver', pinText: 'initial' };
  function markersForNode(node: any): HighlightMarker[] {
    if (!highlights.length) return [];
    return markersFor(node?.tags, highlights, highlightCategories, highlightStyle);
  }
  function setHighlights(next: MapHighlights, categories: TagCategory[], style: MarkerStyleName = 'label', opts?: MarkerOptions) {
    const o: MarkerOptions = { size: opts?.size ?? 1, staff: opts?.staff ?? 'silver', pinText: opts?.pinText ?? 'initial' };
    // Cheap identity guard: this is fed from a reactive statement that fires on unrelated changes too,
    // and a needless redraw here rebuilds a canvas texture per body.
    const same =
      highlightCategories === categories &&
      highlightStyle === style &&
      markerOpts.size === o.size && markerOpts.staff === o.staff && markerOpts.pinText === o.pinText &&
      highlights.length === next.length &&
      highlights.every((h, i) => h.ref === next[i].ref && h.style === next[i].style);
    if (same) return;
    highlights = next ?? [];
    highlightCategories = categories ?? [];
    highlightStyle = style;
    markerOpts = o;
    const byId = new Map((currentSystem?.nodes ?? []).map((n: any) => [n.id, n]));
    for (const b of bodies) {
      if (!b.label) continue;
      b.label.markers = markersForNode(byId.get(b.id));
      drawLabel(b.label);
    }
  }
  // Clamp matches PlayerPresetEditor's slider range EXACTLY. It used to stop at 40 against a slider
  // that offered 24, which was harmless; raising the slider to 48 without raising this would have made
  // the top of its travel move nothing on screen — the same fault A32/F10 already cost twice.
  function setLabelSize(px: number) { labelSizePx = Math.max(6, Math.min(48, px)); } // applied via sprite scale
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
  function makeLabelSprite(text: string, markers: HighlightMarker[] = []): LabelSprite | undefined {
    if (!text) return undefined;
    const canvas = document.createElement('canvas');
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, -0.25); // anchor below the text so the label floats just above the body
    sprite.renderOrder = 999;      // always drawn on top of the bodies
    sprite.visible = false;
    const ls: LabelSprite = { sprite, canvas, text, aspect: 1, heightRatio: 1, markers, nameFraction: 1 };
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
    const nameH = Math.ceil(fontPx * 1.35) + pad * 2;

    // HIGHLIGHT BADGES, stacked under the name in the SAME canvas — one sprite, so they cannot drift
    // from the name they belong to and they inherit its position and visibility for free. Sized off the
    // label's own font so the hierarchy holds at every label size: a badge is smaller than the name.
    const { shown: capped, overflow } = capMarkers(ls.markers ?? []);
    // 0.6 of the name is the badge's NATURAL size — small enough that the hierarchy holds at every
    // label size. `markerOpts.size` is the GM's multiplier on top of it, because names are sized for
    // reading and markers for spotting and those two wants pull apart on a busy map.
    const pm = tagPillMetrics(fontPx * 0.6 * (markerOpts.size || 1));
    const asideGap = pm.fontPx * 0.45;
    // Rings are drawn round the body by the caller, not in this canvas.
    const badges: { text: string; aside: string; style: string; color: string; textColor: string; step: number; width: number }[] =
      capped
        .filter((m) => m.style !== 'ring')
        .map((m) => {
          const text = tagPillText(m, markerOpts.pinText);
          const aside = pinAside(m, markerOpts.pinText);
          // A pin is as wide as its head, PLUS whatever it sets beside itself; a flag adds its staff.
          const asideW = aside ? asideGap + tagPillWidth(aside, pm, ctx) - pm.padX * 2 : 0;
          return {
            text, aside, style: m.style, color: m.color, textColor: m.textColor,
            step: markerStackStep(m.style as any, pm),
            width: m.style === 'pin'
              ? pm.height + asideW * 2
              : tagPillWidth(text, pm, ctx) + (m.style === 'flag' ? pm.fontPx * 0.09 : 0)
          };
        });
    if (overflow) {
      const text = `+${overflow}`;
      badges.push({ text, aside: '', style: 'label', color: TAG_PILL_OVERFLOW_BG, textColor: TAG_PILL_OVERFLOW_FG,
                    step: pm.rowStep, width: tagPillWidth(text, pm, ctx) });
    }
    const pillW = badges.length ? Math.max(...badges.map((b) => b.width)) : 0;
    const pillsH = badges.reduce((n, b) => n + b.step, 0);

    const cw = Math.max(textW + pad * 2, Math.ceil(pillW) + pad * 2);
    const ch = nameH + Math.ceil(pillsH);
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
    ctx.fillText(ls.text, cw / 2, nameH / 2);

    if (badges.length) {
      ctx.shadowBlur = 0;                                 // the badge is its own background
      let top = nameH;                                    // top of the current badge's row
      for (const b of badges) {
        // A pin and a flag are anchored by their POINT/FOOT, which sits at the BOTTOM of the row —
        // pointing down the stack toward the body the sprite floats above. A pill is centred in it.
        if (b.style === 'pin') {
          // THE PIN STAYS OVER THE THING IT MARKS (owner, 2026-08-17). It used to centre the pin
          // AND its name as one object, which slid the pin off the body by half the name's width —
          // and a map pin that is not above what it points at is not a map pin. The pin therefore
          // keeps the canvas centre, exactly as a nameless one does, and the name runs to its right.
          //
          // What pays for that is WIDTH: the badge reserves the name's room on BOTH sides (see
          // `width` above), because the sprite is centred on the body, so anything added to one side
          // only would shift the whole canvas and take the pin with it. Empty canvas is cheap; a
          // marker pointing at the wrong place is not.
          const pinX = cw / 2;
          drawTagPin(ctx, b.text, pinX, top + b.step, pm, b.color, b.textColor);
          if (b.aside) {
            ctx.font = pm.font;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            // The label beside a pin is CHROME, not part of the badge: it takes the surface's own
            // text colour (the body name's), so it reads as an annotation rather than a second chip.
            ctx.fillStyle = labelColor;
            ctx.fillText(b.aside, pinX + pm.height / 2 + asideGap, top + b.step - pm.fontPx * TAG_PILL_STEM - pm.height * 0.175);
            ctx.textAlign = 'center';
          }
        } else if (b.style === 'flag') {
          drawTagFlag(ctx, b.text, (cw - b.width) / 2, top + b.step, pm, b.color, b.textColor,
                      flagStaffColor(markerOpts.staff, b.color));
        } else {
          drawTagPill(ctx, b.text, (cw - b.width) / 2, top + b.step / 2, pm, b.color, b.textColor);
        }
        top += b.step;
      }
      ctx.font = font;                                    // the badge drawers leave their own font set
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    ls.aspect = cw / ch;
    ls.heightRatio = ch / fontPx; // sprite full height ÷ text height
    // The sprite's anchor is a fraction of its FULL height, so growing it downward with badges would
    // otherwise lift the name away from the body. Hold the name's gap constant instead.
    ls.nameFraction = nameH / ch;
    ls.sprite.center.set(0.5, -0.25 * ls.nameFraction);
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
  // Auto-generated black-hole accretion discs, by BH node id — the lens exempts each disc's projected
  // band so its near side shows in front of the shadow (see lensingShader).
  const bhDiscInfo = new Map<string, { pivot: THREE.Group; inner: number; outer: number }>();
  // Orbit path rings, keyed by node id so they can follow the SAME visibility rule as the names
  // ("if you show a name, show an orbit"). Moon rings carry trackParentId to follow the parent.
  // `abs` = the ring's vertices in ABSOLUTE scene units, kept in float64. A heliocentric ring is the one
  // line a body is judged against, and its buffer is float32, so on a rebase it is re-emitted from this
  // master copy rather than left where it was. See rebaseStaticGeometry.
  let orbitRings: { id: string; obj: THREE.Object3D; trackParentId?: string; abs?: Float64Array; node?: any; refined?: boolean; local?: Float64Array; absMode?: boolean; sample?: (u: number, out: THREE.Vector3) => void }[] = [];
  let starLights: { id: string; light: THREE.PointLight }[] = [];
  // G26: the corona + flares + tag decorations, built by the SHARED builder (bodyFeatures.buildStarLook)
  // the 3D starmap also uses — one look, sized by a radius argument; no second copy of it here.
  let starVisuals: StarLookVisual[] = [];
  let rMax = 1; // largest heliocentric distance in the system (AU), for the compression normaliser
  let compression = DEFAULT_COMPRESSION;
  let beltDetail = 0.6; // GM quality knob: scales belt particle budget (performance), not physics
  let bodyStyle: 'textured' | 'flat' | 'white' = 'textured'; // COLOUR selection: true-colour / class / white
  let unlit = false; // flat lighting (MeshBasic, no terminator) — the efficient "2D map" look
  let aurorasOn = true; // GM toggle: show the emissive polar aurora shells (updateAuroras hides when off)
  // PERFORMANCE: build the atmospheric shells at all — cloud deck(s), limb glow, tholin haze. What
  // this buys is FILL RATE, not memory: the shells are small meshes with cheap textures, and their
  // cost is that each is alpha-blended over the body it wraps, so a cloudy world repaints the same
  // pixels three or four times and a weak GPU is short of precisely that.
  //
  // It REBUILDS rather than hiding, unlike `aurorasOn` next door. Not because hiding would fail to
  // save the blending — `visible = false` would skip the pass just as well — but because only the
  // cloud LAYERS are tracked (`cloudVisuals`); the limb glow and the haze are parented to their
  // sphere and forgotten, so a hide path would mean a registry for all three, built solely to serve a
  // switch that is set once from a preset and never scrubbed. Rebuilding is what `setRender` and
  // `setUnlit` next door already do for the same reason.
  let atmospheresOn = true;
  let beltStyle: BeltStyle = 'rocks'; // rocks vs the orrery's flat band
  let renderStyle: RenderStyle = 'filled'; // filled spheres vs 80s vector wireframe
  let bodySize = 1; // 1 = readable (chunky), 0 = true physical scale (tiny) — fine-tune body sizes
  // S2c: the CONSTRUCT dial, as a relative offset on `bodySize`. 0 is the single-dial law exactly,
  // so nothing moves until a GM asks for it. See ScaleContext.constructOffset for the reasoning.
  let constructOffset = 0;
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
    // ...and the camera rig's record of last frame's shot, which is expressed in scene coordinates
    // like everything else here. MISSING THIS IS A RUNAWAY, not a glitch: `deriveOffset` measures
    // the camera against `lastBase.target`, so a target left in the pre-rebase frame reads as the
    // user having dragged the camera by the whole rebase delta. That offset is then applied to the
    // new base, which moves the camera further out, which makes the next rebase delta bigger.
    // Measured: the zoom offset doubled every frame - 1.1, 2.3, 4.6, 9.2, 18.7, 37.8, 76.5 - until
    // it saturated at maxDistance and the view sat beyond Pluto.
    if (lastBase) {
      lastBase.target.x -= delta.x;
      lastBase.target.y -= delta.y;
      lastBase.target.z -= delta.z;
    }
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

  /** Where along segment [i, j] the point projects, clamped 0..1 - the fractional-centre input. */
  function segmentT(p: THREE.Vector3, a: Float64Array, i: number, j: number): number {
    const ex = a[j] - a[i], ey = a[j + 1] - a[i + 1], ez = a[j + 2] - a[i + 2];
    const ee = ex * ex + ey * ey + ez * ez;
    if (!(ee > 0)) return 0;
    const t = ((p.x - a[i]) * ex + (p.y - a[i + 1]) * ey + (p.z - a[i + 2]) * ez) / ee;
    return Math.max(0, Math.min(1, t));
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
    // ...then how close the CURVE actually comes, via the two segments meeting at that vertex - and
    // WHERE along them, because the refinement is centred on that point. The centre used to be the
    // vertex itself, and that snap was the residual "orbit lines vibrate" report (2026-08-08): a
    // camera riding a moving focus crosses the re-emit slack every few frames, and each re-emit
    // re-centred the dense arc a whole vertex along, redistributing all 1024 samples in a visible
    // step. The FRACTIONAL centre makes the emitted geometry a continuous function of the focus, so
    // consecutive re-emits slide the arc instead of snapping it.
    const n = r.abs.length;
    const prev = (bi - 3 + n) % n, next = (bi + 3) % n;
    const dFwd = distToSegment(focus, r.abs, bi, next);
    const dBack = distToSegment(focus, r.abs, prev, bi);
    const dNear = Math.min(dFwd, dBack);
    const centreFrac = dFwd <= dBack ? segmentT(focus, r.abs, bi, next) : segmentT(focus, r.abs, prev, bi) - 1;
    const period = r.node ? orbitPeriodMs(r.node.orbit) : 0;
    let s = 1;
    if (period > 0 && dNear <= camDist * RING_ADAPT_NEAR) {
      // Chord sag over one facet is R*dTheta^2/8 with dTheta = 2*pi*s/N, so invert that for the tolerance.
      const curveR = Math.max(1e-9, Math.hypot(r.abs[bi], r.abs[bi + 1], r.abs[bi + 2]));
      // Floors lowered for SHIP-scale focus (G3): at a 100 m working distance (~1e-9 units) the
      // old floors (tol 1e-12, s 0.002) clamped the refinement ~3x coarser than the sag budget,
      // so every dense-arc re-centre jumped the line by a visible fraction of the view - the
      // "orbit lines vibrate" report, the A23 fault one scale further down.
      const tol = Math.max(1e-13, camDist * RING_SAG_FRAC);
      s = (ORBIT_SAMPLES * Math.sqrt((8 * tol) / curveR)) / (2 * Math.PI);
      s = Math.max(1e-5, Math.min(1, s));
    }
    if (s >= 0.999) { rebaseStaticGeometry(r.obj, r.abs, sceneOrigin); return Infinity; } // uniform: the master stands
    const attr = (r.obj as any).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
    if (!attr) return Infinity;
    const arr = attr.array as Float32Array;
    const t0 = r.node.orbit.t0 || 0;
    const uCentre = (bi / 3 + centreFrac) / ORBIT_SAMPLES;
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

  /**
   * The working distance, snapped to a sqrt(2) ladder.
   *
   * The refinement's sample density is chosen from this, and re-emitting is triggered by the FOCUS
   * MOVING as well as by zoom - so a camera merely following a body round its orbit re-emitted every
   * few frames with a working distance a hair different each time, which changed the density
   * everywhere and redistributed all 1024 vertices. That is the "orbit lines vibrate a lot" report:
   * not motion in the line, but the line being re-derived slightly differently each time it was asked.
   * Quantised, a re-emit that has not meaningfully changed produces the IDENTICAL buffer, so the
   * shimmer stops without re-emitting any less often - which is the better half of "animate it less
   * often", since a rarer wrong answer is still a visible jump.
   */
  function quantiseDist(d: number): number {
    return 2 ** (Math.round(Math.log2(Math.max(1e-300, d)) * 2) / 2);
  }

  function emitOrbitRings() {
    lastRingCamDist = quantiseDist(camera.position.distanceTo(controls.target));
    lastRingFocus.addVectors(sceneOrigin, controls.target); // the focus, in absolute scene units
    lastRingCoreArc = Infinity;
    for (const r of orbitRings) {
      if (!r.abs) continue;
      const core = emitOrbitRing(r, lastRingCamDist, lastRingFocus);
      r.refined = core !== Infinity;
      lastRingCoreArc = Math.min(lastRingCoreArc, core);
    }
    emitRouteLines(lastRingCamDist);
  }

  /**
   * Re-emit the currently REFINED rings every frame, dense arc centred on the live focus.
   *
   * The event-driven path above re-emits when the focus has strayed a quarter of the dense arc - the
   * right economy for a parked camera, and the wrong one for a camera RIDING a body: the focus then
   * crosses that slack continuously, and each re-emit used to shift the whole arc in one step. With
   * the fractional centre the emitted geometry is a continuous function of the focus, so re-emitting
   * every frame makes the arc SLIDE with the motion - the step disappears because there is no step.
   * ("Animate it less often" was the owner's suggestion; this is the opposite, and the reason is that
   * a rarer re-emit is a bigger step, not a smaller one - smoothness comes from continuity, not
   * cadence.) Cost: only rings that are actually refined re-propagate (typically one, 1024 samples),
   * and a ring that stops qualifying clears its own flag through the return value.
   */
  /**
   * `window.__ringDebug = true`: why is the FOCUSED body's orbit line misbehaving, in one line/s.
   *
   * Exists because the "orbit lines vibrate" report survived TWO fixes (476, 482) - both aimed at
   * the A23 refinement, which only heliocentric rings ever enter. A satellite's ring (the ISS case)
   * is a MOON ring: parent-local float32 vertices positioned at the parent every frame, no float64
   * master, no refinement - a different mechanism entirely. The suspect there is plain float32:
   * vertex-plus-parent magnitudes quantise in steps of ~2^-23 x magnitude, and at a true-scale
   * close-up that step is PIXELS. This prints the prediction (`f32JitterPx`) so one clock-run
   * settles it against the eye: if the number matches the wobble, the mechanism is confirmed; if it
   * is tiny while the line still shakes, the mechanism is something else and the fix is not yet
   * known. kind says which family the focused ring even is - the question the first two fixes
   * never asked.
   */
  let _ringDbgAt = 0;
  function logRingDebug() {
    if (!(window as any).__ringDebug || performance.now() - _ringDbgAt < 1000) return;
    _ringDbgAt = performance.now();
    const camD = camera.position.distanceTo(controls.target);
    const r = orbitRings.find((x) => x.id === focusedId);
    const parentB = r?.trackParentId ? bodyById.get(r.trackParentId) : undefined;
    const attr = r ? ((r.obj as any).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined) : undefined;
    const arr = attr?.array as Float32Array | undefined;
    const vertMag = arr ? Math.hypot(arr[0], arr[1], arr[2]) : null;
    // The magnitude float32 has to carry for a NEAR vertex of this ring, worst case: the local
    // vertex plus the parent's position (the GPU composes both at single precision).
    const worldMag = (parentB?.mesh.position.length() ?? 0) + (vertMag ?? 0);
    const viewWorld = 2 * camD * Math.tan((camera.fov * Math.PI) / 360);
    console.log('[ringdbg]', JSON.stringify({
      focusedId,
      kind: !r ? 'no-ring' : r.abs ? 'heliocentric' : 'moon/local',
      refined: r?.refined ?? false,
      camDist: camD,
      sceneOriginLen: sceneOrigin.length(),
      targetDrift: controls.target.length(),
      parentPosLen: parentB?.mesh.position.length() ?? null,
      vertMag,
      // Predicted on-screen step size of float32 rounding at this zoom, in pixels. >1 = the
      // mechanism is visible; the report was "vibrates a lot", so expect several.
      f32JitterPx: worldMag > 0 && viewWorld > 0 ? (2 ** -23 * worldMag / viewWorld) * viewH : 0
    }));
  }

  function emitRefinedRings() {
    let any = false;
    for (const r of orbitRings) {
      if (!r.refined || !r.abs) continue;
      any = true;
      _ringFocus.addVectors(sceneOrigin, controls.target);
      r.refined = emitOrbitRing(r, lastRingCamDist, _ringFocus) !== Infinity;
    }
    if (any) perfCount('holo.ringRefineFrame');
  }

  // ---- Transit route lines (P3c) -----------------------------------------------------------------
  // A ship under way draws its course the way a body draws its orbit. It shares this file's ring
  // discipline - built in ABSOLUTE scene units through the same projector, re-emitted on a rebase, and
  // hidden by the same visibility pass - but it keeps its own list rather than joining `orbitRings`,
  // because the two differ in the one place that matters: a ring re-emits from a float64 master of
  // FIXED vertices, while a route re-emits by EVALUATING A CURVE at whatever density the camera wants.
  // Folding that into `emitOrbitRing` would have made it a function with two unrelated jobs, which is
  // how the six camera mechanisms of section 1 happened.
  //
  // WHY A CURVE AND NOT THE PUBLISHED POINTS. The knots are few (see shipRoute.ts) and the flown path
  // is an arc; straight chords between knots cut its corner. `routePointAt` is the same centripetal
  // Catmull-Rom the publisher fitted its knots against, so the line drawn here is the line the
  // tolerance was measured on - and because it is analytic it can be subdivided as far as a close-up
  // needs. That is this line's answer to A23, which cannot apply: A23 re-samples a PROPAGATOR, and a
  // player has none (the journeys are stripped).
  const ROUTE_MAX_VERTS = 2048;
  const ROUTE_SAG_FRAC = 1 / 2000; // allowed chord sag as a fraction of the working distance (A23's)
  // `abs` = the tessellated curve in ABSOLUTE scene units, float64, exactly as an orbit ring keeps its
  // master - so a rebase costs one pass instead of re-evaluating the curve, and so the per-frame ship
  // anchor below can be applied to a CLEAN copy every frame rather than accumulating onto itself.
  let routeLines: { id: string; obj: THREE.Line; route: CompactRoute; node: any; abs: Float64Array; count: number }[] = [];
  const _routeP = new THREE.Vector3();
  const _routeQ = new THREE.Vector3();

  /** Accel green, coast yellow, brake red - the 2D orrery's own vocabulary for a committed route. */
  const ROUTE_ACCEL = new THREE.Color(0x33ff66);
  const ROUTE_COAST = new THREE.Color(0xffe066);
  const ROUTE_BRAKE = new THREE.Color(0xff5544);

  /**
   * Re-tessellate every route line for the current working distance and origin.
   *
   * Density is chosen per SPAN from how far that span's curve bows off its own chord: sag falls as
   * 1/n^2, so n = sqrt(bow / tolerance) puts every span at the same visual straightness for the least
   * total vertices. The tolerance is a fraction of the camera's working distance, exactly as A23's
   * is - so this is scale-blind (R3) and a close-up subdivides where a wide shot does not.
   */
  function emitRouteLines(camDist: number) {
    const tol = Math.max(1e-13, camDist * ROUTE_SAG_FRAC);
    for (const r of routeLines) {
      const knots = r.route.p;
      if (knots.length < 2) continue;
      const cols = r.obj.geometry.getAttribute('color') as THREE.BufferAttribute;
      const pos = r.abs;
      const col = cols.array as Float32Array;

      // How much each span bows, measured once in scene units so the budget below is spent where the
      // curve actually bends rather than evenly along a route that is mostly straight.
      const bow: number[] = [];
      let total = 0;
      for (let i = 0; i < knots.length - 1; i++) {
        positionToSceneAbs(routePointAt(r.route, i, 0.5), _routeP);
        positionToSceneAbs(knots[i], _routeQ);
        const ax = _routeQ.x, ay = _routeQ.y, az = _routeQ.z;
        positionToSceneAbs(knots[i + 1], _routeQ);
        const b = Math.hypot(
          _routeP.x - (ax + _routeQ.x) / 2,
          _routeP.y - (ay + _routeQ.y) / 2,
          _routeP.z - (az + _routeQ.z) / 2
        );
        const n = Math.max(2, Math.min(256, Math.ceil(Math.sqrt(b / tol))));
        bow.push(n);
        total += n;
      }
      // Share out the ceiling proportionally if the ideal density would overrun the buffer. The
      // headroom of 24 covers the boundary-vertex duplicates below (one per phase change, and
      // phase changes are bounded by the knot count).
      const squeeze = total + 24 > ROUTE_MAX_VERTS ? (ROUTE_MAX_VERTS - 24) / total : 1;

      // Tessellate first, colour second. Colour has to be decided PER LINE SEGMENT and not per
      // vertex: vertex colours interpolate linearly along each segment, and a straight span carries
      // as few as two vertices, so per-vertex colouring smeared green into yellow across half the
      // journey ("smoothly graduated", the owner's report) instead of switching at the burn knot.
      const pts: RouteNode[] = [];
      for (let i = 0; i < knots.length - 1; i++) {
        const n = Math.max(2, Math.round(bow[i] * squeeze));
        for (let k = 0; k < n; k++) pts.push(routePointAt(r.route, i, k / n));
      }
      pts.push(knots[knots.length - 1]);

      let w = 0;
      const put = (p: RouteNode, c: THREE.Color) => {
        if (w >= ROUTE_MAX_VERTS) return;
        positionToSceneAbs(p, _routeP);
        pos[3 * w] = _routeP.x;
        pos[3 * w + 1] = _routeP.y;
        pos[3 * w + 2] = _routeP.z;
        col[3 * w] = c.r; col[3 * w + 1] = c.g; col[3 * w + 2] = c.b;
        w++;
      };
      // Each segment takes the burn state at its own MIDPOINT time - read through the same
      // dual-source function the plume uses, so a player's colours are the GM's (R11). Midpoint
      // rather than endpoint because the burn windows are inclusive at both ends: sampled AT the
      // knot, the accel's final instant still reports thrusting and the boundary lands one segment
      // late. At a phase change the boundary vertex is written TWICE, once in each phase's colour -
      // coincident vertices, so the interpolation happens over zero length and the change is a hard
      // edge exactly at the burn knot (which is always a vertex: boundaries are forced knots).
      let prev: THREE.Color | null = null;
      for (let i = 0; i < pts.length; i++) {
        let c = prev ?? ROUTE_COAST;
        if (i < pts.length - 1) {
          const burn = shipBurnAt(r.node, (pts[i].t + pts[i + 1].t) / 2);
          c = !burn.thrusting ? ROUTE_COAST : burn.braking ? ROUTE_BRAKE : ROUTE_ACCEL;
        }
        if (prev && c !== prev) put(pts[i], prev); // close the old phase at the boundary
        put(pts[i], c);
        prev = c;
      }

      r.count = w;
      cols.needsUpdate = true;
      r.obj.geometry.setDrawRange(0, w);
    }
  }

  /**
   * Slide the drawn line onto the ship, tapering the correction away over its neighbours.
   *
   * The owner's requirement, and it is not cosmetic: "the line would always go through the vessel".
   * The line and the hull come from the same course but not from the same arithmetic - the hull sits
   * where the GM STAMPED it (a point of the dense flown path), the line is a curve fitted through a
   * dozen knots - so they may differ by the fit tolerance, a fifth of a percent of the route. That is
   * invisible across a whole route and glaring when the ship is framed, which is exactly the shot the
   * construct ladder now offers. Correcting only the nearest vertex would kink; the cosine taper
   * spreads it over a handful either side, so the line meets the ship and nothing else moves visibly.
   */
  function anchorRouteToShip(r: { id: string }, pos: Float32Array, count: number) {
    const b = bodyById.get(r.id);
    if (!b || count < 2) return;
    // Nearest drawn vertex to the ship, which is where the two are meant to coincide.
    let bi = -1, best = Infinity;
    for (let i = 0; i < count; i++) {
      const d = (pos[3 * i] - b.mesh.position.x) ** 2 + (pos[3 * i + 1] - b.mesh.position.y) ** 2 + (pos[3 * i + 2] - b.mesh.position.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    if (bi < 0) return;
    const dx = b.mesh.position.x - pos[3 * bi], dy = b.mesh.position.y - pos[3 * bi + 1], dz = b.mesh.position.z - pos[3 * bi + 2];
    const reach = Math.max(2, Math.round(count * 0.08));
    for (let k = -reach; k <= reach; k++) {
      const i = bi + k;
      if (i < 0 || i >= count) continue;
      const f = 0.5 * (1 + Math.cos((Math.PI * k) / reach)); // 1 at the ship, 0 at the edge of the reach
      pos[3 * i] += dx * f; pos[3 * i + 1] += dy * f; pos[3 * i + 2] += dz * f;
    }
  }

  /**
   * The route line's visibility, its rebase and its anchor - all per frame, and all cheap because only
   * ONE route can be visible at a time.
   *
   * It draws only for the SELECTED construct (the owner's call, 2026-08-07: a dozen ships under way
   * would otherwise web the system over), only while it is actually under way, and otherwise under the
   * same name rule every orbit line obeys.
   *
   * The buffer is rewritten from the float64 master every frame rather than only on a rebase, because
   * the ship anchor has to be re-applied against the ship's CURRENT position and applying a taper on
   * top of an already-tapered buffer would walk the line away a little more each frame. Writing from a
   * clean master makes the correction idempotent, which is the same reason the rings keep a master at
   * all - and it gets the rebase for free, since the origin is subtracted in this pass.
   */
  let _routeDbgAt = -Infinity;
  function updateRouteLines() {
    // `window.__routeDebug = true` answers "why is there no line" in ONE log line, because there are
    // five independent ways to get no line and none of them can be told from the others by looking:
    // the route never crossed to this surface, it crossed but the clock is outside its window, it
    // built but nothing is selected, it is selected but the name rule hides it, or it drew with no
    // vertices. Each field below is exactly one of those. `built` false with `hasRouteField` true
    // means the scene never saw the data the snapshot carried; `inWindow` false with a window far
    // from `clock` is RENDER-S18 again, on a surface that seeds its clock somewhere else.
    if ((window as any).__routeDebug && performance.now() - _routeDbgAt > 1000) {
      _routeDbgAt = performance.now();
      const constructs = (currentSystem?.nodes ?? []).filter((n: any) => n.kind === 'construct');
      console.log('[routedbg]', JSON.stringify({
        clock: timeMs, focusedId, lines: routeLines.length, constructs: constructs.length,
        each: constructs.map((n: any) => {
          const line = routeLines.find((r) => r.id === n.id);
          const sc = shipClock(n);
          // The FACING CHAIN rides here too, because __shipDebug only reports the FOCUSED construct
          // (only the focus draws its model) - the first field trace for the facing fault came back
          // describing a parked station the owner happened to have selected, while the burning ship
          // it was about went unlogged. A transiting construct is interesting whether or not it is
          // selected, so its chain must not depend on the selection.
          const b = bodyById.get(n.id);
          const facing = line && b ? (() => {
            positionToScene(line.route.p[line.route.p.length - 1], _dbgDest);
            const dx = b.mesh.position.x - (b.shipPrev?.x ?? b.mesh.position.x);
            const dy = b.mesh.position.y - (b.shipPrev?.y ?? b.mesh.position.y);
            const dz = b.mesh.position.z - (b.shipPrev?.z ?? b.mesh.position.z);
            const tx = _dbgDest.x - b.mesh.position.x, ty = _dbgDest.y - b.mesh.position.y, tz = _dbgDest.z - b.mesh.position.z;
            return {
              noseSign: b.noseSign ?? 1,
              nozzleMeanZ: b.nozzleMeanZ ?? null,
              deltaTowardDest: dx * dx + dy * dy + dz * dz === 0 ? 0 : Math.sign(dx * tx + dy * ty + dz * tz),
              modelDrawn: !!b.shipModel?.visible
            };
          })() : null;
          return {
            id: n.id,
            hasRouteField: !!n.route, hasJourneys: !!n.scheduled_journeys?.length,
            derivable: !!routeOf(n),
            built: !!line,
            window: line ? { s: line.route.s, e: line.route.e } : null,
            shipClock: sc,
            inWindow: !!line && sc >= line.route.s && sc <= line.route.e,
            focused: n.id === focusedId, named: visibleSet.has(n.id),
            verts: line?.count ?? 0, visible: !!line?.obj.visible,
            facing
          };
        })
      }));
    }
    for (const r of routeLines) {
      // The window test runs on the SHIP'S clock (shipClock), not the raw display clock: a
      // scrubbing player's ship holds its GM-stamped truth, so its committed course must stay
      // drawn with it - the line vanishing while the ship still sat mid-flight was the same
      // two-clocks fault as the dark plume.
      const show = r.id === focusedId && visibleSet.has(r.id) && (() => { const c = shipClock(r.node); return c >= r.route.s && c <= r.route.e; })();
      r.obj.visible = show;
      if (!show || !r.count) continue;
      const attr = r.obj.geometry.getAttribute('position') as THREE.BufferAttribute;
      const out = attr.array as Float32Array;
      for (let i = 0; i < r.count * 3; i += 3) {
        out[i] = r.abs[i] - sceneOrigin.x;
        out[i + 1] = r.abs[i + 1] - sceneOrigin.y;
        out[i + 2] = r.abs[i + 2] - sceneOrigin.z;
      }
      anchorRouteToShip(r, out, r.count);
      attr.needsUpdate = true;
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
    if (reframing) return;
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

  /**
   * THE GRID'S ONE EMITTER, shared with the starmap (map/gridGeometry).
   *
   * Everything this view draws as a grid comes through here as EDGES on the ground plane, which is
   * the starmap's shape and the reason its grid was right while this one was not:
   *
   *  - COLOUR lives in the vertex attribute and the material stays WHITE. Three multiplies the two,
   *    so the old code — material `color: base * 0.4` AND the same value written into the vertex
   *    colour — squared it, and the grid rendered at a sixth of its intensity the moment the falloff
   *    dial left zero. See RENDER-S25.
   *  - RINGS ARE EDGES, not `LineLoop`s. A loop has no pair structure, so it could carry no depth
   *    curtain, so "Grid depth" reached the spokes and nothing else — a glow at the centre where the
   *    spokes converge, which is exactly what the owner saw.
   *  - `opacity` is left free for the two-level crossfade, which is this view's own concern and the
   *    one thing the starmap has no use for. One channel each.
   */
  function addGridEdges(edges: GridEdge[], col: THREE.Color, cell: number, o: { alpha?: number; skirt?: boolean; opacity?: number } = {}) {
    const { linePos, lineCol, skirtPos, skirtCol } = buildLattice(edges, col, {
      alpha: o.alpha, cell, y0: 0.01,
      skirt: o.skirt === false ? 0 : gridDepth,
      fade: gridFalloff > GRID_FADE_OFF ? gridFadeWindow(gridFalloff, GRID_RADIUS) : undefined
    });
    if (!linePos.length) return null;
    // The float64 master is what a rebase re-emits from: the fade is computed against ABSOLUTE
    // positions once, and the floating origin then moves the drawn coordinates underneath it.
    const abs = Float64Array.from(linePos);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(abs.length), 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lineCol, 4));
    const lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: o.opacity ?? 1 });
    const line = new THREE.LineSegments(lg, lmat);
    gridGroup.add(line);
    gridAbs.push({ obj: line, abs });
    rebaseStaticGeometry(line, abs, sceneOrigin);
    if (skirtPos.length) {
      const sAbs = Float64Array.from(skirtPos);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sAbs.length), 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(skirtCol, 4));
      const smat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: o.opacity ?? 1 });
      const mesh = new THREE.Mesh(sg, smat);
      gridGroup.add(mesh);
      gridAbs.push({ obj: mesh, abs: sAbs });
      // Paired so the crossfade moves both — a curtain outliving the line it hangs from is the fault
      // this prevents.
      gridSkirtMats.push({ line: lmat, skirt: smat });
      rebaseStaticGeometry(mesh, sAbs, sceneOrigin);
    }
    return lmat;
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
  let gridLevelMats: { mat: THREE.LineBasicMaterial; coarse: boolean }[] = [];
  // What the auto grid was last built FOR: its decade, the patch's half-size and centre (AU), and the
  // view half-extent at the time — `updateGridLevels` rebuilds when any of these has moved enough.
  let gridBuiltFor = { coarse: 0, span: 0, cx: 0, cz: 0, visible: 0 };

  // THE AUTO GRID IS A LOCAL PATCH AROUND WHAT THE CAMERA IS LOOKING AT (A55, owner 2026-08-19:
  // "things totally collapse on zoom in"). It used to be laid out about the STAR — lines at +-k*step
  // of the origin out to `span`, each running the full width of the plate — and its decade was picked
  // from the FAR EDGE of the view. Zoomed in on anything off-centre that gave two dense bands crossing
  // at the origin (every line of the level, edge to edge, packed into +-span) and a step that never
  // refined with the zoom. Now: the decade comes from the half-extent the camera actually sees at its
  // target, the lines exist only inside a patch of 2.5 views about the target, and a pan or a zoom
  // that carries the view toward the patch's edge rebuilds it. The polar grids and a PINNED cell are
  // not this path: the pinned cell keeps its whole-plate plate (it is a fixed ruler, by request) but
  // takes the same patch so it cannot collapse either.
  //
  // How many coarse cells span the view: between AUTO_GRID_DIVISIONS*2 and twenty times that across a
  // decade. Six divisions (12-120 cells) was the first number and it is what the owner saw as "keeps
  // adding more grid": at 120 coarse cells the fine level is 1,200 — a wash. 2.5 gives 5-50 coarse
  // cells, and the fine level arrives (gridLevelOpacity's window) at about 6 px a cell, 16 px by the
  // handover — subdivisions you can read, never a haze.
  const AUTO_GRID_DIVISIONS = 2.5;

  /** Half the AU extent the camera can currently see AT ITS TARGET — what picks the decade. Measured
   *  along the radial direction through the target, so it is the local AU-per-screen under whatever
   *  compression is in force: at the origin this is exactly the old figure. */
  function visibleAu(): number {
    const dist = camera.position.distanceTo(controls.target);
    const halfScene = Math.max(1e-4, dist * Math.tan((camera.fov * Math.PI) / 360));
    const tAbs = Math.hypot(controls.target.x + sceneOrigin.x, controls.target.z + sceneOrigin.z);
    const m = radialMap();
    // The view's two edges along the radial through the target, in AU; half their separation. When
    // the view straddles the origin the near edge is on the far side of the star, so it ADDS.
    const outer = expandRadius(Math.min(tAbs + halfScene, GRID_RADIUS * 4), m);
    const lo = tAbs - halfScene;
    const other = lo >= 0 ? -expandRadius(lo, m) : expandRadius(-lo, m);
    return Math.max(1e-6, (outer + other) / 2);
  }

  /** The view target's AU coordinates, through the inverse of the SAME radial map the lattice's
   *  vertices go through (scale the direction, keep the bearing), so the patch is centred where the
   *  camera is actually looking. */
  function gridCentreAu(): { x: number; z: number } {
    const ax = controls.target.x + sceneOrigin.x, az = controls.target.z + sceneOrigin.z;
    const r = Math.hypot(ax, az);
    if (!(r > 1e-9)) return { x: 0, z: 0 };
    const au = expandRadius(r, radialMap());
    return { x: (ax / r) * au, z: (az / r) * au };
  }

  /**
   * THE SYSTEM LATTICE — the SAME generator the starmap and the GM's snap grid use (`latticeFor`), so
   * square and every hex variant come from one place and a cell means the same thing on every view.
   *
   * The one thing that genuinely differs at system scale is that this map is NOT LINEAR: `compressRadius`
   * blends a linear map with a log one, and at the shipped 0.8 the outer system is squashed hard. So the
   * lattice is generated in AU and every vertex is then put through the SAME radial map the bodies get.
   * A cell therefore spans its stated number of AU against the orrery drawn inside it, which is the only
   * reading of "1 AU hexes" that is any use at a table. It also means the cells visibly compress outward
   * whenever compression is on — that is the map being honest, not the grid being wrong, and at
   * compression 0 (linear, honest distances) the lattice is perfectly regular.
   *
   * `centre` (AU) is the PATCH the lattice fills, +-spanAu about the view's target (A55): an
   * origin-centred lattice zoomed in anywhere off-centre is two dense bands crossing at the star.
   * The lattice origin — its phase — stays at the star, so cells line up with the AU axes.
   */
  function latticeEdgesAu(cellAu: number, spanAu: number, centre: { x: number; z: number }): GridEdge[] {
    if (!(cellAu > 0) || !(spanAu > 0)) return [];
    // Segmented in AU. Three separate reasons, any one of which is sufficient: a per-vertex fade judges
    // a full-width run by its far ends (A37), a curtain is built per edge, and a straight edge across a
    // NONLINEAR map cuts the corner. Bounded by the cell so hexes are unaffected (their edges are
    // already one cell) and by the span so a huge system cannot make one run enormous.
    const seg = Math.max(1e-4, Math.min(cellAu, spanAu / 24));
    const au = latticeFor(gridMode, {
      cell: cellAu, originX: 0, originY: 0, half: spanAu, centreX: centre.x, centreY: centre.z,
      // The ground grid is a DISC — it reads as a plate under the orrery. `compressRadius` maps rMax to
      // exactly GRID_RADIUS, so the disc in AU is rMax and the plate meets the rim of the scene. The
      // disc, NOT min(span, rMax): the patch may sit at the rim, and a clip to the span about the
      // origin would delete it wholesale.
      clipRadius: rMax,
      maxSegment: seg, maxLines: 400
    });
    const out: GridEdge[] = [];
    // The radial map applied per vertex: scale the direction, keep the bearing. Identical in form to
    // `positionToScene`, which is what makes the grid agree with the bodies rather than merely sit near
    // them. Written out here rather than borrowed because that helper also applies the rebase, and these
    // are absolute-frame masters — `addGridEdges` rebases them itself.
    const map = (x: number, y: number): [number, number] => {
      const d = Math.hypot(x, y);
      if (!(d > 0)) return [0, 0];
      const k = compressScalar(d) / d;
      return [x * k, y * k];
    };
    for (const [x1, y1, x2, y2] of au) {
      const [ax, az] = map(x1, y1);
      const [bx, bz] = map(x2, y2);
      out.push([ax, az, bx, bz]);
    }
    return out;
  }

  function buildMetricGrid(base: THREE.Color) {
    gridLevelMats = [];
    gridSkirtMats = [];
    // A PINNED cell draws one level and nothing crossfades: the whole point of the ladder is that the
    // cell tracks the zoom, and the whole point of pinning it is that it does not. `gridBuiltFor` is
    // parked on the pinned value so `updateGridLevels` sees no decade change and never rebuilds.
    if (gridScaleAu > 0) {
      const visible = visibleAu(), centre = gridCentreAu();
      const span = Math.min(rMax * 1.2, Math.max(visible * 2.5, gridScaleAu * 2));
      gridBuiltFor = { coarse: -gridScaleAu, span, cx: centre.x, cz: centre.z, visible };
      const edges = latticeEdgesAu(gridScaleAu, span, centre);
      if (!edges.length) return;
      const mat = addGridEdges(edges, base.clone().multiplyScalar(0.4), gridScaleAu, { alpha: 1, opacity: GRID_LEVEL_PEAK });
      if (mat) gridLevelMats.push({ mat, coarse: true });
      reportGridCell(gridScaleAu);
      return;
    }
    const visible = visibleAu(), centre = gridCentreAu();
    const lv = gridLevels(visible, AUTO_GRID_DIVISIONS);
    if (!lv) return;
    // Cover a bit more than the view so a pan does not run off the grid, but never the whole system at
    // a fine step — that is how a decade grid spawns ten thousand lines.
    const span = Math.min(rMax * 1.2, visible * 2.5);
    gridBuiltFor = { coarse: lv.coarse, span, cx: centre.x, cz: centre.z, visible };
    for (const [step, coarse] of [[lv.coarse, true], [lv.fine, false]] as [number, boolean][]) {
      // ONE opacity law for both levels (niceInterval.gridLevelOpacity), continuous across the decade
      // handover — A55. It used to be two peaks (0.42 coarse, 0.30 "ghost" fine) and the same lines
      // jumped between them on every rebuild.
      const opacity = gridLevelOpacity(coarse ? 'coarse' : 'fine', lv.t);
      // BOTH LEVELS ARE ALWAYS BUILT, however faint one is right now (A55). The build used to skip a
      // level under 2% — and a fresh decade ALWAYS starts with the fine level at 0, because t is ~0
      // the moment the coarse step is chosen. So after every handover the fine level was never
      // built, nothing faded in across the decade, and at the NEXT handover a ten-times-finer grid
      // appeared at full strength in one frame. The per-frame updater can only slide an opacity that
      // has a material to slide; a level it cannot see it cannot fade.
      const edges = latticeEdgesAu(step, span, centre);
      if (!edges.length) continue;
      // The LEVEL's strength stays on the material, because it moves every frame and rewriting a
      // vertex attribute per frame to say the same thing would be absurd. The vertex attribute carries
      // colour and fade, which are fixed until a rebuild. One channel each — RENDER-S25.
      const mat = addGridEdges(edges, base.clone().multiplyScalar(0.4), step, { alpha: 1, opacity });
      if (!mat) continue;
      gridLevelMats.push({ mat, coarse });
    }
    reportGridCell(dominantCell(lv));
  }

  /**
   * Per frame: slide the two levels' opacities as the zoom moves, and rebuild only when the DECADE
   * itself changes. That split is the whole trick — geometry is expensive and a fade is not, so the
   * crossfade runs continuously while the rebuild happens a handful of times across a whole zoom.
   */
  function updateGridLevels() {
    if (!isLattice(gridMode) || gridMode === 'off' || !gridLevelMats.length) return;
    // THE PATCH FOLLOWS THE VIEW. A pan that carries the target a third of the way to the patch's
    // edge, or a zoom-out that would show past it, rebuilds — cheap (a few hundred lines) and rare.
    const centre = gridCentreAu(), visible = visibleAu();
    const b = gridBuiltFor;
    if (Math.abs(centre.x - b.cx) > b.span * 0.35 || Math.abs(centre.z - b.cz) > b.span * 0.35 || visible > b.visible * 1.8) { rebuildGrid(); return; }
    // A pinned cell has no ladder to slide along and no second level to cross into. Returning here is
    // what stops the per-frame updater from recomputing a decade the GM has explicitly overridden.
    if (gridScaleAu > 0) return;
    const lv = gridLevels(visible, AUTO_GRID_DIVISIONS);
    if (!lv) return;
    if (lv.coarse !== b.coarse) { rebuildGrid(); return; }
    for (const g of gridLevelMats) g.mat.opacity = gridLevelOpacity(g.coarse ? 'coarse' : 'fine', lv.t);
    // The curtains ride their own line's opacity, so a level fading out takes its depth with it.
    for (const g of gridSkirtMats) g.skirt.opacity = g.line.opacity;
    reportGridCell(dominantCell(lv));
  }

  function rebuildGrid() {
    if (gridMode === 'off' || !isLattice(gridMode)) reportGridCell(null);
    clearGroup(gridGroup);
    gridAbs = [];
    gridSkirtMats = [];
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
    // POLAR. Deliberately the starmap's construction, numbers and all (`renderPolarGrid` there): both
    // views offer one control called "Grid depth" over one thing called a polar grid, and the owner's
    // report was that the starmap's was right and this one's was not. Rings as EDGES is the load-
    // bearing part — a `LineLoop` cannot carry a curtain, which is why the dial reached the spokes
    // and nothing else. The graduated outer-ring dimming this view used to apply went with the copy;
    // the starmap holds all six rings at one strength and lets the FALLOFF dial be what dims them.
    const RING_TINT = 0.45, RING_ALPHA = 0.55;
    const cell = GRID_RADIUS / 6;
    const rings: GridEdge[] = [];
    if (gridMode === 'scaled') {
      // Concentric rings at round AU distances (mapped through the live compression), each labelled.
      for (const au of gridAuSteps()) {
        const radius = compressScalar(au);
        if (radius <= 0.02) continue;
        rings.push(...ringEdges(radius, 72));
        const label = makeGridLabel(`${formatNice(au)} AU`);
        if (label) {
          gridLabels.push({ sprite: label, abs: [radius, 0.02, 0] });
          label.position.set(radius - sceneOrigin.x, 0.02 - sceneOrigin.y, -sceneOrigin.z);
          gridGroup.add(label);
        }
      }
    } else {
      // Plain: six evenly-spaced rings (decorative, system-independent).
      for (let ri = 1; ri <= 6; ri++) rings.push(...ringEdges(cell * ri, 72));
    }
    addGridEdges(rings, base.clone().multiplyScalar(RING_TINT), cell, { alpha: RING_ALPHA });
    // Spokes get no curtain on either view: 24 curtains meeting at the origin is a solid cone, not a
    // depth cue, and it is what the owner saw as "a glow at the CENTRE".
    addGridEdges(spokeEdges(24, GRID_RADIUS, 24), base.clone().multiplyScalar(0.22), cell, { alpha: 0.5, skirt: false });
  }

  function setGridCellReporter(fn: ((au: number | null, kind: 'square' | 'hex' | null) => void) | null) {
    onGridCell = fn;
    // Fire once on subscribe: the grid is usually already built by the time a view asks, and a caption
    // that only updates on the NEXT change would start blank and stay blank on a map nobody zooms.
    fn?.(reportedCell, reportedCell === null ? null : isHexFamily(gridMode) ? 'hex' : 'square');
  }
  function setGridScale(v: number) {
    const n = Number.isFinite(v) && v > 0 ? v : 0;
    if (n === gridScaleAu) return;
    gridScaleAu = n;
    rebuildGrid();
  }
  function setGridDepth(v: number) {
    const n = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
    if (n === gridDepth) return;
    gridDepth = n;
    rebuildGrid();
  }
  function setGridFalloff(v: number) {
    const n = Math.max(0, Math.min(1, v || 0));
    if (n === gridFalloff) return;
    gridFalloff = n;
    rebuildGrid();
  }

  function setGrid(mode: MapOverlay) {
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
  // P2 - BASE + OFFSET (RENDER-S12, viewport/cameraRig.ts). The system proposes a BASE shot every
  // frame from live positions; the user's drag/wheel/turntable is measured back out of the camera
  // as an OFFSET and re-applied to the next base. That is the whole camera model.
  //
  // What this REPLACED, and why none of it comes back: a 48-frame `focusDrive` counter that either
  // expired mid-flight or stayed armed forever; `userZoomOverride`, a flag several writers had to
  // remember to honour; `lastAutoDist` + the orrery's rate-limited auto-frame policy, whose floor
  // sat a thousand times further out than a true-scale hull; and a `_prevDesired` patch to carry an
  // in-flight shot along with a moving body. All six framing faults of 2026-08-05 lived in those.
  // "The user has the view" is now a STATE (offset != identity), not a flag.
  let viewOffset: ViewOffset = { ...IDENTITY_OFFSET };
  // R5, MADE STRUCTURAL. The offset is read back OUT of the camera, which only works if the user is
  // the only one who moves it - and in a scene this size that assumption keeps being wrong. Twice
  // now something else nudged the camera between frames (a floating-origin rebase, then a writer I
  // had not found) and the rig read that nudge as "the user zoomed out", applied it, and fed its own
  // output back in: measured, offsetZoom ran 1.4, 2.9, 6.0, 12.3, 25.3, 52.2, 106, 217, 442, 902
  // until it clamped at maxDistance and the view sat beyond Pluto.
  //
  // So the camera is no longer treated as evidence of intent. The rig reads it ONLY on a frame where
  // the user actually did something - a drag, the wheel, or the turntable, which are the only things
  // entitled to move the view. On every other frame the offset simply does not change, so no
  // external writer can be mistaken for the user and no feedback loop can form, whatever moves the
  // camera and for whatever reason. That is a weaker assumption than "nothing else writes the
  // camera", and it is one the scene can actually keep.
  let userDroveCamera = false;
  // ...and it stays true for a WINDOW, not a frame. OrbitControls applies a wheel or a drag with
  // DAMPING, so the motion the user started arrives over many frames after the event. Reading the
  // camera only on the frame of the event caught the first damped step and then overwrote every one
  // after it - which is why the wheel behaved erratically and could move the same way whichever
  // direction it was turned: the surviving fragment was whatever one frame happened to hold.
  let userInputUntil = 0;
  const USER_INPUT_TAIL_MS = 500; // comfortably longer than OrbitControls' damping tail
  // WHAT the user did, not just THAT they did something. "Both wheel directions zoomed in" is only
  // diagnosable if the log says which way the wheel turned and what the distance did next, so each
  // input records its kind, its direction and the camera distance AT THE MOMENT IT ARRIVED. The
  // frame log then prints the current distance beside it, so cause and effect sit together.
  let lastInput: { kind: string; dir: number; atMs: number; distAt: number } =
    { kind: 'none', dir: 0, atMs: 0, distAt: 0 };
  function noteUserInput(kind = 'other', dir = 0) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    userDroveCamera = true;
    userInputUntil = now + USER_INPUT_TAIL_MS;
    const distAt = camera.position.distanceTo(controls.target);
    lastInput = { kind, dir, atMs: now, distAt };
    if ((window as any).__camDebug && kind !== 'turntable') {
      console.log('[caminput]', kind, dir > 0 ? 'OUT(+deltaY)' : dir < 0 ? 'IN(-deltaY)' : '', 'distAtEvent', distAt);
    }
  }
  let lastBase: Shot | null = null;   // previous frame's base, to read the user's manipulation against
  let reframing = false;              // a cosmetic blend is running; it cannot change the destination
  let reframePending = false;         // an explicit (re)frame: reset the offset on the next frame
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
  /** An explicit (re)frame: the ONE way the system takes the camera back from the user (R5). */
  function requestReframe() {
    reframePending = true;
    reframing = true;
  }
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
    // A 3D view may go BELOW the plane. It is a hologram, not a map: half the system is under the
    // ecliptic and there was no way to look at any of it.
    //
    // It is also load-bearing now, not just nicer. The shot is host-aware (R2): the camera is placed
    // along host -> subject so the host cannot occlude what you selected. For a moon or a station on
    // the UNDERSIDE of its world that heading points DOWNWARD, and a clamp at 0.49*PI made that shot
    // literally unreachable - the framing kept asking for a position the controls refused to hold,
    // so it never settled. Any policy that derives a heading from real positions needs the full
    // sphere available, or it can be handed a target it cannot express.
    //
    // Epsilon off each pole, not zero: at exactly 0 or PI the camera's up vector is parallel to the
    // view direction and the azimuth becomes undefined, which OrbitControls resolves by spinning.
    // A flat map is still pinned overhead - that IS the map.
    const POLE_EPS = 0.001;
    controls.minPolarAngle = flatOverhead ? LOCK_POLAR : POLE_EPS;
    controls.maxPolarAngle = flatOverhead ? LOCK_POLAR : Math.PI - POLE_EPS;
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
    requestReframe(); // a genuine framing change re-takes the camera
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
    requestReframe(); // back to the pinned framing
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
    requestReframe(); // the heading policy changed, so the shot did
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
  // LIVE TOUCH POINTS, because a PINCH is a third kind of input and neither of the other two
  // listeners can see it. It is not a wheel (no wheel event is fired by touch hardware) and it must
  // not be treated as a drag (that is the ROTATE kind, and noting it as such is what discarded its
  // own zoom - C10). OrbitControls does dolly on it: `touches.TWO` is three's DOLLY_PAN default and
  // is never overridden here, so the camera really does move and the rig simply has to be told by
  // WHAT, or `ownsDistance` puts the distance back the next frame.
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchSpan = 0;
  const spanOf = () => {
    const it = activePointers.values();
    const a = it.next().value, b = it.next().value;
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const dropPointer = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchSpan = 0; // the gesture is over; the next one re-measures
  };
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) pinchSpan = spanOf(); // the baseline this gesture is measured from
  }, { signal: pointer.signal });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons === 0) return;
    const pt = activePointers.get(e.pointerId);
    if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
    if (activePointers.size >= 2) {
      // A PINCH. Its own sign, on the WHEEL'S convention so both zoom kinds report alike: fingers
      // spreading = zooming IN = negative, matching a wheel's -deltaY. The threshold is a couple of
      // pixels, enough that resting fingers do not register as a gesture.
      const span = spanOf();
      if (pinchSpan > 0 && span > 0 && Math.abs(span - pinchSpan) > 2) {
        noteUserInput('pinch', Math.sign(pinchSpan - span));
        pinchSpan = span;
        reframing = false;   // as the wheel does: touching the zoom hands the camera over NOW
      }
      return;                // NOT a drag - see the note above the pointer map
    }
    if (Math.hypot(e.clientX - downX, e.clientY - downY) <= 6) return;
    // ANY drag is the user driving the camera - in 3D it orbits, on a flat map it pans. Either way
    // OrbitControls is about to move the camera on their behalf, so the rig may believe what it
    // reads back next frame.
    noteUserInput('drag');
    reframing = false;       // don't finish an in-flight blend against their drag
    if (flatOverhead) followEngaged = false; // a PAN is the orrery's MANUAL: it drops the follow
  }, { signal: pointer.signal });
  canvas.addEventListener('pointercancel', dropPointer, { signal: pointer.signal });
  // The user driving zoom (wheel / pinch) takes the camera off auto-framing — the orrery's rule, so the
  // view never fights someone looking around. Cleared by the next explicit (re)frame (focusBody/pickBody).
  canvas.addEventListener('wheel', (e) => {
    noteUserInput('wheel', Math.sign((e as WheelEvent).deltaY || 0)); // trust the camera while damping settles
    reframing = false;      // touching the zoom hands the camera over NOW; deriveOffset reads it
    // Grabbing the zoom mid-ease hands the camera over NOW - the 48-frame drive used to keep
    // lerping against the wheel for most of a second ("fights the mouse"), worst on a tight
    // ship close-up where a double-click restarts it.

  }, { passive: true, signal: pointer.signal });
  canvas.addEventListener('pointerup', (e) => {
    const wasPinching = activePointers.size >= 2;
    dropPointer(e); // BEFORE the early return below, or a lifted finger stays in the map forever
    if (wasPinching) return; // lifting out of a pinch is not a tap, whatever the travel says
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
      requestReframe();
      followEngaged = true;

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
      // A ship under way HAS a context rung even where its host has gone: its journey is the context.
      // Without this a construct whose parent is no longer drawn would offer the close-up alone, and
      // the second click would wrap straight back to it.
      hasParent: contextPeerIds(currentSystem, b.id, pid).some((pid2) => bodyById.has(pid2))
        || routeLines.some((r) => { const c = shipClock(r.node); return r.id === b.id && c >= r.route.s && c <= r.route.e; }),
      // ...rings included: a ringed planet HAS a satellite rung even with no moons, which is the
      // rung a selected ring is redirected to (A51(a)). Without this a bare ringed world offered
      // only the close-up, and the ring - the thing clicked - fell outside it.
      hasSatellites: bodies.some((x) => x.framingParentId === id) || ringVisuals.some((rv) => rv.parentId === id),
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
  /**
   * HOW BIG IS THIS VISUAL ON SCREEN, in scene units — the ONE answer, because there were three and
   * one of them was wrong (G53 phase 2). A body carries `radiusScene`; a construct carries `shipLen`
   * and its `radiusScene` is set to a hard 0 rather than left undefined, which is what made
   * `radiusScene ?? shipLen` silently yield 0 at the occlusion site while `||` and an explicit
   * ternary elsewhere got it right. Two of three spellings agreed, which is exactly how this
   * codebase's recurring duplication fault presents.
   *
   * NOT a half-extent: a construct answers its FULL length here, deliberately, and `frameDistance`
   * relies on that (see its own comment). Callers wanting a half-extent halve it themselves.
   */
  function renderedSpanScene(b: BodyVisual | undefined): number {
    if (!b) return 0;
    return (b.isConstruct ? b.shipLen : b.radiusScene) || 0;
  }

  function frameDistance(b: BodyVisual): number {
    // A modelled construct frames to its HULL (dial-blended length), so "zoom to the ship" comes
    // all the way down to it at true scale; a glyph-only construct keeps the radius-less patch.
    // The FULL length stands in for the radius, deliberately generous: the half-length close-up
    // put the hull at 50% of the frame with the min-zoom nearly touching it, which read as
    // "zoomed in too much" and left no room for the plume. Full length puts the ship at roughly
    // a quarter of the frame with its surroundings visible.
    // `shipLen` is set when the node is READ, not when the model attaches, so the shot is the same
    // whether or not the binary has landed yet (a glyph-only construct still has none, and keeps
    // the radius-less patch below).
    const radius = renderedSpanScene(b);
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
    // A RING IS SOMETHING ORBITING THE SUBJECT, so it belongs in the satellite rung's extent. It was
    // absent, and that is A51(a): selecting a ring redirects the shot to its parent (correct - the
    // host belongs in frame) and then sized it from the parent's rendered BODY radius alone. A ring
    // reaches up to 4.5x that radius (9x for an accretion disc), while a close-up frames at 1.25x,
    // so the thing actually selected was drawn well outside the frame. Its extent is its ORBIT, the
    // same fact PHY-13/B11 record for a belt's mass, so the ring's own outer radius is the input.
    for (const rv of ringVisuals) {
      if (rv.parentId !== b.id) continue;
      maxSatelliteDist = Math.max(maxSatelliteDist, rv.outerScene);
    }
    // Level 0 — past the partner, out to whatever the pair as a whole orbits.
    let pairContextDist = 0;
    for (const gpId of pairContextIds(currentSystem, b.id, b.framingParentId ?? null)) {
      const gp = bodyById.get(gpId);
      if (gp) pairContextDist = Math.max(pairContextDist, b.mesh.position.distanceTo(gp.mesh.position));
    }
    // ...and for a ship UNDER WAY, the context rung is its JOURNEY rather than the host it left
    // (section 4a). Measured here with the peers above rather than in shipRoute, because it has to be
    // in SCENE units through the live compression - the same space `b.mesh.position` is in - and only
    // the scene knows that. Reaching to the far end, not to the route's middle: see routeExtent.
    let routeExtent = 0;
    for (const rl of routeLines) {
      const shipC = rl.id === b.id ? shipClock(rl.node) : NaN;
      if (rl.id !== b.id || !(shipC >= rl.route.s && shipC <= rl.route.e)) continue;
      for (const k of rl.route.p) routeExtent = Math.max(routeExtent, b.mesh.position.distanceTo(positionToScene(k, tmp)));
    }
    // The geometry itself lives in `viewport/shotSolver.ts` - pure and tested (shotSolver.spec.ts).
    // This function's remaining job is to MEASURE the scene: which bodies are the context peers,
    // how far away they are, and what the lens currently is. A radius-less construct at level 3
    // still gets its small patch (its glyph is screen-fixed anyway) - that is the solver's
    // `sizelessHalfExtent` policy.
    return frameDistanceFor({
      radius,
      context: { level: focusLevel, parentDist, maxSatelliteDist, pairContextDist, routeExtent },
      lens: { fovYDeg: camera.fov, aspect: camera.aspect },
      policy: { fillFrac: frameFillFrac, minDistance: controls.minDistance }
    });
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
    return scaleShipLengthScene(shipLengthMOf(node), scaleCtx());
  }
  // The screen-space pixel floors live in `rendering/pixelFloor.ts` - one table, on one axis,
  // testable and showable. They are NOT part of the scale law: the law decides scene size, they
  // clamp it in screen space underneath, and no dial position can correct a floor.
  let buildGen = 0; // invalidates async ship-model loads across setSystem rebuilds
  // Parsed hulls by content hash, for the life of the scene. Shared safely because
  // buildDisplayModel CLONES its source - two ships on one hull cost one parse.
  const parsedHullCache = new Map<string, THREE.Object3D>();

  type ShipModelRef = { hash: string; hadMaterials?: boolean; orient?: [number, number, number, number]; finish?: import('$lib/constructs/modelViewer').HullFinish; nozzles?: [number, number, number][]; nozzleScale?: number };

  async function loadShipModel(v: BodyVisual, ref: ShipModelRef, tint: string, sceneLen: number, gen: number) {
    // A CACHED hull attaches with no await at all, and that is the whole point. A construct IN
    // TRANSIT changes the broadcast snapshot continuously, so a player's scene calls setSystem
    // (and so bumps buildGen) about twice a second - and every rebuild discarded the in-flight
    // async load before it could attach. A ship in a stable orbit does not move the snapshot, so
    // ITS model loaded fine: that is why models appeared on parked ships and never on moving ones.
    const key = modelKey(ref);
    const cached = parsedHullCache.get(key);
    if (cached) { attachShipModel(v, ref, tint, sceneLen, cached); return; }
    try {
      // Bundled models resolve straight from the app's own files - no store, no transfer - so a
      // preset or bundled campaign can point at one and every viewer has it.
      const bytes = await loadModelBytes(ref);
      if (!bytes) {
        // Not local yet (a remote player). One-shot retry when the transport lands it in the
        // store - modelArrived clears the waiter, and the gen guard drops it across rebuilds.
        if (isFetchableFromPeer(ref)) {
          requestModel(ref.hash!, () => { if (gen === buildGen) loadShipModel(v, ref, tint, sceneLen, gen); });
        }
        return;
      }
      const parsed = await parseStoredModel('stored.glb', bytes);
      // Fill the cache BEFORE the staleness check: even if this build is already gone, the next
      // one (a fraction of a second later) then attaches instantly instead of racing again.
      parsedHullCache.set(key, parsed.object);
      if (gen !== buildGen) return;
      attachShipModel(v, ref, tint, sceneLen, parsed.object);
    } catch (e) {
      console.warn('[holo] ship model could not be loaded for', v.id, e);
    }
  }

  /**
   * The stand-in hull for a construct with no 3D model: an ellipsoid at the authored dimensions,
   * normalised to a UNIT long axis so `updateConstructs` can scale it exactly as it scales a real
   * hull (RENDER-S9's contract - the caller owns the transform).
   */
  /**
   * A MEGA-CONSTRUCT GETS ITS REAL SHAPE INSTEAD OF THE ELLIPSOID (G53 phase 3).
   *
   * Same contract as `attachHullVolume` in every other respect — normalised to a UNIT long axis
   * (RENDER-S9), assigned to `shipModel` so it inherits the pixel LOD, framing, min-zoom and plume
   * plumbing already built for hulls, and EMISSIVE because the scene's only real light is its star
   * (RENDER-S13). ONLY THE SHAPE CHANGES: the drawn SIZE is `shipLenScene` exactly as before, so
   * nothing about framing or the scale law moves — which is what makes this phase safe on its own.
   *
   * The geometry itself comes from `constructs/megaGeometry`, built at unit radius from the
   * registry's pure `shape()` spec. A type with no generator of its own (the Death Star spheroid)
   * returns null and falls through to the ellipsoid, which is the honest stand-in for it anyway.
   *
   * PHASE 3 SCOPE, stated so the gap is not mistaken for a bug: the spec is built from the
   * registry's DEFAULT params, because phase 1 stores no per-instance parameters on a node and the
   * knob editor is a later phase. A GM cannot yet tune a ring's width and watch it change.
   */
  // THE HOST ARRIVES AS A PARAMETER, not a lookup. The obvious `nodesById.get(node.parentId)` here
  // was the whole of the drawn-as-a-blob fault: that map is LOCAL to setSystem's build (it does not
  // exist in this function's scope at all), so the line threw ReferenceError on every attach, the
  // catch below ate it, and every mega fell back to the ellipsoid - in the shipped bundle, where
  // esbuild had stripped the types without checking them (svelte-check names the fault in one line;
  // the green build never would - RENDER-S46). RENDER-S45's "ask nodesById" advice holds only
  // INSIDE the build loop; a helper defined beside the loop must be handed what it needs.
  function attachMegaVolume(v: BodyVisual, node: any, tint: string, host: any): boolean {
    try {
      const def = megaTypeDef(node?.megaType);
      if (!def) return false;
      const spec = def.shape(instanceMegaParams(node, def, host as any), host as any);
      // Unit radius 0.5 => unit DIAMETER, the same long-axis convention the hull path uses.
      // A TETHER IS BUILT IN UNIT HOST-RADIUS CURRENCY - pure proportion, no scene units at all -
      // and `updateConstructs` multiplies it by the host's LIVE drawn radius every frame. That is
      // the rule planetary rings already follow (see updateRings: a ring is drawn in multiples of
      // its planet's rendered radius, so when the true-scale floor magnifies the planet the ring
      // comes with it). Baking a build-time radius here cannot work: the host's drawn size depends
      // on the body-size dial, the zoom-dependent screen floor (`screenK`) and whether the scene
      // was built at system or body level - three things that all move after this line runs.
      const dims = (node?.physical_parameters?.dimensionsM ?? []) as number[];
      const authoredRibbonKm = Math.max(0, ...dims.map((d: number) => Math.abs(Number(d)) || 0)) / 1000;
      const built = spec.family === 'tether'
        ? buildMegaGeometry(spec, 0.5, {
            hostRadiusScene: 1,
            hostRadiusKm: radiusKmOf(host),
            // The instance's own authored ribbon length (its long axis) sets the counterweight
            // height when it reaches past geo - the template authors 45,000 km on Earth.
            ribbonLengthKm: authoredRibbonKm > 0 ? authoredRibbonKm : undefined
          })
        : buildMegaGeometry(spec, 0.5);
      if (!built) return false;
      const wire = renderStyle.startsWith('wire');
      const col = new THREE.Color(tint);
      const g = new THREE.Group();
      if (built.mode === 'ribbon') {
        // THE BEANSTALK. A slim box up the +Y axis with a captured rock on the end;
        // `updateSurfaceConstructs` stands it on the anchor point and turns it with the world.
        // A MESH, not a line primitive: WebGL lines render one pixel wide whatever is asked, and
        // one pixel over a lit limb is invisible - the builder gives the ribbon real drawn width
        // as a fraction of the host (its own comment says why), so it scales with the world.
        g.add(new THREE.Mesh(built.geometry, new THREE.MeshStandardMaterial({
          color: col, emissive: col, emissiveIntensity: wire ? 1 : 0.55,
          metalness: 0.15, roughness: 0.6, wireframe: wire, transparent: true, opacity: 0.95
        })));
        // THE GEO DOCK - the mast glyph's knob, in three dimensions: a small station ball at
        // geostationary, below the rock, where the LO/MO/GO ladder tops out (design §7).
        const dk = built.dock;
        if (dk) {
          const ball = new THREE.Mesh(
            new THREE.SphereGeometry(dk.radiusScene, 10, 8),
            new THREE.MeshStandardMaterial({
              color: col, emissive: col, emissiveIntensity: 0.5,
              metalness: 0.2, roughness: 0.5, wireframe: wire
            })
          );
          ball.position.set(0, dk.atScene, 0);
          g.add(ball);
        }
        const cw = built.counterweight;
        if (cw) {
          // The counterweight is a CAPTURED ASTEROID (§5b.7), so it is drawn as a rock rather than
          // a machined shape: a low-poly icosahedron reads as irregular at any size and costs
          // nothing. Flat-shaded so its facets catch the light and it does not read as a ball.
          const rock = new THREE.Mesh(
            new THREE.IcosahedronGeometry(cw.radiusScene, 0),
            new THREE.MeshStandardMaterial({
              color: col, emissive: col, emissiveIntensity: 0.35,
              flatShading: true, metalness: 0.1, roughness: 0.9, wireframe: wire
            })
          );
          rock.position.set(0, cw.atScene, 0);
          g.add(rock);
        }
        g.visible = false;
        contentGroup.add(g);
        v.shipModel = g;
        // Anchor 'surface-stand', and NOT scaled by shipLen: the geometry is already in the
        // host's own drawn currency, so `updateConstructs` must leave its scale alone.
        v.exotic = def.capabilities;
        // In HOST RADII, not scene units - `updateConstructs` converts it every frame.
        v.megaUnitSpan = built.radiusScene;
        v.shipLen = 0;
        v.shipPrev = v.mesh.position.clone();
        return true;
      }
      if (built.mode === 'points') {
        // A swarm is ONE object shaded appropriately, not a fleet of nodes (the owner's own
        // simplification) - apexes only, evenly spread by the generator.
        g.add(new THREE.Points(built.geometry, new THREE.PointsMaterial({
          color: col, size: 0.02, sizeAttenuation: true, transparent: true, opacity: 0.95
        })));
      } else {
        // DoubleSide: a ring is a real object seen from outside as well as from its inhabited face.
        // The inward-facing lighting §5b.4b describes belongs with the interior surface work, not here.
        g.add(new THREE.Mesh(built.geometry, new THREE.MeshStandardMaterial({
          color: col, emissive: col, emissiveIntensity: wire ? 1 : 0.55,
          side: THREE.DoubleSide, metalness: 0.15, roughness: 0.6,
          wireframe: wire, transparent: true, opacity: wire ? 0.8 : 0.95
        })));
      }
      const sceneLen = shipLenScene(node);
      g.scale.setScalar(sceneLen);
      g.visible = false;   // updateConstructs reveals it at the pixel LOD, exactly as for a hull
      contentGroup.add(g);
      v.shipModel = g;
      v.shipLen = sceneLen;
      // A sphere-section mega ENCLOSES its host: `updateConstructs` re-centres and re-sizes it every
      // frame from the host's own drawn position, so it cannot disagree with its own orbit line.
      v.exotic = def.capabilities;
      v.shipPrev = v.mesh.position.clone();
      return true;
    } catch (e) {
      console.warn('[mega] geometry build failed, falling back to the hull volume', e);
      return false;
    }
  }

  function attachHullVolume(v: BodyVisual, node: any, tint: string) {
    try {
      const dims = node?.physical_parameters?.dimensionsM;
      const d = Array.isArray(dims) ? dims.map((x: number) => Math.abs(Number(x)) || 0) : [];
      const lengthM = shipLengthMOf(node);
      // Proportions from the authored box; anything missing falls back to a plausible 2.5:1 hull
      // rather than a sphere, which would read as a balloon.
      const w = (d[1] || lengthM * 0.4) / lengthM;
      const h = (d[2] || d[1] || lengthM * 0.4) / lengthM;
      const geo = new THREE.SphereGeometry(0.5, 16, 12);
      geo.scale(Math.max(0.02, w), Math.max(0.02, h), 1); // long axis = 1 unit, nose +Z by convention
      const wire = renderStyle.startsWith('wire');
      // SELF-LIT, and it has to be. The scene's only real light is the star, so a purely lit
      // material leaves a construct in shadow - or simply far out - drawing black on black, which
      // is what the glyph it replaces never did (a sprite is unlit). It carries the construct's own
      // icon colour, so the shape reads as the same object the marker did.
      const col = new THREE.Color(tint);
      const skin = wire ? null : getConstructHullTexture((node as any).icon_type, tint);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: skin ? new THREE.Color(0xffffff) : col, map: skin,
        // Emissive through the SAME map, so the markings glow with the hull rather than being
        // washed flat by it - the scene's only real light is its star, so an unlit shell is black.
        emissive: skin ? new THREE.Color(0xffffff) : col, emissiveMap: skin,
        emissiveIntensity: wire ? 1 : 0.5,
        flatShading: false, metalness: 0.1, roughness: 0.7,
        wireframe: wire, transparent: true, opacity: wire ? 0.8 : 0.95
      }));
      // A brighter edge so the silhouette survives against a bright body behind it.
      mesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 24),
        new THREE.LineBasicMaterial({ color: col.clone().lerp(_white, 0.5), transparent: true, opacity: 0.85 })
      ));
      const g = new THREE.Group();
      g.add(mesh);
      const sceneLen = shipLenScene(node);
      v.shipFx = attachDrivePlume(g, []);
      applyExhaustColour(v, shipCapability?.[v.id]?.exhaustHex);
      g.scale.setScalar(sceneLen);
      g.visible = false; // updateConstructs reveals it at the pixel LOD, exactly as for a real hull
      for (const rig of v.shipFx.rigs) rig.light.distance = Math.max(1e-12, sceneLen * PLUME_REACH_HULLS); // seed; updateConstructs re-states it against the DRAWN hull
      contentGroup.add(g);
      v.shipModel = g;
      v.shipLen = sceneLen;
      v.shipPrev = v.mesh.position.clone();
    } catch (e) {
      // RENDER-S7: never silent on the path that decides whether a thing renders.
      console.warn('[holo] hull volume could not be built for', v.id, e);
    }
  }

  /** Build + attach a hull from an already-parsed source. Synchronous by design. */
  function attachShipModel(v: BodyVisual, ref: ShipModelRef, tint: string, sceneLen: number, source: THREE.Object3D) {
    try {
      const g = buildDisplayModel(source, {
        hadMaterials: ref.hadMaterials ?? true, tintHex: tint, orient: ref.orient ?? null,
        finish: ref.finish ?? null, seed: v.id
      });
      // F6 parity: the map's render style outranks any finish - a wireframe scene renders a
      // wireframe hull, exactly as it does every body. Baked at load because setRender rebuilds.
      if (renderStyle.startsWith('wire')) {
        const occluded = renderStyle.endsWith('-occ');
        const wireMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(tint), wireframe: true, transparent: true,
          opacity: renderStyle.includes('glow') ? 0.85 : 0.6, depthWrite: occluded
        });
        const occTargets: THREE.Mesh[] = [];
        g.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (mesh.isMesh) { mesh.material = wireMat; occTargets.push(mesh); }
          const line = c as THREE.LineSegments;
          if ((line as any).isLineSegments) line.visible = false; // crease edges double the wires
        });
        if (occluded) {
          // SOLID wireframe (the -occ styles): a depth-only copy of each mesh, pushed back a hair
          // by polygon offset so near-side wires survive while the far side and anything behind
          // the hull fail the depth test - the bodies' nested-occluder trick generalised to
          // arbitrary geometry (a shrunken copy only works on a sphere).
          const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
          for (const mesh of occTargets) mesh.add(new THREE.Mesh(mesh.geometry, occMat));
        }
      }
      // The plume is placed BEFORE the hull is scaled to the scene, because its stern-face default
      // is read off a bounding box and `holder.position` is in the model's own NORMALISED space.
      // Measuring after the scale mixed the two: the box came back in scene units (~1e-10 at true
      // scale) and the plume was pinned to the hull's centre instead of its stern.
      v.shipFx = attachDrivePlume(g, (ref.nozzles ?? []) as [number, number, number][]);
      // The nozzles mark the STERN, so their mean z-sign says which end the nose is (see noseSign
      // on BodyVisual). Placed nozzles clustered on +Z mean the model is authored nose-to-minus-Z,
      // and the facing code aims the OTHER end at the motion. Derived, not guessed - and only the
      // mean matters, so a mid-hull RCS thruster cannot flip a ship whose main drives are aft.
      const nz = (ref.nozzles ?? []) as [number, number, number][];
      // C18: the z that decides the nose must be the ORIENTED one - a rotated model's raw z-sign
      // is not its convention z-sign, and reading it raw made the facing code fight the orient.
      const orientQ2 = (g.children[0] as THREE.Object3D | undefined)?.quaternion ?? new THREE.Quaternion();
      v.nozzleMeanZ = nz.length
        ? nz.reduce((s, p) => s + new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(orientQ2).z, 0) / nz.length
        : null;
      v.noseSign = v.nozzleMeanZ !== null && v.nozzleMeanZ > 0 ? -1 : 1;
      applyExhaustColour(v, shipCapability?.[v.id]?.exhaustHex);
      g.scale.setScalar(sceneLen);
      g.visible = false; // updateConstructs reveals it when it is big enough on screen (pixel LOD)
      // The plume light's reach scales with the hull (light params ignore parent scale): a burning
      // ship glows over a few hull-lengths, never across the system - at true scale the old fixed
      // 3.2-unit reach would have lit planets from a 100 m exhaust.
      for (const rig of v.shipFx.rigs) rig.light.distance = Math.max(1e-12, sceneLen * PLUME_REACH_HULLS); // seed; updateConstructs re-states it against the DRAWN hull
      contentGroup.add(g);
      v.shipModel = g;
      v.shipLen = sceneLen;
      v.shipPrev = v.mesh.position.clone();
    } catch (e) {
      // Silence here cost several rounds of blind diagnosis: the ship simply stayed a glyph and
      // nothing said why. A warn is cheap and the glyph fallback still stands.
      console.warn('[holo] ship model could not be built for', v.id, e);
    }
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
  function updateTrueScaleFloor() {
    const unitsPerPx = sceneUnitsPerPixel(camera.fov, viewH);
    for (const b of bodies) {
      if (b.isConstruct || !b.baseScale) continue;
      let k = 1;
      if (bodySize < 0.999 && (b.radiusScene ?? 0) > 0) {
        // A body is measured by RADIUS, so it is floored by one. `floorScale` takes both on
        // whichever axis the caller measures on; only the TABLE is normalised to spans. Passing
        // spans here instead DOUBLES the enlargement cap - see the 1e-9 note in floorScale.
        const dist = camera.position.distanceTo(b.mesh.position);
        k = floorScale(b.radiusScene as number, bodyMinRadiusPx(!!b.isStar, !!b.satellite), unitsPerPx, dist);
      }
      if (k === b.screenK) continue;
      b.screenK = k;
      b.mesh.scale.set(b.baseScale.x * k, b.baseScale.y * k, b.baseScale.z * k);
    }
  }

  // The GM's size dial for a ship's drives, read from the node so an edit shows without a rebuild.
  function nozzleScaleOf(id: string): number {
    const n = currentSystem?.nodes.find((x) => x.id === id) as any;
    return Math.max(0.1, Math.min(4, n?.model?.nozzleScale ?? 1));
  }

  let _dbgAt = 0;
  let _camDbgAt = 0; // throttle for the __camDebug framing readout
  let _prevHaveDist = 0; // last frame's camera-to-target distance, for the creep readout
  const _dbgSize = new THREE.Vector3(); // scratch for the __shipDebug measured-extent readout
  const _dbgDest = new THREE.Vector3(); // scratch for the __shipDebug facing-chain readout
  const _shipLook = new THREE.Vector3();
  const _shipDelta = new THREE.Vector3();
  const _shipTan = new THREE.Vector3(); // scratch for the route-tangent heading
  const _lastOrigin = new THREE.Vector3(NaN, 0, 0); // detects a floating-origin rebase between frames

  // G3: a torch ship BRAKES engines-first, so during a deceleration burn the nose points backwards
  // along the path. Decided from the transit sampler's own velocities (v at t and t+60s), not from
  // screen deltas - compression bends the drawn path but cannot fake a burn. The threshold sits an
  // order of magnitude above solar gravity at 1 AU (~0.006 m/s^2), so a gravity coast that happens
  // to be slowing never reads as a burn. Throttled: one ship, four checks a second.
  const BRAKE_ACCEL_MS2 = 0.05;
  const FULL_PLUME_MS2 = 10; // fallback ceiling (~1 g) when the ship's own capability is unknown
  // How far a drive plume throws light, in HULL LENGTHS of the hull being lit. Written as a count
  // rather than a scene distance on purpose: the scene spans ten orders of magnitude, so the only
  // reach that means the same thing at both ends is one expressed in the subject's own size (R3).
  // Eight keeps a torch lighting its own ship and its immediate neighbourhood without a 100 m
  // exhaust washing over a planet, which is what the original number was chosen for.
  const PLUME_REACH_HULLS = 8;
  // Per-construct drive data from the HOST, which holds the rule pack the engine definitions
  // live in - the scene itself never reads pack data. accelMs2 drives thrust01 = the fraction of
  // the ship's OWN drive being used; exhaustHex (pack data, G15(4)) colours the plume, absent =
  // the hot blue-white default.
  let shipCapability: Record<string, { accelMs2: number; exhaustHex?: string }> | null = null;
  function setShipCapability(map: Record<string, { accelMs2: number; exhaustHex?: string }> | null) {
    shipCapability = map;
    for (const b of bodies) applyExhaustColour(b, map?.[b.id]?.exhaustHex);
  }
  /**
   * The instant a construct is DRAWN at - which is not always the display clock.
   *
   * Everything time-judged about a ship (plume, burn flip, route-line visibility, the in-transit
   * ladder rung) must be evaluated at the same instant its POSITION describes, or the view
   * contradicts itself. Found in the field (2026-08-08): a free-running player clock races hours
   * past the GM within minutes at the default 1 s = 1 h, so a ship drawn at the GM's stamped
   * position - mid-ACCELERATION on the GM's map - showed no plume, because the burn was being
   * judged at a local clock already deep into the coast. The ship and its torch were on two
   * different clocks.
   *
   * So: when route playback places the ship (follow-GM, display time inside the route window), the
   * ship's clock IS the display clock. Otherwise the ship sits where the GM's stamp put it, and its
   * clock is the stamp's own time. A construct with neither (an orbiting station) lives on the
   * display clock like every body.
   */
  function shipClock(node: any): number {
    const at = routeClock();
    if (at !== null) {
      const r = routeOf(node);
      if (r && at >= r.s && at <= r.e) return at;
    }
    const stamp = node?.vector_epoch_ms;
    return Number.isFinite(stamp) ? stamp : timeMs;
  }
  type SceneBurn = { braking: boolean; thrust01: number; thrusting: boolean; thrustDir?: { x: number; y: number } };
  let _burnCache: SceneBurn & { id: string; atMs: number } =
    { id: '', atMs: -Infinity, braking: false, thrust01: 0, thrusting: false };
  function shipBurnState(id: string): SceneBurn {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (_burnCache.id === id && now - _burnCache.atMs < 250) return _burnCache;
    const node = currentSystem?.nodes.find((n) => n.id === id) as any;
    // The planner's own segment labels say whether this is a burn and which way it points -
    // shipBurnAt reads them. (It replaced a velocity-difference that always measured zero; the
    // note in shipBurn.ts explains why, because the trap will look reasonable again one day.)
    const burn = shipBurnAt(node, shipClock(node));
    const cap = Math.max(0.01, shipCapability?.[id]?.accelMs2 ?? FULL_PLUME_MS2);
    const thrust01 = burn.thrusting && burn.accelMs2 > BRAKE_ACCEL_MS2 ? Math.min(1, burn.accelMs2 / cap) : 0;
    _burnCache = {
      id, atMs: now, braking: burn.braking && thrust01 > 0, thrust01,
      // Aim by the published thrust vector only while the drive is actually doing something; a
      // sub-threshold puff keeps the course heading rather than snapping the hull about.
      thrusting: thrust01 > 0,
      thrustDir: thrust01 > 0 ? burn.thrustDir : undefined
    };
    return _burnCache;
  }

  /** Paint a ship's plume in its drive's authored exhaust colour (pack data). The literal
   *  'none' is an honest authored answer - a reactionless drive HAS no exhaust - and suppresses
   *  the plume entirely rather than drawing a default-coloured one it should not have. */
  function applyExhaustColour(b: BodyVisual, hex: string | undefined) {
    const fx = b.shipFx;
    if (!fx) return;
    fx.suppressed = hex === 'none';
    const col = new THREE.Color(fx.suppressed ? '#000000' : (hex || '#bfe2ff'));
    // ONE rig per nozzle since the placer landed. This function was left reading the old
    // single-rig shape (fx.cone/glow/halo/light) when ShipFx became { rigs }, so it threw
    // `undefined.material` on EVERY construct with a model - inside attachShipModel's catch,
    // which said nothing. The ship silently stayed a glyph everywhere, in every view.
    for (const rig of fx.rigs) {
      (rig.cone.material as THREE.MeshBasicMaterial).color.set(col);
      (rig.glow.material as THREE.SpriteMaterial).color.set(col);
      (rig.halo.material as THREE.SpriteMaterial).color.set(col);
      rig.light.color.set(col);
    }
  }

  // G3: the drive plume - thrust feedback at the stern. Attached INSIDE the display model at the
  // oriented hull's -Z face centre (the convention makes the nozzle end derivable, no authoring
  // needed), so it rides every flip and turn for free: a braking ship's plume points prograde
  // because the whole ship does. Length and light scale with the SAMPLED acceleration - a coasting
  // ship shows nothing, which is the honest reading. Colour is a hot blue-white for now; exhaust
  // colour per engine belongs in rule-pack DATA when the finish menu lands (recorded follow-up).
  function attachDrivePlume(model: THREE.Group, nozzles: [number, number, number][] = []): ShipFx {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const sternZ = box.isEmpty() ? -0.5 : box.min.z;
    // The GM's placed drives, in the model's own space; with none placed, one plume at the stern
    // face centre - right for most hulls and what shipped before the placer existed.
    // C18: a stored nozzle point is in the model's own (pre-orient) space, but the holder lives in
    // the OUTER group where the hull sits ORIENTED - so carry each point through the wrap's
    // quaternion or a rotated model fires its plume along its old axis (straight up, in the
    // report). Aft stays outer -Z, the convention (modelViewer.ts:30). The stern default is
    // measured on the oriented box and stays as it is.
    const orientQ = (model.children[0] as THREE.Object3D | undefined)?.quaternion ?? new THREE.Quaternion();
    const points: THREE.Vector3[] = nozzles.length
      ? nozzles.map((pt) => new THREE.Vector3(pt[0], pt[1], pt[2]).applyQuaternion(orientQ))
      : [new THREE.Vector3(0, 0, sternZ)];
    const rigs: PlumeRig[] = [];
    for (const pt of points) {
      const holder = new THREE.Group();
      holder.position.copy(pt);
      // Cone flaring aft: apex at the nozzle, widening along -Z. ConeGeometry points +Y; the
      // rotation maps local +Y onto -Z, so scaling cone.scale.y lengthens the plume astern.
      // F6 parity extends to the FLAME: in a wireframe scene the exhaust is drawn as vector
      // geometry too, or a solid glowing cone hangs off a wireframe hull.
      const wire = renderStyle.startsWith('wire');
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 1, wire ? 8 : 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xbfe2ff, transparent: true, opacity: wire ? 0.75 : 0.55, wireframe: wire,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      cone.rotation.x = Math.PI / 2;
      holder.add(cone);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(), color: 0xdff0ff, transparent: true, opacity: wire ? 0.35 : 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      holder.add(glow);
      // A second, much wider, much softer halo: the bloom a real torch throws. Additive over the
      // core glow, so a hard burn reads as a bright smear from any angle - including straight
      // down, which is what the "2D" map is (the holo scene locked overhead).
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(), color: 0xdff0ff, transparent: true, opacity: wire ? 0.1 : 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      holder.add(halo);
      const light = new THREE.PointLight(0xbfe2ff, 0, 3.2, 2); // intensity driven per frame
      holder.add(light);
      holder.visible = false;
      model.add(holder);
      rigs.push({ holder, cone, glow, halo, light });
    }
    return { rigs };
  }
  function updateConstructs() {
    const f = sceneUnitsPerPixel(camera.fov, viewH);
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
      // A loaded hull ALWAYS replaces the glyph - the model IS the marker (design §6). Two earlier
      // rules both failed here and are recorded so neither comes back: hiding it below ~10 px
      // meant a whole-system preset (which never zooms to a body) showed the icon forever, and
      // gating on the focus set meant a ship in DEEP SPACE - not in the system's visible set at
      // all - stayed a cross however far you zoomed in. Legibility is a SCREEN-SIZE floor, never
      // a reason to withhold the render.
      // A surface construct's hull is suppressed (RENDER-S13's exception) - but a TETHER is the one
      // surface construct whose entire point is that it leaves the ground, so it is exempt.
      const showModel = !!b.shipModel && (!b.surfaceLock || b.exotic?.render3d.anchor === 'surface-stand');
      if (b.shipModel) {
        b.shipModel.visible = showModel;
        if (showModel) {
          // THE FLOOR MUST LET GO WHEN THE CAMERA COMMITS TO THIS SHIP. A screen-size floor pins
          // the hull to a constant number of pixels, which is right for a marker and WRONG for a
          // close-up: while it is active, moving the camera cannot change the apparent size at
          // all, so zooming did nothing until the true size finally overtook the floor and the
          // ship leapt from a speck to enormous. Worse, `frameDistance` frames by the ship's TRUE
          // length, so at 1:1 the camera flew to a distance suited to a 46 m hull while the hull
          // was drawn at 14 px - the two pulling against each other is the "wrestles the view".
          // So: framed => draw it at its real size and let the camera do the work, exactly as a
          // true-scale body behaves; otherwise floor it so it stays findable.
          const framingThis = focusedId === b.id && followEngaged && !framingWhole;
          const minPx = constructMinSpanPx({ framed: framingThis, inFocus });
          // DIAGNOSTIC HOOK. Ship scale has been misdiagnosed from screenshots repeatedly - the
          // drawn size depends on the dial, the camera distance and the viewport together, and
          // none of those can be read off a picture. `window.__shipDebug = true` in any window
          // logs the real numbers once a second, which settles it in one round instead of four.
          //
          // `measured` is the load-bearing field and it is NOT redundant with `drawn`. `drawn` is
          // only what this function INTENDS; `measured` is the hull's actual world extent. An
          // earlier version logged the intent alone, reported a serene onScreenPx of 7 while the
          // hull was really 204 px across, and the arithmetic checked out to five figures against
          // a picture of a station spanning a fifth of an AU - so "measure it, don't judge from a
          // screenshot" still produced the wrong answer. `measured` is an AXIS-ALIGNED box round a
          // hull that turns with its heading, so it reads up to ~1.7x the true length: a ratio
          // near 1 is healthy, and the fault this caught showed a ratio of 25. A ratio well off 1
          // means the render disagrees with this maths and the fault is upstream in the model
          // group, not in the floor.
          if ((window as any).__shipDebug && performance.now() - _dbgAt > 1000) {
            _dbgAt = performance.now();
            const drawn = Math.max(b.shipLen ?? 0, flooredSpanScene(minPx, f, distToCam));
            const measured = Math.max(...new THREE.Box3().setFromObject(b.shipModel)
              .getSize(_dbgSize).toArray());
            // The BURN too: a player's node carries `driveBurns` (compact) where the GM's carries
            // journeys, and "the plume is not lit on the player view" cannot be told apart from
            // "the ship is coasting right now" by looking. `hasBurnData` says whether this node
            // knows about any burn at all, which separates a redaction fault from a quiet engine.
            const _burn = shipBurnState(b.id);
            const _node = currentSystem?.nodes.find((n) => n.id === b.id) as any;
            // ...and the CLOCK the burns are judged against, which `hasBurnData` alone cannot
            // separate from a quiet engine. A burn window is stated in GAME-clock milliseconds; a
            // surface running a clock of its own compares them against a different epoch entirely
            // and every window misses, so the data can be present and correct and the plume still
            // dark. `clockInBurn` false while `hasBurnData` is true and `burnWindow` is nowhere
            // near `clock` IS that fault, and it is not visible in any other field.
            const _burns: any[] = _node?.driveBurns ?? [];
            const _win = _burns.length
              ? { s: _burns[0].s, e: _burns[_burns.length - 1].e }
              : (() => { const r = routeOf(_node); return r ? { s: r.s, e: r.e } : null; })();
            console.log('[shipdbg]', b.id, JSON.stringify({
              shipLen: b.shipLen, dist: distToCam, viewH, bodySize, minPx, framingThis, inFocus,
              drawn, onScreenPx: drawn / (f * distToCam),
              measured, measuredPx: measured / (f * distToCam), ratio: measured / drawn,
              thrust01: _burn.thrust01, braking: _burn.braking,
              hasBurnData: !!(_node?.driveBurns?.length || _node?.scheduled_journeys?.length),
              clock: timeMs, shipClock: shipClock(_node), burnWindow: _win,
              clockInBurn: !!_win && (() => { const c = shipClock(_node); return c >= _win.s && c <= _win.e; })(),
              // THE FACING CHAIN, one field per link, because the 480 report exhausted inference:
              // every consistent (nozzle-end, nose-end) assignment predicts a correct facing, so
              // one of the assumed facts is false and only measurement says which. nozzleMeanZ is
              // where the drives actually sit in model space (null = none placed, noseSign never
              // fired); noseSign is what was derived; deltaTowardDest is the MOTION's sign - +1
              // means the ship's frame-to-frame delta points at its destination (prograde), -1
              // means the delta itself is backwards and the facing code is innocent.
              noseSign: b.noseSign ?? 1,
              nozzleMeanZ: b.nozzleMeanZ ?? null,
              deltaTowardDest: (() => {
                const rt = routeOf(_node);
                if (!rt || !b.shipPrev) return null;
                positionToScene(rt.p[rt.p.length - 1], _dbgDest);
                const dx = b.mesh.position.x - b.shipPrev.x, dy = b.mesh.position.y - b.shipPrev.y, dz = b.mesh.position.z - b.shipPrev.z;
                if (dx * dx + dy * dy + dz * dz === 0) return 0; // parked between stamps: no verdict
                const tx = _dbgDest.x - b.mesh.position.x, ty = _dbgDest.y - b.mesh.position.y, tz = _dbgDest.z - b.mesh.position.z;
                return Math.sign(dx * tx + dy * ty + dz * tz);
              })(),
              // The plume light's reach, in hull lengths of what is actually DRAWN - a number well
              // under 1 means it is lighting the inside of its own hull (the P3c reach fault).
              lightReachHulls: (b.shipFx?.rigs?.[0]?.light.distance ?? 0) / Math.max(1e-30, drawn)
            }));
          }
          // Work in WORLD units directly: the size that occupies minPx at this distance is
          // minPx * f * dist, so the drawn size is simply the larger of that and the true size.
          // The previous form divided by the on-screen size to get a multiplier, and at TRUE
          // scale that divisor is ~1e-9 - right on the guard clamp added to avoid dividing by
          // zero. Once the clamp fired the result stopped tracking distance, so the hull was
          // drawn AU across and grew as you zoomed: the two faults reported together.
          const minWorld = minPx * f * distToCam;
          let drawnLen = Math.max(b.shipLen ?? 0, minWorld);
          if (b.exotic?.render3d.anchor === 'surface-stand') {
            // THE RIBBON IS DRAWN IN ITS HOST'S OWN CURRENCY, LIVE. Its geometry is unit host
            // radius, so the scale IS the host's drawn radius: the dial-correct `radiusScene`
            // times the screen floor's `screenK` - the same pair `updateRings` uses so Saturn
            // keeps its rings at true scale, and the same pair the label clearance reads.
            // THE FAULT THIS REPLACES: the old branch set scale 1 and was then overwritten by the
            // trailing `setScalar(drawnLen)` below, so the beanstalk was scaled by its OWN length
            // - the currency squared - and a 5.6-Earth-radii ribbon drew as a tick a fraction of
            // the globe (owner, three sightings). Dead code hid it: the comment said 1 and the
            // next statement said otherwise.
            const hostV = b.parentId ? bodyById.get(b.parentId) : undefined;
            const hostDrawnR = hostV ? (hostV.radiusScene ?? 0) * (hostV.screenK ?? 1) : 0;
            // NO PIXEL FLOOR HERE, deliberately: a beanstalk that will not shrink with its world
            // detaches from it. When the planet is a dot the ribbon is a dot, and the glyph and
            // label carry the marker duty - which is exactly what they are for.
            if (hostDrawnR > 1e-12) drawnLen = hostDrawnR;
          } else if (b.exotic?.render3d.anchor === 'host-centred') {
            // THE RING ENCLOSES ITS STAR (G53). Its drawn radius is the distance between its own
            // projected position and its host's - which IS the drawn radius of its orbit, already
            // computed, already compressed, already dial-correct. Taking it from there rather than
            // re-projecting `a_AU` means the shell and its own orbit line cannot disagree at any
            // compression or dial position. Geometry is built at radius 0.5, so scale = 2 x radius.
            const hostV = b.parentId ? bodyById.get(b.parentId) : undefined;
            if (hostV) {
              const orbitRadius = b.mesh.position.distanceTo(hostV.mesh.position);
              if (orbitRadius > 1e-9) drawnLen = orbitRadius * 2;
            }
          }
          b.shipModel.scale.setScalar(drawnLen);
          // THE PLUME LIGHT'S REACH FOLLOWS THE HULL THAT IS ACTUALLY DRAWN, not the authored one.
          // It was set once at build from `shipLenScene` - the ship's TRUE length - while this line
          // rescales the hull every frame to hold the pixel LOD. At true scale that floor does most
          // of the work: a 46 m ship whose true length is ~2e-10 scene units is drawn at ~1e-6 to
          // stay a few pixels wide, so the light's cutoff sat a thousandfold inside the hull it was
          // meant to illuminate and lit a volume nobody could see. Expressed here in hull lengths of
          // the LIT object (the owner's ask), it means the same thing at every scale and dial stop.
          for (const rig of b.shipFx?.rigs ?? []) rig.light.distance = Math.max(1e-12, drawnLen * PLUME_REACH_HULLS);
          if (b.exotic?.render3d.anchor === 'surface-stand') {
            // Positioned and oriented by updateSurfaceConstructs, which knows the live anchor.
          } else if (b.exotic?.render3d.anchor === 'host-centred') {
            const hostV = b.parentId ? bodyById.get(b.parentId) : undefined;
            b.shipModel.position.copy(hostV ? hostV.mesh.position : b.mesh.position);
          } else {
            b.shipModel.position.copy(b.mesh.position);
          }
          if (!b.shipPrev) b.shipPrev = b.mesh.position.clone();
          _shipDelta.copy(b.mesh.position).sub(b.shipPrev);
          const burn = shipBurnState(b.id);
          // Nose-first along its motion (ModelRef convention: nose +Z, drive -Z), wings level to
          // the scene - and FLIPPED during a deceleration burn, because a torch ship brakes
          // engines-first. Holds its last heading when parked or the clock is paused.
          // The motion threshold is RELATIVE to the hull, not absolute: at true scale a frame's
          // travel is metres (~1e-12 units), and the old absolute guard (1e-7) swallowed it -
          // the ship held a stale heading and ignored its own orbit line. 0.1% of the hull per
          // frame is real motion at every dial position.
          const moveEps = Math.max(1e-24, ((b.shipLen ?? 0.2) * 1e-3) ** 2);
          // THE HEADING COMES FROM THE ROUTE'S TANGENT where the ship has a route - measured, not
          // inferred (2026-08-08, the deltaTowardDest:0 trace): a ship between snapshot stamps does
          // not move AT ALL, so heading-from-motion never fired on a player view with the GM's
          // clock paused, and the hull sat in its build-default pose - which is what three field
          // reports of "facing the wrong way" actually were. The route knows the course direction
          // at any instant without needing the ship to move; motion-delta remains only as the
          // fallback for routeless craft (a station drifting, a ship the GM nudges by hand).
          //
          // lookAt SEMANTICS, verified in three's source (Object3D.lookAt): for a NON-camera the
          // arguments are swapped internally, so a mesh's PLUS-Z points AT the target - looking at
          // (position + heading) puts +Z on the course, which is the ModelRef convention's nose.
          // (A fix that "corrected" this to minus-delta shipped in v2.1.479 on the camera
          // convention reading of lookAt and was wrong.) noseSign handles the model whose VISUAL
          // nose is authored on -Z, derived from the GM's placed nozzles (they mark the stern).
          // The braking negate composes on top: a torch ship brakes engines-first either way.
          let heading = false;
          const rl = routeLines.length ? routeLines.find((x) => x.id === b.id) : undefined;
          // WHILE THE ENGINES ARE LIT, THE NOSE GOES ON THE THRUST - not on the course.
          //
          // Owner, 2026-08-26: orientation "is ONLY important when the engines are firing", and then it
          // should be "pointing in direction of desired vector". Those are different vectors: a burn's
          // Delta-v is what CHANGES the velocity, so it sits at an angle to it, and a departure burn can
          // be well off the course line. The route tangent below is the right answer for a coasting ship
          // and an approximation for a burning one; the flip for a brake is that approximation's crude
          // half. The solver now publishes the direction it sized the burn from (`thrustDir`), so where
          // it is present the nose goes exactly there and the brake flip is not needed - retrograde is
          // simply what a braking Delta-v already points.
          //
          // Converted by finite difference THROUGH `positionToScene`, like the tangent, because the
          // radial compression bends directions and a world-space vector is not a scene-space one.
          let thrustAimed = false;
          if (rl && burn.thrusting && burn.thrustDir) {
            const sc = shipClock(rl.node);
            const here = routeStateAt(rl.route, Math.min(rl.route.e, Math.max(rl.route.s, sc)));
            if (here) {
              const step = Math.max(1e-9, Math.hypot(here.x, here.y) * 1e-3);
              positionToScene(
                { x: here.x + burn.thrustDir.x * step, y: here.y + burn.thrustDir.y * step, z: here.z ?? 0 },
                _shipLook
              );
              _shipDelta.copy(_shipLook).sub(positionToScene(here, _shipTan));
              thrustAimed = heading = _shipDelta.lengthSq() > 0;
            }
          }
          if (rl && !thrustAimed) {
            const sc = shipClock(rl.node);
            if (sc >= rl.route.s && sc <= rl.route.e) {
              // Tangent by central difference on the SAME curve the line draws, through the live
              // compression (positionToScene), so the nose lies along the drawn course exactly.
              const dtT = Math.max(1000, (rl.route.e - rl.route.s) / 512);
              const p0 = routeStateAt(rl.route, Math.max(rl.route.s, sc - dtT));
              const p1 = routeStateAt(rl.route, Math.min(rl.route.e, sc + dtT));
              if (p0 && p1) {
                positionToScene(p1, _shipLook);
                _shipDelta.copy(_shipLook).sub(positionToScene(p0, _shipTan));
                heading = _shipDelta.lengthSq() > 0;
              }
            }
          }
          if (heading || (!rebased && _shipDelta.lengthSq() > moveEps)) {
            // The published thrust direction already points the right way; the flip is only for the
            // course-tangent fallback, which does not know a brake from a burn.
            if (burn.braking && !thrustAimed) _shipDelta.negate();
            _shipDelta.multiplyScalar(b.noseSign ?? 1);
            b.shipModel.lookAt(_shipLook.copy(b.mesh.position).add(_shipDelta));
          }
          // Drive plume: length and light scale with the fraction of the ship's OWN drive in use -
          // quadratic so a station-keeping puff whispers and a 100% torch burn is SUPER bright and
          // long. Rides the stern inside the model, so the brake flip points it prograde for free.
          const fx = b.shipFx;
          if (fx) {
            const t = fx.suppressed ? 0 : burn.thrust01;
            // Several nozzles each take a share of the width, so a four-drive ship reads as one
            // ship under power rather than four torches; the GM's nozzleScale multiplies on top.
            const share = fx.rigs.length > 1 ? 1 / Math.sqrt(fx.rigs.length) : 1;
            const k = share * (nozzleScaleOf(b.id) || 1);
            for (const rig of fx.rigs) {
              rig.holder.visible = t > 0;
              if (t <= 0) { rig.light.intensity = 0; continue; }
              const len = k * (0.3 + 2.6 * t * t + 0.5 * t);   // up to ~3.4 hull-lengths at 100%
              const width = k * (0.55 + 1.1 * t);
              rig.cone.scale.set(width, len, width);
              rig.cone.position.z = -len / 2;                   // keep the apex at the nozzle
              (rig.cone.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.5 * t;
              rig.glow.scale.setScalar(k * (0.14 + 0.4 * t));
              (rig.glow.material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * t;
              // The halo blooms with the square of thrust - barely there at a station-keeping
              // puff, a wide bright smear at full torch.
              rig.halo.scale.setScalar(k * (0.3 + 2.2 * t * t));
              rig.halo.position.z = -len * 0.35;
              (rig.halo.material as THREE.SpriteMaterial).opacity = 0.1 + 0.4 * t * t;
              rig.light.intensity = 7 * t * t * share;          // the SUPER-bright end is the light
            }
          }
        } else if (b.shipFx) {
          for (const rig of b.shipFx.rigs) { rig.holder.visible = false; rig.light.intensity = 0; }
        }
        b.shipPrev ? b.shipPrev.copy(b.mesh.position) : (b.shipPrev = b.mesh.position.clone());
      }
      (b.mesh as THREE.Sprite).visible = !showModel;
      (b.mesh as THREE.Sprite).scale.setScalar((inFocus ? CONSTRUCT_PX_FOCUS : CONSTRUCT_PX_IDLE) * f);
      ((b.mesh as THREE.Sprite).material as THREE.SpriteMaterial).opacity = inFocus ? 1 : 0.45;
    }
  }

  // THE CAMERA IS A BASE PLUS AN OFFSET (RENDER-S12; viewport/cameraRig.ts, shotSolver.ts).
  //
  //   base   - the shot the SYSTEM wants, recomputed from live positions EVERY frame.
  //   offset - what the USER did to it (turn, zoom). Identity until they touch it.
  //   camera = compose(base, offset)
  //
  // Read `deriveOffset` first: it measures the user's manipulation back out of the camera against
  // last frame's base, so mouse input and system framing are never in competition - there is no
  // arbitration, no priority, no flag. Six mechanisms used to sit between "here is where the camera
  // goes" and the camera going there, and by eye every one produced the same symptom. Four cannot
  // happen in this shape: a moving subject cannot outrun the shot (the base IS its position), a
  // scene rebuild cannot disturb it (a rebuild is just a new base), the transition cannot strand
  // the camera (it is cosmetic - interrupt it and the next frame still converges), and a policy
  // floor cannot be expressed independently of the subject (zoom is a RATIO of the framed distance).
  const REFRAME_BLEND = 0.18; // per-frame fraction of the remaining gap; cosmetic only
  const _rigTarget = { x: 0, y: 0, z: 0 };
  const _rigCam = { x: 0, y: 0, z: 0 };
  const v3 = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });

  /** The shot the system wants right now: target, unit heading, distance. Pure inputs, no state. */
  function computeBase(): Shot | null {
    const b = !framingWhole && focusedId && followEngaged ? bodies.find((x) => x.id === focusedId) : undefined;
    // A focused belt isn't a body - it's an annulus about the star, framed specially.
    const beltFocus = !framingWhole && focusedId && followEngaged && !b ? beltVisuals.find((x) => x.id === focusedId) : undefined;
    const lens = { fovYDeg: camera.fov, aspect: camera.aspect };
    // The HEADING POLICY is what used to be a whole branch of this function. A locked view freezes
    // the azimuth (rotation impossible by construction); everything else approaches radially from
    // the system centre. P3 swaps the free case to 'host-relative' - one line, because the policy
    // is already implemented and tested in shotSolver.
    const policy = lockRotate
      ? ({ kind: 'fixed-azimuth', azimuth: lockedHeading } as const)
      // A71: levelled, like the host-relative follow shot — and the two MUST both level, because
      // the follow shot falls back to this policy when the host would occlude (wide zoom), and a
      // levelled/unlevelled mismatch snapped the elevation by the subject's inclination at every
      // crossing — the once-per-orbit "view reset" on inclined orbits.
      : ({ kind: 'radial', level: true } as const);
    const tilt = flatOverhead && lockRotate ? LOCK_POLAR : framingAngleRad;

    if (b) {
      // G53 §Phase 3b(c): A RING, SHELL OR SWARM IS FRAMED LIKE A BELT — the structure AND its host
      // in one shot. Owner, 2026-08-30: "utilise the BELT like selection for ring/sphere object
      // framing. i.e. first click shows ring/belt and host object (usually the star)." The old shot
      // flew to a point ON the ring with the star out of frame, because an annulus exotic's
      // node position IS a point on its own hoop (RENDER-S44). So: target the HOST, and take the
      // belt solver's distance from the ring's drawn radius — the same two numbers updateConstructs
      // already recomputes every frame, so this shot cannot disagree with the drawn shell.
      if (b.exotic?.framing === 'annulus') {
        const hostV = b.parentId ? bodyById.get(b.parentId) : undefined;
        if (hostV) {
          const hostPos = v3(hostV.mesh.position);
          const ringR = b.mesh.position.distanceTo(hostV.mesh.position);
          return {
            target: hostPos,
            heading: headingDirection({ policy, tiltRad: tilt, subject: undefined, origin: hostPos }),
            dist: beltDistance(ringR, GRID_RADIUS)
          };
        }
      }
      const target = v3(b.mesh.position);
      // A SURFACE CONSTRUCT has no standalone shot worth taking: it is a point ON a world, its hull
      // is not drawn at all (`showModel` suppresses it under surfaceLock), and framing to its own
      // extent would fly the camera inside the planet. Frame the HOST instead, approached from
      // straight above the construct - camera on the line host->construct - so the thing you
      // selected sits dead centre on the disc, which is the only view that actually shows it.
      const hostV = (b.surfaceLock || b.surfaceDeclared) && b.framingParentId ? bodyById.get(b.framingParentId) : undefined;
      if (hostV) {
        const hostPos = v3(hostV.mesh.position);
        return {
          target: hostPos,
          // tilt PI/2 makes the heading exactly the outward direction, i.e. the construct's own
          // radial from its world - no extra elevation, or it slides off centre.
          heading: headingDirection({ policy: { kind: 'host-relative' }, tiltRad: Math.PI / 2, subject: target, host: hostPos }),
          dist: frameDistanceFor({
            radius: hostV.radiusScene ?? 0,
            context: { level: 3 }, // the world close-up: it fills the frame, the construct is on it
            lens,
            policy: { fillFrac: frameFillFrac, minDistance: controls.minDistance }
          })
        };
      }
      // P3/R2: HOST-AWARE HEADING. Approach along host -> subject, so the subject sits in FRONT of
      // its host and the host can never be the thing between you and what you selected. The old
      // radial approach came outward from the SYSTEM CENTRE and knew nothing about the parent, so a
      // moon or a station in low orbit could end up squarely behind its own world.
      //
      // The occlusion guarantee is structural, not a heuristic: with the camera on the subject's far
      // side and closer to it than the host is, the host cannot intrude (`hostWouldOcclude` states
      // the condition). Where it CANNOT hold - a station skimming its primary, where the framing
      // distance exceeds the separation - fall back to the radial shot rather than pretend, because
      // at that point no heading both frames the subject and clears the host.
      const dist = frameDistance(b);
      const hostFraming = !lockRotate && b.framingParentId ? bodyById.get(b.framingParentId) : undefined;
      const hostPos = hostFraming ? v3(hostFraming.mesh.position) : undefined;
      const sep = hostPos ? Math.hypot(target.x - hostPos.x, target.y - hostPos.y, target.z - hostPos.z) : 0;
      const useHost = !!hostPos && !hostWouldOcclude({ dist, subjectRadius: renderedSpanScene(b), hostSeparation: sep });
      return {
        target,
        heading: useHost
          // A71 `level`: the follow shot's elevation belongs to the tilt, not to the subject's
          // orbital inclination — an inclined close-in planet on a fast clock was bouncing the
          // camera once per orbit. The surface-construct shot above deliberately does NOT level.
          ? headingDirection({ policy: { kind: 'host-relative', level: true }, tiltRad: tilt, subject: target, host: hostPos })
          : headingDirection({ policy, tiltRad: tilt, subject: target, origin: v3(originShift) }),
        dist
      };
    }
    if (framingWhole) {
      const target = v3(originShift);
      return {
        target,
        heading: headingDirection({ policy, tiltRad: tilt, subject: undefined, origin: target }),
        dist: wholeSystemDistance(GRID_RADIUS, lens)
      };
    }
    if (beltFocus) {
      const target = v3(originShift);
      return {
        target,
        heading: headingDirection({ policy, tiltRad: tilt, subject: undefined, origin: target }),
        dist: beltDistance(beltFocus.outerScene, GRID_RADIUS)
      };
    }
    return null; // nothing focused: the camera is entirely the user's
  }

  function driveFocus() {
    const base = computeBase();
    if (!base) {
      // No focus: leave the camera exactly where the user put it, and forget the old base so the
      // next selection measures their offset against a fresh shot rather than a stale one.
      lastBase = null;
      reframing = false;
      return;
    }

    // 1. READ THE USER. Whatever they did with the mouse since the last frame (OrbitControls has
    //    already applied it) becomes the offset, measured against the base it was composed from.
    //    Measured about the BASE TARGET, not controls.target, so a pan cannot corrupt the reading.
    // NOT while `reframing`: during a blend the camera is being moved by the SYSTEM, so reading an
    // offset out of it reads our own transition back as if it were the user's intent. That fed the
    // blend's first 18% step straight back in as "the user is zoomed out", the composed shot
    // collapsed onto where the camera already was, `shotReached` said yes, and the re-frame ended
    // after one frame - which on screen is a selection that barely moves, or moves the wrong way.
    // The user interrupts a blend through the wheel/drag handlers, which clear `reframing` and let
    // this resume; that is the intended handover and it is why no flag is needed here.
    // The turntable moves the camera on the user's behalf, so it counts as them.
    if (controls.autoRotate) noteUserInput('turntable');
    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (lastBase && !reframePending && !reframing && userDroveCamera) {
      if (nowMs > userInputUntil) userDroveCamera = false; // the tail has run out; stop trusting it
      const zoomBeforeDerive = viewOffset.zoom;
      viewOffset = deriveOffset(lastBase, v3(camera.position), lastBase.target);
      // A locked view cannot be rotated - that is the meaning of the lock. Keeping their ZOOM while
      // discarding their rotation is the honest expression of it; the old code achieved the same by
      // overwriting the camera every frame, which is why it read as "the view fights me".
      if (lockRotate) viewOffset = { dAz: 0, dEl: 0, zoom: viewOffset.zoom };

      // A DRAG IS A ROTATION. It must never change the distance, so the zoom is taken from the
      // camera ONLY when the wheel is what moved it. Anything else keeps the zoom it already had.
      //
      // This is not defensive coding, it is the actual fix, and it kills a whole class rather than
      // one bug. Reading distance back out of the camera assumes nothing else alters it - an
      // assumption that has now failed three times (a floating-origin rebase, an unfound writer,
      // and this). Measured here: while dragging, the camera-to-target distance decayed by a
      // constant ~0.72% PER FRAME - 6.51e-4, 6.47e-4, 6.42e-4 ... 2.33e-4 - and the derived zoom
      // rode it all the way down to the min-distance clamp. A wheel-out then moved the camera out
      // for one frame before the creep hauled it back, which is exactly "something fighting me to
      // maintain the view". With zoom sourced only from wheel input, that creep cannot be mistaken
      // for intent, whatever is causing it.
      // ...and the test is `ownsDistance`, not a literal 'wheel'. Written as the literal, this line
      // reverted every PINCH on every touch device: the gesture dollied the camera, the rig was not
      // told a zoom had happened, and the distance was politely put back the next frame (C10).
      if (!ownsDistance(lastInput.kind) || nowMs > userInputUntil) {
        viewOffset = { dAz: viewOffset.dAz, dEl: viewOffset.dEl, zoom: zoomBeforeDerive };
      }
    }
    if (reframePending) {
      viewOffset = { ...IDENTITY_OFFSET }; // the one way the system takes the camera back (R5)
      reframePending = false;
    }
    viewOffset = clampZoom(viewOffset, base.dist, controls.minDistance, controls.maxDistance);

    // 2. COMPOSE. This is where the camera belongs this frame, at any subject speed.
    const want = composeShot(base, viewOffset);

    // DIAGNOSTIC (RENDER-S12). `window.__camDebug = true` prints the shot the system wants, where
    // the camera actually is, and - the fields that matter in this model - whether the USER owns
    // the view (offset != identity) and whether a cosmetic blend is running. Framing complaints
    // ("too far out", "it snaps back", "it fights me") are indistinguishable by eye and trivially
    // separable here.
    if ((window as any).__camDebug && performance.now() - _camDbgAt > 1000) {
      _camDbgAt = performance.now();
      console.log('[camdbg]', focusedId, JSON.stringify({
        level: focusLevel, wantDist: want.dist, baseDist: base.dist,
        haveDist: camera.position.distanceTo(controls.target),
        minDistance: controls.minDistance, maxDistance: controls.maxDistance, reframing,
        offsetZoom: viewOffset.zoom, userHasView: !isIdentity(viewOffset),
        // THE ONE THAT SETTLES "dragging sideways zooms". OrbitControls rotates the camera about
        // `controls.target`; the rig measures the offset from `lastBase.target`. If those two are
        // not the same point, a pure rotation CHANGES the measured distance and is read back as a
        // zoom. Any non-zero value here relative to the shot distance is that bug.
        // THE CLOCK TEST (owner's hypothesis, and the signature fits: a constant RATIO per frame is
        // what a constant angular rate gives, not what a fixed-step bug gives). `subjectMove` is how
        // far the subject travelled since the last frame, as a fraction of the shot distance. If the
        // creep is the clock, this is non-zero while the clock runs, goes to zero when it is paused,
        // and scales with the time rate. `distDrift` is the fraction the camera-to-target distance
        // changed over the same interval - if the two track each other, that is the mechanism.
        subjectMove: lastBase ? Math.hypot(
          base.target.x - lastBase.target.x,
          base.target.y - lastBase.target.y,
          base.target.z - lastBase.target.z) / Math.max(1e-12, base.dist) : 0,
        distDrift: _prevHaveDist > 0
          ? camera.position.distanceTo(controls.target) / _prevHaveDist - 1 : 0,
        targetDrift: lastBase ? Math.hypot(
          controls.target.x - lastBase.target.x,
          controls.target.y - lastBase.target.y,
          controls.target.z - lastBase.target.z) / Math.max(1e-12, base.dist) : 0,
        userTail: userDroveCamera,
        // Cause beside effect: what the last input was, which way, how long ago, and the distance
        // it started from - compare that against haveDist above.
        input: lastInput.kind, inputDir: lastInput.dir,
        msSinceInput: Math.round(nowMs - lastInput.atMs), distAtInput: lastInput.distAt,
        polarMax: controls.maxPolarAngle,
        camPolar: Math.acos(Math.max(-1, Math.min(1, (camera.position.y - controls.target.y) /
          Math.max(1e-12, camera.position.distanceTo(controls.target))))),
        followEngaged, lockRotate, framingWhole
      }));
    }

    // 3. MOVE. Cosmetic only: a blend that cannot change the destination. Interrupt it, rebuild the
    //    scene, drop frames - the next frame still converges on `want`.
    if (reframing) {
      _rigTarget.x = controls.target.x; _rigTarget.y = controls.target.y; _rigTarget.z = controls.target.z;
      _rigCam.x = camera.position.x; _rigCam.y = camera.position.y; _rigCam.z = camera.position.z;
      const from = { target: _rigTarget, camera: _rigCam };
      const to = { target: want.target, camera: want.camera };
      if (shotReached(from, to)) {
        reframing = false;
      } else {
        const step = blendToward(from, to, REFRAME_BLEND);
        controls.target.set(step.target.x, step.target.y, step.target.z);
        camera.position.set(step.camera.x, step.camera.y, step.camera.z);
        lastBase = base;
        return;
      }
    }
    controls.target.set(want.target.x, want.target.y, want.target.z);
    camera.position.set(want.camera.x, want.camera.y, want.camera.z);
    lastBase = base;
    _prevHaveDist = camera.position.distanceTo(controls.target);
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

    if (framingWhole) { visibleSet = getVisibleNodeIds(currentSystem, focusedId); return; } // whole: select only — the camera never moves
    // Tighten the min-zoom to the focused body's rendered size so a tiny true-scale world can still be
    // brought up large on screen — the viewer doesn't need to know the size to get the right zoom.
    const bv = id ? bodies.find((x) => x.id === id) : undefined;
    const rad = renderedSpanScene(bv);
    // THE ZOOM FLOOR IS THE SUBJECT'S SURFACE, PLUS A METRE (owner, 2026-08-06). You may fly right
    // down to a world or a hull and stop just off it; you may not fly through it.
    //
    // This also removes the reason Earth disappeared at a ship close-up, which is why it replaces
    // the logarithmic-depth-buffer work rather than sitting beside it. The near plane follows the
    // working distance (2% of it), so a camera allowed inside a planet drove `near` to ~4e-10
    // against a `far` fixed at 2000 - a ~5e12 depth ratio, far beyond what a 24-bit depth buffer can
    // resolve, so bodies and their occluders stopped separating in depth. Stopping at the surface
    // keeps the ratio sane BY CONSTRUCTION, at every scale, without every hand-written
    // ShaderMaterial having to opt into anything.
    //
    // `rad` is the RENDERED radius (a construct's is half its drawn hull), so the floor tracks the
    // body-size dial: at true scale you get within a metre of a real 6371 km world, and at the
    // readable end you stop off the inflated globe you can actually see. One metre is converted
    // through the same true-scale factor everything else uses - no invented constant.
    const oneMetreScene = (0.001 / AU_KM) * (GRID_RADIUS / Math.max(1e-9, rMax));
    const surfaceStop = (bv?.isConstruct ? rad / 2 : rad) + oneMetreScene;
    controls.minDistance = id ? Math.max(1e-10, surfaceStop) : unfocusedMinDist();
    if (id) requestReframe(); else { reframing = false; reframePending = false; }
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
    requestReframe(); // ease into the GM's shot
    followEngaged = true;
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
    requestReframe(); // back out to the wider shot
    followEngaged = true;

    return true;
  }

  /**
   * Follow the GM's MANUAL viewport (rough, by design): centre + half-extent in TRUE AU, mapped through
   * this scene's own compression. 2D keeps its frozen heading; 3D takes the same shot raised to its
   * configured tilt. The GM's hand replaces any local follow until the player (re)selects something.
   */
  function setViewportAU(cx: number, cy: number, halfExtentAU: number) {
    followEngaged = false;
    reframing = false; reframePending = false; viewOffset = { ...IDENTITY_OFFSET }; lastBase = null;
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
    reframing = false; reframePending = false; viewOffset = { ...IDENTITY_OFFSET }; lastBase = null;
    followEngaged = false;
    lockedHeading = 0; // HOME sits on x=0, azimuth 0
    controls.minDistance = unfocusedMinDist();
    resetOrigin(); // homeCam() and the target below are stated in absolute scene coordinates
    camera.position.copy(homeCam());
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
  /**
   * A small in-scene text sprite. `worldHeight` is how tall the text stands in scene units; the width
   * follows from the MEASURED text so nothing is stretched and nothing is cut off.
   *
   * The canvas used to be a fixed 128x40 with the text drawn straight into it, which is fine for "5
   * AU" and silently truncates anything longer — G9's constellation names ("Alpha Centauri" at this
   * font is about 170px) were being clipped mid-word. Measuring costs one call and removes the whole
   * class of bug. Grid labels are unchanged on screen: the same glyph height, the same left anchor,
   * only a canvas that fits them.
   */
  function makeGridLabel(text: string, worldHeight = 0.28, depthTest = false): THREE.Sprite | null {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const FONT = '600 24px ui-monospace, monospace';
    const PAD = 6;
    ctx.font = FONT;
    const w = Math.max(8, Math.ceil(ctx.measureText(text).width));
    c.width = w + PAD * 2;
    c.height = 40;
    // Sizing the canvas RESETS the 2D context, so the font has to be set again after it.
    ctx.font = FONT;
    ctx.fillStyle = 'rgba(180,210,240,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, PAD, 22);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Grid labels default to depthTest FALSE — a ground-plane scale readout must stay legible even
    // when a body is in front of it. A far-field constellation name is the opposite case: it belongs
    // to a star that CAN be behind the planet, so it opts in (see the note in rebuildSkyStars).
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(worldHeight * (c.width / c.height), worldHeight, 1);
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
    routeLines = [];
    baryScene = new Map();
    starLights = [];
    starVisuals = [];
    auroraVisuals = [];
    magmaVisuals = [];
    lightningVisuals = [];
    plumeVisuals = [];
    cloudVisuals = [];
    bhDiscInfo.clear();
  }

  // Timed wrapper (perf comb, 2026-08): every call is a FULL teardown + rebuild, and a construct in
  // transit rewrites the snapshot ~2x/s — so the split below is the go/no-go evidence for a future
  // same-system PATCH path. `.same` counts rebuilds of the system already on screen (a patch could
  // have absorbed them); `.new` counts genuine system changes (a rebuild is the right answer).
  // `.ms` accumulates wall time, so avg cost = ms / (same + new).
  //
  // P2 (2026-08-17), and this is RENDER-S22's named gap being closed: `.same` = 146 of 148 told us the
  // work was wasted and NOTHING about who asked for it. Every call now carries a REASON and lands one
  // cheap row in the [sse-perf] event ring, always on, dumped with `__ssePerf.events(60,'holo.setSystem')`.
  // The three fields that separate the candidate causes, and none of them costs anything:
  //   sameRef — the incoming object is the SAME REFERENCE we already hold. Nothing upstream re-cloned;
  //             the trigger is a re-fire (a remount, or a Svelte statement invalidated by something
  //             other than `system`). An upstream content gate could NOT help this case.
  //   sameId  — same system, new object: something upstream re-cloned. A gate is the candidate fix.
  //   reason  — 'prop' / 'mount' (HoloView) vs 'style:*' (a dial rebuilding its own content). These are
  //             different bugs and were indistinguishable in the counters.
  // `window.__rebuildDebug = true` adds the payload hash, which is the only thing that can say a
  // re-cloned snapshot was byte-identical — deliberately OPT-IN, because hashing a several-hundred-KB
  // system at 12 Hz is the very cost class this item is chasing (never let the meter add it).
  // B94 — A SHIP MOVING IS NOT A REASON TO REBUILD THE WORLD.
  //
  // Measured on the owner's repro (2026-08-27): with the clock running and a player following,
  // `holo.setSystem` fired 61 times in a couple of minutes, 59 of them for a system whose id had
  // not changed, at ~103 ms and a whole scene's worth of geometry and textures each. The heap went
  // 120 MB → 3.3 GB and took the GM window down with it. The `whyChanged` diagnostic named what
  // actually differed between those payloads, and it was always the same three fields on a
  // construct in flight: position, velocity and the epoch they were stamped at.
  //
  // Those three are the ONLY thing this skips, and it fails open: any other difference anywhere
  // — a body, an orbit, a tag, a construct's route or burns or flight_state, a node appearing or
  // leaving — falls straight through to the full rebuild. Missing a rebuild that was needed is a far
  // worse bug than doing one that was not, so the comparison is deliberately conservative.
  //
  // WHY UPDATING IN PLACE IS ENOUGH: `updatePositions()` reads `currentSystem` LIVE on every frame
  // (via computeWorldPositions3D), and worldPositions takes a construct's place from
  // `vector_position_au`. So writing the new vectors onto the system the scene already holds moves
  // the ships on the very next frame, with nothing rebuilt and nothing allocated.
  //
  // COST: a short-circuiting structural walk that stops at the first real difference. On a system
  // of a few dozen nodes that is microseconds against the 103 ms rebuild it replaces, and it is
  // skipped entirely once a difference is found.
  const FLIGHT_VECTOR_KEYS = new Set(['vector_position_au', 'vector_velocity_ms', 'vector_epoch_ms']);

  function sameExcept(a: any, b: any, skip: Set<string> | null): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!sameExcept(a[i], b[i], null)) return false;
      return true;
    }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (skip && skip.has(k)) continue;
      if (!(k in b)) return false;
      if (!sameExcept(a[k], b[k], null)) return false;
    }
    return true;
  }

  /** True when the ONLY differences are flight vectors on constructs. */
  function onlyFlightVectorsDiffer(cur: System, next: System): boolean {
    const an: any[] = (cur as any).nodes ?? [], bn: any[] = (next as any).nodes ?? [];
    if (an.length !== bn.length) return false;
    if (!sameExcept({ ...(cur as any), nodes: null }, { ...(next as any), nodes: null }, null)) return false;
    let moved = false;
    for (let i = 0; i < an.length; i++) {
      const x = an[i], y = bn[i];
      if (!x || !y || x.id !== y.id) return false;
      const isConstruct = x.kind === 'construct' && y.kind === 'construct';
      if (!sameExcept(x, y, isConstruct ? FLIGHT_VECTOR_KEYS : null)) return false;
      if (isConstruct && !moved) {
        for (const k of FLIGHT_VECTOR_KEYS) if (!sameExcept(x[k], y[k], null)) { moved = true; break; }
      }
    }
    return moved; // nothing moved at all = let the normal path handle it
  }

  /** Copy the new flight vectors onto the system the scene already holds. */
  function applyFlightVectors(cur: System, next: System) {
    const an: any[] = (cur as any).nodes ?? [], bn: any[] = (next as any).nodes ?? [];
    for (let i = 0; i < an.length; i++) {
      if (an[i]?.kind !== 'construct') continue;
      for (const k of FLIGHT_VECTOR_KEYS) {
        if (k in bn[i]) an[i][k] = bn[i][k];
        else delete an[i][k];
      }
    }
  }

  let _lastSysHash: string | null = null;
  function setSystem(system: System | null, reason = 'unknown') {
    const t0 = performance.now();
    const sameRef = !!system && system === currentSystem;
    const sameId = !!system && !!currentSystem && (system as any).id === (currentSystem as any).id;
    perfCount(sameId ? 'holo.setSystem.same' : 'holo.setSystem.new');
    perfCount(`holo.setSystem.by.${reason}`);
    // Opt-in payload identity. FNV-1a over the stringified system; `hashMs` is printed beside it so
    // the instrument's own cost is visible rather than smuggled into the measurement it perturbs.
    let hash: string | undefined;
    let hashMs: number | undefined;
    let sameHash: boolean | undefined;
    if ((window as any).__rebuildDebug && system) {
      const h0 = performance.now();
      try {
        const json = JSON.stringify(system);
        let h = 0x811c9dc5;
        for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        hash = (h >>> 0).toString(16);
        // UNDEFINED on the first hashed rebuild, never false: there is no baseline to differ from,
        // and a `false` there reads as "the payload changed" — the opposite of what it knows.
        sameHash = _lastSysHash === null ? undefined : _lastSysHash === hash;
        _lastSysHash = hash;
      } catch { /* a cyclic or huge payload must not break the render path */ }
      hashMs = Math.round(performance.now() - h0);
    }
    // B94: motion-only update — move the ships, leave the world standing.
    if (system && currentSystem && onlyFlightVectorsDiffer(currentSystem, system)) {
      applyFlightVectors(currentSystem, system);
      updatePositions();
      perfCount('holo.setSystem.motionOnly');
      perfEvent('holo.setSystem', {
        reason, sameRef, sameId, motionOnly: true,
        ms: Math.round(performance.now() - t0),
        nodes: system.nodes?.length ?? 0
      });
      return;
    }
    setSystemBuild(system);
    const ms = Math.round(performance.now() - t0);
    perfCount('holo.setSystem.ms', ms);
    perfEvent('holo.setSystem', {
      reason, sameRef, sameId, ms,
      nodes: system ? (system.nodes?.length ?? 0) : 0,
      ...(hash !== undefined ? { hash, sameHash, hashMs } : {})
    });
  }

  function setSystemBuild(system: System | null) {
    perfCount('holo.setSystem'); // a full scene rebuild — the prime suspect for the random slowdowns
    resetOriginForRebuild(); // everything absolute is about to be re-emitted; build it about the centre
    clearContent();
    buildGen++; // invalidate in-flight async loads (ship models) from the previous system
    // A REFRESH of the system already on screen must not throw the camera away. This is called for
    // every incoming snapshot, and a construct IN TRANSIT rewrites the snapshot about twice a
    // second - so on a player watching a ship under way, the focus and the in-flight framing ease
    // were wiped ~2x/second, restarting the approach from wherever it had reached and leaving the
    // shot stranded far out. That is the whole of "it frames too far out, and inconsistently" for
    // a moving ship: sometimes a rebuild landed late and the ease got further, sometimes early and
    // it barely started. Only a genuinely DIFFERENT system clears the focus.
    const sameSystem = !!system && !!currentSystem && (system as any).id === (currentSystem as any).id;
    // Always dropped: resetOriginForRebuild has just shifted the frame, so last frame's position
    // is not comparable with this one's. One frame without the motion carry costs nothing.
    lastBase = null; // the frame has shifted; last frame's base is not comparable
    if (!sameSystem) {
      focusedId = null;
      reframing = false; reframePending = false; viewOffset = { ...IDENTITY_OFFSET }; lastBase = null;
      followEngaged = false;
      // ...AND THE CAMERA, which is the other half of R6 ("a refresh of the same system preserves
      // the camera; changing system resets") and was missing: only the focus was being cleared, so
      // a new system inherited wherever the PREVIOUS one had been left - and with nothing focused
      // `computeBase` returns null by design (the view is the user's), so nothing ever corrected
      // it. Absolute coordinates are safe here: `resetOriginForRebuild` ran at the top of this
      // function, so the origin is the system centre. A51(b).
      camera.position.copy(homeCam());
      controls.target.set(0, 0, 0);
      }
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
    const pos0 = computeWorldPositions3D(system, timeMs, routeSampler);
    // AN EXTENT MUST INCLUDE THE EXTENT OF ITS MEMBERS, NOT JUST THEIR DISTANCES (A78).
    //
    // This measured POSITIONS only, and a star sits at the centre - so its position magnitude is
    // zero and it counted for nothing. A lone red supergiant therefore fell through to the 1 AU
    // fallback below while its own radius is 4.18 AU, and everything downstream solved correctly
    // for the wrong system: `trueScaleFactor` is `gridRadius / rMax`, so the star drew at 50 scene
    // units inside a frame of 12 - the unbroken orange field a user reported, with no disc, no limb
    // and no sense of scale.
    //
    // It also fixes the case nobody had reported: any giant whose limb reaches past its own
    // outermost planet used to swallow its system at every zoom level, which on a supergiant with
    // close-in worlds is not a rare arrangement.
    //
    // TRUE radius, never the rendered one - see `physicalRadiusAu`, which explains why feeding a
    // rendered size back in here would be a loop.
    rMax = 0;
    for (const [id, p] of pos0) {
      rMax = Math.max(rMax, Math.hypot(p.x, p.y, p.z) + physicalRadiusAu(nodesById.get(id)));
    }
    // KEPT AS A GUARD even though radii now make it all but unreachable (A78 decided this
    // deliberately): a system with no drawable nodes at all still reaches here, and `compressRadius`
    // divides by `rMax` with no guard of its own. One line against a division by zero.
    if (rMax <= 0) rMax = 1;
    rebuildGrid(); // scaled AU rings depend on rMax + compression

    for (const node of system.nodes as any[]) {
      // Belts: a debris band on their (compressed) orbit, never a lone sphere.
      if (isBelt(node)) {
        const belt = beltStyle === 'band'
          ? buildBeltRing(node, positionToSceneAbs)
          : buildBeltBand(node, positionToSceneAbs, beltDetail, timeMs, beltStyle === 'points', markerScale());
        if (belt) { contentGroup.add(belt.group); beltVisuals.push(belt); }
        continue;
      }
      // Planetary rings: a differentially-spinning particle disc around the parent planet.
      if (node.roleHint === 'ring') {
        const parent = nodesById.get(node.parentId);
        if (parent) {
          const rv = beltStyle === 'band'
            ? buildPlanetRingBand(node, parent, bodyRadiusScene(parent, isSystemLevel(parent)))
            : buildPlanetRing(node, parent, bodyRadiusScene(parent, isSystemLevel(parent)), beltDetail, timeMs, beltStyle === 'points');
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
      // A construct with a committed course draws that instead of an orbit (P3c). `routeOf` reads
      // either source - the GM's journeys or the player's published compact route - so a ship that is
      // journeying on the GM is still journeying on a snapshot that has had its journeys stripped,
      // which the old `scheduled_journeys.length` test could never see.
      const route = node.kind === 'construct' ? routeOf(node) : null;
      if (route) {
        const line = buildRouteLine(ringColor(node));
        contentGroup.add(line);
        routeLines.push({ id: node.id, obj: line, route, node, abs: new Float64Array(2048 * 3), count: 0 });
      }
      // A SHIP IS OFF ITS ORBIT WHILE IT IS FLYING - NOT FOR EVER AFTERWARDS. This used to omit the
      // ring at BUILD time for any construct that HAD a route at all, and a route survives its own
      // journey: `routeOf` packs the path whether or not the ship is still on it. So a ship that had
      // finished a course - a completed orbit change, say - drew no orbit line for the rest of the
      // campaign, which is what the owner reported as "parked in low orbit but does not have an orbit
      // line". Build the ring whenever there is an orbit to draw and decide per FRAME whether the ship
      // is currently on it, exactly as the surface lock beside it in `updateOrbitRings` already does -
      // the state is live (a ship departs and arrives while the scene stands), so the test must be too.
      if (node.orbit) {
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
          // C3/C9: the moon's orbit is quoted in the parent's equator. One spelling of that decision,
          // shared with the propagator — this used to compute a bare tilt here and gate it again
          // inside the ring builder, so the ring and the body could be told different things.
          const orbitTiltRad = satelliteTiltRad(node, parentNode);
          // A construct is a fixed-screen-size glyph with no rendered globe, so it contributes no radius
          // to the clearance — exactly as its own placement does (radiusScene is 0 for one).
          const selfRad = node.kind === 'construct' ? 0 : bodyRadiusScene(node, false);
          const ring = kP > 0 ? buildMoonOrbitRing(node, kP, compressScalar(rP), parentRad, selfRad, compression, ringColor(node), orbitTiltRad) : null;
          if (ring) { contentGroup.add(ring.loop); orbitRings.push({ id: node.id, obj: ring.loop, trackParentId: node.parentId, local: ring.local, sample: ring.sample }); }
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
          mesh = buildWireframeBody(starR, colorHex, glow, occluded, null, wireDotSize(starR));
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
          // Corona + flares: the SHARED star look (bodyFeatures.buildStarLook), parented to the sphere
          // so it tracks position; the corona billboard ignores the sphere's spin, the flares sit on
          // its limb. Flares only for stars whose magnetic activity earns them (a quiet sun adds
          // nothing to the frame), and only outside the lo-poly styles. The outflow decorations
          // (jets, shed shell) are NOT passed here: the holo's own star look is out of G26's scope.
          let fseed = 0; for (const ch of String(node.id)) fseed = (fseed + ch.charCodeAt(0) * 13) % 2147483647;
          const look = buildStarLook(starR, colorHex, activity, fseed || 1, glowTexture, { flares: !isLopolyStar && flaresVisibly(node.tags) });
          sphere.add(look.group);
          starVisuals.push(look);
          // Lo-poly LINES: glowing vector edges + vertices over the faceted star, matching the planets.
          if (renderStyle === 'lopoly-lines') {
            const lineMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.LineSegments(new THREE.WireframeGeometry(sphere.geometry), lineMat));
            const dotMat = new THREE.PointsMaterial({ color: colorHex, size: wireDotSize(starR), sizeAttenuation: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
            sphere.add(new THREE.Points(sphere.geometry, dotMat));
          }
        }
        // The star casts light regardless of render style: a point light co-located with it gives the
        // planets a real terminator. decay 0 so the compressed distances don't dim the outer planets.
        // A quiescent black hole barely lights its surroundings; a feeding one blazes like a real star.
        const light = new THREE.PointLight(isBH && feeding ? 0xcfe4ff : colorHex, isBH ? (feeding ? 2.4 : 0.12) : 2.2, 0, 0);
        contentGroup.add(light);
        starLights.push({ id: node.id, light });
        // A FAST-ROTATING STAR IS FLATTENED, and this branch was the only one that did not say so
        // (inbox B43). The planet branch below has applied `oblatePolarFactor` all along, and the 2D
        // orrery is role-agnostic, so a star was the one body drawn as a perfect sphere however fast
        // it spun. Vega turns near breakup and is genuinely about 20% oblate.
        //
        // Applied to the WHOLE star object rather than the sphere alone, so the corona, the flares
        // and the wireframe overlay squash with the photosphere instead of standing proud of it.
        const starPolF = oblatePolarFactor((node as any).oblateness);
        if (starPolF < 0.999) mesh.scale.set(1, starPolF, 1);
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
          const wf = buildWireframeBody(radius, selHex, glow, occluded, terrain, wireDotSize(radius));
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
            const dotMat = new THREE.PointsMaterial({ color: selHex, size: wireDotSize(radius), sizeAttenuation: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
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
            if (appear.atmGlow && atmospheresOn) {
              sphere.add(buildAtmoGlow(radius, appear.atmGlow.colorHex, appear.atmGlow.strength));
            }
            // Cloud deck: a separate translucent shell above the surface that DRIFTS on its own — a
            // patchy deck on Earth-likes, an opaque haze veil on Venus-likes. Parented to the sphere so
            // it tracks position/tilt; its extra local spin (updated each frame) makes it float.
            if (appear.clouds && atmospheresOn) {
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
            if (appear.tholin?.atmospheric && atmospheresOn) {
              sphere.add(buildTholinHaze(radius, appear.tholin.colorHex, appear.tholin.strength));
            }
          }
        }
      }
      contentGroup.add(mesh);

      const isConstruct = node.kind === 'construct';
      // Every body gets a label element; which ones actually show is decided per-frame by the focus
      // visibility rule (getVisibleNodeIds) — so a planet's moons name themselves once it's selected.
      const label = makeLabelSprite(String(node.name ?? ''), markersForNode(node));
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
      const physRadiusAu = physicalRadiusAu(node);   // A78: one expression, shared with the rMax extent above
      // Same test the document builder uses (`constructsOf`, systemTopology.ts) so the two cannot
      // disagree about which constructs are on the ground.
      const surfaceDeclared = isConstruct && String((node as any).placement ?? '').toLowerCase() === 'surface';
      bodies.push({ id: node.id, name: String(node.name ?? ''), mesh, label, parentId: node.parentId, framingParentId: (node as any).ui_parentId || node.parentId || null, satellite: !systemLevel && !inTransit, radiusScene, physRadiusAu, surfaceDeclared, spinPeriodSec, tiltQuat, isConstruct, occluderId: !systemLevel ? node.parentId : null, shadow, isBH: isBlackHoleNode(node), tidallyLocked: !isConstruct && !!(node as any).tidallyLocked, isStar, baseScale: mesh.scale.clone(), screenK: 1 });
      // G3: a construct carrying a 3D model loads it in the background; the sprite stands until
      // (and unless) it lands, and stands permanently on a machine that lacks the binary.
      // G53: ONLY A SKINNABLE MEGA MAY WEAR AN UPLOADED MODEL. A spheroid is a hull and an artist may
      // replace it; a ring or shell is a WORLD whose radius, band and coverage the engine publishes
      // as figures, so a hand-modelled stand-in would quietly contradict them. The registry says
      // which is which (`skinnable`), so this is data rather than a list of names here.
      const megaDefFor = megaTypeDef((node as any).megaType);
      const modelAllowed = !megaDefFor || megaDefFor.skinnable === true;
      if (isConstruct && modelAllowed && ((node as any).model?.hash || (node as any).model?.url)) {
        const sceneLen = shipLenScene(node);
        // The hull's LENGTH is known from the authored dimensions the moment the node is read, so
        // record it NOW rather than when the binary lands. Framing and the min-zoom both used to
        // wait for `shipModel`, which made the shot a race against an async load: select a ship
        // before its model arrived and `frameDistance` fell through to the radius-less 0.35-unit
        // patch - a shot most of the system wide - while `controls.minDistance` stayed at 1e-6, so
        // zooming in could not rescue it either. Same click a second later gave a proper close-up.
        bodies[bodies.length - 1].shipLen = sceneLen;
        loadShipModel(bodies[bodies.length - 1], (node as any).model, (node as any).icon_color || '#ffd24d', sceneLen, buildGen);
      } else if (isConstruct) {
        // NO MODEL: give it an ELLIPSOID at its authored dimensions. Every construct then has a
        // real, honest extent, which is what makes the close-up rung mean the same thing for all of
        // them (R11) - a screen-fixed glyph is identical at every distance, so flying to one showed
        // nothing, and with no extent at all `frameDistance` fell through to `sizelessHalfExtent`
        // (0.35 scene units, a number with no physical meaning).
        //
        // An ellipsoid rather than a box or a shaped hull: a box reads as a crate and as a
        // placeholder for a model that failed to load, while an ellipsoid reads as "we know how big
        // this is, not what it looks like" - which is exactly what the data supports. It also has no
        // front, so it makes no claim about heading that the authored data cannot back.
        //
        // It is assigned to `shipModel`, so it inherits the pixel LOD, the framing, the min-zoom and
        // the drive plume already built for hulls. That is the point: it removes the
        // modelled-vs-glyph branch rather than adding a third case.
        // G53 phase 3: a mega draws its own shape; everything else keeps the ellipsoid.
        const mv = bodies[bodies.length - 1];
        const tint = (node as any).icon_color || '#ffd24d';
        if (!attachMegaVolume(mv, node, tint, node.parentId ? nodesById.get(node.parentId) : undefined)) {
          // RENDER-S7: never silent on the path that decides whether a thing renders. A mega that
          // falls back to the ellipsoid says so ONCE, with the reason, so "it drew a blob" arrives
          // as a diagnosis rather than a screenshot to argue about.
          if ((node as any).megaType && !_megaFellBack.has(node.id)) {
            _megaFellBack.add(node.id);
            console.warn('[mega] fell back to the ellipsoid for', node.name,
              '- megaType:', JSON.stringify((node as any).megaType),
              '- known to the registry:', !!megaTypeDef((node as any).megaType));
          }
          attachHullVolume(mv, node, tint);
        }
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
      if (ring) { contentGroup.add(ring.loop); orbitRings.push({ id: node.id, obj: ring.loop, trackParentId: node.parentId, local: ring.local, sample: ring.sample }); }
    }
    visibleSet = getVisibleNodeIds(system, focusedId);
    updatePositions();
    // Route lines last: their density is chosen from the working distance, and their anchor needs the
    // ship's scene position, so neither is known until the camera exists and the bodies are placed.
    emitRouteLines(camera.position.distanceTo(controls.target));
  }

  // WHICH CLOCK PLACES A SHIP ON ITS ROUTE - and it is a CLOCK now, not an on/off gate (G51).
  //
  // A transiting construct is placed by evaluating its published route: the position half of the
  // route line, so a moving ship sits exactly ON its drawn course by construction. The only question
  // is WHEN to evaluate it, and there are three honest answers:
  //
  //   a PLAYER view      -> ITS OWN display clock, following the GM or not (G51 Q6, owner
  //                         2026-08-27: "a non-following player view should see a ship move").
  //   no GM clock known  -> null: fall back to the stamped vector. This is the GM'S OWN view, which
  //                         never receives SYNC_TIME and must keep placing ships from its own stamp.
  //
  // Q6 REVERSED THE RULE OF 2026-08-08, and the reason it could is the reason to record. That rule
  // said live traffic was the GM's clock to run - made when a player view genuinely COULD NOT work
  // out where a ship was and would have had to be told. It can now: the route's knots carry TIME, so
  // `routeStateAt` is a complete time-to-position function and a ship in transit is derivable from
  // the viewer's own clock exactly as a planet is from its elements. [[G49]]'s rule then applies on
  // its own terms - the clock is the viewer's whenever everything on screen is derivable from it -
  // and the old rule's premise had simply gone.
  //
  // WHAT A SCRUBBING VIEWER NOW SEES: the ship where it would be AT THEIR TIME. Not stale, and not
  // the GM's instant. `shipClock` and `onRouteNow` read this same function, so the vessel, its plume
  // and its drawn line are all evaluated at one instant and cannot disagree. A preset that FOLLOWS
  // the GM is unaffected: its own clock already is the GM's.
  //
  // Null outside the route's window too, so departure, arrival and a drifting ship fall back to the
  // vector - which after G51 is the only thing `SYNC_FLIGHT` still stamps.
  let transitMotion = false;
  let gmClockMs: number | null = null;
  function setTransitMotion(on: boolean) {
    if (on === transitMotion) return;
    transitMotion = on;
    updatePositions(); // take effect NOW, not at the next clock tick (the clock may be paused)
  }
  /**
   * The GM's clock is no longer WHERE a ship is read (Q6) - it is now only the signal that this view
   * IS a receiving player view, which is what earns it the right to place ships from the route at
   * all. The GM's own scene never receives SYNC_TIME and so keeps its stamp.
   */
  function setGmClock(ms: number | null) {
    const wasPlayerView = gmClockMs !== null;
    if (ms === gmClockMs) return;
    gmClockMs = ms;
    // Only the FIRST arrival changes anything now; later heartbeats do not move the ship, because
    // the ship is read at our clock rather than at theirs.
    if (!wasPlayerView && ms !== null) updatePositions();
  }
  /** The instant a route is read at, or null for "do not place from the route at all". */
  function routeClock(): number | null {
    return gmClockMs === null && !transitMotion ? null : timeMs;
  }
  const routeSampler = (_sys: System, node: any, _tMs: number) => {
    const at = routeClock();
    if (at === null) return null;
    const rs = routeStateAt(routeOf(node), at);
    return rs ? { position_au: { x: rs.x, y: rs.y } } : null;
  };

  const tmpParent = new THREE.Vector3();
  function updatePositions() {
    if (!currentSystem) return;
    const positions = computeWorldPositions3D(currentSystem, timeMs, routeSampler);
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
        // C3/C9: a SATELLITE's elements are quoted in its parent's equatorial frame, and the
        // propagator now applies that rotation itself — so the difference of two world positions is
        // already the framed offset and this must NOT rotate it again. (It used to, because the
        // propagator did not; the rotation is `satelliteTiltRad`/`toParentEquator` in
        // `system/satelliteFrame.ts` and the orbit ring below is the one place still calling it, off
        // the propagator's parent-relative state rather than a world-position map.)
        const ox = p.x - parent.x, oy = p.y - parent.y, oz = p.z - parent.z; // AU offset, parent's frame
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
  const _ringParent = new THREE.Vector3();
  const _ringFocusLocal = new THREE.Vector3(); // the focus in a local ring's parent frame
  const _ringSample = new THREE.Vector3(); // scratch for the local dense-arc sampler
  /** Is this construct actually flying its course at the moment being drawn? `routeStateAt` already
   *  answers exactly this - it returns null outside the window by design - so ask it rather than
   *  writing the window test a second time. */
  function onRouteNow(id: string): boolean {
    for (const rl of routeLines) {
      if (rl.id !== id) continue;
      return routeStateAt(rl.route, routeClock() ?? timeMs) !== null;
    }
    return false;
  }

  function updateOrbitRings() {
    for (const r of orbitRings) {
      // A construct glued to a surface is not on its orbit, so it must not draw one. The lock is live
      // (updatePositions clears it the moment the thing rises above the globe), so the test is too.
      // G5: the dial and the momentary hide join the name rule. At 0 the line is not drawn at all
      // rather than drawn transparent - 70 invisible LineLoops is still 70 draw calls, and "hides
      // every orbit line" should mean it.
      const orbitsOn = orbitLinesVisible && orbitOpacity > 0;
      // ...and a ship UNDER WAY is not on its orbit either. Live, for the same reason the surface lock
      // is: the ship leaves and arrives while this scene stands, and the route window says which.
      r.obj.visible = orbitsOn && visibleSet.has(r.id) && !bodyById.get(r.id)?.surfaceLock && !onRouteNow(r.id);
      if (r.obj.visible) {
        // Scale each line's OWN designed opacity, so the weights between ring kinds survive the dial.
        const m = (r.obj as any).material as THREE.LineBasicMaterial | undefined;
        if (m) {
          const base = (m.userData?.baseOpacity ?? ORBIT_OPACITY_HELIO) as number;
          const want = base * orbitOpacity;
          if (m.opacity !== want) { m.opacity = want; m.needsUpdate = true; }
        }
      }
      if (r.obj.visible && r.trackParentId) {
        const p = bodyById.get(r.trackParentId);
        if (p) _ringParent.copy(p.mesh.position);
        else {
          const bp = baryScene.get(r.trackParentId); // a barycentre parent has no mesh to track
          if (bp) _ringParent.copy(bp);
          else continue;
        }
        // A NEAR local-frame ring is re-emitted in DOUBLE precision, vertex + parent composed in
        // f64 and rounded ONCE, with the object's own translation zeroed. Measured need ([ringdbg]
        // 2026-08-08): the f32 vertex + f32 matrix-translation composition steps by ~4.7 px at a
        // true-scale close-up - the "orbit lines vibrate" report. Near the origin the re-emitted
        // vertices have tiny magnitudes, so their f32 error is invisible; the far side is imprecise
        // but distant, which is the floating-origin principle this family had been left out of.
        // FAR rings keep the cheap translation path - their projected error is sub-pixel by the
        // same argument - so the per-frame cost is one buffer for the ring actually being watched.
        // "Near" is decided by the JITTER PREDICTION itself - the same arithmetic the [ringdbg]
        // instrument validated in the field - not by a distance heuristic: switch to the f64 path
        // exactly when the f32 step would exceed a quarter pixel at the current zoom.
        const ringR = r.local ? Math.hypot(r.local[0], r.local[1], r.local[2]) : 0;
        const pxWorld = (2 * camera.position.distanceTo(controls.target) * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewH);
        const near = !!r.local && 2 ** -23 * (_ringParent.length() + ringR) > pxWorld * 0.25;
        if (r.local && near) {
          const attr = (r.obj as any).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
          if (attr) {
            const arr = attr.array as Float32Array;
            const n = Math.min(arr.length, r.local.length);
            // THE DENSE ARC, for the local-ring family (A23's machinery, transplanted). The f64
            // path above killed the random per-frame stepping; what remained was a smooth SWEEP:
            // the followed body rides the TRUE curve while the line is a fixed 1024-gon, so the
            // ship-to-chord distance breathes zero-max-zero once per vertex crossing (~5.4 s of
            // game time for the ISS) - a slow wave at real time, a buzz at speed. The owner's
            // Pluto precedent is exact: the barycentre's heliocentric ring got smooth the day A23
            // re-sampled its propagator about the focus, and this family has a propagator too
            // (the `sample` closure - the builder's own pipeline). Same warp, same sag budget,
            // same fractional centre; re-emitted every frame, so the arc slides with the focus.
            let sagS = 1;
            let uCentre = 0;
            if (r.sample) {
              // The focus, in this ring's parent-local frame (everything here is origin-relative).
              _ringFocusLocal.copy(controls.target).sub(_ringParent);
              let best = Infinity, bi = 0;
              for (let i = 0; i < n; i += 3) {
                const dx = r.local[i] - _ringFocusLocal.x, dy = r.local[i + 1] - _ringFocusLocal.y, dz = r.local[i + 2] - _ringFocusLocal.z;
                const d = dx * dx + dy * dy + dz * dz;
                if (d < best) { best = d; bi = i; }
              }
              const prev = (bi - 3 + n) % n, next = (bi + 3) % n;
              const dFwd = distToSegment(_ringFocusLocal, r.local, bi, next);
              const dBack = distToSegment(_ringFocusLocal, r.local, prev, bi);
              const camD = camera.position.distanceTo(controls.target);
              if (Math.min(dFwd, dBack) <= camD * RING_ADAPT_NEAR) {
                const samples = n / 3;
                const curveR = Math.max(1e-12, Math.hypot(r.local[bi], r.local[bi + 1], r.local[bi + 2]));
                const tol = Math.max(1e-13, camD * RING_SAG_FRAC);
                sagS = Math.max(1e-5, Math.min(1, (samples * Math.sqrt((8 * tol) / curveR)) / (2 * Math.PI)));
                const frac = dFwd <= dBack ? segmentT(_ringFocusLocal, r.local, bi, next) : segmentT(_ringFocusLocal, r.local, prev, bi) - 1;
                uCentre = (bi / 3 + frac) / samples;
              }
            }
            if (r.sample && sagS < 0.999) {
              const samples = n / 3;
              for (let i = 0; i < samples; i++) {
                const u = uCentre + warpOrbitParam(i / samples - 0.5, sagS);
                r.sample(u, _ringSample);
                arr[3 * i] = _ringSample.x + _ringParent.x;
                arr[3 * i + 1] = _ringSample.y + _ringParent.y;
                arr[3 * i + 2] = _ringSample.z + _ringParent.z;
              }
            } else {
              for (let i = 0; i < n; i += 3) {
                arr[i] = r.local[i] + _ringParent.x;
                arr[i + 1] = r.local[i + 1] + _ringParent.y;
                arr[i + 2] = r.local[i + 2] + _ringParent.z;
              }
            }
            attr.needsUpdate = true;
            (r.obj as any).geometry?.computeBoundingSphere?.();
            r.obj.position.set(0, 0, 0);
            r.absMode = true;
          }
        } else {
          if (r.absMode) {
            // Back to the translation path: restore the local vertices once, then track cheaply.
            const attr = (r.obj as any).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
            if (attr && r.local) {
              const arr = attr.array as Float32Array;
              const n = Math.min(arr.length, r.local.length);
              for (let i = 0; i < n; i++) arr[i] = r.local[i];
              attr.needsUpdate = true;
              (r.obj as any).geometry?.computeBoundingSphere?.();
            }
            r.absMode = false;
          }
          r.obj.position.copy(_ringParent);
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
      // CLEAR THE BODY, and do it PER FRAME because "the body" is a different size every frame.
      // The sprite floats above the body's CENTRE by a constant screen gap, which is fine for a name
      // — it is only ever a few px tall — and wrong for the badges hanging beneath it: on a framed
      // world the disc is hundreds of px across, so the marker a GM chose specifically to be seen was
      // drawn inside the planet. Push the whole sprite up by the body's own apparent RADIUS, so the
      // bottom of the stack (a pin's point, a flag's foot) lands on the top edge of the disc and
      // tracks it as you zoom.
      //
      // The radius is the one the renderer actually drew: `radiusScene` scaled by `screenK`, which is
      // the true-scale floor that keeps a distant world visible as a minimum-size marker. Reading the
      // unscaled radius would tuck the badge inside a floored body at exactly the range where the
      // floor is doing the most work.
      const dist = camera.position.distanceTo(labelWorld);
      // A construct has no `radiusScene`; `shipLen` is what the framing solver uses in its place
      // (see the focus ladder), so use the same one rather than leaving ships with no clearance.
      const rScene = renderedSpanScene(b);
      let bodyPxR = (rScene * (b.screenK ?? 1)) / Math.max(1e-9, pxToScale * dist);
      // G58 labels seam: an exotic whose structure extends beyond its marker (a ring's whole hoop,
      // a tether's full height) must NOT clear its SPAN - that pushed "Ringworld" a ring-radius
      // into empty sky and hung "Space Elevator" near the counterweight instead of the anchor
      // (owner, 2026-08-30/31). The label belongs at the NODE - the marker point a GM clicks - so
      // clear the construct marker instead. A 'node'-anchored exotic (Death Star) is a hull like
      // any ship: its span IS its marker, and the ordinary clearance stands.
      if (b.exotic && b.exotic.render3d.anchor !== 'node') bodyPxR = CONSTRUCT_PX_FOCUS / 2;
      const hPx = Math.max(1e-6, labelSizePx * ls.heightRatio);
      ls.sprite.center.set(0.5, -(0.25 * ls.nameFraction + bodyPxR / hPx));
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
    _toParent.copy(pv.mesh.position).sub(b.mesh.position);                 // moon → parent
    // A70, settled with the owner: a lock means ONE FIXED SURFACE POINT faces the star, and the
    // tilt decides WHICH point — at tilt ε the locked point sits at latitude ε off the texture's
    // equator-centre meridian, and at ε≈90° the locked point IS the pole (a pole can be tidally
    // locked; the bulge is fixed, so it is a true equilibrium). The orientation is a yaw about the
    // ORBIT NORMAL tracking the star's azimuth, COMPOSED ONTO the tilt — spin∘tilt, world axis —
    // which is smooth and flip-free at every tilt. The rejected alternatives, so nobody rebuilds
    // them: aiming the meridian by projecting the star into the equatorial plane DEGENERATES near
    // 90° (the projection is a constant that only flips sign — the body sat motionless and snapped
    // 180° every half orbit); spinning about the TILTED pole (tilt∘spin) rolls the painted cold
    // side through the sunrise, because no static texture survives a migrating substellar point.
    // With A70's tidal erosion the derived tilts of locked worlds are ~0-5°, so the locked point
    // sits within a few degrees of the painted eye; an AUTHORED high tilt pins its pole at the
    // star, honestly — repainting the eye at the locked latitude is the banked follow-up.
    if (_toParent.x * _toParent.x + _toParent.z * _toParent.z < 1e-12) { b.mesh.quaternion.copy(b.tiltQuat!); return; }
    const angle = Math.atan2(-_toParent.z, _toParent.x);
    spinQuat.setFromAxisAngle(spinAxis, angle);
    b.mesh.quaternion.copy(spinQuat).multiply(b.tiltQuat!);
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

  const _tetherUp = new THREE.Vector3(0, 1, 0);   // the axis megaGeometry builds a tether along
  const _megaFellBack = new Set<string>();       // warn once per node, not once per rebuild

  function updateSurfaceConstructs() {
    for (const b of bodies) {
      if (!b.surfaceLock || !b.parentId) continue;
      const pv = bodyById.get(b.parentId);
      if (!pv) continue;
      _surfDir.copy(b.surfaceLock.dir0).applyQuaternion(pv.mesh.quaternion);
      b.mesh.position.copy(pv.mesh.position).addScaledVector(_surfDir, pv.radiusScene ?? 0.01);
      // G53: A TETHER STANDS UP FROM ITS ANCHOR. The ribbon is built along +Y from the host's
      // surface to geostationary, so it is placed at the host's CENTRE and turned so +Y points at
      // the anchor - which means it rises from the right spot and sweeps round with the planet's
      // own spin, for free, because `dir0` is re-applied against the live quaternion above.
      if (b.exotic?.render3d.anchor === 'surface-stand' && b.shipModel) {
        b.shipModel.position.copy(pv.mesh.position);
        b.shipModel.quaternion.setFromUnitVectors(_tetherUp, _surfDir);
      }
    }
  }

  // Flaring: an active star's corona pulses (and flickers brighter) over time; a quiet star is steady.
  // The pulse and the flare timing live in the shared animator (bodyFeatures.updateStarLook).
  function updateStarFx(nowSec: number) {
    for (const s of starVisuals) updateStarLook(s, nowSec);
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
    controls.autoRotate = !lockRotate && orbitSpeed > 0 && !reframing;
    updateSpin();
    updateSurfaceConstructs();
    updateStarFx(nowSec);
    updateAuroras(nowSec);
    updateMagma(magmaVisuals, nowSec);
    updateLightning(lightningVisuals, nowSec);
    updatePlumes(plumeVisuals, nowSec);
    for (const c of cloudVisuals) c.mesh.rotation.y = nowSec * c.drift; // clouds drift over the surface
    updateConstructs();
    updateTrueScaleFloor();
    updateShadows();
    updateRings();
    updateBelts();
    updateOrbitRings();
    logRingDebug();
    updateRouteLines();
    // The wheel's notch size adapts to how far below scene scale the camera is (wheelZoomSpeed):
    // OrbitControls' fixed ~5%/notch is ~400 notches from a true-scale ship close-up back to the
    // system, most of them through featureless black - which reads as "the wheel stopped working",
    // not as slowness, because there is nothing in frame to show progress against.
    controls.zoomSpeed = wheelZoomSpeed(camera.position.distanceTo(controls.target), GRID_RADIUS);
    controls.update();
    // Near plane follows the working distance. Framing a true-scale world puts the camera ~1e-5 scene
    // units out, far inside the fixed 0.01 near plane — the framed body would be clipped away as the
    // camera arrived. Tie near to the camera-target distance (2%, floored well below any body) and the
    // clip always sits between the camera and the subject. Only touched when it moves >20%, so the
    // projection matrix is not rebuilt every frame; zoomed out it returns to the usual 0.01.
    {
      const dT = camera.position.distanceTo(controls.target);
      // Floor 1e-11, not 1e-8: "floored well below any body" was written when the smallest framed
      // thing WAS a body (~1e-7 scene units). A true-scale SHIP is ~1e-9, and a floor above 2% of
      // the framing distance puts the whole scene inside the near plane - the G3 true-scale
      // blackout: focus a construct at 0% and everything clipped to black.
      const wantNear = Math.min(0.01, Math.max(1e-11, dT * 0.02));
      if (wantNear < camera.near * 0.8 || wantNear > camera.near * 1.25) { camera.near = wantNear; camera.updateProjectionMatrix(); }
      // The ring sample density is chosen against the working distance, and the dense arc is laid down
      // around where the camera was looking — so a real zoom re-chooses the one, and a body carrying the
      // camera along its orbit eventually walks out of the other. Only while rebased: an un-rebased scene
      // is always uniform and this must not touch it. One ring re-propagates, so it is cheap to be eager.
      // A ROUTE LINE re-tessellates on zoom whether or not the scene has rebased: its density is
      // chosen from the working distance alone, and unlike a ring it has no uniform master to fall
      // back on, so a wide-shot tessellation left in place would facet visibly on the way in.
      if (sceneOrigin.lengthSq() > 0 || routeLines.length) {
        const zoomed = dT > lastRingCamDist * 1.6 || dT < lastRingCamDist / 1.6;
        const strayed = _ringFocus.addVectors(sceneOrigin, controls.target).distanceTo(lastRingFocus)
          > lastRingCoreArc * RING_FOCUS_SLACK;
        if (zoomed || strayed) emitOrbitRings();
        else emitRefinedRings(); // a refined arc SLIDES with the focus every frame - see the note there
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
    // G9 labels are sized in SCREEN pixels but live in world space, so the conversion depends on the
    // viewport height. Without this they would keep the pixel size of whatever the window was when
    // they were built.
    if (skyMode !== 'off' && skyLabelPx > 0) rebuildSkyStars();
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

  // A74 diagnostic (same family as __camDebug / __ssePerf): `window.__holoProbe()` reports the
  // vertical alignment of the three things that must share the reference plane — the floating
  // origin's y, the first grid vertex's world y, and the root star's world y. A misalignment here
  // IS the "grid floats above the star" class of fault, and this is the only way to see it
  // numerically in a pane that does not composite.
  if (typeof window !== 'undefined') (window as any).__holoProbe = () => {
    const star = bodies.find((b) => b.isStar);
    const g = gridGroup.children.find((c: any) => c.geometry?.getAttribute?.('position')) as any;
    const gy = g ? (() => { const v = new THREE.Vector3(); v.fromBufferAttribute(g.geometry.getAttribute('position'), 0); return g.localToWorld(v).y; })() : null;
    return { originY: sceneOrigin.y, gridFirstVertexWorldY: gy, starWorldY: star ? star.mesh.getWorldPosition(new THREE.Vector3()).y : null, gridChildren: gridGroup.children.length, gridMode };
  };

  return { setSystem, setTime, focusBody, stepFocusUp, setFocusLevel, setViewportAU, setViewInset, setFraming, setSkybox, setSkyStars, setBackground, setCompression, setBeltDetail, setBodyStyle, setRender, setUnlit, setAuroras, setAtmospheres, setFlatOverhead, setLockRotation, setBeltStyle, setBodySize, setConstructOffset, setGrid, setGridFalloff, setGridDepth, setGridScale, setGridCellReporter, setOrbitSpeed, setLabelColor, setLabelSize, setLabelFont, setLabelsVisible, setOrbitOpacity, setOrbitLinesVisible, setHighlights, setHud, setFilter, setLensing, setPortrait, setUserSpin, setShipCapability, setTransitMotion, setGmClock, resetView, resize, dispose };
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
  return readableBodyRadius(radiusKmOf(node));
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
  // G5: the DESIGNED opacity, kept on the material so the dial is a MULTIPLIER of it rather than a
  // replacement - that is what keeps a heliocentric ring brighter than a moon's and the spokes dimmer
  // than both, at every dial position, without the scene restating the weights.
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: ORBIT_OPACITY_HELIO, depthWrite: false });
  mat.userData.baseOpacity = ORBIT_OPACITY_HELIO;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_SAMPLES * 3), 3));
  return { loop: new THREE.LineLoop(geo, mat), abs };
}

/**
 * A transit route line: an empty buffer at the ceiling, filled by `emitRouteLines` every time the
 * working distance changes. Unlike an orbit ring it keeps no float64 master, because it is not
 * re-emitted from fixed vertices - it is re-evaluated from the route's knots, which are the master
 * and live in AU on the node.
 *
 * Vertex colours, so one line can carry the burn phases (accel/coast/brake) in a single draw call
 * the way the 2D orrery's per-segment strokes do. depthWrite OFF for the reason buildOrbitRing gives.
 */
function buildRouteLine(color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2048 * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(2048 * 3), 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    color, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false; // the buffer is rewritten under it; a stale bounding sphere must not cull it
  line.visible = false;
  return line;
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
// C3's satellite-frame rotation lives in `system/satelliteFrame.ts` and is applied by the PROPAGATOR
// (C9), so a moon's placement no longer rotates anything — it reads a world position that is already
// framed. This ring is the one place in the renderer that still rotates, because it is sampled from
// `propagateState3D` directly (a parent-relative offset in the system frame) rather than read out of a
// world-position map. Same helper, same gate, different input — which is why the body sits on it.

/**
 * A ring in the PARENT's local scene frame, laid down from a per-sample radial rule. Both callers below
 * share it because the ring has to be built with EXACTLY the transform the body's own placement uses, or
 * the body will not sit on it → keeping the two rules beside each other is what stops them drifting.
 *
 * Local by construction, so the numbers stay small whatever the parent's distance: a floating-origin
 * rebase never has to touch these, the object is simply positioned at the parent each frame.
 */
function buildLocalOrbitRing(node: any, color: number, tiltRad: number, distFor: (off: number) => number): { loop: THREE.LineLoop; local: Float64Array; sample: (u: number, out: THREE.Vector3) => void } | null {
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
  // The FLOAT64 master, kept alongside the float32 buffer the GPU reads. A parent-local ring's
  // vertices carry the ring's own radius as magnitude, and the GPU composes them with the parent's
  // translation at SINGLE precision - measured on a live player view (2026-08-08, [ringdbg]): at a
  // true-scale ISS close-up the rounding step is ~4.7 PIXELS, which is the "orbit lines vibrate"
  // report in its entirety. The master lets updateOrbitRings re-emit a NEAR ring's vertices
  // origin-relative in float64, rounded once - the same discipline the heliocentric rings and the
  // grid already follow (rebaseStaticGeometry), applied to the local-frame family.
  const local = new Float64Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) { local[3 * i] = pts[i].x; local[3 * i + 1] = pts[i].y; local[3 * i + 2] = pts[i].z; }
  // The SAMPLER: orbit parameter u in [0,1) -> a point on this ring, through the IDENTICAL pipeline
  // the master above was built with (propagate -> equator tilt -> radial spread -> axis swap). This
  // is what lets updateOrbitRings re-sample the ring non-uniformly about the camera's focus - the
  // A23 dense arc, extended to the local-ring family. A23 could always assume a propagator on its
  // (heliocentric) rings; this family had the propagator too and simply never got the machinery,
  // which is why a followed station's own orbit line still swept and buzzed after the f32 fix: the
  // ship rides the true curve, the line was a fixed 1024-gon, and at station zoom one chord's sag
  // is tens of pixels. u = i/N reproduces master vertex i exactly, by construction.
  const _eqS = { x: 0, y: 0, z: 0 };
  const sample = (u: number, out: THREE.Vector3) => {
    const raw = propagateState3D(node, t0 + u * period).r;
    const r = tiltRad ? toParentEquator(raw.x, raw.y, raw.z, tiltRad, _eqS) : raw;
    const off = Math.hypot(r.x, r.y, r.z);
    if (off < 1e-12) { out.set(0, 0, 0); return; }
    const k = distFor(off) / off;
    out.set(r.x * k, r.z * k, r.y * k); // physics(x,y,z) -> scene(x,z,y), as the master
  };
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: ORBIT_OPACITY_LOCAL, depthWrite: false }); // see buildOrbitRing
  mat.userData.baseOpacity = ORBIT_OPACITY_LOCAL;
  return { loop: new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat), local, sample };
}

// `orbitTiltRad` is the caller's `satelliteTiltRad(node, parent)` — the gate is made there, once, and
// NOT repeated here. It used to be made in both places in two different spellings.
function buildMoonOrbitRing(node: any, kHelio: number, localScale: number, parentRadius: number, moonRadius: number, compression: number, color: number, orbitTiltRad = 0): { loop: THREE.LineLoop; local: Float64Array; sample: (u: number, out: THREE.Vector3) => void } | null {
  return buildLocalOrbitRing(node, color, orbitTiltRad, (off) => {
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
function buildBaryMemberRing(node: any, kHelio: number, memberRadius: number, partnerRadius: number, color: number): { loop: THREE.LineLoop; local: Float64Array; sample: (u: number, out: THREE.Vector3) => void } | null {
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
function buildWireframeBody(radius: number, color: number, glow: boolean, occluded: boolean, terrain?: WireTerrain | null, dotSize?: number): THREE.Group {
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
    // The size is the LAW's answer (scaleLaw.wireDotSize), passed in by the scene - see C15. The old
    // `max(floor, radius * 0.16)` had a world-unit floor that outgrew the body it decorated.
    const dotMat = new THREE.PointsMaterial({ color, size: dotSize ?? radius * 0.16, sizeAttenuation: true, transparent: true, opacity: 1, blending, depthWrite: occluded });
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

function buildBeltBand(node: any, project: Projector, detail: number, timeMs: number, asPoints: boolean, markerFloor = 1): BeltVisual | null {
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
    // `points` drops the rock texture for plain small dots — the vector-display look. Half the size,
    // because a textured rock reads as an object and a dot reads as a speck: matching their pixel
    // sizes would make the dotted belt the heavier of the two.
    const mat = asPoints
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
    pivot, outerScene, points: null, bandMesh, parentId: parent.id,
    radii: new Float32Array(0), baseAng: new Float32Array(0), omega: new Float32Array(0),
    t0Sec: 0, planetR: planetRenderedR, baseColor: base
  };
}

function buildPlanetRing(node: any, parent: any, planetRenderedR: number, detail: number, timeMs: number, asPoints = false): RingVisual | null {
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
  // A ring follows the belt style, because the control is one control ("Belts & rings") and a system
  // with dotted belts and textured rings would read as a bug. `points` simply drops the dot texture.
  const mat = new THREE.PointsMaterial({ map: asPoints ? null : getDotTexture(), vertexColors: true, size: asPoints ? size * 0.6 : size, sizeAttenuation: true, transparent: true,
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
  return { pivot, outerScene, points, parentId: parent.id, radii, baseAng, omega, t0Sec: timeMs / 1000, planetR: planetRenderedR, baseColor, emissiveBase };
}



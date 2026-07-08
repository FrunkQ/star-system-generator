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
import { buildShaderObject } from './filters/shaderMaterial';
import type { FilterParamValues } from './filters/schema';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { propagateState3D } from '$lib/physics/orbits';
import { getNodeColor } from '$lib/rendering/colors';
import { getPlanetTextureEquirect } from '$lib/rendering/planetTexture';
import { oblatePolarFactor } from '$lib/rendering/bodyShape';
import { getVisibleNodeIds } from '$lib/system/visibleNodes';
import { EARTH_MASS_KG } from '$lib/constants';
import type { System } from '$lib/types';

const HOLO_TINT = 0x39c6ff; // cyan hologram chrome (skins wire in later)
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
  setCompression(v: number): void; // toytown level 0 (true scale) .. 1 (fully compressed)
  setBeltDetail(v: number): void; // GM belt particle-budget quality 0..1 (performance)
  // GPU post-processing filter (CRT, night-vision, thermal, …) from the ported Mappadux package.
  setFilter(id: string, params?: FilterParamValues): void;
  resetView(): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export interface HoloOptions {
  onSelect?: (id: string) => void; // fired when the viewer taps a body
  labelLayer?: HTMLElement; // absolutely-positioned overlay the scene fills with body labels
  skybox?: boolean; // background starfield (default true); a GM-selectable skybox slot later
}

interface BodyVisual {
  id: string;
  name: string;
  mesh: THREE.Object3D;
  label?: HTMLElement;
  parentId?: string | null;
  satellite: boolean; // a moon: positioned as a magnified offset around its (compressed) parent
  spinPeriodSec?: number; // sidereal rotation period; drives the texture turning
  tiltQuat?: THREE.Quaternion; // fixed axial-tilt rotation, composed with the live spin each frame
  isConstruct?: boolean; // icon sprite: fixed screen size, focus-driven size/dim states
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

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = GRID_RADIUS * 6;
  controls.minPolarAngle = Math.PI * 0.06; // don't go fully top-down
  controls.maxPolarAngle = Math.PI * 0.49; // or under the table

  const grid = buildPolarGrid();
  scene.add(grid);

  // Background starfield (a static random field; a GM-selectable skybox slot comes later).
  const starfield = buildStarfield();
  starfield.visible = opts.skybox !== false;
  scene.add(starfield);
  function setSkybox(on: boolean) { starfield.visible = on; }

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
    filterId = id || 'none';
    filterParams = params || {};
    rebuildFilter();
  }

  // --- Dynamic content ---
  let currentSystem: System | null = null;
  let bodies: BodyVisual[] = [];
  let starLights: { id: string; light: THREE.PointLight }[] = [];
  let starVisuals: { corona: THREE.Sprite; coronaScale: number; activity: number }[] = [];
  let rMax = 1; // largest heliocentric distance in the system (AU), for the compression normaliser
  let compression = DEFAULT_COMPRESSION;
  let beltDetail = 0.6; // GM quality knob: scales belt particle budget (performance), not physics
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
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(bodies.map((b) => b.mesh), false);
    if (hits.length) {
      const b = bodies.find((x) => x.mesh === hits[0].object);
      if (b) opts.onSelect?.(b.id);
      return;
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
    if (b.isConstruct) return 1.6; // icons have no radius; frame them close
    const geo = (b.mesh as any).geometry;
    const rad = geo?.parameters?.radius ?? 0.6;
    return Math.max(2, rad * 9);
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
    } else {
      return; // no focus, per-body framing → leave the camera where the user put it
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
    focusDrive = id ? 48 : 0; // ~0.8 s of easing toward the framed shot
    visibleSet = getVisibleNodeIds(currentSystem, focusedId);
  }

  function resetView() {
    focusedId = null;
    focusDrive = 0;
    camera.position.copy(HOME_CAM);
    controls.target.set(0, 0, 0);
    visibleSet = getVisibleNodeIds(currentSystem, null);
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
    for (const b of bodies) b.label?.remove();
    bodies = [];
    starLights = [];
    starVisuals = [];
  }

  function setSystem(system: System | null) {
    clearContent();
    focusedId = null;
    focusDrive = 0;
    currentSystem = system;
    if (!system) return;

    const rootId = (system.nodes.find((n) => n.parentId === null) as any)?.id ?? null;
    // "System-level" = one hop from the root, OR a member of a root-level barycentre (so Pluto and
    // binary-star members read as major bodies on their own heliocentric ring, not as satellites).
    const rootBaryIds = new Set((system.nodes as any[]).filter((n) => n.kind === 'barycenter' && n.parentId === rootId).map((n) => n.id));
    const isSystemLevel = (n: any) => n.parentId === rootId || rootBaryIds.has(n.parentId);

    const pos0 = computeWorldPositions3D(system, timeMs);
    rMax = 0;
    for (const p of pos0.values()) rMax = Math.max(rMax, Math.hypot(p.x, p.y, p.z));
    if (rMax <= 0) rMax = 1;

    for (const node of system.nodes as any[]) {
      // Belts: a debris band on their (compressed) orbit, never a lone sphere.
      if (isBelt(node)) {
        const band = buildBeltBand(node, positionToScene, beltDetail);
        if (band) contentGroup.add(band);
        continue;
      }
      // Planetary rings are drawn with their planet later; don't render the node as a sphere.
      if (node.roleHint === 'ring') continue;

      const systemLevel = isSystemLevel(node);

      // Heliocentric orbit ring for system-level orbiters (planets + barycentres). Static geometry.
      if (systemLevel && node.orbit) {
        const ring = buildOrbitRing(node, positionToScene, safeColor(node));
        if (ring) contentGroup.add(ring);
      }

      if (node.kind === 'barycenter') continue; // barycentres have a ring but no body of their own

      const isStar = node.roleHint === 'star' || (node.kind === 'body' && node.parentId === null);
      const colorHex = safeColor(node);

      let mesh: THREE.Object3D;
      if (isStar) {
        const activity = Math.max(0, Math.min(1, (node.flareActivity ?? 0)));
        // Photosphere: an emissive (unlit) textured sphere — granulation + sunspots (spot count
        // scales with the star's flare activity), so you see surface detail and it spins.
        const starMat = new THREE.MeshBasicMaterial();
        const st = new THREE.CanvasTexture(makeStarTexture(colorHex, activity, node.id));
        st.colorSpace = THREE.SRGBColorSpace;
        starMat.map = st;
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(STAR_RADIUS, 32, 24), starMat);
        mesh = sphere;
        // Corona: an additive halo ringing the photosphere; bigger/brighter for an active star and
        // pulsing (flaring) over time in updateStarFx. Parented to the sphere so it tracks position;
        // the billboard ignores the sphere's spin.
        const coronaMat = new THREE.SpriteMaterial({ map: glowTexture, color: colorHex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
        const corona = new THREE.Sprite(coronaMat);
        const coronaScale = STAR_RADIUS * (5 + activity * 4);
        corona.scale.setScalar(coronaScale);
        sphere.add(corona);
        starVisuals.push({ corona, coronaScale, activity });
        // The star casts light: a point light co-located with the photosphere gives a real terminator.
        // decay 0 so the compressed distances don't dim the outer planets.
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
        // Moons are capped small so they read as satellites, not rival planets, when you zoom in.
        const radius = systemLevel ? bodyRadius(node) : Math.min(bodyRadius(node), 0.1);
        const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
        const texCanvas = getPlanetTextureEquirect(node);
        if (texCanvas) {
          const t = new THREE.CanvasTexture(texCanvas);
          t.colorSpace = THREE.SRGBColorSpace;
          mat.map = t;
        } else {
          mat.color.set(colorHex);
        }
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat);
        // Oblateness: flatten along the spin (local Y) axis for a fast rotator.
        const polF = oblatePolarFactor((node as any).oblateness);
        if (polF < 0.999) sphere.scale.set(1, polF, 1);
        mesh = sphere;
      }
      contentGroup.add(mesh);

      const isConstruct = node.kind === 'construct';
      // Every body gets a label element; which ones actually show is decided per-frame by the focus
      // visibility rule (getVisibleNodeIds) — so a planet's moons name themselves once it's selected.
      const label = makeLabel(String(node.name ?? ''), opts.labelLayer);
      // Spin: sidereal rotation from the data, composed onto a fixed axial tilt each frame. Stars
      // spin too (their sunspots turn); the corona is a billboard child, unaffected by the spin.
      // Constructs are camera-facing sprites — no spin.
      const spinPeriodSec = !isConstruct ? Math.abs(node.rotation_period_hours || 0) * 3600 || undefined : undefined;
      const tiltRad = ((node.axial_tilt_deg || 0) * Math.PI) / 180;
      const tiltQuat = !isConstruct ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltRad) : undefined;
      // A ship mid-journey is positioned absolutely by the transit sampler — never apply the
      // satellite spread to it, or the spread would distort its transit path.
      const inTransit = isConstruct && (node.scheduled_journeys || []).length > 0;
      bodies.push({ id: node.id, name: String(node.name ?? ''), mesh, label, parentId: node.parentId, satellite: !systemLevel && !inTransit, spinPeriodSec, tiltQuat, isConstruct });
    }
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
        if (off > 1e-12) {
          const spreadDist = 0.45 + 0.16 * Math.log10(1 + off / 0.0005); // scene units from the planet
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

  function updateLabels() {
    if (!opts.labelLayer) return;
    for (const b of bodies) {
      if (!b.label) continue;
      if (!visibleSet.has(b.id)) { b.label.style.opacity = '0'; continue; } // focus-rule naming
      proj.copy(b.mesh.position).project(camera);
      const behind = proj.z > 1;
      const x = (proj.x * 0.5 + 0.5) * viewW;
      const y = (-proj.y * 0.5 + 0.5) * viewH;
      if (behind || x < 0 || x > viewW || y < 0 || y > viewH) {
        b.label.style.opacity = '0';
      } else {
        b.label.style.opacity = b.id === focusedId ? '1' : '0.8';
        b.label.style.transform = `translate(-50%, -140%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
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

  // Flaring: an active star's corona pulses (and flickers brighter) over time; a quiet star is steady.
  function updateStarFx(nowSec: number) {
    for (const s of starVisuals) {
      if (s.activity <= 0.01) continue;
      const pulse = 1 + s.activity * (0.1 * Math.sin(nowSec * 2.3) + 0.06 * Math.sin(nowSec * 6.1));
      s.corona.scale.setScalar(s.coronaScale * pulse);
      (s.corona.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.85 + s.activity * 0.15 * (0.5 + 0.5 * Math.sin(nowSec * 9.3)));
    }
  }

  function loop() {
    if (disposed) return;
    const nowSec = filterClock.getElapsedTime();
    driveFocus();
    updateSpin();
    updateStarFx(nowSec);
    updateConstructs();
    controls.update();
    if (filterPass) {
      filterPass.uniforms.time.value = nowSec; // drive scanlines/flicker
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
    updateLabels();
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
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    controls.dispose();
    clearContent();
    grid.traverse((o) => {
      const any = o as any;
      any.geometry?.dispose?.();
      any.material?.dispose?.();
    });
    (starfield.geometry as any)?.dispose?.();
    (starfield.material as any)?.dispose?.();
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose();
    glowTexture.dispose();
    renderer.dispose();
    pointer.abort();
  }

  return { setSystem, setTime, focusBody, setFraming, setSkybox, setCompression, setBeltDetail, setFilter, resetView, resize, dispose };
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

// Physical debris density from belt mass (log 1e-5..1 M⊕ → 0..1) — matches the 2D disc's densityFrac.
function beltDensityFrac(massKg: number | undefined): number {
  if (!massKg || massKg <= 0) return 0.35;
  const me = massKg / EARTH_MASS_KG;
  return Math.max(0, Math.min(1, (Math.log(me) - Math.log(1e-5)) / (0 - Math.log(1e-5))));
}

// A belt: a scatter of irregular debris rocks around its (inclined) orbit, radius-jittered into a
// band. Rock COUNT = the belt's physical density (from mass) × the GM `detail` quality knob; the
// radial spread uses the belt's real inner/outer radius. Rocks are split across a few silhouette
// textures at varied sizes/tints so they read as chaotic rubble. Still cheap — point clouds.
function buildBeltBand(node: any, project: Projector, detail: number): THREE.Object3D | null {
  const period = orbitPeriodMs(node.orbit);
  if (period === 0) return null;
  const t0 = node.orbit.t0 || 0;
  const dens = beltDensityFrac(node.massKg);
  const physical = 120 + dens * 520; // relative richness (120 sparse .. 640 dense)
  const quality = 0.3 + Math.max(0, Math.min(1, detail)) * 1.7; // GM performance multiplier 0.3..2.0
  const COUNT = Math.max(20, Math.min(1600, Math.round(physical * quality)));
  // Radial band width from the real inner/outer radius, else a ±12% fallback.
  let widthFrac = 0.12;
  const innerKm = node.radiusInnerKm;
  const outerKm = node.radiusOuterKm;
  if (innerKm > 0 && outerKm > innerKm) widthFrac = (outerKm - innerKm) / (innerKm + outerKm);
  const rocks = getRockTextures();
  const buckets: number[][] = rocks.map(() => []);
  const v = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    const jitter = 1 + (Math.random() - 0.5) * 2 * widthFrac;
    const r = propagateState3D(node, t0 + Math.random() * period).r;
    project({ x: r.x * jitter, y: r.y * jitter, z: r.z * jitter }, v);
    buckets[(Math.random() * rocks.length) | 0].push(v.x, v.y, v.z);
  }
  const sizes = [0.05, 0.08, 0.11, 0.065];
  const tints = [0x9aa6b2, 0xb0a08c, 0x8a939e, 0xa89a86]; // grey/brown rubble
  const group = new THREE.Group();
  buckets.forEach((arr, i) => {
    if (!arr.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      map: rocks[i], color: tints[i], size: sizes[i], sizeAttenuation: true,
      transparent: true, opacity: 0.85, alphaTest: 0.4, depthWrite: false
    });
    group.add(new THREE.Points(geo, mat));
  });
  return group;
}

function makeLabel(name: string, layer?: HTMLElement): HTMLElement | undefined {
  if (!layer || !name) return undefined;
  const el = document.createElement('div');
  el.className = 'holo-label';
  el.textContent = name;
  el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-9999px,-9999px);opacity:0;pointer-events:none;white-space:nowrap;font:600 11px/1.2 ui-monospace,monospace;color:#cfefff;text-shadow:0 0 4px rgba(0,0,0,0.9);letter-spacing:0.02em;';
  layer.appendChild(el);
  return el;
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

function buildPolarGrid(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Color(HOLO_TINT);
  for (let ri = 1; ri <= 6; ri++) {
    const radius = (GRID_RADIUS / 6) * ri;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const col = base.clone().multiplyScalar(0.45 * (1 - (ri - 1) / 8));
    const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 });
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  const spokes: THREE.Vector3[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    spokes.push(new THREE.Vector3(0, 0, 0));
    spokes.push(new THREE.Vector3(Math.cos(a) * GRID_RADIUS, 0, Math.sin(a) * GRID_RADIUS));
  }
  const spokeMat = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.22), transparent: true, opacity: 0.5 });
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), spokeMat));
  return group;
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

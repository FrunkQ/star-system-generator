// Imperative three.js controller for the 3D starmap (galaxy) view — the starmap sibling of the holo
// system scene. Systems are billboard stars laid on a ground plane at their map (x,y); multi-star
// systems render as a small cluster (binaries are not one dot). Routes are lines on the plane. A
// fading polar grid (optional, plain or LY-labelled), HTML name labels, orbit/tilt camera, and the
// same GPU filter chain as the system holo. Plain module so the wrapper lazy-loads three into its own
// chunk. Deliberately independent of scene.ts (no orbits/rings/belts) — shares only the filter package.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { filterRegistry } from '$lib/holo/filters/FilterRegistry';
import { buildShaderObject, updateUniforms } from '$lib/holo/filters/shaderMaterial';
import type { FilterParamValues } from '$lib/holo/filters/schema';
import { starClusterOffsets } from './systemStars';

const GRID_RADIUS = 12; // scene units the map's extent maps to
const HOLO_TINT = 0x63b3ff;

export interface SmSystem { id: string; name: string; x: number; y: number; stars: { color: string }[] }
export interface SmRoute { fromId: string; toId: string; dashed?: boolean }
export type GridMode = 'off' | 'plain' | 'scaled' | 'hex';

// An in-scene name label: a canvas-textured sprite in the 3D scene (not a DOM overlay) so the
// post-process filter warps/tints it in lockstep with the system stars. Mirrors scene.ts.
interface LabelSprite {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  text: string;
  aspect: number;      // canvas width / height
  heightRatio: number; // canvas full height / text height — converts labelSizePx to sprite size
}

export interface StarmapSceneOptions {
  distanceUnit?: string; // 'ly' | 'pc' | … — the scale label suffix
  onSelect?: (id: string) => void; // fired when the viewer taps a system (live view)
}

export interface StarmapController {
  setData(systems: SmSystem[], routes: SmRoute[]): void;
  setGrid(mode: GridMode): void;
  setRouteGlow(on: boolean): void; // emissive glow on routes (vs plain lines)
  setMono(on: boolean): void; // monochrome palette for tinting filters
  setMapGrid(cfg: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number } | null): void; // GM's snap-grid
  setBackground(bg: string): void;
  setFraming(angleDeg: number): void;
  setLabelsVisible(on: boolean): void;
  setLabelColor(hex: string | null): void;
  setLabelSize(px: number): void;
  setLabelFont(font: string | null): void;
  setFilter(id: string, params?: FilterParamValues): void;
  setHud(canvas: HTMLCanvasElement | null): void; // static overlay bitmap composited INTO the filter
  resize(w: number, h: number): void;
  dispose(): void;
}

// A soft round glow sprite texture (shared) — a system star.
let glowTex: THREE.Texture | null = null;
function starGlow(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
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
  controls.maxPolarAngle = Math.PI * 0.49;

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
  let gridMode: GridMode = 'plain';
  let routeGlowOn = true; // emissive glow on routes (vs plain lines)
  let monoOn = false; // monochrome palette (white/grey) so a tint filter colours the whole map
  let lastData: { systems: SmSystem[]; routes: SmRoute[] } | null = null; // for rebuilds (route-glow / mono toggle)
  const MONO_HEX = 0xdfe6f0;
  const routeColor = () => (monoOn ? MONO_HEX : HOLO_TINT);
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);
  let extent = 1; // world half-extent of the map (map units), for LY labels
  let mapCx = 0, mapCy = 0, mapK = 1; // the fit transform from setData (scene = (mapPos - c)*k)
  let mapGridCfg: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number } | null = null;

  function clearGroup(g: THREE.Object3D) {
    g.traverse((o) => { const a = o as any; a.geometry?.dispose?.(); const m = a.material; (Array.isArray(m) ? m : [m]).forEach((x: any) => { x?.map?.dispose?.(); x?.dispose?.(); }); });
    g.clear();
  }
  function ringPts(r: number): THREE.Vector3[] {
    const p: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    return p;
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
  function renderMapGrid(base: THREE.Color) {
    const cfg = mapGridCfg!;
    const cell0 = cfg.size * mapK;
    if (cell0 <= 1e-4) return;
    const half = GRID_RADIUS * 1.03;
    const originX = -mapCx * mapK, originZ = -mapCy * mapK; // scene coords of map (0,0)
    const draw = Math.max(1, Math.ceil(0.22 / cell0)); // thin out if the cells are tiny on screen
    const cell = cell0 * draw;
    const mat = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.42), transparent: true, opacity: 0.42 });
    const pts: THREE.Vector3[] = [];
    if (cfg.type === 'grid') {
      for (let n = Math.ceil((-half - originX) / cell); n <= Math.floor((half - originX) / cell); n++) {
        const x = originX + n * cell; pts.push(new THREE.Vector3(x, 0.01, -half), new THREE.Vector3(x, 0.01, half));
      }
      for (let n = Math.ceil((-half - originZ) / cell); n <= Math.floor((half - originZ) / cell); n++) {
        const z = originZ + n * cell; pts.push(new THREE.Vector3(-half, 0.01, z), new THREE.Vector3(half, 0.01, z));
      }
    } else {
      // hex / traveller-hex: a pointy-top lattice at the cell size, seeded on the map origin.
      const s = cell / Math.sqrt(3); // circumradius so the flat-to-flat width ≈ one cell
      const corner = (cxp: number, czp: number, kk: number) => new THREE.Vector3(cxp + s * Math.cos((Math.PI / 180) * (60 * kk - 30)), 0.01, czp + s * Math.sin((Math.PI / 180) * (60 * kk - 30)));
      const rng = Math.min(40, Math.ceil(half / (s * 1.5)) + 1);
      for (let q = -rng; q <= rng; q++) for (let r = -rng; r <= rng; r++) {
        const cxp = originX + s * Math.sqrt(3) * (q + r / 2), czp = originZ + s * 1.5 * r;
        if (Math.abs(cxp) > half + s || Math.abs(czp) > half + s) continue;
        for (let kk = 0; kk < 6; kk++) pts.push(corner(cxp, czp, kk), corner(cxp, czp, kk + 1));
      }
    }
    gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  function rebuildGrid() {
    clearGroup(gridGroup);
    gridGroup.visible = gridMode !== 'off';
    if (gridMode === 'off') return;
    const base = new THREE.Color(routeColor());
    const unit = (opts.distanceUnit || 'ly').toLowerCase() === 'diagrammatic' ? '' : (opts.distanceUnit || 'ly');
    // The GM's snap-grid, when present, takes precedence over the decorative polar/hex grid.
    if (mapGridCfg && mapGridCfg.type !== 'none' && mapK > 0) { renderMapGrid(base); return; }
    if (gridMode === 'hex') {
      // A hex lattice on the ground plane, clipped to the map disc — aligned to the starmap.
      const s = GRID_RADIUS / 7;              // hex circumradius
      const pts: THREE.Vector3[] = [];
      const corner = (cx: number, cz: number, k: number) => new THREE.Vector3(cx + s * Math.cos((Math.PI / 180) * (60 * k - 30)), 0.01, cz + s * Math.sin((Math.PI / 180) * (60 * k - 30)));
      const rng = 7;
      for (let q = -rng; q <= rng; q++) {
        for (let r = -rng; r <= rng; r++) {
          const cx = s * Math.sqrt(3) * (q + r / 2), cz = s * 1.5 * r;
          if (Math.hypot(cx, cz) > GRID_RADIUS + s) continue;
          for (let k = 0; k < 6; k++) { pts.push(corner(cx, cz, k), corner(cx, cz, k + 1)); } // 6 edges (overlaps are harmless)
        }
      }
      gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.4), transparent: true, opacity: 0.4 })));
      return;
    }
    for (let ri = 1; ri <= 6; ri++) {
      const radius = (GRID_RADIUS / 6) * ri;
      const col = base.clone().multiplyScalar(0.45 * (1 - (ri - 1) / 8));
      gridGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts(radius)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 })));
      if (gridMode === 'scaled') {
        const distVal = (radius / GRID_RADIUS) * extent; // map units at this ring ≈ distance
        const label = makeGridLabel(`${distVal >= 100 ? Math.round(distVal) : distVal.toFixed(distVal < 10 ? 1 : 0)}${unit ? ' ' + unit : ''}`);
        if (label) { label.position.set(radius, 0.02, 0); gridGroup.add(label); }
      }
    }
    const spokes: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; spokes.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * GRID_RADIUS, 0, Math.sin(a) * GRID_RADIUS)); }
    gridGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(0.22), transparent: true, opacity: 0.5 })));
  }
  function setGrid(mode: GridMode) { if (mode === gridMode) return; gridMode = mode; rebuildGrid(); }
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
  interface Placed { id: string; name: string; center: THREE.Vector3; label?: LabelSprite }
  let placed: Placed[] = [];
  let labelsVisible = true;
  let labelColor = '#d6e2f2';
  let labelSizePx = 12;
  let labelFontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  function redrawAllLabels() { for (const p of placed) if (p.label) drawLabel(p.label); }
  const setLabelColor = (hex: string | null) => { labelColor = hex || '#d6e2f2'; redrawAllLabels(); };
  const setLabelSize = (px: number) => { labelSizePx = Math.max(6, Math.min(40, px)); }; // applied via sprite scale
  const setLabelFont = (f: string | null) => { labelFontFamily = f && f.trim() ? f : 'ui-monospace, SFMono-Regular, Menlo, monospace'; redrawAllLabels(); };
  const setLabelsVisible = (on: boolean) => { labelsVisible = on; };

  // A name label as an in-scene sprite (added to `content`, so it warps/tints with the stars).
  function makeLabelSprite(name: string): LabelSprite | undefined {
    if (!name) return undefined;
    const canvas = document.createElement('canvas');
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, -0.35); // anchor below the text so it floats above the star glyph
    sprite.renderOrder = 999;
    sprite.visible = false;
    const ls: LabelSprite = { sprite, canvas, text: name, aspect: 1, heightRatio: 1 };
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
    const cw = textW + pad * 2, ch = Math.ceil(fontPx * 1.35) + pad * 2;
    ls.canvas.width = Math.max(2, Math.round(cw * dpr));
    ls.canvas.height = Math.max(2, Math.round(ch * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
    ctx.fillStyle = labelColor;
    ctx.fillText(ls.text, cw / 2, ch / 2);
    ls.aspect = cw / ch;
    ls.heightRatio = ch / fontPx;
    const map = (ls.sprite.material as THREE.SpriteMaterial).map;
    if (map) map.needsUpdate = true;
  }

  function clearContent() {
    clearGroup(content);
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
    const toScene = (x: number, y: number) => new THREE.Vector3((x - cx) * k, 0, (y - cy) * k);

    const centers = new Map<string, THREE.Vector3>();
    const glow = starGlow();
    for (const sys of systems) {
      const center = toScene(sys.x, sys.y);
      centers.set(sys.id, center);
      const stars = sys.stars.length ? sys.stars : [{ color: '#8899aa' }];
      const offs = starClusterOffsets(stars.length);
      const R = 0.22; // star glyph radius in scene units
      stars.forEach((st, i) => {
        const mat = new THREE.SpriteMaterial({ map: glow, color: monoOn ? new THREE.Color(MONO_HEX) : new THREE.Color(st.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sp = new THREE.Sprite(mat);
        sp.position.copy(center).add(new THREE.Vector3((offs[i]?.dx ?? 0) * R, 0.0, (offs[i]?.dy ?? 0) * R));
        sp.scale.setScalar(R * 3.2);
        content.add(sp);
      });
      placed.push({ id: sys.id, name: sys.name, center, label: makeLabelSprite(sys.name) });
    }
    // Routes: an emissively-GLOWING filament — a soft additive ground-quad halo + a bright additive
    // core line — so the link reads like a lit hyperlane in both the 2D (overhead) and 3D starmap.
    const routePts: THREE.Vector3[] = [];
    const routePtsDash: THREE.Vector3[] = [];
    const glowW = GRID_RADIUS * 0.02; // filament half-width in scene units
    for (const r of routes) {
      const a = centers.get(r.fromId), b = centers.get(r.toId);
      if (!a || !b) continue;
      (r.dashed ? routePtsDash : routePts).push(a.clone().setY(0.02), b.clone().setY(0.02));
      // Glow band (skipped when the glow is toggled off, or for dashed — the dash reads better plain).
      if (!r.dashed && routeGlowOn) {
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len > 1e-4) {
          const mat = new THREE.MeshBasicMaterial({ map: routeGlow(), color: routeColor(), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
          const quad = new THREE.Mesh(ROUTE_QUAD.clone(), mat); // clone: clearContent disposes per-route geometry
          quad.position.set((a.x + b.x) / 2, 0.015, (a.z + b.z) / 2);
          quad.rotation.y = -Math.atan2(dz, dx);
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
    }
  }
  function loop() {
    if (disposed) return;
    const t = clock.getElapsedTime();
    controls.update();
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
      (hudMesh.material as THREE.MeshBasicMaterial).map!.image = hud;
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
    (starfield.geometry as any)?.dispose?.(); (starfield.material as any)?.dispose?.();
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose(); renderer.dispose();
  }

  rebuildGrid();
  return { setData, setGrid, setRouteGlow, setMono, setMapGrid, setBackground, setFraming, setLabelsVisible, setLabelColor, setLabelSize, setLabelFont, setFilter, setHud, resize, dispose };
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

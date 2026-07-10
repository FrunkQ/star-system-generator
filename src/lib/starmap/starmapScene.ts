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

export interface StarmapSceneOptions {
  labelLayer?: HTMLElement;
  distanceUnit?: string; // 'ly' | 'pc' | … — the scale label suffix
}

export interface StarmapController {
  setData(systems: SmSystem[], routes: SmRoute[]): void;
  setGrid(mode: 'off' | 'plain' | 'scaled'): void;
  setBackground(bg: string): void;
  setFraming(angleDeg: number): void;
  setLabelsVisible(on: boolean): void;
  setLabelColor(hex: string | null): void;
  setLabelSize(px: number): void;
  setLabelFont(font: string | null): void;
  setFilter(id: string, params?: FilterParamValues): void;
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

export function createStarmapScene(canvas: HTMLCanvasElement, opts: StarmapSceneOptions = {}): StarmapController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x05070c, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 3000);
  const HOME = new THREE.Vector3(0, GRID_RADIUS * 1.15, GRID_RADIUS * 1.5);
  camera.position.copy(HOME);

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

  // --- Grid (LY rings) ---
  let gridMode: 'off' | 'plain' | 'scaled' = 'plain';
  const gridGroup = new THREE.Group();
  scene.add(gridGroup);
  let extent = 1; // world half-extent of the map (map units), for LY labels

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
  function rebuildGrid() {
    clearGroup(gridGroup);
    gridGroup.visible = gridMode !== 'off';
    if (gridMode === 'off') return;
    const base = new THREE.Color(HOLO_TINT);
    const unit = (opts.distanceUnit || 'ly').toLowerCase() === 'diagrammatic' ? '' : (opts.distanceUnit || 'ly');
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
  function setGrid(mode: 'off' | 'plain' | 'scaled') { if (mode === gridMode) return; gridMode = mode; rebuildGrid(); }

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
  interface Placed { id: string; name: string; center: THREE.Vector3; label?: HTMLElement }
  let placed: Placed[] = [];
  let labelsVisible = true;

  function setLabelVar(name: string, v: string | null) { if (v == null) opts.labelLayer?.style.removeProperty(name); else opts.labelLayer?.style.setProperty(name, v); }
  const setLabelColor = (hex: string | null) => setLabelVar('--sm-label-color', hex);
  const setLabelSize = (px: number) => setLabelVar('--sm-label-size', `${Math.max(6, Math.min(40, px))}px`);
  const setLabelFont = (f: string | null) => setLabelVar('--sm-label-font', f && f.trim() ? f : null);
  const setLabelsVisible = (on: boolean) => { labelsVisible = on; };

  function makeLabel(name: string): HTMLElement | undefined {
    if (!opts.labelLayer || !name) return undefined;
    const el = document.createElement('div');
    el.className = 'sm-label';
    el.textContent = name;
    el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-9999px,-9999px);opacity:0;pointer-events:none;white-space:nowrap;font-weight:600;font-size:var(--sm-label-size,12px);font-family:var(--sm-label-font,ui-monospace,monospace);color:var(--sm-label-color,#d6e2f2);text-shadow:0 0 4px rgba(0,0,0,0.9);letter-spacing:0.02em;';
    opts.labelLayer.appendChild(el);
    return el;
  }

  function clearContent() {
    clearGroup(content);
    for (const p of placed) p.label?.remove();
    placed = [];
  }

  function setData(systems: SmSystem[], routes: SmRoute[]) {
    clearContent();
    if (!systems.length) return;
    // Normalise map (x,y) into the ground plane, centred, fitting GRID_RADIUS.
    const xs = systems.map((s) => s.x), ys = systems.map((s) => s.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const spanMap = Math.max(maxX - minX, maxY - minY, 1e-6);
    extent = spanMap / 2; // half-extent in map units (for LY labels)
    const k = (GRID_RADIUS * 0.92) / (spanMap / 2);
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
        const mat = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(st.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sp = new THREE.Sprite(mat);
        sp.position.copy(center).add(new THREE.Vector3((offs[i]?.dx ?? 0) * R, 0.0, (offs[i]?.dy ?? 0) * R));
        sp.scale.setScalar(R * 3.2);
        content.add(sp);
      });
      placed.push({ id: sys.id, name: sys.name, center, label: makeLabel(sys.name) });
    }
    // Routes as plane lines.
    const routePts: THREE.Vector3[] = [];
    const routePtsDash: THREE.Vector3[] = [];
    for (const r of routes) {
      const a = centers.get(r.fromId), b = centers.get(r.toId);
      if (!a || !b) continue;
      (r.dashed ? routePtsDash : routePts).push(a.clone().setY(0.01), b.clone().setY(0.01));
    }
    if (routePts.length) content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(routePts), new THREE.LineBasicMaterial({ color: HOLO_TINT, transparent: true, opacity: 0.5 })));
    if (routePtsDash.length) {
      const lm = new THREE.LineDashedMaterial({ color: HOLO_TINT, transparent: true, opacity: 0.5, dashSize: 0.3, gapSize: 0.2 });
      const seg = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(routePtsDash), lm);
      seg.computeLineDistances(); content.add(seg);
    }
    rebuildGrid();
  }

  // --- Loop ---
  let raf = 0, disposed = false;
  const proj = new THREE.Vector3();
  let viewW = 1, viewH = 1;
  function updateLabels() {
    if (!opts.labelLayer) return;
    for (const p of placed) {
      if (!p.label) continue;
      if (!labelsVisible) { p.label.style.opacity = '0'; continue; }
      proj.copy(p.center).project(camera);
      const behind = proj.z > 1;
      const x = (proj.x * 0.5 + 0.5) * viewW, y = (-proj.y * 0.5 + 0.5) * viewH;
      if (behind || x < 0 || x > viewW || y < 0 || y > viewH) { p.label.style.opacity = '0'; }
      else { p.label.style.opacity = '0.9'; p.label.style.transform = `translate(-50%, -160%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
    }
  }
  function loop() {
    if (disposed) return;
    const t = clock.getElapsedTime();
    controls.update();
    if (filterPass) { filterPass.uniforms.time.value = t; composer.render(); } else renderer.render(scene, camera);
    updateLabels();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  function resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    viewW = w; viewH = h;
    renderer.setSize(w, h, false); composer.setSize(w, h); filterRes.set(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function dispose() {
    disposed = true; cancelAnimationFrame(raf);
    controls.dispose(); clearContent(); clearGroup(gridGroup);
    (starfield.geometry as any)?.dispose?.(); (starfield.material as any)?.dispose?.();
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose(); renderer.dispose();
  }

  rebuildGrid();
  return { setData, setGrid, setBackground, setFraming, setLabelsVisible, setLabelColor, setLabelSize, setLabelFont, setFilter, resize, dispose };
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

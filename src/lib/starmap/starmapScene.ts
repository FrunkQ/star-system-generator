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

// WS7: `z` is the system's DEPTH in map units (absent/0 = on the reference plane). It is rendered as
// scene height, multiplied by the DISPLAY-ONLY exaggeration — which never touches distance maths.
export interface SmSystem { id: string; name: string; x: number; y: number; z?: number; stars: { color: string; bh?: 'quiescent' | 'active'; edd?: number }[] }
// WS3: routes carry their NAME so the 3D/flat starmap can label them like the 2D editor does — and,
// because the label rides the shared label pipeline, it obeys the Hide-labels override too.
export interface SmRoute { fromId: string; toId: string; dashed?: boolean; name?: string }
// WS3: the shared overlay vocabulary (see lib/map/mapOverlay.ts). Re-exported under the historic name
// so existing importers keep working.
export type { MapOverlay as GridMode } from '$lib/map/mapOverlay';
import { isLattice as isLatticeMode, type MapOverlay } from '$lib/map/mapOverlay';

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
  setGrid(mode: MapOverlay): void;
  setZExaggeration(v: number): void; // DISPLAY ONLY — stretches depth for clarity, never distances
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

// The black-hole glyph, drawn PROCEDURALLY to match the reference gallery: a black event horizon inside
// a bright photon ring; a FEEDING hole adds the edge-on particle blaze — a fuzzy hot-white→orange disc
// whose WIDTH grows with the accretion level, the far side lensed over the top, and the bright near-side
// blade crossing IN FRONT of the hole. Cached per accretion bucket.
const bhTex: Record<string, THREE.Texture> = {};
function bhGlyph(active: boolean, eddington = 0.6): THREE.Texture {
  const e = active ? Math.max(0.15, Math.min(1, eddington || 0.6)) : 0;
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
  let gridMode: MapOverlay = 'plain';
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
  // WS7 depth exaggeration. True interstellar depth is visually tiny next to the map's spread, so the
  // GM can stretch it for clarity. PURELY VISUAL: distances come from lib/map/systemDistance.ts and
  // never see this value.
  let zExaggeration = 1;
  // The flat "2D map" is the PLAN view: depth collapses entirely, so a system's marker never drifts off
  // its map position and the 2D view stays pixel-honest against the GM map. Depth is a 3D-only reading.
  let flatMode = false;

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
  function addLattice(edges: [number, number, number, number][], col: THREE.Color, cell: number, fadeFrom: number, fadeTo: number) {
    const A = 0.42;                                  // line alpha at full strength
    const depth = Math.max(0.01, cell * 0.18);       // curtain drop — deliberately shallow; full-height read as too intense
    const y0 = 0.01;
    const fade = (x: number, z: number) => {
      const d = Math.hypot(x, z);
      if (d <= fadeFrom) return 1;
      return Math.max(0, 1 - (d - fadeFrom) / Math.max(1e-6, fadeTo - fadeFrom));
    };
    const lp: number[] = [], lc: number[] = [];
    const sp: number[] = [], sc: number[] = [];
    const pushC = (arr: number[], a: number) => arr.push(col.r, col.g, col.b, a);
    for (const [x1, z1, x2, z2] of edges) {
      const a1 = A * fade(x1, z1), a2 = A * fade(x2, z2);
      if (a1 <= 0.002 && a2 <= 0.002) continue;
      lp.push(x1, y0, z1, x2, y0, z2);
      pushC(lc, a1); pushC(lc, a2);
      // Curtain: two triangles, full alpha along the top edge fading to zero at the bottom.
      sp.push(x1, y0, z1, x2, y0, z2, x2, y0 - depth, z2);
      pushC(sc, a1 * 0.55); pushC(sc, a2 * 0.55); pushC(sc, 0);
      sp.push(x1, y0, z1, x2, y0 - depth, z2, x1, y0 - depth, z1);
      pushC(sc, a1 * 0.55); pushC(sc, 0); pushC(sc, 0);
    }
    if (!lp.length) return;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 4));
    gridGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 4));
    gridGroup.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
  }

  function renderMapGrid(base: THREE.Color, typeOverride?: string, sizeOverride?: number) {
    // A lattice OVERLAY renders as the map-aligned grid at the GM's own cell size, so the player's
    // hexes/squares are the same scale as the GM's map — they used to be an arbitrary GRID_RADIUS/7,
    // which made them several times too big.
    const cfg = { type: (typeOverride ?? mapGridCfg?.type ?? 'none'), size: (sizeOverride ?? mapGridCfg?.size ?? DEFAULT_MAP_CELL) };
    const cell0 = cfg.size * mapK;
    if (cell0 <= 1e-4) return;
    const half = GRID_RADIUS * 2.4;   // well past the map so the lattice fills the view; it fades out below
    const originX = -mapCx * mapK, originZ = -mapCy * mapK; // scene coords of map (0,0)
    const draw = Math.max(1, Math.ceil(0.22 / cell0)); // thin out if the cells are tiny on screen
    const cell = cell0 * draw;
    const edges: [number, number, number, number][] = [];
    let hexLabels = 0;
    const HEX_LABEL_CAP = 400;
    if (cfg.type === 'grid') {
      for (let n = Math.ceil((-half - originX) / cell); n <= Math.floor((half - originX) / cell); n++) {
        const x = originX + n * cell; edges.push([x, -half, x, half]);
      }
      for (let n = Math.ceil((-half - originZ) / cell); n <= Math.floor((half - originZ) / cell); n++) {
        const z = originZ + n * cell; edges.push([-half, z, half, z]);
      }
    } else {
      // hex / traveller-hex: replicate the GM's FLAT-TOPPED lattice EXACTLY (Grid.svelte geometry) so
      // snapped systems land dead-centre in their hex. size = cell/2; centres at col·horizDist,
      // row·hexHeight + (col odd ? hexHeight/2 : 0), origin (0,0) — all transformed by the fit.
      const sizeS = (cfg.size / 2) * mapK;      // hex "radius" (centre→L/R vertex) in scene units
      const hd = 1.5 * sizeS;                   // column spacing
      const hh = Math.sqrt(3) * sizeS;          // row spacing = hex height
      if (hd < 0.06 || hh < 0.06) return;       // too dense on screen to be useful
      // vertices relative to a centre (flat-top): R, top-R, top-L, L, bot-L, bot-R
      const V: [number, number][] = [[sizeS, 0], [sizeS / 2, hh / 2], [-sizeS / 2, hh / 2], [-sizeS, 0], [-sizeS / 2, -hh / 2], [sizeS / 2, -hh / 2]];
      const clampRange = (lo: number, hiV: number) => ({ a: Math.max(lo, hiV - 200), b: hiV }); // safety cap
      const colLo = Math.floor((-half - originX) / hd) - 1, colHi = Math.ceil((half - originX) / hd) + 1;
      const rowLo = Math.floor((-half - originZ) / hh) - 1, rowHi = Math.ceil((half - originZ) / hh) + 1;
      const cR = clampRange(colLo, colHi), rR = clampRange(rowLo, rowHi);
      for (let col = cR.a; col <= cR.b; col++) {
        const cxp = originX + col * hd;
        const zBase = originZ + (Math.abs(col) % 2) * (hh / 2);
        for (let row = rR.a; row <= rR.b; row++) {
          const czp = zBase + row * hh;
          if (Math.abs(cxp) > half + sizeS || Math.abs(czp) > half + hh) continue;
          for (let i = 0; i < 6; i++) {
            const a = V[i], b = V[(i + 1) % 6];
            edges.push([cxp + a[0], czp + a[1], cxp + b[0], czp + b[1]]);
          }
          // TRAVELLER NUMBERING (WS3 [Q5]) — the CCRR hex address, matching Grid.svelte exactly: 1-based
          // col/row, wrapping at the 32×40 sector, zero-padded. Only drawn when the hexes are big enough
          // on screen to read, and capped, so a zoomed-out sector doesn't spawn thousands of sprites.
          if (cfg.type === 'traveller-hex' && hd >= 0.5 && hexLabels < HEX_LABEL_CAP) {
            let dCol = (col + 1) % 32; if (dCol <= 0) dCol += 32;
            let dRow = (row + 1) % 40; if (dRow <= 0) dRow += 40;
            const sp = makeHexNumber(`${String(dCol).padStart(2, '0')}${String(dRow).padStart(2, '0')}`, hh * 0.22);
            if (sp) { sp.position.set(cxp, 0.03, czp - hh * 0.3); gridGroup.add(sp); hexLabels++; }
          }
        }
      }
    }
    // Fade from the map's own radius out to the generous span, so the lattice covers the view but
    // dissolves rather than ending in a hard ragged edge.
    // Fade in world space from a little past the map out to the span: viewed top-down the visible area
    // sits inside the solid zone so the lattice fills the screen, but tilt the camera and the far field
    // dissolves toward the horizon instead of stretching away as clutter.
    addLattice(edges, base.clone().multiplyScalar(0.42), cell, GRID_RADIUS * 0.75, GRID_RADIUS * 1.9);
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
      renderMapGrid(base, gridMode === 'square' ? 'grid' : gridMode, mapGridCfg?.size ?? DEFAULT_MAP_CELL);
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
  function setGrid(mode: MapOverlay) { if (mode === gridMode) return; gridMode = mode; rebuildGrid(); }
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
    controls.maxPolarAngle = on ? 0.05 : Math.PI * 0.49;
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
    const glow = starGlow();
    for (const sys of systems) {
      const center = toScene(sys.x, sys.y, sys.z ?? 0);
      centers.set(sys.id, center);
      const stars = sys.stars.length ? sys.stars : [{ color: '#8899aa' }];
      const offs = starClusterOffsets(stars.length);
      const R = 0.22; // star glyph radius in scene units
      stars.forEach((st, i) => {
        // A black hole is drawn as its schematic glyph (normal-blended, so black reads as black) rather
        // than an additive colour-tinted glow that would vanish on the dark map — the disc blaze sized
        // by the accretion level when feeding, the bare ringed hole when quiescent.
        const mat = st.bh
          ? new THREE.SpriteMaterial({ map: bhGlyph(st.bh === 'active', st.edd), color: monoOn ? new THREE.Color(MONO_HEX) : 0xffffff, transparent: true, depthWrite: false })
          : new THREE.SpriteMaterial({ map: glow, color: monoOn ? new THREE.Color(MONO_HEX) : new THREE.Color(st.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sp = new THREE.Sprite(mat);
        sp.position.copy(center).add(new THREE.Vector3((offs[i]?.dx ?? 0) * R, 0.0, (offs[i]?.dy ?? 0) * R));
        sp.scale.setScalar(!st.bh ? R * 3.2 : st.bh === 'active' ? R * (3.6 + Math.min(1, st.edd ?? 0.6) * 1.2) : R * 3.4);
        content.add(sp);
      });
      // DROP-LINE: without a tether to the reference plane, exaggerated depth is unreadable — you cannot
      // tell above from below, or by how much. Fades out as it descends, and a small tick marks the spot
      // on the plane directly beneath, so the system's 2D position stays legible.
      if (Math.abs(center.y) > 1e-4) {
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
      // Route NAME at the midpoint. Pushed into `placed` so it inherits the whole label pipeline —
      // constant on-screen size, colour/font redraws, and crucially the labelsVisible (Hide labels)
      // gate that system names already obey. Route names used to render unconditionally in 2D and
      // not at all here.
      if (r.name && r.name.trim()) {
        const mid = a.clone().add(b).multiplyScalar(0.5).setY(0.03);
        placed.push({ id: `route:${r.fromId}>${r.toId}`, name: r.name, center: mid, label: makeLabelSprite(r.name) });
      }
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
    (starfield.geometry as any)?.dispose?.(); (starfield.material as any)?.dispose?.();
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose(); renderer.dispose();
  }

  rebuildGrid();
  return { setData, setGrid, setZExaggeration, setRouteGlow, setMono, setMapGrid, setFlatOverhead, setLockRotation, setBackground, setFraming, setLabelsVisible, setLabelColor, setLabelSize, setLabelFont, setFilter, setHud, resize, dispose };
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

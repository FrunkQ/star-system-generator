// The construct-model turntable (G3, design §5-§6): ONE self-contained renderer used by BOTH the
// import modal's preview and the info-block overlay, so the two surfaces cannot drift apart -
// what the GM approves in the modal is pixel-for-pixel what the document shows.
//
// Deliberately NOT built on src/lib/holo/** (another workstream's territory, and the holo scene
// is a whole-system engine - a single-prop turntable needs none of it). Plain three primitives.
//
// Finishes here are Phase 1's pair from the design's §5 menu: flat-shaded fill in the construct's
// own icon_color plus crease edges from THREE.EdgesGeometry - the geometric "edge detection"
// path, computed once at load. A model that ARRIVED with materials (a GLB) keeps them untouched;
// the tint exists because a printing STL arrives colourless, not to repaint authored work.
import * as THREE from 'three';
import { shade } from '$lib/rendering/planetAppearance';

export interface ModelViewerOptions {
  interactive?: boolean;   // drag to spin
  spin?: boolean;          // auto-turntable (pauses while dragging)
  background?: string | null; // null = transparent
  /** Keep the drawing buffer so a host can drawImage() this canvas into a filter texture (A38 -
   *  the document's CRT/holo filters capture the graphic rather than layering it on top). */
  capture?: boolean;
  /** Show the drive-alignment reference: an exhaust-orange arrow marking -Z, the direction the
   *  ship's MAIN DRIVE must face once oriented (the import modal's alignment aid). */
  driveMarker?: boolean;
}

// THE ORIENTATION CONVENTION (G3, owner steer 2026-08-03): after ModelRef.orient is applied,
// the ship's NOSE points +Z and its MAIN DRIVE points -Z. The drive is the one reliable "end"
// a spacecraft has, so the import modal aligns by it; the scene can then fly the ship nose-first
// with Object3D.lookAt(velocity) and the engines honestly point aft.
export const DRIVE_AXIS = new THREE.Vector3(0, 0, -1);

export interface ModelViewer {
  /** Hand over a (parsed) model. tintHex applies only when the source had no materials. */
  setObject(object: THREE.Object3D, opts: { hadMaterials: boolean; tintHex?: string | null; finish?: HullFinish | null; seed?: string }): void;
  setOrient(q: [number, number, number, number] | null): void;
  /** Light the drive plume. thrust01 0..1 = fraction of the ship's own drive in use; braking
   *  points the ship retrograde (the plume then leads, as it does on the map); colorHex is the
   *  engine's authored exhaust colour, 'none' for a reactionless drive. null = not burning. */
  setBurn(burn: { thrust01: number; braking: boolean; colorHex?: string } | null): void;
  setSize(w: number, h: number): void;
  dispose(): void;
}

const EDGE_THRESHOLD_DEG = 25; // reads as panel lines (design §5); below it, curvature stays clean

export type HullFinish = 'flat' | 'cel' | 'matcap' | 'blueprint' | 'plated' | 'patina' | 'iridescent';

// Seeded rng for the generated liveries: the same construct always wears the same panels and
// weathering, two ships sharing one hull each get their own - procedural variation is the whole
// point of "a handful of models covers many ships" (design §5).
function seededRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-project UVs onto non-indexed geometry: each triangle takes the two axes its face normal
 *  least points along, scaled by the bounding box. No authored UVs needed - which is the whole
 *  case, because a printing STL never has any. */
function boxProjectUVs(geo: THREE.BufferGeometry, tiles = 3): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3().subVectors(bb.max, bb.min);
  const inv = new THREE.Vector3(1 / Math.max(1e-9, size.x), 1 / Math.max(1e-9, size.y), 1 / Math.max(1e-9, size.z));
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos as THREE.BufferAttribute, t);
    b.fromBufferAttribute(pos as THREE.BufferAttribute, t + 1);
    c.fromBufferAttribute(pos as THREE.BufferAttribute, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u2: number, v2: number;
      if (ax >= ay && ax >= az) { u2 = (v.y - bb.min.y) * inv.y; v2 = (v.z - bb.min.z) * inv.z; }
      else if (ay >= az) { u2 = (v.x - bb.min.x) * inv.x; v2 = (v.z - bb.min.z) * inv.z; }
      else { u2 = (v.x - bb.min.x) * inv.x; v2 = (v.y - bb.min.y) * inv.y; }
      uv[(t + k) * 2] = u2 * tiles;
      uv[(t + k) * 2 + 1] = v2 * tiles;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// The liveries' CONTRAST ACCENT is DERIVED from the base colour, not authored (owner decision
// 2026-08-04: no second slider) - a seeded rotation into the complementary range at moderated
// saturation, so it always contrasts and never clashes, and the GM still touches ONE colour.
// If control is ever wanted, the lever is pack DATA (an accent palette), not another slider.
function accentFrom(tint: string, rnd: () => number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(tint.trim());
  if (!m) return '#d8642f';
  const v = parseInt(m[1], 16);
  let r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d > 0) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  // Complementary-ish rotation (150-210 deg, seeded), workable saturation and lightness even
  // when the base is grey or near-black - a grey hull still earns a coloured accent.
  h = (h + 150 + rnd() * 60) % 360;
  sat = Math.max(0.45, Math.min(0.75, sat < 0.15 ? 0.55 : sat));
  const lit = Math.max(0.35, Math.min(0.6, l < 0.2 || l > 0.85 ? 0.48 : l));
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = lit - c / 2;
  const [r2, g2, b2] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round((n + mm) * 255).toString(16).padStart(2, '0');
  return `#${to(r2)}${to(g2)}${to(b2)}`;
}

/** PLATED: a seeded hull-plating sheet - panel rectangles with seams, tonal variation, a few
 *  accent panels and vents - painted in shades of the ship's own colour with a DERIVED
 *  contrast accent for the marked panels and the livery stripe. */
function makePlatedTexture(tint: string, seed: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  const rnd = seededRng(seed + '|plated');
  const accent = accentFrom(tint, rnd);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  // Panel grid: uneven columns/rows, subdivided; each panel gets a tonal nudge, some get accents.
  const cols = 5 + Math.floor(rnd() * 4);
  const xs = [0]; for (let i = 1; i < cols; i++) xs.push(xs[i - 1] + (size - xs[i - 1]) * (0.5 + rnd() * 0.4) / (cols - i + 1));
  xs.push(size);
  for (let ci = 0; ci < xs.length - 1; ci++) {
    let y = 0;
    while (y < size) {
      const h = size * (0.06 + rnd() * 0.18);
      const shadeF = (rnd() - 0.5) * 0.3;
      ctx.fillStyle = shade(tint, shadeF);
      ctx.fillRect(xs[ci], y, xs[ci + 1] - xs[ci], h);
      if (rnd() < 0.1) { // accent panel - the DERIVED contrast hue, not just a tonal nudge
        ctx.fillStyle = rnd() < 0.7 ? accent : shade(accent, -0.35);
        ctx.fillRect(xs[ci] + 2, y + 2, (xs[ci + 1] - xs[ci]) * (0.3 + rnd() * 0.4), h - 4);
      }
      if (rnd() < 0.12) { // vent slats
        ctx.strokeStyle = shade(tint, -0.7);
        ctx.lineWidth = 2;
        const vx = xs[ci] + (xs[ci + 1] - xs[ci]) * 0.2, vw = (xs[ci + 1] - xs[ci]) * 0.5;
        for (let s = 0; s < 4; s++) { ctx.beginPath(); ctx.moveTo(vx, y + h * (0.25 + s * 0.15)); ctx.lineTo(vx + vw, y + h * (0.25 + s * 0.15)); ctx.stroke(); }
      }
      // seam
      ctx.strokeStyle = shade(tint, -0.55);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xs[ci] + 0.5, y + 0.5, xs[ci + 1] - xs[ci] - 1, h - 1);
      y += h;
    }
  }
  // One livery stripe in the accent, the mark that reads as OWNERSHIP at a glance - sometimes
  // double, occasionally absent (rnd keeps it per-ship).
  if (rnd() < 0.8) {
    const sy = size * (0.15 + rnd() * 0.7);
    const sh = size * (0.02 + rnd() * 0.04);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = accent;
    ctx.fillRect(0, sy, size, sh);
    if (rnd() < 0.4) ctx.fillRect(0, sy + sh * 1.8, size, sh * 0.45);
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** PATINA: the ship's colour weathered - streaks, scorch, and oxidation blooming toward the
 *  DERIVED accent hue (verdigris on a copper hull, rust on a blue one). */
function makePatinaTexture(tint: string, seed: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  const rnd = seededRng(seed + '|patina');
  const accent = accentFrom(tint, rnd);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) { // oxidation splotches - a third bloom in the accent, the rest char
    const r = 8 + rnd() * 60;
    const g = ctx.createRadialGradient(rnd() * size, rnd() * size, 1, rnd() * size, rnd() * size, r);
    const dark = rnd() < 0.35 ? shade(accent, -(0.1 + rnd() * 0.3)) : shade(tint, -(0.2 + rnd() * 0.5));
    g.addColorStop(0, dark + '');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.12 + rnd() * 0.22;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalAlpha = 0.18; // streaking, pulled one way like re-entry heating
  for (let i = 0; i < 40; i++) {
    const y = rnd() * size, len = 30 + rnd() * 160;
    ctx.strokeStyle = shade(tint, rnd() < 0.7 ? -0.45 : 0.3);
    ctx.lineWidth = 1 + rnd() * 3;
    ctx.beginPath(); ctx.moveTo(rnd() * size, y); ctx.lineTo(rnd() * size * 0.2 + len, y + (rnd() - 0.5) * 8); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft radial glow sprite for the plume - local to the viewer so it takes no dependency on
// holo/bodyFeatures (another workstream's module).
let viewerGlow: THREE.Texture | null = null;
function makeViewerGlow(): THREE.Texture | null {
  if (viewerGlow) return viewerGlow;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  viewerGlow = new THREE.CanvasTexture(cnv);
  return viewerGlow;
}

// Cel ramp: a four-step grey gradient the toon material quantises lighting against. Generated,
// not an asset - the whole §5 menu is procedural by design.
let celRamp: THREE.DataTexture | null = null;
function getCelRamp(): THREE.DataTexture {
  if (celRamp) return celRamp;
  const data = new Uint8Array([70, 130, 195, 255]);
  celRamp = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  celRamp.minFilter = celRamp.magFilter = THREE.NearestFilter;
  celRamp.needsUpdate = true;
  return celRamp;
}

// Matcap: a lit-sphere gradient painted on a small canvas, tinted toward the hull colour - the
// sculpting-tool look, no scene lights needed. Falls back to null (flat finish) where 2D canvas
// is unavailable (tests).
const matcaps = new Map<string, THREE.Texture | null>();
function getMatcap(tint: string): THREE.Texture | null {
  if (matcaps.has(tint)) return matcaps.get(tint)!;
  let tex: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    const size = 256;
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = size;
    const ctx = cnv.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size * 0.5, size * 0.5, size * 0.62);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, shade(tint, 0.45));
      g.addColorStop(0.62, tint);
      g.addColorStop(1, shade(tint, -0.72));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      tex = new THREE.CanvasTexture(cnv);
      tex.colorSpace = THREE.SRGBColorSpace;
    }
  }
  matcaps.set(tint, tex);
  return tex;
}

/** Build the DISPLAY form of a parsed model: cloned, finished, centred, scaled to a unit long
 *  axis, and - when `orient` is given - baked to the convention (nose +Z, drive -Z). The ONE
 *  builder behind the modal preview, the info-block turntable and the holo scene's focused-ship
 *  display, so what the GM approves is what every surface renders.
 *  `finish` (design §5): 'flat' (default - faceted tint + panel lines), 'cel', 'matcap',
 *  'blueprint'. A chosen finish dresses ANY hull, authored materials included; no finish leaves
 *  a GLB's authored materials untouched and tints only material-less sources. */
export function buildDisplayModel(
  source: THREE.Object3D,
  opts: { hadMaterials: boolean; tintHex?: string | null; orient?: [number, number, number, number] | null; finish?: HullFinish | null; seed?: string }
): THREE.Group {
  const work = source.clone(true);
  const finish: HullFinish | null = opts.finish ?? (opts.hadMaterials ? null : 'flat');

  if (finish) {
    const tint = opts.tintHex || '#ffd24d';
    const seed = opts.seed || tint;
    const edgeDark = new THREE.LineBasicMaterial({ color: new THREE.Color(shade(tint, -0.55)), transparent: true, opacity: 0.55 });
    const edgeBright = new THREE.LineBasicMaterial({ color: new THREE.Color(shade(tint, 0.15)), transparent: true, opacity: 0.9 });
    const matcap = finish === 'matcap' ? getMatcap(tint) : null;
    const livery = finish === 'plated' ? makePlatedTexture(tint, seed) : finish === 'patina' ? makePatinaTexture(tint, seed) : null;
    const fill: THREE.Material =
      finish === 'cel' ? new THREE.MeshToonMaterial({ color: new THREE.Color(tint), gradientMap: getCelRamp() })
      : finish === 'matcap' && matcap ? new THREE.MeshMatcapMaterial({ matcap })
      : finish === 'blueprint' ? new THREE.MeshBasicMaterial({ color: new THREE.Color(shade(tint, -0.82)), transparent: true, opacity: 0.4 })
      : finish === 'plated' && livery ? new THREE.MeshStandardMaterial({ map: livery, flatShading: true, metalness: 0.3, roughness: 0.55 })
      : finish === 'patina' && livery ? new THREE.MeshStandardMaterial({ map: livery, flatShading: true, metalness: 0.5, roughness: 0.75 })
      : finish === 'iridescent' ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(shade(tint, -0.25)), metalness: 0.9, roughness: 0.28, iridescence: 1, iridescenceIOR: 1.6 })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), flatShading: true, metalness: 0.15, roughness: 0.62 });
    // Which finishes carry panel lines: flat and cel take the dark crease edges, blueprint IS its
    // bright edges over a ghost fill; the livery finishes paint their own seams and the smooth
    // metals (matcap, iridescent) take none.
    const edge = finish === 'blueprint' ? edgeBright : (finish === 'flat' || finish === 'cel') ? edgeDark : null;
    const needsFacets = finish === 'flat' || finish === 'cel' || finish === 'plated' || finish === 'patina';
    work.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      let geo = mesh.geometry as THREE.BufferGeometry;
      if (needsFacets) {
        if (geo.index) geo = geo.toNonIndexed();
        geo.computeVertexNormals(); // per-face after de-index: the faceted look
        mesh.geometry = geo;
      }
      // The livery finishes need UVs a printing mesh never has - box-project them from the shape.
      if (livery) boxProjectUVs(geo);
      mesh.material = fill;
      if (edge) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, EDGE_THRESHOLD_DEG), edge));
    });
  }

  // Normalise: centre on the bounding box, longest axis = 1 unit. The authored dimensionsM never
  // touch this - they ride the construct and matter only if a surface draws at world scale.
  const wrap = new THREE.Group();
  const box = new THREE.Box3().setFromObject(work);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    work.position.sub(centre);
    wrap.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 1e-9));
  }
  wrap.add(work);
  if (opts.orient) {
    // Bake the GM's alignment so consumers with no orient stage of their own (the scene) can
    // simply lookAt(velocity) and get engines-aft.
    const baked = new THREE.Group();
    wrap.quaternion.set(...opts.orient);
    baked.add(wrap);
    return baked;
  }
  return wrap;
}

export function createModelViewer(canvas: HTMLCanvasElement, opts: ModelViewerOptions = {}): ModelViewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  const scene = new THREE.Scene();
  if (opts.background) scene.background = new THREE.Color(opts.background);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  // Portrait lighting, world-fixed: as the turntable spins, the lit side sweeps - the same choice
  // BodyGraphic makes for a tidally-locked world, and it reads as a real object under a real lamp.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
  key.position.set(2.2, 2.6, 2.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  rim.position.set(-2.4, 1.2, -2.0);
  scene.add(rim);

  // spinGroup (turntable + drag) > orientGroup (the GM's 90-degree fix) > frame (centre + unit scale)
  const spinGroup = new THREE.Group();
  const orientGroup = new THREE.Group();
  const frame = new THREE.Group();
  orientGroup.add(frame);
  spinGroup.add(orientGroup);
  scene.add(spinGroup);

  if (opts.driveMarker) {
    // The alignment references live BESIDE orientGroup (both inside spinGroup): a view drag turns
    // ship and arrows together, an orientation fix turns the ship against them - which is the
    // whole exercise. ORANGE points out the REAR (where the main drive must face); GREEN points
    // the direction of travel, out past the nose. Labels live in the modal beside the preview.
    const aft = new THREE.ArrowHelper(DRIVE_AXIS, new THREE.Vector3(0, 0, -0.6), 0.4, 0xff8c3a, 0.16, 0.09);
    (aft.line.material as THREE.Material).transparent = true;
    (aft.line.material as THREE.Material).opacity = 0.9;
    spinGroup.add(aft);
    const fwd = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.6), 0.4, 0x4ade80, 0.16, 0.09);
    (fwd.line.material as THREE.Material).transparent = true;
    (fwd.line.material as THREE.Material).opacity = 0.9;
    spinGroup.add(fwd);
  }

  // The turntable's own drive plume: the same shape the map draws (a cone flaring aft from the
  // stern with a core glow and a soft bloom halo), so the GM's info block and the player's map
  // agree about what a burn looks like. Sits OUTSIDE the framing measurement on purpose - the
  // ship stays centred and the plume is free to run off the edge.
  const plume = new THREE.Group();
  const plumeCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 1, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  plumeCone.rotation.x = Math.PI / 2;
  plume.add(plumeCone);
  const plumeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeViewerGlow(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  plume.add(plumeGlow);
  const plumeHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeViewerGlow(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  plume.add(plumeHalo);
  plume.visible = false;
  orientGroup.add(plume); // rides the GM's orientation fix, like the hull it is attached to

  let frameRadius = 0.6; // the HULL's bounding radius, measured before the plume is lit
  let sternZ = -0.5;

  let disposed = false;
  let dragging = false;
  let yawVel = 0;
  let raf = 0;
  let lastT = 0;

  function frameCamera() {
    // Framed on the HULL's radius alone (measured at setObject, before the plume exists): the
    // ship sits centred and a little larger in the frame, and a long burn simply runs off the
    // edge rather than shrinking the thing you are looking at.
    const dist = (frameRadius / Math.sin((camera.fov * Math.PI) / 360)) * 0.98;
    camera.position.set(dist * 0.28, dist * 0.18, dist * 0.94);
    camera.lookAt(0, 0, 0);
  }

  function render(t: number) {
    if (disposed) return;
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    if (!dragging && opts.spin !== false) spinGroup.rotation.y += dt * 0.5;
    else if (Math.abs(yawVel) > 1e-4) { spinGroup.rotation.y += yawVel; yawVel *= 0.92; }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  }
  raf = requestAnimationFrame(render);

  // Drag to spin - a turntable, not an orbit: yaw only, matching how the holo's globe portrait feels.
  function onDown(e: PointerEvent) {
    if (!opts.interactive) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    const k = 0.008;
    spinGroup.rotation.y += e.movementX * k;
    yawVel = e.movementX * k * 0.6;
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function clearFrame() {
    for (const child of [...frame.children]) {
      frame.remove(child);
      child.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mat) => mat?.dispose());
        }
        const l = c as THREE.LineSegments;
        if ((l as any).isLineSegments) { l.geometry?.dispose(); (l.material as THREE.Material)?.dispose(); }
      });
    }
  }

  return {
    setObject(object, { hadMaterials, tintHex, finish, seed }) {
      clearFrame();
      // Orient is NOT baked here - the viewer owns a live orientGroup so the modal's buttons can
      // re-orient without rebuilding; the shared builder handles finish + normalisation.
      frame.scale.setScalar(1);
      const built = buildDisplayModel(object, { hadMaterials, tintHex, finish, seed });
      frame.add(built);
      frame.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(frame);
      frameRadius = box.isEmpty() ? 0.6 : Math.max(1e-6, box.getBoundingSphere(new THREE.Sphere()).radius);
      sternZ = box.isEmpty() ? -0.5 : box.min.z;
      plume.position.set(0, 0, sternZ);
      frameCamera();
    },
    setBurn(burn) {
      const t = burn && burn.colorHex !== 'none' ? Math.max(0, Math.min(1, burn.thrust01)) : 0;
      plume.visible = t > 0;
      if (t <= 0) return;
      const col = new THREE.Color(burn!.colorHex || '#bfe2ff');
      (plumeCone.material as THREE.MeshBasicMaterial).color.set(col);
      (plumeGlow.material as THREE.SpriteMaterial).color.set(col);
      (plumeHalo.material as THREE.SpriteMaterial).color.set(col);
      // Scaled to the HULL, so a big ship gets a proportionally big torch.
      const k = frameRadius * 2;
      const len = k * (0.3 + 2.6 * t * t + 0.5 * t);
      const wide = k * (0.55 + 1.1 * t);
      plumeCone.scale.set(wide, len, wide);
      plumeCone.position.z = -len / 2;
      (plumeCone.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.5 * t;
      plumeGlow.scale.setScalar(k * (0.14 + 0.4 * t));
      (plumeGlow.material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * t;
      plumeHalo.scale.setScalar(k * (0.3 + 2.2 * t * t));
      plumeHalo.position.z = -len * 0.35;
      (plumeHalo.material as THREE.SpriteMaterial).opacity = 0.1 + 0.4 * t * t;
    },
    setOrient(q) {
      orientGroup.quaternion.set(...(q ?? [0, 0, 0, 1]));
      frameCamera();
    },
    setSize(w, h) {
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      frameCamera();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      clearFrame();
      renderer.dispose();
    }
  };
}

// Imperative three.js controller for the holo (3D) Field Guide view. Kept as a plain module (no
// Svelte) so HoloView.svelte can `await import('./scene')` and three lands in its own lazy chunk,
// leaving the 2D app's bundle untouched. See docs/dev/v2.2-3d-design.md Part A.
//
// This is the first pass: a fading polar grid, a glow-billboard star, flat-colour body spheres
// positioned via the shared 3D propagator (so inclined orbits genuinely tilt out of the plane),
// and per-body orbit rings. Textured/lit spheroids, skins and labels arrive in later increments.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { propagateState3D } from '$lib/physics/orbits';
import { getNodeColor } from '$lib/rendering/colors';
import type { System } from '$lib/types';

// Our physics frame: orbital reference plane is z=0, in-plane axes x/y. The hologram sits on a
// table, so map that plane to three's ground (x, z) and send out-of-plane height to three's up (y).
function toScene(p: { x: number; y: number; z: number }, s: number, out: THREE.Vector3) {
  out.set(p.x * s, p.z * s, p.y * s);
}

const HOLO_TINT = 0x39c6ff; // cyan hologram chrome (skins wire in later)
const GRID_RADIUS = 12; // scene units the outermost data maps to
const ORBIT_SAMPLES = 96;

export interface HoloController {
  setSystem(system: System | null): void;
  setTime(ms: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

interface BodyVisual {
  id: string;
  mesh: THREE.Mesh;
  orbitPivot?: THREE.Group; // holds the orbit ring, repositioned to the host each frame
  hostId?: string;
}

export function createHoloScene(canvas: HTMLCanvasElement): HoloController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x05070c, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(0, GRID_RADIUS * 1.1, GRID_RADIUS * 1.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = GRID_RADIUS * 6;
  controls.minPolarAngle = Math.PI * 0.06; // don't go fully top-down
  controls.maxPolarAngle = Math.PI * 0.49; // or under the table

  // --- Static chrome: fading polar grid on the ground plane ---
  const grid = buildPolarGrid();
  scene.add(grid);

  // --- Dynamic content ---
  let currentSystem: System | null = null;
  let bodies: BodyVisual[] = [];
  let sceneScale = 1;
  let timeMs = 0;
  const contentGroup = new THREE.Group();
  scene.add(contentGroup);

  const glowTexture = makeGlowTexture();
  const tmp = new THREE.Vector3();

  function clearContent() {
    for (const b of bodies) {
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    contentGroup.clear();
    bodies = [];
  }

  function setSystem(system: System | null) {
    clearContent();
    currentSystem = system;
    if (!system) return;

    // Scale so the farthest body maps to ~GRID_RADIUS (linear for now; toytown compression next).
    const pos0 = computeWorldPositions3D(system, timeMs);
    let maxR = 0;
    for (const p of pos0.values()) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
    sceneScale = maxR > 0 ? GRID_RADIUS / maxR : 1;

    const nodesById = new Map(system.nodes.map((n) => [n.id, n]));

    for (const node of system.nodes as any[]) {
      if (node.kind === 'barycenter') continue;
      const isStar = node.roleHint === 'star' || (node.kind === 'body' && node.parentId === null);
      const colorHex = safeColor(node);

      let mesh: THREE.Mesh;
      if (isStar) {
        // Star = camera-facing additive glow billboard (the Solaris signature).
        const mat = new THREE.SpriteMaterial({ map: glowTexture, color: colorHex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.setScalar(2.4);
        mesh = sprite as unknown as THREE.Mesh;
      } else {
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        mesh = new THREE.Mesh(new THREE.SphereGeometry(bodyRadius(node), 20, 16), mat);
      }
      contentGroup.add(mesh);

      const v: BodyVisual = { id: node.id, mesh, hostId: node.parentId ?? undefined };

      // Orbit ring: sample one full period in the host-relative frame, so inclined orbits tilt.
      if (node.orbit && node.parentId) {
        const ring = buildOrbitRing(node, sceneScale, safeColor(nodesById.get(node.parentId) as any) ?? colorHex, colorHex);
        if (ring) {
          const pivot = new THREE.Group();
          pivot.add(ring);
          contentGroup.add(pivot);
          v.orbitPivot = pivot;
        }
      }
      bodies.push(v);
    }
    updatePositions();
  }

  function updatePositions() {
    if (!currentSystem) return;
    const positions = computeWorldPositions3D(currentSystem, timeMs);
    for (const b of bodies) {
      const p = positions.get(b.id);
      if (p) {
        toScene(p, sceneScale, tmp);
        b.mesh.position.copy(tmp);
      }
      if (b.orbitPivot && b.hostId) {
        const hp = positions.get(b.hostId);
        if (hp) {
          toScene(hp, sceneScale, tmp);
          b.orbitPivot.position.copy(tmp);
        }
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
  function loop() {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  function resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
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
    glowTexture.dispose();
    renderer.dispose();
  }

  return { setSystem, setTime, resize, dispose };
}

// ---- helpers ----

function safeColor(node: any): number {
  try {
    return new THREE.Color(getNodeColor(node)).getHex();
  } catch {
    return 0x9fb4c8;
  }
}

// A modest, non-physical size: stars are billboards, bodies get a small log-scaled sphere so a
// moon and a gas giant differ without the giant swamping the plot.
function bodyRadius(node: any): number {
  const km = node.physical_parameters?.radiusKm || node.radiusKm || 3000;
  return 0.14 + 0.10 * Math.max(0, Math.log10(km / 1000));
}

function buildOrbitRing(node: any, scale: number, hostColor: number, bodyColor: number): THREE.LineLoop | null {
  const orbit = node.orbit;
  const n = orbit.n_rad_per_s ?? Math.sqrt((orbit.hostMu || 0) / Math.pow((orbit.elements?.a_AU || 1) * 1.495978707e11, 3));
  if (!isFinite(n) || n === 0) return null;
  const period = Math.abs((2 * Math.PI) / n) * 1000; // ms
  const t0 = orbit.t0 || 0;
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < ORBIT_SAMPLES; i++) {
    const r = propagateState3D(node, t0 + (i / ORBIT_SAMPLES) * period).r;
    toScene(r, scale, v);
    pts.push(v.clone());
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: bodyColor, transparent: true, opacity: 0.5 });
  return new THREE.LineLoop(geo, mat);
}

function buildPolarGrid(): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Color(HOLO_TINT);
  // Concentric rings, dimming with radius (fades into the black background).
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
  // Radial spokes.
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
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

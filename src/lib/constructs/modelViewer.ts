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
  setObject(object: THREE.Object3D, opts: { hadMaterials: boolean; tintHex?: string | null }): void;
  setOrient(q: [number, number, number, number] | null): void;
  setSize(w: number, h: number): void;
  dispose(): void;
}

const EDGE_THRESHOLD_DEG = 25; // reads as panel lines (design §5); below it, curvature stays clean

/** Build the DISPLAY form of a parsed model: cloned, finished (flat-shaded tint + crease edges
 *  when the source had no materials), centred, scaled to a unit long axis, and - when `orient`
 *  is given - baked to the convention (nose +Z, drive -Z). The ONE builder behind the modal
 *  preview, the info-block turntable and the holo scene's focused-ship display, so what the GM
 *  approves is what every surface renders. */
export function buildDisplayModel(
  source: THREE.Object3D,
  opts: { hadMaterials: boolean; tintHex?: string | null; orient?: [number, number, number, number] | null }
): THREE.Group {
  const work = source.clone(true);

  if (!opts.hadMaterials) {
    // Material-less source (every STL, bare OBJ): flat-shaded fill in the ship's own colour
    // + crease edges. De-index for honest per-facet normals - flat shading IS the finish.
    const tint = opts.tintHex || '#ffd24d';
    const fill = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint), flatShading: true, metalness: 0.15, roughness: 0.62
    });
    const edge = new THREE.LineBasicMaterial({ color: new THREE.Color(shade(tint, -0.55)), transparent: true, opacity: 0.55 });
    work.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      let geo = mesh.geometry as THREE.BufferGeometry;
      if (geo.index) geo = geo.toNonIndexed();
      geo.computeVertexNormals(); // per-face after de-index: the faceted look
      mesh.geometry = geo;
      mesh.material = fill;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, EDGE_THRESHOLD_DEG), edge));
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
    // The alignment reference lives BESIDE orientGroup (both inside spinGroup): a view drag turns
    // ship and arrow together, an orientation fix turns the ship against the arrow - which is the
    // whole exercise: turn the ship until its engines face the arrow.
    const arrow = new THREE.ArrowHelper(DRIVE_AXIS, new THREE.Vector3(0, 0, -0.6), 0.4, 0xff8c3a, 0.16, 0.09);
    (arrow.line.material as THREE.Material).transparent = true;
    (arrow.line.material as THREE.Material).opacity = 0.9;
    spinGroup.add(arrow);
  }

  let disposed = false;
  let dragging = false;
  let yawVel = 0;
  let raf = 0;
  let lastT = 0;

  function frameCamera() {
    // Frame the bounding sphere of the oriented MODEL (not the drive marker) so a 90-degree fix
    // never clips but the arrow never pushes the ship smaller either.
    const box = new THREE.Box3().setFromObject(orientGroup);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.12;
    camera.position.set(sphere.center.x + dist * 0.28, sphere.center.y + dist * 0.18, sphere.center.z + dist * 0.94);
    camera.lookAt(sphere.center);
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
    setObject(object, { hadMaterials, tintHex }) {
      clearFrame();
      // Orient is NOT baked here - the viewer owns a live orientGroup so the modal's buttons can
      // re-orient without rebuilding; the shared builder handles finish + normalisation.
      frame.scale.setScalar(1);
      frame.add(buildDisplayModel(object, { hadMaterials, tintHex }));
      frameCamera();
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

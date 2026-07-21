// A single spinning body in 3D — the same holo/gallery rendering (deriveAppearance + planetTexture +
// bodyFeatures + auroras), just ONE body centred and auto-rotating, for the Guide document's "3D" body
// graphic. This REUSES the gallery's per-body builder rather than inventing another renderer; it is a
// trimmed clone of galleryScene.buildBody + its frame loop for a single node (no grid / labels / lensing).
import * as THREE from 'three';
import { getPlanetTextureEquirect, getEmissiveEquirect } from '$lib/rendering/planetTexture';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { buildAuroraShell } from './scene';
import {
  makeHotspotTexture, makePlumeTexture, makeGlowTexture,
  buildMagmaVents, buildCryoPlumes, buildSelfLumGlow, buildAtmoGlow, buildCloudDeck, updateMagma, updatePlumes,
  type EmissiveVisual
} from './bodyFeatures';

const R = 0.9; // rendered radius (scene units) — bigger than the gallery's 0.44 since it's one body

export function createBodyScene(canvas: HTMLCanvasElement, node: any, opts: { ringed?: boolean } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  camera.position.set(0, 0, 3.4);

  scene.add(new THREE.HemisphereLight(0xbfd0e6, 0x2a2f3c, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(0.4, 0.7, 1); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8f4, 0.55); fill.position.set(-0.3, 0.1, 0.8); scene.add(fill);

  const glowTexture = makeGlowTexture(), hotspotTexture = makeHotspotTexture(), plumeTexture = makePlumeTexture();
  const disposables: { dispose(): void }[] = [glowTexture, hotspotTexture, plumeTexture];

  const spinners: { obj: THREE.Object3D; rate: number }[] = [];
  const cloudSpinners: { obj: THREE.Object3D; drift: number }[] = [];
  const magmaVisuals: EmissiveVisual[] = [];
  const plumeVisuals: EmissiveVisual[] = [];
  const auroraVisuals: { mat: THREE.Material & { opacity: number }; base: number; seed: number }[] = [];
  const starVisuals: { corona: THREE.Sprite; baseScale: number; activity: number; seed: number }[] = [];

  const g = new THREE.Group();
  const isStar = node?.roleHint === 'star';
  const appear = deriveAppearance(node);

  if (isStar) {
    const col = new THREE.Color(node.apparentColorHex || '#ffddaa');
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshBasicMaterial({ color: col }));
    g.add(sphere);
    const coronaMat = new THREE.SpriteMaterial({ map: glowTexture, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
    const corona = new THREE.Sprite(coronaMat);
    const activity = node.flareActivity ?? 0.2;
    const baseScale = R * (3.2 + activity * 3);
    corona.scale.setScalar(baseScale); g.add(corona);
    spinners.push({ obj: sphere, rate: 0.25 });
    let ss = 0; for (const ch of String(node.id)) ss = (ss + ch.charCodeAt(0)) % 997;
    starVisuals.push({ corona, baseScale, activity, seed: ss / 997 });
  } else {
    const texCanvas = getPlanetTextureEquirect(node);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    if (texCanvas) { const t = new THREE.CanvasTexture(texCanvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); mat.map = t; }
    const emCanvas = getEmissiveEquirect(node);
    if (emCanvas) { const et = new THREE.CanvasTexture(emCanvas); et.colorSpace = THREE.SRGBColorSpace; et.anisotropy = renderer.capabilities.getMaxAnisotropy(); mat.emissiveMap = et; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.15; }
    else mat.color.set(node.apparentColorHex || '#8a8f99');
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat);
    const polF = appear.oblatePolarFactor;
    if (polF < 0.999) sphere.scale.set(1, polF, 1);
    if (appear.cryoPlumes) sphere.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
    else if (appear.polarVortex) sphere.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.95);
    else sphere.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (appear.axialTiltDeg * Math.PI) / 180);
    g.add(sphere);
    spinners.push({ obj: sphere, rate: 0.35 });

    if (appear.magma) { const b = buildMagmaVents(R, appear.magma, node.id, hotspotTexture); sphere.add(b.group); magmaVisuals.push(...b.visuals); }
    if (appear.cryoPlumes) { const b = buildCryoPlumes(R, appear.cryoPlumes, node.id, plumeTexture); sphere.add(b.group); plumeVisuals.push(...b.visuals); }
    if (appear.selfLumGlow) g.add(buildSelfLumGlow(R, appear.selfLumGlow.colorHex, glowTexture));
    if (appear.atmGlow) g.add(buildAtmoGlow(R, appear.atmGlow.colorHex, appear.atmGlow.strength));
    if (appear.clouds) {
      let cseed = 0; for (const ch of String(node.id)) cseed = (cseed + ch.charCodeAt(0) * 7) % 2147483647;
      const cl = buildCloudDeck(R, appear.clouds.colorHex, appear.clouds.colorHex2, appear.clouds.coverage, cseed || 1, appear.clouds.giant);
      sphere.add(cl.group);
      for (const l of cl.layers) cloudSpinners.push({ obj: l.mesh, drift: l.drift });
    }
    if (appear.aurora) {
      const ems = appear.aurora.emitters.length ? appear.aurora.emitters : [{ colorHex: appear.aurora.coreHex, weight: 1, altitude: 1 }];
      let seed = 0; for (const ch of String(node.id)) seed = (seed + ch.charCodeAt(0)) % 997;
      ems.forEach((e, i) => {
        const built = buildAuroraShell(R, e.colorHex, appear.aurora!.strength, e.weight / ems[0].weight, e.altitude);
        sphere.add(built.shell);
        auroraVisuals.push({ mat: built.mat, base: built.base, seed: (seed / 997 + i * 0.31) % 1 });
      });
    }
    if (opts.ringed ?? node.ringed) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.35, R * 2.15, 64), new THREE.MeshBasicMaterial({ color: 0xcdd6e2, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
      ring.rotation.x = Math.PI * 0.46; g.add(ring);
    }
  }
  scene.add(g);

  let vpW = 1, vpH = 1;
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    vpW = w; vpH = h; renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  let raf = 0, disposed = false; const clock = { t: 0 };
  const _q = new THREE.Quaternion(); const _yAxis = new THREE.Vector3(0, 1, 0);
  function frame() {
    if (disposed) return;
    clock.t += 0.016;
    for (const s of spinners) { _q.setFromAxisAngle(_yAxis, 0.016 * s.rate); s.obj.quaternion.multiply(_q); }
    for (const c of cloudSpinners) c.obj.rotation.y = clock.t * c.drift;
    for (const s of starVisuals) {
      const t = clock.t, a = s.activity;
      const flick = 0.5 + 0.5 * (0.6 * Math.sin(t * (2 + a * 5) + s.seed * 6.283) + 0.4 * Math.sin(t * (5 + a * 9) + s.seed * 12.57));
      s.corona.scale.setScalar(s.baseScale * (1 + a * 0.45 * flick));
      (s.corona.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.9 * (1 - a * 0.35 + a * 0.6 * flick));
    }
    updateMagma(magmaVisuals, clock.t); updatePlumes(plumeVisuals, clock.t);
    for (const a of auroraVisuals) {
      const swell = 0.5 + 0.5 * Math.sin(clock.t * 0.45 + a.seed * 6.283);
      const s = 0.5 + 0.5 * Math.sin(clock.t * 2.6 + a.seed * 6.283);
      a.mat.opacity = a.base * (0.08 + 0.92 * swell) * (0.6 + 0.4 * s);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      for (const d of disposables) d.dispose();
      scene.traverse((o: any) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((mm: any) => { mm.map?.dispose?.(); mm.dispose?.(); }); });
      renderer.dispose();
    }
  };
}

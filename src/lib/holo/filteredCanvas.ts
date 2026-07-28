// A minimal GPU-filtered surface: draws ONE static canvas (e.g. the cover, pre-rendered) as a
// full-screen quad and runs it through the SAME shader filter chain as the holo, so a DOM-free screen
// (the cover) warps / picture-rolls / tints for real instead of a CSS approximation. Plain module so
// three code-splits into its own chunk (loaded only when a filtered cover is shown). See HoloView/scene.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { filterRegistry } from './filters/FilterRegistry';
import { buildShaderObject, updateUniforms } from './filters/shaderMaterial';
import type { FilterParamValues } from './filters/schema';

export interface FilteredCanvasController {
  setSource(src: HTMLCanvasElement): void;
  setFilter(id: string, params?: FilterParamValues): void;
  // Forward-map a screen-space uv (y-up, 0..1) through the SAME barrel/roll/skew the shader applies,
  // giving the SOURCE uv the eye sees there — so a tap on a warped, rolling list still hits the right row.
  warpPoint(su: number, sv: number): [number, number];
  resize(w: number, h: number): void;
  dispose(): void;
}

export function createFilteredCanvas(canvas: HTMLCanvasElement): FilteredCanvasController {
  // preserveDrawingBuffer keeps the last frame readable so a transition can snapshot this canvas
  // (createImageBitmap) for its "before" state — see TransitionEngine. Cheap here: these are static,
  // low-fps surfaces (cover / list / document), not a hot render loop.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1); // fills the view with a 1×1 quad
  const mat = new THREE.MeshBasicMaterial({ transparent: true });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  scene.add(quad);
  let srcTex: THREE.CanvasTexture | null = null;

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

  function setSource(src: HTMLCanvasElement) {
    if (srcTex && (srcTex.image as HTMLCanvasElement) === src) { srcTex.needsUpdate = true; return; }
    srcTex?.dispose();
    srcTex = new THREE.CanvasTexture(src);
    srcTex.colorSpace = THREE.SRGBColorSpace;
    mat.map = srcTex;
    mat.needsUpdate = true;
  }
  function setFilter(id: string, params?: FilterParamValues) {
    const nextId = id || 'none', next = params || {};
    if (nextId === filterId && filterPass) {
      filterParams = next; const def = filterRegistry.get(filterId);
      if (def) updateUniforms(filterPass.uniforms, def, { ...filterRegistry.defaultParams(filterId), ...next });
      return;
    }
    if (nextId === filterId && filterId === 'none') return;
    filterId = nextId; filterParams = next; rebuildFilter();
  }
  function warpPoint(su: number, sv: number): [number, number] {
    if (!filterPass) return [su, sv];
    const U = filterPass.uniforms as any;
    const warp = U.uCrtWarp?.value ?? 0, roll = U.uPictureRoll?.value ?? 0, skew = U.uSkew?.value ?? 0, t = U.time?.value ?? 0;
    if (!warp && !roll && !skew) return [su, sv];
    const cx = su * 2 - 1, cy = sv * 2 - 1, d = cx * cx + cy * cy;
    let u = (cx * (1 + warp * d) + 1) / 2;
    let v = (cy * (1 + warp * d) + 1) / 2;
    v = v + t * roll; v -= Math.floor(v); // fract(v + time*roll)
    u += (v - 0.5) * skew;
    return [u, v];
  }
  function resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    filterRes.set(w, h);
  }

  let raf = 0, disposed = false;
  function loop() {
    if (disposed) return;
    if (filterPass) { filterPass.uniforms.time.value = clock.getElapsedTime(); composer.render(); }
    else renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  function dispose() {
    disposed = true; cancelAnimationFrame(raf);
    srcTex?.dispose();
    quad.geometry.dispose(); mat.dispose();
    if (filterPass) (filterPass.material as THREE.Material).dispose();
    composer.dispose(); renderer.dispose();
  }

  return { setSource, setFilter, warpPoint, resize, dispose };
}

/**
 * Floating origin for the holo scene — the radial compression, and the rebase that follows it.
 *
 * WHY THIS IS A SEPARATE MODULE. The scene's `positionToScene` lives inside the scene closure, so its
 * arithmetic could not be reached from a test. The numbers here are the whole of A19: at TRUE scale the
 * compression is linear, so a body 40 AU out lands at scene coordinate 12, and a float32 vertex buffer at
 * magnitude 12 quantises to 2^-20 = 9.5e-7 scene units. A Pluto-sized world is 2.4e-6 across and its moon
 * orbits 4e-5 away, i.e. a couple of ULP and about forty ULP — so the orbit line is quantised to ~40 steps
 * per axis and re-rounds on every camera nudge, which is the reported vibration. Rebasing on the focus puts
 * those same coordinates near zero, where the ULP is ~3.6e-12.
 *
 * ORDER MATTERS. `compressRadius` is a RADIAL, nonlinear map, so a translation does not commute with it:
 * compressing a rebased position is NOT the same picture as rebasing a compressed one. The rebase is a
 * pure translation of the RENDERED space and therefore has to come second. `rebaseDoesNotCommute` in the
 * spec pins that down so nobody swaps the two and gets something that looks almost right.
 *
 * Nothing here touches physics or the classifier: the propagated positions are the input, unchanged. This
 * module only decides the FRAME they are drawn in.
 */

export interface RadialMap {
  gridRadius: number; // scene units the outermost body maps to
  rMax: number; // largest heliocentric distance in the system (AU) — the compression normaliser
  r0Au: number; // log-compression softening radius
  compression: number; // 0 = linear (honest distances) .. 1 = log (toytown spread)
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Radial compression: blend a linear map (r -> gridRadius·r/rMax) with a log map, by `compression`.
 * At compression 0 this is exactly linear — which is the regime A19 lives in.
 */
export function compressRadius(r: number, m: RadialMap): number {
  if (r <= 0) return 0;
  const lin = (m.gridRadius * r) / m.rMax;
  const log = (m.gridRadius * Math.log10(1 + r / m.r0Au)) / Math.log10(1 + m.rMax / m.r0Au);
  return lin * (1 - m.compression) + log * m.compression;
}

/**
 * Physics frame (reference plane z=0, in-plane x/y) -> three's ground (x,z) with out-of-plane height on
 * three's up (y), applying the radial compression in AU space first. This is the ABSOLUTE scene frame:
 * the system's centre of mass sits at (0,0,0).
 */
export function toSceneAbsolute<T extends Vec3>(p: Vec3, m: RadialMap, out: T): T {
  const r = Math.hypot(p.x, p.y, p.z);
  const k = r > 1e-12 ? compressRadius(r, m) / r : 0;
  out.x = p.x * k;
  out.y = p.z * k;
  out.z = p.y * k;
  return out;
}

/**
 * The same conversion, then rebased: compression FIRST, then a pure translation by the origin's own
 * COMPRESSED scene position. Every absolute->scene conversion in the holo goes through this.
 */
export function toSceneRebased<T extends Vec3>(p: Vec3, m: RadialMap, origin: Vec3, out: T): T {
  toSceneAbsolute(p, m, out);
  out.x -= origin.x;
  out.y -= origin.y;
  out.z -= origin.z;
  return out;
}

/** The gap between neighbouring float32 values at |x| — the smallest difference a vertex buffer can hold. */
export function ulp32(x: number): number {
  const a = Math.abs(Math.fround(x));
  if (!(a > 0) || !isFinite(a)) return Math.pow(2, -149); // zero / denormal / NaN: the smallest step there is
  const e = Math.floor(Math.log2(a));
  return Math.max(Math.pow(2, -149), Math.pow(2, e - 23));
}

/**
 * A model of what the GPU actually computes for a vertex held in a STATIC buffer.
 *
 * `gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0)`. The vertex arrives as float32
 * (the buffer) and the modelView translation arrives as float32 (the uniform), and the shader adds them in
 * float32. When both are large and nearly opposite — a vertex at scene 12 seen by a camera at scene 12 —
 * the sum is a cancellation between two numbers that were each already rounded, so the result carries the
 * full absolute error of the operands however small the true answer is. Every camera nudge re-rounds the
 * uniform, which is why the line VIBRATES rather than merely sitting in the wrong place.
 *
 * Only the translation is modelled. The rotation entries are order 1, where float32 is good to 6e-8
 * RELATIVE, and they multiply the local (already small) coordinates — so they are not where the error
 * comes from. Used by the spec to measure the fix; the renderer does not call it.
 */
export function renderedCameraOffset<T extends Vec3>(vertex: Vec3, camera: Vec3, out: T): T {
  out.x = Math.fround(Math.fround(vertex.x) - Math.fround(camera.x));
  out.y = Math.fround(Math.fround(vertex.y) - Math.fround(camera.y));
  out.z = Math.fround(Math.fround(vertex.z) - Math.fround(camera.z));
  return out;
}

/**
 * How far the GPU's answer for `vertex - camera` lands from the exact one, with the whole scene rebased on
 * `origin`. This is the number A19 is about: it must be small against the features being drawn.
 */
export function renderErrorAt(vertex: Vec3, camera: Vec3, origin: Vec3): number {
  const got = renderedCameraOffset(
    { x: vertex.x - origin.x, y: vertex.y - origin.y, z: vertex.z - origin.z },
    { x: camera.x - origin.x, y: camera.y - origin.y, z: camera.z - origin.z },
    { x: 0, y: 0, z: 0 }
  );
  return Math.hypot(got.x - (vertex.x - camera.x), got.y - (vertex.y - camera.y), got.z - (vertex.z - camera.z));
}

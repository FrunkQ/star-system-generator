// src/lib/holo/filters/warpPick.ts
// WHERE THE EYE SEES A PIXEL, WHEN A FILTER HAS BENT THE PICTURE.
//
// A distorting preset (barrel warp, picture roll, skew) is a POST pass: the scene is rendered flat
// and the shader then samples it through a distortion. So the thing under the cursor is not at the
// cursor's own uv - it is at the uv the shader SAMPLED to paint that pixel. Every surface that lets
// a player tap something has to apply the same forward map before it hits-tests, or the tap lands
// where the picture used to be.
//
// THIS IS THE ONE COPY. It was two - `filteredCanvas.ts` and `holo/scene.ts` each carried the same
// eight lines, and the size comparison would have made a third (the standing rule: prefer removing
// a copy over syncing it). Pure, so it can be gated without a GL context, which neither copy could.

/** The three distortions that move a pixel, plus the clock the roll runs on. */
export interface WarpParams {
  /** Barrel coefficient: the shader's `uCrtWarp`. Zero is a flat picture. */
  warp: number;
  /** Vertical picture roll per second: the shader's `uPictureRoll`. */
  roll: number;
  /** Horizontal shear with height: the shader's `uSkew`. */
  skew: number;
  /** The shader's `time` uniform, in seconds - the roll's phase. */
  time: number;
}

export const NO_WARP: WarpParams = { warp: 0, roll: 0, skew: 0, time: 0 };

/**
 * Read the four values off a live `ShaderPass`'s uniforms. A filter that has none of them (most of
 * them: tint, scanlines, vignette) reads as zeros and `warpUv` then returns the point untouched.
 */
export function warpParamsOfUniforms(uniforms: Record<string, { value?: unknown }> | null | undefined): WarpParams {
  const num = (k: string) => {
    const v = uniforms?.[k]?.value;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  return { warp: num('uCrtWarp'), roll: num('uPictureRoll'), skew: num('uSkew'), time: num('time') };
}

/**
 * Screen uv (y-UP, 0..1) -> the SOURCE uv the shader sampled to paint it.
 *
 * The order is the shader's own and it is not commutative: barrel first about the centre, then the
 * roll (a wrap, hence the fract), then the skew, which reads the ROLLED v. Getting the order wrong
 * is invisible on a still frame and wrong by a whole screen height mid-roll.
 *
 * A point with no distortion at all returns exactly as it came in - the identity matters, because
 * every unfiltered surface takes this path too and a tap on a GM's own view must not move by an
 * epsilon.
 */
export function warpUv(su: number, sv: number, p: WarpParams): [number, number] {
  if (!p.warp && !p.roll && !p.skew) return [su, sv];
  const cx = su * 2 - 1, cy = sv * 2 - 1, d = cx * cx + cy * cy;
  let u = (cx * (1 + p.warp * d) + 1) / 2;
  let v = (cy * (1 + p.warp * d) + 1) / 2;
  v = v + p.time * p.roll; v -= Math.floor(v);   // fract(v + time*roll)
  u += (v - 0.5) * p.skew;
  return [u, v];
}

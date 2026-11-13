// CSS approximation of the GPU filters for DOM-rendered surfaces (interactive system view, info
// panels — and interim cover/starmap until their true-GLSL capture path lands). Driven by the SAME
// filterParams as the shaders so one preset reads consistently. Not pixel-identical: barrel warp and
// the signal-artifact effects have no cheap CSS analogue and are skipped.
import type { FilterParamValues } from '$lib/holo/filters/schema';

export interface CssFilterApprox {
  containerFilter: string; // CSS `filter:` for the wrapped content
  tint: string | null;     // phosphor/tint colour laid over via mix-blend `color`
  tintOpacity: number;
  scanlineIntensity: number; // 0..1 → overlay opacity
  scanlineWidth: number;     // px period
  vignette: number;          // 0..1 → inset shadow strength
  rounded: number;           // border-radius px
}

const NONE: CssFilterApprox = { containerFilter: 'none', tint: null, tintOpacity: 0, scanlineIntensity: 0, scanlineWidth: 3, vignette: 0, rounded: 0 };

export function cssFilterApprox(filterId: string, params: FilterParamValues = {}): CssFilterApprox {
  const n = (k: string, d: number) => (typeof params[k] === 'number' ? (params[k] as number) : d);
  const b = (k: string, d: boolean) => (typeof params[k] === 'boolean' ? (params[k] as boolean) : d);
  if (filterId === 'crt') {
    const parts = [`brightness(${n('brightness', 1)})`, `contrast(${n('contrast', 1.2)})`];
    if (b('invertColors', false)) parts.push('invert(1)');
    return {
      containerFilter: parts.join(' '),
      tint: (params.phosphor as string) || '#4dff88',
      tintOpacity: n('tint', 0.8),
      scanlineIntensity: n('scanlineIntensity', 0.4),
      scanlineWidth: Math.max(2, n('scanlineThickness', 3)),
      vignette: n('vignetteAmount', 0.5),
      rounded: n('roundedCorners', 0.05) * 300
    };
  }
  if (filterId === 'night_vision') {
    return { ...NONE, containerFilter: `brightness(${n('brightness', 1.2)}) contrast(1.15)`, tint: '#3dff70', tintOpacity: 0.85, scanlineIntensity: 0.12, vignette: 0.8 };
  }
  if (filterId === 'thermal') {
    return { ...NONE, containerFilter: 'saturate(2.4) hue-rotate(-30deg) contrast(1.3)', tint: null, tintOpacity: 0, vignette: 0.3 };
  }
  return NONE;
}

// THE TINT FOR A TRANSPARENT GRAPHIC (an overlay logo or frame laid over a surface that already
// carries the filter). The whole-surface tint above is a solid colour under `mix-blend-mode: color`,
// which only colours what is BENEATH it: over a mostly-empty overlay layer in its own stacking
// context there is nothing beneath, the blend falls back to plain source-over, and the phosphor
// paints the whole stage. A colour matrix is the same blend applied per PIXEL instead, so it can
// only ever touch pixels the graphic itself owns - the alpha row is the identity.
// The maths is the W3C `color` blend, B = Cs + (Lum(Cb) - Lum(Cs)), mixed in at `opacity`.
// Returns the twenty `values` of an feColorMatrix (rows R, G, B, A; sRGB, not linearRGB).
export function graphicTintMatrix(tintHex: string, opacity: number): number[] {
  const k = Math.max(0, Math.min(1, opacity));
  const m = /^#?([0-9a-f]{6})$/i.exec(tintHex.trim());
  const v = m ? parseInt(m[1], 16) : 0xffffff;
  const cs = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  const LUM = [0.3, 0.59, 0.11];
  const lumCs = cs[0] * LUM[0] + cs[1] * LUM[1] + cs[2] * LUM[2];
  const out: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) out.push((row === col ? 1 - k : 0) + k * LUM[col]);
    out.push(0, k * (cs[row] - lumCs) + 0); // + 0: a zero offset is 0, never -0
  }
  out.push(0, 0, 0, 1, 0);
  return out;
}

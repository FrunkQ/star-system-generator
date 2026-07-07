import { writable } from 'svelte/store';

// Tunable CRT controls for the Monochrome Terminal skin — a CSS reimplementation of the Mappadux
// "retro_sci_fi" WebGL filter (the catalogue is DOM/SVG, not a render target, so the GPU-only
// effects — barrel warp, chromatic aberration, ghosting — are omitted; the rest map to CSS).
// The green tint is dropped: the skin already carries the GM's chosen --mono colour. Inversion is
// kept (it's genuinely useful). Effects split: brightness/contrast/invert/skew/roll/corners apply
// to the screen content; scanlines/vignette/noise/noiseBar/flicker are overlay layers.
export interface CrtControls {
  brightness: number;
  contrast: number;
  invert: boolean;
  scanlineIntensity: number;
  scanlineWidth: number;     // px
  vignette: number;
  roundedCorners: number;    // fraction of the smaller screen dimension
  skew: number;              // radians-ish, used as a small skew
  pictureRoll: number;       // roll speed (0 = off)
  noiseBarWidth: number;     // % of height
  noiseBarSpeed: number;
  interference: number;      // white-noise opacity
  flicker: number;           // brightness-flicker amount
}

export const CRT_DEFAULTS: CrtControls = {
  brightness: 1.0,
  contrast: 1.2,
  invert: false,
  scanlineIntensity: 0.4,
  scanlineWidth: 3,
  vignette: 0.5,
  roundedCorners: 0.05,
  skew: 0,
  pictureRoll: 0,
  noiseBarWidth: 0,
  noiseBarSpeed: 0,
  interference: 0,
  flicker: 0
};

// Slider/toggle metadata, grouped for the controls popup (mirrors the reference filter's groups).
export interface CrtParamDef {
  id: keyof CrtControls;
  label: string;
  group: 'Display' | 'CRT' | 'Distortion' | 'Signal';
  type?: 'slider' | 'toggle';
  min?: number; max?: number; step?: number;
}
export const CRT_PARAM_DEFS: CrtParamDef[] = [
  { id: 'brightness',        label: 'Brightness',      group: 'Display', min: 0.3,  max: 2,    step: 0.05 },
  { id: 'contrast',          label: 'Contrast',        group: 'Display', min: 0.5,  max: 3,    step: 0.05 },
  { id: 'invert',            label: 'Invert',          group: 'Display', type: 'toggle' },
  { id: 'scanlineIntensity', label: 'Scanlines',       group: 'CRT',     min: 0,    max: 1,    step: 0.01 },
  { id: 'scanlineWidth',     label: 'Scanline Width',  group: 'CRT',     min: 2,    max: 8,    step: 0.5 },
  { id: 'vignette',          label: 'Vignette',        group: 'CRT',     min: 0,    max: 1.5,  step: 0.05 },
  { id: 'roundedCorners',    label: 'Rounded Corners', group: 'CRT',     min: 0,    max: 0.15, step: 0.005 },
  { id: 'skew',              label: 'Picture Skew',    group: 'Distortion', min: -0.3, max: 0.3, step: 0.01 },
  { id: 'noiseBarWidth',     label: 'Noise Bar %',     group: 'Signal',  min: 0,    max: 20,   step: 0.5 },
  { id: 'noiseBarSpeed',     label: 'Noise Bar Speed', group: 'Signal',  min: -1,   max: 1,    step: 0.05 },
  { id: 'interference',      label: 'White Noise',     group: 'Signal',  min: 0,    max: 1,    step: 0.01 },
  { id: 'flicker',           label: 'Flicker',         group: 'Signal',  min: 0,    max: 0.4,  step: 0.01 }
];

const KEY = 'catalogue-crt-controls';

function load(): CrtControls {
  if (typeof localStorage === 'undefined') return { ...CRT_DEFAULTS };
  try {
    return { ...CRT_DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<CrtControls>) };
  } catch {
    return { ...CRT_DEFAULTS };
  }
}

export const crtControls = writable<CrtControls>(load());

if (typeof window !== 'undefined') {
  crtControls.subscribe((v) => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
  });
}

export function resetCrtControls() {
  crtControls.set({ ...CRT_DEFAULTS });
}

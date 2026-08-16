// A CHART VOCABULARY, not a chart. One scale implementation shared by every diagram the physics
// pages draw, so two plots of the same quantity cannot disagree about where a value sits.
//
// TWO RULES GOVERN EVERYTHING IN src/lib/charts (inbox G23):
//
//   A CHART IS A CONSUMER AND NEVER A DERIVATION. It reads values the engine already produced. The
//   moment a diagram recomputes what it draws it becomes a second authority on that quantity, which
//   is this codebase's most recurring fault — a spectrum plot that computed its own spectrum would
//   be the rival cloud model again, with a nicer interface.
//
//   SVG, NOT CANVAS. A canvas surface cannot be verified by a session that cannot see the screen —
//   not "screenshots are awkward", genuinely unverifiable (TAG-19/E7). An SVG chart can be read
//   back, asserted on and diffed, and it hands its numbers to assistive technology for free.

export interface PlotBox {
  width: number; height: number;
  padLeft: number; padRight: number; padTop: number; padBottom: number;
}

export const DEFAULT_BOX: PlotBox = {
  width: 720, height: 260, padLeft: 52, padRight: 14, padTop: 14, padBottom: 34
};

export interface Scale {
  /** Domain value → pixel. */
  (v: number): number;
  min: number;
  max: number;
}

function makeScale(min: number, max: number, lo: number, hi: number): Scale {
  const span = max - min || 1;
  const f = ((v: number) => lo + ((v - min) / span) * (hi - lo)) as Scale;
  f.min = min; f.max = max;
  return f;
}

export function xScale(box: PlotBox, min: number, max: number): Scale {
  return makeScale(min, max, box.padLeft, box.width - box.padRight);
}

/** Y is inverted: a bigger value sits HIGHER, which is the opposite of the pixel axis. */
export function yScale(box: PlotBox, min: number, max: number): Scale {
  return makeScale(min, max, box.height - box.padBottom, box.padTop);
}

/** Round, human-readable tick values across a domain — 4 to 6 of them, on a 1/2/5 step. */
export function ticks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

/** An SVG polyline `points` string from paired arrays. */
export function polyline(xs: number[], ys: number[], sx: Scale, sy: Scale): string {
  const n = Math.min(xs.length, ys.length);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(`${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`);
  return parts.join(' ');
}

/** A closed area path down to the baseline — the same series as `polyline`, filled. */
export function areaPath(xs: number[], ys: number[], sx: Scale, sy: Scale, baseline = 0): string {
  const n = Math.min(xs.length, ys.length);
  if (!n) return '';
  const y0 = sy(baseline).toFixed(1);
  let d = `M${sx(xs[0]).toFixed(1)},${y0}`;
  for (let i = 0; i < n; i++) d += ` L${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`;
  d += ` L${sx(xs[n - 1]).toFixed(1)},${y0} Z`;
  return d;
}

/** Largest value in a series, with a floor so an all-zero series still gets a sane axis. */
export function niceMax(values: number[], floor = 1e-9): number {
  const m = Math.max(...values, floor);
  const mag = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / mag) * mag;
}

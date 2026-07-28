import type { TransitionDefinition } from '../../schema';
import { animate, easeIn, easeOut } from '../../easing';

/**
 * Blood Splatter — three phases, three controls.
 *
 *   1. Lightning flashes  — two rapid white frames with a dark gap.
 *                           Skip with the toggle for non-horror uses
 *                           (e.g. a green-slime variant).
 *   2. Splatter fill      — coloured blots accumulate across a
 *                           dense grid; in the final stretch a
 *                           same-colour wash fades in so the screen
 *                           is FULLY filled with the chosen colour
 *                           before the wipe starts.
 *   3. Wibbly wipe        — a wavy liquid line descends down the
 *                           frame, revealing the new map above as
 *                           it falls. Glossy specular highlight
 *                           rides the wave so the line reads as a
 *                           liquid surface.
 *
 * Controls: Duration / Colour (full picker) / Lightning on-off.
 *
 * v2.14.82 — colour picker replaces the named-colour select; phase 2
 * guarantees full fill before the wipe; phase 3 swapped from drip-
 * edged to a wibbly liquid wave line.
 */

/** Fixed-seed pseudo-random: deterministic per integer seed, ~uniform
 *  in [0, 1). Used to jitter splatter positions + lobe placement. */
function srand(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Parse '#rrggbb' into {r, g, b}. Falls back to crimson on malformed
 *  input so the transition still runs visibly. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 140, g: 8, b: 12 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

interface Splatter {
  cx:     number;
  cy:     number;
  radius: number;
  lobes:  { dx: number; dy: number; r: number }[];
}

/** Build a dense overlapping grid of splatter positions sized so the
 *  union ALWAYS covers the full frame at maximum growth. Cell radius
 *  is 90% of the cell diagonal so even with jitter the splatters
 *  overlap their neighbours. */
function buildSplatters(w: number, h: number): Splatter[] {
  const aspect = w / h;
  const cols = Math.max(8, Math.round(12 * Math.sqrt(aspect)));
  const rows = Math.max(6, Math.round(12 / Math.sqrt(aspect)));
  const cellW = w / cols;
  const cellH = h / rows;
  // 90% of the cell DIAGONAL gives generous overlap with neighbours
  // — guarantees full coverage even with jitter pulling centres apart.
  const cellDiag = Math.sqrt(cellW * cellW + cellH * cellH);
  const baseRadius = cellDiag * 0.9;
  const splatters: Splatter[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jx = (srand(idx * 11 + 1) - 0.5) * cellW * 0.6;
      const jy = (srand(idx * 11 + 2) - 0.5) * cellH * 0.6;
      const cx = (c + 0.5) * cellW + jx;
      const cy = (r + 0.5) * cellH + jy;
      const radius = baseRadius * (0.85 + srand(idx * 11 + 3) * 0.3);
      // 5-9 overlapping lobes per splatter — irregular silhouette.
      const lobeCount = 5 + Math.floor(srand(idx * 11 + 4) * 5);
      const lobes: { dx: number; dy: number; r: number }[] = [];
      for (let j = 0; j < lobeCount; j++) {
        const ang  = srand(idx * 31 + j * 7) * Math.PI * 2;
        const dist = srand(idx * 31 + j * 7 + 3) * radius * 0.5;
        const r0   = (0.25 + srand(idx * 31 + j * 7 + 5) * 0.55) * radius;
        lobes.push({ dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, r: r0 });
      }
      splatters.push({ cx, cy, radius, lobes });
      idx++;
    }
  }
  // Deterministic shuffle so the order they LAND in is varied (not
  // top-to-bottom) — feels more like "splatters thrown at the
  // screen" instead of a scanline fill.
  for (let i = splatters.length - 1; i > 0; i--) {
    const j = Math.floor(srand(i * 97) * (i + 1));
    const tmp = splatters[i]!;
    splatters[i] = splatters[j]!;
    splatters[j] = tmp;
  }
  return splatters;
}

/** Draw one splatter (full opacity) into ctx using the supplied RGB.
 *  Uses overlapping radial gradients so the edge stays irregular. */
function drawSplatter(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sp:  Splatter,
  rgb: { r: number; g: number; b: number },
): void {
  for (const lobe of sp.lobes) {
    const x = sp.cx + lobe.dx;
    const y = sp.cy + lobe.dy;
    const r = lobe.r;
    if (r < 0.5) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,    `rgba(${Math.max(0, rgb.r - 40)}, ${Math.max(0, rgb.g - 40)}, ${Math.max(0, rgb.b - 40)}, 1)`);
    g.addColorStop(0.55, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`);
    g.addColorStop(1,    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** v2.14.85 — Lightning-flash white-overlay alpha at a given
 *  normalised position in the WHOLE transition (0..1). Eleven
 *  events spread throughout the duration; each has a `tier` that
 *  governs which intensities the event fires at. Low intensity =
 *  only the top-tier strikes fire (sparse drama); high intensity
 *  = all eleven fire including the secondary stroke-and-flicker
 *  pairs (mimics real lightning's strobe pattern). */
function lightningAlpha(tGlobal: number, intensity: number): number {
  if (intensity <= 0) return 0;
  // Each entry: c = centre (0..1 of total), a = peak alpha,
  // tier = the intensity threshold above which this event fires.
  // Events are ordered tier-ascending so lower intensities see the
  // most dramatic primary strikes first; secondaries kick in higher.
  const events: { c: number; a: number; tier: number }[] = [
    { c: 0.28, a: 1.00, tier: 0.10 },
    { c: 0.55, a: 1.00, tier: 0.25 },
    { c: 0.78, a: 1.00, tier: 0.40 },
    { c: 0.04, a: 1.00, tier: 0.50 },
    { c: 0.93, a: 1.00, tier: 0.60 },
    { c: 0.18, a: 1.00, tier: 0.70 },
    { c: 0.45, a: 1.00, tier: 0.78 },
    { c: 0.68, a: 1.00, tier: 0.85 },
    { c: 0.09, a: 0.90, tier: 0.90 }, // secondary
    { c: 0.33, a: 0.85, tier: 0.95 }, // secondary
    { c: 0.84, a: 0.90, tier: 1.00 }, // secondary
  ];
  // v2.14.86 — flash window widened 2.5% → 5% so each strike lasts
  // ~200 ms at a 2 s transition. Long enough that no 60-fps frame
  // can miss it AND short transitions (down to 800 ms) still get
  // 80 ms flashes — fully perceptible.
  const half = 0.05;
  let alpha = 0;
  for (const ev of events) {
    if (ev.tier > intensity) continue;   // doesn't fire at this level
    const d = Math.abs(tGlobal - ev.c);
    if (d < half) alpha = Math.max(alpha, ev.a * (1 - d / half));
  }
  return alpha;
}

/** Wibbly liquid surface y(x) at the given baseline + animation
 *  phase. Sum of three sines at different frequencies + phases gives
 *  an organic "liquid level" look without reading as a sine wave.
 *
 *  v2.14.83 — amplitudes dropped ~5x. Earlier wave amplitudes (18 /
 *  6 / 3 px) made the line read as "ribbon flapping" rather than a
 *  liquid surface; now it's virtually straight with a slight
 *  organic wiggle, matching the user's "simple line wipe" call. */
function wibblyY(x: number, baseY: number, w: number, phase: number): number {
  const u = x / Math.max(1, w);
  const wave1 = Math.sin(u * Math.PI * 2.0 + phase * 0.3) * 4.0;
  const wave2 = Math.sin(u * Math.PI * 5.0 + phase * 0.7) * 1.5;
  const wave3 = Math.sin(u * Math.PI * 9.0 - phase * 0.5) * 0.8;
  return baseY + wave1 + wave2 + wave3;
}

/** Trace the closed clip path: everything BELOW the wibbly line at
 *  cutY (with off-canvas margins so nothing leaks at the edges). */
function buildWibblyPath(
  ctx:   CanvasRenderingContext2D,
  cutY:  number,
  w:     number,
  h:     number,
  phase: number,
): void {
  ctx.beginPath();
  ctx.moveTo(-10, h + 10);
  ctx.lineTo(-10, wibblyY(0, cutY, w, phase));
  // Step across the width sampling the wave. 4 px per sample is dense
  // enough for smooth curves at typical viewport sizes.
  const step = 4;
  for (let x = 0; x <= w; x += step) {
    ctx.lineTo(x, wibblyY(x, cutY, w, phase));
  }
  ctx.lineTo(w + 10, wibblyY(w, cutY, w, phase));
  ctx.lineTo(w + 10, h + 10);
  ctx.closePath();
}

/** Stroke the wibbly line with a glossy specular highlight so the
 *  liquid surface reads as wet + reflective. */
function drawWibblyGloss(
  ctx:   CanvasRenderingContext2D,
  cutY:  number,
  w:     number,
  phase: number,
): void {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 250, 250, 0.65)';
  ctx.beginPath();
  const step = 4;
  ctx.moveTo(-10, wibblyY(0, cutY, w, phase));
  for (let x = 0; x <= w; x += step) {
    ctx.lineTo(x, wibblyY(x, cutY, w, phase));
  }
  ctx.lineTo(w + 10, wibblyY(w, cutY, w, phase));
  ctx.stroke();
  // Soft inner glow just below the highlight stroke — sells the
  // liquid's body picking up the light.
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255, 240, 240, 0.18)';
  ctx.stroke();
  ctx.restore();
}

export default {
  id: 'blood_spatter',
  label: 'Blood Splatter',
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 800,
      max: 5000,
      step: 100,
      default: 2000,
      unit: 'ms',
    },
    {
      type: 'color',
      id: 'colour',
      label: 'Colour',
      default: '#8c080c',
    },
    {
      type: 'slider',
      id: 'lightning_intensity',
      label: 'Lightning',
      min: 0,
      max: 100,
      step: 5,
      default: 100,
      unit: '%',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration  = (params['duration']  as number) ?? 2000;
    const colourHex = (params['colour']    as string) ?? '#8c080c';
    const lightningIntensity = Math.max(0, Math.min(1,
      ((params['lightning_intensity'] as number) ?? 75) / 100,
    ));
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;
    const rgb = hexToRgb(colourHex);

    // Phase budget (% of total). v2.14.84 — dedicated lightning
    // phase removed; flashes now fire on a global timeline through
    // both phases via lightningAlpha(tGlobal) overlay. Splitting the
    // duration 45/55 (fill / wipe) gives the splatters enough room
    // to actually accumulate visibly before the wipe takes over.
    const dFill = duration * 0.45;
    const dWipe = duration - dFill;

    // Pre-build all splatter positions for this run.
    const splatters = buildSplatters(w, h);

    // Helper: stamp the lightning flash over the current frame.
    // Called LAST in each phase's draw callback so the flash sits on
    // top of everything (splatters, snapshot, the wibbly wipe, the
    // newly-revealed map).
    //
    // v2.14.85 — uses 'lighter' blending so the flash ILLUMINATES
    // whatever's underneath instead of painting pure white over it.
    // Blood (or any chosen colour) gets brightened toward white as
    // the strike peaks — at peak alpha=1 the result clamps to pure
    // white; at lower alpha the colour reads as "lit up from above"
    // (e.g. crimson → pink-white). The whole frame flashes WITH the
    // strike — the way a real lightning strike actually catches the
    // scene around it.
    const drawLightning = (tGlobal: number): void => {
      if (lightningIntensity <= 0) return;
      const a = lightningAlpha(tGlobal, lightningIntensity);
      if (a <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 250, 245, ${a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    };

    // ── Phase 2: Splatter fill ────────────────────────────────────────
    // Accumulate splatters onto an offscreen canvas so Phase 3 can
    // sample the filled layer with the wibbly clip.
    let splatLayer: OffscreenCanvas | HTMLCanvasElement;
    let splatCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    if (typeof OffscreenCanvas !== 'undefined') {
      splatLayer = new OffscreenCanvas(w, h);
      splatCtx   = splatLayer.getContext('2d')!;
    } else {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      splatLayer = c;
      splatCtx   = c.getContext('2d')!;
    }
    let drawnSoFar = 0;
    await animate(dFill, (t) => {
      // First 80% of the phase: accumulate splatters one-by-one.
      // Each splatter only ever needs to be drawn once — its position
      // doesn't change frame to frame, so the offscreen layer
      // monotonically gains content.
      const drawProgress = Math.min(1, t / 0.8);
      const target = Math.ceil(drawProgress * splatters.length);
      for (let i = drawnSoFar; i < target; i++) {
        drawSplatter(splatCtx, splatters[i]!, rgb);
      }
      drawnSoFar = target;

      // Composite display: snapshot underneath, splatter layer on top.
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);
      ctx.drawImage(splatLayer as CanvasImageSource, 0, 0);

      // Last 20% of the phase: fade a same-colour wash IN over the
      // top so the screen smoothly transitions from "individual
      // splatters with gradient edges" to "fully solid colour".
      // Guarantees the wipe starts from a 100%-covered frame.
      if (t > 0.8) {
        const washAlpha = (t - 0.8) / 0.2;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${washAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Lightning flash on top of the splatter frame. tGlobal maps
      // the fill phase to 0..dFill / duration of the total timeline.
      drawLightning((t * dFill) / duration);
    }, easeOut, signal);
    if (signal?.aborted) return;

    // Bake the final solid colour onto the splat layer itself so the
    // wibbly clip in Phase 3 reveals the same solid colour rather
    // than the now-stale splatter gradients.
    splatCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
    splatCtx.fillRect(0, 0, w, h);

    // ── Phase 3: Wibbly wipe ──────────────────────────────────────────
    // A wavy liquid line descends from above the top of the frame to
    // just below the bottom. Above the line: revealed (new map).
    // Below: the solid splat layer. Glossy specular stroke rides the
    // line so the liquid surface reads as wet + reflective.
    const waveMargin = 12; // amplitude headroom so the wave doesn't pop
    await animate(dWipe, (t) => {
      ctx.clearRect(0, 0, w, h);
      const cutY = -waveMargin + easeIn(t) * (h + waveMargin * 2);
      // Phase parameter animates the wave shape over time so the
      // liquid surface ripples as it falls.
      const phase = t * 6.0;
      ctx.save();
      buildWibblyPath(ctx, cutY, w, h, phase);
      ctx.clip();
      ctx.drawImage(splatLayer as CanvasImageSource, 0, 0);
      ctx.restore();
      drawWibblyGloss(ctx, cutY, w, phase);
      // Lightning flash on top of the wipe frame. tGlobal continues
      // from where the fill phase left off, so the five-flash schedule
      // keeps firing through the reveal.
      drawLightning((dFill + t * dWipe) / duration);
    }, undefined, signal);
  },
} satisfies TransitionDefinition;

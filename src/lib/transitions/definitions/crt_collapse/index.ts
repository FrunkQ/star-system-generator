import type { TransitionDefinition } from '../../schema';
import { animate, easeIn, easeOut } from '../../easing';

/** Draw the green phosphor glow band at the edge of the visible strip. */
function drawPhosphorGlow(
  ctx: CanvasRenderingContext2D,
  y0: number,
  stripH: number,
  w: number,
  intensity: number,
): void {
  if (intensity <= 0) return;
  const spread = 20;

  // Top edge glow
  const topGrad = ctx.createLinearGradient(0, y0 - spread, 0, y0 + Math.min(stripH * 0.4, 10));
  topGrad.addColorStop(0, 'transparent');
  topGrad.addColorStop(1, `rgba(60,255,80,${intensity * 0.7})`);
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, y0 - spread, w, spread + Math.min(stripH * 0.4, 10));

  // Bottom edge glow
  const botGrad = ctx.createLinearGradient(0, y0 + stripH - Math.min(stripH * 0.4, 10), 0, y0 + stripH + spread);
  botGrad.addColorStop(0, `rgba(60,255,80,${intensity * 0.7})`);
  botGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, y0 + stripH - Math.min(stripH * 0.4, 10), w, spread + Math.min(stripH * 0.4, 10));
}

export default {
  id: 'crt_collapse',
  label: 'CRT Collapse',
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 400,
      max: 3000,
      step: 100,
      default: 1200,
      unit: 'ms',
    },
    {
      type: 'slider',
      id: 'glow_color',
      label: 'Phosphor (0=green 1=amber)',
      min: 0,
      max: 1,
      step: 0.1,
      default: 0,
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration  = (params['duration']   as number) ?? 1200;
    const glowMix   = (params['glow_color'] as number) ?? 0;
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    // Compute phosphor colour: 0 = green, 1 = amber
    const gr = Math.round(60  + glowMix * (255 - 60));
    const gg = Math.round(255 + glowMix * (180 - 255));
    const gb = Math.round(80  + glowMix * (0   - 80));
    const phosphorRGB = `${gr},${gg},${gb}`;

    // ── Phase 1: Collapse old image to a horizontal line then dot ──────────
    await animate(duration * 0.45, (t) => {
      ctx.clearRect(0, 0, w, h);

      // Black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Vertical compression: image shrinks toward horizontal center line
      const stripH = Math.max(2, (1 - t) * h);
      const y0     = (h - stripH) / 2;

      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, y0, w, stripH);
      drawPhosphorGlow(ctx, y0, stripH, w, t);
    }, easeIn, signal);
    if (signal?.aborted) return;

    // ── Brief pause at the bright dot ──────────────────────────────────────
    await animate(duration * 0.1, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Tiny glowing dot at center
      const dotR = 4 + (1 - t) * 6;
      const alpha = 0.8 + t * 0.2;
      const radial = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, dotR * 4);
      radial.addColorStop(0,   `rgba(${phosphorRGB},${alpha})`);
      radial.addColorStop(0.3, `rgba(${phosphorRGB},${alpha * 0.6})`);
      radial.addColorStop(1,   'transparent');
      ctx.fillStyle = radial;
      ctx.fillRect(w / 2 - dotR * 4, h / 2 - dotR * 4, dotR * 8, dotR * 8);
    }, undefined, signal);
    if (signal?.aborted) return;

    // ── Phase 2: Expand from dot to full new frame (already loaded underneath) ──
    await animate(duration * 0.45, (t) => {
      ctx.clearRect(0, 0, w, h);

      // Black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Expanding clear window reveals the new Three.js frame underneath
      const stripH = Math.max(2, t * h);
      const y0     = (h - stripH) / 2;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(0, y0, w, stripH);
      ctx.restore();

      drawPhosphorGlow(ctx, y0, stripH, w, 1 - t);
    }, easeOut, signal);
  },
} satisfies TransitionDefinition;

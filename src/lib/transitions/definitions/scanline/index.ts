import type { TransitionDefinition } from '../../schema';
import { animate, linear } from '../../easing';

export default {
  id: 'scanline',
  label: 'Terminal Clear',
  forHandout: true,
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 500,
      max: 20000,
      step: 100,
      default: 2000,
      unit: 'ms',
    },
    {
      type: 'slider',
      id: 'cols',
      label: 'Columns',
      min: 40,
      max: 160,
      step: 10,
      default: 80,
    },
    {
      type: 'slider',
      id: 'rows',
      label: 'Rows',
      min: 10,
      max: 50,
      step: 5,
      default: 25,
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration = (params['duration'] as number) ?? 2000;
    const cols     = Math.max(1, Math.round((params['cols'] as number) ?? 80));
    const rows     = Math.max(1, Math.round((params['rows'] as number) ?? 25));
    const ctx      = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    const cellW = w / cols;
    const cellH = h / rows;
    const total = cols * rows;

    // Width of the green flash band (cells ahead of the clear front)
    const flashBand = Math.max(2, Math.ceil(cols * 0.12));

    // Helper: pixel rect for cell (col, row) — rounded to avoid sub-pixel gaps
    const cellRect = (col: number, row: number) => ({
      x:  Math.round(col * cellW),
      y:  Math.round(row * cellH),
      cw: Math.round((col + 1) * cellW) - Math.round(col * cellW),
      ch: Math.round((row + 1) * cellH) - Math.round(row * cellH),
    });

    await animate(duration, (t) => {
      const clearCount = Math.floor(t * total);
      const flashFront = Math.min(total, clearCount + flashBand);

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      // ── Flash zone ─────────────────────────────────────────────────────────
      // Cells [clearCount, flashFront) glow phosphor green ahead of the clear.
      // Intensity falls off toward the front; leading cell is near-white.
      for (let i = clearCount; i < flashFront; i++) {
        const { x, y, cw, ch } = cellRect(i % cols, Math.floor(i / cols));
        const fade = 1 - (i - clearCount) / flashBand;

        if (i === clearCount) {
          // Leading cell: bright white-green flash (the "cursor")
          ctx.fillStyle = 'rgba(220,255,220,0.95)';
        } else {
          ctx.fillStyle = `rgba(60,255,100,${(fade * 0.8).toFixed(2)})`;
        }
        ctx.fillRect(x, y, cw, ch);
      }

      // ── Clear zone ─────────────────────────────────────────────────────────
      // Use two rectangles (O(1)) rather than per-cell fills (O(n)).
      if (clearCount > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';

        const fullRows    = Math.floor(clearCount / cols);
        const partialCols = clearCount % cols;

        // All complete rows above the current one
        if (fullRows > 0) {
          ctx.fillRect(0, 0, w, Math.round(fullRows * cellH));
        }
        // Current partial row up to the clear front
        if (partialCols > 0) {
          ctx.fillRect(
            0,
            Math.round(fullRows * cellH),
            Math.round(partialCols * cellW),
            Math.round((fullRows + 1) * cellH) - Math.round(fullRows * cellH),
          );
        }

        ctx.restore();
      }
    }, linear, signal);
  },
} satisfies TransitionDefinition;

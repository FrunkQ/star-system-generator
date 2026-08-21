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

    // Width of the green flash band (cells BEHIND the clear front — see the flash zone below)
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

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

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

      // ── Flash zone ─────────────────────────────────────────────────────────
      // BEHIND the front, not ahead of it (C16). A cell flashes as the front REACHES it and then
      // dims: the cursor is the last cell cleared and the glow trails back over the cleared region.
      // The old band ran [clearCount, flashFront) — ahead of the front, over cells not yet cleared —
      // so the brightness ran the wrong way and the effect read as travelling backwards.
      //
      // It is drawn AFTER the clear, and that ordering is load-bearing: the clear is a
      // `destination-out` wipe, so a band painted before it over the same cells would be erased by
      // it. Painting after lays the glow onto the already-transparent region, which is what makes
      // the trail visible at all.
      for (let i = Math.max(0, clearCount - flashBand); i < clearCount; i++) {
        const { x, y, cw, ch } = cellRect(i % cols, Math.floor(i / cols));
        if (i === clearCount - 1) {
          // The cursor: the cell the front has just reached.
          ctx.fillStyle = 'rgba(220,255,220,0.95)';
        } else {
          // Dimming with distance BEHIND the cursor.
          const fade = 1 - (clearCount - 1 - i) / flashBand;
          ctx.fillStyle = `rgba(60,255,100,${(fade * 0.8).toFixed(2)})`;
        }
        ctx.fillRect(x, y, cw, ch);
      }
    }, linear, signal);
  },
} satisfies TransitionDefinition;

import type { TransitionDefinition } from '../../schema';
import { animate, linear } from '../../easing';

/**
 * "Written Reveal" — line-by-line soft-fade reveal. The page is
 * divided into horizontal lines of `line_width` (% of page height =
 * line thickness). The reveal sweeps left-to-right across each line
 * in turn; within a line, the snapshot fades out softly behind a
 * gradient band whose pixel-width is set by `fade_up_ms` (how long
 * any one pixel takes to transition from the starting frame to fully
 * revealed).
 *
 * Visually: imagine the ink soaking into the page along each row —
 * no hard cursor, just a gentle wash that progresses line-by-line.
 *
 * Suits journal entries, scrolls, proclamations. Default 30 s for
 * an unhurried showpiece; line_width controls how many lines the
 * page is split into; fade_up_ms controls how soft the leading edge
 * reads (small = sharper, larger = mistier).
 */
export default {
  id: 'written_reveal',
  label: 'Written Reveal',
  forHandout: true,
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 3000,
      max: 60000,
      step: 500,
      default: 30000,
      unit: 'ms',
    },
    {
      type: 'slider',
      id: 'line_width',
      label: 'Line width',
      min: 2,
      max: 30,
      step: 1,
      default: 8,
      unit: '% of page',
    },
    {
      type: 'slider',
      id: 'fade_up_ms',
      label: 'Fade up',
      min: 50,
      max: 1500,
      step: 50,
      default: 400,
      unit: 'ms',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration   = (params['duration']    as number) ?? 30000;
    const lineWidth  = (params['line_width']  as number) ?? 8;
    const fadeUpMs   = (params['fade_up_ms']  as number) ?? 400;
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    const lineH      = Math.max(2, (lineWidth / 100) * h);
    const numLines   = Math.max(1, Math.ceil(h / lineH));
    const lineTimeMs = duration / numLines;
    // Band pixel-width derived from fade-up time and writing speed.
    // Capped at the page width so very short lines don't try to stretch
    // the gradient past the edges.
    const bandPx = Math.max(1, Math.min(w, (w * fadeUpMs) / lineTimeMs));

    await animate(duration, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      const linePos     = t * numLines;
      const currentLine = Math.min(numLines - 1, Math.floor(linePos));
      const lineProg    = Math.min(1, linePos - currentLine);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';

      // Every line above the current one is fully revealed.
      if (currentLine > 0) {
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(0, 0, w, currentLine * lineH);
      }

      // Current line: solid erase behind the band + gradient at the
      // leading edge so the writing front reads as soft ink, not a
      // hard cursor.
      const frontX    = lineProg * w;
      const bandStart = Math.max(0, frontX - bandPx);
      if (bandStart > 0) {
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(0, currentLine * lineH, bandStart, lineH);
      }
      if (frontX > bandStart) {
        const g = ctx.createLinearGradient(bandStart, 0, frontX, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bandStart, currentLine * lineH, frontX - bandStart, lineH);
      }
      ctx.restore();
    }, linear, signal);
  },
} satisfies TransitionDefinition;

import type { TransitionDefinition } from '../../schema';
import { animate, linear } from '../../easing';

// Typewriter: the new page is "typed" on — revealed character-cell by character-cell in reading order
// (left→right, line by line) behind a bright block caret, with a slightly irregular per-cell rhythm so
// it feels struck by keys rather than swept. The Guide's terminal style come alive. Unlike 'scanline'
// (a uniform phosphor-flash clear), this has no flash band — just the caret and the typing cadence.
export default {
  id: 'typewriter',
  label: 'Typewriter',
  forHandout: true,
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 500,
      max: 20000,
      step: 100,
      default: 2600,
      unit: 'ms',
    },
    {
      type: 'slider',
      id: 'rows',
      label: 'Lines',
      min: 8,
      max: 60,
      step: 2,
      default: 28,
    },
    {
      type: 'slider',
      id: 'cols',
      label: 'Characters per line',
      min: 20,
      max: 160,
      step: 5,
      default: 70,
    },
    {
      type: 'color',
      id: 'caretColor',
      label: 'Caret colour',
      default: '#9fe8b0',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration = (params['duration'] as number) ?? 2600;
    const rows     = Math.max(1, Math.round((params['rows'] as number) ?? 28));
    const cols     = Math.max(1, Math.round((params['cols'] as number) ?? 70));
    const caretCol = String(params['caretColor'] ?? '#9fe8b0');
    const ctx      = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    const cellW = w / cols;
    const cellH = h / rows;
    const total = cols * rows;

    // Typing rhythm: each cell takes a slightly different time (seeded hash — deterministic, no RNG
    // state), with an extra beat at each line's end (the carriage return). Cumulative weights map
    // eased time → how many cells are "typed".
    const weight = (i: number) => {
      let s = (i * 2654435761) >>> 0;               // Knuth multiplicative hash
      s ^= s >>> 13; s = (s * 1274126177) >>> 0; s ^= s >>> 16;
      const jitter = 0.6 + (s % 1000) / 1000 * 0.8; // 0.6..1.4 per keystroke
      return (i + 1) % cols === 0 ? jitter + 1.6 : jitter; // pause on the CR
    };
    const cum: number[] = new Array(total);
    let acc = 0;
    for (let i = 0; i < total; i++) { acc += weight(i); cum[i] = acc; }
    const totalWeight = acc;

    // Pixel rect for cell index (rounded so adjacent cells butt without sub-pixel seams).
    const cellRect = (i: number) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = Math.round(col * cellW), y = Math.round(row * cellH);
      return { x, y, cw: Math.round((col + 1) * cellW) - x, ch: Math.round((row + 1) * cellH) - y };
    };

    await animate(duration, (t) => {
      // How many cells are typed at eased-time t (binary search over the cumulative rhythm).
      const target = t * totalWeight;
      let lo = 0, hi = total;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid + 1; else hi = mid; }
      const typed = lo;

      // Old page everywhere...
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      // ...then the typed region is CLEARED (revealing the new page underneath): full lines first,
      // then the partial current line.
      const fullRows = Math.floor(typed / cols);
      if (fullRows > 0) ctx.clearRect(0, 0, w, Math.round(fullRows * cellH));
      const rem = typed - fullRows * cols;
      if (rem > 0 && fullRows < rows) {
        const y = Math.round(fullRows * cellH);
        const yh = Math.round((fullRows + 1) * cellH) - y;
        ctx.clearRect(0, y, Math.round(rem * cellW), yh);
      }

      // The caret: a solid block at the typing front, blinking at ~2.5 Hz (always on while moving
      // through a line so it reads as the print head).
      if (typed < total) {
        const { x, y, cw, ch } = cellRect(typed);
        const blinkOn = Math.floor(t * duration / 200) % 2 === 0;
        if (blinkOn || typed % cols !== 0) {
          ctx.fillStyle = caretCol;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(x, y + Math.round(ch * 0.1), Math.max(2, cw), Math.round(ch * 0.8));
          ctx.globalAlpha = 1;
        }
      }
    }, linear, signal); // constant typing pace — easing would make the keys speed up mid-page
  },
} satisfies TransitionDefinition;

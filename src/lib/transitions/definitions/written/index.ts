import type { TransitionDefinition } from '../../schema';
import { animate, linear } from '../../easing';

/**
 * "Slow Fade Wipe" — slow top-to-bottom soft reveal, like an ink edge
 * gently descending across the page. The snapshot of the OLD frame
 * (background + "Don't animate" elements, in a handout reveal) is
 * wiped away with a soft gradient band; the new frame underneath
 * (background + ALL elements) shows through behind the band.
 *
 * Visually: a horizontal "ink edge" descends at constant speed; above
 * it the page reads as fully revealed, below it the starting frame is
 * still showing, with a soft fade in between.
 *
 * Originally called "Written" — renamed because it doesn't actually
 * write line-by-line. The proper handwriting-style reveal lives in the
 * `written_reveal` transition instead.
 */
export default {
  id: 'written',
  label: 'Slow Fade Wipe',
  forHandout: true,
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 3000,
      max: 60000,
      step: 1000,
      default: 30000,
      unit: 'ms',
    },
    {
      type: 'select',
      id: 'direction',
      label: 'Direction',
      options: [
        { value: 'down',  label: '↓ Top to bottom' },
        { value: 'up',    label: '↑ Bottom to top' },
        { value: 'right', label: '→ Left to right' },
        { value: 'left',  label: '← Right to left' },
      ],
      default: 'down',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration  = (params['duration']   as number) ?? 30000;
    const direction = (params['direction']  as string) ?? 'down';
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    // Soft-band half-thickness — hardcoded at ~8% of the sweep axis.
    // The line_width param was removed: this transition just needs a
    // gentle fade-edge, not a configurable width (that's the
    // written_reveal transition's job).
    const isVertical = direction === 'down' || direction === 'up';
    const axisLen    = isVertical ? h : w;
    const bandHalf   = Math.max(2, Math.round(0.08 * axisLen * 0.5));

    await animate(duration, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      // Erase the "already revealed" portion of the snapshot with a
      // gradient at the edge so the reveal feels soft, not sharp.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';

      switch (direction) {
        case 'down': {
          const edge = t * h;
          // Solid erase above the band.
          if (edge > bandHalf) {
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.fillRect(0, 0, w, edge - bandHalf);
          }
          // Gradient band straddling the edge.
          const top = Math.max(0, edge - bandHalf);
          const bot = Math.min(h, edge + bandHalf);
          if (bot > top) {
            const g = ctx.createLinearGradient(0, top, 0, bot);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, top, w, bot - top);
          }
          break;
        }
        case 'up': {
          const edge = (1 - t) * h;
          if (edge + bandHalf < h) {
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.fillRect(0, edge + bandHalf, w, h - (edge + bandHalf));
          }
          const top = Math.max(0, edge - bandHalf);
          const bot = Math.min(h, edge + bandHalf);
          if (bot > top) {
            const g = ctx.createLinearGradient(0, top, 0, bot);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,1)');
            ctx.fillStyle = g;
            ctx.fillRect(0, top, w, bot - top);
          }
          break;
        }
        case 'right': {
          const edge = t * w;
          if (edge > bandHalf) {
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.fillRect(0, 0, edge - bandHalf, h);
          }
          const lft = Math.max(0, edge - bandHalf);
          const rgt = Math.min(w, edge + bandHalf);
          if (rgt > lft) {
            const g = ctx.createLinearGradient(lft, 0, rgt, 0);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(lft, 0, rgt - lft, h);
          }
          break;
        }
        case 'left': {
          const edge = (1 - t) * w;
          if (edge + bandHalf < w) {
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.fillRect(edge + bandHalf, 0, w - (edge + bandHalf), h);
          }
          const lft = Math.max(0, edge - bandHalf);
          const rgt = Math.min(w, edge + bandHalf);
          if (rgt > lft) {
            const g = ctx.createLinearGradient(lft, 0, rgt, 0);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,1)');
            ctx.fillStyle = g;
            ctx.fillRect(lft, 0, rgt - lft, h);
          }
          break;
        }
      }

      ctx.restore();
    }, linear, signal);
  },
} satisfies TransitionDefinition;

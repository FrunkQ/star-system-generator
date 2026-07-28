import type { TransitionDefinition } from '../../schema';
import { animate, easeInOut } from '../../easing';

/** Draw a bright edge line along the wipe boundary. */
function drawEdge(
  ctx: CanvasRenderingContext2D,
  direction: string,
  progress: number,
  w: number,
  h: number,
): void {
  const glow = 'rgba(255,255,220,0.8)';
  const fade = 'transparent';

  switch (direction) {
    case 'left': {
      const x = progress * w;
      const g = ctx.createLinearGradient(x - 28, 0, x + 3, 0);
      g.addColorStop(0, fade); g.addColorStop(0.6, 'rgba(255,255,200,0.3)'); g.addColorStop(1, glow);
      ctx.fillStyle = g;
      ctx.fillRect(x - 28, 0, 31, h);
      break;
    }
    case 'right': {
      const x = (1 - progress) * w;
      const g = ctx.createLinearGradient(x - 3, 0, x + 28, 0);
      g.addColorStop(0, glow); g.addColorStop(0.4, 'rgba(255,255,200,0.3)'); g.addColorStop(1, fade);
      ctx.fillStyle = g;
      ctx.fillRect(x - 3, 0, 31, h);
      break;
    }
    case 'up': {
      const y = progress * h;
      const g = ctx.createLinearGradient(0, y - 28, 0, y + 3);
      g.addColorStop(0, fade); g.addColorStop(0.6, 'rgba(255,255,200,0.3)'); g.addColorStop(1, glow);
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 28, w, 31);
      break;
    }
    case 'down': {
      const y = (1 - progress) * h;
      const g = ctx.createLinearGradient(0, y - 3, 0, y + 28);
      g.addColorStop(0, glow); g.addColorStop(0.4, 'rgba(255,255,200,0.3)'); g.addColorStop(1, fade);
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 3, w, 31);
      break;
    }
    default:
      break;
  }
}

export default {
  id: 'wipe',
  label: 'Wipe',
  forHandout: true,
  params: [
    {
      type: 'select',
      id: 'direction',
      label: 'Direction',
      options: [
        { value: 'left',    label: '→ Left to right'      },
        { value: 'right',   label: '← Right to left'      },
        { value: 'up',      label: '↓ Top to bottom'      },
        { value: 'down',    label: '↑ Bottom to top'      },
        { value: 'diag_tl', label: '↘ Diagonal TL → BR'   },
        { value: 'diag_tr', label: '↙ Diagonal TR → BL'   },
      ],
      default: 'left',
    },
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 200,
      max: 2000,
      step: 100,
      default: 600,
      unit: 'ms',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const direction = (params['direction'] as string) ?? 'left';
    const duration  = (params['duration']  as number) ?? 600;
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    await animate(duration, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      // Punch hole in overlay to reveal new Three.js frame underneath.
      // fillStyle must be opaque — destination-out uses alpha only, and the
      // gradient left by drawEdge on the previous frame would make it transparent.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';

      switch (direction) {
        case 'left':
          ctx.fillRect(0, 0, t * w, h);
          break;
        case 'right':
          ctx.fillRect((1 - t) * w, 0, t * w + 1, h);
          break;
        case 'up':
          ctx.fillRect(0, 0, w, t * h);
          break;
        case 'down':
          ctx.fillRect(0, (1 - t) * h, w, t * h + 1);
          break;

        // Diagonal TL→BR: reveal region is x + y <= reach (clipped to canvas).
        // Build the correct polygon for each phase as reach sweeps 0 → w+h.
        case 'diag_tl': {
          const reach = t * (w + h);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          if (reach >= w + h) {
            ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h);
          } else if (reach >= Math.max(w, h)) {
            // Both TR (w,0) and BL (0,h) inside — pentagon
            ctx.lineTo(w, 0); ctx.lineTo(w, reach - w);
            ctx.lineTo(reach - h, h); ctx.lineTo(0, h);
          } else if (reach >= w) {
            // Portrait only: TR inside, BL not yet
            ctx.lineTo(w, 0); ctx.lineTo(w, reach - w); ctx.lineTo(0, reach);
          } else if (reach >= h) {
            // Landscape only: BL inside, TR not yet
            ctx.lineTo(reach, 0); ctx.lineTo(reach - h, h); ctx.lineTo(0, h);
          } else {
            // Simple triangle
            ctx.lineTo(reach, 0); ctx.lineTo(0, reach);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }

        // Diagonal TR→BL: reveal region is (w-x) + y <= reach (clipped to canvas).
        // Boundary line: at y=0, x = w-reach; at y=h, x = w-reach+h.
        case 'diag_tr': {
          const reach = t * (w + h);
          ctx.beginPath();
          ctx.moveTo(w, 0);
          if (reach >= w + h) {
            ctx.lineTo(0, 0); ctx.lineTo(0, h); ctx.lineTo(w, h);
          } else if (reach >= Math.max(w, h)) {
            // Both TL (0,0) and BR (w,h) inside — pentagon
            ctx.lineTo(0, 0); ctx.lineTo(0, reach - w);
            ctx.lineTo(w - reach + h, h); ctx.lineTo(w, h);
          } else if (reach >= w) {
            // Portrait only: TL inside, BR not yet
            ctx.lineTo(0, 0); ctx.lineTo(0, reach - w); ctx.lineTo(w, reach);
          } else if (reach >= h) {
            // Landscape only: BR inside, TL not yet
            ctx.lineTo(w - reach, 0); ctx.lineTo(w - reach + h, h); ctx.lineTo(w, h);
          } else {
            // Simple triangle
            ctx.lineTo(w - reach, 0); ctx.lineTo(w, reach);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
      }

      ctx.restore();

      // Bright edge line — only for cardinal directions
      if (['left', 'right', 'up', 'down'].includes(direction)) {
        drawEdge(ctx, direction, t, w, h);
      }
    }, easeInOut, signal);
  },
} satisfies TransitionDefinition;

import type { TransitionDefinition } from '../../schema';
import { animate, linear } from '../../easing';

/** Seeded LCG shuffle — deterministic so the pattern is consistent each time. */
function seededShuffle(arr: number[]): number[] {
  let seed = 0x9e3779b9;
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = arr[i]!; arr[i] = arr[j]!; arr[j] = tmp;
  }
  return arr;
}

// Cache the last computed shuffle to avoid recomputing on every frame
let cachedOrder: number[] | null = null;
let cachedKey   = '';

function getBlockOrder(cols: number, rows: number): number[] {
  const key = `${cols}x${rows}`;
  if (cachedKey !== key || !cachedOrder) {
    cachedOrder = seededShuffle(Array.from({ length: cols * rows }, (_, i) => i));
    cachedKey = key;
  }
  return cachedOrder;
}

export default {
  id: 'static_dissolve',
  label: 'Static Dissolve',
  forHandout: true,
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 300,
      max: 2000,
      step: 100,
      default: 700,
      unit: 'ms',
    },
    {
      type: 'slider',
      id: 'block_size',
      label: 'Block Size',
      min: 4,
      max: 32,
      step: 2,
      default: 8,
      unit: 'px',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration  = (params['duration']   as number) ?? 700;
    const blockSize = Math.round((params['block_size'] as number) ?? 8);
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    const cols  = Math.ceil(w / blockSize);
    const rows  = Math.ceil(h / blockSize);
    const total = cols * rows;
    const order = getBlockOrder(cols, rows);

    await animate(duration, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);

      // Clear revealed blocks — punches through to new Three.js frame underneath.
      // fillStyle must be opaque — noise rgba from the previous frame leaks into
      // save() state and would make destination-out partially transparent.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      const clearCount = Math.floor(t * total);
      for (let i = 0; i < clearCount; i++) {
        const idx = order[i]!;
        ctx.fillRect((idx % cols) * blockSize, Math.floor(idx / cols) * blockSize, blockSize, blockSize);
      }
      ctx.restore();

      // Subtle static noise overlay — fades out as dissolve progresses
      const noiseAlpha = (1 - t) * 0.08;
      if (noiseAlpha > 0.005) {
        ctx.fillStyle = `rgba(120,200,120,${noiseAlpha})`;
        for (let y = 0; y < h; y += 3) {
          if (Math.random() < 0.35) ctx.fillRect(0, y, w, 1);
        }
      }
    }, linear, signal);
  },
} satisfies TransitionDefinition;

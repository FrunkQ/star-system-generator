import type { TransitionDefinition } from '../../schema';
import { animate, easeIn, easeOut } from '../../easing';

export default {
  id: 'fade',
  label: 'Fade to Black',
  forHandout: true,
  params: [
    {
      type: 'slider',
      id: 'duration',
      label: 'Duration',
      min: 200,
      max: 3000,
      step: 100,
      default: 800,
      unit: 'ms',
    },
  ],

  async play({ overlay, snapshot, params, signal }) {
    const duration = (params['duration'] as number) ?? 800;
    const ctx = overlay.getContext('2d')!;
    const { width: w, height: h } = overlay;

    // Phase 1: snapshot fades to black
    await animate(duration / 2, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);
      ctx.fillStyle = `rgba(0,0,0,${t})`;
      ctx.fillRect(0, 0, w, h);
    }, easeIn, signal);
    if (signal?.aborted) return;

    // Phase 2: black fades out — new frame (already loaded underneath) is revealed
    await animate(duration / 2, (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(0,0,0,${1 - t})`;
      ctx.fillRect(0, 0, w, h);
    }, easeOut, signal);
  },
} satisfies TransitionDefinition;

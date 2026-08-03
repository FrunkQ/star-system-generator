<script lang="ts">
  // The GM view's construct picture (G3 follow-up): the SAME priority chain the player document
  // uses - 3D model first, then the uploaded image, then the authored icon glyph - kept simple,
  // no orientation chrome: its job on the GM surface is to show what is loaded.
  import type { CelestialBody } from '$lib/types';
  import ConstructModelGraphic from './ConstructModelGraphic.svelte';
  import { constructIconShape, traceConstructIcon } from '$lib/constructs/constructIcon';

  export let construct: CelestialBody;
  export let height = 130;

  $: model = (construct as any).model ?? null;
  $: imageUrl = !model && construct.image?.url ? construct.image.url : null;

  let glyphCanvas: HTMLCanvasElement | null = null;
  $: if (glyphCanvas && !model && !imageUrl) drawGlyph(glyphCanvas, construct);
  function drawGlyph(cnv: HTMLCanvasElement, c: CelestialBody) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cnv.clientWidth || 130, h = cnv.clientHeight || height;
    cnv.width = w * dpr; cnv.height = h * dpr;
    const ctx = cnv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    traceConstructIcon(ctx, constructIconShape((c as any).icon_type), w / 2, h / 2, Math.min(w, h) * 0.5);
    ctx.fillStyle = (c as any).icon_color || '#ffd24d';
    ctx.globalAlpha = 0.92;
    ctx.fill();
  }
</script>

<div class="portrait" style="height:{height}px">
  {#if model}
    <ConstructModelGraphic {model} tint={(construct as any).icon_color || '#ffd24d'}
      iconType={(construct as any).icon_type} interactive={true} />
  {:else if imageUrl}
    <img src={imageUrl} alt="{construct.name} artwork" />
  {:else}
    <canvas bind:this={glyphCanvas}></canvas>
  {/if}
</div>

<style>
  .portrait { width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .portrait img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .portrait canvas { width: 100%; height: 100%; }
</style>

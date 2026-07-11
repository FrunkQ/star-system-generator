<script lang="ts">
  // Shows a pre-rendered canvas through the REAL GPU filter (see filteredCanvas.ts). Used for the cover
  // screen, which has no 3D scene behind it. Lazy-imports three so it code-splits.
  import { onMount, onDestroy } from 'svelte';
  import type { FilteredCanvasController } from '$lib/holo/filteredCanvas';
  import type { FilterParamValues } from '$lib/holo/filters/schema';

  export let source: HTMLCanvasElement | null = null;
  export let filterId: string = 'none';
  export let filterParams: FilterParamValues = {};

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctrl: FilteredCanvasController | null = null;
  let ro: ResizeObserver | null = null;

  onMount(() => {
    let cancelled = false;
    (async () => {
      const { createFilteredCanvas } = await import('$lib/holo/filteredCanvas');
      if (cancelled || !canvas) return;
      ctrl = createFilteredCanvas(canvas);
      if (source) ctrl.setSource(source);
      ctrl.setFilter(filterId, filterParams);
      const r = container.getBoundingClientRect();
      ctrl.resize(r.width, r.height);
      ro = new ResizeObserver((e) => { const cr = e[0]?.contentRect; if (cr) ctrl?.resize(cr.width, cr.height); });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });
  onDestroy(() => { ro?.disconnect(); ctrl?.dispose(); ctrl = null; });

  $: if (ctrl && source) ctrl.setSource(source);
  $: ctrl?.setFilter(filterId, filterParams);
</script>

<div class="fc-root" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .fc-root { position: absolute; inset: 0; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>

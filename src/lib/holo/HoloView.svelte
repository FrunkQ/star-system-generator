<script lang="ts">
  // Thin Svelte wrapper around the imperative three.js holo scene. Deliberately holds NO static
  // import of three or ./scene — the scene module is dynamically imported on mount so three.js is
  // code-split into its own chunk and the 2D app never pays for it. Mirrors the prop surface of
  // SystemVisualizer so the catalogue/projector can swap one for the other.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { System } from '$lib/types';
  import type { HoloController } from '$lib/holo/scene';

  const dispatch = createEventDispatcher<{ focus: string }>();

  export let system: System | null = null;
  export let currentTime: number = 0;
  // Accepted for prop-parity with SystemVisualizer; wired to camera focus in a later increment.
  export let focusedBodyId: string | null = null;
  export let filter: string = 'none'; // GPU post filter id (none/retro_sci_fi_green/…)

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let labelLayer: HTMLDivElement;
  let controller: HoloController | null = null;
  let ro: ResizeObserver | null = null;

  export function resetView() {
    controller?.resetView();
  }
  // Two framing knobs (angle from overhead, whole-system vs body) — for GM/projector control later.
  export function setFraming(opts: { angleDeg?: number; whole?: boolean }) {
    controller?.setFraming(opts);
  }
  export function setSkybox(on: boolean) {
    controller?.setSkybox(on);
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const { createHoloScene } = await import('$lib/holo/scene');
      if (cancelled || !canvas) return;
      controller = createHoloScene(canvas, { onSelect: (id) => dispatch('focus', id), labelLayer });
      controller.setSystem(system);
      controller.setTime(currentTime);
      controller.focusBody(focusedBodyId);
      controller.setFilter(filter);
      const r = container.getBoundingClientRect();
      controller.resize(r.width, r.height);
      ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr) controller?.resize(cr.width, cr.height);
      });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });

  onDestroy(() => {
    ro?.disconnect();
    controller?.dispose();
    controller = null;
  });

  // Reactive feeds (guarded until the scene has loaded).
  $: controller?.setSystem(system);
  $: controller?.setTime(currentTime);
  $: controller?.focusBody(focusedBodyId);
  $: controller?.setFilter(filter);
</script>

<div class="holo-root" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
  <div class="holo-labels" bind:this={labelLayer}></div>
</div>

<style>
  .holo-root {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none; /* let OrbitControls own pinch/drag */
  }
  .holo-labels {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none; /* labels never intercept camera gestures */
  }
</style>

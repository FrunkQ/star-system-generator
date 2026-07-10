<script lang="ts">
  // Thin wrapper around the imperative 3D starmap scene. Lazy-imports starmapScene so three lands in
  // its own chunk. Feeds it systems (map x/y + multi-star colours) + routes, and the theme/look props.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { Starmap } from '$lib/types';
  import type { StarmapController, SmSystem, SmRoute } from './starmapScene';
  import { systemVisualStars } from './systemStars';

  export let starmap: Starmap | null = null;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  export let grid: 'off' | 'plain' | 'scaled' = 'plain';
  export let background: 'space' | 'green' | 'blue' | 'black' = 'space';
  export let angleDeg = 58;
  export let labelSize = 12;
  export let filter = 'none';
  export let filterParams: Record<string, number | boolean | string> | undefined = undefined;
  export let selectable = false; // live view: tapping a system fires `select`

  const dispatch = createEventDispatcher<{ select: string }>();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let controller: StarmapController | null = null;
  let ro: ResizeObserver | null = null;

  $: smSystems = ((starmap?.systems ?? []) as any[]).map<SmSystem>((s) => ({
    id: s.id, name: s.name, x: s.position?.x ?? 0, y: s.position?.y ?? 0,
    stars: systemVisualStars(s.system).map((v) => ({ color: v.color }))
  }));
  $: smRoutes = ((starmap?.routes ?? []) as any[]).map<SmRoute>((r) => ({ fromId: r.sourceSystemId, toId: r.targetSystemId, dashed: r.lineStyle === 'dashed' }));

  function apply() {
    if (!controller) return;
    controller.setData(smSystems, smRoutes);
    controller.setGrid(grid);
    controller.setBackground(background);
    controller.setFraming(angleDeg);
    controller.setLabelSize(labelSize);
    controller.setLabelFont(font);
    // Labels are in-scene sprites: draw them in the theme accent; the shader tints them under CRT.
    controller.setLabelColor(accentColor);
    controller.setFilter(filter, filterParams);
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const { createStarmapScene } = await import('./starmapScene');
      if (cancelled || !canvas) return;
      controller = createStarmapScene(canvas, { distanceUnit: starmap?.distanceUnit, onSelect: selectable ? (id) => dispatch('select', id) : undefined });
      apply();
      const r = container.getBoundingClientRect();
      controller.resize(r.width, r.height);
      ro = new ResizeObserver((e) => { const cr = e[0]?.contentRect; if (cr) controller?.resize(cr.width, cr.height); });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });
  onDestroy(() => { ro?.disconnect(); controller?.dispose(); controller = null; });

  // Re-apply on any prop change (setData/setFilter short-circuit cheaply).
  $: if (controller) { smSystems; smRoutes; grid; background; angleDeg; labelSize; font; filter; filterParams; accentColor; apply(); }
</script>

<div class="sm3d-root" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .sm3d-root { position: absolute; inset: 0; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>

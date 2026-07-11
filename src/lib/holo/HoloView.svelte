<script lang="ts">
  // Thin Svelte wrapper around the imperative three.js holo scene. Deliberately holds NO static
  // import of three or ./scene — the scene module is dynamically imported on mount so three.js is
  // code-split into its own chunk and the 2D app never pays for it. Mirrors the prop surface of
  // SystemVisualizer so the catalogue/projector can swap one for the other.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { System } from '$lib/types';
  import type { HoloController } from '$lib/holo/scene';
  import { DEFAULT_STYLE, type HoloStyle } from '$lib/holo/holoStyle';

  const dispatch = createEventDispatcher<{ focus: string }>();

  export let system: System | null = null;
  export let currentTime: number = 0;
  // Accepted for prop-parity with SystemVisualizer; wired to camera focus in a later increment.
  export let focusedBodyId: string | null = null;
  // The full look bundle (filter, compression, framing, skybox) — a GM preset or live-tweaked style.
  export let style: HoloStyle = DEFAULT_STYLE;
  // Momentary GM overrides (NOT part of the saved style): quick label show/hide and a filter bypass
  // to briefly drop the visual filter if it's hard to read.
  export let labelsVisible: boolean = true;
  export let filterBypass: boolean = false;
  export let orbitPaused: boolean = false; // momentarily stop the auto view-orbit turntable
  // A pre-rendered static info-card canvas composited INTO the scene so the GPU filter warps/tints it
  // like the 3D (no CSS approximation). null = no HUD.
  export let hudCanvas: HTMLCanvasElement | null = null;

  function applyStyle(s: HoloStyle) {
    // Filter can be momentarily bypassed without changing the saved style.
    controller?.setFilter(filterBypass ? 'none' : s.filter, filterBypass ? undefined : s.filterParams);
    controller?.setFraming({ angleDeg: s.angleDeg, whole: s.whole });
    controller?.setSkybox(s.skybox);
    controller?.setBackground(s.background);
    controller?.setCompression(s.compression);
    controller?.setBeltDetail(s.beltDetail);
    controller?.setBodyStyle(s.bodyStyle);
    controller?.setRender(s.render ?? 'filled');
    controller?.setUnlit(s.unlit ?? false);
    controller?.setAuroras(s.auroras ?? true);
    controller?.setBodySize(s.bodySize);
    controller?.setGrid(s.grid);
    controller?.setOrbitSpeed(orbitPaused ? 0 : s.orbitSpeed);
    controller?.setLabelSize(s.labelSize ?? 11);
    controller?.setLabelFont(s.font ?? null);
    // Labels are in-scene sprites now, so the shader tints them under CRT automatically — keep them a
    // neutral light colour and let the filter do the colouring (true to "impacted by the filter").
    controller?.setLabelColor(null);
    controller?.setLabelsVisible(labelsVisible);
  }

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
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
      controller = createHoloScene(canvas, { onSelect: (id) => dispatch('focus', id) });
      controller.setSystem(system);
      controller.setTime(currentTime);
      controller.focusBody(focusedBodyId);
      applyStyle(style);
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

  // Reactive feeds (guarded until the scene has loaded). setCompression/setFilter short-circuit when
  // the value is unchanged, so re-applying the whole style on any tweak is cheap.
  $: controller?.setSystem(system);
  $: controller?.setTime(currentTime);
  $: controller?.focusBody(focusedBodyId);
  $: if (controller) applyStyle(style);
  $: controller?.setHud(hudCanvas);
  // Re-apply when the momentary overrides change (style is unchanged, so these need their own trigger).
  $: if (controller) { labelsVisible; filterBypass; orbitPaused; applyStyle(style); }
</script>

<div class="holo-root" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
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
</style>

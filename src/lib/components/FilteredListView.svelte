<script lang="ts">
  // A text list rendered to a canvas and shown through the REAL GPU filter (createFilteredCanvas),
  // retiring the CSS approximation for the simple "list" modules. Stays interactive: wheel / drag to
  // scroll, and a tap is warp-mapped through the shader so it selects the row the eye sees even under
  // barrel warp or picture-roll. Lazy-imports three (via filteredCanvas) so it code-splits.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { FilteredCanvasController } from '$lib/holo/filteredCanvas';
  import type { FilterParamValues } from '$lib/holo/filters/schema';
  import { drawList, type ListModel, type ListTips, type RowHit } from '$lib/catalogue/listCanvas';

  export let model: ListModel;
  export let accent = '#6aa0ff';
  export let font = 'system-ui';
  export let mono = false;
  export let filterId = 'none';
  export let filterParams: FilterParamValues = {};
  export let selectedId: string | null = null;
  export let selectable = false;
  export let tips: ListTips | null = null;

  const dispatch = createEventDispatcher<{ select: string }>();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctrl: FilteredCanvasController | null = null;
  let ro: ResizeObserver | null = null;
  let vw = 0, vh = 0;
  let scrollY = 0;
  let rowHits: RowHit[] = [];
  let contentH = 0;

  function render() {
    if (!ctrl || vw <= 0 || vh <= 0) return;
    const maxScroll = Math.max(0, contentH - vh);
    if (scrollY > maxScroll) scrollY = maxScroll;
    if (scrollY < 0) scrollY = 0;
    const res = drawList({ viewW: vw, viewH: vh, scrollY, model, accent, font, mono, selectedId, tips });
    rowHits = res.rows; contentH = res.contentH;
    ctrl.setSource(res.canvas);
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const { createFilteredCanvas } = await import('$lib/holo/filteredCanvas');
      if (cancelled || !canvas) return;
      ctrl = createFilteredCanvas(canvas);
      ctrl.setFilter(filterId, filterParams);
      const r = container.getBoundingClientRect();
      vw = r.width; vh = r.height;
      ctrl.resize(vw, vh);
      render();
      ro = new ResizeObserver((e) => { const cr = e[0]?.contentRect; if (cr) { vw = cr.width; vh = cr.height; ctrl?.resize(vw, vh); render(); } });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });
  onDestroy(() => { ro?.disconnect(); ctrl?.dispose(); ctrl = null; });

  // Re-render on data / theme / selection / scroll change; re-apply the filter separately.
  $: if (ctrl) { model; accent; font; mono; selectedId; tips; scrollY; render(); }
  $: ctrl?.setFilter(filterId, filterParams);

  function onWheel(e: WheelEvent) {
    if (contentH <= vh) return;
    e.preventDefault();
    scrollY = Math.max(0, Math.min(scrollY + e.deltaY, contentH - vh));
  }

  // Pointer: distinguish a tap (select) from a drag (scroll).
  let downX = 0, downY = 0, downScroll = 0, dragged = false, pointerDown = false;
  function onPointerDown(e: PointerEvent) {
    pointerDown = true; dragged = false;
    downX = e.clientX; downY = e.clientY; downScroll = scrollY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!pointerDown) return;
    const dy = e.clientY - downY;
    if (Math.abs(dy) > 4 || Math.abs(e.clientX - downX) > 4) dragged = true;
    if (contentH > vh) scrollY = Math.max(0, Math.min(downScroll - dy, contentH - vh));
  }
  function onPointerUp(e: PointerEvent) {
    pointerDown = false;
    if (dragged || !selectable || !ctrl) return;
    const rect = canvas.getBoundingClientRect();
    // Screen uv (y-up) → warp through the shader → source uv → view px → row.
    const su = (e.clientX - rect.left) / rect.width;
    const sv = 1 - (e.clientY - rect.top) / rect.height;
    const [u, v] = ctrl.warpPoint(su, sv);
    const px = u * vw, py = (1 - v) * vh; // back to top-down view px
    const hit = rowHits.find((r) => py >= r.y0 && py < r.y1);
    if (hit) {
      const row = model.rows.find((r) => r.id === hit.id);
      if (!row || row.selectable === false) return;
      dispatch('select', hit.id);
    }
  }
</script>

<div class="fl-root" bind:this={container} class:selectable
     on:wheel={onWheel} on:pointerdown={onPointerDown} on:pointermove={onPointerMove} on:pointerup={onPointerUp}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .fl-root { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
  .fl-root.selectable { cursor: pointer; }
  canvas { display: block; width: 100%; height: 100%; }
</style>

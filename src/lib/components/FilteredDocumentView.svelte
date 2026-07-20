<script lang="ts">
  // The WS2 Guide document, rendered to a canvas and shown through the REAL GPU filter — the schematic,
  // the selected body's in-page info block, and its moon/construct navigator lists, all drawn by the ONE
  // block-model engine (renderDocument) and wrecked by the same shader as the rest of the player view.
  // Interactive: wheel/drag scrolls, and a tap is warp-mapped through the shader so it selects the body
  // the eye sees — either a planet/star on the schematic (2D hit box) or a navigator row. Mirrors
  // FilteredListView's filter + warp plumbing; lazy-imports the shader so it code-splits.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { FilteredCanvasController } from '$lib/holo/filteredCanvas';
  import type { FilterParamValues } from '$lib/holo/filters/schema';
  import type { System } from '$lib/types';
  import type { MeasurementUnits, TemperatureUnit } from '$lib/units';
  import { renderDocument, type DocRegion } from '$lib/catalogue/document/renderDocument';
  import { resolveDocColors, type DocTheme, type ListStyle, type DocumentStyle, type DocColors } from '$lib/catalogue/document/blocks';
  import { documentStyleBase } from '$lib/catalogue/document/documentStyles';
  import { buildGuideDocument } from '$lib/catalogue/document/guideDocument';
  import { drawTipBanner, drawOverlay, type HudOverlay } from '$lib/catalogue/infoCard';

  export let system: System;
  export let selectedId: string | null = null;
  export let font = 'system-ui';
  export let accent = '#6aa0ff';
  export let mono = false;
  export let colorful = false;            // The Guide's rainbow schematic
  export let listStyle: ListStyle | undefined = undefined;
  export let documentStyle: DocumentStyle | undefined = undefined;
  export let themeColors: DocColors | undefined = undefined;
  export let fontScale = 1;
  export let imagery: 'disc' | 'photo' | 'none' = 'none';
  export let hideInfoBlock = false; // clean display: schematic only, no per-body file
  export let filterId = 'none';
  export let filterParams: FilterParamValues = {};
  export let selectable = false;
  export let units: MeasurementUnits = 'metric';
  export let tempUnit: TemperatureUnit = 'C';
  export let tips: { top?: string; bottom?: string } | null = null;
  export let overlay: HudOverlay | null = null;
  export let companyName = '';
  export let footerText = '';

  const dispatch = createEventDispatcher<{ select: string }>();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctrl: FilteredCanvasController | null = null;
  let ro: ResizeObserver | null = null;
  let vw = 0, vh = 0;
  let scrollY = 0;
  let regions: DocRegion[] = [];
  let contentH = 0;

  // The selected body's picture (GM uploads are data URLs → safe to texture; a cross-origin stock image
  // would taint the WebGL surface, so we only draw data-URL images).
  let bodyImg: CanvasImageSource | null = null;
  let bodyImgAspect = 1.6;
  let imgForId: string | null = null;
  // The documentStyle drives the whole look (font + colour set + list glyphs); the preset's explicit
  // themeColors / listStyle / mono override it. A rainbow accent lights the schematic (colorful), while
  // the text keeps the style's own readable accent.
  $: styleBase = documentStyleBase(documentStyle);
  $: theme = {
    font: styleBase.font,
    fontScale, mono,
    accent: accent && accent !== 'rainbow' ? accent : styleBase.colors.accent,
    colors: { ...styleBase.colors, ...(themeColors ?? {}) },
    listStyle: listStyle ?? styleBase.listStyle,
    documentStyle
  } as DocTheme;

  $: if (imagery === 'photo' && selectedId && selectedId !== imgForId) loadBodyImage(selectedId);
  $: if (imagery !== 'photo' || !selectedId) { bodyImg = null; imgForId = selectedId; }

  function loadBodyImage(id: string) {
    imgForId = id; bodyImg = null;
    const n: any = (system?.nodes ?? []).find((x) => x.id === id);
    const url: string | undefined = n?.image?.url;
    if (!url || !url.startsWith('data:')) return; // only same-origin data URLs (no WebGL taint)
    const im = new Image();
    im.onload = () => { if (imgForId === id) { bodyImg = im; bodyImgAspect = (im.naturalWidth || 1) / (im.naturalHeight || 1); render(); } };
    im.src = url;
  }

  function render() {
    if (!ctrl || vw <= 0 || vh <= 0) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const off = document.createElement('canvas');
    off.width = Math.max(2, Math.round(vw * dpr));
    off.height = Math.max(2, Math.round(vh * dpr));
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const c = resolveDocColors(theme);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, vw, vh);

    const mx = Math.round(vw * 0.045), my = Math.round(vh * 0.05);
    const maxScroll = Math.max(0, contentH - vh);
    if (scrollY > maxScroll) scrollY = maxScroll;
    if (scrollY < 0) scrollY = 0;

    const blocks = buildGuideDocument(system, selectedId, {
      units, tempUnit, colorful, imagery,
      image: bodyImg, imageAspect: bodyImgAspect, hideInfo: hideInfoBlock
    });
    const res = renderDocument(ctx, blocks, theme, { x: mx, y: my, w: vw - mx * 2, maxY: vh - my, scrollY });
    regions = res.regions;
    contentH = my + res.contentH + my;

    if (overlay) drawOverlay(ctx, overlay, vw, vh);
    if (tips) {
      const to = { accent: c.accent, font: theme.font, mono };
      if (tips.top) drawTipBanner(ctx, tips.top, 'top', vw, vh, to);
      if (tips.bottom) drawTipBanner(ctx, tips.bottom, 'bottom', vw, vh, to);
    }
    // Footer corner stamps (inside the page, like the cover).
    if (companyName || footerText) {
      ctx.font = `${Math.round(11 * fontScale)}px ${theme.font}`;
      ctx.fillStyle = c.dim;
      ctx.textBaseline = 'alphabetic';
      if (companyName) { ctx.textAlign = 'left'; ctx.fillText(companyName.toUpperCase(), mx, vh - Math.round(my * 0.4)); }
      if (footerText) { ctx.textAlign = 'right'; ctx.fillText(footerText, vw - mx, vh - Math.round(my * 0.4)); }
    }

    ctrl.setSource(off);
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

  // Redraw on data / theme / selection / scroll change; re-apply the filter separately.
  $: if (ctrl) { system; selectedId; font; accent; mono; colorful; listStyle; documentStyle; themeColors; fontScale; imagery; hideInfoBlock; tips; overlay; companyName; footerText; scrollY; render(); }
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
    // Screen uv (y-up) → warp through the shader → source uv → view px → region.
    const su = (e.clientX - rect.left) / rect.width;
    const sv = 1 - (e.clientY - rect.top) / rect.height;
    const [u, v] = ctrl.warpPoint(su, sv);
    const px = u * vw, py = (1 - v) * vh;
    // First matching region: 2D schematic boxes check x + y; 1D rows (no x bounds) check y only.
    const hit = regions.find((r) =>
      py >= r.y0 && py < r.y1 && (r.x0 === undefined || (px >= r.x0 && px <= (r.x1 ?? vw))));
    if (hit) dispatch('select', hit.id);
  }
</script>

<div class="fd-root" bind:this={container} class:selectable
     on:wheel={onWheel} on:pointerdown={onPointerDown} on:pointermove={onPointerMove} on:pointerup={onPointerUp}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .fd-root { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
  .fd-root.selectable { cursor: pointer; }
  canvas { display: block; width: 100%; height: 100%; }
</style>

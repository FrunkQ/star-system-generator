<script lang="ts">
  // The WS2 Guide document, rendered to a canvas and shown through the REAL GPU filter — the schematic,
  // the selected body's in-page info block, and its moon/construct navigator lists, all drawn by the ONE
  // block-model engine (renderDocument) and wrecked by the same shader as the rest of the player view.
  // Interactive: wheel/drag scrolls, and a tap is warp-mapped through the shader so it selects the body
  // the eye sees — either a planet/star on the schematic (2D hit box) or a navigator row. Mirrors
  // FilteredListView's filter + warp plumbing; lazy-imports the shader so it code-splits.
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { transitionRegistry } from '$lib/transitions/TransitionRegistry';
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
  export let headingFont: string | undefined = undefined; // falls back to `font`
  export let accent = '#6aa0ff';
  export let mono = false;
  export let colorful = false;            // The Guide's rainbow schematic
  export let listStyle: ListStyle | undefined = undefined;
  export let documentStyle: DocumentStyle | undefined = undefined;
  export let navStyle: import('$lib/catalogue/document/blocks').NavStyle | undefined = undefined;
  export let tagStyle: import('$lib/catalogue/document/blocks').TagStyle | undefined = undefined;
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
  export let transition = 'none';                    // page/entry transition on selection change
  export let transitionParams: FilterParamValues = {};

  const dispatch = createEventDispatcher<{ select: string }>();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let overlayCanvas: HTMLCanvasElement;              // transition plays here, above the filtered canvas
  let engine: import('$lib/transitions/TransitionEngine').TransitionEngine | null = null;
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
    font,                                  // respect the preset's chosen body font
    headingFont: headingFont || font,      // and its heading font (defaults to body)
    fontScale, mono,
    accent: accent && accent !== 'rainbow' ? accent : styleBase.colors.accent,
    // The documentStyle SEEDS the colours; the preset's themeColors override any slot the user tweaked.
    colors: { ...styleBase.colors, ...(themeColors ?? {}) },
    listStyle: listStyle ?? styleBase.listStyle,
    documentStyle, navStyle
  } as DocTheme;

  $: if (imagery === 'photo' && selectedId && selectedId !== imgForId) loadBodyImage(selectedId);
  $: if (imagery !== 'photo' || !selectedId) { bodyImg = null; imgForId = selectedId; }

  function loadBodyImage(id: string) {
    imgForId = id; bodyImg = null;
    const n: any = (system?.nodes ?? []).find((x) => x.id === id);
    const url: string | undefined = n?.image?.url;
    // Same-origin images only (data: URLs, app-relative paths like /images/…, or this origin) — a
    // cross-origin image would taint the WebGL surface the filter reads from.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const sameOrigin = !!url && (url.startsWith('data:') || url.startsWith('/') || (!!origin && url.startsWith(origin)));
    if (!sameOrigin) return;
    const im = new Image();
    im.onload = () => { if (imgForId === id) { bodyImg = im; bodyImgAspect = (im.naturalWidth || 1) / (im.naturalHeight || 1); render(); } };
    im.src = url!;
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
      image: bodyImg, imageAspect: bodyImgAspect, hideInfo: hideInfoBlock, tagStyle
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
      const { TransitionEngine } = await import('$lib/transitions/TransitionEngine');
      if (!cancelled && overlayCanvas) engine = new TransitionEngine(overlayCanvas);
      const r = container.getBoundingClientRect();
      vw = r.width; vh = r.height;
      ctrl.resize(vw, vh);
      render();
      ro = new ResizeObserver((e) => { const cr = e[0]?.contentRect; if (cr) { vw = cr.width; vh = cr.height; ctrl?.resize(vw, vh); render(); } });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });
  onDestroy(() => { ro?.disconnect(); engine?.cancel(); engine = null; ctrl?.dispose(); ctrl = null; });

  // Redraw on data / theme / scroll change. Selection change is handled separately so it can play a
  // transition (which must snapshot the OLD frame BEFORE the re-render) — hence selectedId is NOT here.
  $: if (ctrl) { system; font; headingFont; accent; mono; colorful; listStyle; documentStyle; navStyle; tagStyle; themeColors; fontScale; imagery; hideInfoBlock; tips; overlay; companyName; footerText; scrollY; render(); }
  $: if (ctrl) handleSelection(selectedId);
  $: ctrl?.setFilter(filterId, filterParams);

  // On selection change, play the configured transition: the engine snapshots the current frame, we
  // re-render underneath, then it animates the snapshot away to reveal the new page. The first pass and
  // 'none' just render straight.
  let firstSelDone = false, prevSel: string | null = null;
  async function handleSelection(sel: string | null) {
    if (!ctrl) return;
    if (!firstSelDone) { firstSelDone = true; prevSel = sel; return; } // initial paint handled above
    if (sel === prevSel) return;
    prevSel = sel;
    const def = engine ? transitionRegistry.get(transition) : null;
    if (!engine || !def || def.id === 'none') { render(); return; }
    try { await engine.run(def, transitionParams, canvas, async () => { render(); await tick(); }); }
    catch { render(); }
  }

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
  <!-- Transition overlay: the engine paints the outgoing snapshot here and animates it away. Sits above
       the filtered canvas, ignores pointer events (taps reach the document), and is clear when idle. -->
  <canvas class="fd-transition" bind:this={overlayCanvas}></canvas>
</div>

<style>
  .fd-root { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
  .fd-root.selectable { cursor: pointer; }
  canvas { display: block; width: 100%; height: 100%; }
  .fd-transition { position: absolute; inset: 0; pointer-events: none; }
</style>

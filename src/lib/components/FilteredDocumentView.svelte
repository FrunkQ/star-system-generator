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
  import { makeDocTheme } from '$lib/catalogue/document/documentStyles';
  import { buildGuideDocument } from '$lib/catalogue/document/guideDocument';
  import { loadBodyImage as loadBodyImageShared } from '$lib/catalogue/document/bodyImage';
  import { isBary, dominantOf, isRinged, starsOf } from '$lib/catalogue/document/systemTopology';
  import { drawTipBanner, tipBannerHeight, drawOverlay, type HudOverlay } from '$lib/catalogue/infoCard';
  import BodyGraphic from './BodyGraphic.svelte';

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
  export let imagery: 'sphere' | 'disc' | 'flat' | 'photo' | 'none' = 'none';
  export let photoFrame: 'letterbox' | 'full' | 'sliver' = 'letterbox';
  export let bodyRender: import('$lib/holo/scene').RenderStyle = 'filled'; // 3D body: filled / lo-poly / wireframe
  export let bodyStyle: 'textured' | 'flat' | 'white' = 'textured';    // 3D body: true / flat / monochrome colour
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
  // Screen rect (view px) of the reserved body-graphic gap, so the BodyGraphic overlay can sit there.
  let gfxRect: { x: number; y: number; w: number; h: number } | null = null;

  // The subject body for the picture (a barycentre shows its dominant member, matching the document).
  $: subjectBody = (() => {
    const n: any = (system?.nodes ?? []).find((x) => x.id === selectedId);
    if (!n) return null;
    return isBary(n) ? (dominantOf(system, n) as any) : n;
  })();
  $: subjectRinged = subjectBody ? isRinged(system, subjectBody.id) : false;
  $: gfxOn = imagery === 'sphere' || imagery === 'disc' || imagery === 'flat';
  // A minimal single-body system for the 3D holo body graphic. The BODY sits at origin (so the holo's
  // focus fills the frame with it) with its ring child; the system's real STAR is placed OFF to the side
  // (a big fabricated orbit around the body) so it stays off-frame but lights the body from a 3/4 angle —
  // mostly day, a sliver of night — in the star's true colour. A planet with no star renders unlit (a
  // flat circle), which is why the star must be present. The real HoloView draws it, so sunspots, the
  // black-hole disc + lensing, render styles and true/flat/mono colour all come from the actual 3D engine.
  // A single-body system for the 3D portrait: JUST the body (+ its rings). No fabricated star — a stray
  // star sphere/corona would crash the frame and skew the aurora flux; the holo's PORTRAIT key light
  // (coloured by the real star below) lights the day/night terminator instead.
  $: bodyGfxSystem = (subjectBody && imagery === 'sphere') ? (() => {
    // Wrap the subject in a synthetic, invisible root barycentre and PARENT the body to it. The holo
    // treats a root-level `kind:'body'` (parentId null) as the system's STAR (self-emissive + corona),
    // so a lone planet would render as a glowing green ball — parenting it keeps it classified as a
    // planet (a star subject still reads as a star via its own roleHint). No orbit → sits at the origin.
    const root = { id: '__root', name: '', kind: 'barycenter', parentId: null, orbit: undefined };
    const bodyNode = { ...subjectBody, parentId: '__root', orbit: undefined };
    const rings = (system?.nodes ?? []).filter((n: any) => (n.parentId === subjectBody.id || n.orbit?.hostId === subjectBody.id) && n.roleHint === 'ring')
      .map((r: any) => ({ ...r, parentId: subjectBody.id }));
    return {
      id: 'bg', name: '', seed: 'bg', epochT0: 0, age_Gyr: (system as any)?.age_Gyr ?? 4.5,
      nodes: [root, bodyNode, ...rings], rulePackId: '', rulePackVersion: '', tags: []
    };
  })() as any : null;
  // Colour of the system's star — "the sun provides the right colour" for the portrait key light.
  $: starHex = (starsOf(system)[0] as any)?.apparentColorHex ?? null;
  $: docBg = resolveDocColors(theme).bg;

  // The selected body's picture (GM uploads are data URLs → safe to texture; a cross-origin stock image
  // would taint the WebGL surface, so we only draw data-URL images).
  let bodyImg: CanvasImageSource | null = null;
  let bodyImgAspect = 1.6;
  let bodyImgFocus: import('$lib/catalogue/document/blocks').ImageFocus | null = null;
  let imgForId: string | null = null;
  // ONE shared theme resolver (makeDocTheme) — the same call the 2D/3D info panel makes, so the
  // document and every info block resolve the preset's appearance identically.
  $: theme = makeDocTheme({ font, headingFont, fontScale, mono, accent, documentStyle, themeColors, listStyle, navStyle }) as DocTheme;

  $: if (imagery === 'photo' && selectedId && selectedId !== imgForId) loadBodyImage(selectedId);
  $: if (imagery !== 'photo' || !selectedId) { bodyImg = null; imgForId = selectedId; }

  function loadBodyImage(id: string) {
    imgForId = id; bodyImg = null; bodyImgFocus = null;
    // Shared loader (same-origin rule + auto-centre focus live in ONE place — bodyImage.ts).
    loadBodyImageShared(system, id, (l) => {
      if (imgForId !== id || !l) return;
      bodyImg = l.img; bodyImgAspect = l.aspect; bodyImgFocus = l.focus;
      render();
    });
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
      image: bodyImg, imageAspect: bodyImgAspect, imageFocus: bodyImgFocus, hideInfo: hideInfoBlock, tagStyle, photoFrame
    });
    // GENUINE header/footer: reserve a band for the tip banners (and the company/footer stamps) so the
    // body flows BETWEEN them instead of running underneath — and clip the body to that band so scrolled
    // content can't spill into the header/footer either. They still live in this canvas, so the filter
    // wrecks them along with everything else.
    const tipOpts = { accent: c.accent, font: theme.font, mono };
    const gap = Math.round(vh * 0.012);
    // The banners are full-width bands flush to the top/bottom EDGE (y=0 and vh-barH), so the body starts
    // just below the header band and ends just above the footer band + any company/footer stamps.
    const headBar = tips?.top ? tipBannerHeight(ctx, tips.top, 'top', vw, vh, tipOpts) : 0;
    const footBar = tips?.bottom ? tipBannerHeight(ctx, tips.bottom, 'bottom', vw, vh, tipOpts) : 0;
    const footStamp = (companyName || footerText) ? Math.round(16 * fontScale) : 0;
    const bodyTop = headBar ? headBar + gap : my;
    const bodyBot = (footBar || footStamp) ? vh - footBar - footStamp - gap : vh - my;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, bodyTop, vw, Math.max(0, bodyBot - bodyTop)); ctx.clip();
    const res = renderDocument(ctx, blocks, theme, { x: mx, y: bodyTop, w: vw - mx * 2, maxY: bodyBot, scrollY });
    ctx.restore();
    regions = res.regions;
    contentH = bodyTop + res.contentH + (vh - bodyBot);
    const gr = res.regions.find((r) => r.id === '__bodygfx');
    gfxRect = gr ? { x: gr.x0 ?? mx, y: gr.y0, w: (gr.x1 ?? (vw - mx)) - (gr.x0 ?? mx), h: gr.y1 - gr.y0 } : null;

    if (overlay) drawOverlay(ctx, overlay, vw, vh);
    if (tips) {
      const to = { accent: c.accent, font: theme.font, mono };
      if (tips.top) drawTipBanner(ctx, tips.top, 'top', vw, vh, to);
      if (tips.bottom) drawTipBanner(ctx, tips.bottom, 'bottom', vw, vh, to);
    }
    // Company / footer stamps sit just ABOVE any footer band (or at the bottom margin when there's none).
    if (companyName || footerText) {
      const stampY = vh - footBar - Math.round(footStamp ? footStamp * 0.35 : my * 0.4);
      ctx.font = `${Math.round(11 * fontScale)}px ${theme.font}`;
      ctx.fillStyle = c.dim;
      ctx.textBaseline = 'alphabetic';
      if (companyName) { ctx.textAlign = 'left'; ctx.fillText(companyName.toUpperCase(), mx, stampY); }
      if (footerText) { ctx.textAlign = 'right'; ctx.fillText(footerText, vw - mx, stampY); }
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
  $: if (ctrl) { system; font; headingFont; accent; mono; colorful; listStyle; documentStyle; navStyle; tagStyle; themeColors; fontScale; imagery; photoFrame; hideInfoBlock; tips; overlay; companyName; footerText; scrollY; render(); }
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
    if (hit && !hit.id.startsWith('__')) dispatch('select', hit.id); // '__' regions (body-graphic gap) aren't selectable
  }
</script>

<div class="fd-root" bind:this={container} class:selectable
     on:wheel={onWheel} on:pointerdown={onPointerDown} on:pointermove={onPointerMove} on:pointerup={onPointerUp}>
  <canvas bind:this={canvas}></canvas>
  <!-- Body graphic: the REAL renderers (PlanetDisc 2D / holo 3D spin), overlaid in the reserved gap. -->
  {#if gfxOn && gfxRect && subjectBody}
    <div class="fd-bodygfx" class:interactive={selectable && imagery === 'sphere'}
         style="left:{gfxRect.x}px; top:{gfxRect.y}px; width:{gfxRect.w}px; height:{gfxRect.h}px;">
      <BodyGraphic body={subjectBody} system={bodyGfxSystem} mode={imagery === 'sphere' ? 'sphere' : imagery === 'flat' ? 'flat' : 'disc'}
        ringed={subjectRinged} {mono} render={bodyRender} {bodyStyle} bg={docBg} {starHex}
        interactive={selectable && imagery === 'sphere'} />
    </div>
  {/if}
  <!-- Transition overlay: the engine paints the outgoing snapshot here and animates it away. Sits above
       the filtered canvas, ignores pointer events (taps reach the document), and is clear when idle. -->
  <canvas class="fd-transition" bind:this={overlayCanvas}></canvas>
</div>

<style>
  .fd-root { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
  .fd-root.selectable { cursor: pointer; }
  canvas { display: block; width: 100%; height: 100%; }
  .fd-transition { position: absolute; inset: 0; pointer-events: none; }
  .fd-bodygfx { position: absolute; pointer-events: none; display: flex; align-items: center; justify-content: center; }
  /* Interactive 3D thumbnail: capture drags so the player can spin the body by hand (grab cursor). */
  .fd-bodygfx.interactive { pointer-events: auto; cursor: grab; }
  .fd-bodygfx.interactive:active { cursor: grabbing; }
</style>

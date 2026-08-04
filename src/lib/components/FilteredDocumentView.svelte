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
  import { buildStarmapDocument } from '$lib/catalogue/document/starmapDocument';
  import { loadBodyImage as loadBodyImageShared } from '$lib/catalogue/document/bodyImage';
  import { isBary, dominantOf, isRinged, starsOf } from '$lib/catalogue/document/systemTopology';
  import { drawTipBanner, tipBannerHeight, drawOverlay, type HudOverlay } from '$lib/catalogue/infoCard';
  import BodyGraphic from './BodyGraphic.svelte';
  import ConstructModelGraphic from './ConstructModelGraphic.svelte';

  // D9: the same component renders the SYSTEM Guide document or the STARMAP document (the systems
  // index) — one engine, one theme, one filter/scroll/tap pipeline for both stages.
  export let stage: 'system' | 'starmap' = 'system';
  export let starmap: import('$lib/types').Starmap | null = null;
  export let system: System | null = null;
  export let selectedId: string | null = null;
  export let font = 'system-ui';
  export let headingFont: string | undefined = undefined; // falls back to `font`
  export let accent = '#6aa0ff';
  export let mono = false;
  export let colorful = false;            // The Guide's rainbow schematic
  export let listStyle: ListStyle | undefined = undefined;
  export let documentStyle: DocumentStyle | undefined = undefined;
  export let navStyle: import('$lib/catalogue/document/blocks').NavStyle | undefined = undefined;
  // G1: the starmap document's ARRANGEMENT (shape), composing with documentStyle and listStyle.
  export let starmapLayout: import('$lib/catalogue/document/starmapDocument').StarmapLayout | undefined = undefined;
  export let starmapFieldIcons = true;
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
  // Names a construct's engines and fuels so its mass, Δv and acceleration can be derived (A2).
  // Optional: without it the construct block simply omits those rows.
  export let rulePack: import('$lib/types').RulePack | null = null;
  // A29: show a construct's current fuel/cargo/crew, not just its capacity. Preset-driven.
  export let liveReadings = false;
  // G8: the campaign clock, so a printed report carries the same "Next eclipse" row the live panel does.
  export let nowMs: number | null = null;
  export let formatDate: ((ms: number) => string) | undefined = undefined;
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
  // G3: a construct with a model takes the turntable in the reserved gap instead of BodyGraphic.
  $: subjectModel = subjectBody?.kind === 'construct' ? ((subjectBody as any).model ?? null) : null;
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

  // Key on subject AND mode, not the subject alone -- see DocPanel: switching Body graphics to 'photo'
  // without changing the selected body left imgForId already stamped, so the loader never ran.
  $: photoKey = imagery === 'photo' && selectedId ? selectedId : null;
  $: if (photoKey !== imgForId) {
    if (photoKey) loadBodyImage(photoKey);
    else { bodyImg = null; bodyImgFocus = null; imgForId = null; }
  }

  function loadBodyImage(id: string) {
    imgForId = id; bodyImg = null; bodyImgFocus = null;
    // Shared loader (same-origin rule + auto-centre focus live in ONE place — bodyImage.ts).
    loadBodyImageShared(system, id, (l) => {
      if (imgForId !== id || !l) return;
      bodyImg = l.img; bodyImgAspect = l.aspect; bodyImgFocus = l.focus;
      render();
    });
  }

  // The document's own offscreen canvas. Module-scoped rather than local to render(), because the
  // body-graphic capture loop composites ON TOP of it every frame and needs the same pixels render()
  // last produced (A38). Reused across renders, so the loop never holds a stale canvas.
  let off: HTMLCanvasElement = typeof document !== 'undefined' ? document.createElement('canvas') : (null as any);

  function render() {
    if (!ctrl || vw <= 0 || vh <= 0) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    if (!off) off = document.createElement('canvas');
    off.width = Math.max(2, Math.round(vw * dpr));
    off.height = Math.max(2, Math.round(vh * dpr));
    const ctx = off.getContext('2d');
    if (!ctx) return;
    // Reused canvas: reset the transform and wipe, or successive renders stack on stale pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, off.width, off.height);
    ctx.scale(dpr, dpr);

    const c = resolveDocColors(theme);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, vw, vh);

    const mx = Math.round(vw * 0.045), my = Math.round(vh * 0.05);
    const maxScroll = Math.max(0, contentH - vh);
    if (scrollY > maxScroll) scrollY = maxScroll;
    if (scrollY < 0) scrollY = 0;

    // One engine, two stages: the starmap document (systems index) or the system Guide document.
    const blocks = stage === 'starmap'
      ? buildStarmapDocument(starmap, { selectedId, layout: starmapLayout, colorful: accent === 'rainbow', fieldIcons: starmapFieldIcons })
      : (system ? buildGuideDocument(system, selectedId, {
          units, tempUnit, colorful, imagery, rulePack, liveReadings, nowMs: nowMs ?? undefined, formatDate,
          image: bodyImg, imageAspect: bodyImgAspect, imageFocus: bodyImgFocus, hideInfo: hideInfoBlock, tagStyle, photoFrame
        }) : []);
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

    // The document is now complete EXCEPT the body graphic, which lives in the reserved gap. Hand the
    // filter whichever canvas the capture loop is maintaining, so the two paths agree on the source.
    ctrl.setSource(gfxCapturable ? compositeFrame() : off);
  }

  // --- A38: the body graphic goes INSIDE the filter pass -------------------------------------------
  //
  // `renderDocument` reserves a transparent GAP for it and the real renderer used to be positioned over
  // the filtered canvas as a sibling div — so a green CRT page carried a plain white sphere sitting on
  // top of the phosphor, outside the shader entirely. The fix is to draw the renderer's own pixels INTO
  // the texture the filter reads, not to re-tint it: a second implementation of the filter is exactly
  // the drift F9 was.
  //
  // Only for the canvas-backed modes. `sphere` is HoloView's WebGL canvas (which needs
  // preserveDrawingBuffer, set in holo/scene.ts) and `flat` is PlanetDisc's 2D one. The simple `disc`
  // mode is an inline SVG with no canvas to capture, so it keeps the overlay — see the inbox note.
  let gfxComp: BodyGraphic | null = null;
  let mdlComp: ConstructModelGraphic | null = null; // G3: the construct-model turntable, same getCanvas contract
  let composite: HTMLCanvasElement | null = null;
  let gfxRaf = 0;
  // A construct model is a WebGL canvas like the sphere, so it is capturable under any imagery mode.
  $: gfxCapturable = gfxOn && !!gfxRect && !!subjectBody && filterId !== 'none' && (imagery !== 'disc' || !!subjectModel);

  function compositeFrame(): HTMLCanvasElement {
    const src = mdlComp?.getCanvas() ?? gfxComp?.getCanvas() ?? null;
    if (!composite) composite = document.createElement('canvas');
    if (composite.width !== off.width || composite.height !== off.height) {
      composite.width = off.width; composite.height = off.height;
    }
    const cx = composite.getContext('2d');
    if (!cx) return off;
    cx.clearRect(0, 0, composite.width, composite.height);
    cx.drawImage(off, 0, 0);
    // The gap is in CSS px and the offscreen canvas is in device px — same scale `render()` used.
    if (src && src.width > 0 && src.height > 0 && gfxRect) {
      const dpr = off.width / Math.max(1, vw);
      // Fit inside the reserved rect, centred, preserving the renderer's own aspect.
      const rw = gfxRect.w * dpr, rh = gfxRect.h * dpr;
      const scale = Math.min(rw / src.width, rh / src.height);
      const dw = src.width * scale, dh = src.height * scale;
      try {
        cx.drawImage(src, gfxRect.x * dpr + (rw - dw) / 2, gfxRect.y * dpr + (rh - dh) / 2, dw, dh);
      } catch { /* a tainted or not-yet-ready source: show the document without it rather than throw */ }
    }
    return composite;
  }

  // Re-upload every frame, because a 3D body SPINS and a static texture would freeze it mid-turn. Only
  // runs while a capturable graphic is actually on screen; `setSource` with the same canvas just flags
  // the texture dirty, so this is one drawImage pair per frame and no allocation.
  function gfxLoop() {
    if (ctrl && gfxCapturable) ctrl.setSource(compositeFrame());
    gfxRaf = requestAnimationFrame(gfxLoop);
  }
  $: if (typeof requestAnimationFrame !== 'undefined') {
    if (gfxCapturable && !gfxRaf) gfxRaf = requestAnimationFrame(gfxLoop);
    else if (!gfxCapturable && gfxRaf) { cancelAnimationFrame(gfxRaf); gfxRaf = 0; if (ctrl && off) ctrl.setSource(off); }
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
    // Belt-and-braces re-measure (A1: headers/footers broken after a window resize). ResizeObserver
    // notifications are delivered BEFORE PAINT, so any resize that lands while the page isn't painting
    // (window hidden/minimised, another virtual desktop, a background player tab on a TV) can leave this
    // canvas rendered against the old viewport — the flush header/footer bands then draw at the stale
    // width and upscale wrongly. Re-measuring on window resize AND on becoming visible costs one
    // getBoundingClientRect and is idempotent when the observer already did its job.
    const remeasure = () => {
      if (!container || !ctrl) return;
      const r = container.getBoundingClientRect();
      if (r.width > 0 && (Math.abs(r.width - vw) > 0.5 || Math.abs(r.height - vh) > 0.5)) {
        vw = r.width; vh = r.height;
        ctrl.resize(vw, vh);
        render();
      }
    };
    window.addEventListener('resize', remeasure);
    document.addEventListener('visibilitychange', remeasure);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', remeasure);
      document.removeEventListener('visibilitychange', remeasure);
    };
  });
  onDestroy(() => { if (gfxRaf) cancelAnimationFrame(gfxRaf); gfxRaf = 0; ro?.disconnect(); engine?.cancel(); engine = null; ctrl?.dispose(); ctrl = null; });

  // Redraw on data / theme / scroll change. Selection change is handled separately so it can play a
  // transition (which must snapshot the OLD frame BEFORE the re-render) — hence selectedId is NOT here.
  $: if (ctrl) { stage; starmap; system; font; headingFont; accent; mono; colorful; listStyle; documentStyle; navStyle; tagStyle; themeColors; fontScale; starmapLayout; starmapFieldIcons; imagery; photoFrame; hideInfoBlock; tips; overlay; companyName; footerText; scrollY; nowMs; render(); }
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
    <!-- While its pixels are being captured INTO the filtered canvas this stays mounted, live and
         pointer-accepting (so a player can still spin the globe) but is not itself drawn — otherwise
         the same graphic would appear twice, once filtered and once not. Same trick the holo HUD card
         uses to keep the inspector's buttons while the shader draws the card. -->
    <div class="fd-bodygfx" class:interactive={selectable && (imagery === 'sphere' || !!subjectModel)} class:captured={gfxCapturable}
         style="left:{gfxRect.x}px; top:{gfxRect.y}px; width:{gfxRect.w}px; height:{gfxRect.h}px;">
      {#if subjectModel}
        <ConstructModelGraphic bind:this={mdlComp} model={subjectModel}
          tint={(subjectBody as any).icon_color || '#ffd24d'} iconType={(subjectBody as any).icon_type}
          seed={subjectBody.id} {mono} interactive={selectable} />
      {:else}
        <BodyGraphic bind:this={gfxComp} body={subjectBody} system={bodyGfxSystem} mode={imagery === 'sphere' ? 'sphere' : imagery === 'flat' ? 'flat' : 'disc'}
          ringed={subjectRinged} {mono} render={bodyRender} {bodyStyle} bg={docBg} {starHex}
          interactive={selectable && imagery === 'sphere'} />
      {/if}
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
  /* Captured into the filtered canvas: invisible here, but still rendering and still hit-testable. */
  .fd-bodygfx.captured { opacity: 0; }
</style>

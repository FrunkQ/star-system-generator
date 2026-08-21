<script lang="ts">
  // THE reusable info block for the 2D map / 3D holo (D6): the SAME document engine that draws the
  // Document view renders the selected body's file — heading + facts + tags + description (panel mode)
  // — to a canvas, with the body graphic (3D sphere / gallery disc / simple disc / photo) overlaid in
  // its reserved gap. One builder (buildGuideDocument), one theme resolver (makeDocTheme), one renderer
  // (renderDocument) across every info block, so appearance changes stay aligned by construction.
  // The canvas sizes itself to its CONTENT height; the host provides the frame and scrolling.
  import { onMount, onDestroy } from 'svelte';
  import { liveOverrides } from '$lib/player/liveOverrides';
  import { tagCategories } from '$lib/tags/tagCategories';
  // The GM's tag vocabulary, off the broadcast — see HoloView for why the local store is the wrong
  // answer on a player's device (TAG-15). Null on the GM's own screens, where the store IS the answer.
  export let tagStyles: import('$lib/tags/tagCategories').TagCategory[] | null = null;
  import type { System } from '$lib/types';
  import { buildGuideDocument } from '$lib/catalogue/document/guideDocument';
  import { renderDocument } from '$lib/catalogue/document/renderDocument';
  import { makeDocTheme } from '$lib/catalogue/document/documentStyles';
  import { resolveDocColors, type TagStyle, type ListStyle, type DocumentStyle, type DocColors } from '$lib/catalogue/document/blocks';
  import { loadBodyImage, type LoadedBodyImage } from '$lib/catalogue/document/bodyImage';
  import { starsOf, isRinged, isBary, dominantOf } from '$lib/catalogue/document/systemTopology';
  import { buildPortraitSystem } from '$lib/catalogue/document/portraitSystem';
  import BodyGraphic from './BodyGraphic.svelte';
  import ConstructModelGraphic from './ConstructModelGraphic.svelte';

  export let system: System | null = null;
  export let selectedId: string | null = null;
  // Appearance (the preset's Info Block Appearance fields — same names as FilteredDocumentView).
  export let font = 'Georgia, serif';
  export let headingFont: string | undefined = undefined;
  export let accent = '#ffd93d';
  export let mono = false;
  export let fontScale = 1;
  export let listStyle: ListStyle | null = null;
  export let documentStyle: DocumentStyle | undefined = undefined;
  export let tagStyle: TagStyle | undefined = undefined;
  export let themeColors: Partial<DocColors> | null = null;
  export let imagery: 'sphere' | 'photo' | 'disc' | 'flat' | 'none' = 'disc';
  export let photoFrame: 'letterbox' | 'full' | 'sliver' = 'letterbox';
  export let bodyRender: import('$lib/holo/scene').RenderStyle = 'filled';
  export let bodyStyle: 'textured' | 'flat' | 'white' = 'textured';
  export let interactive = false; // hand-spin the 3D globe
  export let transparentBg = false; // let the host's backdrop show through (docked panel over the scene)
  export let showHeading = true;    // false when the host aside already shows the title bar
  // G8: the campaign clock, so the body block can carry its "Next eclipse" row. Omitted -> no row.
  export let nowMs: number | null = null;
  export let formatDate: ((ms: number) => string) | undefined = undefined;
  export let prefs: import('$lib/units').UnitPrefs = {};
  // Names a construct's engines and fuels so its mass, Δv and acceleration can be derived (A2).
  // Optional: without it the construct block simply omits those rows.
  export let rulePack: import('$lib/types').RulePack | null = null;
  // MAP HIGHLIGHTS -> the chip row under the body's name (design 9.3), so the panel and the map name the
  // same things in the same colours. Prop first, store second: a player window runs in its own document
  // where every store is a fresh empty instance (TAG-15), so the value only reaches it as a prop.
  export let highlights: import('$lib/tags/mapHighlights').MapHighlights | null = null;
  $: activeHighlights = $liveOverrides.highlightsMuted ? [] : (highlights ?? $liveOverrides.mapHighlights ?? []);
  // A29: show a construct's current fuel/cargo/crew, not just its capacity. Preset-driven.
  export let liveReadings = false;

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ro: ResizeObserver | null = null;
  let w = 0;
  let contentH = 120;
  let gfxRect: { x: number; y: number; w: number; h: number } | null = null;

  $: theme = makeDocTheme({ font, headingFont, fontScale, mono, accent, documentStyle, themeColors, listStyle });

  // Subject resolution — identical to the document view (a barycentre shows its dominant member).
  $: subjectBody = (() => {
    const n: any = (system?.nodes ?? []).find((x) => x.id === selectedId);
    if (!n) return null;
    return isBary(n) ? (dominantOf(system!, n) as any) : n;
  })();
  $: subjectRinged = subjectBody && system ? isRinged(system, subjectBody.id) : false;
  $: starHex = system ? ((starsOf(system)[0] as any)?.apparentColorHex ?? null) : null;
  $: gfxOn = imagery === 'sphere' || imagery === 'disc' || imagery === 'flat';
  // G3: a construct with a model takes the turntable in the reserved gap instead of BodyGraphic.
  $: subjectModel = subjectBody?.kind === 'construct' ? ((subjectBody as any).model ?? null) : null;

  // A46: the ONE portrait-system builder - see catalogue/document/portraitSystem.ts for why the
  // synthetic root exists. FilteredDocumentView consumes the same builder, so the two cannot drift.
  $: bodyGfxSystem = (subjectBody && imagery === 'sphere') ? buildPortraitSystem(subjectBody, system) : null;

  // Body photo via the shared loader (same-origin rule + auto-centre focus in one place).
  let loaded: LoadedBodyImage | null = null;
  let imgForId: string | null = null;
  // Reload whenever the SUBJECT or the imagery MODE changes. Keying on the id alone meant that
  // switching Body graphics to 'photo' with the same body already selected never fired the loader --
  // the non-photo branch had stamped imgForId with that id -- so nothing appeared until you left the
  // tab and came back, which remounts the panel and clears it. The key IS the subject-when-in-photo.
  $: photoKey = imagery === 'photo' && selectedId ? selectedId : null;
  $: if (photoKey !== imgForId) {
    imgForId = photoKey;
    loaded = null;
    if (photoKey) loadBodyImage(system, photoKey, (l) => { if (imgForId === photoKey) { loaded = l; render(); } });
  }

  function render() {
    if (!canvas || w <= 0 || !system) return;
    const blocks = buildGuideDocument(system, selectedId, {
      panel: true, noHeading: !showHeading, prefs, imagery, tagStyle, photoFrame, rulePack, liveReadings,
      highlights: activeHighlights, tagCategories: (tagStyles ?? $tagCategories),
      nowMs: nowMs ?? undefined, formatDate,
      image: loaded?.img ?? null, imageAspect: loaded?.aspect, imageFocus: loaded?.focus ?? null
    });
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const ctx0 = canvas.getContext('2d');
    if (!ctx0) return;
    // Measure pass (unbounded height) to find the content height, then draw for real at that size.
    ctx0.save();
    const measured = renderDocument(ctx0, blocks, theme, { x: 0, y: 0, w, scrollY: 0 });
    ctx0.restore();
    contentH = Math.max(60, Math.ceil(measured.contentH) + 8);
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(contentH * dpr));
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    if (!transparentBg) {
      ctx.fillStyle = resolveDocColors(theme).bg;
      ctx.fillRect(0, 0, w, contentH);
    }
    const res = renderDocument(ctx, blocks, theme, { x: 0, y: 0, w, scrollY: 0 });
    const gr = res.regions.find((r) => r.id === '__bodygfx');
    gfxRect = gr ? { x: gr.x0 ?? 0, y: gr.y0, w: (gr.x1 ?? w) - (gr.x0 ?? 0), h: gr.y1 - gr.y0 } : null;
  }

  onMount(() => {
    ro = new ResizeObserver((e) => { const cr = e[0]?.contentRect; if (cr && cr.width !== w) { w = cr.width; render(); } });
    ro.observe(wrap);
    w = wrap.getBoundingClientRect().width;
    render();
  });
  onDestroy(() => ro?.disconnect());

  // Redraw on any data/appearance change.
  $: if (canvas) { system; selectedId; theme; imagery; photoFrame; tagStyle; prefs; loaded; nowMs; render(); }
</script>

<div class="doc-panel" bind:this={wrap} style="height:{contentH}px">
  <canvas bind:this={canvas} style="width:{w}px; height:{contentH}px"></canvas>
  {#if gfxOn && gfxRect && subjectBody}
    <div class="dp-gfx" class:interactive={interactive && (imagery === 'sphere' || !!subjectModel)}
         style="left:{gfxRect.x}px; top:{gfxRect.y}px; width:{gfxRect.w}px; height:{gfxRect.h}px;">
      {#if subjectModel}
        <ConstructModelGraphic model={subjectModel} tint={(subjectBody as any).icon_color || '#ffd24d'}
          iconType={(subjectBody as any).icon_type} seed={subjectBody.id} {mono} {interactive} />
      {:else}
        <BodyGraphic body={subjectBody} system={bodyGfxSystem}
          mode={imagery === 'sphere' ? 'sphere' : imagery === 'flat' ? 'flat' : 'disc'}
          ringed={subjectRinged} {mono} render={bodyRender} {bodyStyle}
          bg={resolveDocColors(theme).bg} {starHex} interactive={interactive && imagery === 'sphere'} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .doc-panel { position: relative; width: 100%; }
  .doc-panel canvas { display: block; }
  .dp-gfx { position: absolute; pointer-events: none; display: flex; align-items: center; justify-content: center; }
  .dp-gfx.interactive { pointer-events: auto; cursor: grab; }
  .dp-gfx.interactive:active { cursor: grabbing; }
</style>

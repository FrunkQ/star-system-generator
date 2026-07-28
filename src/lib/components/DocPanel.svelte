<script lang="ts">
  // THE reusable info block for the 2D map / 3D holo (D6): the SAME document engine that draws the
  // Document view renders the selected body's file — heading + facts + tags + description (panel mode)
  // — to a canvas, with the body graphic (3D sphere / gallery disc / simple disc / photo) overlaid in
  // its reserved gap. One builder (buildGuideDocument), one theme resolver (makeDocTheme), one renderer
  // (renderDocument) across every info block, so appearance changes stay aligned by construction.
  // The canvas sizes itself to its CONTENT height; the host provides the frame and scrolling.
  import { onMount, onDestroy } from 'svelte';
  import type { System } from '$lib/types';
  import { buildGuideDocument } from '$lib/catalogue/document/guideDocument';
  import { renderDocument } from '$lib/catalogue/document/renderDocument';
  import { makeDocTheme } from '$lib/catalogue/document/documentStyles';
  import { resolveDocColors, type TagStyle, type ListStyle, type DocumentStyle, type DocColors } from '$lib/catalogue/document/blocks';
  import { loadBodyImage, type LoadedBodyImage } from '$lib/catalogue/document/bodyImage';
  import { starsOf, isRinged, isBary, dominantOf } from '$lib/catalogue/document/systemTopology';
  import BodyGraphic from './BodyGraphic.svelte';
  import type { MeasurementUnits, TemperatureUnit } from '$lib/stores';

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
  export let units: MeasurementUnits = 'metric';
  export let tempUnit: TemperatureUnit = 'C';

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

  // Single-body scene for the 3D graphic — same shape the document view builds (root barycentre so a
  // planet isn't misread as the system's star; rings ride along).
  $: bodyGfxSystem = (subjectBody && imagery === 'sphere') ? (() => {
    const root = { id: '__root', name: '', kind: 'barycenter', parentId: null, orbit: undefined };
    const bodyNode = { ...subjectBody, parentId: '__root', orbit: undefined };
    const rings = (system?.nodes ?? []).filter((n: any) => (n.parentId === subjectBody.id || n.orbit?.hostId === subjectBody.id) && n.roleHint === 'ring')
      .map((r: any) => ({ ...r, parentId: subjectBody.id }));
    return {
      id: 'bg', name: '', seed: 'bg', epochT0: 0, age_Gyr: (system as any)?.age_Gyr ?? 4.5,
      nodes: [root, bodyNode, ...rings], rulePackId: '', rulePackVersion: '', tags: []
    };
  })() as any : null;

  // Body photo via the shared loader (same-origin rule + auto-centre focus in one place).
  let loaded: LoadedBodyImage | null = null;
  let imgForId: string | null = null;
  $: if (imagery === 'photo' && selectedId && selectedId !== imgForId) {
    imgForId = selectedId; loaded = null;
    loadBodyImage(system, selectedId, (l) => { if (imgForId === selectedId) { loaded = l; render(); } });
  }
  $: if (imagery !== 'photo' || !selectedId) { loaded = null; imgForId = selectedId; }

  function render() {
    if (!canvas || w <= 0 || !system) return;
    const blocks = buildGuideDocument(system, selectedId, {
      panel: true, noHeading: !showHeading, units, tempUnit, imagery, tagStyle, photoFrame,
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
  $: if (canvas) { system; selectedId; theme; imagery; photoFrame; tagStyle; units; tempUnit; loaded; render(); }
</script>

<div class="doc-panel" bind:this={wrap} style="height:{contentH}px">
  <canvas bind:this={canvas} style="width:{w}px; height:{contentH}px"></canvas>
  {#if gfxOn && gfxRect && subjectBody}
    <div class="dp-gfx" class:interactive={interactive && imagery === 'sphere'}
         style="left:{gfxRect.x}px; top:{gfxRect.y}px; width:{gfxRect.w}px; height:{gfxRect.h}px;">
      <BodyGraphic body={subjectBody} system={bodyGfxSystem}
        mode={imagery === 'sphere' ? 'sphere' : imagery === 'flat' ? 'flat' : 'disc'}
        ringed={subjectRinged} {mono} render={bodyRender} {bodyStyle}
        bg={resolveDocColors(theme).bg} {starHex} interactive={interactive && imagery === 'sphere'} />
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

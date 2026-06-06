<script lang="ts">
  // Phase 03 — responsive layout shell. Branches on viewport + pointer:
  //   desktop  (min-width: 900px AND pointer: fine) -> a 5-area grid: rail | strip /
  //            canvas / bar | detail.
  //   phone    (otherwise) -> full-bleed canvas, the `detail` slot moves into a
  //            BottomSheet, `fab` floats, and the rail slides in from a hamburger.
  // `mode` is bindable so the host can adapt (e.g. render the FAB cluster only on phone).
  // A `?mode=phone|desktop` query param (or the forceMode prop) overrides auto-detection
  // for testing — the v2 prototype's Auto/Desktop/Phone toggle, ported.
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import BottomSheet from './BottomSheet.svelte';

  export let forceMode: 'auto' | 'desktop' | 'phone' = 'auto';
  export let mode: 'desktop' | 'phone' = 'desktop';
  export let sheetTitle = '';
  export let sheetSnap: 'peek' | 'half' | 'full' = 'peek';
  export let railOpen = false;

  // Height (px) of the phone time bar; the sheet + FAB are offset above it.
  const phoneBarH = 92;

  // Desktop detail-panel width — user-resizable (§03.8), persisted. null = CSS default.
  let detailWidth: number | null = null;
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartW = 0;

  function startResize(e: PointerEvent) {
    const aside = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartW = aside.offsetWidth;
    window.addEventListener('pointermove', onResize);
    window.addEventListener('pointerup', endResize);
    e.preventDefault();
  }
  function onResize(e: PointerEvent) {
    // Handle is on the LEFT edge, so dragging left widens the panel.
    const w = resizeStartW + (resizeStartX - e.clientX);
    detailWidth = Math.max(300, Math.min(window.innerWidth * 0.6, w));
  }
  function endResize() {
    resizing = false;
    window.removeEventListener('pointermove', onResize);
    window.removeEventListener('pointerup', endResize);
    if (browser && detailWidth) localStorage.setItem('sse-detail-w', String(Math.round(detailWidth)));
  }
  function resetDetailWidth() {
    detailWidth = null;
    if (browser) localStorage.removeItem('sse-detail-w');
  }

  let autoDesktop = true;

  function override(): 'auto' | 'desktop' | 'phone' {
    if (forceMode !== 'auto') return forceMode;
    if (browser) {
      const p = new URLSearchParams(window.location.search).get('mode');
      if (p === 'phone' || p === 'desktop') return p;
    }
    return 'auto';
  }

  $: mode = override() === 'auto' ? (autoDesktop ? 'desktop' : 'phone') : (override() as 'desktop' | 'phone');

  onMount(() => {
    const mql = window.matchMedia('(min-width: 900px) and (pointer: fine)');
    // Re-check on both the media-query change AND window resize. matchMedia 'change'
    // doesn't always fire under device emulation / programmatic resizes, so resize is the
    // belt-and-suspenders that keeps mode correct everywhere.
    const saved = Number(localStorage.getItem('sse-detail-w'));
    if (saved && saved >= 300) detailWidth = saved;
    const recheck = () => (autoDesktop = mql.matches);
    recheck();
    mql.addEventListener('change', recheck);
    window.addEventListener('resize', recheck);
    return () => {
      mql.removeEventListener('change', recheck);
      window.removeEventListener('resize', recheck);
    };
  });
</script>

<div class="app-shell" data-mode={mode}>
  {#if mode === 'desktop'}
    {#if $$slots.rail}<aside class="area rail"><slot name="rail" /></aside>{/if}
    {#if $$slots.strip}<div class="area strip"><slot name="strip" /></div>{/if}
    <main class="area canvas"><slot name="canvas" /></main>
    {#if $$slots.bar}<div class="area bar"><slot name="bar" /></div>{/if}
    {#if $$slots.detail}<aside class="area detail" class:resizing style={detailWidth ? `width:${detailWidth}px` : ''}>
      <div
        class="detail-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize detail panel (double-click to reset)"
        on:pointerdown={startResize}
        on:dblclick={resetDetailWidth}
      ></div>
      <slot name="detail" />
    </aside>{/if}
  {:else}
    <main class="canvas-full"><slot name="canvas" /></main>

    <div class="phone-strip">
      <button class="rail-toggle" aria-label="Menu" on:click={() => (railOpen = !railOpen)}>☰</button>
      <div class="phone-strip-inner"><slot name="strip" /></div>
    </div>

    {#if railOpen}
      <div
        class="rail-scrim"
        role="presentation"
        on:click={() => (railOpen = false)}
      >
        <aside class="phone-rail" on:click|stopPropagation role="presentation">
          <slot name="rail" />
        </aside>
      </div>
    {/if}

    {#if $$slots.bar}
      <div class="phone-bar"><slot name="bar" /></div>
    {/if}

    {#if $$slots.detail}
      <BottomSheet bind:snap={sheetSnap} title={sheetTitle} bottomInset={$$slots.bar ? phoneBarH : 0}>
        <slot name="detail" />
      </BottomSheet>
    {/if}

    {#if $$slots.fab}
      <div class="fab-layer" style={$$slots.detail ? '--fab-bottom: 98px;' : ($$slots.bar ? `--fab-bottom: ${phoneBarH + 16}px;` : '')}><slot name="fab" /></div>
    {/if}
  {/if}
</div>

<style>
  .app-shell {
    height: 100vh;
    width: 100%;
    background: #08090d;
    color: #e8e8e8;
    overflow: hidden;
  }

  /* ---- Desktop: rail | strip/canvas/bar | detail ---- */
  .app-shell[data-mode='desktop'] {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'rail strip  detail'
      'rail canvas detail'
      'rail bar    detail';
  }
  .area.rail {
    grid-area: rail;
    max-width: 200px;
    border-right: 1px solid #1c1f27;
    overflow-y: auto;
  }
  .area.strip {
    grid-area: strip;
    border-bottom: 1px solid #1c1f27;
  }
  .area.canvas {
    grid-area: canvas;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  .area.bar {
    grid-area: bar;
    border-top: 1px solid #1c1f27;
  }
  .area.detail {
    grid-area: detail;
    /* Wider default so the body-data grid flows into 2 columns (was a long single
       column). User-resizable via .detail-resize; an inline width overrides this.
       Empty (gated) detail collapses the auto track to 0. */
    width: clamp(340px, 34vw, 560px);
    position: relative;
    border-left: 1px solid #1c1f27;
    overflow-y: auto;
  }
  .area.detail.resizing {
    user-select: none;
  }
  .detail-resize {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: col-resize;
    z-index: 5;
    touch-action: none;
  }
  .detail-resize::after {
    content: '';
    position: absolute;
    left: 3px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
  }
  .detail-resize:hover::after,
  .area.detail.resizing .detail-resize::after {
    background: var(--accent, #ff5a1f);
  }

  /* ---- Phone: full-bleed canvas + overlays ---- */
  .app-shell[data-mode='phone'] {
    position: relative;
  }
  .canvas-full {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .phone-strip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1100;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: linear-gradient(#08090de6, #08090d00);
  }
  .phone-strip-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    flex: 1 1 auto;
  }
  .rail-toggle {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border: 1px solid #2a2d36;
    border-radius: 8px;
    background: #14161c;
    color: #e8e8e8;
    font-size: 1.2rem;
    cursor: pointer;
  }
  .rail-scrim {
    position: fixed;
    inset: 0;
    z-index: 1400;
    background: rgba(0, 0, 0, 0.5);
  }
  .phone-rail {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(80vw, 320px);
    background: #14161c;
    border-right: 1px solid #2a2d36;
    overflow-y: auto;
    padding: 12px;
  }
  .phone-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1150; /* below the sheet (1200); the sheet is inset above it */
    height: 92px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    overflow-x: auto;
    overflow-y: hidden;
    background: #0b0d12;
    border-top: 1px solid #2a2d36;
    padding: 2px 8px;
  }
  .fab-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 1300;
  }
  .fab-layer > :global(*) {
    pointer-events: auto;
  }
</style>

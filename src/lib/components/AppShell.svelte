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
    autoDesktop = mql.matches;
    const onChange = (e: MediaQueryListEvent) => (autoDesktop = e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  });
</script>

<div class="app-shell" data-mode={mode}>
  {#if mode === 'desktop'}
    <aside class="area rail"><slot name="rail" /></aside>
    <div class="area strip"><slot name="strip" /></div>
    <main class="area canvas"><slot name="canvas" /></main>
    <div class="area bar"><slot name="bar" /></div>
    <aside class="area detail"><slot name="detail" /></aside>
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

    <BottomSheet bind:snap={sheetSnap} title={sheetTitle}>
      <slot name="detail" />
    </BottomSheet>

    <div class="fab-layer"><slot name="fab" /></div>
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
    border-left: 1px solid #1c1f27;
    overflow-y: auto;
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

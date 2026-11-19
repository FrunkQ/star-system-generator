<script lang="ts">
  // Applies the CSS approximation of a GPU filter to slotted DOM content (system 2D view, info
  // panels, cover/starmap previews). See cssFilterApprox.ts. `active` off = pass-through.
  import { cssFilterApprox, graphicTintMatrix } from '$lib/player/cssFilterApprox';
  import type { FilterParamValues } from '$lib/holo/filters/schema';

  export let filterId: string = 'none';
  export let params: FilterParamValues = {};
  export let active: boolean = true;
  /**
   * The slot is a TRANSPARENT GRAPHIC (a preset's overlay image) laid over a stage that already runs
   * the filter, not an opaque surface. The tint, the scanlines and the vignette are WHOLE-FRAME
   * layers: over a graphic they cover the stage the graphic sits on, and the tint in particular
   * stops being a colouriser and becomes a film of solid phosphor (`.overlay-wrap` has a z-index, so
   * it is its own stacking context and `mix-blend-mode: color` finds nothing beneath it to colour).
   * That was the "phosphor colour over the whole screen" report. So a graphic gets the per-pixel
   * half only: brightness/contrast, and the tint as a colour matrix that cannot leave its pixels.
   */
  export let graphic: boolean = false;

  const tintId = `ff-tint-${nextId()}`;

  $: fx = active ? cssFilterApprox(filterId, params) : cssFilterApprox('none');
  $: tintValues = graphic && fx.tint ? graphicTintMatrix(fx.tint, fx.tintOpacity * 0.55).join(' ') : null;
  $: contentFilter = tintValues ? `${fx.containerFilter === 'none' ? '' : fx.containerFilter + ' '}url(#${tintId})` : fx.containerFilter;
</script>

<script context="module" lang="ts">
  // One id per mounted frame: an SVG filter is referenced by document-wide id.
  let frames = 0;
  function nextId(): number { return ++frames; }
</script>

<div class="frame" style="border-radius:{fx.rounded}px">
  {#if tintValues}
    <svg class="defs" width="0" height="0" aria-hidden="true">
      <filter id={tintId} color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values={tintValues} /></filter>
    </svg>
  {/if}
  <div class="content" style="filter:{contentFilter}">
    <slot />
  </div>
  {#if !graphic}
    {#if fx.tint}
      <div class="tint" style="background:{fx.tint}; opacity:{fx.tintOpacity * 0.55}"></div>
    {/if}
    {#if fx.scanlineIntensity > 0}
      <div class="scan" style="opacity:{fx.scanlineIntensity * 0.6}; background-size:100% {fx.scanlineWidth}px"></div>
    {/if}
    {#if fx.vignette > 0}
      <div class="vig" style="box-shadow: inset 0 0 {60 + fx.vignette * 120}px rgba(0,0,0,{Math.min(0.85, fx.vignette * 0.6)})"></div>
    {/if}
  {/if}
</div>

<style>
  .frame { position: absolute; inset: 0; overflow: hidden; }
  .content { position: absolute; inset: 0; }
  .defs { position: absolute; width: 0; height: 0; pointer-events: none; }
  .tint { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color; }
  .scan { position: absolute; inset: 0; pointer-events: none; background-image: repeating-linear-gradient(to bottom, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 100%); }
  .vig { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; }
</style>

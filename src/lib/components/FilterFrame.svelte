<script lang="ts">
  // Applies the CSS approximation of a GPU filter to slotted DOM content (system 2D view, info
  // panels, cover/starmap previews). See cssFilterApprox.ts. `active` off = pass-through.
  import { cssFilterApprox } from '$lib/player/cssFilterApprox';
  import type { FilterParamValues } from '$lib/holo/filters/schema';

  export let filterId: string = 'none';
  export let params: FilterParamValues = {};
  export let active: boolean = true;

  $: fx = active ? cssFilterApprox(filterId, params) : cssFilterApprox('none');
</script>

<div class="frame" style="border-radius:{fx.rounded}px">
  <div class="content" style="filter:{fx.containerFilter}">
    <slot />
  </div>
  {#if fx.tint}
    <div class="tint" style="background:{fx.tint}; opacity:{fx.tintOpacity * 0.55}"></div>
  {/if}
  {#if fx.scanlineIntensity > 0}
    <div class="scan" style="opacity:{fx.scanlineIntensity * 0.6}; background-size:100% {fx.scanlineWidth}px"></div>
  {/if}
  {#if fx.vignette > 0}
    <div class="vig" style="box-shadow: inset 0 0 {60 + fx.vignette * 120}px rgba(0,0,0,{Math.min(0.85, fx.vignette * 0.6)})"></div>
  {/if}
</div>

<style>
  .frame { position: absolute; inset: 0; overflow: hidden; }
  .content { position: absolute; inset: 0; }
  .tint { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color; }
  .scan { position: absolute; inset: 0; pointer-events: none; background-image: repeating-linear-gradient(to bottom, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 100%); }
  .vig { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; }
</style>

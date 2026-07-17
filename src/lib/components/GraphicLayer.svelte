<script lang="ts">
  // Reusable graphic placement layer — fills its (positioned) parent and lays one asset per the
  // standard placement options: 9-point pin + size (% of surface, aspect preserved) OR stretch-fill
  // (ignores aspect), with opacity. Used for the cover graphic AND the all-screens overlay. PNG alpha
  // respected. Rendered as DOM so it inherits any CSS filter on the wrapping surface.
  import type { GraphicPlacement, PlayerAsset } from '$lib/player/presetTypes';

  export let placement: GraphicPlacement | null = null;
  export let assets: PlayerAsset[] = [];

  const PIN_JUSTIFY: Record<string, string> = {
    'top-left': 'flex-start', 'top-center': 'center', 'top-right': 'flex-end',
    'center-left': 'flex-start', 'center': 'center', 'center-right': 'flex-end',
    'bottom-left': 'flex-start', 'bottom-center': 'center', 'bottom-right': 'flex-end'
  };
  const PIN_ALIGN: Record<string, string> = {
    'top-left': 'flex-start', 'top-center': 'flex-start', 'top-right': 'flex-start',
    'center-left': 'center', 'center': 'center', 'center-right': 'center',
    'bottom-left': 'flex-end', 'bottom-center': 'flex-end', 'bottom-right': 'flex-end'
  };
  $: asset = placement ? assets.find((a) => a.id === placement.assetId) : undefined;
</script>

{#if asset}
  <div class="glayer" style="justify-content:{PIN_JUSTIFY[placement.pin] ?? 'center'}; align-items:{PIN_ALIGN[placement.pin] ?? 'center'}">
    {#if placement.stretch}
      <img src={asset.dataUrl} alt="" style="width:100%; height:100%; object-fit:fill; opacity:{placement.opacity}" />
    {:else}
      <img src={asset.dataUrl} alt="" style="width:{placement.sizePct}%; height:auto; max-height:100%; object-fit:contain; opacity:{placement.opacity}" />
    {/if}
  </div>
{/if}

<style>
  .glayer { position: absolute; inset: 0; display: flex; pointer-events: none; }
</style>

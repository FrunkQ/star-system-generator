<script lang="ts">
  // Reusable editor control set for placing one graphic — the SAME options everywhere (cover graphic,
  // all-screens overlay): image, 9-point pin, size %, opacity, stretch-fill. Emits the updated
  // GraphicPlacement (or null when no image chosen).
  import { createEventDispatcher } from 'svelte';
  import type { GraphicPlacement, PlayerAsset, PinPosition } from '$lib/player/presetTypes';
  import { PIN_POSITIONS } from '$lib/player/presetTypes';

  export let placement: GraphicPlacement | null = null;
  export let assets: PlayerAsset[] = [];
  export let label = 'Image';

  const dispatch = createEventDispatcher<{ change: GraphicPlacement | null }>();

  function setImage(assetId: string) {
    if (!assetId) { dispatch('change', null); return; }
    dispatch('change', { assetId, pin: placement?.pin ?? 'center', sizePct: placement?.sizePct ?? 40, opacity: placement?.opacity ?? 1, stretch: placement?.stretch ?? false });
  }
  function patch(changes: Partial<GraphicPlacement>) {
    if (!placement) return;
    dispatch('change', { ...placement, ...changes });
  }
</script>

<label>{label}
  <select value={placement?.assetId ?? ''} on:change={(e) => setImage((e.currentTarget as HTMLSelectElement).value)}>
    <option value="">None</option>
    {#each assets as a}<option value={a.id}>{a.name}</option>{/each}
  </select>
</label>
{#if placement}
  <label class="chk"><input type="checkbox" checked={placement.stretch} on:change={(e) => patch({ stretch: (e.currentTarget as HTMLInputElement).checked })} /> Stretch to fill (any aspect ratio)</label>
  {#if !placement.stretch}
    <label>Position
      <select value={placement.pin} on:change={(e) => patch({ pin: (e.currentTarget as HTMLSelectElement).value as PinPosition })}>
        {#each PIN_POSITIONS as p}<option value={p}>{p.replace('-', ' ')}</option>{/each}
      </select>
    </label>
    <label>Size <span>{placement.sizePct}%</span>
      <input type="range" min="5" max="100" step="1" value={placement.sizePct} on:input={(e) => patch({ sizePct: parseInt((e.currentTarget as HTMLInputElement).value) })} />
    </label>
  {/if}
  <label>Opacity <span>{Math.round(placement.opacity * 100)}%</span>
    <input type="range" min="0.05" max="1" step="0.05" value={placement.opacity} on:input={(e) => patch({ opacity: parseFloat((e.currentTarget as HTMLInputElement).value) })} />
  </label>
{/if}

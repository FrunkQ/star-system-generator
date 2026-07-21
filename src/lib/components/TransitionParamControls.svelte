<script lang="ts">
  // Controls for the selected transition's params (duration, direction, phosphor, …), generated from
  // the transition definition's declared schema — the transitions analogue of FilterParamControls, so
  // the look matches. Emits the merged param values.
  import { createEventDispatcher } from 'svelte';
  import { transitionRegistry } from '$lib/transitions/TransitionRegistry';
  import type { FilterParamValues } from '$lib/holo/filters/schema';

  export let transitionId: string;
  export let values: FilterParamValues = {};

  const dispatch = createEventDispatcher<{ change: FilterParamValues }>();

  $: def = transitionRegistry.get(transitionId);
  function val(p: any) { return values[p.id] ?? p.default; }
  function set(id: string, v: number | string) { dispatch('change', { ...values, [id]: v }); }
</script>

{#if def && def.params.length}
  <div class="tp">
    {#each def.params as p (p.id)}
      <label class="row" class:inline={p.type === 'color'}>
        <span class="lbl">{p.label}{p.type === 'slider' && p.unit ? ` (${p.unit})` : ''}</span>
        {#if p.type === 'slider'}
          <input type="range" min={p.min} max={p.max} step={p.step} value={val(p)}
            on:input={(e) => set(p.id, parseFloat((e.currentTarget as HTMLInputElement).value))} />
        {:else if p.type === 'select'}
          <select value={val(p)} on:change={(e) => set(p.id, (e.currentTarget as HTMLSelectElement).value)}>
            {#each p.options as o}<option value={o.value}>{o.label}</option>{/each}
          </select>
        {:else if p.type === 'color'}
          <input type="color" value={val(p)} on:input={(e) => set(p.id, (e.currentTarget as HTMLInputElement).value)} />
        {/if}
      </label>
    {/each}
  </div>
{/if}

<style>
  .tp { display: flex; flex-direction: column; gap: 5px; }
  .row { display: flex; flex-direction: column; gap: 2px; font-size: 0.72rem; color: var(--text-muted); }
  .row.inline { flex-direction: row; align-items: center; justify-content: space-between; }
  .row .lbl { white-space: nowrap; }
  .row input[type=range] { width: 100%; accent-color: var(--accent, #6aa0ff); }
</style>

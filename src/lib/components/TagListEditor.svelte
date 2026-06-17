<script lang="ts">
  // Compact inline tag editor: current tags as removable chips + a dropdown to add from `options`.
  // Used to attach inheritance tags to the tech definitions (a fuel's refuel sources, an engine's drive,
  // a gas's resources) — all data-driven, nothing hard-coded. Mutates the bound `tags` array in place.
  import { createEventDispatcher } from 'svelte';
  export let tags: string[] = [];
  export let options: { key: string; label: string }[] = [];
  export let placeholder = '+ add tag';
  const dispatch = createEventDispatcher();
  let sel = '';
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label || k;
  function add() {
    if (sel && !(tags ?? []).includes(sel)) { tags = [...(tags ?? []), sel]; dispatch('change'); }
    sel = '';
  }
  function remove(k: string) { tags = (tags ?? []).filter((t) => t !== k); dispatch('change'); }
</script>

<div class="tle">
  {#each tags ?? [] as t (t)}
    <span class="tle-chip">{labelOf(t)}<button type="button" title="Remove" on:click={() => remove(t)}>×</button></span>
  {/each}
  <select bind:value={sel} on:change={add}>
    <option value="">{placeholder}</option>
    {#each options.filter((o) => !(tags ?? []).includes(o.key)) as o (o.key)}
      <option value={o.key}>{o.label}</option>
    {/each}
  </select>
</div>

<style>
  .tle { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .tle-chip {
    display: inline-flex; align-items: center; gap: 4px; font-size: 0.78em;
    background: var(--bg-control, rgba(255,255,255,0.08)); color: var(--text);
    border: 1px solid var(--border-soft); border-radius: 3px; padding: 1px 4px 1px 7px;
  }
  .tle-chip button { background: none; border: none; color: var(--text-faint); cursor: pointer; font-size: 1.1em; line-height: 1; padding: 0; }
  .tle-chip button:hover { color: var(--status-bad, #ef4444); }
  .tle select {
    background: var(--bg-panel); border: 1px dashed var(--border); color: var(--text-muted);
    border-radius: 3px; padding: 2px 4px; font-size: 0.78em; cursor: pointer;
  }
</style>

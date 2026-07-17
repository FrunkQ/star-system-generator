<script lang="ts">
  // Renders the FULL control set for the selected GPU filter (brightness, invert, scanlines, phosphor
  // colour, distortion, signal artifacts, …) generated from the filter definition's declared params —
  // grouped and progressively disclosed. Emits the merged param values. See paramsMeta.ts.
  import { createEventDispatcher } from 'svelte';
  import { filterMeta } from '$lib/holo/filters/paramsMeta';
  import type { FilterParamValues } from '$lib/holo/filters/schema';

  export let filterId: string;
  export let values: FilterParamValues = {};

  const dispatch = createEventDispatcher<{ change: FilterParamValues }>();

  $: meta = filterMeta(filterId);
  // Groups: keep the declaration order; start the ones flagged `collapsed` closed.
  let openGroups: Record<string, boolean> = {};
  $: if (meta) {
    for (const g of meta.groups ?? []) if (!(g.id in openGroups)) openGroups[g.id] = !g.collapsed;
  }
  $: grouped = (() => {
    if (!meta) return [] as { id: string; label: string; params: any[] }[];
    const byId = new Map((meta.groups ?? []).map((g) => [g.id, { id: g.id, label: g.label, params: [] as any[] }]));
    const loose: any[] = [];
    for (const p of meta.params) {
      const g = p.group && byId.get(p.group);
      if (g) g.params.push(p); else loose.push(p);
    }
    const out = [...byId.values()].filter((g) => g.params.length);
    if (loose.length) out.push({ id: '_', label: 'Other', params: loose });
    return out;
  })();

  function val(p: any) { return values[p.id] ?? p.default; }
  function set(id: string, v: number | boolean | string) {
    dispatch('change', { ...values, [id]: v });
  }
</script>

{#if meta}
  <div class="fp">
    {#each grouped as g (g.id)}
      <div class="grp">
        <button class="grp-head" on:click={() => (openGroups[g.id] = !openGroups[g.id])} aria-expanded={openGroups[g.id]}>
          <span class="caret" class:open={openGroups[g.id]}>▸</span> {g.label}
        </button>
        {#if openGroups[g.id]}
          <div class="grp-body">
            {#each g.params as p (p.id)}
              <label class="row" class:inline={p.type === 'toggle' || p.type === 'color'}>
                <span class="lbl">{p.label}</span>
                {#if p.type === 'slider'}
                  <input type="range" min={p.min} max={p.max} step={p.step} value={val(p)}
                    on:input={(e) => set(p.id, parseFloat((e.currentTarget as HTMLInputElement).value))} />
                {:else if p.type === 'toggle'}
                  <input type="checkbox" checked={!!val(p)} on:change={(e) => set(p.id, (e.currentTarget as HTMLInputElement).checked)} />
                {:else if p.type === 'color'}
                  <input type="color" value={val(p)} on:input={(e) => set(p.id, (e.currentTarget as HTMLInputElement).value)} />
                {:else if p.type === 'select'}
                  <select value={val(p)} on:change={(e) => set(p.id, (e.currentTarget as HTMLSelectElement).value)}>
                    {#each p.options as o}<option value={o.value}>{o.label}</option>{/each}
                  </select>
                {/if}
              </label>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .fp { display: flex; flex-direction: column; gap: 4px; }
  .grp-head { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; border: none; color: var(--text-muted); font: inherit; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; padding: 3px 0; }
  .caret { transition: transform 0.12s; display: inline-block; }
  .caret.open { transform: rotate(90deg); }
  .grp-body { display: flex; flex-direction: column; gap: 5px; padding: 2px 0 6px 8px; }
  .row { display: flex; flex-direction: column; gap: 2px; font-size: 0.72rem; color: var(--text-muted); }
  .row.inline { flex-direction: row; align-items: center; justify-content: space-between; }
  .row .lbl { white-space: nowrap; }
  .row input[type=range] { width: 100%; accent-color: var(--accent, #6aa0ff); }
</style>

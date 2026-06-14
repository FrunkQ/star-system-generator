<script lang="ts">
  // Find-by-tag directory: every distinct tag across the starmap, grouped by category as coloured
  // chips. Pick one → the bodies/constructs carrying it (current system first), click to jump there.
  // Great for "where's the nearest gas-giant refuelling / heavy-metal world / ice belt".
  import { createEventDispatcher } from 'svelte';
  import { describeTag } from '$lib/tags/tagPresentation';
  export let nodes: any[] = [];                       // all bodies/constructs (with __systemId/__systemName/tags)
  export let contextOf: (n: any) => string = () => '';
  export let currentSystemId: string | null = null;
  const dispatch = createEventDispatcher();

  let selected: string | null = null;
  let q = '';

  // tag key → the nodes that carry it
  $: index = (() => {
    const m = new Map<string, any[]>();
    for (const n of nodes) for (const t of (n.tags ?? [])) {
      const arr = m.get(t.key);
      if (arr) arr.push(n); else m.set(t.key, [n]);
    }
    return m;
  })();

  $: grouped = (() => {
    const g: Record<string, { key: string; label: string; color: string; textColor: string; count: number }[]> = {};
    const needle = q.trim().toLowerCase();
    for (const [key, bodies] of index) {
      const info = describeTag(key);
      if (needle && !`${info.label} ${key} ${info.group}`.toLowerCase().includes(needle)) continue;
      (g[info.group] ||= []).push({ key, label: info.label, color: info.color, textColor: info.textColor || '#fff', count: bodies.length });
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.label.localeCompare(b.label));
    return g;
  })();
  $: groupNames = Object.keys(grouped).sort();

  // Bodies for the chosen tag — current system first, then by system, then name.
  $: matches = selected
    ? [...(index.get(selected) ?? [])].sort((a, b) =>
        (a.__systemId === currentSystemId ? 0 : 1) - (b.__systemId === currentSystemId ? 0 : 1)
        || String(a.__systemName).localeCompare(String(b.__systemName))
        || String(a.name).localeCompare(String(b.name)))
    : [];
  $: selInfo = selected ? describeTag(selected) : null;
</script>

<div class="tag-finder">
  {#if !selected}
    <input class="search" placeholder="Search tags…" bind:value={q} />
    {#if !groupNames.length}<p class="empty">No tags found{q ? ' for that search' : ''}.</p>{/if}
    {#each groupNames as g (g)}
      <div class="grp">
        <h5>{g}</h5>
        <div class="chips">
          {#each grouped[g] as t (t.key)}
            <button class="chip" style="background:{t.color}; color:{t.textColor}" on:click={() => (selected = t.key)} title={t.key}>
              {t.label} <span class="cnt">{t.count}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <button class="back" on:click={() => (selected = null)}>← All tags</button>
    <div class="sel-head">
      <span class="chip" style="background:{selInfo?.color}; color:{selInfo?.textColor || '#fff'}">{selInfo?.label}</span>
      <span class="cnt2">{matches.length} {matches.length === 1 ? 'body' : 'bodies'}</span>
    </div>
    {#if selInfo?.description}<p class="desc">{selInfo.description}</p>{/if}
    <ul class="results">
      {#each matches as n (n.__systemId + ':' + n.id)}
        <li>
          <button class="res" on:click={() => dispatch('select', { systemId: n.__systemId, id: n.id })}>
            <span class="res-name">{n.name}</span>
            <span class="res-ctx">{contextOf(n)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .tag-finder { display: flex; flex-direction: column; gap: 8px; }
  .search { width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .empty { color: var(--text-faint); font-style: italic; }
  .grp { display: flex; flex-direction: column; gap: 4px; }
  .grp h5 { margin: 6px 0 0; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: #fff; }
  .chip:hover { filter: brightness(1.12); }
  .cnt { font-size: 0.72em; opacity: 0.85; background: rgba(0,0,0,0.22); border-radius: 8px; padding: 0 5px; }
  .back { align-self: flex-start; background: none; border: none; color: var(--link); cursor: pointer; font-size: 0.82rem; padding: 2px 0; }
  .sel-head { display: flex; align-items: center; gap: 8px; }
  .cnt2 { color: var(--text-faint); font-size: 0.8rem; }
  .desc { margin: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }
  .results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 50vh; overflow-y: auto; }
  .res { width: 100%; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 7px 9px; cursor: pointer; color: var(--text); text-align: left; }
  .res:hover { border-color: var(--accent); }
  .res-name { font-weight: 600; }
  .res-ctx { font-size: 0.76rem; color: var(--text-faint); }
</style>

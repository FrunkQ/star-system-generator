<script lang="ts">
  // Find-by-tag directory. Browse categories as bubbles → expand one to see its tags → click a tag
  // to add it to the active filter list (or quick-add via search). Results below = bodies carrying
  // ALL active filter tags. Inside a system on a scaled map, results show inter-system distance and
  // sort nearest-first; otherwise alphabetical.
  import { createEventDispatcher } from 'svelte';
  import { describeTag } from '$lib/tags/tagPresentation';
  export let nodes: any[] = [];                       // all bodies/constructs (with __systemId/__systemName/tags)
  export let contextOf: (n: any) => string = () => '';
  export let currentSystemId: string | null = null;
  export let distanceOf: ((systemId: string) => number | null) | null = null;
  export let distanceUnit = 'ly';
  const dispatch = createEventDispatcher();

  let q = '';
  let expanded: string | null = null;     // expanded category group
  let filters: string[] = [];             // active tag keys (ANDed)

  // tag key → the nodes that carry it
  $: index = (() => {
    const m = new Map<string, any[]>();
    for (const n of nodes) for (const t of (n.tags ?? [])) {
      const arr = m.get(t.key);
      if (arr) arr.push(n); else m.set(t.key, [n]);
    }
    return m;
  })();

  interface TagMeta { key: string; label: string; group: string; color: string; textColor: string; count: number; }
  $: allMetas = (() => {
    const out: TagMeta[] = [];
    for (const [key, bodies] of index) {
      const info = describeTag(key);
      out.push({ key, label: info.label, group: info.group, color: info.color, textColor: info.textColor || '#fff', count: bodies.length });
    }
    return out;
  })();
  // group → its tags; plus a representative colour per group (the namespace/category colour).
  $: grouped = (() => {
    const g: Record<string, TagMeta[]> = {};
    for (const m of allMetas) (g[m.group] ||= []).push(m);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.label.localeCompare(b.label));
    return g;
  })();
  $: groupNames = Object.keys(grouped).sort();
  const groupColor = (g: string) => grouped[g]?.[0]?.color || '#888';

  // Search suggestions (quick-add), excluding already-active filters.
  $: suggestions = q.trim()
    ? allMetas.filter((m) => !filters.includes(m.key) && `${m.label} ${m.key} ${m.group}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  function addFilter(key: string) { if (!filters.includes(key)) filters = [...filters, key]; q = ''; }
  function removeFilter(key: string) { filters = filters.filter((k) => k !== key); }
  function onSearchKey(e: KeyboardEvent) { if (e.key === 'Enter' && suggestions[0]) { addFilter(suggestions[0].key); } }

  // Results: nodes carrying every active filter tag.
  $: results = filters.length
    ? nodes.filter((n) => { const keys = new Set((n.tags ?? []).map((t: any) => t.key)); return filters.every((f) => keys.has(f)); })
    : [];
  const byName = (a: any, b: any) =>
    String(a.n.__systemName).localeCompare(String(b.n.__systemName)) || String(a.n.name).localeCompare(String(b.n.name));
  $: sorted = (() => {
    const withDist = results.map((n) => ({ n, dist: distanceOf ? distanceOf(n.__systemId) : null }));
    const haveDist = withDist.some((r) => r.dist != null);
    if (haveDist) {
      // Scaled map + inside a system: nearest first (the current system is distance 0).
      withDist.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || byName(a, b));
    } else {
      // No distances (diagrammatic map or starmap view): the system you're in comes first, then A–Z.
      withDist.sort((a, b) =>
        (a.n.__systemId === currentSystemId ? 0 : 1) - (b.n.__systemId === currentSystemId ? 0 : 1) || byName(a, b));
    }
    return withDist;
  })();
  const fmtDist = (d: number | null) => d == null ? '' : (d === 0 ? 'this system' : `${d} ${distanceUnit}`);
  const metaFor = (key: string) => describeTag(key);
</script>

<div class="tag-finder">
  <!-- search / quick-add -->
  <div class="search-wrap">
    <input class="search" placeholder="Search tags to add a filter…" bind:value={q} on:keydown={onSearchKey} />
    {#if suggestions.length}
      <div class="suggest">
        {#each suggestions as s (s.key)}
          <button class="sugg" on:click={() => addFilter(s.key)}>
            <span class="dot" style="background:{s.color}"></span>{s.label}
            <span class="sgrp">{s.group}</span><span class="cnt">{s.count}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- category bubbles -->
  <div class="bubbles">
    {#each groupNames as g (g)}
      <button class="bubble" class:open={expanded === g} style="--c:{groupColor(g)}" on:click={() => (expanded = expanded === g ? null : g)}>
        {g} <span class="bcnt">{grouped[g].length}</span>
      </button>
    {/each}
  </div>
  {#if expanded && grouped[expanded]}
    <div class="cat-tags">
      {#each grouped[expanded] as t (t.key)}
        <button class="chip" class:active={filters.includes(t.key)} style="background:{t.color}; color:{t.textColor}" on:click={() => addFilter(t.key)} title={t.key}>
          {t.label} <span class="cnt">{t.count}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- active filters -->
  <div class="filters">
    {#if filters.length}
      <span class="flabel">Filters (matching all):</span>
      {#each filters as f (f)}
        {@const m = metaFor(f)}
        <button class="chip rm" style="background:{m.color}; color:{m.textColor || '#fff'}" on:click={() => removeFilter(f)} title="Click to remove">
          {m.label} <span class="x">×</span>
        </button>
      {/each}
    {:else}
      <span class="hint">Pick a category bubble or search to add tag filters.</span>
    {/if}
  </div>

  <!-- results -->
  <div class="results">
    {#if filters.length}
      <div class="res-head">{sorted.length} {sorted.length === 1 ? 'match' : 'matches'}{distanceOf && sorted.some((r) => r.dist != null) ? ' · nearest first' : ''}</div>
      {#if !sorted.length}<p class="empty">No body has all of those tags.</p>{/if}
      <ul>
        {#each sorted as r (r.n.__systemId + ':' + r.n.id)}
          <li>
            <button class="res" on:click={() => dispatch('select', { systemId: r.n.__systemId, id: r.n.id })}>
              <span class="res-name">{r.n.name}</span>
              <span class="res-ctx">{contextOf(r.n)}</span>
              {#if r.dist != null}<span class="res-dist">{fmtDist(r.dist)}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .tag-finder { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .search-wrap { position: relative; }
  .search { width: 100%; box-sizing: border-box; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .suggest { position: absolute; left: 0; right: 0; top: calc(100% + 2px); z-index: 5; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); max-height: 240px; overflow-y: auto; }
  .sugg { width: 100%; display: flex; align-items: center; gap: 7px; background: none; border: none; border-bottom: 1px solid var(--border); padding: 7px 9px; cursor: pointer; color: var(--text); text-align: left; font-size: 0.82rem; }
  .sugg:hover { background: var(--bg-control); }
  .sugg .sgrp { margin-left: auto; color: var(--text-faint); font-size: 0.74rem; }
  .dot { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 auto; }
  .bubbles { display: flex; flex-wrap: wrap; gap: 4px; max-height: 38vh; overflow-y: auto; }
  .bubble { background: color-mix(in srgb, var(--c) 22%, transparent); border: 1px solid var(--c); color: var(--text); border-radius: 999px; padding: 1px 8px; font-size: 0.72rem; line-height: 1.3; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .bubble.open { background: var(--c); color: #fff; }
  .bcnt { font-size: 0.68em; opacity: 0.7; }
  .cat-tags { display: flex; flex-wrap: wrap; gap: 5px; padding: 6px; background: var(--bg-control); border-radius: 6px; }
  .chip { border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: #fff; }
  .chip:hover { filter: brightness(1.12); }
  .chip.active { outline: 2px solid #fff; }
  .cnt { font-size: 0.72em; opacity: 0.85; background: rgba(0,0,0,0.22); border-radius: 8px; padding: 0 5px; }
  .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 26px; }
  .flabel { font-size: 0.76rem; color: var(--text-faint); }
  .hint { font-size: 0.78rem; color: var(--text-faint); font-style: italic; }
  .chip.rm .x { font-weight: bold; }
  .results { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
  .res-head { font-size: 0.74rem; color: var(--text-faint); position: sticky; top: 0; background: var(--bg-panel); padding: 2px 0; }
  .empty { color: var(--text-faint); font-style: italic; }
  .results ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .res { width: 100%; display: flex; align-items: baseline; gap: 8px; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 7px 9px; cursor: pointer; color: var(--text); text-align: left; }
  .res:hover { border-color: var(--accent); }
  .res-name { font-weight: 600; }
  .res-ctx { font-size: 0.76rem; color: var(--text-faint); }
  .res-dist { margin-left: auto; font-size: 0.76rem; color: var(--accent, #6aa0d8); white-space: nowrap; }

  /* Mobile: tighter bubbles/chips, and cap the browse area so results stay visible. */
  @media (max-width: 640px) {
    .tag-finder { gap: 6px; }
    .bubbles { max-height: 30vh; gap: 3px; }
    .bubble { padding: 0 7px; font-size: 0.7rem; line-height: 1.25; }
    .cat-tags { max-height: 26vh; overflow-y: auto; }
    .chip { padding: 2px 7px; font-size: 0.72rem; line-height: 1.3; }
    .res-name { font-size: 0.9rem; }
  }
</style>

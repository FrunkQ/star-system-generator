<script lang="ts">
  // Find-by-tag directory. Browse categories as bubbles → expand one to see its tags → click a tag
  // to add it to the active filter list (or quick-add via search). Results below = bodies carrying
  // ALL active filter tags. Inside a system on a scaled map, results show inter-system distance and
  // sort nearest-first; otherwise alphabetical.
  import { createEventDispatcher } from 'svelte';
  import { describeTag } from '$lib/tags/tagPresentation';
  import HelpModal from './HelpModal.svelte';
  // The user-facing guide, bundled from its single source in docs/ so the help reads the same as the repo doc.
  import tagsGuide from '../../../docs/tags-guide.md?raw';

  let showHelp = false;
  export let nodes: any[] = [];                       // all bodies/constructs (with __systemId/__systemName/tags)
  export let contextOf: (n: any) => string = () => '';
  export let currentSystemId: string | null = null;
  export let systems: { id: string; name: string; interstellar?: boolean }[] = [];   // for the system scope dropdown
  export let distanceOf: ((systemId: string) => number | null) | null = null;
  export let distanceUnit = 'ly';
  const dispatch = createEventDispatcher();

  let q = '';
  let expanded: string | null = null;     // expanded category group
  let filters: string[] = [];             // active tag keys (ANDed)
  // Two finders share this tool: body tags vs construct (ship/station) tags — they use different tag sets.
  let mode: 'bodies' | 'constructs' = 'bodies';
  function setMode(m: 'bodies' | 'constructs') {
    if (m === mode) return;
    mode = m; filters = []; expanded = null; q = '';
    if (m === 'bodies' && scope.startsWith('interstellar:')) scope = 'all';   // interstellar scope is constructs-only
  }
  // Scope: 'all' systems, or one system. Defaults to the system you're in, else all.
  let scope: string = currentSystemId ?? 'all';
  $: kindNodes = nodes.filter((n) => mode === 'constructs' ? n.kind === 'construct' : n.kind !== 'construct');
  $: scopedNodes = scope === 'all' ? kindNodes : kindNodes.filter((n) => n.__systemId === scope);
  // Real systems vs interstellar pseudo-systems (each a ship out in the void), grouped at the bottom.
  $: realSystems = systems.filter((s) => !s.interstellar);
  $: interSystems = systems.filter((s) => s.interstellar);

  // tag key → the nodes (within scope) that carry it
  $: index = (() => {
    const m = new Map<string, any[]>();
    for (const n of scopedNodes) for (const t of (n.tags ?? [])) {
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
    ? scopedNodes.filter((n) => { const keys = new Set((n.tags ?? []).map((t: any) => t.key)); return filters.every((f) => keys.has(f)); })
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
  // --- Highlight markers on the player views -------------------------------------------------
  // This picker already knows what is ON the map, with colours and counts, so it is the right place
  // to choose what gets badged — highlighting a tag nothing carries would show nothing. Drag a tag
  // chip or a category bubble into the tray, or click + on it. The Quick-overrides panel in Player
  // Views is then just a mute for what is chosen here, not a second way to choose it.
  import { liveOverrides } from '$lib/player/liveOverrides';
  import { tagCategories } from '$lib/tags/tagCategories';

  let dragOver = false;
  const isHl = (ref: string) => $liveOverrides.mapHighlights.some((h) => h.ref === ref);
  function addHighlight(ref: string) {
    if (!ref || isHl(ref)) return;
    liveOverrides.update((o) => ({ ...o, mapHighlights: [...o.mapHighlights, { ref }] }));
  }
  function removeHighlight(ref: string) {
    liveOverrides.update((o) => ({ ...o, mapHighlights: o.mapHighlights.filter((h) => h.ref !== ref) }));
  }
  function onDrop(e: DragEvent) {
    dragOver = false;
    const ref = e.dataTransfer?.getData('text/tag-ref');
    if (ref) addHighlight(ref);
  }
  const startDrag = (e: DragEvent, ref: string) => e.dataTransfer?.setData('text/tag-ref', ref);
  // A GROUP is a display name ("Geology"); the highlight wants the namespace it came from.
  const groupRef = (g: string) => {
    const first = grouped[g]?.[0]?.key ?? '';
    return first.includes('/') ? first.split('/')[0] : first;
  };
  /** What a chosen ref renders as, so the tray previews the marker. */
  function hlChip(ref: string): { label: string; color: string; textColor: string } {
    if (ref.includes('/')) {
      const i = describeTag(ref);
      return { label: i.label, color: i.color, textColor: i.textColor || '#fff' };
    }
    const c = $tagCategories.find((x) => x.id === ref);
    if (c) return { label: c.longName, color: c.color, textColor: c.textColor || '#fff' };
    const i = describeTag(`${ref}/x`);
    return { label: ref.charAt(0).toUpperCase() + ref.slice(1), color: i.color, textColor: i.textColor || '#fff' };
  }

</script>

<div class="tag-finder">
  <!-- bodies vs constructs -->
  <div class="tf-tabs">
    <button class:active={mode === 'bodies'} on:click={() => setMode('bodies')}>Bodies</button>
    <button class:active={mode === 'constructs'} on:click={() => setMode('constructs')}>Constructs</button>
    <button type="button" class="tf-help" title="About tags, PoI & CoI" aria-label="Tags guide" on:click={() => (showHelp = true)}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
      Guide
    </button>
  </div>

  {#if showHelp}
    <HelpModal markdown={tagsGuide} on:close={() => (showHelp = false)} />
  {/if}

  <!-- system scope + search, side by side to save vertical space -->
  <div class="top-row">
    <select class="scope" bind:value={scope}>
      <option value="all">★ All systems</option>
      {#each realSystems as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      {#if mode === 'constructs' && interSystems.length}
        <optgroup label="Interstellar">
          {#each interSystems as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </optgroup>
      {/if}
    </select>
    <div class="search-wrap">
      <input class="search" placeholder="Search tags…" bind:value={q} on:keydown={onSearchKey} />
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
  </div>

  <!-- category bubbles -->
  <div class="bubbles">
    {#each groupNames as g (g)}
      <button class="bubble" class:open={expanded === g} style="--c:{groupColor(g)}"
        draggable="true" on:dragstart={(e) => startDrag(e, groupRef(g))}
        on:click={() => (expanded = expanded === g ? null : g)}
        title="Click to open. Drag onto the highlight tray to badge the whole category.">
        {g} <span class="bcnt">{grouped[g].length}</span>
      </button>
    {/each}
  </div>
  {#if expanded && grouped[expanded]}
    <div class="cat-tags">
      {#each grouped[expanded] as t (t.key)}
        <button class="chip" class:active={filters.includes(t.key)} style="background:{t.color}; color:{t.textColor}"
          draggable="true" on:dragstart={(e) => startDrag(e, t.key)}
          on:click={() => addFilter(t.key)} title="{t.key}
Click to filter. Drag onto the highlight tray to badge it on the maps.">
          {t.label} <span class="cnt">{t.count}</span>
          <span class="tohl" role="button" tabindex="-1" title="Highlight on the player views"
            on:click|stopPropagation={() => addHighlight(t.key)}
            on:keydown|stopPropagation={(e) => { if (e.key === 'Enter') addHighlight(t.key); }}>+</span>
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

  <!-- Highlight tray: what gets badged on the maps and the players' views. -->
  <div class="hl-tray" class:over={dragOver}
    role="region" aria-label="Show highlight markers on player views"
    on:dragover|preventDefault={() => (dragOver = true)}
    on:dragleave={() => (dragOver = false)}
    on:drop|preventDefault={onDrop}>
    <span class="hl-title">Show highlight markers on player views</span>
    {#if $liveOverrides.mapHighlights.length}
      <div class="hl-list">
        {#each $liveOverrides.mapHighlights as h (h.ref)}
          {@const c = hlChip(h.ref)}
          <button class="chip rm" style="background:{c.color}; color:{c.textColor}"
            on:click={() => removeHighlight(h.ref)} title="Stop highlighting {c.label}">
            {c.label} <span class="x">×</span>
          </button>
        {/each}
      </div>
    {:else}
      <span class="hint">Drag a tag or a category here — or use the + on a tag — to badge it on every map, yours and the players'.</span>
    {/if}
  </div>

  <!-- results -->
  <div class="results">
    {#if filters.length}
      <div class="res-head">{sorted.length} {sorted.length === 1 ? 'match' : 'matches'}{distanceOf && sorted.some((r) => r.dist != null) ? ' · nearest first' : ''}</div>
      {#if !sorted.length}<p class="empty">No {mode === 'constructs' ? 'construct' : 'body'} has all of those tags.</p>{/if}
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
  .tf-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); }
  .tf-tabs button { flex: 1; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-muted, #b8bcc4); padding: 6px 8px; cursor: pointer; font-size: 0.86rem; }
  .tf-tabs button.active { color: var(--text, #e8e8e8); border-bottom-color: var(--accent, #5b8def); font-weight: 600; }
  .tf-tabs .tf-help { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted, #b8bcc4); font-size: 0.78rem; }
  .tf-tabs .tf-help:hover { color: var(--accent, #5b8def); }
  .tf-tabs .tf-help svg { flex: 0 0 auto; }
  .top-row { display: flex; gap: 6px; align-items: stretch; }
  .top-row .scope { flex: 0 0 42%; width: auto; }
  .top-row .search-wrap { flex: 1 1 auto; }
  .search-wrap { position: relative; }
  .scope { width: 100%; box-sizing: border-box; padding: 7px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); font-size: 0.86rem; }
  .scope option[value="all"] { font-weight: 700; }
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
  /* THE TAG PILL — geometry from the tokens, so this chip and the map markers stay one shape. */
  .chip { border: none; border-radius: var(--tag-pill-radius); padding: var(--tag-pill-pad-y) var(--tag-pill-pad-x); font-size: var(--tag-pill-font-size); cursor: pointer; display: inline-flex; align-items: center; gap: var(--tag-pill-gap); color: #fff; }
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

  .hl-tray { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; padding: 6px 7px;
             border: 1px dashed var(--border); border-radius: 5px; transition: border-color 120ms, background 120ms; }
  .hl-tray.over { border-color: var(--link, #6aa0d8); background: rgba(106,160,216,0.10); border-style: solid; }
  .hl-title { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); }
  .hl-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .tohl { margin-left: 4px; opacity: 0.55; font-weight: bold; cursor: pointer; }
  .tohl:hover { opacity: 1; }
</style>
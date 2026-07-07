<script lang="ts">
  // Phase 03 §03.7 — body picker / hierarchy navigator. A slim always-on command strip
  // ([● Name role] | search | ▾) with a dropdown that drills the system hierarchy by
  // category (Stars / Terrestrial / Gas giants / Moons / Constructs / …). Selecting a row
  // emits `select` with the node id; the host focuses it (camera tweens). Makes 100+ body
  // systems navigable without hunting on the canvas. Reference: v2 prototype's picker.
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import type { SystemNode } from '$lib/types';
  import { getNodeColor } from '$lib/rendering/colors';
  import { AU_KM } from '$lib/constants';

  // Stars white, Constructs yellow (Alex), Biospheres green, etc. — category swatches so
  // the established type colours read on the list. Declared before the props that default
  // to it (const is in TDZ until this line).
  const DEFAULT_CAT_COLORS: Record<string, string> = {
    'Stars': '#f5f1ea',
    'Planets': '#9aa7b4',
    'Moons': '#c2c2c2',
    'Belts': '#8a8f9a',
    'Rings': '#d9c08a',
    'Terrestrial': '#cc6600',
    'Gas giants': '#cc0000',
    'Ice giants': '#add8e6',
    'Human-habitable': '#007bff',
    'Earth-like': '#10b981',
    'Biospheres': '#00ff00',
    'Constructs': '#ffd24d',
    'Systems': '#f5f1ea',
    'Other': '#888888'
  };

  export let nodes: SystemNode[] = [];
  export let focusedId: string | null = null;
  export let placeholder = 'Search bodies…';
  export let top = 8; // px from the top of the canvas; host raises it below the phone strip
  export let emptyLabel = 'System'; // chip text when nothing is focused
  export let inline = false; // embed in a form (relative, full-width) vs float over a canvas
  export let summaryText = ''; // optional aggregate summary shown at the top of the dropdown
  export let startOpen = false; // open the dropdown immediately (e.g. in a dedicated modal)
  export let sections = false; // multi-category: show consecutive heading+items sections instead of drill-in

  // Injectable so the same picker drives the starmap (systems) as well as a system (bodies).
  // categorize returns ALL categories a node belongs to (overlapping, like the old summary
  // strip: a terrestrial planet with a biosphere is in Planets + Terrestrial + Biospheres).
  export let categorize: (n: any) => string[] = defaultCategorize;
  export let categoryOrder: string[] = [
    'Stars',
    'Planets',
    'Moons',
    'Belts',
    'Rings',
    'Terrestrial',
    'Gas giants',
    'Ice giants',
    'Human-habitable',
    'Earth-like',
    'Biospheres',
    'Constructs',
    'Other'
  ];
  export let categoryColors: Record<string, string> = DEFAULT_CAT_COLORS;
  export let colorOf: (n: any) => string = getNodeColor;
  export let contextOf: (n: any) => string = defaultContext;
  export let roleOf: (n: any) => string = defaultRole;
  export let filterItems: (n: any) => boolean = (n: any) => n.kind === 'body' || n.kind === 'construct';

  const dispatch = createEventDispatcher();

  let open = false;
  let query = '';
  let drill: string | null = null; // active category when drilled in
  let root: HTMLElement;

  // Mirrors the old SystemSummary stat definitions so the picker's counts match 1:1
  // (overlapping membership: Planets + Terrestrial + Biospheres etc.).
  function defaultCategorize(n: any): string[] {
    if (n.kind === 'construct') return ['Constructs'];
    const cls = (n.classes || []).join(' ');
    const rh = n.roleHint;
    if (rh === 'star' || /(^|\/)star/.test(cls)) return ['Stars'];
    if (rh === 'belt') return ['Belts'];
    if (rh === 'ring') return ['Rings'];
    const cats: string[] = [];
    if (rh === 'planet') cats.push('Planets');
    if (rh === 'moon') cats.push('Moons');
    if (rh === 'planet' || rh === 'moon') {
      if (/ice-giant/.test(cls)) cats.push('Ice giants');
      else if (/gas-giant/.test(cls)) cats.push('Gas giants');
      else cats.push('Terrestrial');
      if (n.tags?.some((t: any) => t.key === 'habitability/human')) cats.push('Human-habitable');
      if (n.tags?.some((t: any) => t.key === 'habitability/earth-like')) cats.push('Earth-like');
      if (n.biosphere) cats.push('Biospheres');
    }
    return cats.length ? cats : ['Other'];
  }
  function defaultContext(n: any): string {
    const pid = n.orbit?.hostId || n.parentId;
    const p = (nodes as any[]).find((x) => x.id === pid);
    if (!p) return '';
    // A construct/object sitting on the surface has orbit radius ~= the host radius
    // (altitude ~0), so say "on X" rather than "orbits X".
    const a = n.orbit?.elements?.a_AU;
    if (a != null && p.radiusKm && a * AU_KM <= p.radiusKm * 1.005) return `on ${p.name}`;
    return `orbits ${p.name}`;
  }
  function defaultRole(n: any): string {
    if (n.kind === 'construct') return 'construct';
    return n.roleHint || n.kind || '';
  }
  // Constructs carry a basic glyph shape (icon_type). Mirror it in the list with a
  // clip-path on the swatch so a ship/station/gate reads differently from a planet dot.
  function dotClip(n: any): string {
    if (n?.kind !== 'construct') return '';
    switch (n.icon_type) {
      case 'diamond': return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      case 'cross': return 'polygon(38% 0,62% 0,62% 38%,100% 38%,100% 62%,62% 62%,62% 100%,38% 100%,38% 62%,0 62%,0 38%,38% 38%)';
      case 'circle': return '';
      case 'square': return 'inset(0)';
      default: return 'polygon(50% 0%, 100% 100%, 0% 100%)'; // triangle (general construct default)
    }
  }
  // Inline style for a node's swatch: construct -> its colour + clipped shape; else dot.
  function swatchStyle(n: any): string {
    const clip = dotClip(n);
    const bg = `background:${colorOf(n)};`;
    return clip ? `${bg} clip-path:${clip}; border-radius:0;` : bg;
  }

  // Distance from the star (AU), summed up the orbit chain. A moon's distance = its host planet's
  // distance + the moon's own orbit radius, so a body's natural order is by how far from the star it
  // sits — and moons clump right after their host planet ("planet, moon, moon, planet, moon") rather
  // than scattering alphabetically. Memoised over `nodes`; ties (and bodies with no orbit) fall back
  // to name.
  $: distById = (() => {
    const byId = new Map((nodes as any[]).map((n) => [n.id, n]));
    const cache = new Map<string, number>();
    const dist = (n: any, seen: Set<string>): number => {
      if (!n || seen.has(n.id)) return 0;
      if (cache.has(n.id)) return cache.get(n.id)!;
      seen.add(n.id);
      const a = n.orbit?.elements?.a_AU ?? 0;
      const pid = n.orbit?.hostId ?? n.parentId;
      const d = a + (pid ? dist(byId.get(pid), seen) : 0);
      cache.set(n.id, d);
      return d;
    };
    for (const n of nodes as any[]) dist(n, new Set());
    return cache;
  })();
  function byStarDistance(a: any, b: any): number {
    return ((distById.get(a.id) ?? 0) - (distById.get(b.id) ?? 0)) || a.name.localeCompare(b.name);
  }

  $: selectable = nodes.filter((n: any) => filterItems(n));
  $: byCat = (() => {
    const m = new Map<string, any[]>();
    for (const n of selectable as any[]) {
      for (const c of categorize(n)) {
        if (!m.has(c)) m.set(c, []);
        m.get(c)!.push(n);
      }
    }
    for (const arr of m.values()) arr.sort(byStarDistance);
    return m;
  })();
  $: extraCats = Array.from(byCat.keys()).filter((c) => !categoryOrder.includes(c));
  $: categories = [...categoryOrder, ...extraCats]
      .filter((c) => byCat.has(c))
      .map((c) => ({ key: c, items: byCat.get(c)! }));

  $: focused = (nodes as any[]).find((n) => n.id === focusedId) || null;
  $: q = query.trim().toLowerCase();
  $: searchResults = q ? (selectable as any[]).filter((n) => n.name.toLowerCase().includes(q)).sort(byStarDistance).slice(0, 100) : [];
  $: drillItems = drill ? byCat.get(drill) ?? [] : [];

  function pick(id: string) {
    dispatch('select', id);
    open = false;
    query = '';
    drill = null;
    removeOutside();
  }
  function toggleOpen() {
    open = !open;
    if (open) addOutside();
    else { drill = null; removeOutside(); }
  }
  // Primary affordance: always opens at the root category list.
  function browseClick() {
    if (open) { open = false; drill = null; removeOutside(); }
    else { open = true; drill = null; addOutside(); }
  }
  function openToFocused() {
    open = true;
    drill = focused ? (categorize(focused)[0] ?? null) : null;
    addOutside();
  }
  function clearSearch() {
    query = '';
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (query) query = '';
      else { open = false; drill = null; removeOutside(); }
    }
  }
  function onInput() {
    if (!open) { open = true; addOutside(); }
    drill = null; // search is a flat list, no category context
  }

  function onOutside(e: Event) {
    if (root && !root.contains(e.target as Node)) {
      open = false;
      drill = null;
      removeOutside();
    }
  }
  function addOutside() {
    if (typeof window !== 'undefined') window.addEventListener('pointerdown', onOutside, true);
  }
  function removeOutside() {
    if (typeof window !== 'undefined') window.removeEventListener('pointerdown', onOutside, true);
  }
  onDestroy(removeOutside);
  // In a modal we want the list visible immediately and NOT closing on clicks inside the
  // modal, so open without the outside-click listener (the modal owns dismissal).
  onMount(() => { if (startOpen) { open = true; drill = null; } });

  // If the host changes the focused body (e.g. canvas tap), collapse the dropdown.
  let lastFocus: string | null = null;
  $: if (focusedId !== lastFocus) { lastFocus = focusedId; if (open) { open = false; drill = null; removeOutside(); } }
</script>

<div class="body-picker" class:open class:inline class:flow={startOpen} bind:this={root} style={inline ? '' : `top:${top}px`}>
  <div class="strip">
    <button class="browse" on:click={browseClick} aria-expanded={open} title="Browse all">
      <span class="browse-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </span>
      {#if focused}
        <span class="dot" style={swatchStyle(focused)}></span>
        <span class="chip-name">{focused.name}</span>
      {:else}
        <span class="chip-name muted">{emptyLabel}</span>
      {/if}
      <span class="caret" class:flip={open} aria-hidden="true">▾</span>
    </button>

    <input
      class="search"
      type="text"
      bind:value={query}
      on:input={onInput}
      on:keydown={onKeydown}
      {placeholder}
      aria-label="Search bodies"
    />

    {#if query}
      <button class="icon-btn" on:click={clearSearch} aria-label="Clear search" title="Clear">×</button>
    {/if}
  </div>

  {#if open}
    <div class="dropdown">
      {#if summaryText && !q && !drill}
        <div class="picker-summary">{summaryText}</div>
      {/if}
      {#if q}
        <div class="panel-head"><span>Results for “{query}”</span></div>
        {#if searchResults.length === 0}
          <div class="empty">No bodies match.</div>
        {:else}
          <ul>
            {#each searchResults as n (n.id)}
              <li><button class="row" class:active={n.id === focusedId} on:click={() => pick(n.id)}>
                <span class="dot" style={swatchStyle(n)}></span>
                <span class="row-name">{n.name}</span>
                <span class="row-ctx">{contextOf(n)}</span>
              </button></li>
            {/each}
          </ul>
        {/if}
      {:else if drill}
        <div class="panel-head">
          <button class="back" on:click={() => (drill = null)} aria-label="Back">‹</button>
          <span>{drill}</span>
        </div>
        <ul>
          {#each drillItems as n (n.id)}
            <li><button class="row" class:active={n.id === focusedId} on:click={() => pick(n.id)}>
              <span class="dot" style={swatchStyle(n)}></span>
              <span class="row-name">{n.name}</span>
              <span class="row-ctx">{contextOf(n)}</span>
            </button></li>
          {/each}
        </ul>
      {:else if sections && categories.length > 1}
        <!-- Consecutive sections: each category is a heading followed by its items, all expanded. -->
        <ul>
          {#each categories as c (c.key)}
            <li class="section-head">{c.key}</li>
            {#each c.items as n (n.id)}
              <li><button class="row" class:active={n.id === focusedId} on:click={() => pick(n.id)}>
                <span class="dot" style={swatchStyle(n)}></span>
                <span class="row-name">{n.name}</span>
                <span class="row-ctx">{contextOf(n)}</span>
              </button></li>
            {/each}
          {/each}
        </ul>
      {:else if categories.length === 1}
        <!-- One category (e.g. starmap systems): list items directly, no drill step. -->
        <ul>
          {#each categories[0].items as n (n.id)}
            <li><button class="row" class:active={n.id === focusedId} on:click={() => pick(n.id)}>
              <span class="dot" style={swatchStyle(n)}></span>
              <span class="row-name">{n.name}</span>
              <span class="row-ctx">{contextOf(n)}</span>
            </button></li>
          {/each}
        </ul>
      {:else}
        <ul>
          {#each categories as c (c.key)}
            <li><button class="row category" on:click={() => (drill = c.key)}>
              <span class="dot" style="background:{categoryColors[c.key] ?? colorOf(c.items[0])}; {c.key === 'Constructs' ? 'clip-path:polygon(50% 0%, 100% 100%, 0% 100%); border-radius:0;' : ''}"></span>
              <span class="row-name">{c.key}</span>
              <span class="row-ctx">{c.items.length}</span>
              <span class="chevron">›</span>
            </button></li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .body-picker {
    position: absolute;
    /* top set inline via the `top` prop */
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    width: min(420px, calc(100% - 24px));
    font-size: 0.9rem;
  }
  .body-picker.inline {
    position: relative;
    left: auto;
    transform: none;
    width: 100%;
    z-index: 40;
  }
  /* In a modal: dropdown in normal flow + fills available height (not an overlay). */
  .body-picker.flow {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .body-picker.flow .dropdown {
    position: static;
    margin-top: 8px;
    max-height: none;
    flex: 1 1 auto;
  }
  .strip {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    padding: 0 6px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 88%, transparent);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 10px;
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  /* Primary affordance: the browse button opens the full list. Larger + accent-tinted. */
  .browse {
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 0 0 auto;
    max-width: 52%;
    height: 36px;
    padding: 0 10px;
    background: color-mix(in srgb, var(--accent, #ff5a1f) 16%, var(--bg-control, #1b1e26));
    border: 1px solid color-mix(in srgb, var(--accent, #ff5a1f) 55%, var(--border, #2a2d36));
    border-radius: 8px;
    color: var(--text, #e8e8e8);
    font-weight: 600;
    cursor: pointer;
  }
  .browse:hover {
    background: color-mix(in srgb, var(--accent, #ff5a1f) 26%, var(--bg-control, #1b1e26));
  }
  .browse-icon {
    display: flex;
    color: var(--accent, #ff5a1f);
    flex: 0 0 auto;
  }
  .caret {
    color: var(--text-faint, #cfcfcf);
    flex: 0 0 auto;
    transition: transform 0.15s ease;
  }
  .caret.flip { transform: rotate(180deg); }
  .chip-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15) inset;
  }
  .dot.muted { background: #555; }
  .muted { color: var(--text-faint, #8a8f9a); }
  .search {
    flex: 1 1 auto;
    min-width: 0;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--text, #e8e8e8);
    font-size: 0.9rem;
    outline: none;
  }
  .icon-btn {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 7px;
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
  }
  .icon-btn:hover { background: var(--bg-control-hover, #232733); }

  .dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    z-index: 5;
    max-height: 52vh;
    overflow-y: auto;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 96%, transparent);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  }
  .section-head {
    padding: 6px 12px 3px;
    color: var(--text-faint, #8a8f9a);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border, #2a2d36);
  }
  .panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border, #2a2d36);
    color: var(--text-faint, #8a8f9a);
    font-size: 0.8rem;
    position: sticky;
    top: 0;
    background: var(--bg-panel, #14161c);
  }
  .back {
    border: none;
    background: transparent;
    color: var(--text, #e8e8e8);
    font-size: 1.1rem;
    cursor: pointer;
    line-height: 1;
    padding: 0 4px;
  }
  ul { list-style: none; margin: 0; padding: 4px; }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 42px;
    padding: 6px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text, #e8e8e8);
    cursor: pointer;
    text-align: left;
  }
  .row:hover { background: var(--bg-control, #1b1e26); }
  .row.active { background: color-mix(in srgb, var(--accent, #ff5a1f) 22%, transparent); }
  .row-name { flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-ctx { color: var(--text-faint, #8a8f9a); font-size: 0.78rem; flex: 0 0 auto; }
  .row.category .row-name { font-weight: 600; }
  .chevron { color: var(--text-faint, #8a8f9a); }
  .empty { padding: 14px; color: var(--text-faint, #8a8f9a); text-align: center; }
  .picker-summary {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border, #2a2d36);
    color: var(--text-muted, #cfcfcf);
    font-size: 0.8rem;
    line-height: 1.4;
  }
</style>

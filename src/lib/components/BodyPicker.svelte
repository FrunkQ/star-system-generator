<script lang="ts">
  // THE ONE PICKER. Every "which body?" in the app is this component: the system view's navigator,
  // the transit planner's destination, and the interstellar modal's system and body.
  //
  // A slim command strip ([● Name role] | search | ▾) over a dropdown that shows the system as a
  // HIERARCHY — Sol > Earth > Luna > Lunar Gateway — with type toggles above it. Selecting a row emits
  // `select` with the node id.
  //
  // It used to be a list of categories you drilled INTO, one at a time. Owner, 2026-08-26: the pickers
  // want "a proper Earth / Moon / construct hierarchy and to be able to toggle types on and off...
  // Reuse and refine, and ONE interface for the user to learn." Drilling meant finding a station
  // required knowing it was a Construct rather than knowing it was at Earth, and it could show only one
  // category at a time. The list rule now lives in `ui/bodyPickerList.ts`, where it can be tested
  // without a DOM, and is shared by every mount.
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import type { SystemNode } from '$lib/types';
  import { createFloatingControl } from '$lib/ui/floatingControl';
  import FloatGrip from './FloatGrip.svelte';
  import FloatPin from './FloatPin.svelte';
  import { getNodeColor } from '$lib/rendering/colors';
  import { AU_KM } from '$lib/constants';
  import { buildPickerRows, buildCategoryChips } from '$lib/ui/bodyPickerList';

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
  // Over a map the always-on strip takes permanent space and is not where the eye is. `floating`
  // collapses it to a puck that opens on demand and gets out of the way again — the same shape as
  // the player time control. Defaults OFF: the inline mounts (transit planner, the two find-a-body
  // modals) are in a panel, not over a canvas, and want the strip they already have.
  export let floating = false;
  export let summaryText = ''; // optional aggregate summary shown at the top of the dropdown
  export let startOpen = false; // open the dropdown immediately (e.g. in a dedicated modal)
  // NOT A DESTINATION: the ship's own current home. Shown as unselectable CONTEXT when it holds
  // something that IS pickable (a ship at Earth may still be offered Luna and the ISS), and dropped
  // entirely when it does not.
  export let excludeIds: string[] = [];
  // Categories switched on. Empty means everything - a filter nobody has touched must not hide.
  export let activeCategories: string[] = [];
  // Show the type toggles. Off for a picker with one kind of thing in it, where a row of chips
  // that all say the same thing is furniture.
  export let showTypeToggles = true;

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
  // Which type toggles are pressed. Local, so the component owns its own filtering, but seeded from
  // the `activeCategories` prop so a host can open the picker already narrowed.
  let active: string[] = [];
  $: active = activeCategories.length && !active.length ? [...activeCategories] : active;
  function toggleCategory(key: string) {
    active = active.includes(key) ? active.filter((k) => k !== key) : [...active, key];
  }
  let root: HTMLElement;
  // Floating mode shares ONE behaviour with the time transport: grip on the left, lock on the
  // right, puts itself away when something else is touched unless it is locked open.
  const float = createFloatingControl('sse-body-picker-float', {}, { enabled: floating });
  // A non-floating picker is always shown; a floating one only once its puck is opened.
  $: expanded = $float.open;
  $: stripShown = !floating || expanded;

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
    // A MEMBER OF A PAIR names its PARTNER, not the barycentre - the auto pair name concatenates
    // both members plus "Barycentre", so "orbits <that>" reads the row's own name back at the GM
    // twice over (owner screenshot, 2026-08-28; same lesson as BodyOrbitTab's host labels). The
    // pair's marker sits on the barycentre (PHY-32), so the riding clause comes from the parent.
    if (p.kind === 'barycenter' && (p.memberIds || []).includes(n.id) && p.memberIds.length === 2) {
      const partner = (nodes as any[]).find((x) => x.id !== n.id && p.memberIds.includes(x.id));
      if (partner) {
        const sec = p.coOrbital ? (nodes as any[]).find((x) => x.id === p.coOrbital.hostId) : null;
        return `pairs with ${partner.name}` + (sec ? ` · at ${sec.name} ${String(p.coOrbital.point).toUpperCase()}` : '');
      }
    }
    // A co-orbital rider orbits the star AND rides with its secondary - "orbits Sol" alone is true
    // but loses the half a GM actually placed it for (owner, 2026-08-28).
    if (n.coOrbital) {
      const sec = (nodes as any[]).find((x) => x.id === n.coOrbital.hostId);
      if (sec) return `orbits ${p.name} · with ${sec.name} (${String(n.coOrbital.point).toUpperCase()})`;
    }
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

  // ONE list rule, shared with every other picker in the app (`ui/bodyPickerList.ts`). Sorting stays
  // here because it is the picker's own idea of nearness - siblings by distance from the star.
  $: chips = showTypeToggles
    ? buildCategoryChips({ nodes, filterItems, categorize, excludeIds, order: categoryOrder })
    : [];
  $: rows = buildPickerRows({
    nodes, filterItems, categorize, excludeIds,
    activeCategories: active,
    query,
    sort: byStarDistance
  });

  $: focused = (nodes as any[]).find((n) => n.id === focusedId) || null;
  $: q = query.trim().toLowerCase();

  function pick(id: string) {
    dispatch('select', id);
    open = false;
    query = '';
    // A floating picker's whole point is to leave again — unless it has been locked open.
    if (floating && !$float.pinned) float.setOpen(false);
    removeOutside();
  }
  // Puck → full strip with the list already showing, so a jump is still two clicks. A drag on the
  // puck moves it and must not count as that tap.
  function openPuck() {
    if (float.didDrag()) return;
    float.setOpen(true);
    open = true;
    addOutside();
  }
  function collapse() {
    open = false;
    if (floating && !$float.pinned) float.setOpen(false);
    removeOutside();
  }
  // Shutting the dropdown must not drop the outside-click listener while a floating strip is
  // still expanded — that listener is what puts the puck away again.
  function closeDropdown() {
    open = false;
    if (!expanded) removeOutside();
  }
  function toggleOpen() {
    if (open) closeDropdown();
    else { open = true; addOutside(); }
  }
  // Primary affordance: always opens at the root category list.
  function browseClick() {
    if (open) closeDropdown();
    else { open = true; addOutside(); }
  }
  function openToFocused() {
    open = true;
    addOutside();
  }
  function clearSearch() {
    query = '';
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (query) query = '';
      else collapse();
    }
  }
  function onInput() {
    if (!open) { open = true; addOutside(); }
  }

  function onOutside(e: Event) {
    if (root && !root.contains(e.target as Node)) collapse();
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
  onMount(() => { if (startOpen) open = true; });

  // If the host changes the focused body (e.g. canvas tap), collapse the dropdown — and the puck
  // with it, since the user has just said what they wanted by other means. A locked-open picker
  // still keeps its strip; `collapse` honours the lock.
  let lastFocus: string | null = null;
  $: if (focusedId !== lastFocus) { lastFocus = focusedId; if (open || expanded) collapse(); }
</script>

<div class="body-picker" class:open class:inline class:flow={startOpen} class:floating class:expanded bind:this={root} style={inline ? '' : `top:${top}px`}>
  <!-- The drag offset lives on an INNER element so each host keeps ownership of where the picker is
       anchored (the catalogue pins it left; the GM mounts centre it). Putting the translate on the
       root would fight those rules. `float.root` goes HERE, not on the outer div: the outer box is
       unaffected by a transformed child, so measuring it would clamp against the wrong rectangle. -->
  <div class="float-shift" use:float.root style={floating ? `transform: translate(${$float.dx}px, ${$float.dy}px)` : ''}>
  {#if !stripShown}
    <button class="puck" use:float.grip on:click={openPuck} aria-expanded={false} aria-label={focused ? `Browse — ${focused.name}` : `Browse ${emptyLabel}`} title="Tap to browse & search, drag to move">
      <span class="browse-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </span>
      {#if focused}<span class="dot" style={swatchStyle(focused)}></span>{/if}
    </button>
  {:else}
  <div class="strip">
    {#if floating}<FloatGrip ctl={float} />{/if}
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
    {#if floating}<FloatPin ctl={float} what="the picker" />{/if}
  </div>

  {#if open}
    <div class="dropdown">
      {#if summaryText && !q}
        <div class="picker-summary">{summaryText}</div>
      {/if}

      <!-- TYPE TOGGLES. Multi-select and additive: pressing two shows both, pressing none shows
           everything. They used to be a list you drilled INTO one at a time, which meant finding a
           station required knowing it was a Construct rather than knowing it was at Earth. -->
      {#if showTypeToggles && chips.length > 1}
        <div class="type-toggles">
          {#each chips as c (c.key)}
            <button
              class="chip"
              class:on={active.includes(c.key)}
              on:click={() => toggleCategory(c.key)}
              title={active.includes(c.key) ? `Stop showing only ${c.key}` : `Show ${c.key}`}
              aria-pressed={active.includes(c.key)}
            >
              <span class="dot" style="background:{categoryColors[c.key] ?? '#888'}; {c.key === 'Constructs' ? 'clip-path:polygon(50% 0%, 100% 100%, 0% 100%); border-radius:0;' : ''}"></span>
              <span class="chip-label">{c.key}</span>
              <span class="chip-count">{c.count}</span>
            </button>
          {/each}
          {#if active.length}
            <button class="chip clear" on:click={() => (active = [])} title="Show everything again">Clear</button>
          {/if}
        </div>
      {/if}

      {#if q}
        <div class="panel-head"><span>Results for “{query}”</span></div>
      {/if}

      {#if rows.length === 0}
        <div class="empty">{q ? 'No bodies match.' : 'Nothing to show — try clearing the type filters.'}</div>
      {:else}
        <ul>
          {#each rows as r (r.node.id)}
            <li>
              {#if r.context}
                <!-- A parent kept only to say WHERE its children are. Not a legal answer, so it is
                     not a button: it cannot be tabbed to and cannot be clicked by accident. -->
                <div class="row context" style="padding-left:{8 + r.depth * 14}px">
                  <span class="dot" style={swatchStyle(r.node)}></span>
                  <span class="row-name">{r.node.name}</span>
                  <span class="row-ctx">{contextOf(r.node)}</span>
                </div>
              {:else}
                <button
                  class="row"
                  class:active={r.node.id === focusedId}
                  style="padding-left:{8 + r.depth * 14}px"
                  on:click={() => pick(r.node.id)}
                >
                  <span class="dot" style={swatchStyle(r.node)}></span>
                  <span class="row-name">{r.node.name}</span>
                  <span class="row-ctx">{contextOf(r.node)}</span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  {/if}
  </div>
</div>

<style>
  /* TYPE TOGGLES - a wrapping row of chips above the list. Pressed chips read as pressed at a
     glance (filled, brighter) because a filter you cannot see is a filter you forget you set, and
     then the picker looks broken. */
  .type-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border, #2a3040);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: 999px;
    border: 1px solid var(--border, #2a3040);
    background: transparent;
    color: var(--text-muted, #9aa4b8);
    font: inherit;
    font-size: 0.78em;
    cursor: pointer;
    line-height: 1.4;
  }
  .chip:hover { border-color: var(--accent, #6ea8ff); color: var(--text, #e6ebf5); }
  .chip.on {
    background: color-mix(in srgb, var(--accent, #6ea8ff) 22%, transparent);
    border-color: var(--accent, #6ea8ff);
    color: var(--text, #e6ebf5);
  }
  .chip.clear { font-style: italic; }
  .chip-count { opacity: 0.6; font-variant-numeric: tabular-nums; }
  /* A context row places its children and cannot be chosen, so it must not look choosable: no
     pointer, no hover, dimmed. */
  .row.context {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    opacity: 0.45;
    cursor: default;
    font-size: 0.95em;
  }
  .row.context .row-name { font-style: italic; }
  .body-picker {
    position: absolute;
    /* top set inline via the `top` prop */
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    width: min(420px, calc(100% - 24px));
    font-size: 0.9rem;
  }
  /* Carries the drag offset, and is the positioning reference for the dropdown so the list still
     hangs off the strip wherever the strip has been dragged to. */
  .float-shift { position: relative; }
  /* A floating picker anchors its LEFT edge and grows RIGHTWARDS, the way the time transport does.
     Centring the container instead made the strip expand symmetrically around the puck, so the thing
     you had just tapped slid out from under the pointer and ended up mid-bar. The lone puck now sits
     a puck's-half right of centre, which reads as centred; the strip opens from where it stood. */
  .body-picker.floating { transform: none; }
  /* Collapsed puck: the container must shrink to the button, or a 420px-wide transparent box
     would sit over the map swallowing clicks that never reach a control. */
  .body-picker.floating:not(.expanded) { width: auto; }
  .body-picker.floating:not(.expanded) .float-shift { display: inline-block; }
  .puck {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 12px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent, #ff5a1f) 45%, var(--border, #2a2d36));
    border-radius: 999px;
    color: var(--accent, #ff5a1f);
    cursor: pointer;
    touch-action: none; /* the puck doubles as its own drag handle */
    user-select: none;
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .puck:hover { background: color-mix(in srgb, var(--accent, #ff5a1f) 20%, var(--bg-control, #1b1e26)); }
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
  /* The shift wrapper must not break the modal's fill-height column. */
  .body-picker.flow .float-shift {
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
  /* The caption NEVER wins the row: it may shrink to ellipsis, the name may not vanish. A pair
     member's caption used to be "orbits <auto pair name> - with <secondary> (L4)" and at that
     length it crushed the body's own name to zero width (owner screenshot, 2026-08-28). */
  .row-ctx {
    color: var(--text-faint, #8a8f9a); font-size: 0.78rem;
    flex: 0 1 auto; max-width: 60%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
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

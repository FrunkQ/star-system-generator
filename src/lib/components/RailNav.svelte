<script lang="ts">
  // Phase 03 — persistent app-nav rail. Lives in AppShell's `rail` slot (left on desktop,
  // slide-in on phone). Presentational: dispatches events; +page wires them. Two widths:
  // icon-only (minimal) ⇄ icon+text, toggled by the control at the top and remembered.
  import { createEventDispatcher } from 'svelte';
  import { railCollapsed } from '$lib/railStore';
  const dispatch = createEventDispatcher();

  // Which top-level view is showing. The Starmap entry is a live indicator when 'starmap'
  // (highlighted, non-navigating) and a one-click "back to the map" button when 'system'.
  // Projector/Report are system-only actions, so they only appear in the system view.
  export let activeView: 'starmap' | 'system' = 'starmap';

  // When the projector window is open, the Projector entry becomes a greenscreen
  // (chroma-key) toggle; greenscreenOn highlights it.
  export let projectorOpen = false;
  export let rulerOn = false;
  export let rulerAvailable = false;   // starmap: only when scaled (system view always has it)
  export let crtOn = false; // projector "Greenscreen CRT" toggle is on
  export let routesAttention: 'stuck' | 'intervention' | 'done' | null = null; // worst fleet attention → Routes notification dot

  let fileOpen = false; // File group (New / Open / Save) inline accordion
  $: collapsed = $railCollapsed;
  function toggleCollapsed() { railCollapsed.update((v) => !v); }

  // Terminal actions (open a modal / change view): also emit `navigate` so the host can
  // close the phone slide-in rail — otherwise the result is hidden behind the open menu.
  function go(name: string) { dispatch(name); dispatch('navigate'); }

  // Flat Lucide-style monochrome icons (inline SVG).
  const I = {
    file: '<path d="M20 7h-7L9.5 4.5A1 1 0 0 0 8.8 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    starmap: '<line x1="5" y1="5" x2="19" y2="7"/><line x1="5" y1="5" x2="6.5" y2="19"/><line x1="19" y1="7" x2="18" y2="18"/><line x1="6.5" y1="19" x2="18" y2="18"/><line x1="5" y1="5" x2="18" y2="18"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="6.5" cy="19" r="2"/><circle cx="18" cy="18" r="2"/>',
    projector: '<path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect x="2" y="3" width="20" height="14" rx="2"/>',
    report: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/>',
    new: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
    open: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    body: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10.5" ry="3.6" transform="rotate(-22 12 12)"/>',
    ship: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    routes: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    about: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
    greenscreen: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    catalogue: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="10" r="3"/><line x1="10.5" y1="18" x2="13.5" y2="18"/>',
    playerviews: '<rect x="2" y="4" width="13" height="10" rx="1.5"/><rect x="9" y="10" width="13" height="10" rx="1.5"/><line x1="5" y1="7.5" x2="12" y2="7.5"/><circle cx="15.5" cy="15" r="2"/>',
    ruler: '<rect x="2.5" y="7" width="19" height="10" rx="1" transform="rotate(0 12 12)"/><line x1="6.5" y1="7" x2="6.5" y2="10.5"/><line x1="10.5" y1="7" x2="10.5" y2="11.5"/><line x1="14.5" y1="7" x2="14.5" y2="10.5"/><line x1="18.5" y1="7" x2="18.5" y2="11.5"/>',
    interstellar: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.6 16.4 17.4 7.6" stroke-dasharray="3 2.5"/>'
  };
</script>

<nav class="rail-nav" class:collapsed aria-label="App navigation">
  <div class="rail-header">
    <span class="brand rail-label">SSE2</span>
    <button class="rail-collapse" on:click={toggleCollapsed} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label="Toggle menu width">
      {#if collapsed}
        <!-- panel-left-open: expand the rail -->
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>
      {:else}
        <!-- panel-left-close: collapse the rail -->
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/></svg>
      {/if}
    </button>
  </div>

  <button
    class="rail-btn"
    class:active={activeView === 'starmap'}
    aria-current={activeView === 'starmap' ? 'page' : undefined}
    title={activeView === 'starmap' ? 'Starmap (current view)' : 'Back to the starmap'}
    on:click={() => go('starmap')}
  >
    <span class="ic">{@html svg(I.starmap)}</span><span class="rail-label">Starmap</span>
  </button>

  <button class="rail-btn" title="Find a body across all systems" on:click={() => go('allbodies')}>
    <span class="ic">{@html svg(I.body)}</span><span class="rail-label">Find body…</span>
  </button>
  <button class="rail-btn" title="Find a construct across all systems" on:click={() => go('allships')}>
    <span class="ic">{@html svg(I.ship)}</span><span class="rail-label">Find construct…</span>
  </button>
  <button class="rail-btn" title="Find bodies by tag (resources, refuelling, hazards…) across all systems" on:click={() => go('findtag')}>
    <span class="ic">{@html svg(I.tag)}</span><span class="rail-label">Find by tag…</span>
  </button>
  <button class="rail-btn" title={routesAttention ? `Routes & journeys — a ship needs attention (${routesAttention})` : 'Routes & journeys'} on:click={() => go('routes')}>
    <span class="ic">{@html svg(I.routes)}{#if routesAttention}<span class="rail-dot {routesAttention}"></span>{/if}</span><span class="rail-label">Routes…{#if routesAttention}<span class="rail-dot inline {routesAttention}"></span>{/if}</span>
  </button>
  <!-- Field Guide: the players' companion launcher. -->
  <button class="rail-btn" title="Field Guide — open and share the players' companion views" on:click={() => go('catalogue')}>
    <span class="ic">{@html svg(I.catalogue)}</span><span class="rail-label">Field Guide…</span>
  </button>
  <!-- HIDDEN for the production cut: Player Views, the unified players' presentation system
       (the eventual Field Guide replacement — V2.2 line, still in beta testing). -->
  <!-- <button class="rail-btn" title="Design, open and manage the players' views (guides, tables, projections)" on:click={() => go('playerviews')}>
    <span class="ic">{@html svg(I.playerviews)}</span><span class="rail-label">Player Views…</span>
  </button> -->

  <!-- Projector + Report act on the loaded system. Shown in BOTH views for beta (they target the
       last-loaded system when invoked from the starmap). Greenscreen toggle only when a projector is live. -->
  {#if projectorOpen}
    <button class="rail-btn" class:gs-on={crtOn} title="Toggle the projector's green-CRT look" on:click={() => dispatch('projectorcrt')}>
      <span class="ic">{@html svg(I.greenscreen)}</span><span class="rail-label">Greenscreen CRT</span>
    </button>
  {:else}
    <button class="rail-btn" title="Open the projector window" on:click={() => go('projector')}>
      <span class="ic">{@html svg(I.projector)}</span><span class="rail-label">Projector</span>
    </button>
  {/if}
  <button class="rail-btn" title="Generate a report" on:click={() => go('report')}>
    <span class="ic">{@html svg(I.report)}</span><span class="rail-label">Report…</span>
  </button>

  <slot />

  <div class="spacer"></div>

  {#if activeView === 'system' || rulerAvailable}
    <button class="rail-btn" class:active={rulerOn} title={activeView === 'system' ? 'Measure: tap two bodies for the distance between them in AU' : 'Measure: tap two stars or ships for the distance between them'} on:click={() => dispatch('ruler')}>
      <span class="ic" class:accent={rulerOn}>{@html svg(I.ruler)}</span><span class="rail-label">Measure</span>
    </button>
  {/if}
  <button class="rail-btn" class:active={fileOpen} title="File — new / load / save" on:click={() => (fileOpen = !fileOpen)}>
    <span class="ic">{@html svg(I.file)}</span><span class="rail-label">File</span>
    <span class="rail-label chev">{fileOpen ? '▾' : '▸'}</span>
  </button>
  {#if fileOpen}
    <button class="rail-btn sub" title="New starmap" on:click={() => go('new')}>
      <span class="ic">{@html svg(I.new)}</span><span class="rail-label">New Starmap</span>
    </button>
    <button class="rail-btn sub" title="Load a starmap from a file" on:click={() => go('open')}>
      <span class="ic">{@html svg(I.open)}</span><span class="rail-label">Load Starmap</span>
    </button>
    <button class="rail-btn sub" title="Save this starmap to a file" on:click={() => go('save')}>
      <span class="ic">{@html svg(I.save)}</span><span class="rail-label">Save Starmap</span>
    </button>
    {#if activeView === 'system'}
      <button class="rail-btn sub" title="Load a system from a file" on:click={() => go('uploadsystem')}>
        <span class="ic">{@html svg(I.open)}</span><span class="rail-label">Load System</span>
      </button>
      <button class="rail-btn sub" title="Save this system to a file" on:click={() => go('downloadsystem')}>
        <span class="ic">{@html svg(I.save)}</span><span class="rail-label">Save System</span>
      </button>
    {:else}
      <button class="rail-btn sub danger" title="Clear the whole starmap" on:click={() => go('clear')}>
        <span class="ic">{@html svg(I.trash)}</span><span class="rail-label">Clear Starmap…</span>
      </button>
    {/if}
  {/if}
  <button class="rail-btn" title="Settings" on:click={() => go('settings')}>
    <span class="ic">{@html svg(I.settings)}</span><span class="rail-label">Settings</span>
  </button>
  <button class="rail-btn" title="Help — guides & references" on:click={() => go('help')}>
    <span class="ic">{@html svg(I.help)}</span><span class="rail-label">Help</span>
  </button>
  <button class="rail-btn" title="About, attributions & debug tools" on:click={() => go('about')}>
    <span class="ic">{@html svg(I.about)}</span><span class="rail-label">About</span>
  </button>
</nav>

<script context="module" lang="ts">
  // Wrap a path set in an <svg> shell (keeps the markup above readable).
  function svg(inner: string): string {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }
</script>

<style>
  .rail-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 8px;
    min-width: 150px;
    height: 100%;
    box-sizing: border-box;
  }
  .rail-nav.collapsed { min-width: 0; }
  .rail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 4px 6px;
  }
  .rail-nav.collapsed .rail-header { justify-content: center; }
  .rail-collapse {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-control);
    color: var(--text-muted, #cfcfcf);
    cursor: pointer;
  }
  .rail-collapse:hover { background: var(--bg-control-hover); }
  /* The SVG is a direct flex child — pin its size or it collapses to 0 width (the
     long-standing "no icon" bug: an empty-looking square). */
  .rail-collapse svg { flex: 0 0 auto; width: 18px; height: 18px; }
  .brand {
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.08em;
    font-size: 1.05rem;
  }
  /* Lighter "wireframe" feel: rows are transparent (no per-button box) with a thin
     hover highlight, and the labels use a light weight. */
  .rail-btn {
    display: flex;
    align-items: center;
    gap: 11px;
    text-align: left;
    background: transparent;
    color: var(--text);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 8px 10px;
    font-size: 0.86rem;
    font-weight: 300;
    letter-spacing: 0.01em;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }
  .rail-btn:hover { background: var(--bg-control-hover); }
  /* Active = the view you're already in (currently only the Starmap entry). Pure indicator. */
  .rail-btn.active {
    background: var(--bg-control-hover);
    border-color: var(--accent);
    color: var(--accent);
    cursor: default;
  }
  .rail-btn.active .ic { color: var(--accent); }
  /* Greenscreen toggle is ON — tint green to signal the chroma key is live. */
  .rail-btn.gs-on,
  .rail-btn.gs-on .ic {
    color: #22c55e;
  }
  .rail-btn.gs-on { border-color: #22c55e; background: color-mix(in srgb, #22c55e 12%, transparent); }
  /* Let labels shrink + ellipsis within the rail rather than overflow its width (the bottom scrollbar). */
  .rail-btn { min-width: 0; }
  .rail-label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .ic { display: flex; flex: 0 0 auto; color: var(--text-muted, #cfcfcf); position: relative; }
  /* Routes notification dot — worst fleet attention. On the icon (shows when collapsed) + inline in the label. */
  .rail-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
  .ic > .rail-dot { position: absolute; top: -2px; right: -3px; border: 1px solid var(--bg-panel, #14161c); }
  .rail-dot.inline { display: inline-block; margin-left: 6px; vertical-align: middle; }
  .rail-dot.stuck { background: #cc5555; }
  .rail-dot.intervention { background: #d8922f; }
  .rail-dot.done { background: #4a9e5c; }
  .ic.accent { color: var(--accent); }
  .chev { margin-left: auto; color: var(--text-faint, #8a8f9a); font-size: 0.8rem; }
  .rail-btn.sub { margin-left: 14px; background: transparent; }
  .rail-btn.sub:hover { background: var(--bg-control-hover); }
  .rail-nav.collapsed .rail-btn.sub { margin-left: 0; }
  .rail-btn.danger { color: var(--status-bad, #ef4444); }
  .rail-btn.danger .ic { color: var(--status-bad, #ef4444); }
  .spacer { flex: 1 1 auto; }

  /* Collapsed (icon-only): hide labels + section titles everywhere in the rail (incl. the
     slotted view content), centre the icons. :global so it reaches slotted buttons. */
  .rail-nav.collapsed .rail-btn { justify-content: center; padding: 9px; }
  :global(.rail-nav.collapsed .rail-label) { display: none; }
  :global(.rail-nav.collapsed .rail-section-title) { display: none; }
  /* In icon-only mode, hide the verbose view-specific sections (System actions, Clear,
     etc.) — they return when the rail is expanded. Keeps the minimal view clean. */
  :global(.rail-nav.collapsed .rail-view-options) { display: none; }
</style>

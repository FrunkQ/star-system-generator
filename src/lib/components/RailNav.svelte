<script lang="ts">
  // Phase 03 — persistent app-nav rail. Lives in AppShell's `rail` slot (left on desktop,
  // slide-in on phone). Presentational: dispatches events; +page wires them. Two widths:
  // icon-only (minimal) ⇄ icon+text, toggled by the control at the top and remembered.
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  const dispatch = createEventDispatcher();

  // Which top-level view is showing. The Starmap entry is a live indicator when 'starmap'
  // (highlighted, non-navigating) and a one-click "back to the map" button when 'system'.
  // Projector/Report are system-only actions, so they only appear in the system view.
  export let activeView: 'starmap' | 'system' = 'starmap';

  let collapsed = false;
  onMount(() => { if (browser) collapsed = localStorage.getItem('sse-rail-collapsed') === '1'; });
  function toggleCollapsed() {
    collapsed = !collapsed;
    if (browser) localStorage.setItem('sse-rail-collapsed', collapsed ? '1' : '0');
  }

  // Flat Lucide-style monochrome icons (inline SVG).
  const I = {
    starmap: '<circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><path d="M10.4 21.9a10 10 0 0 0 9.941-15.416"/><path d="M13.5 2.1a10 10 0 0 0-9.841 15.416"/>',
    projector: '<path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"/><path d="M12 17v4"/><path d="M8 21h8"/><rect x="2" y="3" width="20" height="14" rx="2"/>',
    report: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/>',
    new: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
    open: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    body: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    ship: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    routes: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  };
</script>

<nav class="rail-nav" class:collapsed aria-label="App navigation">
  <button class="rail-collapse" on:click={toggleCollapsed} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label="Toggle menu width">
    {#if collapsed}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
    {/if}
  </button>

  <div class="brand"><span class="rail-label">SSE</span></div>

  <button
    class="rail-btn"
    class:active={activeView === 'starmap'}
    aria-current={activeView === 'starmap' ? 'page' : undefined}
    title={activeView === 'starmap' ? 'Starmap (current view)' : 'Back to the starmap'}
    on:click={() => dispatch('starmap')}
  >
    <span class="ic">{@html svg(I.starmap)}</span><span class="rail-label">Starmap</span>
  </button>

  <button class="rail-btn" title="New system" on:click={() => dispatch('new')}>
    <span class="ic">{@html svg(I.new)}</span><span class="rail-label">New System</span>
  </button>
  <button class="rail-btn" title="Open starmap" on:click={() => dispatch('open')}>
    <span class="ic">{@html svg(I.open)}</span><span class="rail-label">Open…</span>
  </button>
  <button class="rail-btn" title="Save starmap" on:click={() => dispatch('save')}>
    <span class="ic">{@html svg(I.save)}</span><span class="rail-label">Save</span>
  </button>
  <button class="rail-btn" title="Find a body across all systems" on:click={() => dispatch('allbodies')}>
    <span class="ic">{@html svg(I.body)}</span><span class="rail-label">Find body…</span>
  </button>
  <button class="rail-btn" title="Find a ship/construct across all systems" on:click={() => dispatch('allships')}>
    <span class="ic">{@html svg(I.ship)}</span><span class="rail-label">Find ship…</span>
  </button>
  <button class="rail-btn" title="Routes & journeys" on:click={() => dispatch('routes')}>
    <span class="ic">{@html svg(I.routes)}</span><span class="rail-label">Routes…</span>
  </button>

  {#if activeView === 'system'}
    <button class="rail-btn" title="Open the projector window" on:click={() => dispatch('projector')}>
      <span class="ic">{@html svg(I.projector)}</span><span class="rail-label">Projector</span>
    </button>
    <button class="rail-btn" title="Generate a report" on:click={() => dispatch('report')}>
      <span class="ic">{@html svg(I.report)}</span><span class="rail-label">Report…</span>
    </button>
  {/if}

  <slot />

  <div class="spacer"></div>

  <button class="rail-btn" title="Settings" on:click={() => dispatch('settings')}>
    <span class="ic accent">{@html svg(I.settings)}</span><span class="rail-label">Settings</span>
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
  .rail-collapse {
    align-self: flex-end;
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
  .rail-nav.collapsed .rail-collapse { align-self: center; }
  .rail-collapse:hover { background: var(--bg-control-hover); }
  .brand {
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.06em;
    padding: 4px 8px 8px;
    font-size: 1.1rem;
    min-height: 1.2em;
  }
  .rail-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: var(--bg-control);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 10px;
    font-size: 0.9rem;
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
  .ic { display: flex; flex: 0 0 auto; color: var(--text-muted, #cfcfcf); }
  .ic.accent { color: var(--accent); }
  .spacer { flex: 1 1 auto; }

  /* Collapsed (icon-only): hide labels + section titles everywhere in the rail (incl. the
     slotted view content), centre the icons. :global so it reaches slotted buttons. */
  .rail-nav.collapsed .rail-btn { justify-content: center; padding: 9px; }
  .rail-nav.collapsed .brand { text-align: center; padding: 4px 0 8px; }
  :global(.rail-nav.collapsed .rail-label) { display: none; }
  :global(.rail-nav.collapsed .rail-section-title) { display: none; }
  /* In icon-only mode, hide the verbose view-specific sections (System actions, Clear,
     etc.) — they return when the rail is expanded. Keeps the minimal view clean. */
  :global(.rail-nav.collapsed .rail-view-options) { display: none; }
</style>

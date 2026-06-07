<script lang="ts">
  // Phase 03 — persistent app-nav rail. Lives in AppShell's `rail` slot (left on desktop,
  // slide-in on phone) and is shown across both the starmap and system views, so app-level
  // actions are always in the same place. Presentational: it just dispatches events; +page
  // wires them to its existing handlers/modals. (Starmap's niche bulk-editors — Edit Fuel/
  // Atmospheres/Sensors/Time — stay in the starmap menu for now; folded in a later step.)
  // No "back to starmap" here: the global shell already keeps both views together, and
  // SystemView's own "Zoom Out / To Starmap" handles exiting — so a rail button is redundant.
  import { createEventDispatcher, onDestroy } from 'svelte';
  const dispatch = createEventDispatcher();

  // Settings popover — folds Settings / LLM / Appearance / About under one entry.
  let settingsOpen = false;
  let settingsWrap: HTMLElement;
  function pick(ev: string) {
    settingsOpen = false;
    removeOutside();
    if (ev) dispatch(ev);
  }
  function toggleSettings() {
    settingsOpen = !settingsOpen;
    if (settingsOpen) addOutside(); else removeOutside();
  }
  function onOutside(e: Event) {
    if (settingsWrap && !settingsWrap.contains(e.target as Node)) { settingsOpen = false; removeOutside(); }
  }
  function addOutside() { if (typeof window !== 'undefined') window.addEventListener('pointerdown', onOutside, true); }
  function removeOutside() { if (typeof window !== 'undefined') window.removeEventListener('pointerdown', onOutside, true); }
  onDestroy(removeOutside);
</script>

<nav class="rail-nav" aria-label="App navigation">
  <div class="brand">SSE</div>

  <button class="rail-btn" on:click={() => dispatch('new')}>New System</button>
  <button class="rail-btn" on:click={() => dispatch('open')}>Open…</button>
  <button class="rail-btn" on:click={() => dispatch('save')}>Save</button>
  <button class="rail-btn find-body" on:click={() => dispatch('allbodies')}>🔍 Find body…</button>
  <button class="rail-btn find-body" on:click={() => dispatch('allships')}>◇ Find ship…</button>

  <!-- Optional view-specific content (e.g. phone View toggles) sits below the app
       nav and above the bottom group. Empty on desktop / starmap. -->
  <slot />

  <div class="spacer"></div>

  <button class="rail-btn settings-toggle" on:click={() => dispatch('settings')}>
    <span class="gear" aria-hidden="true">⚙</span> Settings
  </button>
</nav>

<style>
  .rail-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 8px;
    min-width: 132px;
    height: 100%;
    box-sizing: border-box;
  }
  .brand {
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.06em;
    padding: 4px 8px 8px;
    font-size: 1.1rem;
  }
  .rail-btn {
    display: block;
    text-align: left;
    background: var(--bg-control);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 10px;
    font-size: 0.9rem;
    cursor: pointer;
    text-decoration: none;
  }
  .rail-btn:hover {
    background: var(--bg-control-hover);
  }
  .spacer {
    flex: 1 1 auto;
  }
  .settings-wrap {
    position: relative;
  }
  .settings-toggle.active {
    background: var(--bg-control-hover);
    border-color: var(--accent);
  }
  .gear { color: var(--accent); }
  .settings-pop {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 50;
  }
</style>

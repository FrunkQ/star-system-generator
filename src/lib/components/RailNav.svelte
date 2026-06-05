<script lang="ts">
  // Phase 03 — persistent app-nav rail. Lives in AppShell's `rail` slot (left on desktop,
  // slide-in on phone) and is shown across both the starmap and system views, so app-level
  // actions are always in the same place. Presentational: it just dispatches events; +page
  // wires them to its existing handlers/modals. (Starmap's niche bulk-editors — Edit Fuel/
  // Atmospheres/Sensors/Time — stay in the starmap menu for now; folded in a later step.)
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let inSystemView = false; // show a "back to starmap" affordance when in a system
</script>

<nav class="rail-nav" aria-label="App navigation">
  <div class="brand">SSE</div>

  {#if inSystemView}
    <button class="rail-btn back" on:click={() => dispatch('back')}>← Starmap</button>
  {/if}

  <button class="rail-btn" on:click={() => dispatch('new')}>New System</button>
  <button class="rail-btn" on:click={() => dispatch('open')}>Open…</button>
  <button class="rail-btn" on:click={() => dispatch('save')}>Save</button>

  <div class="spacer"></div>

  <button class="rail-btn" on:click={() => dispatch('settings')}>Settings</button>
  <button class="rail-btn" on:click={() => dispatch('llmsettings')}>LLM</button>
  <a class="rail-btn appearance" href="/palette" title="Edit the colour palette">Appearance</a>
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
  .rail-btn.back {
    border-color: var(--accent);
    color: var(--accent);
  }
  .spacer {
    flex: 1 1 auto;
  }
</style>

<script lang="ts">
  // Phase 03 preview — a standalone playground for the new responsive shell (AppShell +
  // BottomSheet + FabCluster) with placeholder content. NOT wired into the real app; it
  // exists so the wireframe look/feel can be tried on a real device (open /shell-preview)
  // before we integrate it into SystemView/Starmap. Use the Auto/Desktop/Phone toggle, or
  // ?mode=phone, to force a layout on desktop.
  import AppShell from '$lib/components/AppShell.svelte';
  import FabCluster from '$lib/components/FabCluster.svelte';

  let forceMode: 'auto' | 'desktop' | 'phone' = 'auto';
  let mode: 'desktop' | 'phone' = 'desktop';
  let sheetSnap: 'peek' | 'half' | 'full' = 'peek';
  let selected = 'Earth';
  let log: string[] = [];

  const bodies = ['Sol', 'Mercury', 'Venus', 'Earth', 'Luna', 'Mars', 'Jupiter', 'Saturn'];
  const fabActions = [
    { id: 'add-planet', label: 'Add planet here', icon: '🪐' },
    { id: 'add-construct', label: 'Add construct here', icon: '◇' },
    { id: 'reset', label: 'Reset view', icon: '↺' },
    { id: 'starmap', label: 'Switch to starmap', icon: 'S' }
  ];

  function note(msg: string) {
    log = [msg, ...log].slice(0, 6);
  }
  function select(b: string) {
    selected = b;
    if (sheetSnap === 'peek') sheetSnap = 'half'; // promote sheet on selection (phone)
    note(`Selected ${b}`);
  }
</script>

<svelte:head><title>Shell Preview — SSE v2</title></svelte:head>

<AppShell {forceMode} bind:mode bind:sheetSnap sheetTitle={selected}>
  <svelte:fragment slot="rail">
    <div class="ph rail-ph">
      <strong>Rail</strong>
      <button>New</button>
      <button>Open</button>
      <button>Save</button>
      <button>Report</button>
      <button>Settings</button>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="strip">
    <div class="ph strip-ph">
      <strong>System Strip</strong>
      <span class="muted">mode: {mode}</span>
      <span class="seg">
        <button class:active={forceMode === 'auto'} on:click={() => (forceMode = 'auto')}>Auto</button>
        <button class:active={forceMode === 'desktop'} on:click={() => (forceMode = 'desktop')}>Desktop</button>
        <button class:active={forceMode === 'phone'} on:click={() => (forceMode = 'phone')}>Phone</button>
      </span>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="canvas">
    <div class="ph canvas-ph">
      <div class="orrery">
        {#each bodies as b, i}
          <button class="dot" class:sel={b === selected} style="--i:{i}" on:click={() => select(b)}>{b}</button>
        {/each}
      </div>
      <p class="muted">Placeholder canvas — tap a body to populate the detail panel / sheet.</p>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="bar">
    <div class="ph bar-ph">
      <button>⏮</button><button>⏯</button><button>⏭</button>
      <input type="range" min="0" max="100" />
      <span class="muted">Time controls</span>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="detail">
    <div class="detail-ph">
      <h2>{selected}</h2>
      <p class="muted">Orbiting Sol · placeholder body details.</p>
      {#each Array(14) as _, i}
        <div class="row"><span>Property {i + 1}</span><span>value {i + 1}</span></div>
      {/each}
      <h3>Recent</h3>
      {#if log.length === 0}<p class="muted">No actions yet.</p>{/if}
      {#each log as l}<div class="row"><span>{l}</span></div>{/each}
    </div>
  </svelte:fragment>

  <svelte:fragment slot="fab">
    {#if mode === 'phone'}
      <FabCluster actions={fabActions} on:action={(e) => note(`FAB: ${e.detail}`)} />
    {/if}
  </svelte:fragment>
</AppShell>

<style>
  :global(body) { margin: 0; }
  .ph { padding: 10px; box-sizing: border-box; height: 100%; }
  .rail-ph { display: flex; flex-direction: column; gap: 8px; min-width: 160px; }
  .rail-ph button, .strip-ph button, .bar-ph button { background: #1b1e26; color: #e8e8e8; border: 1px solid #2a2d36; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
  .strip-ph, .bar-ph { display: flex; align-items: center; gap: 10px; }
  .muted { color: #8a8f9a; font-size: 0.85rem; }
  .seg { margin-left: auto; display: inline-flex; gap: 4px; }
  .seg button.active { background: #ff5a1f; border-color: #ff5a1f; color: #fff; }
  .canvas-ph { display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; }
  .orrery { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; max-width: 640px; }
  .dot { background: radial-gradient(circle at 30% 30%, #ffb27a, #ff5a1f); color: #1a1a1a; border: none; border-radius: 50%; width: 64px; height: 64px; font-size: 0.7rem; cursor: pointer; }
  .dot.sel { outline: 3px solid #ffd9c2; }
  .detail-ph { padding-bottom: 24px; }
  .detail-ph h2 { color: #ff8a5c; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #1c1f27; font-size: 0.9rem; }
</style>

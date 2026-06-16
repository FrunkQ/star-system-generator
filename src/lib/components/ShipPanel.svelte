<script lang="ts">
  // Starmap-level panel for a ship that's mid-journey (in transit / stranded / just arrived). Shows
  // its in-flight controls (resolve the journey — all reversible log edits) plus the full construct
  // editor, so you can inspect/edit a ship without diving into a system. The construct still lives in
  // its origin system until reconcile, so the editor gets a real system context.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, System, RulePack } from '$lib/types';
  import { describeTag } from '$lib/tags/tagPresentation';
  import ConstructSidePanel from './ConstructSidePanel.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
  import ShipLogPane from './ShipLogPane.svelte';

  export let construct: CelestialBody;
  export let system: System;
  export let hostBody: CelestialBody | null = null;
  export let rulePack: RulePack;
  export let status: 'before' | 'transit' | 'adrift' | 'arrived' = 'transit';
  export let frac = 0;
  export let fromName = '';
  export let toName = '';

  const dispatch = createEventDispatcher();
  const STATUS_LABEL = { before: 'Departing', transit: 'In transit', adrift: 'Stranded', arrived: 'Arrived' };

  // Edit is opt-in (icon), not the default view — the panel leads with status + controls.
  let showEditor = false;
  let showLog = false;

  // Current fuel (after whatever the journey has burned) vs capacity, from the tanks.
  $: fuelDefs = (rulePack as any)?.fuelDefinitions?.entries || [];
  $: fuel = (() => {
    let cur = 0, cap = 0;
    for (const t of ((construct as any).fuel_tanks || [])) {
      const d = fuelDefs.find((f: any) => f.id === t.fuel_type_id)?.density_kg_per_m3 || 0;
      cur += (t.current_units ?? 0) * d;
      cap += (t.capacity_units ?? 0) * d;
    }
    return { cur, cap, pct: cap > 0 ? Math.max(0, Math.min(1, cur / cap)) : 0, hasTanks: cap > 0 };
  })();
  const fmtT = (kg: number) => `${(kg / 1000).toFixed(1)} t`;

  function toggleVisibility() {
    (construct as any).object_playerhidden = !(construct as any).object_playerhidden;
    dispatch('update', construct);
  }
  // Sensors toggle: shows the ship's sensor-range rings in the orrery. Off by default.
  $: sensorsOn = (construct as any).sensors_active === true;
  function toggleSensors() {
    (construct as any).sensors_active = !sensorsOn;
    dispatch('update', construct);
  }
  // Map the journey status to the data block's live location state.
  $: kinematicState = status === 'transit' ? 'Transit' : status === 'adrift' ? 'Deep Space' : status === 'arrived' ? 'Orbiting' : null;
</script>

<div class="ship-bg" on:click={() => dispatch('close')} role="presentation">
<div class="ship-panel" on:click|stopPropagation role="dialog" aria-label="Ship">
  <header>
    <div class="title">
      <!-- Eye + sensors on the LEFT, mirroring the normal ship info-block chrome. -->
      <button class="icon-btn" class:on={!(construct).object_playerhidden} on:click={toggleVisibility} title={(construct).object_playerhidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide'} aria-label="Toggle player visibility">
        {#if (construct).object_playerhidden}
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/></svg>
        {/if}
      </button>
      <button class="icon-btn" class:on={sensorsOn} on:click={toggleSensors} title={sensorsOn ? 'Sensor ranges shown — click to hide' : 'Show sensor range rings'} aria-label="Toggle sensor ranges">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1A10 10 0 0 1 4.9 4.9"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>
      </button>
      <span class="dot" class:transit={status==='transit'||status==='before'} class:adrift={status==='adrift'} class:arrived={status==='arrived'}></span>
      <h2>{construct.name}</h2>
    </div>
    <div class="head-actions">
      <button class="icon-btn" class:on={showEditor} on:click={() => showEditor = !showEditor} title={showEditor ? 'Hide editor' : 'Edit ship'} aria-label="Toggle editor">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="x" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>
  </header>

  {#if fuel.hasTanks}
    <div class="fuel-row">
      <span class="fuel-label">Fuel</span>
      <div class="fuel-bar"><div class="fuel-fill" class:low={fuel.pct < 0.15} style="width:{fuel.pct * 100}%"></div></div>
      <span class="fuel-num">{fmtT(fuel.cur)} / {fmtT(fuel.cap)}</span>
      <button class="refuel-btn" on:click={() => dispatch('refuel')} title="Refuel to full">⛽ Refuel</button>
    </div>
  {/if}

  <section class="transit">
    <div class="t-line">
      <span class="badge {status}">{STATUS_LABEL[status]}</span>
      <span class="route">{fromName} → {toName}{#if status==='transit'} · {Math.round(frac*100)}%{/if}</span>
    </div>
    {#if status === 'adrift'}
      <p class="hint">Stranded in interstellar space. <strong>Chart a new course</strong> is the physical choice — it replots from here, carrying the ship's current velocity. Resuming the old course pretends it never stopped.</p>
      <div class="t-actions">
        <button class="physical" on:click={() => dispatch('newtransit')} title="Plot a fresh interstellar course from the ship's current position and velocity (e.g. after refuelling)">Chart a new course</button>
        <button class="destructive" on:click={() => dispatch('resume')} title="Resume the original course — physically impossible from a dead stop (universe-breaking)">Continue journey</button>
        <button on:click={() => dispatch('close')} title="Leave it stranded for now">Cancel</button>
      </div>
    {:else if status === 'arrived'}
      <p class="hint">Arrived at its destination.</p>
      <div class="t-actions">
        <button class="physical" on:click={() => dispatch('newtransit')} title="Plot a fresh interstellar course onward from here">Chart a new course</button>
        <button on:click={() => dispatch('resume')} title="Re-fly the same journey">Re-fly journey</button>
      </div>
    {:else}
      <p class="hint">Aborting? <strong>Strand · drift</strong> is the physical choice — a coasting ship can't just stop. All outcomes are reversible (derived from the clock; scrub back and it's en route again).</p>
      <div class="t-actions">
        <button class="physical" on:click={() => dispatch('resolve', { outcome: 'strand', coast: true })} title="Abort but keep momentum — it coasts on in a straight line (physically correct)">Strand · drift</button>
        <button class="caution" on:click={() => dispatch('resolve', { outcome: 'strand', coast: false })} title="Abort and stop dead in space — ignores momentum, not physically correct">Strand · stop</button>
        <button class="destructive" on:click={() => dispatch('resolve', { outcome: 'return' })} title="Delete this trip — the ship returns to where it started, as if it never left (removes the journey)">Delete trip</button>
        <button on:click={() => dispatch('close')} title="Keep the journey running unchanged">Continue journey</button>
      </div>
    {/if}
  </section>

  <div class="log-row">
    <button class="log-btn" class:on={showLog} on:click={() => showLog = !showLog} title="Open the ship's log">Ship's Log</button>
  </div>
  {#if showLog}
    <ShipLogPane focusedBody={construct} clearFutureCount={0} activeCount={0} on:close={() => showLog = false} />
  {/if}

  <!-- The full read-only ship data block, same as the in-system info block (actions hidden — the transit
       controls above are the journey's). Edit is opt-in via the pencil. -->
  <ConstructDerivedSpecs {construct} {hostBody} {rulePack} {kinematicState} hideActions={true} />

  {#if showEditor}
    <div class="editor">
      <ConstructSidePanel {construct} {system} {hostBody} {rulePack} hideActions
        on:update={(e) => dispatch('update', e.detail)} />
    </div>
  {/if}

  <!-- Tags at the bottom, matching a body's detail pane and the in-system construct view. -->
  {#if construct.tags && construct.tags.length > 0}
    <div class="construct-tags">
      <span class="tags-label">Tags</span>
      <div class="tags-container">
        {#each construct.tags as tag}
          {@const info = describeTag(tag.key)}
          <span class="tag" style="border-color: {info.color}; color: {info.color};" title={info.description}>{info.label}{#if tag.value}: {tag.value}{/if}</span>
        {/each}
      </div>
    </div>
  {/if}
</div>
</div>

<style>
  .ship-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2200; padding: 14px; }
  .ship-panel { background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 10px; width: min(560px, 100%); max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; box-shadow: 0 16px 48px rgba(0,0,0,0.6); }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  .head-actions { display: flex; align-items: center; gap: 4px; }
  .icon-btn { background: none; border: 1px solid transparent; border-radius: 5px; color: var(--text-muted); cursor: pointer; padding: 4px; line-height: 0; }
  .icon-btn:hover { color: var(--text); background: var(--bg-control); }
  .icon-btn.on { color: var(--accent, #5b8def); }
  .fuel-row { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; }
  .fuel-label { color: var(--text-muted); }
  .fuel-bar { flex: 1; height: 8px; border-radius: 999px; background: var(--bg-control); overflow: hidden; }
  .fuel-fill { height: 100%; background: #2f9e57; border-radius: 999px; }
  .fuel-fill.low { background: #e0484d; }
  .fuel-num { color: var(--text); white-space: nowrap; }
  .refuel-btn { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 0.8rem; white-space: nowrap; }
  .refuel-btn:hover { border-color: var(--accent, #5b8def); }
  .log-row { display: flex; }
  .log-btn { background: #141414; color: #ffd23f; border: 1px solid var(--border); border-radius: 5px; padding: 6px 12px; cursor: pointer; font-size: 0.82rem; font-weight: 600; }
  .log-btn:hover { filter: brightness(1.2); }
  .log-btn.on { outline: 1px solid #ffd23f; }
  .title { display: flex; align-items: center; gap: 9px; }
  .title h2 { margin: 0; font-size: 1.1rem; }
  .dot { width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto; border: 2px solid; }
  .dot.transit { border-color: #111; background: #ffd23f; }
  .dot.adrift { border-color: #d04545; background: #8a8f9a; }
  .dot.arrived { border-color: #2f9e57; background: #6fcf8f; }
  .x { background: none; border: none; color: var(--text); font-size: 1.4rem; line-height: 1; cursor: pointer; }
  .transit { background: var(--bg-control); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .t-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 999px; background: var(--bg-panel); }
  .badge.transit, .badge.before { color: #d8b23a; }
  .badge.adrift { color: #d04545; }
  .badge.arrived { color: #6fcf8f; }
  .route { font-size: 0.85rem; color: var(--text-muted); }
  .hint { margin: 0; font-size: 0.78rem; color: var(--text-faint); }
  .t-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .t-actions button { padding: 6px 12px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg-panel); color: var(--text); cursor: pointer; font-size: 0.82rem; }
  /* Colour = physics honesty: green is the valid choice, orange is allowed-but-unphysical, red is
     destructive / universe-breaking, plain is a neutral dismiss. */
  .t-actions button.physical { border-color: #2f9e57; color: #6fcf8f; }
  .t-actions button.caution { border-color: #d98a2b; color: #e8a857; }
  .t-actions button.destructive { border-color: #d04545; color: #e06a6a; }
  .editor { min-width: 0; }
  .construct-tags { padding-top: 0.6em; border-top: 1px solid var(--border); }
  .tags-label { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
  .tags-container { display: flex; flex-wrap: wrap; gap: 0.5em; margin-top: 0.5em; }
  .tag { background-color: var(--bg-control); padding: 0.2em 0.5em; border: 1px solid; border-radius: 3px; font-size: 0.8em; }
</style>

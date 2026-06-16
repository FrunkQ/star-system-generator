<script lang="ts">
  // Starmap-level panel for a ship that's mid-journey (in transit / stranded / just arrived). Shows
  // its in-flight controls (resolve the journey — all reversible log edits) plus the full construct
  // editor, so you can inspect/edit a ship without diving into a system. The construct still lives in
  // its origin system until reconcile, so the editor gets a real system context.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, System, RulePack } from '$lib/types';
  import ConstructSidePanel from './ConstructSidePanel.svelte';

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
</script>

<div class="ship-bg" on:click={() => dispatch('close')} role="presentation">
<div class="ship-panel" on:click|stopPropagation role="dialog" aria-label="Ship">
  <header>
    <div class="title">
      <span class="dot" class:transit={status==='transit'||status==='before'} class:adrift={status==='adrift'} class:arrived={status==='arrived'}></span>
      <h2>{construct.name}</h2>
    </div>
    <button class="x" on:click={() => dispatch('close')} aria-label="Close">×</button>
  </header>

  <section class="transit">
    <div class="t-line">
      <span class="badge {status}">{STATUS_LABEL[status]}</span>
      <span class="route">{fromName} → {toName}{#if status==='transit'} · {Math.round(frac*100)}%{/if}</span>
    </div>
    {#if status === 'adrift'}
      <p class="hint">Stranded in interstellar space. Resume to put it back on course (reversible).</p>
      <div class="t-actions"><button on:click={() => dispatch('resume')}>Resume journey</button></div>
    {:else if status === 'arrived'}
      <p class="hint">Arrived at its destination.</p>
      <div class="t-actions"><button on:click={() => dispatch('resume')}>Re-fly journey</button></div>
    {:else}
      <p class="hint">End the journey — reversible (it's derived from the clock; scrub back and it's en route again):</p>
      <div class="t-actions">
        <button on:click={() => dispatch('resolve', { outcome: 'return' })} title="Turn back to the origin system">At source</button>
        <button on:click={() => dispatch('resolve', { outcome: 'arrive' })} title="Arrive now at the destination">At destination</button>
        <button class="danger" on:click={() => dispatch('resolve', { outcome: 'strand', coast: true })} title="Abort but keep momentum — it coasts on in a straight line">Strand · drift</button>
        <button class="danger" on:click={() => dispatch('resolve', { outcome: 'strand', coast: false })} title="Abort and stop dead in space">Strand · stop</button>
      </div>
    {/if}
  </section>

  <div class="editor">
    <ConstructSidePanel {construct} {system} {hostBody} {rulePack} hideActions
      on:update={(e) => dispatch('update', e.detail)} />
  </div>
</div>
</div>

<style>
  .ship-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2200; padding: 14px; }
  .ship-panel { background: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 10px; width: min(560px, 100%); max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 1rem 1.1rem; box-shadow: 0 16px 48px rgba(0,0,0,0.6); }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
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
  .t-actions button.danger { border-color: #d04545; color: #e06a6a; }
  .editor { min-width: 0; }
</style>

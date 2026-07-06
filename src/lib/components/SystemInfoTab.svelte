<script lang="ts">
  // System-level authorship. Editable on the MAIN STAR's "System Info" tab; the read-only credit is
  // shown under the star's image (see SystemView). Saved with the system.
  import type { System } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let system: System;
  const dispatch = createEventDispatcher();

  // Ensure the credits object exists so the inputs can bind.
  $: if (system && !system.credits) system.credits = {};
  const update = () => dispatch('update');
  function stampToday() {
    if (!system.credits) system.credits = {};
    system.credits.created = new Date().toISOString().slice(0, 10);
    update();
  }
</script>

<div class="tab-panel">
  <p class="intro">Credit yourself for building this system — shown under the main star for anyone you share it with.</p>

  <div class="form-group">
    <label for="sc-author">Created by</label>
    <input id="sc-author" type="text" maxlength="80" placeholder="Your name or handle" bind:value={system.credits.author} on:input={update} />
  </div>

  <div class="form-group">
    <label for="sc-contact">Contact <span class="opt">(optional)</span></label>
    <input id="sc-contact" type="text" maxlength="120" placeholder="Email, Discord, website…" bind:value={system.credits.contact} on:input={update} />
  </div>

  <div class="row">
    <div class="form-group">
      <label for="sc-created">Date</label>
      <div class="date-row">
        <input id="sc-created" type="date" bind:value={system.credits.created} on:input={update} />
        <button type="button" class="today" on:click={stampToday}>Today</button>
      </div>
    </div>
    <div class="form-group">
      <label for="sc-version">Version</label>
      <input id="sc-version" type="text" maxlength="16" placeholder="e.g. 1.0" bind:value={system.credits.version} on:input={update} />
    </div>
  </div>

  {#if system.credits?.author}
    <div class="preview">Preview: <em>This system was created by {system.credits.author}{#if system.credits.version} · v{system.credits.version}{/if}{#if system.credits.created} · {system.credits.created}{/if}</em></div>
  {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 12px; }
  .intro { margin: 0; font-size: 0.82em; color: var(--text-faint); line-height: 1.4; }
  .form-group { display: flex; flex-direction: column; flex: 1; gap: 4px; }
  .row { display: flex; gap: 10px; }
  label { color: var(--text-muted); font-size: 0.9em; margin: 0; }
  .opt { color: var(--text-faint); font-weight: 400; }
  input { padding: 6px 8px; background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 3px; font-size: 1em; box-sizing: border-box; width: 100%; }
  .date-row { display: flex; gap: 6px; }
  .today { background: transparent; border: 1px solid var(--border); border-radius: 3px; color: var(--link); font-size: 0.8em; padding: 0 8px; cursor: pointer; white-space: nowrap; }
  .today:hover { background: var(--bg-control); border-color: var(--accent); }
  .preview { font-size: 0.8em; color: var(--text-faint); border-top: 1px solid var(--border); padding-top: 8px; }
</style>

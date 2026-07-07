<script lang="ts">
  import type { CelestialBody, System } from "$lib/types";
  import { createEventDispatcher } from 'svelte';

  export let body: CelestialBody | System;
  // Default true = always editable (starmap notes). SystemView passes the body's edit
  // mode so GM notes edit under the same single Edit toggle as the description + data.
  export let editing = true;

  const dispatch = createEventDispatcher();

  function handleChange() {
      dispatch('update', body);
  }
</script>

<div class="gm-notes-editor">
  <h3>GM Quick Notes:</h3>

  {#if editing}
    <textarea bind:value={body.gmNotes} on:change={handleChange} placeholder="Enter secret GM-only notes here..."></textarea>
  {:else if body.gmNotes}
    <div class="display">{body.gmNotes}</div>
  {:else}
    <div class="display empty">No GM notes.</div>
  {/if}
</div>

<style>
  .gm-notes-editor {
    margin-top: 1em;
    border-top: 1px solid var(--border);
    padding-top: 1em;
  }
  h3 {
      margin: 0 0 0.5em 0;
      color: var(--accent);
  }
  textarea {
    width: 100%;
    min-height: 140px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 4px;
  }
  .display {
    white-space: pre-wrap;
    background: #252525;
    padding: 1em;
    border-radius: 4px;
    min-height: 40px;
  }
  .display.empty {
    color: var(--text-faint);
    font-style: italic;
  }
  .actions {
    margin-top: 0.5em;
    display: flex;
    gap: 0.5em;
  }
</style>

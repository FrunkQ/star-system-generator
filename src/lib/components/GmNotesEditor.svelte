<script lang="ts">
  import type { CelestialBody, System } from "$lib/types";
  import { createEventDispatcher } from 'svelte';

  export let body: CelestialBody | System;
  
  const dispatch = createEventDispatcher();

  function handleChange() {
      dispatch('update', body);
  }
</script>

<div class="gm-notes-editor">
  <h3>GM Quick Notes:</h3>
  
  <textarea bind:value={body.gmNotes} on:change={handleChange} placeholder="Enter secret GM-only notes here..."></textarea>
</div>

<style>
  .gm-notes-editor {
    margin-top: 1em;
    border-top: 1px solid #444;
    padding-top: 1em;
  }
  h3 {
      margin: 0 0 0.5em 0;
      color: #ff3e00;
  }
  textarea {
    width: 100%;
    min-height: 300px;
    background: #1a1a1a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 4px;
  }
  .display {
    white-space: pre-wrap;
    background: #252525;
    padding: 1em;
    border-radius: 4px;
    min-height: 50px;
  }
  .actions {
    margin-top: 0.5em;
    display: flex;
    gap: 0.5em;
  }
</style>

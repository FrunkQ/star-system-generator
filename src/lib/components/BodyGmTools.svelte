<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter } from "$lib/types";

  export let body: CelestialBody | Barycenter | null;

  const dispatch = createEventDispatcher();

  function handleDelete() {
      if (!body) return;
      if (confirm(`Are you sure you want to delete ${body.name} and everything orbiting it?`)) {
          dispatch('deleteNode', body.id);
      }
  }
</script>

<div class="gm-tools">
    <!-- Only delete button remains -->
    <button on:click={handleDelete} class="delete-button">Delete Body</button>
</div>

<style>
  .gm-tools {
      margin-top: 1.5em;
      padding-top: 1em;
      border-top: 1px solid #444;
      display: flex; /* Adjust layout for single button */
      justify-content: center;
  }
  .gm-tools h3 {
      margin: 0 0 0.5em 0;
      color: #ff3e00;
  }
  .tools-container {
      display: flex;
      gap: 1em;
      margin-bottom: 1em;
  }
  .delete-button {
      background-color: #800;
      color: white;
      border: 1px solid #c00;
      padding: 0.5em 1em;
      border-radius: 4px;
      cursor: pointer;
  }
  .delete-button:hover {
      background-color: #a00;
  }
</style>
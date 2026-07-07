<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter } from '../../types';

  export let x: number;
  export let y: number;
  export let selectedNode: CelestialBody | Barycenter | null;
  // Retained for compatibility with the caller; linking is a starmap-only action so these are unused here.
  export let isLinking = false;
  export let linkStartNode: CelestialBody | Barycenter | null = null;
  void isLinking; void linkStartNode;

  const dispatch = createEventDispatcher();
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
  <ul>
    {#if selectedNode}
      {#if selectedNode.kind === 'body'}
        <!-- Inside a system: the only sensible right-click action on a star/planet/moon is to add a
             construct orbiting it. (Zoom / Link / Delete System are starmap actions and don't belong here.) -->
        <li on:click={() => dispatch('addConstruct', selectedNode)}>Add Construct</li>
      {:else if selectedNode.kind === 'construct'}
        <!-- Future: Edit/Delete Construct options -->
      {/if}
    {/if}
  </ul>
</div>

<style>
  .context-menu {
    position: absolute;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    z-index: 100;
    color: var(--text);
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 0.5em 1em;
    cursor: pointer;
  }
  li:hover {
    background-color: var(--bg-control-hover);
  }
</style>
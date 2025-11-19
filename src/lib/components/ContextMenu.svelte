<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter } from '../../types';

  export let x: number;
  export let y: number;
  export let selectedNode: CelestialBody | Barycenter | null; // Changed from isStar
  export let isLinking: boolean;
  export let linkStartNode: CelestialBody | Barycenter | null;

  const dispatch = createEventDispatcher();

  function handleLinkClick() {
    if (selectedNode) {
      dispatch('link', selectedNode);
    }
  }
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
  <ul>
    {#if selectedNode}
      {#if selectedNode.kind === 'body' && (selectedNode.roleHint === 'star' || selectedNode.roleHint === 'barycenter')}
        <li on:click={() => dispatch('zoom')}>Zoom to System</li>
        {#if isLinking && linkStartNode?.id !== selectedNode.id}
          <li on:click={handleLinkClick}>Finish Link to {selectedNode.name}</li>
        {:else if isLinking && linkStartNode?.id === selectedNode.id}
          <li on:click={handleLinkClick} class="cancel-link">Cancel Link</li>
        {:else}
          <li on:click={handleLinkClick}>Start Link</li>
        {/if}
        <li on:click={() => dispatch('delete')}>Delete System</li>
        <li on:click={() => dispatch('addConstruct', selectedNode)}>Add Construct</li>
      {:else if selectedNode.kind === 'body' && (selectedNode.roleHint === 'planet' || selectedNode.roleHint === 'moon')}
        <li on:click={() => dispatch('addConstruct', selectedNode)}>Add Construct</li>
      {:else if selectedNode.kind === 'construct'}
        <!-- Future: Edit/Delete Construct options -->
      {/if}
    {:else}
      <li on:click={() => dispatch('addsystem')}>Add System Here</li>
    {/if}
  </ul>
</div>

<style>
  .context-menu {
    position: absolute;
    background-color: #333;
    border: 1px solid #555;
    border-radius: 5px;
    z-index: 100;
    color: #eee;
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
    background-color: #555;
  }
</style>
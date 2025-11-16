<script lang="ts">
  import type { CelestialBody } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let items: any[]; // Can be CelestialBody[] or a grouped list
  export let x: number;
  export let y: number;
  export let type: string;

  const dispatch = createEventDispatcher();

  function handleClick(item: CelestialBody) {
    dispatch('select', item.id);
  }
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
  <ul>
    {#if type === 'grouped'}
      {#each items as group}
        {#if group.host}
          <li class="planet-header" on:click={() => handleClick(group.host)}>{group.host.name}</li>
        {/if}
        {#each group.children as child}
          <li on:click={() => handleClick(child)} style="color: {child.kind === 'construct' && child.icon_color ? child.icon_color : ''}">&nbsp;&nbsp;{child.name}</li>
        {/each}
      {/each}
    {:else}
      {#each items as item}
        <li on:click={() => handleClick(item)}>{item.name}</li>
      {/each}
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
  .planet-header {
    font-weight: normal;
    color: #888; /* Grey color */
    font-size: 0.8em; /* Smaller font size */
    border-bottom: 1px solid #555;
    padding-top: 1em;
    cursor: pointer;
  }
  .planet-header:hover {
    background-color: #444;
  }
</style>
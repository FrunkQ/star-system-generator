<script lang="ts">
  import type { CelestialBody } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // This component ONLY displays and removes modules. Adding is handled by the parent.
  $: modules = construct.systems?.modules ?? [];

  function removeModule(index: number) {
    if (!construct.systems?.modules) return;
    construct.systems.modules.splice(index, 1);
    dispatch('update');
    // Svelte reactivity needs an assignment to trigger update
    modules = construct.systems.modules;
  }
</script>

<div class="module-list-container">
  {#if modules.length > 0}
    <ul>
      {#each modules as module, i}
        <li>
          <span>{module}</span>
          <button on:click={() => removeModule(i)}>Remove</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="no-modules">No modules installed.</p>
  {/if}
</div>

<style>
  .module-list-container {
    /* This component now fills its parent (.tab-content) and scrolls internally */
    flex-grow: 1;
    overflow-y: auto;
    padding: 1rem;
    background-color: #252525; /* Darker background */
    min-height: 0;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li {
    display: flex;
    align-items: center;
    background-color: #444;
    padding: 0.5rem;
    border-radius: 3px;
    gap: 10px;
  }

  li span {
    flex-grow: 1;
  }

  .no-modules {
    color: #999;
    text-align: center;
    margin-top: 1em;
  }
</style>

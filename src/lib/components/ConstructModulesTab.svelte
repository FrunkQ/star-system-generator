<script lang="ts">
  import type { CelestialBody } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  let modules: string[] = [];
  $: modules = construct.systems?.modules ?? [];

  let newModule = '';

  function addModule() {
    if (newModule.trim() === '') return;
    if (!construct.systems) construct.systems = {};
    if (!construct.systems.modules) construct.systems.modules = [];

    construct.systems.modules.push(newModule.trim());
    newModule = '';
    dispatch('update');
    // Svelte reactivity needs an assignment to trigger update
    modules = construct.systems.modules;
  }

  function removeModule(index: number) {
    if (!construct.systems?.modules) return;
    construct.systems.modules.splice(index, 1);
    dispatch('update');
    // Svelte reactivity needs an assignment to trigger update
    modules = construct.systems.modules;
  }
</script>

<div class="modules-editor">
  <div class="module-list">
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
      <p>No modules installed.</p>
    {/if}
  </div>

  <div class="add-module">
    <input type="text" bind:value={newModule} placeholder="Enter new module name" />
    <button on:click={addModule}>Add Module</button>
  </div>
</div>

<style>
  .modules-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  .module-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px; /* Adjust as needed */
    overflow-y: auto;
  }
  .module-list li {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    background-color: #444;
    padding: 0.5rem;
    border-radius: 3px;
    gap: 10px;
  }
  .module-list li span {
    flex-grow: 1;
  }
  .module-list li button {
    margin-left: auto;
  }
  .add-module {
    display: flex;
    gap: 0.5rem;
  }
  .add-module input {
    flex-grow: 1;
  }
</style>

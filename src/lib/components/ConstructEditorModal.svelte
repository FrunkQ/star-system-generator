<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import ConstructGeneralTab from './ConstructGeneralTab.svelte';
  import ConstructEnginesTab from './ConstructEnginesTab.svelte';
  import ConstructFuelTab from './ConstructFuelTab.svelte';
  import ConstructCargoTab from './ConstructCargoTab.svelte';
  import ConstructCrewTab from './ConstructCrewTab.svelte';
  import ConstructPowerTab from './ConstructPowerTab.svelte';
  import ConstructModulesTab from './ConstructModulesTab.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';

  export let system: System;
  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;

  const dispatch = createEventDispatcher();

  let selectedTab: string = 'General';

  function close() {
    dispatch('close');
  }

  function handleUpdate() {
    // This triggers reactivity within the modal for the derived specs
    construct = construct; 
    // This sends the updated object out to the parent component (SystemView) 
    dispatch('updateConstruct', construct);
  }
</script>

<div class="modal-background" on:click={close}>
  <div class="modal" on:click|stopPropagation>
    <h2>Editing: {construct.name}</h2>

    <div class="tabs">
      <button class:active={selectedTab === 'General'} on:click={() => selectedTab = 'General'}>General</button>
      <button class:active={selectedTab === 'Engines'} on:click={() => selectedTab = 'Engines'}>Engines</button>
      <button class:active={selectedTab === 'Fuel'} on:click={() => selectedTab = 'Fuel'}>Fuel</button>
      <button class:active={selectedTab === 'Cargo'} on:click={() => selectedTab = 'Cargo'}>Cargo</button>
      <button class:active={selectedTab === 'Crew'} on:click={() => selectedTab = 'Crew'}>Crew</button>
      <button class:active={selectedTab === 'Power'} on:click={() => selectedTab = 'Power'}>Power</button>
      <button class:active={selectedTab === 'Modules'} on:click={() => selectedTab = 'Modules'}>Modules</button>
    </div>

    <div class="tab-content">
      {#if selectedTab === 'General'}
        <ConstructGeneralTab {system} {construct} {hostBody} on:update={handleUpdate} />
      {:else if selectedTab === 'Engines'}
        <ConstructEnginesTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Fuel'}
        <ConstructFuelTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Cargo'}
        <ConstructCargoTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Crew'}
        <ConstructCrewTab {construct} on:update={handleUpdate} />
      {:else if selectedTab === 'Power'}
        <ConstructPowerTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Modules'}
        <ConstructModulesTab {construct} on:update={handleUpdate} />
      {/if}
    </div>

    <ConstructDerivedSpecs {construct} {rulePack} {hostBody} />

    <div class="buttons">
      <button on:click={close}>Close</button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: #333;
    padding: 20px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: #fff;
    max-width: 80vw;
    max-height: 80vh;
    overflow-y: auto;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 10px;
    border-bottom: 1px solid #555;
    padding-bottom: 5px;
  }

  .tabs button {
    background-color: #555;
    color: #fff;
    border: none;
    padding: 8px 12px;
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .tabs button:hover {
    background-color: #777;
  }

  .tabs button.active {
    background-color: #ff3e00;
    font-weight: bold;
  }

  .tab-content {
    flex-grow: 1;
    padding: 10px 0;
    border: 1px solid #444;
    border-radius: 5px;
    background-color: #2a2a2a;
    min-height: 200px; /* Ensure some height for content */
    overflow-y: auto;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 1rem;
  }
</style>
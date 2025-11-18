<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, System } from '$lib/types';
  import ConstructGeneralTab from './ConstructGeneralTab.svelte';
  import ConstructEnginesTab from './ConstructEnginesTab.svelte';
  import ConstructFuelTab from './ConstructFuelTab.svelte';
  import ConstructCargoTab from './ConstructCargoTab.svelte';
  import ConstructCrewTab from './ConstructCrewTab.svelte';
  import ConstructPowerTab from './ConstructPowerTab.svelte';
  import ConstructModulesTab from './ConstructModulesTab.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
  import ConstructDescriptionTab from './ConstructDescriptionTab.svelte';
  import AIExpansionModal from './AIExpansionModal.svelte';

  import { CONSTRUCT_PROMPT } from '$lib/ai/construct-prompt';
  import constructTags from '$lib/ai/construct-tags.json';
  import constructStyles from '$lib/ai/construct-styles.json';

  export let system: System;
  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;

  const dispatch = createEventDispatcher();

  let selectedTab: string = 'Description';
  let showAIModal = false;
  let promptData = {};

  $: if (system && construct) {
    const hostId = construct.ui_parentId || construct.parentId;
    hostBody = system.nodes.find(n => n.id === hostId) as CelestialBody || null;
  }

  function close() {
    dispatch('close');
  }

  function handleUpdate() {
    construct = construct; 
    dispatch('updateConstruct', construct);
  }

  function openAIModal() {
    promptData = {
      CONSTRUCT: construct
    };
    showAIModal = true;
  }

  function handleAIDescription(event: CustomEvent<string>) {
    construct.description = event.detail;
    showAIModal = false;
    dispatch('update', construct); // Immediately save the change to the store
  }
</script>

{#if showAIModal}
  <AIExpansionModal
    bind:showModal={showAIModal}
    promptTemplate={CONSTRUCT_PROMPT}
    {promptData}
    availableStyles={constructStyles}
    availableTags={constructTags}
    initialText={construct.description || ''}
    on:close={() => showAIModal = false}
    on:generate={handleAIDescription}
  />
{/if}

<div class="modal-background" on:click={close}>
  <div class="modal" on:click|stopPropagation>
    <h2>Editing: {construct.name}</h2>

    <div class="tabs">
      <button class:active={selectedTab === 'Description'} on:click={() => selectedTab = 'Description'}>Description</button>
      <button class:active={selectedTab === 'General'} on:click={() => selectedTab = 'General'}>General</button>
      <button class:active={selectedTab === 'Engines'} on:click={() => selectedTab = 'Engines'}>Engines</button>
      <button class:active={selectedTab === 'Fuel'} on:click={() => selectedTab = 'Fuel'}>Fuel</button>
      <button class:active={selectedTab === 'Cargo'} on:click={() => selectedTab = 'Cargo'}>Cargo</button>
      <button class:active={selectedTab === 'Crew'} on:click={() => selectedTab = 'Crew'}>Crew</button>
      <button class:active={selectedTab === 'Power'} on:click={() => selectedTab = 'Power'}>Power</button>
      <button class:active={selectedTab === 'Modules'} on:click={() => selectedTab = 'Modules'}>Modules</button>
    </div>

    <div class="tab-content">
      {#if selectedTab === 'Description'}
        <ConstructDescriptionTab {construct} on:update={handleUpdate} on:expandAI={openAIModal} />
      {:else if selectedTab === 'General'}
        <ConstructGeneralTab {system} {construct} on:update={handleUpdate} />
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
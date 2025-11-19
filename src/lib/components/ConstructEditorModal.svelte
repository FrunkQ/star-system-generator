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
  import ConstructDerivedSpecsModal from './ConstructDerivedSpecsModal.svelte';
  import ConstructDescriptionTab from './ConstructDescriptionTab.svelte';
  import AIExpansionModal from './AIExpansionModal.svelte';
  import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';

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
  let showLoadTemplateModal = false;
  let promptData = {};
  let newModule = ''; // Moved from child component

  $: if (system && construct) {
    const hostId = construct.ui_parentId || construct.parentId;
    hostBody = system.nodes.find(n => n.id === hostId) as CelestialBody || null;
  }

  function close() {
    dispatch('close');
  }

  function handleUpdate() {
    construct = construct; 
    dispatch('update', construct);
  }

  function handleLoadTemplate(event: CustomEvent<CelestialBody>) {
    const template = event.detail;
    
    // Preserve orbital/identity data
    const preservedData = {
      id: construct.id,
      parentId: construct.parentId,
      ui_parentId: construct.ui_parentId,
      orbit: construct.orbit,
      placement: construct.placement,
      IsTemplate: false // Ensure it's marked as an instance
    };

    // Prepare the new construct object from the template (excluding its orbit if present)
    const newConstructData = JSON.parse(JSON.stringify(template));
    delete newConstructData.orbit; // Safety check

    // Merge
    construct = { ...newConstructData, ...preservedData };
    handleUpdate();
  }

  // Add Module logic now lives in the parent modal
  function addModule() {
    if (newModule.trim() === '') return;
    if (!construct.systems) construct.systems = {};
    if (!construct.systems.modules) construct.systems.modules = [];

    construct.systems.modules.push(newModule.trim());
    newModule = '';
    handleUpdate(); // Dispatch a general update
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
    dispatch('update', construct);
  }

  function handleExport() {
    // Create a deep copy to avoid modifying the original object
    const exportConstruct = JSON.parse(JSON.stringify(construct));

    // Remove system-specific volatile data
    delete exportConstruct.id;
    delete exportConstruct.parentId;
    delete exportConstruct.ui_parentId;
    delete exportConstruct.orbit;
    delete exportConstruct.placement;

    const json = JSON.stringify(exportConstruct, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${construct.name.replace(/\s+/g, '_') || 'construct'}-Construct.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = e.target?.result as string;
        const importedConstruct = JSON.parse(json);

        // Basic validation
        if (importedConstruct.kind !== 'construct' || !importedConstruct.name || !importedConstruct.class) {
          alert('Invalid construct file. Missing required properties like kind, name, or class.');
          return;
        }

        // Preserve orbital data from the original construct
        const preservedData = {
          id: construct.id,
          parentId: construct.parentId,
          ui_parentId: construct.ui_parentId,
          orbit: construct.orbit,
          placement: construct.placement,
        };

        // Merge imported data with preserved orbital data
        construct = { ...importedConstruct, ...preservedData };
        
        handleUpdate();
        alert(`Successfully imported '${importedConstruct.name}'.`);

      } catch (err) {
        alert('Failed to parse JSON file.');
        console.error(err);
      } finally {
        // Reset the input so the same file can be loaded again
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  let fileInput: HTMLInputElement;

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

{#if showLoadTemplateModal}
  <LoadConstructTemplateModal
    {rulePack}
    on:load={handleLoadTemplate}
    on:close={() => showLoadTemplateModal = false}
  />
{/if}

<div class="modal-background" on:click={close}>
  <div class="modal" on:click|stopPropagation>
    <h2>Editing: {construct.name}</h2>

    <div class="tabs">
      <button class:active={selectedTab === 'Description'} on:click={() => selectedTab = 'Description'}>Description</button>
      <button class:active={selectedTab === 'Orbit'} on:click={() => selectedTab = 'Orbit'}>Orbit</button>
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
      {:else if selectedTab === 'Orbit'}
        <ConstructGeneralTab {system} {construct} on:update={handleUpdate} />
      {:else if selectedTab === 'Engines'}
        <ConstructEnginesTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Fuel'}
        <ConstructFuelTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Cargo'}
        <ConstructCargoTab {construct} on:update={handleUpdate} />
      {:else if selectedTab === 'Crew'}
        <ConstructCrewTab {construct} on:update={handleUpdate} />
      {:else if selectedTab === 'Power'}
        <ConstructPowerTab {construct} {rulePack} on:update={handleUpdate} />
      {:else if selectedTab === 'Modules'}
        <ConstructModulesTab {construct} on:update={handleUpdate} />
      {/if}
    </div>
    
    <!-- Add Module section is now here, outside the tab content -->
    {#if selectedTab === 'Modules'}
      <div class="add-module-area">
        <input type="text" bind:value={newModule} placeholder="Enter new module name" on:keydown={(e) => e.key === 'Enter' && addModule()} />
        <button on:click={addModule}>Add Module</button>
      </div>
    {/if}

    <ConstructDerivedSpecsModal {construct} {rulePack} {hostBody} />

    <div class="buttons">
      <div class="import-export">
        <button on:click={handleExport}>Export</button>
        <button on:click={() => fileInput.click()}>Import</button>
        <button on:click={() => showLoadTemplateModal = true}>Load Template</button>
        <input type="file" bind:this={fileInput} on:change={handleImport} accept=".json" style="display: none;" />
      </div>
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
    max-width: min(80vw, 700px);
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
  }

  .tabs button.active {
    background-color: #ff3e00;
  }

  .tab-content {
    flex-grow: 1;
    border: 1px solid #444;
    border-radius: 5px;
    background-color: #2a2a2a;
    min-height: 350px;
    display: flex; /* This is key */
    flex-direction: column; /* This is key */
  }

  .add-module-area {
    display: flex;
    gap: 0.5rem;
    padding: 0 10px; /* Optional: adds some padding */
  }

  .add-module-area input {
    flex-grow: 1;
  }

  .buttons {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
  }

  .import-export {
    display: flex;
    gap: 0.5rem;
  }
</style>

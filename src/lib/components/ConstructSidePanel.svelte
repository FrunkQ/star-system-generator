<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, System } from '$lib/types';
  import ConstructBasicsTab from './ConstructBasicsTab.svelte';
  import ConstructGeneralTab from './ConstructGeneralTab.svelte';
  import ConstructEnginesTab from './ConstructEnginesTab.svelte';
  import ConstructFuelTab from './ConstructFuelTab.svelte';
  import ConstructCargoTab from './ConstructCargoTab.svelte';
  import ConstructCrewTab from './ConstructCrewTab.svelte';
  import ConstructPowerTab from './ConstructPowerTab.svelte';
  import ConstructModulesTab from './ConstructModulesTab.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
  import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';

  export let system: System;
  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;

  const dispatch = createEventDispatcher();

  let selectedTab: string = 'Basics';
  let showLoadTemplateModal = false;
  let newModule = '';

  $: if (system && construct) {
    const hostId = construct.ui_parentId || construct.parentId;
    hostBody = system.nodes.find(n => n.id === hostId) as CelestialBody || null;
  }
  
  function setTab(tab: string) {
      selectedTab = tab;
      dispatch('tabchange', tab);
  }

  function handleUpdate() {
    construct = construct; 
    dispatch('update', construct);
  }

  function handleLoadTemplate(event: CustomEvent<CelestialBody>) {
    const template = event.detail;
    
    const preservedData = {
      id: construct.id,
      parentId: construct.parentId,
      ui_parentId: construct.ui_parentId,
      orbit: construct.orbit,
      placement: construct.placement,
      IsTemplate: false 
    };

    const newConstructData = JSON.parse(JSON.stringify(template));
    delete newConstructData.orbit; 

    construct = { ...newConstructData, ...preservedData };
    handleUpdate();
  }

  function addModule() {
    if (newModule.trim() === '') return;
    if (!construct.systems) construct.systems = {};
    if (!construct.systems.modules) construct.systems.modules = [];

    construct.systems.modules.push(newModule.trim());
    newModule = '';
    handleUpdate(); 
  }

  function handleExport() {
    const exportConstruct = JSON.parse(JSON.stringify(construct));
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

        if (importedConstruct.kind !== 'construct' || !importedConstruct.name || !importedConstruct.class) {
          alert('Invalid construct file.');
          return;
        }

        const preservedData = {
          id: construct.id,
          parentId: construct.parentId,
          ui_parentId: construct.ui_parentId,
          orbit: construct.orbit,
          placement: construct.placement,
        };

        construct = { ...importedConstruct, ...preservedData };
        handleUpdate();
        alert(`Successfully imported '${importedConstruct.name}'.`);

      } catch (err) {
        alert('Failed to parse JSON file.');
        console.error(err);
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  let fileInput: HTMLInputElement;
</script>

{#if showLoadTemplateModal}
  <LoadConstructTemplateModal
    {rulePack}
    on:load={handleLoadTemplate}
    on:close={() => showLoadTemplateModal = false}
  />
{/if}

<div class="construct-side-panel">
  <div class="tabs">
    <button class:active={selectedTab === 'Basics'} on:click={() => setTab('Basics')}>Basics</button>
    <button class:active={selectedTab === 'Orbit'} on:click={() => setTab('Orbit')}>Orbit</button>
    <button class:active={selectedTab === 'Engines'} on:click={() => setTab('Engines')}>Engines</button>
    <button class:active={selectedTab === 'Fuel'} on:click={() => setTab('Fuel')}>Fuel</button>
    <button class:active={selectedTab === 'Cargo'} on:click={() => setTab('Cargo')}>Cargo</button>
    <button class:active={selectedTab === 'Crew'} on:click={() => setTab('Crew')}>Crew</button>
    <button class:active={selectedTab === 'Power'} on:click={() => setTab('Power')}>Power</button>
    <button class:active={selectedTab === 'Modules'} on:click={() => setTab('Modules')}>Modules</button>
  </div>

  <div class="tab-content">
    {#if selectedTab === 'Basics'}
      <ConstructBasicsTab {construct} on:update={handleUpdate} />
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
  
  {#if selectedTab === 'Modules'}
    <div class="add-module-area">
      <input type="text" bind:value={newModule} placeholder="Enter new module name" on:keydown={(e) => e.key === 'Enter' && addModule()} />
      <button on:click={addModule}>Add</button>
    </div>
  {/if}

  <div class="actions-row">
    <button on:click={handleExport}>Export</button>
    <button on:click={() => fileInput.click()}>Import</button>
    <button on:click={() => showLoadTemplateModal = true}>Load Template</button>
    <button class="danger" on:click={() => {
        if (confirm(`Are you sure you want to delete ${construct.name}?`)) {
            dispatch('delete', construct.id);
        }
    }}>Delete</button>
    <button class="primary" on:click={() => dispatch('close')}>Done</button>
    <input type="file" bind:this={fileInput} on:change={handleImport} accept=".json" style="display: none;" />
  </div>

  <div class="specs-section">
      <ConstructDerivedSpecs {construct} {rulePack} {hostBody} />
  </div>
</div>

<style>
  .construct-side-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 5px;
  }

  .tabs button {
    background-color: #333;
    color: #aaa;
    border: 1px solid #444;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
    flex-grow: 1;
  }

  .tabs button.active {
    background-color: #ff3e00;
    color: white;
    border-color: #ff3e00;
  }

  .tab-content {
    background-color: #222;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 5px;
    min-height: 200px;
  }

  .add-module-area {
    display: flex;
    gap: 0.5rem;
  }
  .add-module-area input { flex-grow: 1; }

  .specs-section {
      margin-top: 10px;
  }

  .actions-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .actions-row button {
      flex-grow: 1;
      font-size: 0.8em;
      padding: 6px;
  }
  .actions-row button.danger {
      background-color: #cc0000;
      color: white;
      border-color: #aa0000;
  }
  .actions-row button.primary {
      background-color: #007bff;
      color: white;
      border-color: #0056b3;
  }
</style>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, System } from '$lib/types';
  import ConstructBasicsTab from './ConstructBasicsTab.svelte';
  import ConstructGeneralTab from './ConstructGeneralTab.svelte';
  import ConstructMegaTab from './ConstructMegaTab.svelte';
  import { megaTypeDef } from '$lib/constructs/megaTypes';
  import ConstructEnginesTab from './ConstructEnginesTab.svelte';
  import ConstructFuelTab from './ConstructFuelTab.svelte';
  import ConstructCargoTab from './ConstructCargoTab.svelte';
  import ConstructCrewTab from './ConstructCrewTab.svelte';
  import ConstructPowerTab from './ConstructPowerTab.svelte';
  import ConstructSensorsTab from './ConstructSensorsTab.svelte';
  import ConstructModulesTab from './ConstructModulesTab.svelte';
  import ConstructCoITab from './ConstructCoITab.svelte';
  import AutopilotTab from './AutopilotTab.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
  import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';

  export let system: System;
  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;
  export let hideActions: boolean = false; // New prop

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

  // Fields describing the construct's situation in THIS system (identity, orbit,
  // flight dynamics) rather than its spec. These must survive spec replacement
  // (template load / file import) and never travel in an exported file: imported
  // journeys/vectors reference the source system and outrank orbit.elements at
  // render time (worldPositions.ts), leaving the ship mispositioned and orbit
  // edits ignored.
  const SITUATION_FIELDS = [
    'id', 'parentId', 'ui_parentId', 'orbit', 'placement', 'coOrbital',
    'scheduled_journeys', 'flight_state', 'vector_position_au',
    'vector_velocity_ms', 'vector_epoch_ms', 'autopilot', 'flight_log'
  ];
  // APPEARANCE is neither situation nor spec, and it needs its own rule: a GM's uploaded picture
  // or 3D model belongs to THIS SHIP, not to the spec being loaded over it. Loading a template
  // used to wipe both (the template's blank fields won the spread), which is how a model gets
  // "lost" without anything looking broken. Kept UNLESS the incoming spec carries its own - a
  // template that ships with artwork is making a deliberate choice and should win.
  const APPEARANCE_FIELDS = ['image', 'model', 'icon_type', 'icon_color'];
  function preserveAppearance(incoming: any, current: any): Record<string, any> {
    const out: Record<string, any> = {};
    for (const f of APPEARANCE_FIELDS) {
      if (incoming?.[f] === undefined && current?.[f] !== undefined) out[f] = current[f];
    }
    return out;
  }

  function preserveSituation(target: any) {
    const preserved: any = {};
    for (const f of SITUATION_FIELDS) preserved[f] = target[f];
    return preserved;
  }

  function handleLoadTemplate(event: CustomEvent<CelestialBody>) {
    const template = event.detail;

    const preservedData = { ...preserveSituation(construct), IsTemplate: false };

    const newConstructData = JSON.parse(JSON.stringify(template));
    delete newConstructData.orbit;

    construct = { ...newConstructData, ...preserveAppearance(newConstructData, construct), ...preservedData };
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

  async function handleExport() {
    const exportConstruct = JSON.parse(JSON.stringify(construct));
    for (const f of SITUATION_FIELDS) delete exportConstruct[f];

    // Carry the 3D model's BINARY, not just its hash - otherwise the file opens on another
    // machine as a ref pointing at nothing and silently falls back to the icon glyph. Same
    // embedding the campaign export uses (base64 by hash, verified on the way back in).
    const modelHash = exportConstruct.model?.hash;
    if (modelHash) {
      const embedded = await collectModelsForExport({ systems: [{ system: { nodes: [exportConstruct] } }] }).catch(() => undefined);
      if (embedded) exportConstruct.models = embedded;
    }

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

        // Preserve the target's situation (covers old exported files that still
        // carry the source ship's journeys/vectors).
        const preservedData = preserveSituation(construct);

        // A construct file may carry its 3D model's binary (see handleExport). Put it in the
        // local store BEFORE the ref lands, so the model is there the moment the panel redraws.
        if (importedConstruct.models) {
          await importEmbeddedModels(importedConstruct.models).catch(() => 0);
          delete importedConstruct.models;
        }
        construct = { ...importedConstruct, ...preserveAppearance(importedConstruct, construct), ...preservedData };
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
    {#if megaTypeDef(construct?.megaType)}
      <button class:active={selectedTab === 'Structure'} on:click={() => setTab('Structure')}>Structure</button>
    {/if}
    <button class:active={selectedTab === 'Engines'} on:click={() => setTab('Engines')}>Engines</button>
    <button class:active={selectedTab === 'Fuel'} on:click={() => setTab('Fuel')}>Fuel</button>
    <button class:active={selectedTab === 'Cargo'} on:click={() => setTab('Cargo')}>Cargo</button>
    <button class:active={selectedTab === 'Crew'} on:click={() => setTab('Crew')}>Crew</button>
    <button class:active={selectedTab === 'Power'} on:click={() => setTab('Power')}>Power</button>
    <button class:active={selectedTab === 'Sensors'} on:click={() => setTab('Sensors')}>Sensors</button>
    <button class:active={selectedTab === 'Modules'} on:click={() => setTab('Modules')}>Modules</button>
    <button class:active={selectedTab === 'Tags'} on:click={() => setTab('Tags')}>Tags</button>
    <button class:active={selectedTab === 'Autopilot'} on:click={() => setTab('Autopilot')}>Autopilot</button>
  </div>

  <div class="tab-content">
    {#if selectedTab === 'Basics'}
      <ConstructBasicsTab {construct} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Orbit'}
      <ConstructGeneralTab {system} {construct} on:update={handleUpdate} />
    {:else if selectedTab === 'Structure'}
      <ConstructMegaTab {system} {construct} on:update={handleUpdate} />
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
    {:else if selectedTab === 'Sensors'}
      <ConstructSensorsTab {construct} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Modules'}
      <ConstructModulesTab {construct} on:update={handleUpdate} />
    {:else if selectedTab === 'Tags'}
      <ConstructCoITab {construct} on:update={handleUpdate} />
    {:else if selectedTab === 'Autopilot'}
      <AutopilotTab {construct} {system} {rulePack} {hostBody} on:update={handleUpdate} on:disengage />
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
    <input type="file" bind:this={fileInput} on:change={handleImport} accept=".json" style="display: none;" />
  </div>

  <div class="specs-section">
      <ConstructDerivedSpecs {construct} {rulePack} {hostBody} isEditingConstruct={true} {hideActions} showPortrait={false} />
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
    background-color: var(--bg-panel);
    color: var(--text-muted);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
    flex-grow: 1;
  }

  .tabs button.active {
    background-color: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .tab-content {
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
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
      background-color: var(--accent);
      color: white;
      border-color: #0056b3;
  }
</style>

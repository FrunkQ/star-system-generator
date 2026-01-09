<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack, FuelDefinition, EngineDefinition } from '$lib/types';
  import { generateId } from '$lib/utils';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  let activeTab: 'fuel' | 'engines' = 'fuel';
  
  // Local state for editing
  let fuels: FuelDefinition[] = [];
  let engines: EngineDefinition[] = [];
  
  // Track original IDs to know what is default vs custom
  let defaultFuelIds = new Set<string>();
  let defaultEngineIds = new Set<string>();

  onMount(() => {
    // Load Defaults
    const loadedFuels: FuelDefinition[] = [];
    if (rulePack.fuelDefinitions) {
      activeTab = 'fuel'; // Default tab
      rulePack.fuelDefinitions.entries.forEach(f => {
        defaultFuelIds.add(f.id);
        loadedFuels.push({ ...f });
      });
    }

    const loadedEngines: EngineDefinition[] = [];
    if (rulePack.engineDefinitions) {
      rulePack.engineDefinitions.entries.forEach(e => {
        defaultEngineIds.add(e.id);
        loadedEngines.push({ ...e });
      });
    }

    // Apply Overrides from Starmap
    if (starmap.rulePackOverrides) {
      if (starmap.rulePackOverrides.fuelDefinitions) {
        starmap.rulePackOverrides.fuelDefinitions.forEach(override => {
          const index = loadedFuels.findIndex(f => f.id === override.id);
          if (index !== -1) {
            loadedFuels[index] = { ...override }; // Replace default
          } else {
            loadedFuels.push({ ...override }); // Add new
          }
        });
      }
      if (starmap.rulePackOverrides.engineDefinitions) {
        starmap.rulePackOverrides.engineDefinitions.forEach(override => {
          const index = loadedEngines.findIndex(e => e.id === override.id);
          if (index !== -1) {
            loadedEngines[index] = { ...override }; // Replace default
          } else {
            loadedEngines.push({ ...override }); // Add new
          }
        });
      }
    }
    
    // Trigger reactivity
    fuels = loadedFuels;
    engines = loadedEngines;
  });

  function handleSave() {
    const overrides: any = {};
    
    // Determine Fuels to save
    const fuelOverrides = fuels.filter(f => {
        // Save if it's new (not in defaults) OR if it's different from default
        if (!defaultFuelIds.has(f.id)) return true;
        const def = rulePack.fuelDefinitions?.entries.find(d => d.id === f.id);
        return JSON.stringify(def) !== JSON.stringify(f);
    });
    if (fuelOverrides.length > 0) overrides.fuelDefinitions = fuelOverrides;

    // Determine Engines to save
    const engineOverrides = engines.filter(e => {
        if (!defaultEngineIds.has(e.id)) return true;
        const def = rulePack.engineDefinitions?.entries.find(d => d.id === e.id);
        return JSON.stringify(def) !== JSON.stringify(e);
    });
    if (engineOverrides.length > 0) overrides.engineDefinitions = engineOverrides;

    dispatch('save', overrides);
    dispatch('close');
  }

  function addFuel() {
      fuels = [...fuels, {
          id: `fuel-custom-${Date.now()}`,
          name: 'New Fuel',
          density_kg_per_m3: 1000,
          description: 'Description'
      }];
  }

  function addEngine() {
      engines = [...engines, {
          id: `engine-custom-${Date.now()}`,
          name: 'New Engine',
          type: 'Chemical',
          fuel_type_id: fuels.length > 0 ? fuels[0].id : 'fuel-hydrazine',
          thrust_kN: 100,
          efficiency_isp: 300,
          atmo_efficiency: 0,
          powerDraw_MW: 0,
          description: 'Description'
      }];
  }

  function deleteItem(type: 'fuel' | 'engine', id: string) {
      if (!confirm('Are you sure you want to remove this item? (Note: Default items cannot be permanently deleted, only reverted)')) return;
      
      if (type === 'fuel') {
          if (defaultFuelIds.has(id)) {
              // Revert to default
              const def = rulePack.fuelDefinitions?.entries.find(d => d.id === id);
              if (def) {
                  const idx = fuels.findIndex(f => f.id === id);
                  fuels[idx] = { ...def };
                  alert('Item reverted to default configuration.');
              }
          } else {
              fuels = fuels.filter(f => f.id !== id);
          }
      } else {
          if (defaultEngineIds.has(id)) {
              // Revert to default
              const def = rulePack.engineDefinitions?.entries.find(d => d.id === id);
              if (def) {
                  const idx = engines.findIndex(e => e.id === id);
                  engines[idx] = { ...def };
                  alert('Item reverted to default configuration.');
              }
          } else {
              engines = engines.filter(e => e.id !== id);
          }
      }
  }
</script>

{#if showModal}
<div class="modal-backdrop" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <div class="header">
        <h2>Edit Fuel & Drives</h2>
        <div class="tabs">
            <button class:active={activeTab === 'fuel'} on:click={() => activeTab = 'fuel'}>Fuel Definitions</button>
            <button class:active={activeTab === 'engines'} on:click={() => activeTab = 'engines'}>Engine Definitions</button>
        </div>
    </div>

    <div class="content">
        {#if activeTab === 'fuel'}
            <div class="list-container">
                {#each fuels as fuel}
                    <div class="item-card">
                        <div class="item-header">
                            <input type="text" class="name-input" bind:value={fuel.name} placeholder="Fuel Name" />
                            <button class="delete-btn" on:click={() => deleteItem('fuel', fuel.id)}>✕</button>
                        </div>
                        <div class="item-body">
                            <div class="field">
                                <label>Density (kg/m³)</label>
                                <input type="number" bind:value={fuel.density_kg_per_m3} />
                            </div>
                            <div class="field full">
                                <label>Description</label>
                                <input type="text" bind:value={fuel.description} />
                            </div>
                        </div>
                    </div>
                {/each}
                <button class="add-btn" on:click={addFuel}>+ Add Fuel Type</button>
            </div>
        {:else}
            <div class="list-container">
                {#each engines as engine}
                    <div class="item-card">
                        <div class="item-header">
                            <input type="text" class="name-input" bind:value={engine.name} placeholder="Engine Name" />
                            <button class="delete-btn" on:click={() => deleteItem('engine', engine.id)}>✕</button>
                        </div>
                        <div class="item-body">
                            <div class="field">
                                <label>Type</label>
                                <input type="text" bind:value={engine.type} />
                            </div>
                            <div class="field">
                                <label>Fuel Type</label>
                                <select bind:value={engine.fuel_type_id}>
                                    {#each fuels as f}
                                        <option value={f.id}>{f.name}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="field">
                                <label>Thrust (kN)</label>
                                <input type="number" bind:value={engine.thrust_kN} />
                            </div>
                            <div class="field">
                                <label>ISP (s)</label>
                                <input type="number" bind:value={engine.efficiency_isp} />
                            </div>
                            <div class="field">
                                <label>Atmo Eff. (0-1)</label>
                                <input type="number" step="0.1" min="0" max="1" bind:value={engine.atmo_efficiency} />
                            </div>
                            <div class="field">
                                <label>Power (MW)</label>
                                <input type="number" bind:value={engine.powerDraw_MW} />
                            </div>
                            <div class="field full">
                                <label>Description</label>
                                <input type="text" bind:value={engine.description} />
                            </div>
                        </div>
                    </div>
                {/each}
                <button class="add-btn" on:click={addEngine}>+ Add Engine Type</button>
            </div>
        {/if}
    </div>

    <div class="footer">
        <button on:click={() => dispatch('close')}>Cancel</button>
        <button class="primary" on:click={handleSave}>Save Changes</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000;
  }
  .modal {
    background: #1e1e1e;
    width: 800px;
    height: 80%;
    border-radius: 8px;
    display: flex; flex-direction: column;
    border: 1px solid #444;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  .header {
      padding: 15px;
      border-bottom: 1px solid #333;
      background: #252525;
  }
  h2 { margin: 0 0 10px 0; color: #eee; font-size: 1.2em; }
  
  .tabs { display: flex; gap: 10px; }
  .tabs button {
      background: #333; border: none; color: #aaa;
      padding: 8px 16px; cursor: pointer; border-radius: 4px;
  }
  .tabs button.active {
      background: #007bff; color: white;
  }

  .content {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      background: #1a1a1a;
  }

  .list-container {
      display: flex; flex-direction: column; gap: 10px;
  }

  .item-card {
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 10px;
  }
  
  .item-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 5px;
  }
  .name-input {
      background: transparent; border: none; color: #fff; font-weight: bold; font-size: 1.1em;
      width: 100%;
  }
  .name-input:focus { background: #333; outline: none; }
  
  .delete-btn {
      background: transparent; color: #666; border: none; cursor: pointer; font-size: 1.2em;
  }
  .delete-btn:hover { color: #ff4444; }

  .item-body {
      display: flex; flex-wrap: wrap; gap: 10px;
  }
  .field {
      flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 2px;
  }
  .field.full { flex-basis: 100%; }
  
  label { font-size: 0.8em; color: #888; }
  input, select {
      background: #333; border: 1px solid #444; color: #eee; padding: 4px; border-radius: 3px;
  }

  .add-btn {
      padding: 10px; background: #333; border: 1px dashed #555; color: #aaa; cursor: pointer;
      width: 100%; text-align: center;
  }
  .add-btn:hover { background: #383838; color: #fff; border-color: #888; }

  .footer {
      padding: 15px; border-top: 1px solid #333; background: #252525;
      display: flex; justify-content: flex-end; gap: 10px;
  }
  .footer button {
      padding: 8px 20px; border-radius: 4px; border: none; cursor: pointer;
  }
  .primary { background: #007bff; color: white; }
</style>

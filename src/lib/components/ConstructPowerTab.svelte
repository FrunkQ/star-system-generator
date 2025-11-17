<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, PowerPlant } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  let newPowerPlantType: string = '';
  let newPowerPlantOutput: number = 100; // Default output in MW

  function addPowerPlant() {
    if (!newPowerPlantType || newPowerPlantOutput <= 0) return;

    if (!construct.systems) construct.systems = {};
    if (!construct.systems.power_plants) construct.systems.power_plants = [];

    construct.systems.power_plants.push({ type: newPowerPlantType, output_MW: newPowerPlantOutput });
    
    dispatch('update');

    // Trigger reactivity and reset fields
    construct.systems.power_plants = construct.systems.power_plants;
    newPowerPlantType = '';
    newPowerPlantOutput = 100;
  }

  function removePowerPlant(index: number) {
    if (!construct.systems?.power_plants) return;
    construct.systems.power_plants.splice(index, 1);
    dispatch('update');
    // Trigger reactivity
    construct.systems.power_plants = construct.systems.power_plants;
  }

  function handleChange() {
    dispatch('update');
  }
</script>

<div class="tab-panel">

  <h4>Attached Power Plants</h4>
  {#if !construct.systems?.power_plants || construct.systems.power_plants.length === 0}
    <p>No power plants attached.</p>
  {:else}
    <ul class="power-plant-list">
      {#each construct.systems.power_plants as plant, index (index)}
        <li class="power-plant-item">
          <span>{plant.type}</span>
          <div class="output-controls">
            <input type="number" bind:value={plant.output_MW} on:change={handleChange} min="0" /> MW
          </div>
          <button class="remove-btn" on:click={() => removePowerPlant(index)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}

  <hr />

  <h4>Add New Power Plant</h4>
  <div class="add-power-plant-form">
    <input type="text" bind:value={newPowerPlantType} placeholder="Power Plant Type (e.g., Fission Reactor)" />
    <input type="number" bind:value={newPowerPlantOutput} min="1" placeholder="Output (MW)" />
    <button on:click={addPowerPlant} disabled={!newPowerPlantType || newPowerPlantOutput <= 0}>Add Power Plant</button>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; }
  hr { border: 1px solid #555; margin: 1em 0; }
  .power-plant-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .power-plant-item { background-color: #444; padding: 8px; border-radius: 4px; display: flex; justify-content: flex-start; align-items: center; gap: 10px; }
  .power-plant-item span { flex-grow: 1; }
  .output-controls { display: flex; align-items: center; gap: 5px; margin-left: auto; }
  .output-controls input { width: 80px; }
  .remove-btn { background-color: #800; color: white; border: 1px solid #c00; }
  .add-power-plant-form { display: flex; flex-direction: column; gap: 10px; }
  .add-power-plant-form input[type="text"], .add-power-plant-form input[type="number"] { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; }
</style>

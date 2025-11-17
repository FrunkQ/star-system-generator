<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, FuelTank, FuelDefinition } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  const fuelDefinitions: FuelDefinition[] = rulePack.fuelDefinitions?.entries || [];
  const fuelNameMap = new Map(fuelDefinitions.map(f => [f.id, f.name]));

  let selectedFuelTypeId: string | null = null;
  let newTankCapacity: number = 1000; // Default capacity

  function addFuelTank() {
    if (!selectedFuelTypeId || newTankCapacity <= 0) return;

    if (!construct.fuel_tanks) construct.fuel_tanks = [];
    construct.fuel_tanks.push({ fuel_type_id: selectedFuelTypeId, capacity_units: newTankCapacity, current_units: newTankCapacity });
    
    dispatch('update');
    
    // Trigger reactivity
    construct.fuel_tanks = construct.fuel_tanks;
    selectedFuelTypeId = null; // Reset dropdown
    newTankCapacity = 1000; // Reset capacity
  }

  function removeFuelTank(index: number) {
    if (!construct.fuel_tanks) return;
    construct.fuel_tanks.splice(index, 1);
    dispatch('update');
    // Trigger reactivity
    construct.fuel_tanks = construct.fuel_tanks;
  }

  function handleChange() {
    // Ensure current fuel does not exceed capacity
    if (construct.fuel_tanks) {
      construct.fuel_tanks.forEach(tank => {
        if (tank.current_units > tank.capacity_units) {
          tank.current_units = tank.capacity_units;
        }
      });
    }
    dispatch('update');
  }
</script>

<div class="tab-panel">

  <h4>Attached Fuel Tanks</h4>
  {#if !construct.fuel_tanks || construct.fuel_tanks.length === 0}
    <p>No fuel tanks attached.</p>
  {:else}
    <ul class="fuel-tank-list">
      {#each construct.fuel_tanks as tank, index (index)}
        <li class="fuel-tank-item">
          <div class="fuel-info">
            <span>{fuelNameMap.get(tank.fuel_type_id) || tank.fuel_type_id} ({fuelDefinitions.find(f => f.id === tank.fuel_type_id)?.density_kg_per_m3 || 0} kg/m³)</span>
            <div class="capacity-info">
              Capacity: <input type="number" bind:value={tank.capacity_units} on:change={handleChange} min="1" /> m³
            </div>
          </div>
          <div class="fuel-controls">
            <input type="range" bind:value={tank.current_units} on:input={handleChange} min="0" max={tank.capacity_units} step="1" />
            <span>{tank.current_units.toLocaleString(undefined, {maximumFractionDigits: 0})} / {tank.capacity_units.toLocaleString(undefined, {maximumFractionDigits: 0})} m³</span>
            <button class="remove-btn" on:click={() => removeFuelTank(index)}>Remove</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <hr />

  <h4>Add New Fuel Tank</h4>
  <div class="add-fuel-tank-form">
    <select bind:value={selectedFuelTypeId}>
      <option value={null} disabled>Select a fuel type</option>
      {#each fuelDefinitions as fuelDef}
        <option value={fuelDef.id}>{fuelDef.name} ({fuelDef.density_kg_per_m3} kg/m³)</option>
      {/each}
    </select>
    <input type="number" bind:value={newTankCapacity} min="1" placeholder="Capacity (m³)" />
    <button on:click={addFuelTank} disabled={!selectedFuelTypeId || newTankCapacity <= 0}>Add Fuel Tank</button>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; }
  hr { border: 1px solid #555; margin: 1em 0; }
  .fuel-tank-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .fuel-tank-item { background-color: #444; padding: 8px; border-radius: 4px; display: flex; flex-direction: column; gap: 5px; }
  .fuel-info { display: flex; justify-content: flex-start; align-items: center; gap: 10px; }
  .fuel-info span { flex-grow: 1; }
  .capacity-info { margin-left: auto; }
  .capacity-info input { width: 80px; margin-left: 5px; }
  .fuel-controls { display: flex; align-items: center; gap: 10px; }
  .fuel-controls input[type="range"] { flex-grow: 1; }
  .remove-btn { background-color: #800; color: white; border: 1px solid #c00; }
  .add-fuel-tank-form { display: flex; gap: 10px; align-items: center; }
  .add-fuel-tank-form input[type="number"] { width: 100px; }
</style>

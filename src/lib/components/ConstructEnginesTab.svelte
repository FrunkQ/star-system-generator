<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, Engine, EngineDefinition, FuelTank } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  const engineDefinitions: EngineDefinition[] = rulePack.engineDefinitions?.entries || [];
  const engineNameMap = new Map(engineDefinitions.map(e => [e.id, e.name]));
  const engineFuelMap = new Map(engineDefinitions.map(e => [e.id, e.fuel_type_id]));

  let selectedEngineId: string | null = null;

  function getEngineTooltip(engineId: string): string {
    const def = engineDefinitions.find(e => e.id === engineId);
    if (!def) return 'Unknown Engine';
    const fuelName = rulePack.fuelDefinitions?.entries.find(f => f.id === def.fuel_type_id)?.name || def.fuel_type_id;
    return `Thrust: ${def.thrust_kN.toLocaleString()} kN\nISP: ${def.efficiency_isp} s\nFuel: ${fuelName}`;
  }

  function addEngine() {
    if (!selectedEngineId) return;

    if (!construct.engines) construct.engines = [];
    const existingEngine = construct.engines.find(e => e.engine_id === selectedEngineId);

    if (existingEngine) {
      existingEngine.quantity++;
    } else {
      construct.engines.push({ engine_id: selectedEngineId, quantity: 1 });
    }

    // Add a default fuel tank if one doesn't already exist for this fuel type
    const fuelTypeId = engineFuelMap.get(selectedEngineId);
    if (!construct.fuel_tanks) construct.fuel_tanks = [];
    const hasFuelTank = construct.fuel_tanks.some(t => t.fuel_type_id === fuelTypeId);

    if (fuelTypeId && !hasFuelTank) {
      construct.fuel_tanks.push({ fuel_type_id: fuelTypeId, capacity_units: 100, current_units: 100 });
    }

    dispatch('update');
    selectedEngineId = null;
    // Trigger reactivity
    construct.engines = construct.engines;
    construct.fuel_tanks = construct.fuel_tanks;
  }

  function removeEngine(engineId: string) {
    if (!construct.engines) return;
    construct.engines = construct.engines.filter(e => e.engine_id !== engineId);
    dispatch('update');
  }

  function changeQuantity(engineId: string, delta: number) {
    if (!construct.engines) return;
    const engine = construct.engines.find(e => e.engine_id === engineId);
    if (engine) {
      engine.quantity = Math.max(1, engine.quantity + delta); // Ensure quantity doesn't go below 1
    }
    dispatch('update');
    // Trigger reactivity
    construct.engines = construct.engines;
  }
</script>

<div class="tab-panel">

  <h4>Attached Engines</h4>
  {#if !construct.engines || construct.engines.length === 0}
    <p>No engines attached.</p>
  {:else}
    <ul class="engine-list">
      {#each construct.engines as engine (engine.engine_id)}
        <li class="engine-item" title={getEngineTooltip(engine.engine_id)}>
          <div class="engine-info">
            <span>{engineNameMap.get(engine.engine_id) || engine.engine_id}</span>
            <small>({rulePack.fuelDefinitions?.entries.find(f => f.id === engineFuelMap.get(engine.engine_id))?.name || 'Unknown Fuel'})</small>
          </div>
          <div class="quantity-controls">
            <button on:click={() => changeQuantity(engine.engine_id, -1)} disabled={engine.quantity <= 1}>-</button>
            <input
              type="number"
              bind:value={engine.quantity}
              min="1"
              on:change={() => {
                engine.quantity = Math.max(1, engine.quantity || 1);
                dispatch('update');
              }}
              class="quantity-input"
            />
            <button on:click={() => changeQuantity(engine.engine_id, 1)}>+</button>
          </div>
          <button class="remove-btn" on:click={() => removeEngine(engine.engine_id)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}

  <hr />

  <h4>Add New Engine</h4>
  <div class="add-engine-form">
    <select bind:value={selectedEngineId}>
      <option value={null} disabled>Select an engine type</option>
      {#each engineDefinitions as engineDef}
        <option value={engineDef.id} title={getEngineTooltip(engineDef.id)}>{engineDef.name}</option>
      {/each}
    </select>
    <button on:click={addEngine} disabled={!selectedEngineId}>Add Engine</button>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; }
  hr { border: 1px solid #555; margin: 1em 0; }
  .add-engine-form { display: flex; gap: 10px; align-items: center; }
  .engine-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .engine-item { display: flex; justify-content: flex-start; align-items: center; background-color: #444; padding: 8px; border-radius: 4px; gap: 10px; }
  .engine-info { display: flex; flex-direction: column; flex-grow: 1; }
  .engine-info small { color: #ccc; font-size: 0.8em; }
  .quantity-controls { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .quantity-controls button { padding: 2px 8px; }
  .remove-btn { background-color: #800; color: white; border: 1px solid #c00; }
</style>

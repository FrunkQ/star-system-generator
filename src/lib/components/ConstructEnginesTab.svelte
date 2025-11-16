<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, Engine, EngineDefinition } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  const engineDefinitions: EngineDefinition[] = rulePack.engineDefinitions?.entries || [];
  const engineNameMap = new Map(engineDefinitions.map(e => [e.id, e.name]));

  let selectedEngineId: string | null = null;

  function updateEngines(newEngines: Engine[]) {
    dispatch('update', { ...construct, engines: newEngines });
  }

  function addEngine() {
    if (!selectedEngineId) return;
    const currentEngines = construct.engines || [];
    const existingEngine = currentEngines.find(e => e.engine_id === selectedEngineId);
    let newEngines: Engine[];
    if (existingEngine) {
      newEngines = currentEngines.map(e => e.engine_id === selectedEngineId ? { ...e, quantity: e.quantity + 1 } : e);
    } else {
      newEngines = [...currentEngines, { engine_id: selectedEngineId, quantity: 1 }];
    }
    updateEngines(newEngines);
    selectedEngineId = null;
  }

  function removeEngine(engineId: string) {
    const currentEngines = construct.engines || [];
    const newEngines = currentEngines.filter(e => e.engine_id !== engineId);
    updateEngines(newEngines);
  }

  function changeQuantity(engineId: string, delta: number) {
    const currentEngines = construct.engines || [];
    let newEngines = currentEngines.map(e => {
      if (e.engine_id === engineId) {
        return { ...e, quantity: Math.max(1, e.quantity + delta) }; // Ensure quantity doesn't go below 1
      }
      return e;
    });
    updateEngines(newEngines);
  }
</script>

<div class="tab-panel">
  <h3>Engine Configuration</h3>

  <h4>Attached Engines</h4>
  {#if !construct.engines || construct.engines.length === 0}
    <p>No engines attached.</p>
  {:else}
    <ul class="engine-list">
      {#each construct.engines as engine (engine.engine_id)}
        <li class="engine-item">
          <span>{engineNameMap.get(engine.engine_id) || engine.engine_id}</span>
          <div class="quantity-controls">
            <button on:click={() => changeQuantity(engine.engine_id, -1)}>-</button>
            <span>{engine.quantity}</span>
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
        <option value={engineDef.id}>{engineDef.name}</option>
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
  .engine-item { display: flex; justify-content: space-between; align-items: center; background-color: #444; padding: 8px; border-radius: 4px; }
  .quantity-controls { display: flex; align-items: center; gap: 10px; }
  .quantity-controls button { padding: 2px 8px; }
  .remove-btn { background-color: #800; color: white; border: 1px solid #c00; }
</style>
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack, SensorDefinition } from '$lib/types';
  import { AU_KM } from '$lib/constants';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  let sensors: SensorDefinition[] = [];
  let defaultSensorIds = new Set<string>();
  let sensorUnits: Record<string, 'km' | 'AU'> = {};

  onMount(() => {
    const loaded: SensorDefinition[] = [];
    if (rulePack.sensorDefinitions) {
      rulePack.sensorDefinitions.entries.forEach(s => {
        defaultSensorIds.add(s.id);
        loaded.push({ ...s });
      });
    }

    if (starmap.rulePackOverrides?.sensorDefinitions) {
      starmap.rulePackOverrides.sensorDefinitions.forEach(override => {
        const index = loaded.findIndex(s => s.id === override.id);
        if (index !== -1) {
          loaded[index] = { ...override };
        } else {
          loaded.push({ ...override });
        }
      });
    }
    
    sensors = loaded;
    // Init units
    sensors.forEach(s => {
        sensorUnits[s.id] = s.preferred_unit || (s.range_km >= AU_KM ? 'AU' : 'km');
    });
  });

  function getDisplayValue(km: number, unit: string): number {
      if (unit === 'AU') return parseFloat((km / AU_KM).toFixed(3));
      return Math.round(km);
  }

  function updateRange(sensor: SensorDefinition, val: string) {
      const num = parseFloat(val);
      if (isNaN(num)) return;
      const unit = sensorUnits[sensor.id] || 'km';
      sensor.preferred_unit = unit;
      if (unit === 'AU') {
          sensor.range_km = num * AU_KM;
      } else {
          sensor.range_km = num;
      }
      // Force update to trigger reactivity if needed
      sensors = sensors;
  }

  function addSensor() {
      const newId = `sensor-custom-${Date.now()}`;
      sensors = [...sensors, {
          id: newId,
          name: 'New Sensor',
          range_km: 100000,
          preferred_unit: 'km',
          description: 'Targets: ... Reveals: ...'
      }];
      sensorUnits[newId] = 'km';
  }

  function deleteItem(id: string) {
      if (!confirm('Are you sure you want to remove this item? (Default items will revert)')) return;
      
      if (defaultSensorIds.has(id)) {
          const def = rulePack.sensorDefinitions?.entries.find(d => d.id === id);
          if (def) {
              const idx = sensors.findIndex(s => s.id === id);
              sensors[idx] = { ...def };
              alert('Item reverted to default.');
          }
      } else {
          sensors = sensors.filter(s => s.id !== id);
      }
  }

  function formatRange(km: number): string {
      if (km >= AU_KM * 0.1) return `${(km / AU_KM).toFixed(2)} AU`;
      if (km >= 1000000) return `${(km / 1000000).toFixed(1)}M km`;
      return `${Math.round(km).toLocaleString()} km`;
  }

  function handleSave() {
    const overrides: any = {};
    const sensorOverrides = sensors.filter(s => {
        if (!defaultSensorIds.has(s.id)) return true;
        const def = rulePack.sensorDefinitions?.entries.find(d => d.id === s.id);
        return JSON.stringify(def) !== JSON.stringify(s);
    });
    if (sensorOverrides.length > 0) overrides.sensorDefinitions = sensorOverrides;

    dispatch('save', overrides);
    dispatch('close');
  }
</script>

{#if showModal}
<div class="modal-backdrop" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <div class="header">
        <h2>Edit Sensor Definitions</h2>
    </div>

    <div class="content">
        <div class="list-container">
            {#each sensors as sensor}
                <div class="item-card">
                    <div class="item-header">
                        <input type="text" class="name-input" bind:value={sensor.name} placeholder="Sensor Name" />
                        <button class="delete-btn" on:click={() => deleteItem(sensor.id)}>✕</button>
                    </div>
                    <div class="item-body">
                        <div class="field">
                            <label>Range</label>
                            <div class="range-row">
                                <input type="number" 
                                    value={getDisplayValue(sensor.range_km, sensorUnits[sensor.id] || 'km')} 
                                    on:input={(e) => updateRange(sensor, e.currentTarget.value)}
                                />
                                <select bind:value={sensorUnits[sensor.id]} class="unit-select">
                                    <option value="km">km</option>
                                    <option value="AU">AU</option>
                                </select>
                            </div>
                            <span class="format-hint">{formatRange(sensor.range_km)}</span>
                        </div>
                        <div class="field full">
                            <label>Description (Targets / Data)</label>
                            <input type="text" bind:value={sensor.description} />
                        </div>
                    </div>
                </div>
            {/each}
            <button class="add-btn" on:click={addSensor}>+ Add Sensor Definition</button>
        </div>
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
    width: 600px;
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
  h2 { margin: 0; color: #eee; font-size: 1.2em; }
  
  .content {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      background: #1a1a1a;
  }

  .list-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
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
  
  .range-row {
      display: flex;
      gap: 5px;
  }
  .unit-select {
      width: auto;
      padding: 4px;
  }
  
  .format-hint {
      font-size: 0.75em; color: #666; margin-top: 2px; text-align: right;
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
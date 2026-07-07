<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, SensorInstance, SensorDefinition } from '$lib/types';
  import { AU_KM } from '$lib/constants';
  import { fmt } from '$lib/stores';

  export let construct: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  let selectedSensorId = '';

  // Helper to ensure sensors array exists
  function ensureSensors() {
      if (!construct.sensors) construct.sensors = [];
      return construct.sensors;
  }

  function addSensor() {
      if (!selectedSensorId) return;
      const def = rulePack.sensorDefinitions?.entries.find(s => s.id === selectedSensorId);
      if (!def) return;

      const newSensor: SensorInstance = {
          definition_id: def.id,
          name: def.name,
          range_km: def.range_km,
          description: def.description
      };

      ensureSensors().push(newSensor);
      construct.sensors = construct.sensors; // Trigger update
      dispatch('update');
      selectedSensorId = '';
  }

  function removeSensor(index: number) {
      ensureSensors().splice(index, 1);
      construct.sensors = construct.sensors;
      dispatch('update');
  }

  // Reactive so the km-branch re-renders when the in-system unit (km/miles) toggles.
  // The AU-branch stays as an astronomer's AU regardless of unit (acceptable for large ranges).
  $: formatRange = (km: number): string => {
      if (km >= AU_KM * 0.1) {
          return `${(km / AU_KM).toFixed(2)} AU`;
      }
      if (km >= 1000000) {
          return `${(km / 1000000).toFixed(1)}M km`;
      }
      return $fmt.km(km);
  };

  $: formatDefinitionRange = (def: SensorDefinition): string => {
      const unit = def.preferred_unit || (def.range_km >= AU_KM ? 'AU' : 'km');
      if (unit === 'AU') return `${(def.range_km / AU_KM).toFixed(2)} AU`;
      return $fmt.km(def.range_km);
  };

  // Range Editing State
  let editingRangeIndex: number | null = null;
  let editRangeValue: number = 0;
  let editRangeUnit: 'km' | 'AU' = 'km';

  function startEditRange(index: number, km: number) {
      editingRangeIndex = index;
      if (km >= AU_KM) {
          editRangeUnit = 'AU';
          editRangeValue = parseFloat((km / AU_KM).toFixed(3));
      } else {
          editRangeUnit = 'km';
          editRangeValue = Math.round(km);
      }
  }

  function saveRange(index: number) {
      if (!construct.sensors) return;
      const km = editRangeUnit === 'AU' ? editRangeValue * AU_KM : editRangeValue;
      construct.sensors[index].range_km = km;
      editingRangeIndex = null;
      dispatch('update');
  }

</script>

<div class="sensors-container">
    <div class="add-sensor-row">
        <select bind:value={selectedSensorId}>
            <option value="">Select Sensor Package...</option>
            {#if rulePack.sensorDefinitions}
                {#each rulePack.sensorDefinitions.entries as def}
                    <option value={def.id}>{def.name} ({formatDefinitionRange(def)})</option>
                {/each}
            {/if}
        </select>
        <button on:click={addSensor} disabled={!selectedSensorId}>Add</button>
    </div>

    <div class="sensor-list">
        {#if construct.sensors && construct.sensors.length > 0}
            {#each construct.sensors as sensor, i}
                <div class="sensor-card">
                    <div class="sensor-header">
                        <input type="text" bind:value={sensor.name} on:change={() => dispatch('update')} class="sensor-name-input" />
                        <button class="delete-btn" on:click={() => removeSensor(i)}>✕</button>
                    </div>
                    
                    <div class="sensor-row">
                        <span class="label">Range:</span>
                        {#if editingRangeIndex === i}
                            <div class="range-editor">
                                <input type="number" bind:value={editRangeValue} step={editRangeUnit === 'AU' ? 0.1 : 1000} />
                                <select bind:value={editRangeUnit}>
                                    <option value="km">km</option>
                                    <option value="AU">AU</option>
                                </select>
                                <button on:click={() => saveRange(i)}>Ok</button>
                            </div>
                        {:else}
                            <span class="value clickable" on:click={() => startEditRange(i, sensor.range_km)} title="Click to edit range">
                                {formatRange(sensor.range_km)}
                            </span>
                        {/if}
                    </div>

                    <div class="sensor-row description-row">
                        <span class="label">Data:</span>
                        <input type="text" bind:value={sensor.description} on:change={() => dispatch('update')} class="description-input" placeholder="Description..." />
                    </div>
                </div>
            {/each}
        {:else}
            <p class="empty-msg">No sensors installed.</p>
        {/if}
    </div>
</div>

<style>
    .sensors-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        height: 100%;
        overflow-y: auto;
        padding: 5px;
    }

    .add-sensor-row {
        display: flex;
        gap: 10px;
    }
    
    select {
        flex-grow: 1;
        background: var(--bg-panel);
        color: var(--text);
        border: 1px solid var(--border);
        padding: 5px;
        border-radius: 3px;
    }

    button {
        background: var(--bg-control);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 3px;
        cursor: pointer;
        padding: 5px 10px;
    }
    button:hover { background: var(--bg-control-hover); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .sensor-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .sensor-card {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .sensor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
    }

    .sensor-name-input {
        background: transparent;
        border: none;
        border-bottom: 1px solid transparent;
        color: var(--link);
        font-weight: bold;
        font-size: 1em;
        flex-grow: 1;
    }
    .sensor-name-input:focus {
        border-bottom-color: var(--link);
        outline: none;
        background: var(--bg-panel);
    }

    .delete-btn {
        background: transparent;
        border: none;
        color: var(--status-bad);
        font-weight: bold;
        padding: 0 5px;
    }
    .delete-btn:hover { background: #442222; }

    .sensor-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.9em;
    }

    .label {
        color: var(--text-faint);
        width: 50px;
        flex-shrink: 0;
    }

    .value.clickable {
        color: var(--text);
        border-bottom: 1px dashed var(--border);
        cursor: pointer;
    }
    .value.clickable:hover { color: var(--text); border-bottom-color: var(--text); }

    .range-editor {
        display: flex;
        gap: 5px;
        align-items: center;
    }
    .range-editor input { width: 80px; background: var(--bg-panel); border: 1px solid var(--border); color: var(--text); }
    .range-editor select { width: auto; background: var(--bg-panel); border: 1px solid var(--border); color: var(--text); }

    .description-input {
        flex-grow: 1;
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-muted);
        padding: 2px 5px;
        border-radius: 2px;
        font-size: 0.9em;
    }
    .description-input:focus {
        background: var(--bg-panel);
        border-color: var(--border);
        outline: none;
    }

    .empty-msg {
        color: var(--text-faint);
        text-align: center;
        font-style: italic;
    }
</style>
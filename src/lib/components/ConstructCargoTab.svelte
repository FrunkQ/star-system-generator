<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // Initialize cargo description if it doesn't exist to prevent errors
  if (construct.cargoDescription === undefined) {
    construct.cargoDescription = '';
  }
  // Ensure physical_parameters exists for binding
  if (!construct.physical_parameters) {
    construct.physical_parameters = {};
  }

  function handleChange() {
    // Ensure current cargo does not exceed capacity
    if (construct.physical_parameters && (construct.current_cargo_tonnes || 0) > (construct.physical_parameters.cargoCapacity_tonnes || 0)) {
      construct.current_cargo_tonnes = construct.physical_parameters.cargoCapacity_tonnes;
    }
    dispatch('update');
  }
</script>

<div class="tab-panel">
  <div class="form-group">
    <label for="cargo-capacity">Max Cargo Capacity (tonnes):</label>
    <input 
      type="number" 
      id="cargo-capacity" 
      bind:value={construct.physical_parameters.cargoCapacity_tonnes}
      on:input={handleChange}
      min="0" 
    />
  </div>

  <div class="form-group">
    <label for="current-cargo">Current Cargo Load (tonnes):</label>
    <div class="slider-group">
      <input 
        type="range" 
        id="current-cargo" 
        bind:value={construct.current_cargo_tonnes}
        on:input={handleChange}
        min="0" 
        max={construct.physical_parameters?.cargoCapacity_tonnes || 0} 
        step="1" 
      />
      <span>
        {(construct.current_cargo_tonnes || 0).toLocaleString(undefined, {maximumFractionDigits: 0})} / 
        {(construct.physical_parameters?.cargoCapacity_tonnes || 0).toLocaleString(undefined, {maximumFractionDigits: 0})} tonnes
      </span>
    </div>
  </div>

  <div class="separator"></div>

  <div class="form-group">
    <label for="cargo-description">Cargo Description:</label>
    <textarea 
      id="cargo-description"
      rows="6"
      bind:value={construct.cargoDescription}
      on:input={handleChange}
    ></textarea>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input[type="number"], textarea { 
    padding: 8px; 
    border-radius: 4px; 
    border: 1px solid #555; 
    background-color: #444; 
    color: #eee; 
    font-size: 1em; 
    width: 100%;
    box-sizing: border-box;
  }
  .slider-group { display: flex; align-items: center; gap: 10px; }
  .slider-group input[type="range"] { flex-grow: 1; }
  .slider-group span { white-space: nowrap; }
  .separator { height: 1px; background-color: #555; width: 100%; margin: 10px 0; }
</style>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // Initialize nested physical_parameters if it doesn't exist
  if (!construct.physical_parameters) {
    construct.physical_parameters = {};
  }
  if (construct.physical_parameters.massKg === undefined) {
    construct.physical_parameters.massKg = 0;
  }
  if (!Array.isArray(construct.physical_parameters.dimensionsM)) {
    construct.physical_parameters.dimensionsM = [0, 0, 0];
  }
  
  // Initialize icon color if missing
  if (!construct.icon_color) {
    construct.icon_color = '#f0f0f0';
  }

  // UI variable for mass in tonnes
  let massTonnes: number = construct.physical_parameters.massKg / 1000;

  // Reactive statements to sync UI (tonnes) with data (kg)
  $: if (construct.physical_parameters) {
    massTonnes = (construct.physical_parameters.massKg || 0) / 1000;
  }
  $: if (construct.physical_parameters && massTonnes !== undefined) {
    construct.physical_parameters.massKg = massTonnes * 1000;
  }

  function handleUpdate() {
    dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="row">
      <div class="form-group" style="flex: 1;">
        <label for="construct-class">Class:</label>
        <input type="text" id="construct-class" bind:value={construct.class} on:input={handleUpdate} />
      </div>
    </div>

    <div class="row">
      <div class="form-group" style="flex: 1;">
        <label for="icon-type">Icon Type:</label>
        <select id="icon-type" bind:value={construct.icon_type} on:change={handleUpdate}>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
          <option value="circle">Circle</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label for="icon-color">Colour:</label>
        <input type="color" id="icon-color" bind:value={construct.icon_color} on:input={handleUpdate} />
      </div>
    </div>

    <div class="row">
      <div class="form-group">
        <label for="dry-mass">Dry Mass (tonnes):</label>
        <input type="number" id="dry-mass" bind:value={massTonnes} on:input={handleUpdate} />
      </div>
    </div>

    <div class="form-group dimensions-group">
        <label>Dimensions (L x W x H) m:</label>
        <div class="dimensions-inputs">
          <input type="number" placeholder="L" bind:value={construct.physical_parameters.dimensionsM[0]} on:input={handleUpdate} />
          <input type="number" placeholder="W" bind:value={construct.physical_parameters.dimensionsM[1]} on:input={handleUpdate} />
          <input type="number" placeholder="H" bind:value={construct.physical_parameters.dimensionsM[2]} on:input={handleUpdate} />
        </div>
    </div>

    <hr class="separator" />

    <div class="checkbox-group">
        <label>
          <input type="checkbox" bind:checked={construct.physical_parameters.can_aerobrake} on:change={handleUpdate} />
          Can Aerobrake <span class="descriptor">(has heat shielding & control surfaces)</span>
        </label>
        <label>
          <input type="checkbox" bind:checked={construct.physical_parameters.has_landing_gear} on:change={handleUpdate} />
          Has Landing Gear
        </label>
    </div>
</div>

<style>
  .tab-panel { 
    padding: 10px; 
    display: flex; 
    flex-direction: column; 
    gap: 15px; 
    width: 100%; 
    box-sizing: border-box; 
    overflow-x: hidden; 
  }
  .row { display: flex; gap: 15px; }
  .form-group { display: flex; flex-direction: column; flex: 1; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; font-size: 1em; width: 100%; box-sizing: border-box; }
  input[type="color"] { height: 38px; padding: 2px; }
  .separator { height: 1px; background-color: #555; width: 100%; margin: 0.5em 0; border: none; }
  
  .dimensions-group .dimensions-inputs {
    display: flex;
    gap: 5px;
  }
  .dimensions-group .dimensions-inputs input {
    text-align: center;
  }

  .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
  .checkbox-group label { display: flex; align-items: center; gap: 10px; color: #eee; }
  .descriptor { font-size: 0.9em; color: #999; }
  
  input[type="checkbox"] {
      width: auto;
  }
</style>

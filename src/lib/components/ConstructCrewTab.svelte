<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { calculateArtificialGravity, calculateRPMFromG } from '$lib/physics/gravity';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // --- Initialize Data ---
  // Ensure the construct's `crew` object and its properties exist, defaulting to 0.
  if (!(construct as any).crew) (construct as any).crew = {};
  if ((construct as any).crew.max === undefined) (construct as any).crew.max = 0;
  if ((construct as any).crew.current === undefined) (construct as any).crew.current = 0;

  // Initialize other objects for safety.
  if (!construct.systems) construct.systems = {};
  if (!construct.systems.life_support) construct.systems.life_support = { consumables_max_person_days: 0, consumables_current_person_days: 0 };
  if (!construct.physical_parameters) construct.physical_parameters = {};

  // --- Rotation / Artificial Gravity ---
  let rotation_period_rpm: number;

  // Initialize spinRadiusM with default value if not set or invalid
  onMount(() => {
    if (construct.physical_parameters && (construct.physical_parameters.spinRadiusM === undefined || construct.physical_parameters.spinRadiusM < 0)) {
      const dims = construct.physical_parameters.dimensionsM || [0, 0, 0];
      const sortedDims = [...dims].sort((a, b) => b - a);
      const secondHighestDim = sortedDims[1] || 0;
      construct.physical_parameters.spinRadiusM = Math.max(0, secondHighestDim / 2 - 1);
    }
  });

  // Reactive sync: rotation_period_hours (data) <-> rotation_period_rpm (UI)
  $: {
    const hours = construct.physical_parameters?.rotation_period_hours;
    if (hours === undefined || hours === 0) {
      rotation_period_rpm = 0;
    } else {
      rotation_period_rpm = 1 / (hours / 60); // Convert hours to RPM
    }
  }

  $: if (construct.physical_parameters && rotation_period_rpm !== undefined) {
    if (rotation_period_rpm === 0) {
      construct.physical_parameters.rotation_period_hours = 0;
    } else {
      construct.physical_parameters.rotation_period_hours = (1 / rotation_period_rpm) * 60; // Convert RPM to hours
    }
  }

  // Reactive calculation: Current Artificial Gravity in G's
  $: currentArtificialG = calculateArtificialGravity(
    construct.physical_parameters?.spinRadiusM || 0,
    rotation_period_rpm || 0
  );

  function handleUpdate() {
    construct = construct;
    dispatch('update');
  }

  // Handle slider updates
  function handleSliderUpdate(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    const property = input.id.split('-')[1]; // e.g., 'crew' or 'consumables'

    if (property === 'crew') {
      (construct as any).crew.current = value;
    } else if (property === 'consumables') {
      construct.systems.life_support.consumables_current_person_days = value;
    }
    handleUpdate();
  }
</script>

<div class="tab-panel">
  <div class="row">
    <div class="form-group" style="flex: 3;">
      <label for="current-crew">Current Crew: <span class="current-value">{(construct as any).crew.current || 0}</span></label>
      <input
        type="range"
        id="current-crew"
        min="0"
        max={(construct as any).crew.max || 0}
        step="1"
        bind:value={(construct as any).crew.current}
        on:input={handleSliderUpdate}
      />
    </div>
    <div class="form-group" style="flex: 1;">
      <label for="max-crew">Max Crew:</label>
      <input type="number" id="max-crew" bind:value={(construct as any).crew.max} on:input={handleUpdate} />
    </div>
  </div>

  <div class="row">
    <div class="form-group" style="flex: 3;">
      <label for="current-consumables">Current Consumables (person-days): <span class="current-value">{construct.systems.life_support.consumables_current_person_days || 0}</span></label>
      <input
        type="range"
        id="current-consumables"
        min="0"
        max={construct.systems.life_support.consumables_max_person_days || 0}
        step="1"
        bind:value={construct.systems.life_support.consumables_current_person_days}
        on:input={handleSliderUpdate}
      />
    </div>
    <div class="form-group" style="flex: 1;">
      <label for="max-consumables">Max Consumables (person-days):</label>
      <input type="number" id="max-consumables" bind:value={construct.systems.life_support.consumables_max_person_days} on:input={handleUpdate} />
    </div>
  </div>

  <div class="separator"></div>

  <h4>Artificial Gravity (Current: {currentArtificialG.toFixed(2)} G)</h4>
  
  <div class="row">
    <div class="form-group">
      <label for="spin-radius">Radius of Spinning Section (m):</label>
      <input type="number" id="spin-radius" bind:value={construct.physical_parameters.spinRadiusM} on:input={handleUpdate} />
    </div>
    <div class="form-group">
      <label for="rotation-speed">Rotation Speed (RPM):</label>
      <input type="number" id="rotation-speed" bind:value={rotation_period_rpm} on:input={handleUpdate} />
    </div>
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
  input[type="number"], select, textarea { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; font-size: 1em; width: 100%; box-sizing: border-box; }
  input[type="range"] { width: 100%; }
  h4 { margin: 0.5em 0 0 0; color: #ff9900; }
  .separator { height: 1px; background-color: #555; width: 100%; margin: 0; }
  .current-value { font-weight: bold; color: #ff9900; margin-left: 0.5em; }
</style>
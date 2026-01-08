<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter } from '$lib/types';
  import { AU_KM } from '$lib/constants';
  import { calculateEquilibriumTemperature } from '$lib/physics/temperature';

  export let body: CelestialBody;
  export let rootStar: CelestialBody | null = null;
  export let parentBody: CelestialBody | null = null;
  export let nodes: (CelestialBody | Barycenter)[] = [];

  const dispatch = createEventDispatcher();

  function calculateEquilibrium() {
      // Use shared helper for robust calculation (handles Binaries, Moons, etc.)
      // Note: The helper assumes body.orbit is up to date, which it should be due to binding in BodyOrbitTab.
      // However, if we are editing 'body' locally here, we rely on the object reference being updated elsewhere?
      // No, BodyOrbitTab updates 'body' directly. 'body' is passed by reference.
      // But we need to ensure we pass the correct albedo.
      return calculateEquilibriumTemperature(body, nodes, body.albedo !== undefined ? body.albedo : 0.3);
  }

  function updateTotal() {
      if (body.roleHint === 'star') {
          dispatch('update');
          return;
      }

      // Ensure defaults are set if undefined, but only when updating (only albedo and radiogenic are editable)
      if (body.albedo === undefined) body.albedo = 0.3;
      if (body.radiogenicHeatK === undefined) body.radiogenicHeatK = 0;

      // Greenhouse and Tidal are derived, but we need to ensure the props exist for display.
      if (body.greenhouseTempK === undefined) body.greenhouseTempK = 0;
      if (body.tidalHeatK === undefined) body.tidalHeatK = 0;

      const eq = calculateEquilibrium();
      const newTemp = eq + (body.greenhouseTempK || 0) + (body.tidalHeatK || 0) + (body.radiogenicHeatK || 0);
      
      // Only dispatch if values actually changed to avoid loops
      if (Math.abs(eq - (body.equilibriumTempK || 0)) > 0.1 || Math.abs(newTemp - (body.temperatureK || 0)) > 0.1) {
          body.equilibriumTempK = eq;
          body.temperatureK = newTemp;
          dispatch('update');
      }
  }
  
  function getTempColor(kelvin: number) {
      const celsius = kelvin - 273.15;
      if (celsius >= -10 && celsius <= 40) return '#4ade80'; // Green
      if (celsius >= -30 && celsius < -10) return '#60a5fa'; // Blue
      if (celsius > 40 && celsius <= 89) return '#fb923c'; // Orange
      return '#ef4444'; // Red
  }

  // Watch for external changes
  $: if (body.orbit?.elements.a_AU || parentBody?.orbit?.elements.a_AU) {
      updateTotal();
  }
</script>

<div class="tab-panel">
    {#if body.roleHint === 'star'}
        <div class="form-group">
            <label>Surface Temperature (Kelvin)</label>
            <input type="number" bind:value={body.temperatureK} on:input={() => dispatch('update')} />
            <span class="sub-label">{Math.round((body.temperatureK || 0) - 273.15)} °C</span>
        </div>
    {:else}
        <div class="read-only-row">
            <label>Equilibrium Temp (Solar Heating)</label>
            <span class="value">{Math.round(body.equilibriumTempK || 0)} K ({Math.round((body.equilibriumTempK || 0) - 273.15)} °C)</span>
        </div>
        
        <div class="form-group">
            <label>Bond Albedo (Reflectivity 0-1)</label>
            <div class="input-row">
                <input type="range" min="0" max="1" step="0.01" bind:value={body.albedo} on:input={updateTotal} />
                <input type="number" step="0.01" bind:value={body.albedo} on:input={updateTotal} style="width: 60px;" />
            </div>
        </div>

        <hr />
        <h4>Internal & Atmospheric Heat</h4>

        <div class="read-only-row">
            <label>Greenhouse Effect (+K)</label>
            <span class="value">{Math.round(body.greenhouseTempK || 0)} K</span>
        </div>

        <div class="read-only-row">
            <label>Tidal Heating (+K)</label>
            <span class="value">{Math.round(body.tidalHeatK || 0)} K</span>
        </div>

        <div class="form-group">
            <label>Radiogenic Heating (+K)</label>
            <div class="input-row">
                <input type="range" min="0" max="40" step="1" bind:value={body.radiogenicHeatK} on:input={updateTotal} />
                <input type="number" step="1" bind:value={body.radiogenicHeatK} on:input={updateTotal} style="width: 60px;" />
            </div>
        </div>
        
        <hr />
        
        <div class="read-only-row highlight">
            <label>Total Surface Temperature</label>
            <span class="value large" style="color: {getTempColor(body.temperatureK || 0)}">
                {Math.round(body.temperatureK || 0)} K ({Math.round((body.temperatureK || 0) - 273.15)} °C)
            </span>
        </div>
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  .input-row { display: flex; gap: 10px; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; }
  input[type="range"] { flex-grow: 1; }
  
  .sub-label { font-size: 0.8em; color: #888; text-align: right; margin-top: 2px; }
  
  .read-only-row {
      display: flex; justify-content: space-between; align-items: center;
      background: #333; padding: 10px; border-radius: 4px;
  }
  .read-only-row.highlight { background: #444; border: 1px solid #666; }
  .value { color: #fff; font-weight: bold; }
  .value.large { font-size: 1.2em; }
  
  h4 { margin: 0; color: #88ccff; font-size: 0.9em; text-transform: uppercase; }
  hr { border: 0; border-top: 1px solid #555; margin: 0; }
</style>

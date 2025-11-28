<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';

  export let body: CelestialBody;

  const dispatch = createEventDispatcher();

  let useSolarUnits = body.roleHint === 'star';

  // UI Helpers
  let massValue = useSolarUnits ? (body.massKg || 0) / SOLAR_MASS_KG : (body.massKg || 0) / EARTH_MASS_KG;
  let radiusValue = useSolarUnits ? (body.radiusKm || 0) / SOLAR_RADIUS_KM : (body.radiusKm || 0) / EARTH_RADIUS_KM;

  // Reactivity
  $: if (body.massKg) {
      massValue = useSolarUnits ? body.massKg / SOLAR_MASS_KG : body.massKg / EARTH_MASS_KG;
  }
  $: if (body.radiusKm) {
      radiusValue = useSolarUnits ? body.radiusKm / SOLAR_RADIUS_KM : body.radiusKm / EARTH_RADIUS_KM;
  }

  function updateMass() {
      body.massKg = massValue * (useSolarUnits ? SOLAR_MASS_KG : EARTH_MASS_KG);
      dispatch('update');
  }

  function updateRadius() {
      body.radiusKm = radiusValue * (useSolarUnits ? SOLAR_RADIUS_KM : EARTH_RADIUS_KM);
      dispatch('update');
  }

  function handleUpdate() {
      dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="form-group">
        <label for="name">Name</label>
        <input type="text" id="name" bind:value={body.name} on:input={handleUpdate} />
    </div>

    <div class="row">
        <div class="form-group">
            <label for="mass">Mass ({useSolarUnits ? 'Suns' : 'Earths'})</label>
            <input type="number" id="mass" step="0.01" bind:value={massValue} on:input={updateMass} />
            <span class="sub-label">{(body.massKg || 0).toExponential(2)} kg</span>
        </div>
        <div class="form-group">
            <label for="radius">Radius ({useSolarUnits ? 'Suns' : 'Earths'})</label>
            <input type="number" id="radius" step="0.01" bind:value={radiusValue} on:input={updateRadius} />
            <span class="sub-label">{Math.round(body.radiusKm || 0).toLocaleString()} km</span>
        </div>
    </div>

    <div class="row">
        <div class="form-group">
            <label for="rotation">Day Length (Hours)</label>
            <input type="number" id="rotation" step="0.1" bind:value={body.rotation_period_hours} on:input={handleUpdate} />
        </div>
        <div class="form-group">
            <label for="tilt">Axial Tilt (°)</label>
            <input type="number" id="tilt" step="0.1" bind:value={body.axial_tilt_deg} on:input={handleUpdate} />
        </div>
    </div>
    
    <div class="form-group">
        <label>
            <input type="checkbox" bind:checked={body.tidallyLocked} on:change={handleUpdate} />
            Tidally Locked
        </label>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .row { display: flex; gap: 10px; }
  .form-group { display: flex; flex-direction: column; flex: 1; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; font-size: 1em; width: 100%; box-sizing: border-box; }
  .sub-label { font-size: 0.8em; color: #888; margin-top: 2px; text-align: right; }
  input[type="checkbox"] { width: auto; margin-right: 5px; }
</style>

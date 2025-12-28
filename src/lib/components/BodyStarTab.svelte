<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
  import { STAR_COLOR_MAP } from '$lib/rendering/colors';

  let { body, rulePack } = $props();

  const dispatch = createEventDispatcher();

  // --- State ---
  let massSuns = $state(0);
  let radiusSuns = $state(0);
  let tempK = $state(0);
  let radiation = $state(0);
  let rotationHours = $state(0);
  let magGauss = $state(0);

  // --- Mass Slider Config ---
  const massMin = 0.05;
  const massMax = 300;
  const massLogMin = Math.log(massMin);
  const massLogMax = Math.log(massMax);
  let massSliderPos = $state(0.5);

  // --- Radius Slider Config ---
  const radiusMin = 0.01;
  const radiusMax = 2000;
  const radiusLogMin = Math.log(radiusMin);
  const radiusLogMax = Math.log(radiusMax);
  let radiusSliderPos = $state(0.5);

  // --- Temp Slider Config ---
  const tempMin = 2000;
  const tempMax = 50000;
  const tempLogMin = Math.log(tempMin);
  const tempLogMax = Math.log(tempMax);
  let tempSliderPos = $state(0.5);

  // --- Initialization & Sync ---
  $effect(() => {
      if (body) {
          if (body.massKg) {
              const m = body.massKg / SOLAR_MASS_KG;
              if (Math.abs(m - massSuns) > 0.001) {
                  massSuns = m;
                  massSliderPos = (Math.log(Math.max(massMin, Math.min(massMax, massSuns))) - massLogMin) / (massLogMax - massLogMin);
              }
          }
          if (body.radiusKm) {
              const r = body.radiusKm / SOLAR_RADIUS_KM;
              if (Math.abs(r - radiusSuns) > 0.001) {
                  radiusSuns = r;
                  radiusSliderPos = (Math.log(Math.max(radiusMin, Math.min(radiusMax, radiusSuns))) - radiusLogMin) / (radiusLogMax - radiusLogMin);
              }
          }
          if (body.temperatureK) {
              if (Math.abs(body.temperatureK - tempK) > 1) {
                  tempK = body.temperatureK;
                  tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, tempK))) - tempLogMin) / (tempLogMax - tempLogMin);
              }
          }
          if (body.radiationOutput !== undefined) {
              radiation = body.radiationOutput;
          }
          rotationHours = body.rotation_period_hours || 0;
          magGauss = body.magneticField?.strengthGauss || 0;
      }
  });

  // --- Updates ---
  function updateMass() {
      const val = Math.exp(massLogMin + (massLogMax - massLogMin) * massSliderPos);
      massSuns = parseFloat(val.toPrecision(3));
      body.massKg = massSuns * SOLAR_MASS_KG;
      dispatch('update');
  }

  function updateRadius() {
      const val = Math.exp(radiusLogMin + (radiusLogMax - radiusLogMin) * radiusSliderPos);
      radiusSuns = parseFloat(val.toPrecision(3));
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      dispatch('update');
  }

  function updateImage(starClass: string) {
      let lookupClass = starClass;
      if (starClass === 'star/red-giant') lookupClass = 'star/M';

      if (rulePack?.classifier?.starImages?.[lookupClass]) {
          if (!body.image) body.image = { url: '' };
          body.image.url = rulePack.classifier.starImages[lookupClass];
      }
  }

  function updateTemp() {
      const val = Math.exp(tempLogMin + (tempLogMax - tempLogMin) * tempSliderPos);
      tempK = Math.round(val);
      body.temperatureK = tempK;
      
      // Auto-update Class based on Temp
      let newClass = 'star/M';
      if (tempK >= 30000) newClass = 'star/O';
      else if (tempK >= 10000) newClass = 'star/B';
      else if (tempK >= 7500) newClass = 'star/A';
      else if (tempK >= 6000) newClass = 'star/F';
      else if (tempK >= 5200) newClass = 'star/G';
      else if (tempK >= 3700) newClass = 'star/K';
      
      const currentClass = body.classes?.[0] || '';
      if (!['star/WD', 'star/NS', 'star/BH', 'star/BH_active', 'star/magnetar', 'star/red-giant'].includes(currentClass)) {
          if (!body.classes) body.classes = [];
          if (body.classes[0] !== newClass) {
              body.classes[0] = newClass;
              updateImage(newClass);
          }
      }
      dispatch('update');
  }

  function updateRadiation() {
      body.radiationOutput = radiation;
      dispatch('update');
  }

  function updateRotation() {
      body.rotation_period_hours = rotationHours;
      dispatch('update');
  }

  function updateMagField() {
      body.magneticField = { strengthGauss: magGauss };
      dispatch('update');
  }

  // --- Derived ---
  let starColor = $derived.by(() => {
      return getStarColorFromTemp(tempK);
  });

  function getStarColorFromTemp(k: number) {
      if (k < 3700) return "#ffc46f"; // M (Orange-Red)
      if (k < 5200) return "#ffd2a1"; // K (Light Orange)
      if (k < 6000) return "#fff4ea"; // G (Yellow-White)
      if (k < 7500) return "#f8f7ff"; // F (White)
      if (k < 10000) return "#cad8ff"; // A (Light Blue)
      if (k < 30000) return "#aabfff"; // B (Blue)
      return "#9bb0ff"; // O (Deep Blue)
  }

  let luminosity = $derived((radiusSuns ** 2) * ((tempK / 5778) ** 4));

  const spectralTypes = ['star/O', 'star/B', 'star/A', 'star/F', 'star/G', 'star/K', 'star/M', 'star/red-giant', 'star/WD', 'star/NS', 'star/BH'];

  function updateSpectralType(e: Event) {
      const val = (e.target as HTMLSelectElement).value;
      if (!body.classes) body.classes = [];
      body.classes[0] = val;
      updateImage(val);
      dispatch('update');
  }

</script>

<div class="tab-panel">
    <!-- CLASSIFICATION -->
    <div class="form-group">
        <label>Spectral Type</label>
        <div style="display: flex; gap: 10px;">
            <select value={body.classes?.[0] || 'star/G'} on:change={updateSpectralType}>
                {#each spectralTypes as type}
                    <option value={type}>{type.replace('star/', '').replace('-', ' ').toUpperCase()}</option>
                {/each}
            </select>
            <div class="color-preview" style="background-color: {starColor}; box-shadow: 0 0 10px {starColor};"></div>
        </div>
    </div>

    <hr/>

    <!-- MASS -->
    <div class="form-group">
        <div class="label-row">
            <label>Mass (Solar Masses)</label>
            <input type="number" step="0.01" bind:value={massSuns} on:change={() => { body.massKg = massSuns * SOLAR_MASS_KG; dispatch('update'); }} />
        </div>
        <input type="range" min="0" max="1" step="0.001" bind:value={massSliderPos} on:input={updateMass} class="full-width-slider" />
    </div>

    <!-- RADIUS -->
    <div class="form-group">
        <div class="label-row">
            <label>Radius (Solar Radii)</label>
            <input type="number" step="0.01" bind:value={radiusSuns} on:change={() => { body.radiusKm = radiusSuns * SOLAR_RADIUS_KM; dispatch('update'); }} />
        </div>
        <input type="range" min="0" max="1" step="0.001" bind:value={radiusSliderPos} on:input={updateRadius} class="full-width-slider" />
        <div class="sub-label">{Math.round(body.radiusKm || 0).toLocaleString()} km</div>
    </div>

    <hr/>

    <!-- TEMPERATURE -->
    <div class="form-group">
        <div class="label-row">
            <label>Temperature (Kelvin)</label>
            <input type="number" step="100" bind:value={tempK} on:change={() => { body.temperatureK = tempK; dispatch('update'); }} />
        </div>
        <input type="range" min="0" max="1" step="0.001" bind:value={tempSliderPos} on:input={updateTemp} class="full-width-slider" />
    </div>

    <!-- RADIATION / LUMINOSITY -->
    <div class="form-group">
        <div class="label-row">
            <label>Radiation Multiplier</label>
            <input type="number" step="0.1" bind:value={radiation} on:input={updateRadiation} />
        </div>
        <div class="sub-label">Est. Luminosity: {luminosity.toExponential(2)} L☉</div>
    </div>

    <hr/>

    <!-- ROTATION -->
    <div class="form-group">
        <div class="label-row">
            <label>Rotation Period (Hours)</label>
            <input type="number" step="0.1" bind:value={rotationHours} on:input={updateRotation} />
        </div>
        <input type="range" min="0.1" max="1000" step="0.1" bind:value={rotationHours} on:input={updateRotation} class="full-width-slider" />
    </div>

    <!-- MAGNETIC FIELD -->
    <div class="form-group">
        <div class="label-row">
            <label>Magnetic Field (Gauss)</label>
            <input type="number" step="0.1" bind:value={magGauss} on:input={updateMagField} />
        </div>
        <input type="range" min="0" max="10000" step="10" bind:value={magGauss} on:input={updateMagField} class="full-width-slider" />
    </div>

</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .label-row { display: flex; justify-content: space-between; align-items: center; }
  label { color: #ccc; font-size: 0.9em; margin: 0; }
  input[type="number"], select { 
      padding: 4px; background: #444; border: 1px solid #555; 
      color: #eee; border-radius: 3px; width: 100px; text-align: right; 
  }
  select { width: 100%; text-align: left; }
  .full-width-slider { width: 100%; margin: 0; cursor: pointer; }
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }
  .sub-label { font-size: 0.75em; color: #888; text-align: right; }
  
  .color-preview {
      width: 30px; height: 30px;
      border-radius: 50%;
      border: 1px solid #fff;
      flex-shrink: 0;
  }
</style>
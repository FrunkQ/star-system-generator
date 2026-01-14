<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  $: useSolarUnits = body.roleHint === 'star';

  // UI Helpers
  let massValueInternal = 0;   // In Earths (for planets/moons), or Suns (for stars)
  let radiusValueInternal = 0; // In KM (for planets/moons), or Suns Radii (for stars)
  let densityValue = 0;        // g/cm^3

  // --- Mass Slider Config ---
  const massMinEarths = 0.000000001; // Very small for tonnes
  const massMaxEarths = 26000; // ~80 Jupiter masses (Start of M-dwarf stars)
  const massMinSuns = 0.01;
  const massMaxSuns = 100;

  $: currentMassMin = useSolarUnits ? massMinSuns : massMinEarths;
  $: currentMassMax = useSolarUnits ? massMaxSuns : massMaxEarths;
  
  $: massLogMin = Math.log(currentMassMin);
  $: massLogMax = Math.log(currentMassMax);
  let massSliderPos = 0.5;

  // --- Radius Slider Config ---
  const radiusMinKm = 100; // Smallest practical body radius in km
  const radiusMaxEarths = 22 * EARTH_RADIUS_KM; // Max for planets in km
  const radiusMinSuns = 0.1 * SOLAR_RADIUS_KM;
  const radiusMaxSuns = 50 * SOLAR_RADIUS_KM;
  
  $: currentRadiusMin = useSolarUnits ? radiusMinSuns : radiusMinKm;
  $: currentRadiusMax = useSolarUnits ? radiusMaxSuns : radiusMaxEarths;

  $: radiusLogMin = Math.log(currentRadiusMin);
  $: radiusLogMax = Math.log(currentRadiusMax);
  let radiusSliderPos = 0.5;

  // Visual Types
  $: visualTypes = rulePack?.classifier?.planetImages ? Object.keys(rulePack.classifier.planetImages) : [];

  // --- Reactivity: Body -> UI (Update internal values from body prop) ---
  $: if (body.massKg !== undefined) {
      massValueInternal = useSolarUnits ? body.massKg / SOLAR_MASS_KG : body.massKg / EARTH_MASS_KG;
      // Ensure slider position is updated when body.massKg changes externally
      const safeVal = Math.max(currentMassMin, Math.min(currentMassMax, massValueInternal));
      massSliderPos = (Math.log(safeVal) - massLogMin) / (massLogMax - massLogMin);
  }

  $: if (body.radiusKm !== undefined) {
      radiusValueInternal = useSolarUnits ? body.radiusKm / SOLAR_RADIUS_KM : body.radiusKm; // Convert to Suns for stars
      const safeVal = Math.max(currentRadiusMin, Math.min(currentRadiusMax, radiusValueInternal));
      radiusSliderPos = (Math.log(safeVal) - radiusLogMin) / (radiusLogMax - radiusLogMin);
  }

  // --- Mass Display Logic ---
  const massThresholdEarths = 0.001; // Below this, switch to tonnes

  $: displayMassUnit = useSolarUnits ? 'Suns' : ((massValueInternal < massThresholdEarths) ? 'Tonnes' : 'Earths');
  $: displayMassValue = (displayMassUnit === 'Tonnes') 
      ? (body.massKg || 0) / 1000 // kg to tonnes
      : (displayMassUnit === 'Suns' ? massValueInternal : massValueInternal); // MassValueInternal is already in Earths or Suns

  let massInputStep = 0.0001; 
  $: if (displayMassUnit === 'Tonnes') {
      if (displayMassValue < 10) massInputStep = 0.001;
      else if (displayMassValue < 1000) massInputStep = 1;
      else massInputStep = 1000;
  } else {
      massInputStep = 0.0001; // Default for Earth/Sun masses
  }

  // --- Radius Display Logic ---
  $: displayRadiusUnit = useSolarUnits ? 'Suns' : 'km';
  $: displayRadiusValue = useSolarUnits ? radiusValueInternal : radiusValueInternal; // value is in KM or Solar Radii
  let radiusInputStep = 1;
  $: if (useSolarUnits) { radiusInputStep = 0.001; }
  else {
      if (displayRadiusValue < 1000) radiusInputStep = 1;
      else if (displayRadiusValue < 10000) radiusInputStep = 10;
      else radiusInputStep = 100;
  }

  // --- Density Calculation ---
  $: if (body.massKg && body.radiusKm) {
      const massG = body.massKg * 1000;
      const radiusCm = body.radiusKm * 100000;
      const volCm3 = (4/3) * Math.PI * Math.pow(radiusCm, 3);
      densityValue = massG / volCm3;
  }

  // --- Size Category Helper ---
  function getSizeCategory(rKm: number, mKg: number): string {
      const mEarths = mKg / EARTH_MASS_KG;
      if (mEarths > 4000) return "Brown Dwarf";
      if (rKm < 200) return "Moonlet / Asteroid";
      if (rKm < 800) return "Dwarf Planet";
      if (rKm < 2 * EARTH_RADIUS_KM) return "Terrestrial Planet";
      if (rKm < 6 * EARTH_RADIUS_KM) return "Ice Giant / Sub-Neptune";
      return "Gas Giant";
  }
  $: sizeCategory = getSizeCategory(body.radiusKm || 0, body.massKg || 0);

  function updateClassFromSize() {
      const rKm = body.radiusKm || 0;
      const mKg = body.massKg || 0;
      const mEarths = mKg / EARTH_MASS_KG;
      
      let newClass = "";
      let newColor = "";

      if (mEarths > 4000) {
          newClass = "planet/brown-dwarf";
          newColor = "#5d4037"; // Dark Brown
      } else if (rKm < 200) {
          // Moonlet / Asteroid
      } else if (rKm < 800) {
          newClass = "planet/dwarf-planet";
          newColor = "#bdc3c7"; // Grey
      } else if (rKm < 2 * EARTH_RADIUS_KM) {
          newClass = "planet/terrestrial";
          newColor = "#e67e22"; // Orange
      } else if (rKm < 6 * EARTH_RADIUS_KM) {
          newClass = "planet/ice-giant";
          newColor = "#81ecec"; // Light Blue
      } else {
          newClass = "planet/gas-giant";
          newColor = "#e74c3c"; // Red
      }

      if (newClass) {
          if (!body.classes) body.classes = [];
          body.classes[0] = newClass;

          if (!body.tags) body.tags = [];
          const sizeTags = ["planet/dwarf-planet", "planet/terrestrial", "planet/ice-giant", "planet/gas-giant", "planet/brown-dwarf"];
          body.tags = body.tags.filter(t => !sizeTags.includes(t.key));
          body.tags.push({ key: newClass });

          body.color = newColor;

          if (rulePack?.classifier?.planetImages && rulePack.classifier.planetImages[newClass]) {
              if (!body.image) body.image = { url: '' };
              body.image.url = rulePack.classifier.planetImages[newClass];
          }
      }
  }

  // --- Updates ---
  function updateMassFromInput(event: Event) {
      const val = parseFloat((event.target as HTMLInputElement).value);
      if (isNaN(val)) return;

      if (displayMassUnit === 'Tonnes') {
          body.massKg = val * 1000; // Tonnes to kg
      } else if (displayMassUnit === 'Suns') {
          body.massKg = val * SOLAR_MASS_KG;
      } else { // Earths
          body.massKg = val * EARTH_MASS_KG;
      }
      // Update internal mass value for slider to react
      massValueInternal = useSolarUnits ? body.massKg / SOLAR_MASS_KG : body.massKg / EARTH_MASS_KG;
      updateClassFromSize();
      dispatch('update');
  }

  function updateMassFromSlider() {
      const val = Math.exp(massLogMin + (massLogMax - massLogMin) * massSliderPos);
      massValueInternal = parseFloat(val.toPrecision(4));
      body.massKg = massValueInternal * (useSolarUnits ? SOLAR_MASS_KG : EARTH_MASS_KG);
      updateClassFromSize();
      dispatch('update');
  }

  function updateRadiusFromInput(event: Event) {
      const val = parseFloat((event.target as HTMLInputElement).value);
      if (isNaN(val)) return;

      if (useSolarUnits) {
          body.radiusKm = val * SOLAR_RADIUS_KM; // Suns Radii to KM
          radiusValueInternal = val; // Store input in Suns Radii
      } else {
          body.radiusKm = val; // KM
          radiusValueInternal = val; // Store input in KM
      }
      updateClassFromSize();
      dispatch('update');
  }

  function updateRadiusFromSlider() {
      const val = Math.exp(radiusLogMin + (radiusLogMax - radiusLogMin) * radiusSliderPos);
      
      if (useSolarUnits) {
          radiusValueInternal = parseFloat(val.toPrecision(4)); // Store in Suns Radii
          body.radiusKm = radiusValueInternal * SOLAR_RADIUS_KM; // Suns Radii to KM
      } else {
          radiusValueInternal = parseFloat(val.toFixed(0)); // Store in KM
          body.radiusKm = radiusValueInternal; // KM
      }
      updateClassFromSize();
      dispatch('update');
  }

  function updateVisualType(e: Event) {
      const val = (e.target as HTMLSelectElement).value;
      if (!body.classes) body.classes = [];
      body.classes[0] = val;
      if (rulePack?.classifier?.planetImages && rulePack.classifier.planetImages[val]) {
          if (!body.image) body.image = { url: '' };
          body.image.url = rulePack.classifier.planetImages[val];
      }
      dispatch('update');
  }

  function handleUpdate() {
      dispatch('update');
  }
</script>

<div class="tab-panel">
    
    <!-- MASS SECTION -->
    <div class="form-group">
        <div class="label-row">
            <label for="mass">Mass ({displayMassUnit})</label>
            <input type="number" id="mass" step={massInputStep} bind:value={displayMassValue} on:input={updateMassFromInput} />
        </div>
        <input 
            type="range" min="0" max="1" step="0.001" 
            bind:value={massSliderPos} 
            on:input={updateMassFromSlider} 
            class="full-width-slider"
            list="mass-ticks"
        />
        <datalist id="mass-ticks">
            <option value="0" label="{currentMassMin.toPrecision(1)}"></option>
            <option value="0.25"></option>
            <option value="0.5" label="{useSolarUnits ? '1' : '1'}"></option>
            <option value="0.75"></option>
            <option value="1" label="{currentMassMax}"></option>
        </datalist>
        <div class="sub-label">
            <span>{(body.massKg || 0).toExponential(2)} kg</span>
        </div>
    </div>

    <hr/>

    <!-- RADIUS SECTION -->
    <div class="form-group">
        <div class="label-row">
            <label for="radius">Radius ({displayRadiusUnit})</label>
            <input type="number" id="radius" step={radiusInputStep} bind:value={displayRadiusValue} on:input={updateRadiusFromInput} />
        </div>
        <input 
            type="range" min="0" max="1" step="0.001" 
            bind:value={radiusSliderPos} 
            on:input={updateRadiusFromSlider} 
            class="full-width-slider"
            list="radius-ticks"
        />
        <datalist id="radius-ticks">
            <option value="0" label="{Math.round(currentRadiusMin)}"></option>
            <option value="0.33"></option>
            <option value="0.66"></option>
            <option value="1" label="{Math.round(currentRadiusMax)}"></option>
        </datalist>
        <div class="sub-label row-spaced">
            <span>{Math.round(body.radiusKm || 0).toLocaleString()} km</span>
            <span class="category-badge">{sizeCategory}</span>
        </div>
    </div>

    <!-- DENSITY DISPLAY -->
    <div class="form-group density-group">
        <div class="label-row">
            <label>Calculated Density</label>
            <div class="read-only-value">{densityValue.toFixed(2)} g/cm³</div>
        </div>
        <div class="density-bar">
            <!-- Visual indicator of density: 0-15 scale -->
            <div class="density-fill" style="width: {Math.min(100, (densityValue / 15) * 100)}%; background-color: hsl({120 - Math.min(120, (densityValue/8)*120)}, 70%, 50%);"></div>
        </div>
        <div class="sub-label row-spaced">
            <span>Gas/Ice</span>
            <span>Rock</span>
            <span>Iron</span>
        </div>
    </div>

    <hr/>

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

    <hr/>

    <!-- IMAGE SECTION -->
    <div class="form-group">
        <label>Image</label>
        <select value={body.classes?.[0] || 'planet/terrestrial'} on:change={updateVisualType}>
            {#each visualTypes as type}
                <option value={type}>{type.replace('planet/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            {/each}
            {#if visualTypes.length === 0}
                <option disabled>No types loaded (Check RulePack)</option>
            {/if}
        </select>
        <span class="sub-label">Updates planet image only.</span>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .row { display: flex; gap: 10px; }
  .form-group { display: flex; flex-direction: column; flex: 1; gap: 5px; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }

  label { color: #ccc; font-size: 0.9em; margin: 0; }
  
  input[type="number"], select, .read-only-value { 
      padding: 4px; 
      background: #444; 
      border: 1px solid #555; 
      color: #eee; 
      border-radius: 3px; 
      width: 100px;
      text-align: right;
      font-size: 1em;
      box-sizing: border-box;
  }
  
  select { width: 100%; text-align: left; }
  
  .read-only-value {
      background: #333;
      border: 1px solid #444;
      color: #aaa;
      cursor: default;
      font-family: monospace;
  }

  .sub-label { font-size: 0.75em; color: #888; }
  .row-spaced { display: flex; justify-content: space-between; }
  
  .category-badge {
      color: #4da6ff;
      font-weight: bold;
  }

  input[type="checkbox"] { width: auto; margin-right: 5px; }
  
  .full-width-slider {
      width: 100%;
      margin: 0;
      cursor: pointer;
  }
  
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }

  .density-bar {
      width: 100%;
      height: 6px;
      background: #333;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 2px;
  }
  .density-fill {
      height: 100%;
      transition: width 0.3s, background-color 0.3s;
  }
</style>

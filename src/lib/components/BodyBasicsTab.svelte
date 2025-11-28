<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  let useSolarUnits = body.roleHint === 'star';

  // UI Helpers
  let massValue = 0;   // In Earths or Suns
  let radiusValue = 0; // In Earths or Suns
  let densityValue = 0; // g/cm^3

  // --- Mass Slider Config ---
  let massMin = 0.01;
  let massMax = 4130; // ~13 Jupiter masses
  if (useSolarUnits) {
      massMin = 0.01;
      massMax = 100;
  }
  let massLogMin = Math.log(massMin);
  let massLogMax = Math.log(massMax);
  let massSliderPos = 0.5;

  // --- Radius Slider Config ---
  // Min 100km, Max 22 Earth Radii (~140,000 km)
  let radiusMinKm = 100;
  let radiusMaxKm = 22 * EARTH_RADIUS_KM; 
  if (useSolarUnits) {
      radiusMinKm = 0.1 * SOLAR_RADIUS_KM;
      radiusMaxKm = 50 * SOLAR_RADIUS_KM;
  }
  
  // Convert to display units (Earths/Suns) for the slider logic bounds
  let radiusDisplayMin = useSolarUnits ? radiusMinKm / SOLAR_RADIUS_KM : radiusMinKm / EARTH_RADIUS_KM;
  let radiusDisplayMax = useSolarUnits ? radiusMaxKm / SOLAR_RADIUS_KM : radiusMaxKm / EARTH_RADIUS_KM;

  let radiusLogMin = Math.log(radiusDisplayMin);
  let radiusLogMax = Math.log(radiusDisplayMax);
  let radiusSliderPos = 0.5;

  // Visual Types
  $: visualTypes = rulePack?.classifier?.planetImages ? Object.keys(rulePack.classifier.planetImages) : [];

  // --- Reactivity: Body -> UI ---
  $: if (body.massKg !== undefined) {
      massValue = useSolarUnits ? body.massKg / SOLAR_MASS_KG : body.massKg / EARTH_MASS_KG;
      const safeVal = Math.max(massMin, Math.min(massMax, massValue));
      massSliderPos = (Math.log(safeVal) - massLogMin) / (massLogMax - massLogMin);
  }

  $: if (body.radiusKm !== undefined) {
      radiusValue = useSolarUnits ? body.radiusKm / SOLAR_RADIUS_KM : body.radiusKm / EARTH_RADIUS_KM;
      const safeVal = Math.max(radiusDisplayMin, Math.min(radiusDisplayMax, radiusValue));
      radiusSliderPos = (Math.log(safeVal) - radiusLogMin) / (radiusLogMax - radiusLogMin);
  }

  // --- Density Calculation ---
  $: if (body.massKg && body.radiusKm) {
      const massG = body.massKg * 1000;
      const radiusCm = body.radiusKm * 100000;
      const volCm3 = (4/3) * Math.PI * Math.pow(radiusCm, 3);
      densityValue = massG / volCm3;
  }

  // --- Size Category Helper ---
  function getSizeCategory(rKm: number): string {
      if (rKm < 200) return "Moonlet / Asteroid";
      if (rKm < 800) return "Dwarf Planet";
      if (rKm < 2 * EARTH_RADIUS_KM) return "Terrestrial Planet";
      if (rKm < 6 * EARTH_RADIUS_KM) return "Ice Giant / Sub-Neptune";
      return "Gas Giant";
  }
  $: sizeCategory = getSizeCategory(body.radiusKm || 0);

  function updateClassFromSize() {
      const rKm = body.radiusKm || 0;
      let newClass = "";
      let newColor = "";

      if (rKm < 200) {
          // Moonlet / Asteroid
          // Don't force class change for tiny objects as they might be specific?
          // But if we must:
          // newClass = "belt/asteroid"; 
          // newColor = "#95a5a6";
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
          // Update Main Class
          if (!body.classes) body.classes = [];
          body.classes[0] = newClass;

          // Update Tags: Remove conflicting size tags, add new one
          if (!body.tags) body.tags = [];
          const sizeTags = ["planet/dwarf-planet", "planet/terrestrial", "planet/ice-giant", "planet/gas-giant"];
          body.tags = body.tags.filter(t => !sizeTags.includes(t.key));
          body.tags.push({ key: newClass });

          // Update Color
          body.color = newColor;

          // Update Image if available
          if (rulePack?.classifier?.planetImages && rulePack.classifier.planetImages[newClass]) {
              if (!body.image) body.image = { url: '' };
              body.image.url = rulePack.classifier.planetImages[newClass];
          }
      }
  }

  // --- Updates ---
  function updateMass() {
      body.massKg = massValue * (useSolarUnits ? SOLAR_MASS_KG : EARTH_MASS_KG);
      dispatch('update');
  }

  function updateMassFromSlider() {
      const val = Math.exp(massLogMin + (massLogMax - massLogMin) * massSliderPos);
      massValue = parseFloat(val.toPrecision(4));
      updateMass();
  }

  function updateRadius() {
      body.radiusKm = radiusValue * (useSolarUnits ? SOLAR_RADIUS_KM : EARTH_RADIUS_KM);
      updateClassFromSize(); // Trigger class update on manual radius change
      dispatch('update');
  }

  function updateRadiusFromSlider() {
      const val = Math.exp(radiusLogMin + (radiusLogMax - radiusLogMin) * radiusSliderPos);
      radiusValue = parseFloat(val.toPrecision(4));
      updateRadius(); // This calls updateClassFromSize inside
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
            <label for="mass">Mass ({useSolarUnits ? 'Suns' : 'Earths'})</label>
            <input type="number" id="mass" step="0.0001" bind:value={massValue} on:input={updateMass} />
        </div>
        <input 
            type="range" min="0" max="1" step="0.001" 
            bind:value={massSliderPos} 
            on:input={updateMassFromSlider} 
            class="full-width-slider"
            list="mass-ticks"
        />
        <datalist id="mass-ticks">
            <option value="0" label="{massMin}"></option>
            <option value="0.25"></option>
            <option value="0.5" label="1"></option>
            <option value="0.75"></option>
            <option value="1" label="{massMax}"></option>
        </datalist>
        <div class="sub-label">
            <span>{(body.massKg || 0).toExponential(2)} kg</span>
        </div>
    </div>

    <hr/>

    <!-- RADIUS SECTION -->
    <div class="form-group">
        <div class="label-row">
            <label for="radius">Radius ({useSolarUnits ? 'Suns' : 'Earths'})</label>
            <input type="number" id="radius" step="0.0001" bind:value={radiusValue} on:input={updateRadius} />
        </div>
        <input 
            type="range" min="0" max="1" step="0.001" 
            bind:value={radiusSliderPos} 
            on:input={updateRadiusFromSlider} 
            class="full-width-slider"
            list="radius-ticks"
        />
        <datalist id="radius-ticks">
            <option value="0"></option>
            <option value="0.33"></option>
            <option value="0.66"></option>
            <option value="1"></option>
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

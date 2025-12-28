<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { AU_KM, EARTH_MASS_KG } from '$lib/constants';

  let { body } = $props();

  const dispatch = createEventDispatcher();

  // --- State ---
  let beltInnerAu = $state(0);
  let beltOuterAu = $state(0);
  let eccentricity = $state(0);
  let eccentricityAngle = $state(0);
  let densitySlider = $state(0);

  // --- Dimensions ---
  $effect(() => {
      if (body) {
          if (body.radiusInnerKm) {
              const inAu = body.radiusInnerKm / AU_KM;
              if (Math.abs(inAu - beltInnerAu) > 0.001) beltInnerAu = inAu;
          }
          if (body.radiusOuterKm) {
              const outAu = body.radiusOuterKm / AU_KM;
              if (Math.abs(outAu - beltOuterAu) > 0.001) beltOuterAu = outAu;
          }
          if (body.orbit) {
              eccentricity = body.orbit.elements.e || 0;
              eccentricityAngle = body.orbit.elements.omega_deg || 0;
          }
          
          // Sync Density
          const massEarths = body.massKg ? body.massKg / EARTH_MASS_KG : 0;
          const minMass = 0.00001;
          const maxMass = 1.0;
          const minLog = Math.log(minMass);
          const maxLog = Math.log(maxMass);
          if (massEarths > 0) {
              const val = (Math.log(Math.max(minMass, Math.min(maxMass, massEarths))) - minLog) / (maxLog - minLog);
              if (Math.abs(val - densitySlider) > 0.01) densitySlider = val;
          }
      }
  });
  
  function updateBeltDimensions() {
      if (beltInnerAu > beltOuterAu) {
          beltInnerAu = beltOuterAu - 0.01;
      }
      body.radiusInnerKm = beltInnerAu * AU_KM;
      body.radiusOuterKm = beltOuterAu * AU_KM;
      
      if (body.orbit) {
          body.orbit.elements.a_AU = (beltInnerAu + beltOuterAu) / 2;
      }
      dispatch('update');
  }

  function updateEccentricity() {
      if (body.orbit) {
          body.orbit.elements.e = parseFloat(eccentricity.toFixed(3));
          dispatch('update');
      }
  }

  function updateEccentricityAngle() {
      if (body.orbit) {
          body.orbit.elements.omega_deg = Math.round(eccentricityAngle);
          dispatch('update');
      }
  }

  function updateDensity() {
      const minMass = 0.00001 * EARTH_MASS_KG;
      const maxMass = 1.0 * EARTH_MASS_KG;
      const minLog = Math.log(minMass);
      const maxLog = Math.log(maxMass);
      const newMass = Math.exp(minLog + (maxLog - minLog) * densitySlider);
      body.massKg = newMass;
      dispatch('update');
  }

  // --- Derived ---
  let densityLabel = $derived.by(() => {
      const val = densitySlider;
      if (val < 0.2) return "Sparse (Navigation Trivial)";
      if (val < 0.4) return "Light (Standard)";
      if (val < 0.6) return "Moderate (Minor Hazards)";
      if (val < 0.8) return "Dense (Navigation Hazard)";
      return "Ultra-Dense (Deadly)";
  });

  let densityColor = $derived.by(() => {
      const hue = 120 - (densitySlider * 120);
      return `hsl(${hue}, 80%, 45%)`;
  });

</script>

<div class="tab-panel">
    <!-- DIMENSIONS -->
    <div class="section-header">Dimensions</div>
    
    <div class="form-group">
        <div class="label-row">
            <label>Inner Radius (AU)</label>
            <input type="number" step="0.01" bind:value={beltInnerAu} on:input={updateBeltDimensions} />
        </div>
        <input type="range" min="0.01" max="50" step="0.01" bind:value={beltInnerAu} on:input={updateBeltDimensions} class="full-width-slider" />
    </div>
    
    <div class="form-group">
        <div class="label-row">
            <label>Outer Radius (AU)</label>
            <input type="number" step="0.01" bind:value={beltOuterAu} on:input={updateBeltDimensions} />
        </div>
        <input type="range" min="0.01" max="50" step="0.01" bind:value={beltOuterAu} on:input={updateBeltDimensions} class="full-width-slider" />
    </div>

    <!-- ORBITAL SHAPE -->
    <div class="section-header">Shape</div>
    <div class="row-split">
        <div class="form-group">
            <div class="label-row">
                <label>Eccentricity ({eccentricity.toFixed(3)})</label>
                <input type="number" step="0.001" min="0" max="0.99" bind:value={eccentricity} on:input={updateEccentricity} />
            </div>
            <input type="range" min="0" max="0.9" step="0.001" bind:value={eccentricity} on:input={updateEccentricity} class="full-width-slider" />
        </div>
        <div class="form-group">
            <div class="label-row">
                <label>Arg. Periapsis ({eccentricityAngle}°)</label>
                <input type="number" step="1" min="0" max="360" bind:value={eccentricityAngle} on:input={updateEccentricityAngle} />
            </div>
            <input type="range" min="0" max="360" step="1" bind:value={eccentricityAngle} on:input={updateEccentricityAngle} class="full-width-slider" />
        </div>
    </div>

    <!-- DENSITY -->
    <div class="section-header">Composition</div>
    <div class="form-group">
        <div class="label-row">
            <label>Density / Hazard Level</label>
            <span style="color: {densityColor}; font-weight: bold; font-size: 0.9em;">{densityLabel}</span>
        </div>
        <input 
            type="range" min="0" max="1" step="0.01" 
            bind:value={densitySlider} 
            on:input={updateDensity} 
            class="full-width-slider density-slider"
            style="--thumb-color: {densityColor};"
        />
        <!-- Visual Bar -->
        <div class="density-bar">
            <div class="density-fill" style="width: {densitySlider * 100}%; background-color: {densityColor};"></div>
        </div>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .section-header {
      font-size: 0.8em;
      text-transform: uppercase;
      color: #888;
      border-bottom: 1px solid #444;
      padding-bottom: 2px;
      margin-top: 5px;
  }
  .form-group { display: flex; flex-direction: column; gap: 5px; flex: 1; }
  .row-split { display: flex; gap: 10px; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  label { color: #ccc; font-size: 0.9em; margin: 0; }
  
  input[type="number"] { 
      padding: 4px; 
      background: #444; 
      border: 1px solid #555; 
      color: #eee; 
      border-radius: 3px; 
      width: 80px;
      text-align: right;
  }

  .full-width-slider {
      width: 100%;
      margin: 0;
      cursor: pointer;
  }
  
  .density-bar {
      width: 100%;
      height: 8px;
      background: #222;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #444;
  }
  .density-fill {
      height: 100%;
      transition: width 0.2s, background-color 0.2s;
  }
</style>
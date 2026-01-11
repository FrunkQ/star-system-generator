<script lang="ts">
  import { untrack, createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { AU_KM, EARTH_MASS_KG } from '$lib/constants';

  import { calculateAllStellarZones } from '$lib/physics/zones';

  let { body, parentBody } = $props();

  const dispatch = createEventDispatcher();

  // --- State ---
  let beltInnerAu = $state(0);
  let beltOuterAu = $state(0);
  let ringInnerKm = $state(0);
  let ringOuterKm = $state(0);
  let eccentricity = $state(0);
  let eccentricityAngle = $state(0);
  let densitySlider = $state(0);

  // Raw slider positions (0-1)
  let innerSliderPos = $state(0);
  let outerSliderPos = $state(0);

  let isRing = $derived(body.roleHint === 'ring');
  
  // Log Configs
  const auMin = 0.001;
  let auMax = $derived.by(() => {
      if (!parentBody) return 10000;
      if (parentBody.roleHint === 'star') {
          // Base it on the star's physical reach
          const zones = calculateAllStellarZones(parentBody);
          return Math.max(2000, Math.ceil(zones.systemLimitAu * 5)); 
      }
      if (parentBody.kind === 'barycenter') {
          return 100000; // wide binaries
      }
      return 1000;
  });

  const auLogMin = Math.log(auMin);
  let auLogMax = $derived(Math.log(auMax));

  const kmMin = 100;
  // Calculate Parent SOI (Sphere of Influence / Hill Sphere) in KM
  let parentSoiKm = $derived.by(() => {
      if (!parentBody) return 1000 * AU_KM;
      
      const m = (parentBody.kind === 'body' ? (parentBody as CelestialBody).massKg : (parentBody as any).effectiveMassKg) || 0;
      if (m <= 0) return 1000 * AU_KM;

      if (parentBody.orbit) {
          const a = parentBody.orbit.elements.a_AU * AU_KM;
          // Standard Hill Sphere: a * (m / 3M)^(1/3)
          // We assume host is Sun-like for UI limits if not easily available
          const hostMass = 1.989e30; 
          return a * Math.pow(m / (3 * hostMass), 1/3);
      } else {
          // System root
          return 1000 * AU_KM; 
      }
  });

  let kmLogMin = Math.log(kmMin);
  let kmLogMax = $derived(Math.log(Math.max(1000, parentSoiKm)));

  // --- Sync: Body -> UI (Only on body change) ---
  $effect(() => {
      const _id = body.id; 
      
      untrack(() => {
          if (body.radiusInnerKm) {
              beltInnerAu = body.radiusInnerKm / AU_KM;
              ringInnerKm = body.radiusInnerKm;
              
              // Initial Slider Positions
              if (isRing) {
                  innerSliderPos = (Math.log(Math.max(kmMin, ringInnerKm)) - kmLogMin) / (kmLogMax - kmLogMin);
              } else {
                  innerSliderPos = (Math.log(Math.max(auMin, beltInnerAu)) - auLogMin) / (auLogMax - auLogMin);
              }
          }
          if (body.radiusOuterKm) {
              beltOuterAu = body.radiusOuterKm / AU_KM;
              ringOuterKm = body.radiusOuterKm;

              if (isRing) {
                  outerSliderPos = (Math.log(Math.max(kmMin, ringOuterKm)) - kmLogMin) / (kmLogMax - kmLogMin);
              } else {
                  outerSliderPos = (Math.log(Math.max(auMin, beltOuterAu)) - auLogMin) / (auLogMax - auLogMin);
              }
          }
          if (body.orbit) {
              eccentricity = body.orbit.elements.e || 0;
              eccentricityAngle = body.orbit.elements.omega_deg || 0;
          }
          
          const massEarths = body.massKg ? body.massKg / EARTH_MASS_KG : 0;
          const minMass = 0.00001;
          const maxMass = 1.0;
          const minLog = Math.log(minMass);
          const maxLog = Math.log(maxMass);
          if (massEarths > 0) {
              densitySlider = (Math.log(Math.max(minMass, Math.min(maxMass, massEarths))) - minLog) / (maxLog - minLog);
          } else {
              densitySlider = 0;
          }
      });
  });
  
  function updateBeltDimensions() {
      // Linear number inputs still work and update log sliders
      beltInnerAu = Math.max(auMin, beltInnerAu);
      beltOuterAu = Math.max(auMin, beltOuterAu);
      
      if (beltInnerAu >= beltOuterAu) {
          beltOuterAu = beltInnerAu + 0.01;
      }
      
      innerSliderPos = (Math.log(beltInnerAu) - auLogMin) / (auLogMax - auLogMin);
      outerSliderPos = (Math.log(beltOuterAu) - auLogMin) / (auLogMax - auLogMin);

      applyBeltToData();
  }

  function handleBeltSlider() {
      beltInnerAu = Math.exp(auLogMin + (auLogMax - auLogMin) * innerSliderPos);
      beltOuterAu = Math.exp(auLogMin + (auLogMax - auLogMin) * outerSliderPos);
      
      if (beltInnerAu >= beltOuterAu) {
          beltOuterAu = beltInnerAu + 0.01;
          outerSliderPos = (Math.log(beltOuterAu) - auLogMin) / (auLogMax - auLogMin);
      }
      
      applyBeltToData();
  }

  function applyBeltToData() {
      body.radiusInnerKm = beltInnerAu * AU_KM;
      body.radiusOuterKm = beltOuterAu * AU_KM;
      if (body.orbit) {
          body.orbit.elements.a_AU = (beltInnerAu + beltOuterAu) / 2;
      }
      dispatch('update');
  }

  function updateRingDimensions() {
      ringInnerKm = Math.max(kmMin, ringInnerKm);
      ringOuterKm = Math.max(kmMin, ringOuterKm);

      if (ringInnerKm >= ringOuterKm) {
          ringOuterKm = ringInnerKm + 100;
      }

      innerSliderPos = (Math.log(ringInnerKm) - kmLogMin) / (kmLogMax - kmLogMin);
      outerSliderPos = (Math.log(ringOuterKm) - kmLogMin) / (kmLogMax - kmLogMin);

      applyRingToData();
  }

  function handleRingSlider() {
      ringInnerKm = Math.exp(kmLogMin + (kmLogMax - kmLogMin) * innerSliderPos);
      ringOuterKm = Math.exp(kmLogMin + (kmLogMax - kmLogMin) * outerSliderPos);

      if (ringInnerKm >= ringOuterKm) {
          ringOuterKm = ringInnerKm + 100;
          outerSliderPos = (Math.log(ringOuterKm) - kmLogMin) / (kmLogMax - kmLogMin);
      }

      applyRingToData();
  }

  function applyRingToData() {
      body.radiusInnerKm = Math.round(ringInnerKm);
      body.radiusOuterKm = Math.round(ringOuterKm);
      if (body.orbit) {
          body.orbit.elements.a_AU = (body.radiusInnerKm + body.radiusOuterKm) / 2 / AU_KM;
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
    
    {#if !isRing}
        <!-- BELT (AU) -->
        <div class="form-group">
            <div class="label-row">
                <label>Inner Radius (AU)</label>
                <input type="number" step="0.01" bind:value={beltInnerAu} on:input={updateBeltDimensions} />
            </div>
            <input type="range" min="0" max="1" step="0.001" bind:value={innerSliderPos} on:input={handleBeltSlider} class="full-width-slider" />
        </div>
        
        <div class="form-group">
            <div class="label-row">
                <label>Outer Radius (AU)</label>
                <input type="number" step="0.01" bind:value={beltOuterAu} on:input={updateBeltDimensions} />
            </div>
            <input type="range" min="0" max="1" step="0.001" bind:value={outerSliderPos} on:input={handleBeltSlider} class="full-width-slider" />
        </div>
    {:else}
        <!-- RING (KM) -->
        <div class="form-group">
            <div class="label-row">
                <label>Inner Radius (km)</label>
                <input type="number" step="100" bind:value={ringInnerKm} on:input={updateRingDimensions} />
            </div>
            <input type="range" min="0" max="1" step="0.001" bind:value={innerSliderPos} on:input={handleRingSlider} class="full-width-slider" />
        </div>
        
        <div class="form-group">
            <div class="label-row">
                <label>Outer Radius (km)</label>
                <input type="number" step="100" bind:value={ringOuterKm} on:input={updateRingDimensions} />
            </div>
            <input type="range" min="0" max="1" step="0.001" bind:value={outerSliderPos} on:input={handleRingSlider} class="full-width-slider" />
            <div class="sub-label">Parent Hill Sphere: {Math.round(parentSoiKm).toLocaleString()} km</div>
        </div>
    {/if}

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
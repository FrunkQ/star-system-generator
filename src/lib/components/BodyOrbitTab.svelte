<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { calculateAllStellarZones, calculateRocheLimit } from '$lib/physics/zones';
  import { AU_KM } from '$lib/constants';
  import OrbitalSlider from './OrbitalSlider.svelte';

  export let body: CelestialBody;
  export let parentBody: CelestialBody | null = null;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  let a_AU = 0;
  let a_slider = 0; // 0 to 1 linear representation of log scale
  let e = 0;
  let i_deg = 0;
  let omega_deg = 0;
  let Omega_deg = 0;
  let M0_deg = 0;

  let minA = 0.01;
  let maxA = 100;
  let stepA = 0.01;

  let showAdvancedOrbit = false; 
  let zones: any = null;
  let minSafePeriapsisAU = 0;
  let safeMaxE = 0.999;

  function init() {
      if (body.roleHint === 'moon') {
          minA = 0.00001;
          maxA = 0.05;
          stepA = 0.00001;
      } else {
          minA = 0.01;
          stepA = 0.001;
          
          // Determine dynamic maxA
          if (parentBody) {
              if (parentBody.roleHint === 'star') {
                  const sz = calculateAllStellarZones(parentBody);
                  // Allow planets up to 2x system limit, belts up to 10x
                  const multiplier = (body.roleHint === 'belt') ? 10 : 2;
                  maxA = Math.max(500, Math.ceil(sz.systemLimitAu * multiplier));
              } else if (parentBody.kind === 'barycenter') {
                  maxA = 100000; // Wide binaries / systems
              } else {
                  maxA = 1000;
              }
          } else {
              maxA = 1000;
          }
      }

      if (body.orbit) {
          a_AU = body.orbit.elements.a_AU;
          // Initialize slider from real value
          updateSliderFromReal();
          
          e = body.orbit.elements.e;
          i_deg = body.orbit.elements.i_deg;
          omega_deg = body.orbit.elements.omega_deg || 0;
          Omega_deg = body.orbit.elements.Omega_deg || 0;
          M0_deg = (body.orbit.elements.M0_rad || 0) * (180 / Math.PI);
      }

      calculateZones();
  }

  function calculateZones() {
      zones = null;
      if (parentBody && parentBody.kind === 'body' && parentBody.roleHint === 'star') {
          zones = calculateAllStellarZones(parentBody, rulePack || undefined);
          // Add Roche Limit manually as it's calculated differently
          if (zones) {
              zones.rocheLimit = calculateRocheLimit(parentBody);
          }
      }
      // Could add planetary zones here later if needed
  }

  $: if (body) init();
  $: if (parentBody) calculateZones();

  function updateSliderFromReal() {
      // a_AU -> slider (0-1)
      const safeA = Math.max(a_AU, minA);
      const minLog = Math.log(minA);
      const maxLog = Math.log(maxA);
      a_slider = (Math.log(safeA) - minLog) / (maxLog - minLog);
  }

  function updateRealFromSlider() {
      // slider -> a_AU
      const minLog = Math.log(minA);
      const maxLog = Math.log(maxA);
      const val = Math.exp(minLog + (maxLog - minLog) * a_slider);
      a_AU = parseFloat(val.toFixed(5)); // Round to reasonable precision
      updateOrbit();
  }
  
  function handleOrbitalSliderInput(event: CustomEvent<number>) {
      a_AU = event.detail;
      updateSliderFromReal(); // Sync the internal 0-1 slider just in case
      updateOrbit();
  }

  function handleNumberInput() {
      updateSliderFromReal();
      updateOrbit();
  }

  function updateOrbit() {
      if (!body.orbit) return;
      const boundedE = Math.max(0, Math.min(e, safeMaxE));
      if (Math.abs(boundedE - e) > 1e-9) {
          e = parseFloat(boundedE.toFixed(3));
      }
      body.orbit.elements.a_AU = a_AU;
      body.orbit.elements.e = e;
      body.orbit.elements.i_deg = i_deg;
      body.orbit.elements.omega_deg = omega_deg;
      body.orbit.elements.Omega_deg = Omega_deg;
      body.orbit.elements.M0_rad = M0_deg * (Math.PI / 180);
      dispatch('update');
  }

  function calculateMinSafePeriapsisAU(): number {
      if (!parentBody || !parentBody.radiusKm) return 0;
      const baseSafeKm = parentBody.radiusKm + 50;
      const leoSafeKm = parentBody.orbitalBoundaries?.minLeoKm
          ? parentBody.radiusKm + parentBody.orbitalBoundaries.minLeoKm
          : 0;
      const safeKm = Math.max(baseSafeKm, leoSafeKm);
      return safeKm / AU_KM;
  }

  $: peri = a_AU * (1 - e);
  $: aph = a_AU * (1 + e);
  $: minSafePeriapsisAU = calculateMinSafePeriapsisAU();
  $: safeMaxE = a_AU > 0 ? Math.max(0, Math.min(0.999, 1 - (minSafePeriapsisAU / a_AU))) : 0.999;
  $: rangeText = body.roleHint === 'moon' 
      ? `Range: ${(peri * 149597870.7).toLocaleString(undefined, {maximumFractionDigits:0})} - ${(aph * 149597870.7).toLocaleString(undefined, {maximumFractionDigits:0})} km`
      : `Range: ${peri.toFixed(3)} - ${aph.toFixed(3)} AU`;
</script>

<div class="tab-panel">
    {#if !body.orbit}
        <p>This body has no orbit (it might be the central star).</p>
    {:else}
        <div class="form-group">
            <div class="label-row">
                <label>Semi-Major Axis (AU)</label>
                <input type="number" step={stepA} bind:value={a_AU} on:input={handleNumberInput} />
            </div>
            <div class="info-row" style="font-size: 0.8em; color: #888; margin-bottom: 4px;">{rangeText}</div>
            <!-- Custom Orbital Slider -->
            <div class="full-width-slider">
                <OrbitalSlider value={a_AU} min={minA} max={maxA} {zones} on:input={handleOrbitalSliderInput} />
            </div>
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Eccentricity</label>
                <input type="number" step="0.001" min="0" max={safeMaxE.toFixed(3)} bind:value={e} on:input={updateOrbit} />
            </div>
            <input type="range" min="0" max={safeMaxE} step="0.001" bind:value={e} on:input={updateOrbit} class="full-width-slider" />
            <div
                class="info-row"
                title="Max eccentricity is limited so periapsis stays above the host's safe altitude (radius + minimum low-orbit floor)."
            >
                Max allowed here: {safeMaxE.toFixed(3)}
            </div>
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Argument of Periapsis (°)</label>
                <input type="number" step="1" min="0" max="360" bind:value={omega_deg} on:input={updateOrbit} />
            </div>
            <input type="range" min="0" max="360" step="1" bind:value={omega_deg} on:input={updateOrbit} class="full-width-slider" />
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Mean Anomaly (°)</label>
                <input type="number" step="1" min="0" max="360" bind:value={M0_deg} on:input={updateOrbit} />
            </div>
            <input type="range" min="0" max="360" step="1" bind:value={M0_deg} on:input={updateOrbit} class="full-width-slider" />
        </div>

        <hr />

        <div class="form-group checkbox-row">
            <input type="checkbox" id="retrograde" 
                checked={body.orbit.isRetrogradeOrbit} 
                on:change={(e) => {
                    const isRetro = e.currentTarget.checked;
                    body.orbit.isRetrogradeOrbit = isRetro;
                    
                    if (!body.tags) body.tags = [];
                    
                    if (isRetro) {
                        if (!body.tags.some(t => t.key === 'Retrograde Orbit')) body.tags.push({ key: 'Retrograde Orbit' });
                        if (!body.tags.some(t => t.key === 'Captured Body')) body.tags.push({ key: 'Captured Body' });
                    } else {
                        body.tags = body.tags.filter(t => t.key !== 'Retrograde Orbit' && t.key !== 'Captured Body');
                    }
                    dispatch('update');
                }} 
            />
            <label for="retrograde">Retrograde Orbit</label>
        </div>

        <div class="form-group checkbox-row">
            <input type="checkbox" id="showAdv" bind:checked={showAdvancedOrbit} />
            <label for="showAdv">Show Advanced Orbital Elements</label>
        </div>

        {#if showAdvancedOrbit}
            <div class="form-group">
                <div class="label-row">
                    <label>Inclination (°)</label>
                    <input type="number" step="0.1" min="0" max="180" bind:value={i_deg} on:input={updateOrbit} />
                </div>
                <input type="range" min="0" max="180" step="0.1" bind:value={i_deg} on:input={updateOrbit} class="full-width-slider" />
            </div>

            <div class="form-group">
                <div class="label-row">
                    <label>Long. of Asc. Node (°)</label>
                    <input type="number" step="1" min="0" max="360" bind:value={Omega_deg} on:input={updateOrbit} />
                </div>
                <input type="range" min="0" max="360" step="1" bind:value={Omega_deg} on:input={updateOrbit} class="full-width-slider" />
            </div>
        {/if}
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  label { color: #ccc; font-size: 0.9em; }
  
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
  }
  .full-width-slider input { width: 100%; }
  .info-row {
      font-size: 0.8em;
      color: #888;
      margin-top: 4px;
  }

  .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 10px;
  }
  .checkbox-row label { margin: 0; }
  
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }
</style>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let body: CelestialBody;

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

  function init() {
      if (body.roleHint === 'moon') {
          minA = 0.00001;
          maxA = 0.05;
          stepA = 0.00001;
      } else if (body.roleHint === 'star' || body.kind === 'barycenter') {
          minA = 0.01;
          maxA = 1000;
          stepA = 0.01;
      } else {
          // Planet/Belt
          minA = 0.01;
          maxA = 150;
          stepA = 0.001;
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
  }

  $: if (body) init();

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

  function handleNumberInput() {
      updateSliderFromReal();
      updateOrbit();
  }

  function updateOrbit() {
      if (!body.orbit) return;
      body.orbit.elements.a_AU = a_AU;
      body.orbit.elements.e = e;
      body.orbit.elements.i_deg = i_deg;
      body.orbit.elements.omega_deg = omega_deg;
      body.orbit.elements.Omega_deg = Omega_deg;
      body.orbit.elements.M0_rad = M0_deg * (Math.PI / 180);
      dispatch('update');
  }
</script>

<div class="tab-panel">
    {#if !body.orbit}
        <p>This body has no orbit (it might be the central star).</p>
    {:else}
        <div class="form-group">
            <label>Semi-Major Axis (AU)</label>
            <div class="input-row">
                <input type="range" min="0" max="1" step="0.001" bind:value={a_slider} on:input={updateRealFromSlider} />
                <input type="number" step={stepA} bind:value={a_AU} on:input={handleNumberInput} style="width: 80px;" />
            </div>
        </div>

        <div class="form-group">
            <label>Eccentricity ({e.toFixed(3)})</label>
            <input type="range" min="0" max="0.99" step="0.001" bind:value={e} on:input={updateOrbit} />
        </div>

        <div class="form-group">
            <label>Inclination ({i_deg.toFixed(1)}°)</label>
            <input type="range" min="0" max="180" step="0.1" bind:value={i_deg} on:input={updateOrbit} />
        </div>

        <div class="form-group">
            <label>Arg. of Periapsis ({omega_deg.toFixed(0)}°)</label>
            <input type="range" min="0" max="360" step="1" bind:value={omega_deg} on:input={updateOrbit} />
        </div>

        <div class="form-group">
            <label>Long. of Asc. Node ({Omega_deg.toFixed(0)}°)</label>
            <input type="range" min="0" max="360" step="1" bind:value={Omega_deg} on:input={updateOrbit} />
        </div>

        <div class="form-group">
            <label>Mean Anomaly ({M0_deg.toFixed(0)}°)</label>
            <input type="range" min="0" max="360" step="1" bind:value={M0_deg} on:input={updateOrbit} />
        </div>
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  .input-row { display: flex; gap: 10px; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input[type="range"] { flex-grow: 1; }
  input[type="number"] { padding: 4px; background: #444; border: 1px solid #555; color: #eee; border-radius: 3px; }
</style>

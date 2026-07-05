<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter, RulePack } from '$lib/types';
  import { calculateEquilibriumTemperature, estimateBondAlbedo, estimateInternalHeatK, composeSurfaceTemperatureFromDeltaComponents } from '$lib/physics/temperature';
  import { fmt } from '$lib/stores';

  export let body: CelestialBody;
  export let rulePack: RulePack;
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
      return calculateEquilibriumTemperature(body, nodes, estimateBondAlbedo(body));
  }

  function updateTotal() {
      if (body.roleHint === 'star') {
          dispatch('update');
          return;
      }

      // Ensure defaults are set if undefined, but only when updating (radiogenic is editable)
      if (body.radiogenicHeatK === undefined) body.radiogenicHeatK = 0;

      // Greenhouse and Tidal are derived, but we need to ensure the props exist for display.
      if (body.greenhouseTempK === undefined) body.greenhouseTempK = 0;
      if (body.tidalHeatK === undefined) body.tidalHeatK = 0;
      body.internalHeatK = estimateInternalHeatK(body, rulePack);

      const eq = calculateEquilibrium();
      const newTemp = composeSurfaceTemperatureFromDeltaComponents(
          eq,
          body.greenhouseTempK || 0,
          body.tidalHeatK || 0,
          body.radiogenicHeatK || 0,
          body.internalHeatK || 0
      );
      
      // Only dispatch if values actually changed to avoid loops
      if (Math.abs(eq - (body.equilibriumTempK || 0)) > 0.1 || Math.abs(newTemp - (body.temperatureK || 0)) > 0.1) {
          body.equilibriumTempK = eq;
          body.temperatureK = newTemp;
          dispatch('update');
      }
  }
  
  function getTempColor(kelvin: number) {
      const celsius = kelvin - 273.15;
      if (celsius >= -10 && celsius <= 40) return 'var(--temp-habitable)';
      if (celsius >= -30 && celsius < -10) return 'var(--temp-cold)';
      if (celsius > 40 && celsius <= 89) return 'var(--temp-warm)';
      return 'var(--temp-hot)';
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
            <span class="sub-label">{$fmt.tempK(body.temperatureK || 0)}</span>
        </div>
    {:else}
        <div class="read-only-row">
            <label>Equilibrium Temp (Solar Heating)</label>
            <span class="value">{Math.round(body.equilibriumTempK || 0)} K ({$fmt.tempK(body.equilibriumTempK || 0)})</span>
        </div>
        
        {#if body.albedoBreakdown}
            {@const ab = body.albedoBreakdown}
            <div class="read-only-row">
                <label>Bond Albedo <span class="derived-pill" title="Reflectivity is derived from the surface makeup and the cloud decks that condense at this temperature — tweak the makeup / atmosphere / water and it follows.">derived</span></label>
                <span class="value">{ab.albedo}</span>
            </div>
            <div class="albedo-note">
                {#if ab.cloudCover > 0}
                    {Math.round(ab.cloudCover * 100)}% {ab.cloudSpecies || 'cloud'} cloud (albedo {ab.cloudAlbedo}) over a surface of {ab.surfaceAlbedo}.
                {:else}
                    Cloud-free surface, reflectivity {ab.surfaceAlbedo}.
                {/if}
            </div>
        {:else}
            <div class="read-only-row">
                <label>Bond Albedo</label>
                <span class="value">{(body.albedo ?? 0).toFixed(2)}</span>
            </div>
        {/if}

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

        <div class="read-only-row">
            <label>Internal Heat (+K)</label>
            <span class="value">{Math.round(body.internalHeatK || 0)} K</span>
        </div>

        <div class="form-group">
            <label>Radiogenic Heating (+K)</label>
            <div class="input-row">
                <input type="range" min="0" max="40" step="1" bind:value={body.radiogenicHeatK} on:input={updateTotal} on:change={() => dispatch('update')} />
                <input type="number" step="1" bind:value={body.radiogenicHeatK} on:input={updateTotal} on:change={() => dispatch('update')} style="width: 60px;" />
            </div>
        </div>
        
        <hr />
        
        <div class="read-only-row highlight">
            <label>Mean Surface Temperature</label>
            <span class="value large" style="color: {getTempColor(body.temperatureK || 0)}">
                {Math.round(body.temperatureK || 0)} K ({$fmt.tempK(body.temperatureK || 0)})
            </span>
        </div>

        {#if body.temperatureProfile && (body.temperatureProfile.totalMaxK - body.temperatureProfile.totalMinK) > 5}
            {@const p = body.temperatureProfile}
            <div class="read-only-row">
                <label>Total Range (coldest → hottest)</label>
                <span class="value">
                    <span style="color: {getTempColor(p.totalMinK)}">{p.totalMinK} K</span>
                    &nbsp;–&nbsp;
                    <span style="color: {getTempColor(p.totalMaxK)}">{p.totalMaxK} K</span>
                </span>
            </div>
            {#each p.components as c}
                <div class="comp-row" class:volcanic={c.source === 'tidal-hotspot'}>
                    <span class="comp-label">{c.label}</span>
                    <span class="comp-range">
                        <span style="color: {getTempColor(c.lowK)}">{c.lowK}</span>–<span style="color: {getTempColor(c.highK)}">{c.highK}</span> K
                    </span>
                </div>
            {/each}
            <div class="range-note">
                The mean averages heat over the whole body; each source above is the swing it alone
                would add. The total is the combined extreme (pole + winter + night ↔ equator + summer + day, or a tidal hotspot).
            </div>
        {/if}
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  .input-row { display: flex; gap: 10px; }
  label { margin-bottom: 5px; color: var(--text-muted); font-size: 0.9em; }
  input { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  input[type="range"] { flex-grow: 1; }

  .sub-label { font-size: 0.8em; color: var(--text-faint); text-align: right; margin-top: 2px; }

  .read-only-row {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--bg-panel); padding: 10px; border-radius: 4px;
  }
  .read-only-row.highlight { background: var(--bg-control); border: 1px solid var(--border); }
  .value { color: var(--text); font-weight: bold; }
  .value.large { font-size: 1.2em; }

  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 0; }
  .range-note { font-size: 0.8em; color: var(--text-faint); line-height: 1.4; margin-top: -6px; }
  .range-note.volcanic { color: var(--warning, #e08a4a); font-weight: 600; margin-top: 0; }
  .comp-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 3px 10px; font-size: 0.85em; color: var(--text-muted); }
  .comp-row.volcanic .comp-label { color: var(--warning, #e08a4a); }
  .comp-range { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .albedo-note { font-size: 0.78em; color: var(--text-faint); line-height: 1.4; margin-top: -4px; }
  .derived-pill { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; margin-left: 4px; cursor: help; }
</style>

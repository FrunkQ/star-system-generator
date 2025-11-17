<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';

  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;

  let specs: ConstructSpecs | null = null;

  $: {
    if (construct && rulePack.engineDefinitions && rulePack.fuelDefinitions) {
      specs = calculateFullConstructSpecs(
        construct,
        rulePack.engineDefinitions.entries,
        rulePack.fuelDefinitions.entries,
        hostBody
      );
    } else {
      specs = null;
    }
  }
</script>

{#if specs}
  <div class="derived-specs">
    <h4>Derived Specifications</h4>
    <div class="specs-grid">
      <div class="spec-item">
        <span class="label">Orbit</span>
        <span class="value">{specs.orbit_string}</span>
      </div>
      <div class="spec-item">
        <span class="label">Total Mass</span>
        <span class="value">{specs.totalMass_tonnes.toLocaleString(undefined, {maximumFractionDigits: 0})} tonnes</span>
      </div>
      <div class="spec-item">
        <span class="label">Max Vacuum Accel.</span>
        <span class="value">{specs.maxVacuumG.toFixed(2)} G</span>
      </div>
      <div class="spec-item">
        <span class="label">Total Vacuum Δv</span>
        <span class="value">{(specs.totalVacuumDeltaV_ms / 1000).toLocaleString(undefined, {maximumFractionDigits: 1})} km/s</span>
      </div>
      <div class="spec-item">
        <span class="label">Power Surplus</span>
        <span class="value">{specs.powerSurplus_MW.toLocaleString(undefined, {maximumFractionDigits: 1})} MW</span>
      </div>
      <div class="spec-item">
        <span class="label">Supplies Remaining</span>
        <span class="value">{typeof specs.endurance_days === 'number' ? specs.endurance_days.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' days' : specs.endurance_days}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .derived-specs {
    margin-top: 1em;
    padding-top: 1em;
    border-top: 1px solid #555;
  }
  .specs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75em;
  }
  .spec-item {
    display: flex;
    flex-direction: column;
    background-color: #252525;
    padding: 0.6em;
    border-radius: 4px;
    border-left: 3px solid #007bff;
  }
  .label {
    font-size: 0.8em;
    color: #999;
    text-transform: uppercase;
    margin-bottom: 0.2em;
  }
  .value {
    font-size: 1.1em;
    color: #eee;
  }
</style>

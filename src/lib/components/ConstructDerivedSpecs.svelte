<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';

  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;

  let specs: ConstructSpecs | null = null;
  let availableFuel_tonnes: number = 0;

  $: {
    if (construct && rulePack.engineDefinitions && rulePack.fuelDefinitions) {
      specs = calculateFullConstructSpecs(
        construct,
        rulePack.engineDefinitions.entries,
        rulePack.fuelDefinitions.entries,
        hostBody
      );
      // Calculate available fuel separately to compare against needs
      let fuelMass_kg = 0;
      if (construct.fuel_tanks) {
        for (const tank of construct.fuel_tanks) {
          const fuelDef = rulePack.fuelDefinitions.entries.find(f => f.id === tank.fuel_type_id);
          if (fuelDef) {
            fuelMass_kg += tank.current_units * fuelDef.density_kg_per_m3;
          }
        }
      }
      availableFuel_tonnes = fuelMass_kg / 1000;
    } else {
      specs = null;
    }
  }

  // Reactive Landing Analysis
  let landingAnalysis: { takeoff: any; consolidatedLanding: any; roundTrip: any; } | null = null;
  $: {
    if (specs && hostBody && hostBody.kind === 'body' && !hostBody.class?.includes('star')) {
      const formatFuel = (t: number) => t.toLocaleString(undefined, { maximumFractionDigits: 1 });
      
      const takeoff = { possible: false, reason: 'N/A', twr: specs.surfaceTWR, fuel: specs.takeoffFuel_tonnes };
      const propulsiveLanding = { possible: false, reason: 'N/A', fuel: specs.propulsiveLandFuel_tonnes };
      const aerobraking = { possible: false, reason: 'N/A', fuel: specs.aerobrakeLandFuel_tonnes };

      // Takeoff
      if (hostBody.class?.includes('giant')) {
        takeoff.reason = 'Host is a gas giant (no solid surface).';
      } else if (!(construct as any).physical_parameters?.has_landing_gear) {
        takeoff.reason = 'No landing gear equipped.';
      } else if (specs.surfaceTWR <= 1) {
        takeoff.reason = `Insufficient TWR. Needs > 1, has ${specs.surfaceTWR.toFixed(2)}.`;
      } else if (availableFuel_tonnes < takeoff.fuel) {
        takeoff.reason = `Insufficient fuel. Needs ${formatFuel(takeoff.fuel)}t, has ${formatFuel(availableFuel_tonnes)}t.`;
      } else {
        takeoff.possible = true;
        takeoff.reason = `Sufficient TWR and fuel.`;
      }

      // Propulsive Landing
      if (hostBody.class?.includes('giant')) {
        propulsiveLanding.reason = 'Host is a gas giant (no solid surface).';
      } else if (!(construct as any).physical_parameters?.has_landing_gear) {
        propulsiveLanding.reason = 'No landing gear equipped.';
      } else if (availableFuel_tonnes < propulsiveLanding.fuel) {
        propulsiveLanding.reason = `Insufficient fuel. Needs ${formatFuel(propulsiveLanding.fuel)}t, has ${formatFuel(availableFuel_tonnes)}t.`;
      } else {
        propulsiveLanding.possible = true;
        propulsiveLanding.reason = `Sufficient fuel for propulsive landing.`;
      }

      // Aerobraked Landing
      if (!(hostBody as any).aerobrakeLandBudget_ms) {
        aerobraking.reason = 'Host does not have a significant atmosphere.';
      } else if (!(construct as any).physical_parameters?.can_aerobrake) {
        aerobraking.reason = 'Vessel is not equipped for aerobraking.';
      } else if (!(construct as any).physical_parameters?.has_landing_gear) {
        aerobraking.reason = 'No landing gear equipped.';
      } else if (availableFuel_tonnes < aerobraking.fuel) {
        aerobraking.reason = `Insufficient fuel. Needs ${formatFuel(aerobraking.fuel)}t, has ${formatFuel(availableFuel_tonnes)}t.`;
      } else {
        aerobraking.possible = true;
        aerobraking.reason = 'Sufficient fuel for post-aerobraking maneuvers.';
      }
      
      // Consolidated Landing
      const consolidatedLanding = { possible: false, reason: 'N/A', fuel: Infinity, method: 'N/A' };
      if (propulsiveLanding.possible) {
        consolidatedLanding.possible = true;
        consolidatedLanding.fuel = propulsiveLanding.fuel;
        consolidatedLanding.method = 'Propulsive';
      }
      if (aerobraking.possible && aerobraking.fuel < consolidatedLanding.fuel) {
        consolidatedLanding.possible = true;
        consolidatedLanding.fuel = aerobraking.fuel;
        consolidatedLanding.method = 'Aerobraked';
      }
       if (consolidatedLanding.possible) {
        consolidatedLanding.reason = `Most efficient method: ${consolidatedLanding.method}.`;
      } else {
        consolidatedLanding.reason = `Neither propulsive nor aerobraked landing is possible.`;
      }


      // Round Trip Analysis
      const roundTrip = { possible: false, reason: 'N/A', fuelNeeded: specs.roundTripFuel_tonnes, additionalFuel: 0 };
      if (takeoff.possible && consolidatedLanding.possible) {
        if (availableFuel_tonnes >= roundTrip.fuelNeeded) {
          roundTrip.possible = true;
          roundTrip.reason = `Sufficient fuel for takeoff and ${consolidatedLanding.method} landing.`;
        } else {
          roundTrip.additionalFuel = roundTrip.fuelNeeded - availableFuel_tonnes;
          roundTrip.reason = `Insufficient fuel for round trip. Needs ${formatFuel(roundTrip.fuelNeeded)}t. Additional ${formatFuel(roundTrip.additionalFuel)}t required.`;
        }
      } else if (!takeoff.possible) {
        roundTrip.reason = `Cannot take off: ${takeoff.reason}`; 
      } else {
        roundTrip.reason = `Cannot land: ${consolidatedLanding.reason}`; 
      }

      landingAnalysis = { takeoff, consolidatedLanding, roundTrip };
    } else {
      landingAnalysis = null;
    }
  }
</script>

{#if specs}
  <div class="derived-specs">
    <h4>Derived Specifications</h4>
    <div class="specs-grid">
      <!-- Existing specs -->
      <div class="spec-item"><span class="label">Orbit</span><span class="value">{specs.orbit_string}</span></div>
      <div class="spec-item"><span class="label">Total Mass</span><span class="value">{specs.totalMass_tonnes.toLocaleString(undefined, {maximumFractionDigits: 0})} tonnes</span></div>
      <div class="spec-item"><span class="label">Max Vacuum Accel.</span><span class="value">{specs.maxVacuumG.toFixed(2)} G</span></div>
      <div class="spec-item"><span class="label">Total Vacuum Δv</span><span class="value">{(specs.totalVacuumDeltaV_ms / 1000).toLocaleString(undefined, {maximumFractionDigits: 1})} km/s</span></div>
      <div class="spec-item"><span class="label">Power Surplus</span><span class="value">{specs.powerSurplus_MW.toLocaleString(undefined, {maximumFractionDigits: 1})} MW</span></div>
      <div class="spec-item"><span class="label">Supplies Remaining</span><span class="value">{typeof specs.endurance_days === 'number' ? specs.endurance_days.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' days' : specs.endurance_days}</span>
      </div>
    </div>

    {#if landingAnalysis}
      <h4 class="subheader">{construct.placement === 'Surface' ? 'Takeoff & Landing Analysis' : 'Landing & Takeoff Analysis'}</h4>
      <div class="specs-grid">
        {#if construct.placement === 'Surface'}
          <!-- On Surface -->
          <div class="spec-item" title={landingAnalysis.takeoff.reason}>
            <span class="label">Takeoff Possible?</span>
            <span class="value {landingAnalysis.takeoff.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.takeoff.possible ? 'Yes' : 'No'}
              <span class="detail">({landingAnalysis.takeoff.fuel.toFixed(1)}t Fuel)</span>
            </span>
          </div>
          <div class="spec-item" title={landingAnalysis.consolidatedLanding.reason}>
            <span class="label">Landing Possible?</span>
            <span class="value {landingAnalysis.consolidatedLanding.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.consolidatedLanding.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.consolidatedLanding.possible}
                <span class="detail">({landingAnalysis.consolidatedLanding.fuel.toFixed(1)}t {landingAnalysis.consolidatedLanding.method})</span>
              {/if}
            </span>
          </div>
          <div class="spec-item" title={landingAnalysis.roundTrip.reason}>
            <span class="label">Takeoff and Land Again?</span>
            <span class="value {landingAnalysis.roundTrip.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.roundTrip.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.roundTrip.possible}
                <span class="detail">({(availableFuel_tonnes - landingAnalysis.roundTrip.fuelNeeded).toFixed(1)}t fuel remaining)</span>
              {:else if landingAnalysis.roundTrip.fuelNeeded > 0}
                <span class="detail">({landingAnalysis.roundTrip.fuelNeeded.toFixed(1)}t required)</span>
              {/if}
            </span>
          </div>
        {:else}
          <!-- In Orbit -->
          <div class="spec-item" title={landingAnalysis.consolidatedLanding.reason}>
            <span class="label">Landing Possible?</span>
            <span class="value {landingAnalysis.consolidatedLanding.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.consolidatedLanding.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.consolidatedLanding.possible}
                <span class="detail">({landingAnalysis.consolidatedLanding.fuel.toFixed(1)}t {landingAnalysis.consolidatedLanding.method})</span>
              {/if}
            </span>
          </div>
          <div class="spec-item" title={landingAnalysis.takeoff.reason}>
            <span class="label">Takeoff Possible?</span>
            <span class="value {landingAnalysis.takeoff.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.takeoff.possible ? 'Yes' : 'No'}
              <span class="detail">({landingAnalysis.takeoff.fuel.toFixed(1)}t Fuel)</span>
            </span>
          </div>
          <div class="spec-item" title={landingAnalysis.roundTrip.reason}>
            <span class="label">Land & Takeoff?</span>
            <span class="value {landingAnalysis.roundTrip.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.roundTrip.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.roundTrip.possible}
                <span class="detail">({(availableFuel_tonnes - landingAnalysis.roundTrip.fuelNeeded).toFixed(1)}t fuel remaining)</span>
              {:else if landingAnalysis.roundTrip.fuelNeeded > 0}
                <span class="detail">({landingAnalysis.roundTrip.fuelNeeded.toFixed(1)}t required)</span>
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .derived-specs { margin-top: 1em; padding-top: 1em; border-top: 1px solid #555; }
  .subheader { margin-top: 1em; margin-bottom: 0.5em; font-size: 1em; color: #ccc; }
  .specs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75em; }
  .spec-item { display: flex; flex-direction: column; background-color: #252525; padding: 0.6em; border-radius: 4px; border-left: 3px solid #007bff; cursor: help; }
  .label { font-size: 0.8em; color: #999; text-transform: uppercase; margin-bottom: 0.2em; }
  .value { font-size: 1.1em; color: #eee; }
  .value.possible { color: #4CAF50; }
  .value.impossible { color: #F44336; }
  .detail { font-size: 0.8em; color: #aaa; margin-left: 0.5em; }
</style>

<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';
  import UnitValue from './UnitValue.svelte';
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';
  import { KG_PER_TONNE, W_PER_MW, formatPref } from '$lib/units';
  import { unitPrefs } from '$lib/unitPrefsStore';

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
      
      let fuelMass_kg = 0;
      if (construct.fuel_tanks) {
        for (const tank of construct.fuel_tanks) {
          const fuelDef = rulePack.fuelDefinitions.entries.find(f => f.id === tank.fuel_type_id);
          if (fuelDef) {
            fuelMass_kg += (tank.current_units ?? 0) * fuelDef.density_kg_per_m3;
          }
        }
      }
      availableFuel_tonnes = fuelMass_kg / 1000;
    } else {
      specs = null;
    }
  }

  // Reactive Landing Analysis
  $: fmtMass = (tonnes: number) => formatPref($unitPrefs, 'mass', 'construct', tonnes * KG_PER_TONNE);

  let landingAnalysis: { takeoff: any; consolidatedLanding: any; roundTrip: any; } | null = null;
  $: {
    if (specs && hostBody && hostBody.kind === 'body' && !hostBody.class?.includes('star')) {
      
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
        takeoff.reason = `Insufficient fuel. Needs ${fmtMass(takeoff.fuel)}, has ${fmtMass(availableFuel_tonnes)}.`;
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
        propulsiveLanding.reason = `Insufficient fuel. Needs ${fmtMass(propulsiveLanding.fuel)}, has ${fmtMass(availableFuel_tonnes)}.`;
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
        aerobraking.reason = `Insufficient fuel. Needs ${fmtMass(aerobraking.fuel)}, has ${fmtMass(availableFuel_tonnes)}.`;
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
          roundTrip.reason = `Insufficient fuel for round trip. Needs ${fmtMass(roundTrip.fuelNeeded)}. Additional ${fmtMass(roundTrip.additionalFuel)} required.`;
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
  <div class="derived-specs-modal">
    <h4>Derived Specifications</h4>
    <div class="specs-grid">
      <div class="spec-item derived"><span class="label">Total Mass</span><span class="value"><UnitValue quantity="mass" bodyType="construct" value={specs.totalMass_tonnes * KG_PER_TONNE} /></span></div>
      <div class="spec-item derived"><span class="label">Max Vacuum Accel.</span><span class="value">{specs.maxVacuumG.toFixed(2)} g</span></div>
      <div class="spec-item derived"><span class="label">Total Vacuum Δv</span><span class="value"><UnitValue quantity="speed" bodyType="construct" value={specs.totalVacuumDeltaV_ms / 1000} /></span></div>
      <div class="spec-item derived"><span class="label">Power Surplus</span><span class="value"><UnitValue quantity="power" bodyType="construct" value={specs.powerSurplus_MW * W_PER_MW} /></span></div>
      <div class="spec-item derived"><span class="label">Supplies Remaining</span><span class="value">{typeof specs.endurance_days === 'number' ? specs.endurance_days.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' days' : specs.endurance_days}</span></div>
      <div class="spec-item derived"><span class="label">Orbit</span><span class="value">{specs.orbit_string}</span></div>
    </div>

    {#if landingAnalysis}
      <h4 class="subheader">{construct.placement === 'Surface' ? 'Takeoff & Landing Analysis' : 'Landing & Takeoff Analysis'}</h4>
      <div class="specs-grid">
        {#if construct.placement === 'Surface'}
          <!-- On Surface -->
          <div class="spec-item derived" title={landingAnalysis.takeoff.reason}>
            <span class="label">Takeoff Possible?</span>
            <span class="value {landingAnalysis.takeoff.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.takeoff.possible ? 'Yes' : 'No'}
              <span class="detail">({fmtMass(landingAnalysis.takeoff.fuel)} Fuel)</span>
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.consolidatedLanding.reason}>
            <span class="label">Landing Possible?</span>
            <span class="value {landingAnalysis.consolidatedLanding.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.consolidatedLanding.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.consolidatedLanding.possible}
                <span class="detail">({fmtMass(landingAnalysis.consolidatedLanding.fuel)} {landingAnalysis.consolidatedLanding.method})</span>
              {/if}
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.roundTrip.reason}>
            <span class="label">Takeoff and Land Again?</span>
            <span class="value {landingAnalysis.roundTrip.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.roundTrip.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.roundTrip.possible}
                <span class="detail">({fmtMass(availableFuel_tonnes - landingAnalysis.roundTrip.fuelNeeded)} fuel remaining)</span>
              {:else if landingAnalysis.roundTrip.additionalFuel > 0}
                <span class="detail">({fmtMass(landingAnalysis.roundTrip.additionalFuel)} additional fuel required)</span>
              {:else}
                <span class="detail">({landingAnalysis.roundTrip.reason})</span>
              {/if}
            </span>
          </div>
        {:else}
          <!-- In Orbit -->
          <div class="spec-item derived" title={landingAnalysis.consolidatedLanding.reason}>
            <span class="label">Landing Possible?</span>
            <span class="value {landingAnalysis.consolidatedLanding.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.consolidatedLanding.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.consolidatedLanding.possible}
                <span class="detail">({fmtMass(landingAnalysis.consolidatedLanding.fuel)} {landingAnalysis.consolidatedLanding.method})</span>
              {/if}
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.takeoff.reason}>
            <span class="label">Takeoff Possible?</span>
            <span class="value {landingAnalysis.takeoff.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.takeoff.possible ? 'Yes' : 'No'}
              <span class="detail">({fmtMass(landingAnalysis.takeoff.fuel)} Fuel)</span>
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.roundTrip.reason}>
            <span class="label">Land & Takeoff?</span>
            <span class="value {landingAnalysis.roundTrip.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.roundTrip.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.roundTrip.possible}
                <span class="detail">({fmtMass(availableFuel_tonnes - landingAnalysis.roundTrip.fuelNeeded)} fuel remaining)</span>
              {:else if landingAnalysis.roundTrip.additionalFuel > 0}
                <span class="detail">({fmtMass(landingAnalysis.roundTrip.additionalFuel)} additional fuel required)</span>
              {:else}
                <span class="detail">({landingAnalysis.roundTrip.reason})</span>
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .derived-specs-modal {
    margin-top: 1em;
    padding-top: 1em;
    border-top: 1px solid var(--border);
  }
  h4 {
    margin-top: 0;
    margin-bottom: 0.75em;
    color: var(--text-muted);
    font-size: 1.1em;
  }
  .subheader {
    margin-top: 1em;
    margin-bottom: 0.5em;
    font-size: 1em;
    color: var(--text-muted);
  }
  .specs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75em;
  }
  .spec-item {
    display: flex;
    flex-direction: column;
    background-color: var(--bg-panel);
    padding: 0.6em;
    border-radius: 4px;
    cursor: help;
  }
  .spec-item.derived {
    border-left: 3px solid #007bff; /* Blue */
  }
  .label {
    font-size: 0.8em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 0.2em;
  }
  .value {
    font-size: 1.1em;
    color: var(--text);
  }
  .value.possible {
    color: var(--status-ok);
  }
  .value.impossible {
    color: var(--status-bad);
  }
  .detail {
    font-size: 0.8em;
    color: var(--text-muted);
    margin-left: 0.5em;
  }
</style>

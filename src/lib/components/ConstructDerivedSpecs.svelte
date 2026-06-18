<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';
  import { AU_KM } from '$lib/constants';
  import { describeTag } from '$lib/tags/tagPresentation';
  import AutopilotShipIcon from './AutopilotShipIcon.svelte';

  // The resources/contexts this ship can refuel from = the union of its fuels' refuel_tags. Surfacing
  // it next to Fuel Mass makes the link obvious: a body carrying one of these is a valid top-up (and
  // the autopilot's harvest-refuel keys on the same test). Human-labelled via describeTag.
  $: refuelSources = (() => {
    const keys = new Set<string>();
    for (const tank of construct.fuel_tanks ?? []) {
      const def = rulePack?.fuelDefinitions?.entries.find((f) => f.id === tank.fuel_type_id);
      for (const t of def?.refuel_tags ?? []) keys.add(t);
    }
    return [...keys].map((k) => describeTag(k).label);
  })();

  export let construct: CelestialBody;
  export let rulePack: RulePack;
  export let hostBody: CelestialBody | null;
  export let isEditingConstruct: boolean = false; 
  export let hideActions: boolean = false; // New prop
  export let futureJourneyCount: number = 0;
  // The ship's live kinematic state at the current clock (from the scheduler) — so the location readout
  // says the right thing: Orbiting / Docked / Landed / In transit / Adrift. Null = no journey info.
  export let kinematicState: string | null = null;
  // Resolve the location heading: trust the live state, else fall back to the authored placement.
  $: effectiveState = kinematicState || (construct.placement === 'Surface' ? 'Landed' : 'Orbiting');

  const dispatch = createEventDispatcher();

  let specs: ConstructSpecs | null = null;
  let availableFuel_tonnes: number = 0;
  let orbitalPeriodDisplay: string = 'N/A';

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
            fuelMass_kg += (tank.current_units ?? 0) * fuelDef.density_kg_per_m3;
          }
        }
      }
      availableFuel_tonnes = fuelMass_kg / 1000;
    } else {
      specs = null;
    }
  }

  // Accel range: maxVacuumG is at CURRENT fuel; scale by mass to show empty (lightest) ↔ full (heaviest),
  // so it's obvious why a high-thrust hull crawls with full tanks.
  $: accelRange = (() => {
    if (!specs || !specs.maxVacuumG || !specs.totalMass_tonnes || !specs.fuelCapacity_tonnes) return null;
    const massEmpty = specs.totalMass_tonnes - specs.fuelMass_tonnes;       // tanks dry
    const massFull = massEmpty + specs.fuelCapacity_tonnes;                 // tanks full
    const k = specs.maxVacuumG * specs.totalMass_tonnes;                    // ∝ thrust (g·t)
    return { empty: massEmpty > 0 ? k / massEmpty : 0, full: massFull > 0 ? k / massFull : 0 };
  })();
  const fmtG = (g: number) => (g < 1 ? g.toFixed(2) : g.toFixed(1));

  function formatOrbitalPeriod(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(1)} s`;

    const minutes = seconds / 60;
    if (minutes < 60) return `${minutes.toFixed(1)} min`;

    const hours = minutes / 60;
    if (hours < 48) return `${hours.toFixed(1)} h`;

    const days = hours / 24;
    if (days < 365.25) return `${days.toFixed(2)} d`;

    const years = days / 365.25;
    return `${years.toFixed(2)} y`;
  }

  $: {
    const orbit = construct?.orbit;
    if (!orbit || construct?.flight_state === 'Deep Space' || construct?.flight_state === 'Transit') {
      orbitalPeriodDisplay = 'N/A';
    } else {
      let periodSeconds = 0;

      if (orbit.n_rad_per_s && orbit.n_rad_per_s > 0) {
        periodSeconds = (2 * Math.PI) / orbit.n_rad_per_s;
      } else if (orbit.hostMu > 0 && orbit.elements?.a_AU > 0) {
        const semiMajorAxisM = orbit.elements.a_AU * AU_KM * 1000;
        periodSeconds = 2 * Math.PI * Math.sqrt((semiMajorAxisM ** 3) / orbit.hostMu);
      }

      orbitalPeriodDisplay = formatOrbitalPeriod(periodSeconds);
    }
  }

  // Reactive Landing Analysis
  let landingAnalysis: { takeoff: any; consolidatedLanding: any; roundTrip: any; } | null = null;
  $: {
    if (specs && hostBody && hostBody.kind === 'body' && hostBody.roleHint !== 'star' && hostBody.roleHint !== 'belt' && hostBody.roleHint !== 'ring' && !hostBody.class?.includes('star')) {
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
    <div class="specs-grid">
      <div class="spec-item fixed" title="Current crew / Maximum crew">
        <span class="label">Crew</span>
        <span class="value">{construct.crew?.current || 0} <span class="detail">(Max: {construct.crew?.max || 0})</span></span>
      </div>
      <div class="spec-item fixed" title="Dry mass of the vessel, excluding fuel and cargo">
        <span class="label">Dry Mass</span>
        <span class="value">{Math.round(specs.dryMass_tonnes).toLocaleString()} t</span>
      </div>
      <div class="spec-item fixed" title="Current mass of cargo onboard">
        <span class="label">Cargo Mass</span>
        <span class="value">{Math.round(construct.current_cargo_tonnes || 0).toLocaleString()} t</span>
      </div>
      <div class="spec-item fixed" title="Current mass of fuel onboard">
        <span class="label">Fuel Mass</span>
        <span class="value">{Math.round(specs.fuelMass_tonnes).toLocaleString()} t</span>
      </div>
      {#if refuelSources.length}
        <div class="spec-item fixed wide" title="Resources / refuelling contexts this ship's fuels can be sourced from. A body carrying any of these is a valid top-up — and the autopilot will refuel there.">
          <span class="label">Refuels from</span>
          <span class="value refuel-from">{refuelSources.join(' · ')}</span>
        </div>
      {/if}
      <div class="spec-item derived" title="Current total mass including fuel and cargo">
        <span class="label">Total Mass</span>
        <span class="value">{Math.round(specs.totalMass_tonnes).toLocaleString()} t</span>
      </div>
      <div class="spec-item fixed" title="Physical dimensions of the vessel">
        <span class="label">Dimensions</span>
        <span class="value">{construct.physical_parameters?.dimensionsM?.join(' x ') || 'N/A'} m</span>
      </div>
      <div class="spec-item fixed" title="Current fuel volume / Maximum fuel volume">
        <span class="label">Fuel Volume</span>
        <span class="value">{Math.round(specs.fuelVolume_units).toLocaleString()} m³ <span class="detail">(Max: {Math.round(specs.fuelCapacity_units).toLocaleString()} m³)</span></span>
      </div>
      <div class="spec-item derived" title="Remaining power after all systems are active">
        <span class="label">Power Surplus</span>
        <span class="value">{specs.powerSurplus_MW.toLocaleString(undefined, {maximumFractionDigits: 1})} MW</span>
      </div>
      <div class="spec-item derived" title="Estimated endurance based on current crew and supplies">
        <span class="label">Supplies Remaining</span>
        <span class="value">{typeof specs.endurance_days === 'number' ? specs.endurance_days.toLocaleString() + ' days' : specs.endurance_days}</span>
      </div>

      <div class="spec-item derived" title="Acceleration in vacuum at current fuel. Range shows fully fuelled (heavy, slow) to empty (light, fast).">
        <span class="label">Max Vacuum Accel.</span>
        <span class="value">{specs.maxVacuumG.toFixed(2)} g{#if accelRange} <span class="accel-range">({fmtG(accelRange.full)}–{fmtG(accelRange.empty)} g full→empty)</span>{/if}</span>
      </div>
      <div class="spec-item derived" title="Total delta-V available in vacuum">
        <span class="label">Total Vacuum Δv</span>
        <span class="value">{(specs.totalVacuumDeltaV_ms / 1000).toLocaleString(undefined, {maximumFractionDigits: 1})} km/s</span>
      </div>
      {#if effectiveState === 'Transit'}
        <div class="spec-item derived" title="The ship is currently under way on a planned course">
          <span class="label">Status</span>
          <span class="value">In transit{#if hostBody} → {hostBody.name}{/if}</span>
        </div>
      {:else if effectiveState === 'Deep Space'}
        <div class="spec-item derived" title="Cut loose — coasting under the system's gravity, off any planned course">
          <span class="label">Status</span>
          <span class="value">Adrift — coasting</span>
        </div>
      {:else if effectiveState === 'Landed'}
        <div class="spec-item derived" title="Landed on the surface">
          <span class="label">Location</span>
          <span class="value">Surface{#if hostBody} of {hostBody.name}{/if}</span>
        </div>
      {:else if effectiveState === 'Docked'}
        <div class="spec-item derived" title="Docked">
          <span class="label">Location</span>
          <span class="value">Docked{#if hostBody} at {hostBody.name}{/if}</span>
        </div>
      {:else}
        <!-- Orbiting: the orbit profile + period make sense here. -->
        <div class="spec-item derived" title="Orbital profile around the current host body">
          <span class="label">Orbit{#if hostBody} ({hostBody.name}){/if}</span>
          <span class="value">{specs.orbit_string}</span>
        </div>
        <div class="spec-item derived" title="Current orbital period derived from mean motion or Keplerian elements">
          <span class="label">Orbital Period</span>
          <span class="value">{orbitalPeriodDisplay}</span>
        </div>
      {/if}
    </div>

    {#if landingAnalysis}
      <h4 class="subheader landing-header">{construct.placement === 'Surface' ? 'Takeoff & Landing Analysis' : 'Landing & Takeoff Analysis'}</h4>
      <div class="specs-grid">
        {#if construct.placement === 'Surface'}
          <!-- On Surface -->
          <div class="spec-item derived" title={landingAnalysis.takeoff.reason}>
            <span class="label">Takeoff Possible?</span>
            <span class="value {landingAnalysis.takeoff.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.takeoff.possible ? 'Yes' : 'No'}
              <span class="detail">({landingAnalysis.takeoff.fuel.toFixed(1)}t Fuel)</span>
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.consolidatedLanding.reason}>
            <span class="label">Landing Possible?</span>
            <span class="value {landingAnalysis.consolidatedLanding.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.consolidatedLanding.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.consolidatedLanding.possible}
                <span class="detail">({landingAnalysis.consolidatedLanding.fuel.toFixed(1)}t {landingAnalysis.consolidatedLanding.method})</span>
              {/if}
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.roundTrip.reason}>
            <span class="label">Takeoff and Land Again?</span>
            <span class="value {landingAnalysis.roundTrip.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.roundTrip.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.roundTrip.possible}
                <span class="detail">({(availableFuel_tonnes - landingAnalysis.roundTrip.fuelNeeded).toFixed(1)}t fuel remaining)</span>
              {:else if landingAnalysis.roundTrip.additionalFuel > 0}
                <span class="detail">({landingAnalysis.roundTrip.additionalFuel.toFixed(1)}t additional fuel required)</span>
              {:else}
                <!-- No fuel needed, but still not possible (e.g., no landing gear) -->
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
                <span class="detail">({landingAnalysis.consolidatedLanding.fuel.toFixed(1)}t {landingAnalysis.consolidatedLanding.method})</span>
              {/if}
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.takeoff.reason}>
            <span class="label">Takeoff Possible?</span>
            <span class="value {landingAnalysis.takeoff.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.takeoff.possible ? 'Yes' : 'No'}
              <span class="detail">({landingAnalysis.takeoff.fuel.toFixed(1)}t Fuel)</span>
            </span>
          </div>
          <div class="spec-item derived" title={landingAnalysis.roundTrip.reason}>
            <span class="label">Land & Takeoff?</span>
            <span class="value {landingAnalysis.roundTrip.possible ? 'possible' : 'impossible'}">
              {landingAnalysis.roundTrip.possible ? 'Yes' : 'No'}
              {#if landingAnalysis.roundTrip.possible}
                <span class="detail">({(availableFuel_tonnes - landingAnalysis.roundTrip.fuelNeeded).toFixed(1)}t fuel remaining)</span>
              {:else if landingAnalysis.roundTrip.additionalFuel > 0}
                <span class="detail">({landingAnalysis.roundTrip.additionalFuel.toFixed(1)}t additional fuel required)</span>
              {:else}
                <span class="detail">({landingAnalysis.roundTrip.reason})</span>
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {/if}

    <div class="actions-row">
        {#if !isEditingConstruct && !hideActions}
            <!-- Plan Transit (Only available if NOT on surface) -->
            {#if construct.placement !== 'Surface'}
                {#if construct.autopilot?.enabled}
                    <!-- Autopilot owns the ship — click to disengage (opens the stop-how dialog). -->
                    <button class="action-btn autopilot-locked" title="Under autopilot — click to disengage and take manual control" on:click={() => dispatch('disengage')}>
                        <AutopilotShipIcon size={15} />
                        Under autopilot
                    </button>
                {:else}
                <!-- Contextual transit controls keyed to the LIVE state: only a ship actually under way
                     can be aborted (drift = coast on under gravity, stop = halt then fall). Once it's
                     arrived / orbiting / docked / adrift it shows Plan Transit again. -->
                {#if effectiveState === 'Transit'}
                    <button class="action-btn cancel-drift" on:click={() => dispatch('cancelactive', { coast: true })} title="Abort the journey but keep momentum — coast on under gravity">Cancel · drift</button>
                    <button class="action-btn cancel-stop" on:click={() => dispatch('cancelactive', { coast: false })} title="Abort and stop dead — it then falls under the system's gravity">Cancel · stop</button>
                {:else if effectiveState === 'Deep Space'}
                    <!-- Adrift / stopped mid-flight: plot a fresh course (the physical choice) or resume the
                         aborted one (orange — re-flies the old plan as if it never stopped). -->
                    <button class="action-btn go" on:click={() => dispatch('planTransit')}>Plan Transit</button>
                    <button class="action-btn resume" on:click={() => dispatch('resumejourney')} title="Resume the aborted journey on its original plan (ignores that it stopped)">Resume journey</button>
                {:else}
                    <button class="action-btn go" on:click={() => dispatch('planTransit')}>Plan Transit</button>
                {/if}
                {/if}
                <button class="action-btn log" on:click={() => dispatch('openJourneyLog')} title="Open ship log (scheduled journeys)">
                    Ship's Log ({futureJourneyCount})
                </button>
            {/if}

            <!-- Landing/takeoff only when the ship is actually AT a body — not adrift or in transit. -->
            {#if landingAnalysis && effectiveState !== 'Transit' && effectiveState !== 'Deep Space'}
                {#if construct.placement === 'Surface'}
                    <!-- Takeoff -->
                    {#if landingAnalysis.takeoff.possible}
                        <button class="action-btn transit" on:click={() => dispatch('takeoff', { fuel: landingAnalysis.takeoff.fuel })}>
                            Takeoff
                            <span class="btn-detail">({landingAnalysis.takeoff.fuel.toFixed(1)}t)</span>
                        </button>
                    {/if}
                {:else}
                    <!-- Landing -->
                    {#if landingAnalysis.consolidatedLanding.possible}
                        <button class="action-btn transit" on:click={() => dispatch('land', { method: landingAnalysis.consolidatedLanding.method, fuel: landingAnalysis.consolidatedLanding.fuel })}>
                            Land on {hostBody?.name || 'Surface'}
                            <span class="btn-detail">({landingAnalysis.consolidatedLanding.fuel.toFixed(1)}t)</span>
                        </button>
                    {/if}
                {/if}
            {/if}
        {/if}
    </div>
  </div>
{/if}

<style>
  .actions-row {
      display: flex;
      flex-direction: row; /* Side by side */
      gap: 10px;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px dashed var(--border);
  }
  .action-btn {
      flex: 1; /* Equal width */
      padding: 10px;
      border: none;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      flex-direction: column; /* Stack text and detail */
      justify-content: center;
      align-items: center;
      gap: 2px;
      font-size: 0.95em;
      transition: opacity 0.2s;
      background-color: var(--accent); /* Uniform Blue */
  }
  .action-btn:hover { opacity: 0.9; }
  .action-btn:disabled { background-color: var(--bg-control); color: var(--text-faint); cursor: not-allowed; opacity: 1; }
  .action-btn:disabled:hover { opacity: 1; }
  /* Under autopilot = hazard stripes, so it's unmistakable at a glance that the ship is flying itself.
     Clickable now (opens the disengage dialog). */
  .action-btn.autopilot-locked {
      color: #fff;
      font-weight: 700;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9);
      background-color: #1a1a1a;
      background-image: repeating-linear-gradient(45deg, #e8b600 0 14px, #1a1a1a 14px 28px);
      border-color: #e8b600;
      display: inline-flex; align-items: center; gap: 7px; justify-content: center;
      cursor: pointer;
  }
  /* Abort controls: green = physical (coast on), orange = stop dead (then falls). */
  .action-btn.cancel-drift { background-color: #2f9e57; }
  .action-btn.cancel-stop { background-color: #d98a2b; }
  /* Ship's Log = captain's-log aesthetic: yellow on black. */
  .action-btn.log { background-color: #141414; color: #ffd23f; }
  /* Plan Transit = the valid/physical choice (green); Resume = allowed-but-unphysical (orange). */
  .action-btn.go { background-color: #2f9e57; }
  .action-btn.resume { background-color: #d98a2b; }

  .btn-detail {
      font-weight: normal;
      font-size: 0.8em;
      opacity: 0.8;
  }

  .derived-specs {
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
  .fixed-header {
    border-left: 3px solid var(--data-fixed); /* you typed this */
    padding-left: 0.5em;
  }
  .derived-header, .landing-header {
    border-left: 3px solid var(--data-derived); /* computed */
    padding-left: 0.5em;
  }
  .specs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.75em;
  }
  .spec-item {
    display: flex;
    flex-direction: column;
    background-color: var(--bg-control);
    padding: 0.6em;
    border-radius: var(--radius-sm);
    cursor: help;
  }
  .spec-item.fixed {
    border-left: 3px solid var(--data-fixed);
  }
  .spec-item.derived {
    border-left: 3px solid var(--data-derived);
  }
  .spec-item.wide { grid-column: 1 / -1; }
  .value.refuel-from { font-size: 0.85em; color: var(--text-muted); line-height: 1.4; }
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
  .accel-range {
    font-size: 0.78em;
    color: var(--text-faint);
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

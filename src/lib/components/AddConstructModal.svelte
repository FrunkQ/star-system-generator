<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { systemStore } from '$lib/stores'; // Correct store
  import { get } from 'svelte/store';
  import type { CelestialBody, RulePack, OrbitalBoundaries } from '$lib/types';
  import { generateId } from '$lib/utils';
  import { deriveCoOrbitalOrbit, lagrangePlacementId, LAGRANGE_PLACEMENTS } from '$lib/physics/lagrange';

  export let rulePack: RulePack;
  export let hostBody: CelestialBody; // The body the user right-clicked on
  export let orbitalBoundaries: OrbitalBoundaries | undefined; // For planets/moons

  const dispatch = createEventDispatcher();

  let selectedRoleHint: string | undefined;
  let selectedTemplate: CelestialBody | undefined;
  let selectedPlacement: string | undefined;   // an orbit band, 'Surface', 'AU Distance', or one of LAGRANGE_PLACEMENTS
  let auDistance: number = 1.0; // For star-focused placement

  $: constructRoleHints = Object.keys(rulePack.constructTemplates || {}).filter(key => key !== 'id' && key !== 'name');

  // Reactive variables for available templates based on selected role hint
  $: availableTemplates = selectedRoleHint && rulePack.constructTemplates ? rulePack.constructTemplates[selectedRoleHint] : [];

  // Reactive variable for available placement options
  $: availablePlacements = [];
  $: {
    const placements: string[] = [];
    const isGasGiant = hostBody.classes?.some(c => c.includes('gas-giant')) ?? false;

    if (hostBody.kind === 'body' && (hostBody.roleHint === 'planet' || hostBody.roleHint === 'moon')) {
      if (!isGasGiant) {
        placements.push('Surface');
      }
      placements.push('Low Orbit');
      
      if (orbitalBoundaries) {
          if (orbitalBoundaries.leoMoeBoundaryKm < orbitalBoundaries.meoHeoBoundaryKm) {
             placements.push('Mid Orbit');
          }
          if (orbitalBoundaries.meoHeoBoundaryKm < orbitalBoundaries.heoUpperBoundaryKm) {
             placements.push('High Orbit');
          }
          if (orbitalBoundaries.geoStationaryKm && !orbitalBoundaries.isGeoFallback) {
            placements.push('Geostationary Orbit');
          }
      }
    }

    // Any body with a parent has all five Lagrange points in its orbit (G43 P3 — was L4/L5 only,
    // even though the transit planner has always been able to fly to all five). What each costs
    // is physics and arrives as the flight/fuel-use tag; the editor just offers them.
    if (hostBody.parentId) {
      placements.push(...LAGRANGE_PLACEMENTS);
    }
    
    // Stars and barycenters have a direct AU distance option
    if (hostBody.roleHint === 'star' || hostBody.kind === 'barycenter') {
      placements.push('AU Distance');
    }

    availablePlacements = placements;
  }

  function createConstruct() {
    if (!selectedTemplate || !selectedPlacement || !hostBody) return;

    const templateCopy = JSON.parse(JSON.stringify(selectedTemplate));
    delete templateCopy.orbit; // Remove the template's orbit to avoid overwriting
    const newConstruct: CelestialBody = { ...templateCopy };

    newConstruct.id = generateId();
    newConstruct.IsTemplate = false; // This is now an instance
    newConstruct.placement = selectedPlacement; // Store the placement type

    const lagrangePoint = lagrangePlacementId(selectedPlacement);
    // Handle L-point parenting and orbit derivation first
    if (lagrangePoint) {
      // G43: the structured marker is the load-bearing record — the processor re-derives the orbit
      // from the secondary on every pass, so editing the planet later moves its L-point riders.
      // The orbit written here (the same shared convention) is only the instant-feedback copy.
      newConstruct.parentId = hostBody.parentId; // Gravitational parent is the star/grandparent
      newConstruct.ui_parentId = hostBody.id;   // UI parent is the planet/moon
      newConstruct.coOrbital = { hostId: hostBody.id, point: lagrangePoint };

      const sys = get(systemStore);
      const grandparent = sys?.nodes.find(n => n.id === hostBody.parentId);
      const grandparentMassKg = grandparent
        ? ((grandparent as any).kind === 'barycenter' ? (grandparent as any).effectiveMassKg : (grandparent as any).massKg) || 0
        : 0;
      const derived = deriveCoOrbitalOrbit(hostBody, grandparentMassKg, newConstruct.coOrbital.point);
      if (derived) newConstruct.orbit = derived;
      else if (hostBody.orbit) newConstruct.orbit = JSON.parse(JSON.stringify(hostBody.orbit));
    } else {
      delete newConstruct.coOrbital;
      newConstruct.parentId = hostBody.id; // Gravitational and UI parent are the same
      // Create a new orbit object for non-L-point placements
      newConstruct.orbit = {
        hostId: hostBody.id,
        hostMu: (hostBody.massKg || 0) * 6.67430e-11, // G * M
        t0: Date.now(),
        elements: {
          a_AU: 0, // Will be calculated below
          e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0,
        }
      };
    }

    // Set initial orbit based on placement (for non-L-point cases)
    if (!lagrangePoint) {
      const hostRadiusKm = hostBody.radiusKm || 0;
      let altitudeKm = 0;

      switch (selectedPlacement) {
        case 'Surface':
          altitudeKm = 0;
          newConstruct.orbit!.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
          // Fix construct to surface rotation (lock to ground)
          let rotationHours = (hostBody as any).rotation_period_hours; // Planet standard
          
          if (rotationHours === undefined && hostBody.physical_parameters) {
               rotationHours = hostBody.physical_parameters.rotation_period_hours; // Construct standard
          }

          if (rotationHours) {
              const periodSeconds = rotationHours * 3600;
              // Handle potential 0 or infinite period
              if (periodSeconds !== 0 && isFinite(periodSeconds)) {
                  newConstruct.orbit!.n_rad_per_s = (2 * Math.PI) / periodSeconds;
              }
          } else if ((hostBody as any).calculatedRotationPeriod_s) {
              const periodSeconds = (hostBody as any).calculatedRotationPeriod_s;
              if (periodSeconds !== 0 && isFinite(periodSeconds)) {
                  newConstruct.orbit!.n_rad_per_s = (2 * Math.PI) / periodSeconds;
              }
          }
          break;
        case 'Low Orbit':
          altitudeKm = ((orbitalBoundaries?.minLeoKm ?? 200) + (orbitalBoundaries?.leoMoeBoundaryKm ?? 2000)) / 2;
          newConstruct.orbit!.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
          break;
        case 'Mid Orbit':
          altitudeKm = (orbitalBoundaries!.leoMoeBoundaryKm + orbitalBoundaries!.meoHeoBoundaryKm) / 2;
          newConstruct.orbit!.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
          break;
        case 'Geostationary Orbit':
          altitudeKm = orbitalBoundaries!.geoStationaryKm || 0;
          newConstruct.orbit!.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
          break;
        case 'High Orbit':
          altitudeKm = (orbitalBoundaries!.meoHeoBoundaryKm + orbitalBoundaries!.heoUpperBoundaryKm) / 2;
          newConstruct.orbit!.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
          break;
        case 'AU Distance':
          newConstruct.orbit!.elements.a_AU = auDistance;
          break;
      }
    }
    
    systemStore.update((system) => {
      if (system) {
        system.nodes.push(newConstruct);
      }
      // A FRESH REFERENCE, as every other write to this store returns (G28): a subscriber cannot
      // tell an in-place change from a no-op if the object it is handed is the same one it saw
      // last, and the undo recorder uses exactly that test to ignore the clock's no-op writes.
      return system ? { ...system } : system;
    });

    dispatch('create', newConstruct);
    dispatch('close');
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="modal-background">
  <div class="modal">
    <h2>Add New Construct to {hostBody.name}</h2>

    <label class="form-row">
      <span>Construct Type:</span>
      <select bind:value={selectedRoleHint}>
        <option value={undefined} disabled>Select a type</option>
        {#each constructRoleHints as roleHint}
          <option value={roleHint}>{roleHint.charAt(0).toUpperCase() + roleHint.slice(1)}</option>
        {/each}
      </select>
    </label>

    {#if selectedRoleHint}
      <label class="form-row">
        <span>Template:</span>
        <select bind:value={selectedTemplate}>
          <option value={undefined} disabled>Select a template</option>
          {#each availableTemplates as template}
            <option value={template}>{template.name}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if selectedTemplate}
      <label class="form-row">
        <span>Placement:</span>
        <select bind:value={selectedPlacement}>
          <option value={undefined} disabled>Select placement</option>
          {#each availablePlacements as placementOption}
            <option value={placementOption}>{placementOption}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if selectedPlacement === 'AU Distance'}
      <label class="form-row">
        <span>AU Distance:</span>
        <input type="number" bind:value={auDistance} min="0.1" step="0.1" />
      </label>
    {/if}

    <div class="buttons">
      <button on:click={createConstruct} disabled={!selectedTemplate || !selectedPlacement}>Add Construct</button>
      <button on:click={close}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: var(--bg-panel);
    padding: 20px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--text);
    max-width: 500px;
    text-align: center;
  }

  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .form-row span {
    margin-right: 1rem;
    white-space: nowrap;
  }

  .form-row select,
  .form-row input {
    flex-grow: 1;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 1rem;
  }
</style>

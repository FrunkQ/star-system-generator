<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { systemStore } from '$lib/stores'; // Correct store
  import { get } from 'svelte/store';
  import type { CelestialBody, RulePack, OrbitalBoundaries } from '$lib/types';
  import { generateId } from '$lib/utils';

  export let rulePack: RulePack;
  export let hostBody: CelestialBody; // The body the user right-clicked on
  export let orbitalBoundaries: OrbitalBoundaries | undefined; // For planets/moons

  const dispatch = createEventDispatcher();

  let selectedRoleHint: string | undefined;
  let selectedTemplate: CelestialBody | undefined;
  let selectedPlacement: 'Surface' | 'Low Orbit' | 'Mid Orbit' | 'Geostationary Orbit' | 'High Orbit' | 'L4' | 'L5' | 'AU Distance' | undefined;
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
      placements.push('Low Orbit', 'Mid Orbit', 'High Orbit');
      if (orbitalBoundaries?.geoStationaryKm) {
        placements.push('Geostationary Orbit');
      }
    }

    // Any body with a parent has L4/L5 points in its orbit
    if (hostBody.parentId) {
      placements.push('L4', 'L5');
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
    newConstruct.parentId = hostBody.id; // Parent is always the host body for hierarchy
    newConstruct.IsTemplate = false; // This is now an instance
    newConstruct.placement = selectedPlacement; // Store the placement type

    // Create a new orbit object
    newConstruct.orbit = {
      hostId: hostBody.id, // This might be overridden for L-points during propagation
      hostMu: (hostBody.massKg || 0) * 6.67430e-11, // G * M
      t0: Date.now(),
      elements: {
        a_AU: 0, // Will be calculated below
        e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0,
      }
    };

    // Set initial orbit based on placement
    const hostRadiusKm = hostBody.radiusKm || 0;
    let altitudeKm = 0;

    switch (selectedPlacement) {
      case 'Surface':
        altitudeKm = 0;
        newConstruct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
        break;
      case 'Low Orbit':
        altitudeKm = (orbitalBoundaries!.minLeoKm + orbitalBoundaries!.leoMoeBoundaryKm) / 2;
        newConstruct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
        break;
      case 'Mid Orbit':
        altitudeKm = (orbitalBoundaries!.leoMoeBoundaryKm + orbitalBoundaries!.meoHeoBoundaryKm) / 2;
        newConstruct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
        break;
      case 'Geostationary Orbit':
        altitudeKm = orbitalBoundaries!.geoStationaryKm || 0;
        newConstruct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
        break;
      case 'High Orbit':
        altitudeKm = (orbitalBoundaries!.meoHeoBoundaryKm + orbitalBoundaries!.heoUpperBoundaryKm) / 2;
        newConstruct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / 149597870.7;
        break;
      case 'L4':
      case 'L5':
        newConstruct.orbit.elements.a_AU = hostBody.orbit?.elements.a_AU || 0;
        break;
      case 'AU Distance':
        newConstruct.orbit.elements.a_AU = auDistance;
        break;
    }
    
    systemStore.update((system) => {
      if (system) {
        system.nodes.push(newConstruct);
        system.isManuallyEdited = true; // Mark as edited
      }
      return system;
    });

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
    background-color: #333;
    padding: 20px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: #fff;
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

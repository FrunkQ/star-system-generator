<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody, System } from '$lib/types';
  import { AU_KM } from '$lib/constants';

  export let system: System;
  export let construct: CelestialBody;
  
  const dispatch = createEventDispatcher();

  let availableParents: CelestialBody[] = [];
  let availablePlacements: string[] = [];
  
  let selectedParentId: string | null = null;
  let selectedPlacement: string | null = null;
  let auDistance: number = 0;

  onMount(() => {
    availableParents = system.nodes.filter(n => n.kind === 'body' && (n.roleHint === 'planet' || n.roleHint === 'moon' || n.roleHint === 'star' || n.kind === 'barycenter'));
    selectedParentId = construct.ui_parentId || construct.parentId;
    selectedPlacement = construct.placement;
    if (construct.orbit) {
      auDistance = construct.orbit.elements.a_AU;
    }
    updatePlacementsForParent();
  });

  function updatePlacementsForParent() {
    if (!selectedParentId) return;
    const parentBody = system.nodes.find(n => n.id === selectedParentId);
    if (!parentBody) return;

    const placements: string[] = [];
    const boundaries = parentBody.orbitalBoundaries;

    if (parentBody.kind === 'body' && (parentBody.roleHint === 'planet' || parentBody.roleHint === 'moon')) {
      const isGasGiant = parentBody.classes?.some(c => c.includes('gas-giant')) ?? false;
      if (!isGasGiant && boundaries?.surface) {
        placements.push('Surface');
      }
      placements.push('Low Orbit', 'Medium Orbit', 'High Orbit');
      if (boundaries?.geoStationaryKm) { 
        placements.push('Geosynchronous Orbit');
      }
    }

    if (parentBody.roleHint === 'star' || parentBody.kind === 'barycenter') {
      placements.push('AU Distance');
    }
    
    if (parentBody.parentId) {
      placements.push('L4', 'L5');
    }
    availablePlacements = placements;

    if (!availablePlacements.includes(selectedPlacement || '')) {
      selectedPlacement = availablePlacements[0];
      handleUpdate();
    }
  }

  function handleParentChange() {
    updatePlacementsForParent();
    handleUpdate();
  }

  function handleUpdate() {
    if (!construct || !selectedParentId || !selectedPlacement) return;

    const parentBody = system.nodes.find(n => n.id === selectedParentId);
    if (!parentBody) return;

    construct.placement = selectedPlacement;

    // Ensure construct.orbit exists before trying to modify it
    if (!construct.orbit) {
        construct.orbit = {
            hostId: parentBody.id,
            hostMu: (parentBody.massKg || 0) * 6.67430e-11, // G * M
            t0: Date.now(),
            elements: {
                a_AU: 0, // Default to 0, will be set below
                e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0,
            }
        };
    }

    if (selectedPlacement === 'L4' || selectedPlacement === 'L5') {
      construct.parentId = parentBody.parentId;
      construct.ui_parentId = parentBody.id;
    } else {
      construct.parentId = parentBody.id;
      construct.ui_parentId = null;
    }

    const boundaries = parentBody.orbitalBoundaries;
    const hostRadiusKm = parentBody.radiusKm || 0;
    let altitudeKm = 0;

    switch (selectedPlacement) {
      case 'Surface':
        altitudeKm = 0;
        construct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / AU_KM;
        break;
      case 'Low Orbit':
        altitudeKm = (boundaries?.minLeoKm || 0 + boundaries?.leoMoeBoundaryKm || 0) / 2;
        construct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / AU_KM;
        break;
      case 'Medium Orbit':
        altitudeKm = (boundaries?.leoMoeBoundaryKm || 0 + boundaries?.meoHeoBoundaryKm || 0) / 2;
        construct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / AU_KM;
        break;
      case 'Geosynchronous Orbit':
        altitudeKm = boundaries?.geoStationaryKm || 0;
        construct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / AU_KM;
        break;
      case 'High Orbit':
        altitudeKm = (boundaries?.meoHeoBoundaryKm || 0 + boundaries?.heoUpperBoundaryKm || 0) / 2;
        construct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / AU_KM;
        break;
      case 'L4':
      case 'L5':
        if (parentBody.orbit) {
          construct.orbit = JSON.parse(JSON.stringify(parentBody.orbit));
          const baseAnomaly = parentBody.orbit.elements.M0_rad;
          const adjustment = selectedPlacement === 'L4' ? Math.PI / 3 : -Math.PI / 3;
          construct.orbit.elements.M0_rad = (baseAnomaly + adjustment + 2 * Math.PI) % (2 * Math.PI);
        }
        break;
      case 'AU Distance':
        if (construct.orbit) {
            construct.orbit.elements.a_AU = auDistance;
        }
        break;
    }
    
    dispatch('update');
  }
</script>

<div class="tab-panel">
  <div class="form-group">
    <label for="construct-name">Name:</label>
    <input type="text" id="construct-name" bind:value={construct.name} on:input={handleUpdate} />
  </div>
  <div class="form-group">
    <label for="construct-class">Class:</label>
    <input type="text" id="construct-class" bind:value={construct.class} on:input={handleUpdate} />
  </div>
  <hr />
  <div class="icon-controls">
    <div class="form-group">
      <label for="icon-type">Icon Type:</label>
      <select id="icon-type" bind:value={construct.icon_type} on:change={handleUpdate}>
        <option value="square">Square</option>
        <option value="triangle">Triangle</option>
        <option value="circle">Circle</option>
      </select>
    </div>
    <div class="form-group">
      <label for="icon-color">Color:</label>
      <input type="color" id="icon-color" bind:value={construct.icon_color} on:input={handleUpdate} />
    </div>
  </div>
  <hr />
  <div class="placement-controls">
      <div class="form-group">
        <label for="parent-body">Current Orbit</label>
        <select id="parent-body" bind:value={selectedParentId} on:change={handleParentChange}>
          <option value={null} disabled>Select a body</option>
          {#each availableParents as parent}
            <option value={parent.id}>{parent.name}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label for="placement">Zone</label>
        <select id="placement" bind:value={selectedPlacement} on:change={handleUpdate} disabled={!selectedParentId}>
          <option value={null} disabled>Select a placement</option>
          {#each availablePlacements as placementOption}
            <option value={placementOption}>{placementOption}</option>
          {/each}
        </select>
      </div>
  </div>

  {#if selectedPlacement === 'AU Distance'}
    <div class="form-group">
      <label for="altitude-au">Orbital Distance (AU)</label>
      <input type="number" id="altitude-au" bind:value={auDistance} on:input={handleUpdate} step="0.01" />
    </div>
  {/if}

  <hr />
  <div class="checkbox-group">
    <label>
      <input type="checkbox" bind:checked={construct.physical_parameters.can_aerobrake} on:change={handleUpdate} />
      Can Aerobrake
    </label>
    <label>
      <input type="checkbox" bind:checked={construct.physical_parameters.has_landing_gear} on:change={handleUpdate} />
      Has Landing Gear
    </label>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; font-size: 1em; }
  input[type="color"] { height: 38px; padding: 2px; }
  hr { border: 1px solid #555; margin: 0.5em 0; }
  .icon-controls, .placement-controls { display: flex; gap: 15px; align-items: flex-end; }
  .icon-controls .form-group, .placement-controls .form-group { flex: 1; }
    .checkbox-group {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 15px; /* Increased gap for horizontal spacing */
    }
  .checkbox-group label { display: flex; align-items: center; gap: 10px; color: #eee; }
</style>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, System } from '$lib/types';
  import BodyBasicsTab from './BodyBasicsTab.svelte';
  import BodyDetailsTab from './BodyDetailsTab.svelte';
  import BodyStarTab from './BodyStarTab.svelte';
  import BodyOrbitTab from './BodyOrbitTab.svelte';
  import BodyAtmosphereTab from './BodyAtmosphereTab.svelte';
  import BodyTemperatureTab from './BodyTemperatureTab.svelte';
  import BodyHydrosphereTab from './BodyHydrosphereTab.svelte';
  import BodyBiosphereTab from './BodyBiosphereTab.svelte';
  import BodyTagsTab from './BodyTagsTab.svelte';
  import SystemInfoTab from './SystemInfoTab.svelte';
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';

  export let body: CelestialBody;
  export let rulePack: RulePack;
  export let system: System;
  export let parentBody: CelestialBody | null = null;
  export let rootStar: CelestialBody | null = null;

  const dispatch = createEventDispatcher();

  let selectedTab: string = 'Basics';
  $: isBeltOrRing = body.roleHint === 'belt' || body.roleHint === 'ring';
  $: isStar = body.roleHint === 'star';
  $: isBarycenter = body.kind === 'barycenter';
  
  // Auto-switch to Details if opening a special object (Belt/Ring/Star)
  // EXCEPT if it's a star with a parent (binary member), in which case Orbit is allowed.
  $: if ((isBeltOrRing || isStar) && (selectedTab === 'Basics' || (selectedTab === 'Orbit' && !body.parentId))) {
      selectedTab = 'Details';
  }

  // Auto-switch for Barycenter
  $: if (isBarycenter && !['Orbit', 'Tags'].includes(selectedTab)) {
      selectedTab = 'Tags';
  }

  // Auto-switch BACK to Basics if opening a normal object but tab is stuck on Details
  $: if (!isBeltOrRing && !isStar && !isBarycenter && selectedTab === 'Details') {
      selectedTab = 'Basics';
  }

  function setTab(tab: string) {
      selectedTab = tab;
      dispatch('tabchange', tab);
  }

  function handleUpdate() {
      dispatch('update', body);
  }
</script>

<div class="body-side-panel">
  <div class="tabs">
    {#if !isBeltOrRing && !isStar && !isBarycenter}
        <button class:active={selectedTab === 'Basics'} on:click={() => setTab('Basics')}>Composition</button>
        <button class:active={selectedTab === 'Orbit'} on:click={() => setTab('Orbit')}>Orbit</button>
    {:else if isBarycenter}
        {#if body.parentId}
            <button class:active={selectedTab === 'Orbit'} on:click={() => setTab('Orbit')}>Orbit</button>
        {/if}
    {:else}
        <button class:active={selectedTab === 'Details'} on:click={() => setTab('Details')}>Details</button>
        {#if isStar && body.parentId}
            <button class:active={selectedTab === 'Orbit'} on:click={() => setTab('Orbit')}>Orbit</button>
        {/if}
        {#if isStar}
            <button class:active={selectedTab === 'SystemInfo'} on:click={() => setTab('SystemInfo')}>System Info</button>
        {/if}
    {/if}
    
    {#if !isBeltOrRing && !isStar && !isBarycenter}
        <button class:active={selectedTab === 'Temp'} on:click={() => setTab('Temp')}>Temp</button>
        <button class:active={selectedTab === 'Atmosphere'} on:click={() => setTab('Atmosphere')}>Atmo/Mag</button>
        <button class:active={selectedTab === 'Hydro'} on:click={() => setTab('Hydro')}>Liquid</button>
        <button class:active={selectedTab === 'Bio'} on:click={() => setTab('Bio')}>Bio</button>
    {/if}
    
    <button class:active={selectedTab === 'Tags'} on:click={() => setTab('Tags')}>Tags</button>
  </div>

  <div class="tab-content">
    {#if selectedTab === 'Details'}
      {#if isStar}
          <BodyStarTab {body} {rulePack} on:update={handleUpdate} />
      {:else}
          <BodyDetailsTab {body} {parentBody} on:update={handleUpdate} />
      {/if}
    {:else if selectedTab === 'Basics'}
      <BodyBasicsTab {body} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Orbit'}
      <BodyOrbitTab {body} {parentBody} {system} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Temp'}
      <BodyTemperatureTab {body} {rulePack} {rootStar} {parentBody} nodes={system.nodes} on:update={handleUpdate} />
    {:else if selectedTab === 'Atmosphere'}
      <BodyAtmosphereTab {body} {rulePack} {system} on:update={handleUpdate} />
    {:else if selectedTab === 'Hydro'}
      <BodyHydrosphereTab {body} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Bio'}
      <BodyBiosphereTab {body} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'SystemInfo'}
      <SystemInfoTab {system} on:update={handleUpdate} />
    {:else if selectedTab === 'Tags'}
      <BodyTagsTab {body} {rulePack} on:update={handleUpdate} />
    {/if}
  </div>

  <div class="actions-row">
    <button class="danger" on:click={() => {
        // The primary star's delete is really a whole-system delete; SystemView.handleDeleteNode owns
        // that loud confirmation, so don't double-prompt here. Everything else gets the usual check.
        const isRoot = rootStar && body.id === rootStar.id;
        if (isRoot) { dispatch('delete', body.id); return; }
        if (confirm(`Are you sure you want to delete ${body.name}?`)) {
            dispatch('delete', body.id);
        }
    }}>{rootStar && body.id === rootStar.id ? 'Delete system' : 'Delete'}</button>
  </div>

  <div class="live-stats">
      <BodyTechnicalDetails {body} {rulePack} {parentBody} {rootStar} />
  </div>
</div>

<style>
  .body-side-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-bottom: 5px;
  }

  .tabs button {
    background-color: var(--bg-panel);
    color: var(--text-muted);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
    flex-grow: 1;
  }

  .tabs button.active {
    background-color: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .tab-content {
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px;
    min-height: 300px;
  }
  
  .live-stats {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
  }

  .actions-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .actions-row button {
      flex-grow: 1;
      font-size: 0.8em;
      padding: 6px;
      cursor: pointer;
      border: none;
      border-radius: 4px;
  }
  .actions-row button.danger {
      background-color: #cc0000;
      color: white;
  }
  .actions-row button.primary {
      background-color: var(--accent);
      color: white;
  }
</style>

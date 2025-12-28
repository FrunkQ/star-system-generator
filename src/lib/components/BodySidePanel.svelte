<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import BodyBasicsTab from './BodyBasicsTab.svelte';
  import BodyDetailsTab from './BodyDetailsTab.svelte';
  import BodyStarTab from './BodyStarTab.svelte';
  import BodyOrbitTab from './BodyOrbitTab.svelte';
  import BodyAtmosphereTab from './BodyAtmosphereTab.svelte';
  import BodyTemperatureTab from './BodyTemperatureTab.svelte';
  import BodyHydrosphereTab from './BodyHydrosphereTab.svelte';
  import BodyBiosphereTab from './BodyBiosphereTab.svelte';
  import BodyTagsTab from './BodyTagsTab.svelte';
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';

  export let body: CelestialBody;
  export let rulePack: RulePack;
  export let parentBody: CelestialBody | null = null;
  export let rootStar: CelestialBody | null = null;

  const dispatch = createEventDispatcher();

  let selectedTab: string = 'Basics';
  $: isBeltOrRing = body.roleHint === 'belt' || body.roleHint === 'ring';
  $: isStar = body.roleHint === 'star';
  
  // Auto-switch to Details if opening a special object (Belt/Ring/Star)
  $: if ((isBeltOrRing || isStar) && (selectedTab === 'Basics' || selectedTab === 'Orbit')) {
      selectedTab = 'Details';
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
    {#if !isBeltOrRing && !isStar}
        <button class:active={selectedTab === 'Basics'} on:click={() => setTab('Basics')}>Basics</button>
        <button class:active={selectedTab === 'Orbit'} on:click={() => setTab('Orbit')}>Orbit</button>
    {:else}
        <button class:active={selectedTab === 'Details'} on:click={() => setTab('Details')}>Details</button>
    {/if}
    
    {#if !isBeltOrRing && !isStar}
        <button class:active={selectedTab === 'Temp'} on:click={() => setTab('Temp')}>Temp</button>
        <button class:active={selectedTab === 'Atmosphere'} on:click={() => setTab('Atmosphere')}>Atmosphere</button>
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
          <BodyDetailsTab {body} on:update={handleUpdate} />
      {/if}
    {:else if selectedTab === 'Basics'}
      <BodyBasicsTab {body} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Orbit'}
      <BodyOrbitTab {body} {parentBody} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Temp'}
      <BodyTemperatureTab {body} {rootStar} {parentBody} on:update={handleUpdate} />
    {:else if selectedTab === 'Atmosphere'}
      <BodyAtmosphereTab {body} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Hydro'}
      <BodyHydrosphereTab {body} on:update={handleUpdate} />
    {:else if selectedTab === 'Bio'}
      <BodyBiosphereTab {body} {rulePack} on:update={handleUpdate} />
    {:else if selectedTab === 'Tags'}
      <BodyTagsTab {body} {rulePack} on:update={handleUpdate} />
    {/if}
  </div>

  <div class="actions-row">
    <button class="danger" on:click={() => {
        if (confirm(`Are you sure you want to delete ${body.name}?`)) {
            dispatch('delete', body.id);
        }
    }}>Delete</button>
    <button class="primary" on:click={() => dispatch('close')}>Done</button>
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
    background-color: #333;
    color: #aaa;
    border: 1px solid #444;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
    flex-grow: 1;
  }

  .tabs button.active {
    background-color: #ff3e00;
    color: white;
    border-color: #ff3e00;
  }

  .tab-content {
    background-color: #222;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 5px;
    min-height: 300px;
  }
  
  .live-stats {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #444;
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
      background-color: #007bff;
      color: white;
  }
</style>
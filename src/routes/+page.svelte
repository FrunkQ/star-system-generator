<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { RulePack, System, Starmap as StarmapType, StarSystemNode, Route } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem } from '$lib/api';
  import { starmapStore } from '$lib/starmapStore';
  import { systemStore } from '$lib/stores';
  import NewStarmapModal from '$lib/components/NewStarmapModal.svelte';
  import Starmap from '$lib/components/Starmap.svelte';
  import SystemView from '$lib/components/SystemView.svelte';
  import RouteEditorModal from '$lib/components/RouteEditorModal.svelte';
  import SettingsModal from '$lib/components/SettingsModal.svelte';

  let rulePacks: RulePack[] = [];
  let isLoading = true;
  let error: string | null = null;

  let showNewStarmapModal = false;
  let currentSystemId: string | null = null;
  let selectedSystemForLink: string | null = null;

  let showRouteEditorModal = false;
  let routeToEdit: Route | null = null;
  let showSettingsModal = false;

  let selectedRulepack: RulePack | undefined;
  let fileInput: HTMLInputElement;
  let starmapComponent: Starmap;

  onMount(async () => {
    try {
      const starterRulepack = await fetchAndLoadRulePack('/rulepacks/starter-sf-pack.json');
      rulePacks = [starterRulepack];
      selectedRulepack = starterRulepack;
    } catch (e: any) {
      error = e.message;
    } finally {
      isLoading = false;
    }

    const savedStarmap = localStorage.getItem('stargen_saved_starmap');
    if (savedStarmap) {
      starmapStore.set(JSON.parse(savedStarmap));
    } else {
      showNewStarmapModal = true;
    }
  });

  // Subscribe to systemStore and update starmapStore
  systemStore.subscribe(system => {
    if (system && currentSystemId) {
      starmapStore.update(starmap => {
        if (starmap) {
          const systemNode = starmap.systems.find(s => s.id === currentSystemId);
          if (systemNode) {
            systemNode.system = system;
            systemNode.name = system.name;
          }
        }
        return starmap;
      });
    }
  });

  function handleCreateStarmap(event: CustomEvent<{ name: string; rulepack: RulePack; distanceUnit: string; unitIsPrefix: boolean }>) {
    const { name, rulepack, distanceUnit, unitIsPrefix } = event.detail;
    selectedRulepack = rulepack;
    const seed = `seed-${Date.now()}`;
    const newSystem = generateSystem(seed, rulepack, {}, 'Random', false);
    const newStarmap: StarmapType = {
      id: `starmap-${Date.now()}`,
      name,
      distanceUnit,
      unitIsPrefix,
      systems: [
        {
          id: newSystem.id,
          name: newSystem.name,
          position: { x: 400, y: 300 },
          system: newSystem,
        },
      ],
      routes: [],
    };
    starmapStore.set(newStarmap);
    showNewStarmapModal = false;
  }

  function handleSystemClick(event: CustomEvent<string>) {
    currentSystemId = event.detail;
    const systemNode = get(starmapStore)?.systems.find(s => s.id === currentSystemId);
    if (systemNode) {
      systemStore.set(systemNode.system);
    }
  }

  function handleSystemZoom(event: CustomEvent<string>) {
    currentSystemId = event.detail;
    const systemNode = get(starmapStore)?.systems.find(s => s.id === currentSystemId);
    if (systemNode) {
      systemStore.set(systemNode.system);
    }
  }

  function handleBackToStarmap() {
    currentSystemId = null;
    systemStore.set(null);
  }

  function handleSaveStarmap() {
    if ($starmapStore) {
      console.log('Saving starmap:', $starmapStore);
      localStorage.setItem('stargen_saved_starmap', JSON.stringify($starmapStore));
      alert('Starmap saved to browser storage.');
    }
  }

  function handleLoadStarmap() {
    const savedStarmap = localStorage.getItem('stargen_saved_starmap');
    if (savedStarmap) {
      const loadedData = JSON.parse(savedStarmap);
      console.log('Loaded starmap:', loadedData);
      starmapStore.set(loadedData);
      alert('Starmap loaded from browser storage.');
    } else {
      alert('No starmap found in browser storage.');
    }
  }

  function handleAddSystemAt(event: CustomEvent<{ x: number; y: number }>) {
    if (!$starmapStore || !selectedRulepack) return;

    const { x, y } = event.detail;
    const seed = `seed-${Date.now()}`;
    const newSystem = generateSystem(seed, selectedRulepack, {}, 'Random', false);

    const newSystemNode: StarSystemNode = {
      id: newSystem.id,
      name: newSystem.name,
      position: { x, y },
      system: newSystem,
    };

    starmapStore.update(starmap => {
      if (starmap) {
        starmap.systems = [...starmap.systems, newSystemNode];
      }
      return starmap;
    });
  }



  function handleSelectSystemForLink(event: CustomEvent<string>) {
    const systemId = event.detail;
    if (!selectedSystemForLink) {
      selectedSystemForLink = systemId;
    } else if (selectedSystemForLink !== systemId) {
      // Create a link between selectedSystemForLink and systemId
      if (!$starmapStore) return;

      const newRoute: Route = {
        id: `route-${Date.now()}`,
        sourceSystemId: selectedSystemForLink,
        targetSystemId: systemId,
        distance: Math.floor(Math.random() * 10) + 1, // Placeholder distance
        unit: $starmapStore.distanceUnit,
        lineStyle: 'solid',
      };

      starmapStore.update(starmap => {
        if (starmap) {
          starmap.routes = [...starmap.routes, newRoute];
        }
        return starmap;
      });

      selectedSystemForLink = null;
    } else {
      // Clicking the same system again deselects it
      selectedSystemForLink = null;
    }
  }

  function handleEditRoute(event: CustomEvent<Route>) {
    routeToEdit = event.detail;
    showRouteEditorModal = true;
  }

  function handleSaveRoute(event: CustomEvent<Route>) {
    const updatedRoute = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        const index = starmap.routes.findIndex(r => r.id === updatedRoute.id);
        if (index !== -1) {
          starmap.routes[index] = updatedRoute;
        }
      }
      return starmap;
    });
    routeToEdit = null;
    showRouteEditorModal = false;
  }

  function handleDeleteRoute(event: CustomEvent<string>) {
    const routeIdToDelete = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        starmap.routes = starmap.routes.filter(r => r.id !== routeIdToDelete);
      }
      return starmap;
    });
    routeToEdit = null;
    showRouteEditorModal = false;
  }

  function handleDeleteSystem(event: CustomEvent<string>) {
    const systemIdToDelete = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        starmap.systems = starmap.systems.filter(s => s.id !== systemIdToDelete);
        starmap.routes = starmap.routes.filter(r => r.sourceSystemId !== systemIdToDelete && r.targetSystemId !== systemIdToDelete);
      }
      return starmap;
    });
    selectedSystemForLink = null; // Deselect after deletion
    currentSystemId = null; // If the deleted system was being viewed, go back to starmap
    systemStore.set(null);
  }

  function handleClearStarmap() {
    if (confirm('ARE YOU SURE? This will clear the entire starmap and cannot be undone.')) {
      starmapStore.set(null);
      localStorage.removeItem('stargen_saved_starmap');
      showNewStarmapModal = true;
    }
  }

  function handleDownloadStarmap() {
    if (!$starmapStore) return;

    const data = JSON.stringify($starmapStore, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$starmapStore.name.replace(/\s/g, '_') || 'starmap'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUploadStarmap() {
    fileInput.click();
  }

  function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        // Basic validation
        if (data.id && data.name && Array.isArray(data.systems) && Array.isArray(data.routes)) {
          starmapStore.set(data);
        } else {
          alert('Invalid starmap file.');
        }
      } catch (e) {
        alert('Error reading starmap file.');
      }
    };

    reader.readAsText(file);
  }


  function handleSaveSettings(event: CustomEvent<{ starmap: Partial<StarmapType>, ai: any }>) {
    const { starmap: starmapSettings, ai: aiSettings } = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        return { ...starmap, ...starmapSettings };
      }
      return starmap;
    });
    // Assuming aiSettings is the complete object to be saved
    localStorage.setItem('stargen_ai_settings', JSON.stringify(aiSettings));
    showSettingsModal = false;
  }


</script>

<main>
  <h1>Star System Generator</h1>

  <input type="file" bind:this={fileInput} on:change={handleFileSelected} style="display: none;" accept=".json" />

  {#if isLoading}
    <p>Loading rule pack...</p>
  {:else if error}
    <p style="color: red;">Error: {error}</p>
  {:else if showNewStarmapModal}
    <NewStarmapModal rulepacks={rulePacks} on:create={handleCreateStarmap} />
  {:else if $starmapStore && !currentSystemId}
    <Starmap
      bind:this={starmapComponent}
      starmap={$starmapStore}
      on:systemclick={handleSystemClick}
      on:systemzoom={handleSystemZoom}
      on:addsystemat={handleAddSystemAt}
      on:selectsystemforlink={handleSelectSystemForLink}
      on:editroute={handleEditRoute}
      on:deletesystem={handleDeleteSystem}
      {selectedSystemForLink}
    />
    <div class="starmap-controls">
      <button on:click={handleSaveStarmap}>Save to Browser</button>
      <button on:click={handleLoadStarmap}>Load from Browser</button>
      <button on:click={handleDownloadStarmap}>Download Starmap</button>
      <button on:click={handleUploadStarmap}>Upload Starmap</button>
      <button on:click={() => showSettingsModal = true}>Settings</button>

      <button on:click={handleClearStarmap} class="delete-button">DELETE Starmap</button>

    </div>
  {:else if $starmapStore && currentSystemId && $systemStore}
    <SystemView system={$systemStore} rulePack={rulePacks[0]} on:back={handleBackToStarmap} />
  {/if}

  {#if showRouteEditorModal && routeToEdit && $starmapStore}
    <RouteEditorModal bind:showModal={showRouteEditorModal} route={routeToEdit} starmap={$starmapStore} on:save={handleSaveRoute} on:delete={handleDeleteRoute} />
  {/if}

  {#if showSettingsModal && $starmapStore}
    <SettingsModal bind:showModal={showSettingsModal} starmap={$starmapStore} on:save={handleSaveSettings} />
  {/if}

  <footer>
    <p>Planet images by Pablo Carlos Budassi, used under a CC BY-SA 4.0 license. Star images from beyond-universe.fandom.com (CC-BY-SA), ESO/L. Calçada (CC BY 4.0 for magnetar image), and NASA’s Goddard Space Flight Center/Jeremy Schnittman (accretion disk image).</p>
  </footer>
</main>

<style>
  main {
    font-family: sans-serif;
    padding: 2em;
  }
  footer {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #333;
      color: #999;
      font-size: 0.9em;
  }
  .starmap-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 10px;
  }

  .delete-button {
    color: red;
  }
</style>
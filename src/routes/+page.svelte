<script lang="ts">
  export let data;
  const { exampleSystems } = data;
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { pushState } from '$app/navigation';
  import { get } from 'svelte/store';
  import type { RulePack, System, Starmap as StarmapType, StarSystemNode, Route } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem, renameNode } from '$lib/api';
  import { starmapStore } from '$lib/starmapStore';
  import { systemStore, viewportStore } from '$lib/stores';
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
  let hasSavedStarmap = false;

  onMount(async () => {
    try {
      const starterRulepack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json');
      rulePacks = [starterRulepack];
      selectedRulepack = starterRulepack;
    } catch (e: any) {
      error = e.message;
    } finally {
      isLoading = false;
    }

    hasSavedStarmap = localStorage.getItem('stargen_saved_starmap') !== null;
    if (hasSavedStarmap) {
      handleLoadStarmap();
    } else {
      showNewStarmapModal = true;
    }
  });

  // Subscribe to systemStore and update starmapStore
  systemStore.subscribe(system => {
    if (system) { // No need to check currentSystemId, the system knows its own ID
      starmapStore.update(starmap => {
        if (starmap) {
          const systemNode = starmap.systems.find(s => s.id === system.id);
          if (systemNode) {
            systemNode.system = system;
            systemNode.name = system.name;
          }
        }
        return starmap;
      });
    }
  });

  // Auto-save the starmap to local storage whenever it changes
  $: if (browser && $starmapStore) {
    localStorage.setItem('stargen_saved_starmap', JSON.stringify($starmapStore));
    hasSavedStarmap = true;
  }

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
      if (systemNode.viewport) {
        viewportStore.set(systemNode.viewport);
      } else {
        viewportStore.set({ pan: { x: 0, y: 0 }, zoom: 1 });
      }
      systemStore.set(JSON.parse(JSON.stringify(systemNode.system)));
      pushState('', { systemId: currentSystemId });
    }
  }

  function handleSystemZoom(event: CustomEvent<string>) {
    currentSystemId = event.detail;
    const systemNode = get(starmapStore)?.systems.find(s => s.id === currentSystemId);
    if (systemNode) {
      systemStore.set(JSON.parse(JSON.stringify(systemNode.system)));
    }
  }

    function handleBackToStarmap() {

      // Save current system state before leaving

      if (currentSystemId) {

          const currentViewport = get(viewportStore);

          const currentSystem = get(systemStore);

  

          starmapStore.update(starmap => {

              if (starmap && currentSystem) {

                  const systemNode = starmap.systems.find(s => s.id === currentSystemId);

                  if (systemNode) {

                      systemNode.viewport = currentViewport;

                      systemNode.system = currentSystem;

                      systemNode.name = currentSystem.name; // Also update the name at the node level

                  }

              }

              return starmap;

          });

      }

      // Clear current system and explicitly set browser state to represent starmap view

      currentSystemId = null;

      systemStore.set(null);

      replaceState('', {}); // Replace current history entry with an empty state

    }

  function handleLoadStarmap() {
    const savedStarmap = localStorage.getItem('stargen_saved_starmap');
    if (savedStarmap) {
      const loadedData = JSON.parse(savedStarmap);
      console.log('Loaded starmap:', loadedData);
      starmapStore.set(loadedData);
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

  function handleRenameNode(event: CustomEvent<{nodeId: string, newName: string}>) {
    if (!$systemStore) return;
    const { nodeId, newName } = event.detail;
    systemStore.set(renameNode($systemStore, nodeId, newName));
  }

  function handleClearStarmap() {
    if (confirm('ARE YOU SURE? This will clear the current starmap from the screen. Your saved starmap in browser storage will remain.')) {
      starmapStore.set(null);
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
    a.download = `${$starmapStore.name.replace(/\s/g, '_') || 'starmap'}-Starmap.json`;
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
        if (data.id && data.name && Array.isArray(data.systems) && Array.isArray(data.routes) && typeof data.distanceUnit === 'string' && typeof data.unitIsPrefix === 'boolean') {
          starmapStore.set(data);
          showNewStarmapModal = false;
        } else {
          alert('Invalid starmap file. Missing starmap-specific properties.');
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


  <input type="file" bind:this={fileInput} on:change={handleFileSelected} style="display: none;" accept=".json" />

  {#if isLoading}
    <p>Loading rule pack...</p>
  {:else if error}
    <p style="color: red;">Error: {error}</p>
  {:else if showNewStarmapModal}
    <NewStarmapModal rulepacks={rulePacks} {hasSavedStarmap} on:create={handleCreateStarmap} on:load={handleLoadStarmap} on:upload={handleUploadStarmap} />
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
      on:download={handleDownloadStarmap}
      on:upload={handleUploadStarmap}
      on:clear={handleClearStarmap}
      on:settings={() => showSettingsModal = true}
      {selectedSystemForLink}
    />

        <footer class="starmap-footer">

          <p><strong>Image Attributions:</strong></p>

          <p>Planet Images: Courtesy of Pablo Carlos Budassi, used under a <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> license. Source: <a href="https://pablocarlosbudassi.com/2021/02/planet-types.html" target="_blank" rel="noopener noreferrer">pablocarlosbudassi.com</a>.</p>

          <p>Star Images: Sourced from the <a href="https://beyond-universe.fandom.com/wiki/" target="_blank" rel="noopener noreferrer">Beyond Universe Wiki</a> on Fandom, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/us/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a> license.</p>

          <p>Magnetar Image & Starmap Background: Courtesy of ESO/L. Calçada & S. Brunier, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Sources: <a href="https://www.eso.org/public/images/eso1415a/" target="_blank" rel="noopener noreferrer">ESO Magnetar</a>, <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO Milky Way</a>.</p>

          <p>Black Hole Accretion Disk Image: Courtesy of NASA’s Goddard Space Flight Center/Jeremy Schnittman, used under a <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">Public Domain</a> license. Source: <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">NASA SVS</a>.</p>

          <p>Weyland-Yutani Logo: Sourced from <a href="https://commons.wikimedia.org/wiki/File:Weyland-Yutani_cryo-tube.jpg" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> by <a href="https://commons.wikimedia.org/wiki/User:IllaZilla" target="_blank" rel="noopener noreferrer">IllaZilla</a>, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.en" target="_blank" rel="noopener noreferrer">Creative Commons Attribution-Share Alike 3.0 Unported</a> license. Changes made: Logo Extracted.</p>

          <p class="project-attribution">

            <a href="https://github.com/FrunkQ/star-system-generator" target="_blank" rel="noopener noreferrer">Star System Generator</a> © 2025 FrunkQ. Licensed under <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>.

          </p>

        </footer>
  {:else if $starmapStore && currentSystemId && $systemStore}
    <SystemView system={$systemStore} rulePack={rulePacks[0]} {exampleSystems} on:back={handleBackToStarmap} on:renameNode={handleRenameNode} />
  {/if}

  {#if showRouteEditorModal && routeToEdit && $starmapStore}
    <RouteEditorModal bind:showModal={showRouteEditorModal} route={routeToEdit} starmap={$starmapStore} on:save={handleSaveRoute} on:delete={handleDeleteRoute} />
  {/if}

  {#if showSettingsModal && $starmapStore}
    <SettingsModal bind:showModal={showSettingsModal} starmap={$starmapStore} on:save={handleSaveSettings} />
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    padding: 0.5em;
  }
  footer {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #333;
      color: #999;
      font-size: 0.9em;
  }

  .starmap-footer {
    margin-top: 2em; /* Ensure it's below other content */
    background-color: rgba(0, 0, 0, 0.7);
    color: #ccc; /* Slightly lighter for readability */
    padding: 10px 20px;
    font-size: 0.8em; /* Increased font size */
    text-align: center;
    z-index: 100;
    /* No fixed or absolute positioning here */
  }
  .starmap-footer a {
    color: #88ccff;
    text-decoration: none;
    pointer-events: auto; /* Re-enable clicks on links */
  }
</style>
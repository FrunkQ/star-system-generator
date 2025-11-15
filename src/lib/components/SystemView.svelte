<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { deleteNode, addPlanetaryBody, renameNode, addHabitablePlanet, generateSystem, computePlayerSnapshot } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import SystemSummary from './SystemSummary.svelte';
  import SystemGenerationControls from './SystemGenerationControls.svelte';
  import SystemSummaryContextMenu from './SystemSummaryContextMenu.svelte'; // New import
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';
  import BodyImage from './BodyImage.svelte';
  import BodyGmTools from './BodyGmTools.svelte';
  import DescriptionEditor from './DescriptionEditor.svelte';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import ZoneKey from './ZoneKey.svelte';
  import ContextMenu from './ContextMenu.svelte'; // Import the generic context menu
  import AddConstructModal from './AddConstructModal.svelte'; // Import the new modal

  import { systemStore, viewportStore } from '$lib/stores';
  import { panStore, zoomStore } from '$lib/cameraStore';
  import { get } from 'svelte/store';
  import { processSystemData } from '$lib/system/postprocessing';

  export let system: System;
  export let rulePack: RulePack;
  export let exampleSystems: string[];

  const dispatch = createEventDispatcher();

  const generatedSystem = systemStore;
  let visualizer: SystemVisualizer;
  let shareStatus = '';
  let showJson = false;
  let generationOptions: string[] = ['Random'];
  let selectedGenerationOption = 'Random';
  let showDropdown = false;
  let showNames = true;
  let showZones = false;
  let showLPoints = false;
  let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastToytownFactor: number | undefined = undefined;

  // Context Menu State
  let showSummaryContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: CelestialBody[] = [];
  let contextMenuType = '';
  let contextMenuNode: CelestialBody | Barycenter | null = null; // For the generic context menu

  // Add Construct Modal State
  let showAddConstructModal = false;
  let constructHostBody: CelestialBody | null = null;

  function handleShowContextMenu(event: CustomEvent<{ x: number, y: number, items: any[], type: string }>) {
    contextMenuItems = event.detail.items;
    contextMenuX = event.detail.x;
    contextMenuY = event.detail.y;
    contextMenuType = event.detail.type;
    showSummaryContextMenu = true;
  }

  function handleShowBodyContextMenu(event: CustomEvent<{ node: CelestialBody, x: number, y: number }>) {
    contextMenuNode = event.detail.node;
    contextMenuX = event.detail.x;
    contextMenuY = event.detail.y;
    showSummaryContextMenu = true; // Re-use the same visibility flag
    contextMenuType = 'generic'; // A new type to distinguish from the summary menu
  }

  function handleAddConstruct(event: CustomEvent<CelestialBody>) {
    constructHostBody = event.detail;
    showAddConstructModal = true;
    showSummaryContextMenu = false; // Close the context menu
  }

  function handleContextMenuSelect(event: CustomEvent<string>) {
    showSummaryContextMenu = false;
    handleFocus({ detail: event.detail } as CustomEvent<string | null>);
  }

  // Ensure toytownFactor exists for backward compatibility
  $: if ($systemStore && typeof $systemStore.toytownFactor === 'undefined') {
    $systemStore.toytownFactor = 0;
  }

  // Throttle the resetView call only when the slider value actually changes
  $: if ($systemStore && $systemStore.toytownFactor !== lastToytownFactor) {
    lastToytownFactor = $systemStore.toytownFactor;
    if (!throttleTimeout) {
      throttleTimeout = setTimeout(() => {
        visualizer?.resetView();
        throttleTimeout = null;
      }, 250);
    }
  }

  // Time state
  let currentTime = Date.now();
  let isPlaying = false;
  let timeScale = 3600 * 24 * 30;
  let animationFrameId: number;

  // Focus state
  let focusedBodyId: string | null = null;
  let focusedBody: CelestialBody | null = null;

  $: {
    if ($systemStore && focusedBodyId) {
        focusedBody = $systemStore.nodes.find(n => n.id === focusedBodyId) as CelestialBody;
    } else if ($systemStore) {
        focusedBody = $systemStore.nodes.find(n => n.parentId === null) as CelestialBody;
    } else {
        focusedBody = null;
    }
  }

  function handleSliderRelease() {
    // Ensure a final reset is called when the user lets go of the slider
    if (throttleTimeout) {
      clearTimeout(throttleTimeout);
      throttleTimeout = null;
    }
    visualizer?.resetView();
  }

  function play() {
    if (!browser) return;
    isPlaying = true;
    let lastTimestamp: number | null = null;

    function tick(timestamp: number) {
      if (lastTimestamp) {
        const delta = (timestamp - lastTimestamp) / 1000;
        currentTime += delta * timeScale * 1000;
      }
      lastTimestamp = timestamp;
      if (isPlaying) {
        animationFrameId = requestAnimationFrame(tick);
      }
    }
    animationFrameId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!browser) return;
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);
  }

  async function handleGenerate(empty: boolean = false) {
    const seed = `seed-${Date.now()}`;
    const newSystem = generateSystem(seed, rulePack, {}, selectedGenerationOption, empty, $systemStore?.toytownFactor || 0);
    systemStore.set(newSystem);
    currentTime = newSystem.epochT0;
    focusedBodyId = null;
  }

  function handleFocus(event: CustomEvent<string | null>) {
    focusedBodyId = event.detail;
    history.pushState({ focusedBodyId }, '');
  }

  function handlePopState(event: PopStateEvent) {
    console.log('handlePopState called');
    if (focusedBody?.parentId) {
        console.log('Zooming out to parent');
        focusedBodyId = focusedBody.parentId;
    } else {
        console.log('Dispatching back event');
        dispatch('back');
    }
  }

  function zoomOut() {
    history.back();
  }

  function handleDeleteNode(event: CustomEvent<string>) {
    if (!$systemStore) return;
    const nodeId = event.detail;
    const nodeToDelete = $systemStore.nodes.find(n => n.id === nodeId);

    // Decide the next focus target BEFORE deleting
    let nextFocusId: string | null = null;
    if (focusedBodyId === nodeId) {
        if (nodeToDelete?.parentId) {
            nextFocusId = nodeToDelete.parentId;
        } else {
            // No parent, so we should go back to the starmap
            dispatch('back'); 
            // We still need to update the store to reflect the deletion
            systemStore.set(deleteNode($systemStore, nodeId));
            return; // Exit early
        }
    }

    // Update the system state with the deleted node and mark as edited
    systemStore.set({ ...deleteNode($systemStore, nodeId), isManuallyEdited: true });

    // If we determined a new focus is needed, trigger it now to get the animation
    if (nextFocusId) {
        handleFocus({ detail: nextFocusId } as CustomEvent<string | null>);
    }
  }

  function handleAddNode(event: CustomEvent<{hostId: string, planetType: string}>) {
      if (!$systemStore) return;
      const { hostId, planetType } = event.detail;
      try {
        systemStore.set({ ...addPlanetaryBody($systemStore, hostId, planetType, rulePack), isManuallyEdited: true });
        if (visualizer) {
          visualizer.resetView();
        }
      } catch (e: any) {
        alert(e.message);
      }
  }

  function handleAddHabitablePlanet(event: CustomEvent<{hostId: string, habitabilityType: 'earth-like' | 'human-habitable' | 'alien-habitable'}>) {
      if (!$systemStore) return;
      const { hostId, habitabilityType } = event.detail;
      try {
        systemStore.set({ ...addHabitablePlanet($systemStore, hostId, habitabilityType, rulePack), isManuallyEdited: true });
      } catch (e: any) {
        alert(e.message);
      }
  }

  async function handleLoadExample(event: CustomEvent<string>) {
    const fileName = event.detail;
    if (!fileName) return;

    try {
      const response = await fetch(`/examples/${fileName}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${fileName}`);
      }
      let newSystem = await response.json();
      if (newSystem.id && newSystem.name && Array.isArray(newSystem.nodes) && newSystem.rulePackId) {
        systemStore.set(processSystemData(newSystem, rulePack));
        currentTime = newSystem?.epochT0 || Date.now();
        focusedBodyId = null;
      } else {
        alert('Invalid system file. Missing system-specific properties.');
      }
    } catch (err) {
      alert('Failed to parse JSON file.');
      console.error(err);
    }
  }


  function handleDownloadJson() {
    if (!$systemStore) return;
    const json = JSON.stringify($systemStore, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$systemStore.name.replace(/\s+/g, '_') || 'system'}-System.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleUploadJson(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = e.target?.result as string;
        let newSystem = JSON.parse(json);
        if (newSystem.id && newSystem.name && Array.isArray(newSystem.nodes) && newSystem.rulePackId) {
          systemStore.set(processSystemData(newSystem, rulePack));
          currentTime = newSystem?.epochT0 || Date.now();
          focusedBodyId = null;
        } else {
          alert('Invalid system file. Missing system-specific properties.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  async function handleShare() {
      if (!$systemStore) return;
      try {
          const snapshot = computePlayerSnapshot($systemStore);
          const json = JSON.stringify(snapshot);
          const base64 = btoa(json);
          const url = `${window.location.origin}/p/${base64}`;
          await navigator.clipboard.writeText(url);
          shareStatus = 'Link copied to clipboard!';
      } catch (err) {
          shareStatus = 'Failed to copy link.';
          console.error(err);
      }
      setTimeout(() => shareStatus = '', 3000);
  }

  let unsubscribePanStore: () => void;
  let unsubscribeZoomStore: () => void;

  onMount(() => {
    systemStore.set(processSystemData(system, rulePack));
    currentTime = system.epochT0;
    const starTypes = rulePack.distributions['star_types'].entries.map(st => st.value);
    const options: string[] = ['Random'];
    starTypes.forEach(st => {
      const typeName = st.replace('star/', '');
      options.push(`Type ${typeName}`);
      options.push(`Type ${typeName} Binary`);
    });
    generationOptions = options;

    // Sync viewportStore to panStore and zoomStore on mount
    const currentViewport = get(viewportStore);
    panStore.set(currentViewport.pan, { duration: 0 });
    zoomStore.set(currentViewport.zoom, { duration: 0 });

    // Sync panStore and zoomStore back to viewportStore on change
    unsubscribePanStore = panStore.subscribe(panState => {
        viewportStore.update(v => ({ ...v, pan: panState }));
    });
    unsubscribeZoomStore = zoomStore.subscribe(zoomState => {
        viewportStore.update(v => ({ ...v, zoom: zoomState }));
    });

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    if (browser) {
      pause();
    }
    if (unsubscribePanStore) {
        unsubscribePanStore();
    }
    if (unsubscribeZoomStore) {
        unsubscribeZoomStore();
    }
    window.removeEventListener('popstate', handlePopState);
    document.removeEventListener('click', handleClickOutside);
  });

  function handleClickOutside(event: MouseEvent) {
    if (showSummaryContextMenu) {
      const menu = document.querySelector('.context-menu');
      if (menu && !menu.contains(event.target as Node)) {
        showSummaryContextMenu = false;
      }
    }
  }

  function closeContextMenuOnClickOutside(event: MouseEvent) {
    const contextMenu = document.querySelector('.context-menu');
    if (contextMenu && !contextMenu.contains(event.target as Node)) {
      showSummaryContextMenu = false;
    }
  }

</script>
<main>
    <div class="top-bar">
        
    </div>

  {#if $systemStore}
    <SystemSummary 
      system={$systemStore} 
      {focusedBody}
      bind:showDropdown
      {handleDownloadJson}
      {handleUploadJson}
      {handleShare}
      on:showcontextmenu={handleShowContextMenu}
      on:clearmanualedit={() => systemStore.update(s => s ? { ...s, isManuallyEdited: false } : s)}
    />

    {#if !$systemStore.isManuallyEdited}
      <SystemGenerationControls
        system={$systemStore}
        {generationOptions}
        bind:selectedGenerationOption={selectedGenerationOption}
        {exampleSystems}
        {handleGenerate}
        on:loadexample={handleLoadExample}
      />
    {/if}

    <div class="controls">
        {#if focusedBody}
            <button on:click={zoomOut}>Zoom Out</button>
        {/if}
        <button on:click={() => visualizer?.resetView()}>Reset View</button>
        <label>
            <input type="checkbox" bind:checked={showNames} />
            Toggle Names
        </label>
        <label>
            <input type="checkbox" bind:checked={showZones} />
            Show Zones
        </label>
        <label>
            <input type="checkbox" bind:checked={showLPoints} />
            Show L-Points
        </label>
        <label>
            Toytown View:
            <input type="range" min="0" max="1" step="0.01" bind:value={$systemStore.toytownFactor} on:change={handleSliderRelease} />
        </label>
        <button on:click={() => isPlaying ? pause() : play()}>
            {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div class="time-scales">
            <span>1s = </span>
            <button on:click={() => timeScale = 1} class:active={timeScale === 1}>1s</button>
            <button on:click={() => timeScale = 3600} class:active={timeScale === 3600}>1h</button>
            <button on:click={() => timeScale = 3600 * 24} class:active={timeScale === 3600 * 24}>1d</button>
            <button on:click={() => timeScale = 3600 * 24 * 30} class:active={timeScale === 3600 * 24 * 30}>30d</button>
            <button on:click={() => timeScale = 3600 * 24 * 90} class:active={timeScale === 3600 * 24 * 90}>90d</button>
            <button on:click={() => timeScale = 3600 * 24 * 365} class:active={timeScale === 3600 * 24 * 365}>1y</button>
            <button on:click={() => timeScale = 3600 * 24 * 365 * 10} class:active={timeScale === 3600 * 24 * 365 * 10}>10y</button>
        </div>
    </div>

    <div class="system-view-grid">
        <div class="main-view">
            <SystemVisualizer bind:this={visualizer} system={$systemStore} {rulePack} {currentTime} {focusedBodyId} {showNames} {showZones} {showLPoints} toytownFactor={$systemStore.toytownFactor} on:focus={handleFocus} on:showBodyContextMenu={handleShowBodyContextMenu} />

            <BodyGmTools body={focusedBody} on:deleteNode={handleDeleteNode} on:addNode={handleAddNode} on:addHabitablePlanet={handleAddHabitablePlanet} />
            {#if focusedBody && focusedBody.kind === 'body'}
                <DescriptionEditor body={focusedBody} on:change={() => systemStore.update(s => s ? { ...s, isManuallyEdited: true } : s)} />
            {/if}
        </div>
        <div class="details-view">
            <input type="text" value={focusedBody.name} on:change={(e) => {
              dispatch('renameNode', {nodeId: focusedBody.id, newName: e.target.value});
              systemStore.update(s => s ? { ...s, isManuallyEdited: true } : s);
            }} class="name-input" title="Click to rename" />
            {#if showZones && focusedBody.roleHint === 'star'}
                <ZoneKey />
            {:else}
                <BodyTechnicalDetails body={focusedBody} {rulePack} />
            {/if}
            <BodyImage body={focusedBody} />
            <GmNotesEditor body={focusedBody} on:change={() => systemStore.update(s => s ? { ...s, isManuallyEdited: true } : s)} />
        </div>

    </div>

    {#if showSummaryContextMenu}
      {#if contextMenuType === 'generic'}
        <ContextMenu selectedNode={contextMenuNode} x={contextMenuX} y={contextMenuY} on:addConstruct={handleAddConstruct} />
      {:else}
        <SystemSummaryContextMenu items={contextMenuItems} x={contextMenuX} y={contextMenuY} type={contextMenuType} on:select={handleContextMenuSelect} />
      {/if}
    {/if}

    {#if showAddConstructModal && constructHostBody}
      <AddConstructModal {rulePack} hostBody={constructHostBody} orbitalBoundaries={constructHostBody.orbitalBoundaries} on:close={() => showAddConstructModal = false} />
    {/if}

    <div class="debug-controls">
        <button on:click={() => showJson = !showJson}>
            {showJson ? 'Hide' : 'Show'} JSON
        </button>
    </div>

    {#if showJson}
        <pre>{JSON.stringify($systemStore, null, 2)}</pre>
    {/if}
  {/if}
</main>


<style>
  main {
    font-family: sans-serif;
    padding: 0.5em;
    font-size: 0.9em;
    position: relative; /* Needed for context menu positioning */
  }
  .top-bar, .controls {
    margin: 0.5em 0;
    display: flex;
    align-items: center;
    gap: 1em;
  }
  .top-bar {
      justify-content: space-between;
  }
  .focus-header h2 {
      margin: 0;
  }
  .time-scales {
    display: flex;
    align-items: center;
    gap: 0.5em;
    background-color: #444;
    padding: 0.25em;
    border-radius: 5px;
  }
  .time-scales button {
      border: 1px solid #666;
      background-color: #555;
      color: #eee;
  }
  .time-scales button.active {
      border-color: #88ccff;
      background-color: #007bff;
      color: white;
  }
  .debug-controls {
      margin-top: 1em;
  }
  pre {
    background-color: #1a1a1a;
    border: 1px solid #333;
    padding: 1em;
    border-radius: 5px;
    white-space: pre-wrap;
    color: #eee;
    font-family: monospace;
  }

  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-content {
    display: block;
    position: absolute;
    background-color: #333;
    min-width: 160px;
    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
    z-index: 1;
    right: 0;
  }

  .dropdown-content button {
    color: #eee;
    padding: 12px 16px;
    text-decoration: none;
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
  }

  .dropdown-content button:hover {background-color: #555;}

  .hamburger-button {
    font-size: 1.5em;
    background: none;
    border: none;
    color: #eee;
  }

  .todo-button {
    color: #888 !important;
  }

  .system-view-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1em;
  }

  .main-view {
    grid-column: 1;
  }

  .details-view {
    grid-column: 2;
  }

  .name-input {
    background-color: transparent;
    border: 1px solid transparent;
    color: #ff3e00;
    font-size: 1.8em;
    font-weight: bold;
    padding: 0.1em;
    margin: 0;
    width: 100%;
    border-radius: 4px;
  }
  .name-input:hover, .name-input:focus {
      background-color: #252525;
      border-color: #444;
  }
</style>

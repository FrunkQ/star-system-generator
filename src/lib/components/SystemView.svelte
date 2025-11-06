<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { deleteNode, addPlanetaryBody, renameNode, addHabitablePlanet, generateSystem, computePlayerSnapshot } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import SystemSummary from './SystemSummary.svelte';
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';
  import BodyImage from './BodyImage.svelte';
  import BodyGmTools from './BodyGmTools.svelte';
  import DescriptionEditor from './DescriptionEditor.svelte';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import ZoneKey from './ZoneKey.svelte';

  import { systemStore } from '$lib/stores';

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

  function handleGenerate(empty: boolean = false) {
    const seed = `seed-${Date.now()}`;
    const newSystem = generateSystem(seed, rulePack, {}, selectedGenerationOption, empty);
    systemStore.set(newSystem);
    currentTime = newSystem.epochT0;
    focusedBodyId = null;
    visualizer?.resetView();
  }

  function handleFocus(event: CustomEvent<string | null>) {
    focusedBodyId = event.detail;
    history.pushState({ focusedBodyId }, '');
    visualizer?.resetView();
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
    visualizer?.resetView();
  }

  function zoomOut() {
    history.back();
  }

  function handleDeleteNode(event: CustomEvent<string>) {
      if (!$systemStore) return;
      const nodeId = event.detail;
      systemStore.set(deleteNode($systemStore, nodeId));
      // If the deleted node was focused, zoom out to its parent
      if (focusedBodyId === nodeId) {
          zoomOut();
      }
  }

  function handleAddNode(event: CustomEvent<{hostId: string, planetType: string}>) {
      if (!$systemStore) return;
      const { hostId, planetType } = event.detail;
      systemStore.set(addPlanetaryBody($systemStore, hostId, planetType, rulePack));
  }

  function handleAddHabitablePlanet(event: CustomEvent<{hostId: string, habitabilityType: 'earth-like' | 'human-habitable' | 'alien-habitable'}>) {
      if (!$systemStore) return;
      const { hostId, habitabilityType } = event.detail;
      try {
        systemStore.set(addHabitablePlanet($systemStore, hostId, habitabilityType, rulePack));
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
      const newSystem = await response.json();
      if (newSystem.id && newSystem.name && Array.isArray(newSystem.nodes) && newSystem.rulePackId) {
        systemStore.set(newSystem);
        currentTime = newSystem?.epochT0 || Date.now();
        focusedBodyId = null;
        visualizer?.resetView();
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
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const newSystem = JSON.parse(json);
        if (newSystem.id && newSystem.name && Array.isArray(newSystem.nodes) && newSystem.rulePackId) {
          systemStore.set(newSystem);
          currentTime = newSystem?.epochT0 || Date.now();
          focusedBodyId = null;
          visualizer?.resetView();
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

  function getPlanetColor(node: CelestialBody): string {
    if (node.roleHint === 'star') return '#fff'; // White
    if (node.tags?.some(t => t.key === 'habitability/earth-like' || t.key === 'habitability/human')) return '#007bff'; // Blue
    if (node.biosphere) return '#00ff00'; // Green
    const isIceGiant = node.classes?.some(c => c.includes('ice-giant'));
    if (isIceGiant) return '#add8e6'; // Light Blue
    const isGasGiant = node.classes?.some(c => c.includes('gas-giant'));
    if (isGasGiant) return '#ff0000'; // Red
    return '#ffa500'; // Orange
  }

  onMount(() => {
    systemStore.set(system);
    currentTime = system.epochT0;
    const starTypes = rulePack.distributions['star_types'].entries.map(st => st.value);
    const options: string[] = ['Random'];
    starTypes.forEach(st => {
      const typeName = st.replace('star/', '');
      options.push(`Type ${typeName}`);
      options.push(`Type ${typeName} Binary`);
    });
    generationOptions = options;

    window.addEventListener('popstate', handlePopState);
  });

  onDestroy(() => {
    if (browser) {
      pause();
    }
    window.removeEventListener('popstate', handlePopState);
  });

</script>

<main>
    <div class="top-bar">
        <div class="focus-header">
            <h2>Star System View - Current Focus: {focusedBody?.name || 'System View'}</h2>
        </div>
        <div class="save-load-controls">
            <div class="dropdown">
                <button on:click={() => showDropdown = !showDropdown} class="hamburger-button">&#9776;</button>
                {#if showDropdown}
                    <div class="dropdown-content">
                        <button on:click={handleDownloadJson} disabled={!$systemStore}>Download System</button>
                        <button on:click={() => document.getElementById('upload-json')?.click()}>Upload System</button>
                        <button on:click={handleShare} class="todo-button">Share Player Link (Todo)</button>
                        <button on:click={() => alert('This is a star system generator.')}>About</button>
                    </div>
                {/if}
            </div>
            <input type="file" id="upload-json" hidden accept=".json,application/json" on:change={handleUploadJson} />
        </div>
    </div>

  {#if $systemStore}
    {#if focusedBody?.parentId === null}
        <SystemSummary system={$systemStore} {generationOptions} bind:selectedGenerationOption={selectedGenerationOption} {exampleSystems} {handleGenerate} on:loadexample={handleLoadExample} />
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
            <SystemVisualizer bind:this={visualizer} system={$systemStore} {currentTime} {focusedBodyId} {showNames} {showZones} {showLPoints} {getPlanetColor} visualScalingMultiplier={$systemStore.visualScalingMultiplier || 1.0} on:focus={handleFocus} />
            <div class="visual-scaling-slider">
                <div class="slider-label">Visibility slider</div>
                <span>Actual Size</span>
                <input type="range" min="0.01" max="1.0" step="0.005" bind:value={$systemStore.visualScalingMultiplier} style="width: 80%;" />
                <span>Enlarged</span>
            </div>
            <BodyGmTools body={focusedBody} on:deleteNode={handleDeleteNode} on:addNode={handleAddNode} on:addHabitablePlanet={handleAddHabitablePlanet} />
            {#if focusedBody && focusedBody.kind === 'body'}
                <DescriptionEditor body={focusedBody} />
            {/if}
        </div>
        <div class="details-view">
            <input type="text" value={focusedBody.name} on:change={(e) => dispatch('renameNode', {nodeId: focusedBody.id, newName: e.target.value})} class="name-input" title="Click to rename" />
            {#if showZones && focusedBody.roleHint === 'star'}
                <ZoneKey />
            {:else}
                <BodyTechnicalDetails body={focusedBody} />
            {/if}
            <BodyImage body={focusedBody} />
            <GmNotesEditor body={focusedBody} />
        </div>

    </div>

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
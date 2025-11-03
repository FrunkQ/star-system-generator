<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { deleteNode, addPlanetaryBody, renameNode, addHabitablePlanet, generateSystem, computePlayerSnapshot } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import BodyDetails from '$lib/components/BodyDetails.svelte';
  import SystemSummary from '$lib/components/SystemSummary.svelte';

  import { systemStore } from '$lib/stores';

  export let system: System;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  const generatedSystem = systemStore;
  let visualizer: SystemVisualizer;
  let shareStatus = '';
  let showJson = false;
  let generationOptions: string[] = ['Random'];
  let selectedGenerationOption = 'Random';

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
    visualizer?.resetView();
  }

  function zoomOut() {
      if (focusedBody?.parentId) {
          focusedBodyId = focusedBody.parentId;
      } else {
          focusedBodyId = null;
      }
    visualizer?.resetView();
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

    function handleRenameNode(event: CustomEvent<{nodeId: string, newName: string}>) {
      if (!$systemStore) return;
      const { nodeId, newName } = event.detail;
      systemStore.set(renameNode($systemStore, nodeId, newName));
    }
  
    function handleSaveToBrowser() {    if (!$systemStore) return;
    localStorage.setItem('stargen_saved_system', JSON.stringify($systemStore));
    alert('System saved to browser storage.');
  }

  function handleLoadFromBrowser() {
    const savedJson = localStorage.getItem('stargen_saved_system');
    if (savedJson) {
      try {
        const newSystem = JSON.parse(savedJson);
        systemStore.set(newSystem);
        currentTime = newSystem?.epochT0 || Date.now();
        focusedBodyId = null;
        visualizer?.resetView();
      } catch (e) {
        alert('Failed to load system from browser storage. The data may be corrupt.');
        console.error(e);
      }
    } else {
      alert('No system found in browser storage.');
    }
  }

  function handleDownloadJson() {
    if (!$systemStore) return;
    const json = JSON.stringify($systemStore, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$systemStore.name.replace(/\s+/g, '_') || 'system'}.json`;
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
        systemStore.set(newSystem);
        currentTime = newSystem?.epochT0 || Date.now();
        focusedBodyId = null;
        visualizer?.resetView();
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
  });

  onDestroy(() => {
    if (browser) {
      pause();
    }
  });

</script>

<main>
    <div class="top-bar">
        <button on:click={() => dispatch('back')}>Back to Starmap</button>
        <div class="gen-controls">
            <select bind:value={selectedGenerationOption}>
                {#each generationOptions as option (option)}
                    <option value={option}>{option}</option>
                {/each}
            </select>
            <button on:click={() => handleGenerate(false)}>
              Generate System
            </button>
            <button on:click={() => handleGenerate(true)}>
              Generate Empty System
            </button>
        </div>
        <div class="save-load-controls">
            <button on:click={handleSaveToBrowser}>Save to Browser</button>
            <button on:click={handleLoadFromBrowser}>Load from Browser</button>
            <button on:click={handleDownloadJson} disabled={!$systemStore}>Download JSON</button>
            <button on:click={() => document.getElementById('upload-json')?.click()}>Upload JSON</button>
            <input type="file" id="upload-json" hidden accept=".json,application/json" on:change={handleUploadJson} />
        </div>
        {#if $systemStore}
            <div class="share-controls">
                <button on:click={handleShare}>Share Player Link</button>
                {#if shareStatus}<span>{shareStatus}</span>{/if}
            </div>
        {/if}
    </div>

  {#if $systemStore}
    <div class="controls">
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
        </div>
    </div>

    <div class="focus-header">
        <h2>Current Focus: {focusedBody?.name || 'System View'}</h2>
        <button on:click={() => visualizer?.resetView()}>Reset View</button>
        {#if focusedBody?.parentId}
            <button on:click={zoomOut}>Zoom Out</button>
        {/if}
    </div>

    {#if focusedBody?.parentId === null}
        <SystemSummary system={$systemStore} />
    {/if}

    <SystemVisualizer bind:this={visualizer} system={$systemStore} {currentTime} {focusedBodyId} on:focus={handleFocus} />

    <BodyDetails body={focusedBody} on:deleteNode={handleDeleteNode} on:addNode={handleAddNode} on:renameNode={handleRenameNode} on:addHabitablePlanet={handleAddHabitablePlanet} />

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
    padding: 2em;
  }
  .top-bar, .controls, .focus-header {
    margin: 1em 0;
    display: flex;
    align-items: center;
    gap: 1em;
  }
  .top-bar {
      justify-content: space-between;
  }
  .gen-controls, .share-controls, .save-load-controls {
      display: flex;
      align-items: center;
      gap: 1em;
  }
  .focus-header h2 {
      margin: 0;
  }
  .time-scales {
    display: flex;
    align-items: center;
    gap: 0.5em;
    background-color: #eee;
    padding: 0.25em;
    border-radius: 5px;
  }
  .time-scales button {
      border: 1px solid #ccc;
      background-color: white;
  }
  .time-scales button.active {
      border-color: #2d69a6;
      background-color: #3b82f6;
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
</style>

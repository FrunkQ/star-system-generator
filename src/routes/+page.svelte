<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem, computePlayerSnapshot, deleteNode, addPlanetaryBody, renameNode } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import BodyDetails from '$lib/components/BodyDetails.svelte';

  let rulePack: RulePack | null = null;
  let generatedSystem: System | null = null;
  let isLoading = true;
  let error: string | null = null;
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
    if (generatedSystem && focusedBodyId) {
        focusedBody = generatedSystem.nodes.find(n => n.id === focusedBodyId) as CelestialBody;
    } else if (generatedSystem) {
        focusedBody = generatedSystem.nodes.find(n => n.parentId === null) as CelestialBody;
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

  function handleGenerate() {
    if (!rulePack) {
      error = 'Rule pack not loaded.';
      return;
    }
    const seed = `seed-${Date.now()}`;
    generatedSystem = generateSystem(seed, rulePack, {}, selectedGenerationOption);
    currentTime = generatedSystem.epochT0;
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
      if (!generatedSystem) return;
      const nodeId = event.detail;
      generatedSystem = deleteNode(generatedSystem, nodeId);
      // If the deleted node was focused, zoom out to its parent
      if (focusedBodyId === nodeId) {
          zoomOut();
      }
  }

  function handleAddNode(event: CustomEvent<{hostId: string, planetType: string}>) {
      if (!generatedSystem || !rulePack) return;
      const { hostId, planetType } = event.detail;
      generatedSystem = addPlanetaryBody(generatedSystem, hostId, planetType, rulePack);
  }

  function handleRenameNode(event: CustomEvent<{nodeId: string, newName: string}>) {
    if (!generatedSystem) return;
    const { nodeId, newName } = event.detail;
    generatedSystem = renameNode(generatedSystem, nodeId, newName);
  }

  function handleSaveToBrowser() {
    if (!generatedSystem) return;
    localStorage.setItem('stargen_saved_system', JSON.stringify(generatedSystem));
    alert('System saved to browser storage.');
  }

  function handleLoadFromBrowser() {
    const savedJson = localStorage.getItem('stargen_saved_system');
    if (savedJson) {
      try {
        generatedSystem = JSON.parse(savedJson);
        currentTime = generatedSystem?.epochT0 || Date.now();
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
    if (!generatedSystem) return;
    const json = JSON.stringify(generatedSystem, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedSystem.name.replace(/\s+/g, '_') || 'system'}.json`;
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
        generatedSystem = JSON.parse(json);
        currentTime = generatedSystem?.epochT0 || Date.now();
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
      if (!generatedSystem) return;
      try {
          const snapshot = computePlayerSnapshot(generatedSystem);
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

  onMount(async () => {
    try {
      rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf-pack.json');
      const starTypes = rulePack.distributions['star_types'].entries.map(st => st.value);
      const options: string[] = ['Random'];
      starTypes.forEach(st => {
        const typeName = st.replace('star/', '');
        options.push(`Type ${typeName}`);
        options.push(`Type ${typeName} Binary`);
      });
      generationOptions = options;
    } catch (e: any) {
      error = e.message;
    } finally {
      isLoading = false;
    }
  });

  onDestroy(() => {
    if (browser) {
      pause();
    }
  });

</script>

<main>
  <h1>Star System Generator</h1>
  
  {#if isLoading}
    <p>Loading rule pack...</p>
  {:else if error}
    <p style="color: red;">Error: {error}</p>
  {:else}
    <div class="top-bar">
        <div class="gen-controls">
            <select bind:value={selectedGenerationOption}>
                {#each generationOptions as option (option)}
                    <option value={option}>{option}</option>
                {/each}
            </select>
            <button on:click={handleGenerate} disabled={!rulePack}>
              Generate System
            </button>
        </div>
        <div class="save-load-controls">
            <button on:click={handleSaveToBrowser}>Save to Browser</button>
            <button on:click={handleLoadFromBrowser}>Load from Browser</button>
            <button on:click={handleDownloadJson} disabled={!generatedSystem}>Download JSON</button>
            <button on:click={() => document.getElementById('upload-json')?.click()}>Upload JSON</button>
            <input type="file" id="upload-json" hidden accept=".json,application/json" on:change={handleUploadJson} />
        </div>
        {#if generatedSystem}
            <div class="share-controls">
                <button on:click={handleShare}>Share Player Link</button>
                {#if shareStatus}<span>{shareStatus}</span>{/if}
            </div>
        {/if}
    </div>
  {/if}

  {#if generatedSystem}
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

    <SystemVisualizer bind:this={visualizer} system={generatedSystem} {currentTime} {focusedBodyId} on:focus={handleFocus} />

    <BodyDetails body={focusedBody} {rulePack} on:deleteNode={handleDeleteNode} on:addNode={handleAddNode} on:renameNode={handleRenameNode} />

    <div class="debug-controls">
        <button on:click={() => showJson = !showJson}>
            {showJson ? 'Hide' : 'Show'} JSON
        </button>
    </div>

    {#if showJson}
        <pre>{JSON.stringify(generatedSystem, null, 2)}</pre>
    {/if}
  {/if}

  <footer>
    <p>Planet images by Pablo Carlos Budassi, used under a CC BY-SA 4.0 license. Star images from beyond-universe.fandom.com (CC-BY-SA) and ESO/L. Calçada (CC BY 4.0 for magnetar image).</p>
  </footer>
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
  footer {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #333;
      color: #999;
      font-size: 0.9em;
  }
</style>
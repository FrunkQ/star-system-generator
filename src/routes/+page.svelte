<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';

  let rulePack: RulePack | null = null;
  let generatedSystem: System | null = null;
  let isLoading = true;
  let error: string | null = null;

  // Time state
  let currentTime = Date.now();
  let isPlaying = false;
  let timeScale = 3600 * 24 * 30; // Default: 1 real second = 30 days
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
    generatedSystem = generateSystem(seed, rulePack);
    currentTime = generatedSystem.epochT0;
    focusedBodyId = null;
  }

  function handleFocus(event: CustomEvent<string | null>) {
    focusedBodyId = event.detail;
  }

  function zoomOut() {
      if (focusedBody?.parentId) {
          focusedBodyId = focusedBody.parentId;
      } else {
          focusedBodyId = null;
      }
  }

  onMount(async () => {
    try {
      rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf-pack.json');
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
    <button on:click={handleGenerate} disabled={!rulePack}>
      Generate System
    </button>
  {/if}

  {#if generatedSystem}
    <div class="controls">
        <button on:click={() => isPlaying ? pause() : play()}>
            {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div class="time-scales">
            <span>1s = </span>
            <button on:click={() => timeScale = 3600 * 24 * 1} class:active={timeScale === 3600 * 24 * 1}>1d</button>
            <button on:click={() => timeScale = 3600 * 24 * 30} class:active={timeScale === 3600 * 24 * 30}>30d</button>
            <button on:click={() => timeScale = 3600 * 24 * 90} class:active={timeScale === 3600 * 24 * 90}>90d</button>
            <button on:click={() => timeScale = 3600 * 24 * 365} class:active={timeScale === 3600 * 24 * 365}>1y</button>
        </div>
    </div>

    <div class="focus-header">
        <h2>Current Focus: {focusedBody?.name || 'System View'}</h2>
        {#if focusedBody?.parentId}
            <button on:click={zoomOut}>Zoom Out</button>
        {/if}
    </div>

    <SystemVisualizer system={generatedSystem} {currentTime} {focusedBodyId} on:focus={handleFocus} />
    
    <h2>Generated System (JSON):</h2>
    <pre>{JSON.stringify(generatedSystem, null, 2)}</pre>
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    padding: 2em;
  }
  pre {
    background-color: #f4f4f4;
    padding: 1em;
    border-radius: 5px;
    white-space: pre-wrap;
  }
  .controls, .focus-header {
    margin: 1em 0;
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
</style>

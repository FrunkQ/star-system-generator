<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System } from '$lib/types';
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
  let timeScale = 3600 * 24 * 30; // 1 real second = 1 month
  let animationFrameId: number;

  function play() {
    if (!browser) return;
    isPlaying = true;
    let lastTimestamp: number | null = null;

    function tick(timestamp: number) {
      if (lastTimestamp) {
        const delta = (timestamp - lastTimestamp) / 1000; // seconds
        currentTime += delta * timeScale * 1000; // ms
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
      pause(); // Clean up animation frame
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
        <span>Time Scale: 1s = {Math.round(timeScale / 3600 / 24)} days</span>
    </div>
    <SystemVisualizer system={generatedSystem} {currentTime} />
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
  .controls {
    margin: 1em 0;
    display: flex;
    align-items: center;
    gap: 1em;
  }
</style>

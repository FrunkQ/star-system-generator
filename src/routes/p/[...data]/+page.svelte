<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import type { System } from '$lib/types';
    import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
    import { browser } from '$app/environment';

    let system: System | null = null;
    let error = '';

    // Time state
    let currentTime = Date.now();
    let isPlaying = false;
    let timeScale = 3600 * 24 * 30;
    let animationFrameId: number;

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

    onMount(() => {
        try {
            const base64Data = $page.params.data;
            const json = atob(base64Data);
            system = JSON.parse(json);
            currentTime = system?.epochT0 || Date.now();
        } catch (e: any) {
            error = "Failed to load system data from URL. It may be invalid or corrupted.";
            console.error(e);
        }
    });
</script>

<main>
    {#if error}
        <p style="color: red;">{error}</p>
    {:else if system}
        <h1>{system.name}</h1>
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
                <button on:click={() => timeScale = 3600 * 24 * 365} class:active={timeScale === 3600 * 24 * 365}>1y</button>
            </div>
        </div>
        <SystemVisualizer {system} {currentTime} />
    {:else}
        <p>Loading system...</p>
    {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    padding: 2em;
  }
  .controls {
    margin: 1em 0;
    display: flex;
    align-items: center;
    gap: 1em;
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

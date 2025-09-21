<script lang="ts">
  import { onMount } from 'svelte';
  import type { RulePack, System } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem } from '$lib/api';

  let rulePack: RulePack | null = null;
  let generatedSystem: System | null = null;
  let isLoading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf-pack.json');
    } catch (e: any) {
      error = e.message;
    } finally {
      isLoading = false;
    }
  });

  function handleGenerate() {
    if (!rulePack) {
      error = 'Rule pack not loaded.';
      return;
    }
    const seed = `seed-${Date.now()}`;
    generatedSystem = generateSystem(seed, rulePack);
  }
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
    <h2>Generated System:</h2>
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
</style>
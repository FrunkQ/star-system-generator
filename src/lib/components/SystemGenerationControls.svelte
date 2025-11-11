<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RulePack, System } from '$lib/types';

  export let system: System | null;
  export let generationOptions: string[];
  export let selectedGenerationOption: string;
  export let exampleSystems: string[];
  export let handleGenerate: (empty: boolean) => void;

  const dispatch = createEventDispatcher();

  function handleLoadExample(event: Event) {
    const target = event.target as HTMLSelectElement;
    dispatch('loadexample', target.value);
  }
</script>

<div class="regeneration-controls">
    <span>Regenerate Solar System: Select Star Type:</span>
    <select bind:value={selectedGenerationOption}>
        {#each generationOptions as option (option)}
            <option value={option}>{option}</option>
        {/each}
    </select>
    <span>then:</span>
    <button on:click={() => handleGenerate(false)}>
      Generate System
    </button>
    <button on:click={() => handleGenerate(true)}>
      Generate Empty System
    </button>
    <span>or select a preset:</span>
    <select on:change={(e) => dispatch('loadexample', e.currentTarget.value)}>
        <option value="">None selected</option>
        {#each exampleSystems as example}
            <option value={example}>{example.replace('.json', '')}</option>
        {/each}
    </select>
</div>

<style>
    .regeneration-controls {
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-top: 0.5em;
        padding-top: 0.5em;
        border-top: 1px solid #333;
    }
    .regeneration-controls span {
        color: #eee;
    }
    .regeneration-controls select, .regeneration-controls button {
        padding: 0.25em 0.5em;
        border-radius: 4px;
        border: 1px solid #666;
        background-color: #555;
        color: #eee;
        cursor: pointer;
    }
    .regeneration-controls button:hover {
        background-color: #666;
    }
</style>
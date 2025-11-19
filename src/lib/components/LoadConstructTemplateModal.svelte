<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';

  export let rulePack: RulePack;
  export let mode: 'overwrite' | 'create' = 'overwrite';

  const dispatch = createEventDispatcher();

  let selectedRoleHint: string | undefined;
  let selectedTemplate: CelestialBody | undefined;

  let constructRoleHints: string[] = [];
  let availableTemplates: CelestialBody[] = [];

  $: {
    if (rulePack && rulePack.constructTemplates) {
      constructRoleHints = Object.keys(rulePack.constructTemplates).filter(key => key !== 'id' && key !== 'name');
    } else {
      constructRoleHints = [];
    }
  }

  $: {
    if (selectedRoleHint && rulePack.constructTemplates && rulePack.constructTemplates[selectedRoleHint]) {
      availableTemplates = rulePack.constructTemplates[selectedRoleHint];
    } else {
      availableTemplates = [];
    }
  }

  function handleLoad() {
    if (selectedTemplate) {
      dispatch('load', selectedTemplate);
      dispatch('close');
    }
  }

  function close() {
    dispatch('close');
  }
</script>

<div class="modal-background" on:click={close}>
  <div class="modal" on:click|stopPropagation>
    <h2>{mode === 'create' ? 'Create New Construct' : 'Load Construct Template'}</h2>
    {#if mode === 'overwrite'}
      <p class="warning">Warning: This will overwrite the current construct's configuration (engines, fuel, cargo, etc.). Orbit and placement will be preserved.</p>
    {/if}

    <label class="form-row">
      <span>Construct Type:</span>
      <select bind:value={selectedRoleHint}>
        <option value={undefined} disabled>Select a type</option>
        {#each constructRoleHints as roleHint}
          <option value={roleHint}>{roleHint.charAt(0).toUpperCase() + roleHint.slice(1)}</option>
        {/each}
      </select>
    </label>

    {#if selectedRoleHint}
      <label class="form-row">
        <span>Template:</span>
        <select bind:value={selectedTemplate}>
          <option value={undefined} disabled>Select a template</option>
          {#each availableTemplates as template}
            <option value={template}>{template.name}</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="buttons">
      <button on:click={handleLoad} disabled={!selectedTemplate}>Load Template</button>
      <button on:click={close}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000; /* Higher than editor modal */
  }

  .modal {
    background-color: #333;
    padding: 20px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: #fff;
    max-width: 500px;
    text-align: center;
    border: 1px solid #555;
  }

  .warning {
    color: #ffcc00;
    font-size: 0.9em;
    margin-bottom: 1rem;
  }

  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .form-row span {
    margin-right: 1rem;
    white-space: nowrap;
  }

  .form-row select {
    flex-grow: 1;
    padding: 5px;
    background-color: #444;
    color: #fff;
    border: 1px solid #555;
    border-radius: 3px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 1rem;
  }

  button {
    padding: 8px 16px;
    background-color: #555;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:hover {
    background-color: #666;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
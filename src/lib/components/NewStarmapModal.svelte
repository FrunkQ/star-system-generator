<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RulePack } from '$lib/types';

  export let rulepacks: RulePack[];
  export let hasSavedStarmap: boolean;

  const dispatch = createEventDispatcher();

  let starmapName = 'My Starmap';
  let selectedRulepack: RulePack | undefined = rulepacks && rulepacks.length > 0 ? rulepacks[0] : undefined;
  let distanceUnit = 'LY';
  let unitIsPrefix = false;

  function createStarmap() {
    dispatch('create', {
      name: starmapName,
      rulepack: selectedRulepack,
      distanceUnit,
      unitIsPrefix,
    });
  }
</script>

<div class="modal-background">
  <div class="modal">
    <h2>Welcome to the Star System Generator!</h2>
    <p>This tool allows you to create and explore scientifically-plausible star systems. Get started by creating a new starmap, or load a previous creation.</p>
    
    <div class="load-options">
        <button on:click={() => dispatch('load')} disabled={!hasSavedStarmap}>Load from Browser</button>
        <button on:click={() => dispatch('upload')}>Upload Starmap</button>
    </div>

    <div class="new-starmap-form">
        <h3>Create a New Starmap</h3>
        <label>
          Starmap Name:
          <input type="text" bind:value={starmapName} />
        </label>
        <label>
          Rulepack:
          <select bind:value={selectedRulepack}>
            {#each rulepacks as rp}
              <option value={rp}>{rp.name}</option>
            {/each}
          </select>
        </label>
        <label>
          Distance Unit:
          <input type="text" bind:value={distanceUnit} />
        </label>
        <label>
          <input type="checkbox" bind:checked={unitIsPrefix} />
          Unit is a prefix (e.g., "J 1" instead of "50 LY")
        </label>
        <div class="buttons">
          <button on:click={createStarmap}>Create</button>
        </div>
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
  }

  .modal {
    background-color: #333;
    padding: 20px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: #fff; /* Set text color to white */
  }

  .modal label {
    color: #fff; /* Ensure labels are white */
  }

  .modal input[type="text"],
  .modal select {
    background-color: #555; /* Slightly lighter background for input fields */
    color: #fff; /* White text for input fields */
    border: 1px solid #777;
  }

  .modal button {
    background-color: #007bff;
    color: #fff;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
  }

  .modal button:hover {
    background-color: #0056b3;
  }

  .modal button:disabled {
    background-color: #555;
    cursor: not-allowed;
  }

  .load-options {
    display: flex;
    gap: 1em;
    justify-content: center;
    margin-bottom: 1em;
  }

  .new-starmap-form {
    border-top: 1px solid #555;
    padding-top: 1em;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
  }
</style>
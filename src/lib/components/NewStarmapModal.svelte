<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RulePack } from '$lib/types';
  import { APP_VERSION, APP_DATE } from '$lib/constants';

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
    <div class="left-pane">
        <img src="/images/ui/SSE-Logo.png" alt="Star System Explorer" class="main-logo" />
        
        <p>A procedural generator for creating scientifically-plausible star systems, complete with a real-time orbital visualizer and starmap. Full astrodynamics simulation letting you easily model your own spacecraft and let them transit efficienctly or "hard burn" with fuel, time and hazard calculations.</p>

        <p>For discussion, feedback, bugs and suggestions go to <a href="https://discord.gg/UAEq4zzjD8" target="_blank">Our Discord</a>.</p>

        <p>A <a href="https://youtu.be/LrgNh2PVOlg" target="_blank">video explainer on YouTube</a> to get you started.</p>
    </div>

    <div class="right-pane">
        <div class="load-options">
            <button on:click={() => dispatch('upload')}>Upload Starmap</button>
            <button on:click={() => dispatch('loadExampleStarmap')}>Load Example: Local Neighbourhood</button>
        </div>

        <div class="new-starmap-form">
            <h3>Create a New Starmap</h3>
            <label class="form-row">
            <span>Starmap Name:</span>
            <input type="text" bind:value={starmapName} />
            </label>
            <label class="form-row">
            <span>Rulepack:</span>
            <select bind:value={selectedRulepack}>
                {#each rulepacks as rp}
                <option value={rp}>{rp.name}</option>
                {/each}
            </select>
            </label>
            <div class="form-row-group">
                <label>
                Distance Unit:
                <input type="text" bind:value={distanceUnit} />
                </label>
                <label class="checkbox-label">
                <input type="checkbox" bind:checked={unitIsPrefix} />
                Unit is a prefix (e.g., "J 1" instead of "50 LY")
                </label>
            </div>
            <div class="buttons">
            <button on:click={createStarmap}>Create</button>
            </div>
        </div>

        <div class="version-info">
            <span>v{APP_VERSION}</span> | <span>{APP_DATE}</span>
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
    z-index: 1000;
  }

  .modal {
    background-color: #333;
    padding: 30px;
    border-radius: 8px;
    display: flex;
    flex-direction: row; /* Horizontal layout */
    gap: 30px;
    color: #fff;
    max-width: 900px; /* Increased width to accommodate two panes */
    width: 90%;
    text-align: left;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .left-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid #555;
    padding-right: 30px;
  }

  .right-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .main-logo {
    max-width: 100%;
    height: auto;
    margin: 0 auto 20px auto;
    display: block;
  }

  .version-info {
    margin-top: 20px; /* Reduced gap instead of auto */
    padding-top: 10px;
    font-size: 0.75em;
    color: #888;
    text-align: right;
  }

  .modal input[type="text"],
  .modal select {
    background-color: #555;
    color: #fff;
    border: 1px solid #777;
    padding: 5px;
    border-radius: 3px;
  }

  .modal button {
    background-color: #007bff;
    color: #fff;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
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
    margin-bottom: 2em;
    padding-bottom: 2em;
    border-bottom: 1px solid #555;
  }
  
  .load-options button {
      flex: 1;
  }

  .new-starmap-form {
    padding-top: 0;
  }
  
  .new-starmap-form h3 {
      margin-top: 0;
      margin-bottom: 1em;
      text-align: center;
  }

  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .form-row span {
    margin-right: 1rem;
    min-width: 100px;
  }

  .form-row input,
  .form-row select {
    flex-grow: 1;
  }

  .form-row-group {
    display: flex;
    flex-direction: column; /* Stacked for better fit in column */
    gap: 0.5rem;
    margin-bottom: 1rem;
    background: #444;
    padding: 10px;
    border-radius: 4px;
  }
  
  .form-row-group label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .checkbox-label {
    white-space: normal; /* Allow wrapping */
    font-size: 0.9em;
    display: flex;
    align-items: center;
    justify-content: flex-start !important; /* Move content to the left */
    gap: 0.8rem; /* Increased gap to move checkbox relatively right */
    padding-left: 20px; /* Move the whole row right */
    cursor: pointer;
  }

  .buttons {
    display: flex;
    justify-content: center;
    margin-top: 1em;
  }
  
  .buttons button {
      width: 100%;
      font-size: 1.1em;
      padding: 10px;
  }

  .discord-link a {
    color: #7289DA; /* Discord's brand color */
    text-decoration: none;
    font-weight: bold;
  }

  .discord-link a:hover {
    text-decoration: underline;
  }
  
  /* Responsive adjustment for smaller screens */
  @media (max-width: 768px) {
      .modal {
          flex-direction: column;
          padding: 15px;
          gap: 15px;
      }
      .left-pane {
          border-right: none;
          border-bottom: 1px solid #555;
          padding-right: 0;
          padding-bottom: 15px;
      }
      .right-pane {
          padding-left: 0;
      }
  }
</style>
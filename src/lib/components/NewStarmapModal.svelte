<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RulePack } from '$lib/types';
  import { APP_VERSION, APP_DATE } from '$lib/constants';

  export let rulepacks: RulePack[];
  export let hasSavedStarmap: boolean;

  const dispatch = createEventDispatcher();

  let starmapName = 'My Starmap';
  // Only one rule pack exists, so it is applied automatically rather than offered as a choice.
  let selectedRulepack: RulePack | undefined = rulepacks && rulepacks.length > 0 ? rulepacks[0] : undefined;
  // The unit choice doubles as the scaling mode: ly/pc are scaled maps, diagrammatic is abstract.
  let unitChoice: 'ly' | 'pc' | 'diagrammatic' = 'ly';
  let abstractUnit = 'J';
  let abstractOrder: 'prefix' | 'suffix' = 'prefix';

  function createStarmap() {
    const diagrammatic = unitChoice === 'diagrammatic';
    dispatch('create', {
      name: starmapName,
      rulepack: selectedRulepack,
      distanceUnit: diagrammatic ? (abstractUnit.trim() || 'J') : unitChoice,
      unitIsPrefix: diagrammatic ? abstractOrder === 'prefix' : false,
      mapMode: diagrammatic ? 'diagrammatic' : 'scaled',
      generationEngine: 'standard',
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

            <div class="form-row-group">
                <label>
                Distance/Scaling units:
                <select bind:value={unitChoice}>
                  <option value="ly">Light Years (ly)</option>
                  <option value="pc">Parsecs (pc)</option>
                  <option value="diagrammatic">Diagrammatic (not scaled)</option>
                </select>
                </label>
                {#if unitChoice === 'diagrammatic'}
                  <label>
                  Abstract unit:
                  <input type="text" bind:value={abstractUnit} placeholder="e.g. J for Jump" maxlength="6" />
                  </label>
                  <label>
                  Unit order:
                  <select bind:value={abstractOrder}>
                    <option value="prefix">Before the number ({abstractUnit.trim() || 'J'}8)</option>
                    <option value="suffix">After the number (8 {abstractUnit.trim() || 'J'})</option>
                  </select>
                  </label>
                {/if}
            </div>
            <div class="buttons">
            <button on:click={createStarmap}>Create Vast Nothingness</button>
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
    background-color: var(--bg-panel);
    padding: 30px;
    border-radius: 8px;
    display: flex;
    flex-direction: row; /* Horizontal layout */
    gap: 30px;
    color: var(--text);
    max-width: 900px; /* Increased width to accommodate two panes */
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    text-align: left;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .left-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid var(--border);
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
    color: var(--text-faint);
    text-align: right;
  }

  .modal input[type="text"],
  .modal select {
    background-color: var(--bg-control);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 5px;
    border-radius: 3px;
  }

  .modal button {
    background-color: var(--accent);
    color: var(--text);
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
    background-color: var(--bg-control);
    cursor: not-allowed;
  }

  .load-options {
    display: flex;
    gap: 1em;
    justify-content: center;
    margin-bottom: 2em;
    padding-bottom: 2em;
    border-bottom: 1px solid var(--border);
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
    background: var(--bg-control);
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

  /* Responsive adjustment for smaller screens */
  @media (max-width: 768px) {
      .modal {
          flex-direction: column;
          padding: 15px;
          gap: 15px;
          width: 96%;
          max-height: 92vh;
      }
      .left-pane {
          border-right: none;
          border-bottom: 1px solid var(--border);
          padding-right: 0;
          padding-bottom: 15px;
      }
      .right-pane {
          padding-left: 0;
      }
  }
</style>

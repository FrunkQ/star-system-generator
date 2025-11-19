<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { aiSettings } from '$lib/stores';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // Initialize nested physical_parameters if it doesn't exist
  if (!construct.physical_parameters) {
    construct.physical_parameters = {};
  }
  if (construct.physical_parameters.massKg === undefined) {
    construct.physical_parameters.massKg = 0;
  }
  if (!Array.isArray(construct.physical_parameters.dimensionsM)) {
    construct.physical_parameters.dimensionsM = [0, 0, 0];
  }
  
  // Initialize icon color if missing
  if (!construct.icon_color) {
    construct.icon_color = '#f0f0f0';
  }

  // UI variable for mass in tonnes
  let massTonnes: number = construct.physical_parameters.massKg / 1000;

  // Reactive statements to sync UI (tonnes) with data (kg)
  $: if (construct.physical_parameters) {
    massTonnes = (construct.physical_parameters.massKg || 0) / 1000;
  }
  $: if (construct.physical_parameters && massTonnes !== undefined) {
    construct.physical_parameters.massKg = massTonnes * 1000;
  }

  let isEditingDescription = false;
  let descriptionText = '';

  function handleUpdate() {
    dispatch('update');
  }

  function startEditingDescription() {
    descriptionText = construct.description || '';
    isEditingDescription = true;
  }

  function saveDescription() {
    construct.description = descriptionText;
    isEditingDescription = false;
    handleUpdate();
  }

  function cancelDescriptionEdit() {
    isEditingDescription = false;
  }

  function renderMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/\n/g, '<br>');
  }

  $: hasApiKey = $aiSettings.apiKey && $aiSettings.apiKey.length > 0;
</script>

<div class="tab-panel">
  {#if construct}
    <div class="row">
      <div class="form-group" style="flex: 4;">
        <label for="construct-name">Name:</label>
        <input type="text" id="construct-name" bind:value={construct.name} on:input={handleUpdate} />
      </div>
      <div class="form-group" style="flex: 1;">
        <label for="construct-class">Class:</label>
        <input type="text" id="construct-class" bind:value={construct.class} on:input={handleUpdate} />
      </div>
    </div>

    <div class="row">
      <div class="form-group" style="flex: 4;">
        <label for="icon-type">Icon Type:</label>
        <select id="icon-type" bind:value={construct.icon_type} on:change={handleUpdate}>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
          <option value="circle">Circle</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label for="icon-color">Colour:</label>
        <input type="color" id="icon-color" bind:value={construct.icon_color} on:input={handleUpdate} />
      </div>
    </div>

    <div class="row">
      <div class="form-group">
        <label for="dry-mass">Dry Mass (tonnes):</label>
        <input type="number" id="dry-mass" bind:value={massTonnes} on:input={handleUpdate} />
      </div>
      <div class="form-group dimensions-group">
        <label>Dimensions (m):</label>
        <div class="dimensions-inputs">
          <input type="number" placeholder="L" bind:value={construct.physical_parameters.dimensionsM[0]} on:input={handleUpdate} />
          <input type="number" placeholder="W" bind:value={construct.physical_parameters.dimensionsM[1]} on:input={handleUpdate} />
          <input type="number" placeholder="H" bind:value={construct.physical_parameters.dimensionsM[2]} on:input={handleUpdate} />
        </div>
      </div>
    </div>

    <div class="separator"></div>

    <div class="form-group">
      <label>Description</label>
      {#if isEditingDescription}
        <textarea bind:value={descriptionText} rows="6"></textarea>
        <div class="actions">
          <button type="button" on:click={saveDescription}>Save</button>
          <button type="button" on:click={cancelDescriptionEdit}>Cancel</button>
        </div>
      {:else}
        <div class="display">
          {@html renderMarkdown(construct.description || 'No description yet.')}
        </div>
        <div class="actions">
          <button type="button" on:click={startEditingDescription}>Edit</button>
          {#if hasApiKey}
            <button type="button" class="ai-button" on:click={() => dispatch('expandAI')}>
              ✨ Expand with AI
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tab-panel { 
    padding: 10px; 
    display: flex; 
    flex-direction: column; 
    gap: 15px; 
    width: 100%; 
    box-sizing: border-box; 
    overflow-x: hidden; 
  }
  .row { display: flex; gap: 15px; }
  .form-group { display: flex; flex-direction: column; flex: 1; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input, select, textarea { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; font-size: 1em; width: 100%; box-sizing: border-box; }
  input[type="color"] { height: 38px; padding: 2px; }
  .separator { height: 1px; background-color: #555; width: 100%; margin: 0; }
  
  .dimensions-group .dimensions-inputs {
    display: flex;
    gap: 5px;
  }
  .dimensions-group .dimensions-inputs input {
    text-align: center;
  }

  .actions { margin-top: 0.5em; display: flex; gap: 0.5em; }
  .display { white-space: pre-wrap; background: #252525; padding: 1em; border-radius: 4px; min-height: 50px; }
  .ai-button { background-color: #2d69a6; color: white; }
</style>

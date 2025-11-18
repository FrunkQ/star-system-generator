<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { aiSettings } from '$lib/stores';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

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
      <div class="form-group">
        <label for="construct-name">Name:</label>
        <input type="text" id="construct-name" bind:value={construct.name} on:input={handleUpdate} />
      </div>
      <div class="form-group">
        <label for="construct-class">Class:</label>
        <input type="text" id="construct-class" bind:value={construct.class} on:input={handleUpdate} />
      </div>
    </div>

    <div class="icon-controls">
      <div class="form-group">
        <label for="icon-type">Icon Type:</label>
        <select id="icon-type" bind:value={construct.icon_type} on:change={handleUpdate}>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
          <option value="circle">Circle</option>
        </select>
      </div>
      <div class="form-group">
        <label for="icon-color">Color:</label>
        <input type="color" id="icon-color" bind:value={construct.icon_color} on:input={handleUpdate} />
      </div>
    </div>

    <hr />

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
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .row { display: flex; gap: 15px; }
  .form-group { display: flex; flex-direction: column; flex: 1; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input, select, textarea { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; font-size: 1em; width: 100%; box-sizing: border-box; }
  input[type="color"] { height: 38px; padding: 2px; }
  hr { border: 1px solid #555; margin: 0.5em 0; }
  .icon-controls { display: flex; gap: 15px; align-items: flex-end; }
  .actions { margin-top: 0.5em; display: flex; gap: 0.5em; }
  .display { white-space: pre-wrap; background: #252525; padding: 1em; border-radius: 4px; min-height: 50px; }
  .ai-button { background-color: #2d69a6; color: white; }
</style>

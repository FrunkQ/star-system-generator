<script lang="ts">
  import type { CelestialBody } from "$lib/types";
  import { aiSettings } from 
'$lib/stores';
  import AIExpansionModal from './AIExpansionModal.svelte';

  export let body: CelestialBody;

  let showAIModal = false;
  let isEditing = false;
  let description = '';

  function startEditing() {
    description = body.description || '';
    isEditing = true;
  }

  function handleSave() {
    body.description = description;
    isEditing = false;
  }

  function renderMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/## (.*)/g, '<h2>$1</h2>') // H2
      .replace(/\n/g, '<br>'); // Newlines
  }

  $: hasApiKey = $aiSettings.apiKey && $aiSettings.apiKey.length > 0;
</script>

<div class="description-editor">
  <h3>Description & Notes</h3>
  
  {#if isEditing}
    <textarea bind:value={description}></textarea>
    <div class="actions">
      <button on:click={handleSave}>Save</button>
      <button on:click={() => isEditing = false}>Cancel</button>
    </div>
  {:else}
    <div class="display">
      {@html renderMarkdown(body.description || 'No description yet.')}
    </div>
    <div class="actions">
      <button on:click={startEditing}>Edit</button>
      {#if hasApiKey}
        <button class="ai-button" on:click={() => showAIModal = true}>
          ✨ Expand with AI
        </button>
      {/if}
    </div>
  {/if}
</div>

<AIExpansionModal bind:showModal={showAIModal} {body} initialText={body.description} />

<style>
  .description-editor {
    margin-top: 1em;
    border-top: 1px solid #444;
    padding-top: 1em;
  }
  h3 {
      margin: 0 0 0.5em 0;
      color: #ff3e00;
  }
  textarea {
    width: 100%;
    min-height: 150px;
    background: #1a1a1a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 4px;
  }
  .display {
    white-space: pre-wrap;
    background: #252525;
    padding: 1em;
    border-radius: 4px;
    min-height: 50px;
  }
  .actions {
    margin-top: 0.5em;
    display: flex;
    gap: 0.5em;
  }
  .ai-button {
    background-color: #2d69a6;
    color: white;
  }
</style>
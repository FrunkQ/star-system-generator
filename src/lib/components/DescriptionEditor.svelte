<script lang="ts">
  import type { CelestialBody } from "$lib/types";
  import { aiSettings, systemStore } from '$lib/stores';
  import AIExpansionModal from './AIExpansionModal.svelte';
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { PROMPT_TEMPLATE } from '$lib/ai/prompt';
  import styles from '$lib/ai/styles.json';
  import tags from '$lib/ai/tags.json';

  export let body: CelestialBody;

  let showAIModal = false;
  let isEditing = false;
  let descriptionText = '';
  let promptData = {};
  const dispatch = createEventDispatcher();

  function startEditing() {
    descriptionText = body.description || '';
    isEditing = true;
  }

  function handleSave() {
    body.description = descriptionText;
    isEditing = false;
    dispatch('update');
  }

  function handleCancel() {
    isEditing = false;
  }

  function handleAIDescription(event: CustomEvent<string>) {
    body.description = event.detail;
    showAIModal = false;
    dispatch('update', body); // Immediately save the change to the store
  }

  function openAIModal() {
    const system = get(systemStore);
    const host = system?.nodes.find((n: any) => n.id === body.orbit?.hostId);
    promptData = {
      HOST_STAR: host,
      BODY: body
    };
    showAIModal = true;
  }

  function renderMarkdown(text: string): string {
    if (!text) return '';
    return text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>').replace(/## (.*)/g, '<h2>$1</h2>').replace(/\n/g, '<br>');
  }

  $: hasApiKey = $aiSettings.apiKey && $aiSettings.apiKey.length > 0;
</script>

<div class="description-editor">
  <h3>Detailed Information</h3>
  {#if isEditing}
    <textarea bind:value={descriptionText} rows="8"></textarea>
    <div class="actions">
      <button type="button" on:click={handleSave}>Save</button>
      <button type="button" on:click={handleCancel}>Cancel</button>
    </div>
  {:else}
    <div class="display">
      {@html renderMarkdown(body?.description || 'No description yet.')}
    </div>
    <div class="actions">
      <button type="button" on:click={startEditing}>Edit</button>
      {#if hasApiKey}
        <button type="button" class="ai-button" on:click={openAIModal}>
          ✨ Expand with AI
        </button>
      {/if}
    </div>
  {/if}
</div>

{#if showAIModal}
  <AIExpansionModal
    bind:showModal={showAIModal}
    promptTemplate={PROMPT_TEMPLATE}
    promptData={{ BODY: body }}
    availableStyles={styles}
    availableTags={tags}
    initialText={body.description || ''}
    on:close={() => showAIModal = false}
    on:generate={handleAIDescription}
  />
{/if}

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
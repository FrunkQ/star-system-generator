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
  <div class="header-row">
      <button class="visibility-btn" on:click={() => {
          body.description_playerhidden = !body.description_playerhidden;
          dispatch('update', body);
      }} title={body.description_playerhidden ? "Description Hidden from Players" : "Description Visible to Players"}>
          {#if body.description_playerhidden}
              <!-- Eye Closed -->
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          {:else}
              <!-- Eye Open -->
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {/if}
      </button>
      <h3>Detailed Information</h3>
  </div>
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
  .header-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 0.5em;
  }
  .visibility-btn {
      background-color: #252525; /* Darker background */
      border: none;
      cursor: pointer;
      padding: 5px; /* Add some padding */
      border-radius: 4px; /* Slightly rounded corners */
      display: flex;
      align-items: center;
  }
  h3 {
      margin: 0;
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
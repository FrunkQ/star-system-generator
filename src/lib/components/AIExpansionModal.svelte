<script lang="ts">
  import { get } from 'svelte/store';
  import type { CelestialBody } from '../types';
  import { aiSettings, systemStore } from '../stores';
  import styles from '$lib/ai/styles.json';
  import tags from '$lib/ai/tags.json';
  import { PROMPT_TEMPLATE } from '$lib/ai/prompt.ts';

  export let body: CelestialBody;
  export let showModal: boolean;
  export let initialText: string;

  let seedText: string;
  let generatedText = '';
  let isLoading = false;
  let error = '';
  let lastPrompt = '';
  let showPromptEditor = false;
  let editedPrompt = '';

  let selectedStyle: any;
  let selectedTags: Set<string>;
  const lengthOptions = [
    { label: 'Note (~100 words)', value: 100 },
    { label: 'Short (~250 words)', value: 250 },
    { label: 'Medium (~500 words)', value: 500 },
    { label: 'Long (~1000 words)', value: 1000 },
  ];
  let selectedLength: any;

  // Initialize state when the modal is opened (body changes)
  $: if (body) {
    seedText = body.aiContext?.seedText || initialText || '';
    selectedTags = new Set(body.aiContext?.tags || []);
    selectedStyle = styles.find(s => s.label === body.aiContext?.style?.label) || styles[0];
    selectedLength = lengthOptions.find(l => l.value === body.aiContext?.length) || lengthOptions[2];
    lastPrompt = body.aiContext?.lastPrompt || '';
    generatedText = ''; // Reset generated text
    error = ''; // Reset error
  }

  function toggleTag(tag: string) {
    if (selectedTags.has(tag)) {
      selectedTags.delete(tag);
    } else {
      selectedTags.add(tag);
    }
    selectedTags = selectedTags;
  }

  async function handleGenerate(promptOverride: string | null = null) {
    isLoading = true;
    generatedText = '';
    error = '';

    try {
      let promptToUse: string;
      let requestBody: any = {
        settings: get(aiSettings)
      };

      if (promptOverride) {
        promptToUse = promptOverride;
      } else {
        const system = get(systemStore);
        const host = system?.nodes.find((n: any) => n.id === body.orbit?.hostId);
        
        let starsForPrompt: any[] = [];
        if (host?.kind === 'barycenter') {
          starsForPrompt = host.memberIds.map((memberId: string) => 
            system?.nodes.find(n => n.id === memberId)
          ).filter(Boolean);
        } else if (host) {
          starsForPrompt.push(host);
        }

        // Create a clean version of the body for the prompt, excluding text fields
        const { description, aiContext, ...cleanBody } = body;

        promptToUse = PROMPT_TEMPLATE
          .replace('%%LENGTH%%', selectedLength.value.toString())
          .replace('%%HOST_STAR%%', JSON.stringify(starsForPrompt, null, 2))
          .replace('%%BODY%%', JSON.stringify(cleanBody, null, 2))
          .replace('%%SEED_TEXT%%', seedText)
          .replace('%%TAGS%%', Array.from(selectedTags).join(', '))
          .replace('%%STYLE_LABEL%%', selectedStyle.label)
          .replace('%%STYLE_GUIDELINE%%', selectedStyle.guideline);
      }

      lastPrompt = promptToUse;

      // Save context to body before generating
      body.aiContext = {
        seedText: seedText,
        tags: Array.from(selectedTags),
        style: selectedStyle,
        length: selectedLength.value,
        lastPrompt: lastPrompt
      };

      requestBody.fullPrompt = promptToUse;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
        for (const line of lines) {
          const jsonStr = line.replace('data: ', '');
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              generatedText += content;
            }
          } catch (e) {
            // Ignore empty chunks
          }
        }
      }
    } catch (e: any) {
      error = e.message;
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  function openPromptEditor() {
    editedPrompt = lastPrompt;
    showPromptEditor = true;
  }

  function handleRegenerate() {
    showPromptEditor = false;
    handleGenerate(editedPrompt);
  }

  function renderMarkdown(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/## (.*)/g, '<h2>$1</h2>') // H2
      .replace(/\n/g, '<br>'); // Newlines
  }

  function handleAccept() {
    body.description = generatedText;
    systemStore.set(get(systemStore)); // Force reactivity update
    showModal = false;
  }

  function handleClose() {
    showModal = false;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (showModal && event.key === 'Escape') {
      handleClose();
    }
  }

</script>

<svelte:body on:keydown={handleKeyDown} />

{#if showModal}
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={handleClose} role="button" tabindex="0" on:keydown={(e) => {if (e.key === 'Enter' || e.key === 'Space') handleClose()}}>
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
    <h2 id="dialog-title">Expand Description with AI</h2>

    <div class="columns">
      <div class="left-column">
        <div class="form-group">
          <label for="seed-text">Seed Text (Your Notes)</label>
          <textarea id="seed-text" bind:value={seedText}></textarea>
        </div>

        <div class="form-group">
          <label for="report-style">Report Style</label>
          <select id="report-style" bind:value={selectedStyle}>
            {#each styles as style (style.label)}
              <option value={style}>{style.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="response-length">Response Length</label>
          <select id="response-length" bind:value={selectedLength}>
            {#each lengthOptions as option (option.value)}
              <option value={option}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group tags-container">
          <label for="tag-groups">Tags</label>
          <div id="tag-groups" class="tag-groups">
            {#each Object.entries(tags) as [category, sub] (category)}
              <div class="tag-group">
                <strong>{category}</strong>
                {#if Array.isArray(sub)}
                  {#each sub as tag (tag)}
                    <label>
                      <input type="checkbox" on:change={() => toggleTag(tag)} checked={selectedTags.has(tag)}> 
                      {tag}
                    </label>
                  {/each}
                {:else}
                  {#each Object.entries(sub) as [subCategory, tagList] (subCategory)}
                    <div class="sub-group">
                      <em>{subCategory}</em>
                      {#each tagList as tag (tag)}
                        <label>
                          <input type="checkbox" on:change={() => toggleTag(tag)} checked={selectedTags.has(tag)}> 
                          {tag}
                        </label>
                      {/each}
                    </div>
                  {/each}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="right-column">
        <div class="form-group">
          <label for="generated-text">Generated Description</label>
          <div id="generated-text" class="generated-text-display">
            {@html renderMarkdown(generatedText)}
            {#if isLoading}<span class="blinking-cursor"></span>{/if}
          </div>
        </div>
        {#if error}<p class="error">{error}</p>{/if}
      </div>
    </div>

    <div class="modal-actions">
      <button on:click={() => handleGenerate()} disabled={isLoading}>
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
      <button on:click={openPromptEditor} disabled={!lastPrompt || isLoading}>View/Edit Last Prompt</button>
      <button on:click={handleAccept} disabled={!generatedText || isLoading}>Accept & Close</button>
      <button on:click={handleClose}>Cancel</button>
    </div>

    {#if showPromptEditor}
      <div class="prompt-editor-overlay">
        <h3>Edit Prompt</h3>
        <textarea class="prompt-textarea" bind:value={editedPrompt}></textarea>
        <div class="modal-actions">
          <button on:click={handleRegenerate}>Regenerate with Edited Prompt</button>
          <button on:click={() => { lastPrompt = editedPrompt; showPromptEditor = false; }}>Save Changes</button>
          <button on:click={() => showPromptEditor = false}>Cancel</button>
        </div>
      </div>
    {/if}
  </div>
</div>
{/if}

<style>
  /* Basic Modal Styles */
  .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .modal { background: #222; padding: 2em; border-radius: 8px; width: 90%; max-width: 1200px; border: 1px solid #444; max-height: 90vh; overflow-y: auto; }
  h2 { margin-top: 0; color: #ff3e00; }
  .form-group { margin-bottom: 1em; }
  label { display: block; margin-bottom: 0.5em; color: #ccc; }
  textarea, select { width: 100%; padding: 0.5em; background: #111; border: 1px solid #555; color: #eee; border-radius: 4px; }
  textarea { min-height: 120px; }
  .modal-actions { margin-top: 1em; text-align: right; display: flex; justify-content: flex-end; gap: 1em; }
  .error { color: #ff3e00; }

  /* Layout */
  .columns { display: flex; gap: 2em; }
  .left-column, .right-column { flex: 1; }

  /* Tags */
  .tags-container {  }
  .tag-groups { height: 300px; overflow-y: auto; background: #1a1a1a; padding: 1em; border-radius: 4px; border: 1px solid #555; }
  .tag-group { margin-bottom: 1em; }
  .tag-group strong { color: #ff9900; }
  .tag-group label { display: block; font-weight: normal; color: #ccc; }
  .sub-group { margin-left: 1em; }
  .sub-group em { color: #aaa; }

  /* Generated Text */
  .generated-text-display { height: calc(100% - 2em); background: #1a1a1a; border: 1px solid #555; border-radius: 4px; padding: 1em; white-space: pre-wrap; overflow-y: auto; }
  .blinking-cursor { display: inline-block; width: 8px; height: 1em; background: #eee; animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }

  .prompt-editor-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(20, 20, 20, 0.95);
    padding: 2em;
    display: flex;
    flex-direction: column;
  }
  .prompt-textarea {
    flex-grow: 1;
    width: 100%;
    background: #111;
    color: #eee;
    border: 1px solid #555;
  }
</style>
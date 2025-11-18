<script lang="ts">
  import { get } from 'svelte/store';
  import { aiSettings } from '../stores';
  import { createEventDispatcher, onMount } from 'svelte';

  export let showModal: boolean;
  export let promptTemplate: string;
  export let promptData: Record<string, any>;
  export let availableStyles: any[];
  export let availableTags: any;
  export let initialText: string;

  const dispatch = createEventDispatcher();

  let seedText = initialText || '';
  let generatedText = '';
  let isLoading = false;
  let error = '';
  let lastPrompt = '';
  let showPromptEditor = false;
  let editedPrompt = '';
  let abortController: AbortController;
  
  let selectedStyle: any;
  let selectedTags: Set<string> = new Set();
  const lengthOptions = [
    { label: 'Note (~100 words)', value: 100 },
    { label: 'Short (~250 words)', value: 250 },
    { label: 'Medium (~500 words)', value: 500 },
    { label: 'Long (~1000 words)', value: 1000 },
  ];
  let selectedLength: any;

  onMount(() => {
    const contextObject = promptData.CONSTRUCT || promptData.BODY;
    const aiContext = contextObject?.aiContext;

    if (aiContext) {
      selectedTags = new Set(aiContext.tags || []);
      selectedStyle = availableStyles.find(s => s.label === aiContext.style?.label) || availableStyles[0];
      selectedLength = lengthOptions.find(l => l.value === aiContext.length) || lengthOptions[2];
    } else {
      selectedStyle = availableStyles[0];
      selectedLength = lengthOptions[2];
    }
  });

  function toggleTag(tag: string) {
    selectedTags.has(tag) ? selectedTags.delete(tag) : selectedTags.add(tag);
    selectedTags = new Set(selectedTags); // Trigger reactivity
  }

  async function handleGenerate(promptOverride: string | null = null) {
    isLoading = true;
    generatedText = '';
    error = '';
    abortController = new AbortController();

    try {
      let promptToUse: string;
      if (promptOverride) {
        promptToUse = promptOverride;
      } else {
        promptToUse = promptTemplate;
        for (const key in promptData) {
          promptToUse = promptToUse.replace(`%%${key.toUpperCase()}%%`, JSON.stringify(promptData[key], null, 2));
        }
        promptToUse = promptToUse
          .replace('%%SEED_TEXT%%', seedText)
          .replace('%%TAGS%%', Array.from(selectedTags).join(', '))
          .replace('%%STYLE_LABEL%%', selectedStyle.label)
          .replace('%%STYLE_GUIDELINE%%', selectedStyle.guideline)
          .replace('%%LENGTH%%', selectedLength.value.toString());
      }
      
      lastPrompt = promptToUse;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: get(aiSettings), fullPrompt: promptToUse }),
        signal: abortController.signal
      });

      if (!response.ok || !response.body) {
        const err = await response.json();
        throw new Error(err.error || `HTTP error! status: ${response.status}`);
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
            if (content) generatedText += content;
          } catch (e) { /* Ignore parsing errors */ }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        error = 'Generation cancelled by user.';
      } else {
        error = e.message;
      }
    } finally {
      isLoading = false;
    }
  }

  function handleCancelGeneration() {
    if (abortController) {
      abortController.abort();
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

  function handleAccept() {
    dispatch('generate', generatedText);
    handleClose();
  }

  function handleClose() {
    const contextObject = promptData.CONSTRUCT || promptData.BODY;
    if (contextObject) {
      contextObject.aiContext = {
        tags: Array.from(selectedTags),
        style: selectedStyle,
        length: selectedLength.value,
      };
    }
    dispatch('close');
  }

  function sanitizeForId(text: string): string {
    return text.replace(/[^a-zA-Z0-9]/g, '-');
  }

  function jumpToTag(event: MouseEvent) {
    event.preventDefault();
    const targetId = (event.currentTarget as HTMLAnchorElement).getAttribute('href');
    if (targetId) {
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
</script>

<div class="modal-backdrop" on:click={handleClose}>
  <div class="modal" on:click|stopPropagation>
    <h2 id="dialog-title">Expand Description with AI</h2>
    <div class="columns">
      <div class="left-column">
        <div class="form-group">
          <label for="seed-text">Seed Text (Your Notes)</label>
          <textarea id="seed-text" bind:value={seedText} rows="8"></textarea>
        </div>
        <div class="form-group">
          <label for="report-style">Report Style</label>
          <select id="report-style" bind:value={selectedStyle}>
            {#each availableStyles as style (style.label)}
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
          <div class="tag-jump-list">
            Jump to:
            {#each Object.keys(availableTags) as category (category)}
              <a href="#tag-category-{sanitizeForId(category)}" on:click={jumpToTag}>{category}</a>
            {/each}
          </div>
          <div id="tag-groups" class="tag-groups">
            {#each Object.entries(availableTags) as [category, sub] (category)}
              <div class="tag-group">
                <strong id="tag-category-{sanitizeForId(category)}">{category}</strong>
                <div class="tag-list">
                  {#if Array.isArray(sub)}
                    {#each sub as tag (tag)}
                      <label class="tag-label"><input type="checkbox" on:change={() => toggleTag(tag)} checked={selectedTags.has(tag)}> {tag}</label>
                    {/each}
                  {:else}
                    {#each Object.entries(sub) as [subCategory, tagList] (subCategory)}
                      <div class="sub-group">
                        <em>{subCategory}</em>
                        <div class="tag-list">
                          {#each tagList as tag (tag)}
                            <label class="tag-label"><input type="checkbox" on:change={() => toggleTag(tag)} checked={selectedTags.has(tag)}> {tag}</label>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
      <div class="right-column">
        <div class="form-group">
          <label for="generated-text">Generated Description</label>
          <div id="generated-text" class="generated-text-display">
            {@html generatedText.replace(/\n/g, '<br>')}
            {#if isLoading}<span class="blinking-cursor"></span>{/if}
          </div>
        </div>
        {#if error}<p class="error">{error}</p>{/if}
      </div>
    </div>
    <div class="modal-actions">
      {#if isLoading}
        <button on:click={handleCancelGeneration} class="cancel-button">Cancel</button>
      {:else}
        <button on:click={() => handleGenerate()}>Generate</button>
      {/if}
      <button on:click={openPromptEditor} disabled={!lastPrompt || isLoading}>View/Edit Last Prompt</button>
      <button on:click={handleAccept} disabled={!generatedText || isLoading}>Accept</button>
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

<style>
  .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1100; }
  .modal { 
    background: #2a2a2a; 
    padding: 2em; 
    border-radius: 8px; 
    width: 90%; 
    max-width: 1200px; 
    border: 1px solid #444; 
    max-height: 90vh; 
    display: flex; 
    flex-direction: column; 
  }
  h2 { margin-top: 0; color: #ff3e00; flex-shrink: 0; }
  .columns { 
    display: flex; 
    gap: 2em; 
    flex-grow: 1;
    min-height: 0; /* Important fix for flex children */
  }
  .left-column, .right-column { 
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    gap: 1em; 
    min-height: 0; /* Important fix for flex children */
  }
  .form-group { display: flex; flex-direction: column; width: 100%; }
  .form-group.fixed-height { flex-shrink: 0; }
  .form-group label { margin-bottom: 0.5em; color: #eee; }
  .form-group textarea, .form-group select { width: 100%; padding: 0.5em; border-radius: 4px; border: 1px solid #555; background: #1a1a1a; color: #eee; }
  .generated-text-display { 
    flex-grow: 1; 
    background: #1a1a1a; 
    border: 1px solid #555; 
    border-radius: 4px; 
    padding: 1em; 
    white-space: pre-wrap; 
    overflow-y: auto; 
    min-height: 100px; /* Prevent collapsing */
  }
  .tags-container { 
    display: flex; 
    flex-direction: column; 
    flex-grow: 1; 
    width: 100%; 
    min-height: 0; /* Important fix for flex children */
  }
  .tag-jump-list {
    margin-bottom: 0.5em;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    align-items: center;
    flex-shrink: 0;
  }
  .tag-jump-list a {
    color: #88ccff;
    text-decoration: none;
    background-color: #333;
    padding: 0.2em 0.5em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .tag-jump-list a:hover {
    background-color: #444;
    text-decoration: underline;
  }
  .tag-groups { 
    flex-grow: 1; 
    overflow-y: auto; 
    background: #1a1a1a; 
    padding: 1em; 
    border-radius: 4px; 
    border: 1px solid #555; 
  }
  .tag-group { margin-bottom: 1em; }
  .tag-group strong { color: #ff9900; font-size: 1.1em; margin-bottom: 0.5em; display: block; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 0.5em; }
  .tag-label { background-color: #333; padding: 0.3em 0.6em; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
  .tag-label:hover { background-color: #444; }
  .tag-label input { margin-right: 0.4em; }
  .sub-group { margin-left: 1em; margin-top: 0.5em; }
  .sub-group em { color: #ccc; font-size: 1em; margin-bottom: 0.5em; display: block; }
  .blinking-cursor { display: inline-block; width: 8px; height: 1em; background: #eee; animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .prompt-editor-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(20, 20, 20, 0.95); padding: 2em; display: flex; flex-direction: column; }
  .prompt-textarea { flex-grow: 1; width: 100%; min-height: 240px; background: #111; color: #eee; border: 1px solid #555; border-radius: 4px; margin-bottom: 1em; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 1em; margin-top: 1em; flex-shrink: 0; }
  .modal-actions button { padding: 0.7em 1.5em; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; }
  .modal-actions button:hover { opacity: 0.9; }
  .modal-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .modal-actions button:first-child { background-color: #ff3e00; color: white; }
  .modal-actions .cancel-button { background-color: #dc3545; color: white; }
  .modal-actions button:nth-child(2) { background-color: #555; color: white; }
  .modal-actions button:nth-child(3) { background-color: #007bff; color: white; }
  .modal-actions button:last-child { background-color: #6c757d; color: white; }
</style>
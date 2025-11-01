<script lang="ts">
  import { aiSettings } from '../stores';

  export let showModal: boolean;

  let models: any[] = [];
  let fetchError = '';
  let isLoading = false;

  // Fetch models when the modal becomes visible
  $: if (showModal && models.length === 0) {
    loadModels();
  }

  async function loadModels() {
    isLoading = true;
    fetchError = '';
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      // Sort models: free first, then by price
      models = (data.data || []).sort((a: any, b: any) => {
        const priceA = parseFloat(a.pricing?.prompt) || 0;
        const priceB = parseFloat(b.pricing?.prompt) || 0;
        if (priceA === 0 && priceB > 0) return -1;
        if (priceB === 0 && priceA > 0) return 1;
        return priceA - priceB;
      });
    } catch (e: any) {
      fetchError = e.message;
    } finally {
      isLoading = false;
    }
  }

  function formatPrice(price: string, multiplier: number = 1000000) {
      const p = parseFloat(price);
      if (isNaN(p) || p === 0) return 'Free';
      return `$${(p * multiplier).toFixed(4)}/M tokens`;
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
<div class="modal-backdrop" on:click={handleClose} role="button" tabindex="0" on:keydown={(e) => {if (e.key === 'Enter' || e.key === 'Space') handleClose()}}>
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
    <h2 id="dialog-title">AI Settings</h2>
    <p>Configure your connection to an OpenRouter-compatible LLM.</p>
    
    <form on:submit|preventDefault autocomplete="on">
      <div class="form-group">
        <label for="endpoint">API Endpoint</label>
        <input type="text" id="endpoint" bind:value={$aiSettings.apiEndpoint}>
      </div>

      <div class="form-group">
        <label for="apikey">API Key</label>
        <input type="password" id="apikey" bind:value={$aiSettings.apiKey} autocomplete="current-password">
      </div>

      <div class="form-group">
        <label for="model">LLM Model</label>
        <select id="model" bind:value={$aiSettings.selectedModel} disabled={isLoading}>
          <option value={null}>Select a model...</option>
          {#each models as model (model.id)}
            <option value={model.id}>
              {model.name} ({formatPrice(model.pricing.prompt)} / {formatPrice(model.pricing.completion)})
            </option>
          {/each}
        </select>
        {#if isLoading}
          <p>Loading models...</p>
        {/if}
        {#if fetchError}
          <p class="error">Could not load models: {fetchError}</p>
        {/if}
      </div>
    </form>

    <div class="modal-actions">
      <button on:click={handleClose}>Close</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  .modal {
    background: #222;
    padding: 2em;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    border: 1px solid #444;
  }
  h2 {
    margin-top: 0;
    color: #ff3e00;
  }
  .form-group {
    margin-bottom: 1em;
  }
  label {
    display: block;
    margin-bottom: 0.5em;
    color: #ccc;
  }
  input {
    width: 100%;
    padding: 0.5em;
    background: #111;
    border: 1px solid #555;
    color: #eee;
    border-radius: 4px;
  }
  .modal-actions {
    margin-top: 2em;
    text-align: right;
  }
</style>

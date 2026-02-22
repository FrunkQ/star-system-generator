<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { aiSettings } from '$lib/stores';

  export let showModal: boolean;

  const dispatch = createEventDispatcher();

  let models: any[] = [];
  let fetchError = '';
  let isLoading = false;
  let testStatus = '';

  $: if (showModal && models.length === 0) {
    loadModels();
  }

  async function testConnection() {
    if (!$aiSettings.selectedModel) {
      testStatus = 'Please select a model first.';
      return;
    }
    testStatus = 'Testing...';
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${$aiSettings.apiKey}`
        },
        body: JSON.stringify({
          model: $aiSettings.selectedModel,
          messages: [{ role: 'user', content: 'Test prompt' }]
        })
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          throw new Error(`Provider is busy (HTTP ${response.status}). Please try again later or select a different model.`);
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      await response.json();
      testStatus = 'Successful!';
    } catch (e: any) {
      testStatus = `Error: ${e.message}`;
    }
  }

  async function loadModels() {
    isLoading = true;
    fetchError = '';
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      if (!response.ok) throw new Error(`Failed to fetch models: ${response.statusText}`);
      const data = await response.json();
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
    dispatch('close');
  }

  function handleSave() {
    dispatch('save', { ai: $aiSettings });
    dispatch('close');
  }
</script>

{#if showModal}
  <div class="modal-backdrop" on:click={handleClose}>
    <div class="modal" on:click|stopPropagation>
      <h2>LLM Settings</h2>
      <p>Configure your connection to an OpenRouter-compatible LLM. Get your key from <a href="https://openrouter.ai/settings/keys" target="_blank">OpenRouter</a>.</p>

      <div class="form-group">
        <label for="apikey">API Key</label>
        <input type="password" id="apikey" bind:value={$aiSettings.apiKey} autocomplete="current-password" />
      </div>

      <div class="form-group">
        <label for="model">LLM Model</label>
        <div class="model-selection">
          <select id="model" bind:value={$aiSettings.selectedModel} disabled={isLoading}>
            <option value="">Select a model...</option>
            {#each models as model (model.id)}
              <option value={model.id}>
                {model.name} ({formatPrice(model.pricing.prompt)} / {formatPrice(model.pricing.completion)})
              </option>
            {/each}
          </select>
          <button on:click={testConnection} disabled={isLoading || !$aiSettings.selectedModel}>Test</button>
        </div>
        {#if testStatus}
          <p>{testStatus}</p>
        {/if}
        {#if isLoading}
          <p>Loading models...</p>
        {/if}
        {#if fetchError}
          <p class="error">Could not load models: {fetchError}</p>
        {/if}
      </div>

      <div class="modal-actions">
        <button on:click={handleClose}>Close</button>
        <button class="primary" on:click={handleSave}>Save</button>
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
    z-index: 2000;
  }
  .modal {
    background: #222;
    padding: 1.5em;
    border-radius: 8px;
    width: 90%;
    max-width: 700px;
    border: 1px solid #444;
    color: #eee;
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
    margin-bottom: 0.4em;
    color: #ccc;
  }
  input,
  select {
    width: 100%;
    padding: 0.5em;
    background: #111;
    border: 1px solid #555;
    color: #eee;
    border-radius: 4px;
  }
  .model-selection {
    display: flex;
    gap: 0.6em;
    align-items: center;
  }
  .model-selection select {
    flex-grow: 1;
  }
  .modal-actions {
    margin-top: 1.5em;
    display: flex;
    justify-content: flex-end;
    gap: 0.6em;
  }
  .primary {
    background: #007bff;
    color: white;
    border: none;
    padding: 0.5em 1em;
    border-radius: 4px;
    cursor: pointer;
  }
</style>

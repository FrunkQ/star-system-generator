<script lang="ts">
  import { aiSettings } from '../stores';
  import type { Starmap } from '../types';
  import { createEventDispatcher } from 'svelte';

  export let showModal: boolean;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  let models: any[] = [];
  let fetchError = '';
  let isLoading = false;

  // Starmap settings
  let starmapName = starmap.name;
  let distanceUnit = starmap.distanceUnit;
  let unitIsPrefix = starmap.unitIsPrefix;
  let mapMode: 'diagrammatic' | 'scaled' = starmap.mapMode ?? 'diagrammatic';
  let showScaleBar = starmap.scale?.showScaleBar ?? true;

  let testStatus = '';

  // Fetch models when the modal becomes visible
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
          'Authorization': `Bearer ${$aiSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: $aiSettings.selectedModel,
          messages: [{ role: 'user', content: 'Test prompt' }],
        }),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          throw new Error(`Provider is busy (HTTP ${response.status}). Please try again later or select a different model.`);
        } else {
          try {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP error! status: ${response.status} - ${response.statusText}`);
          } catch (jsonError) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
          }
        }
      }

      // Consume the response body for successful requests, even if we don't need the content
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

  function handleSave() {
    dispatch('save', {
      starmap: {
        name: starmapName,
        distanceUnit,
        unitIsPrefix,
        mapMode,
        scale: {
          unit: distanceUnit || 'LY',
          pixelsPerUnit: starmap.scale?.pixelsPerUnit && starmap.scale.pixelsPerUnit > 0 ? starmap.scale.pixelsPerUnit : 25,
          showScaleBar,
        },
      },
      ai: $aiSettings,
    });
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
    <h2 id="dialog-title">Settings</h2>

    <div class="settings-section">
      <h3>Starmap Settings</h3>
      <div class="form-group">
        <label for="starmapName">Map Name</label>
        <input type="text" id="starmapName" bind:value={starmapName}>
      </div>
      <div class="form-group">
        <label for="distanceUnit">Distance Unit</label>
        <div style="display: flex; align-items: center; gap: 0.5em;">
          <input type="text" id="distanceUnit" bind:value={distanceUnit}>
          <span>(Example: {unitIsPrefix ? distanceUnit : ''}5{!unitIsPrefix ? distanceUnit : ''})</span>
        </div>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" bind:checked={unitIsPrefix} />
          Unit is a prefix
        </label>
      </div>
      <div class="form-group">
        <label for="mapMode">Map Mode</label>
        <select id="mapMode" bind:value={mapMode}>
          <option value="diagrammatic">Diagrammatic</option>
          <option value="scaled">Scaled</option>
        </select>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" bind:checked={showScaleBar} />
          Show scale bar (scaled mode)
        </label>
      </div>
    </div>

    <div class="settings-section">
      <h3>LLM Settings (Optional)</h3>
      <p>Configure your connection to an OpenRouter-compatible LLM. Get your key from <a href="https://openrouter.ai/settings/keys" target="_blank">OpenRouter</a>.</p>
      
      <form on:submit|preventDefault autocomplete="on">
        <div class="form-group">
          <label for="apikey">API Key</label>
          <input type="password" id="apikey" bind:value={$aiSettings.apiKey} autocomplete="current-password">
        </div>

        <div class="form-group">
          <label for="model">LLM Model</label>
          <div class="model-selection">
            <select id="model" bind:value={$aiSettings.selectedModel} disabled={isLoading}>
              <option value={null}>Select a model...</option>
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
      </form>
    </div>

    <div class="modal-actions">
      <button on:click={handleSave}>Save</button>
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
    max-width: 750px; /* Increased by 50% from 500px */
    border: 1px solid #444;
    color: #eee; /* Set default text color for the modal */
  }
  h2 {
    margin-top: 0;
    color: #ff3e00;
  }
  .form-group {
    margin-bottom: 1em;
  }
  .form-group label {
    display: flex;
    align-items: center;
    margin-bottom: 0.5em;
    color: #ccc;
  }

  .form-group label input[type="checkbox"] {
    width: auto;
    margin-right: 0.5em;
  }
  input,
  select {
    width: 100%;
    padding: 0.5em;
    background: #111;
    border: 1px solid #555;
    color: #eee !important; /* Ensure text is light */
    border-radius: 4px;
  }

  input#distanceUnit {
    width: 50%;
  }
  .modal-actions {
    margin-top: 2em;
    text-align: right;
  }

  .model-selection {
    display: flex;
    gap: 1em;
    align-items: center;
  }

  .model-selection select {
    flex-grow: 1;
  }
</style>

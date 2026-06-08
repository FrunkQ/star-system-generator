<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { aiSettings } from '$lib/stores';

  export let showModal: boolean;

  const dispatch = createEventDispatcher();

  // Dual backend (mirrors the dynamic-map-renderer AI panel): a local OpenAI-compatible server
  // (LM Studio / Ollama, no key) OR a hosted provider (OpenRouter, needs a key). Both expose the
  // standard /models and /chat/completions, so the only real switch is the base URL + the key.
  const PRESETS = [
    { label: 'Local (LM Studio / Ollama)', url: 'http://localhost:1234/v1', needsKey: false },
    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', needsKey: true }
  ];

  let models: any[] = [];
  let testStatus = '';
  let testOk = false;
  let isLoading = false;
  let manualModel = '';

  $: base = ($aiSettings.apiEndpoint || '').replace(/\/$/, '');
  $: isOpenRouter = /openrouter\.ai/i.test(base);

  function applyPreset(p: { url: string }) {
    $aiSettings.apiEndpoint = p.url;
    models = [];
    testStatus = '';
    testOk = false;
  }

  async function testAndListModels() {
    isLoading = true;
    testStatus = 'Connecting…';
    testOk = false;
    models = [];
    try {
      const headers: Record<string, string> = {};
      if ($aiSettings.apiKey) headers['Authorization'] = `Bearer ${$aiSettings.apiKey}`;
      const res = await fetch(`${base}/models`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      const list = (data.data || data.models || []) as any[];
      // OpenRouter sorts nicely by price (free first); local servers usually have a handful.
      models = list.slice().sort((a, b) => {
        const pa = parseFloat(a?.pricing?.prompt) || 0;
        const pb = parseFloat(b?.pricing?.prompt) || 0;
        if (pa === 0 && pb > 0) return -1;
        if (pb === 0 && pa > 0) return 1;
        return pa - pb;
      });
      testOk = true;
      testStatus = `Connected — ${models.length} model${models.length === 1 ? '' : 's'} available`;
      // Keep the saved model selected if it's still on this endpoint.
      if ($aiSettings.selectedModel && !models.some((m) => (m.id || m) === $aiSettings.selectedModel)) {
        testStatus += ' (saved model not on this endpoint — pick one or type it below)';
      }
    } catch (e: any) {
      testOk = false;
      testStatus = `Could not connect: ${e.message}. ${isOpenRouter ? 'Check the API key.' : 'Is the local server running with CORS enabled?'}`;
    } finally {
      isLoading = false;
    }
  }

  function formatPrice(price: string | undefined, multiplier = 1_000_000) {
    const p = parseFloat(price ?? '');
    if (isNaN(p) || p === 0) return 'Free';
    return `$${(p * multiplier).toFixed(2)}/M`;
  }
  function modelLabel(m: any) {
    if (typeof m === 'string') return m;
    const price = m.pricing ? ` (${formatPrice(m.pricing.prompt)} / ${formatPrice(m.pricing.completion)})` : '';
    return `${m.name || m.id}${price}`;
  }

  function useManualModel() {
    if (manualModel.trim()) $aiSettings.selectedModel = manualModel.trim();
  }

  function handleClose() { dispatch('close'); }
  function handleSave() { dispatch('save', { ai: $aiSettings }); dispatch('close'); }
</script>

{#if showModal}
  <div class="modal-backdrop" on:click={handleClose}>
    <div class="modal" on:click|stopPropagation>
      <h2>LLM Settings</h2>
      <p>Connect a local OpenAI-compatible server (LM Studio, Ollama — no key needed) or a hosted
        provider like <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">OpenRouter</a>.</p>

      <div class="form-group">
        <label>Quick set-up</label>
        <div class="presets">
          {#each PRESETS as p}
            <button class="preset" class:active={base === p.url.replace(/\/$/, '')} on:click={() => applyPreset(p)}>{p.label}</button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label for="baseurl">Base URL</label>
        <input id="baseurl" type="text" bind:value={$aiSettings.apiEndpoint} placeholder="http://localhost:1234/v1" />
      </div>

      <div class="form-group">
        <label for="apikey">API Key {isOpenRouter ? '' : '(optional for local servers)'}</label>
        <input type="password" id="apikey" bind:value={$aiSettings.apiKey} autocomplete="current-password" placeholder={isOpenRouter ? 'sk-or-…' : 'usually blank for local'} />
      </div>

      <div class="form-group">
        <label for="model">Model</label>
        <div class="model-selection">
          <select id="model" bind:value={$aiSettings.selectedModel} disabled={isLoading || models.length === 0}>
            <option value="">{models.length ? 'Select a model…' : 'Test connection to list models'}</option>
            {#each models as model}
              <option value={model.id || model}>{modelLabel(model)}</option>
            {/each}
          </select>
          <button on:click={testAndListModels} disabled={isLoading || !base}>Test &amp; list</button>
        </div>
        <div class="manual">
          <input type="text" bind:value={manualModel} placeholder="…or type a model id (local servers)" on:keydown={(e) => e.key === 'Enter' && useManualModel()} />
          <button on:click={useManualModel} disabled={!manualModel.trim()}>Use</button>
        </div>
        {#if $aiSettings.selectedModel}<p class="current">Current: <code>{$aiSettings.selectedModel}</code></p>{/if}
        {#if testStatus}<p class:ok={testOk} class:error={!testOk && !isLoading}>{testStatus}</p>{/if}
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
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex; justify-content: center; align-items: center; z-index: 2000;
  }
  .modal {
    background: var(--bg-panel); padding: 1.5em; border-radius: 8px;
    width: 90%; max-width: 640px; border: 1px solid var(--border); color: var(--text);
    max-height: 90vh; overflow-y: auto;
  }
  h2 { margin-top: 0; color: var(--accent); }
  .form-group { margin-bottom: 1em; }
  label { display: block; margin-bottom: 0.4em; color: var(--text-muted); }
  input, select {
    width: 100%; padding: 0.5em; background: var(--bg-panel);
    border: 1px solid var(--border); color: var(--text); border-radius: 4px;
  }
  .presets { display: flex; gap: 0.5em; flex-wrap: wrap; }
  .preset {
    flex: 1; min-width: 160px; padding: 0.5em; cursor: pointer;
    background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
  }
  .preset.active { border-color: var(--accent); }
  .model-selection { display: flex; gap: 0.6em; align-items: center; }
  .model-selection select { flex-grow: 1; }
  .model-selection button, .manual button {
    padding: 0.5em 0.9em; white-space: nowrap; cursor: pointer;
    background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
  }
  .manual { display: flex; gap: 0.6em; align-items: center; margin-top: 0.5em; }
  .manual input { flex-grow: 1; }
  .current { font-size: 0.85em; color: var(--text-muted); margin: 0.5em 0 0; }
  .current code { color: var(--text); }
  .ok { color: #46c46a; }
  .error { color: var(--status-bad, #e0484d); }
  .modal-actions { margin-top: 1.5em; display: flex; justify-content: flex-end; gap: 0.6em; }
  .primary { background: var(--accent); color: white; border: none; padding: 0.5em 1em; border-radius: 4px; cursor: pointer; }
</style>

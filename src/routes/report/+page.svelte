<script lang="ts">
  import { onMount } from 'svelte';
  import ReportDocument from '$lib/reports/ReportDocument.svelte';
  import { computePlayerSnapshot } from '$lib/system/utils';
  import type { System } from '$lib/types';

  // Thin loader: reads the one-shot report payload the System View stashes in sessionStorage,
  // applies redaction for Player mode, and hands it to the shared <ReportDocument>. The live,
  // broadcast-fed sibling of this is /catalogue (the Companion App).
  let system: System | null = null;
  let mode: 'GM' | 'Player' = 'GM';
  let theme = 'retro';
  let includeConstructs = true;
  let units: 'metric' | 'imperial' = 'metric';
  let loading = true;
  let error = '';

  onMount(() => {
    try {
      const dataStr = sessionStorage.getItem('reportData');
      if (!dataStr) {
        error = 'No report data found. Please generate a report from the System View.';
        loading = false;
        return;
      }
      const data = JSON.parse(dataStr);
      mode = data.mode;
      theme = data.theme;
      includeConstructs = data.includeConstructs ?? true;
      units = data.units === 'imperial' ? 'imperial' : 'metric';
      system = mode === 'Player' ? computePlayerSnapshot(data.system) : data.system;
      loading = false;
    } catch (e) {
      console.error(e);
      error = 'Failed to load report data.';
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>System Report - {system ? system.name : 'Loading...'}</title>
</svelte:head>

{#if loading}
  <div class="loading">Initializing Report System...</div>
{:else if error}
  <div class="error">{error}</div>
{:else}
  <ReportDocument {system} {mode} {theme} {includeConstructs} {units} chrome="report" />
{/if}

<style>
  .loading, .error { padding: 2rem; text-align: center; font-family: sans-serif; }
  .error { color: red; }
</style>

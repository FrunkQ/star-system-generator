<script lang="ts">
  // Debug footer extracted from SystemView (Phase 01.7): JSON dump + rebuild /
  // sanitize actions. Operates on the global systemStore; only needs rulePack.
  import type { RulePack } from '$lib/types';
  import { systemStore } from '$lib/stores';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { sanitizeSystem } from '$lib/system/utils';
  import { rebuildSystemHierarchy } from '$lib/physics/hierarchyRebuild';

  export let rulePack: RulePack;
  let showJson = false;
</script>

<div class="debug-controls">
    <button on:click={() => showJson = !showJson}>
        {showJson ? 'Hide' : 'Show'} JSON
    </button>
    <button on:click={() => {
        if ($systemStore) {
            const rebuilt = rebuildSystemHierarchy($systemStore);
            const fullyReprocessed = systemProcessor.process({ ...rebuilt, nodes: rebuilt.nodes }, rulePack);
            systemStore.set({ ...fullyReprocessed, isManuallyEdited: true });
            alert('Hierarchy rebuilt: The most massive body is now the system root, and stability has been recalculated.');
        }
    }}>Rebuild Hierarchy</button>
    <button on:click={() => {
        if ($systemStore) {
            const repaired = sanitizeSystem($systemStore, rulePack);
            const fullyReprocessed = systemProcessor.process({ ...repaired, nodes: repaired.nodes }, rulePack);
            systemStore.set({ ...fullyReprocessed, isManuallyEdited: true });
            alert('System updated: Fixed legacy constructs/rings and fully reprocessed system physics/classification.');
        }
    }}>Update & Repair System</button>
</div>

{#if showJson}
    <pre>{JSON.stringify($systemStore, null, 2)}</pre>
{/if}

<style>
  .debug-controls {
      margin-top: 1em;
  }
  pre {
    background-color: var(--bg-panel);
    border: 1px solid var(--border-soft);
    padding: 1em;
    border-radius: 5px;
    white-space: pre-wrap;
    color: var(--text);
    font-family: monospace;
  }
</style>

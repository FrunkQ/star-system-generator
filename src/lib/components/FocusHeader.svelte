<script lang="ts">
  // Focused-body name row, extracted from SystemView (Phase 01.7): sensor-overlay
  // toggle (constructs), player-visibility toggle, rename, and the Edit button.
  // showSensors is bound; the store/mode/visualizer actions dispatch back so the
  // mode state machine stays in SystemView.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let focusedBody: CelestialBody;
  export let showSensors: boolean = false;
  export let isEditing: boolean = false;
  export let isPlanning: boolean = false;
  export let isShipLogOpen: boolean = false;

  const dispatch = createEventDispatcher();
</script>

<div class="name-row">
    {#if focusedBody.kind === 'construct'}
        {@const hasSensors = (focusedBody.sensors && focusedBody.sensors.length > 0)}
        <button class="visibility-btn"
            class:active={showSensors}
            disabled={!hasSensors}
            on:click={() => { if (hasSensors) showSensors = !showSensors; }}
            title={hasSensors ? "Toggle Sensor Overlay" : "No Sensors Installed"}
            style="position: relative;"
        >
            <!-- Satellite Dish Base Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke={hasSensors ? (showSensors ? "#4ade80" : "#888") : "#666"}
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.5a9 9 0 0 1-14.88 6.42" /> <!-- Dish Curve -->
                <path d="M2 20l5-5" /> <!-- Stand -->
                <path d="M12.5 7.5l-5 5" /> <!-- Feed Arm -->
                <circle cx="13" cy="7" r="1.5" /> <!-- Feed Node -->
            </svg>

            <!-- No Entry Overlay if no sensors -->
            {#if !hasSensors}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                     style="position: absolute; bottom: -2px; right: -2px;"
                     fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
            {/if}
        </button>
    {/if}
    <button class="visibility-btn" on:click={() => dispatch('togglevisibility')}
        title={focusedBody.object_playerhidden ? "Hidden from Players" : "Visible to Players"}>
        {#if focusedBody.object_playerhidden}
            <!-- Eye Closed -->
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        {:else}
            <!-- Eye Open -->
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        {/if}
    </button>
    <input type="text" value={focusedBody.name}
        on:change={(e) => dispatch('rename', { nodeId: focusedBody.id, newName: (e.currentTarget as HTMLInputElement).value })}
        class="name-input" title="Click to rename" />
    {#if !isEditing && !isPlanning && !isShipLogOpen && (focusedBody.kind !== 'barycenter' || focusedBody.parentId)}
        <button class="edit-btn small" on:click={() => dispatch('enteredit')} style="margin-left: 5px;">Edit</button>
    {/if}
</div>

<style>
  .name-row {
      display: flex;
      align-items: center;
      gap: 0.5em;
      width: 100%;
      margin-bottom: 0.5em;
  }
  .visibility-btn {
      background: none;
      border: 1px solid #444;
      border-radius: 4px;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #222;
  }
  .visibility-btn:hover {
      background-color: #333;
      border-color: #666;
  }
  .name-input {
    background-color: transparent;
    border: 1px solid transparent;
    color: #ff3e00;
    font-size: 1.8em;
    font-weight: bold;
    padding: 0.1em;
    margin: 0;
    width: 100%;
    border-radius: 4px;
    flex-grow: 1;
    margin-bottom: 0;
  }
  .name-input:hover, .name-input:focus {
      background-color: #252525;
      border-color: #444;
  }
</style>

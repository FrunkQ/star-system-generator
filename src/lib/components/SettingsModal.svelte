<script lang="ts">
  import type { Starmap } from '../types';
  import { createEventDispatcher } from 'svelte';
  import { ensureTemporalState } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar } from '$lib/temporal/utre';

  export let showModal: boolean;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();


  // Starmap settings
  let starmapName = starmap.name;
  let distanceUnit = starmap.distanceUnit;
  let unitIsPrefix = starmap.unitIsPrefix;
  let mapMode: 'diagrammatic' | 'scaled' = starmap.mapMode ?? 'diagrammatic';
  let showScaleBar = starmap.scale?.showScaleBar ?? true;
  let normalizedTemporal = ensureTemporalState(starmap).temporal!;
  let activeCalendarKey = normalizedTemporal.activeCalendarKey;
  let calendarKeys = Object.keys(normalizedTemporal.temporal_registry);
  let epochYear = 1;
  let currentDisplayLabel = '';
  let epochFieldsDirty = false;

  $: if (showModal) {
    const normalized = ensureTemporalState(starmap);
    normalizedTemporal = normalized.temporal!;
    calendarKeys = Object.keys(normalizedTemporal.temporal_registry);
    if (!calendarKeys.includes(activeCalendarKey)) {
      activeCalendarKey = normalizedTemporal.activeCalendarKey;
    }
    syncEpochEditorFromCurrentMaster();
  }

  function handleSave() {
    const nextTemporal = JSON.parse(JSON.stringify(normalizedTemporal));
    nextTemporal.activeCalendarKey = activeCalendarKey;

    const calendar = nextTemporal.temporal_registry[activeCalendarKey];
    if (calendar && epochFieldsDirty) {
      if (calendar.math_type === 'BUCKET_DRAIN') {
        applyBucketYearOverride(nextTemporal, calendar);
      }
    }

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
        temporal: nextTemporal
      }
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

  function syncEpochEditorFromCurrentMaster() {
    const temporal = normalizedTemporal;
    const calendar = temporal.temporal_registry[activeCalendarKey];
    if (!calendar) return;

    const display = parseClockSeconds(temporal.displayTimeSec, 0n);
    const resolvedDisplay = resolveCalendar(display, calendar);
    currentDisplayLabel = resolvedDisplay.formatted;

    if (calendar.math_type === 'BUCKET_DRAIN') {
      epochYear = Number(resolvedDisplay.fields.year ?? 1);
    }
    epochFieldsDirty = false;
  }

  function markEpochDirty() {
    epochFieldsDirty = true;
  }

  function applyBucketYearOverride(
    temporal: NonNullable<Starmap['temporal']>,
    calendar: Extract<NonNullable<Starmap['temporal']>['temporal_registry'][string], { math_type: 'BUCKET_DRAIN' }>
  ) {
    const display = parseClockSeconds(temporal.displayTimeSec, 0n);
    const resolvedDisplay = resolveCalendar(display, calendar);
    const currentYear = Number(resolvedDisplay.fields.year ?? 1);
    const targetYear = Math.max(1, Math.floor(epochYear));
    const deltaYears = targetYear - currentYear;
    if (deltaYears === 0) return;

    const hierarchy = calendar.hierarchy;
    const yearMul = BigInt(hierarchy.find((u) => u.unit === 'year')?.multiplier ?? 31536000);
    const driftPerYear = BigInt(calendar.leap_logic?.drift_per_year_t ?? 0);
    const timeShiftSec = BigInt(deltaYears) * (yearMul + driftPerYear);
    const currentMaster = parseClockSeconds(temporal.masterTimeSec, 0n);
    const currentDisplay = parseClockSeconds(temporal.displayTimeSec, currentMaster);
    temporal.masterTimeSec = (currentMaster + timeShiftSec).toString();
    temporal.displayTimeSec = (currentDisplay + timeShiftSec).toString();
  }
</script>

<svelte:body on:keydown={handleKeyDown} />

{#if showModal}
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={handleClose} role="button" tabindex="0" on:keydown={(e) => {if (e.key === 'Enter' || e.key === 'Space') handleClose()}}>
  <div class="modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
    <h2 id="dialog-title">Starmap Settings</h2>

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
      <div class="form-group">
        <label for="calendarSelect">Time/Date System</label>
        <select id="calendarSelect" bind:value={activeCalendarKey} on:change={syncEpochEditorFromCurrentMaster}>
          {#each calendarKeys as key}
            <option value={key}>{key}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <div class="inline-time">Display Date/Time: <strong>{currentDisplayLabel}</strong></div>
      </div>
      {#if normalizedTemporal.temporal_registry[activeCalendarKey]?.math_type === 'BUCKET_DRAIN'}
        <div class="form-group">
          <label for="calendarYearOverride">Calendar Year Override (current display year)</label>
          <input id="calendarYearOverride" type="number" min="1" bind:value={epochYear} on:input={markEpochDirty} />
        </div>
      {/if}
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
  .inline-time {
    color: #ccc;
  }
  .inline-time strong {
    color: #eee;
  }
  small {
    color: #999;
  }
</style>

<script lang="ts">
  import type { Starmap } from '../types';
  import { createEventDispatcher } from 'svelte';
  import { ensureTemporalState } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar } from '$lib/temporal/utre';
  import { starmapUiStore } from '$lib/starmapUiStore';

  export let showModal: boolean;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  // Sectioned settings (Starmap View / Technology / System). Orrery View was dropped (Q2).
  type Section = 'starmap' | 'technology' | 'system';
  let activeSection: Section = 'starmap';
  let invertDisplay = starmap.invertDisplay ?? false;
  $: if (showModal) invertDisplay = starmap.invertDisplay ?? false;


  // Starmap settings
  let starmapName = starmap.name;
  let distanceUnit = starmap.distanceUnit;
  let unitIsPrefix = starmap.unitIsPrefix;
  let generationEngine = starmap.generationEngine ?? 'standard';
  let mapMode: 'diagrammatic' | 'scaled' = starmap.mapMode ?? 'diagrammatic';
  let showScaleBar = starmap.scale?.showScaleBar ?? true;
  let normalizedTemporal = ensureTemporalState(starmap).temporal!;
  let activeCalendarKey = normalizedTemporal.activeCalendarKey;
  let calendarKeys = Object.keys(normalizedTemporal.temporal_registry);
  let epochYear = 1;
  let currentDisplayLabel = '';
  let epochFieldsDirty = false;
  let showAlphaDisclaimer = false;
  let alphaAcknowledged = false;

  $: if (generationEngine === 'evolutionary' && !alphaAcknowledged && !showAlphaDisclaimer && starmap.generationEngine !== 'evolutionary') {
    showAlphaDisclaimer = true;
  }

  function cancelAlpha() {
    generationEngine = starmap.generationEngine ?? 'standard';
    showAlphaDisclaimer = false;
    alphaAcknowledged = false;
  }

  function proceedAlpha() {
    showAlphaDisclaimer = false;
    alphaAcknowledged = true;
  }

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
        generationEngine,
        invertDisplay,
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
  <div class="modal settings-modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
    <h2 id="dialog-title">Settings</h2>

    <div class="settings-layout">
      <nav class="settings-nav">
        <button class:active={activeSection === 'starmap'} on:click={() => activeSection = 'starmap'}>Starmap View</button>
        <button class:active={activeSection === 'technology'} on:click={() => activeSection = 'technology'}>Technology</button>
        <button class:active={activeSection === 'system'} on:click={() => activeSection = 'system'}>System</button>
      </nav>

      <div class="settings-content">
        {#if activeSection === 'starmap'}
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
            <label><input type="checkbox" bind:checked={unitIsPrefix} /> Unit is a prefix</label>
          </div>
          <div class="form-group">
            <label for="mapMode">Map Mode</label>
            <select id="mapMode" bind:value={mapMode}>
              <option value="diagrammatic">Diagrammatic</option>
              <option value="scaled">Scaled</option>
            </select>
          </div>
          <div class="form-group highlight-row">
            <label for="generationEngine">Generation Engine</label>
            <select id="generationEngine" bind:value={generationEngine}>
              <option value="standard">Standard (Stable)</option>
              <option value="evolutionary">Evolutionary (Alpha Physics)</option>
            </select>
          </div>
          <div class="form-group">
            <label><input type="checkbox" bind:checked={showScaleBar} /> Show scale bar (scaled mode)</label>
          </div>

          <h3>Map display</h3>
          <div class="form-group">
            <label><input type="checkbox" bind:checked={$starmapUiStore.showBackgroundImage} disabled={invertDisplay} /> Show background image</label>
          </div>
          <div class="form-group">
            <label title="Print-friendly white background + dark labels (disables the background image)."><input type="checkbox" bind:checked={invertDisplay} /> Invert display (print)</label>
          </div>
          <div class="form-group">
            <label for="gridType">Snap grid</label>
            <select id="gridType" bind:value={$starmapUiStore.gridType}>
              <option value="none">No Grid</option>
              <option value="grid">Grid</option>
              <option value="hex">Hex</option>
              <option value="traveller-hex">Traveller Hex</option>
            </select>
          </div>

          <h3>Date &amp; time</h3>
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
          <div class="form-group">
            <button class="section-btn" on:click={() => { dispatch('edittemporal'); showModal = false; }}>Time &amp; Calendars…</button>
          </div>

        {:else if activeSection === 'technology'}
          <p class="section-hint">Rulepack overrides for this starmap.</p>
          <button class="section-btn" on:click={() => { dispatch('editfuel'); showModal = false; }}>Fuel &amp; Drives…</button>
          <button class="section-btn" on:click={() => { dispatch('editatmospheres'); showModal = false; }}>Atmospheres…</button>
          <button class="section-btn" on:click={() => { dispatch('editsensors'); showModal = false; }}>Sensors…</button>

        {:else}
          <p class="section-hint">App-wide preferences.</p>
          <button class="section-btn" on:click={() => { dispatch('llm'); showModal = false; }}>LLM Settings…</button>
          <a class="section-btn" href="/palette" on:click={() => showModal = false}>Appearance…</a>
          <button class="section-btn" on:click={() => { dispatch('about'); showModal = false; }}>About</button>
        {/if}
      </div>
    </div>

    <div class="modal-actions">
      <button on:click={handleSave}>Save</button>
      <button on:click={handleClose}>Close</button>
    </div>
  </div>

  {#if showAlphaDisclaimer}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="alpha-disclaimer-overlay" on:click|stopPropagation>
      <div class="alpha-modal">
        <h2>DANGER --- DANGER</h2>
        <h3>You are entering the Alphas Zone</h3>
        
        <p>Over the next few months, I want to mess around with Generation V2 functionality.</p>
        <p>You are very welcome to jump in, have a play, and share feedback on the Discord forum.</p>
        <p><strong>Just bear in mind: this is not complete.</strong> For example, it does not generate full star systems yet.</p>
        <p>Right now, it is basically a proof of concept — a place to try out a bunch of ideas, see what works, and figure out what people actually like.</p>
        <p>The goal is to move away from the current simple procedural generation and head more toward physical simulation.</p>
        <p>Have a poke around, break things, see what you find, and let me know what feels good, what feels weird, and what feels rubbish.</p>

        <div class="alpha-buttons">
          <button class="cancel-alpha" on:click={cancelAlpha}>Get me out of here...</button>
          <button class="proceed-alpha" on:click={proceedAlpha}>Lemme see...</button>
        </div>
      </div>
    </div>
  {/if}
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
    background: var(--bg-panel);
    padding: 2em;
    border-radius: 8px;
    width: 90%;
    max-width: 750px; /* Increased by 50% from 500px */
    border: 1px solid var(--border);
    color: var(--text); /* Set default text color for the modal */
  }
  .settings-layout {
    display: flex;
    gap: 16px;
    min-height: 300px;
  }
  .settings-nav {
    flex: 0 0 150px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid var(--border);
    padding-right: 12px;
  }
  .settings-nav button {
    text-align: left;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted, #cfcfcf);
    cursor: pointer;
    width: 100%;
  }
  .settings-nav button:hover { background: var(--bg-control-hover, #232733); }
  .settings-nav button.active { background: var(--accent); color: var(--on-accent, #fff); }
  .settings-content {
    flex: 1 1 auto;
    min-width: 0;
    max-height: 56vh;
    overflow-y: auto;
  }
  .settings-content h3 {
    margin: 1.2em 0 0.6em;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint, #8a8f9a);
  }
  .settings-content h3:first-child { margin-top: 0; }
  .section-hint { color: var(--text-faint, #8a8f9a); margin: 0 0 12px; }
  .section-btn {
    display: block;
    width: 100%;
    text-align: left;
    padding: 11px 12px;
    margin-bottom: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-control, #1b1e26);
    color: var(--text);
    cursor: pointer;
    text-decoration: none;
    box-sizing: border-box;
  }
  .section-btn:hover { background: var(--bg-control-hover, #232733); }
  h2 {
    margin-top: 0;
    color: var(--accent);
  }
  .form-group {
    margin-bottom: 1em;
  }
  .form-group label {
    display: flex;
    align-items: center;
    margin-bottom: 0.5em;
    color: var(--text-muted);
  }

  .form-group label input[type="checkbox"] {
    width: auto;
    margin-right: 0.5em;
  }
  .highlight-row {
    background: var(--bg-panel);
    padding: 10px;
    border-radius: 4px;
    border-left: 4px solid #4299e1;
    margin-bottom: 1em;
  }
  input,
  select {
    width: 100%;
    padding: 0.5em;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text) !important; /* Ensure text is light */
    border-radius: 4px;
  }

  input#distanceUnit {
    width: 50%;
  }
  .modal-actions {
    margin-top: 2em;
    text-align: right;
  }

  /* ---- Mobile / narrow: full-screen sheet, nav becomes a top tab strip ---- */
  @media (max-width: 700px), (pointer: coarse) {
    .modal-backdrop {
      align-items: stretch;
      justify-content: stretch;
      /* Above the phone overlays (transport 1150, sheet 1200, FAB 1300, scrim 1400). */
      z-index: 1500;
    }
    .modal.settings-modal {
      width: 100%;
      max-width: none;
      height: 100%;
      border: none;
      border-radius: 0;
      padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .settings-modal > h2 { flex: 0 0 auto; }
    .settings-layout {
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      gap: 10px;
    }
    .settings-nav {
      flex: 0 0 auto;
      flex-direction: row;
      overflow-x: auto;
      border-right: none;
      border-bottom: 1px solid var(--border);
      padding-right: 0;
      padding-bottom: 8px;
      gap: 6px;
    }
    .settings-nav button {
      flex: 0 0 auto;
      width: auto;
      white-space: nowrap;
      min-height: 40px;
    }
    .settings-content {
      flex: 1 1 auto;
      max-height: none;
      -webkit-overflow-scrolling: touch;
    }
    .modal-actions {
      flex: 0 0 auto;
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }
    .modal-actions button {
      flex: 1 1 0;
      min-height: 46px;
    }
  }
  .inline-time {
    color: var(--text-muted);
  }
  .inline-time strong {
    color: var(--text);
  }
  small {
    color: var(--text-muted);
  }

  /* Alpha Disclaimer Styles */
  .alpha-disclaimer-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1100;
    backdrop-filter: blur(4px);
  }

  .alpha-modal {
    background: var(--bg-panel);
    border: 2px solid var(--status-bad);
    padding: 2.5rem;
    border-radius: 12px;
    max-width: 600px;
    width: 90%;
    box-shadow: 0 0 50px rgba(229, 62, 62, 0.3);
    text-align: left;
  }

  .alpha-modal h2 {
    color: var(--status-bad);
    margin-top: 0;
    text-align: center;
    letter-spacing: 2px;
    font-family: monospace;
  }

  .alpha-modal h3 {
    color: #f6ad55;
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .alpha-modal p {
    line-height: 1.6;
    margin-bottom: 1rem;
    color: #e2e8f0;
  }

  .alpha-buttons {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }

  .alpha-buttons button {
    flex: 1;
    padding: 12px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer !important;
    border: none;
    transition: all 0.2s;
    pointer-events: auto;
  }

  .cancel-alpha {
    background: #4a5568;
    color: white;
  }

  .cancel-alpha:hover {
    background: #2d3748 !important;
  }

  .proceed-alpha {
    background: var(--status-bad);
    color: white;
  }

  .proceed-alpha:hover {
    background: #c53030 !important;
    box-shadow: 0 0 15px rgba(229, 62, 62, 0.5);
  }
</style>

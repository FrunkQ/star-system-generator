<script lang="ts">
  import type { Starmap } from '../types';
  import { createEventDispatcher, onMount } from 'svelte';
  import { ensureTemporalState } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar } from '$lib/temporal/utre';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import { reasonsConfig, poiPacks, activeCategories } from '$lib/physics/reasonsToVisit';

  export let showModal: boolean;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  // Sectioned settings (Starmap / Time / Tech / Planets / System). Orrery View was dropped (Q2).
  type Section = 'starmap' | 'generation' | 'time' | 'technology' | 'planets' | 'system';
  // Sub-editors (Time & Calendars, Fuel & Drives…) reopen Settings at their section on close.
  export let initialSection: Section | null = null;
  let activeSection: Section = initialSection ?? 'starmap';

  // On narrow / touch the modal is a drill-in: a list of sections (drilled=false) →
  // a section's content (drilled=true). "Back" goes UP a level rather than closing.
  const SECTION_LABELS: Record<Section, string> = {
    starmap: 'Starmap', generation: 'Generation', time: 'Time', technology: 'Tech', planets: 'Planets', system: 'System'
  };
  let isNarrow = false;
  let drilled = !!initialSection;
  let wasOpen = false;
  $: headerTitle = isNarrow && drilled ? SECTION_LABELS[activeSection] : 'Settings';
  // Reset each time the modal (re)opens: to the requested section, else the section list.
  $: if (showModal && !wasOpen) {
    wasOpen = true;
    if (initialSection) { activeSection = initialSection; drilled = true; }
    else drilled = false;
  }
  $: if (!showModal && wasOpen) { wasOpen = false; }

  onMount(() => {
    const mql = window.matchMedia('(max-width: 700px), (pointer: coarse)');
    const sync = () => (isNarrow = mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  });

  function pickSection(s: Section) { activeSection = s; drilled = true; }
  function handleBack() {
    if (isNarrow && drilled) drilled = false;
    else handleClose();
  }
  let invertDisplay = starmap.invertDisplay ?? false;
  $: if (showModal) invertDisplay = starmap.invertDisplay ?? false;


  // Starmap settings. The unit choice doubles as the scaling mode (matches the New Starmap
  // modal): ly/pc are scaled maps, diagrammatic uses a free abstract unit (e.g. J8 for Jump-8).
  let starmapName = starmap.name;
  const initialDiagrammatic = (starmap.mapMode ?? 'diagrammatic') === 'diagrammatic';
  let unitChoice: 'ly' | 'pc' | 'diagrammatic' = initialDiagrammatic
    ? 'diagrammatic'
    : ((starmap.distanceUnit || '').toLowerCase() === 'pc' ? 'pc' : 'ly');
  let abstractUnit = initialDiagrammatic ? (starmap.distanceUnit || 'J') : 'J';
  let abstractOrder: 'prefix' | 'suffix' = starmap.unitIsPrefix ? 'prefix' : 'suffix';
  let generationEngine = starmap.generationEngine ?? 'standard';
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

    const diagrammatic = unitChoice === 'diagrammatic';
    const distanceUnit = diagrammatic ? (abstractUnit.trim() || 'J') : unitChoice;
    dispatch('save', {
      starmap: {
        name: starmapName,
        distanceUnit,
        unitIsPrefix: diagrammatic ? abstractOrder === 'prefix' : false,
        mapMode: diagrammatic ? 'diagrammatic' : 'scaled',
        generationEngine,
        invertDisplay,
        scale: {
          unit: distanceUnit,
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
  <div class="modal settings-modal" class:drilled on:click|stopPropagation role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
    <div class="settings-head">
      <button class="settings-back" on:click={handleBack} aria-label="Back" title="Back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <h2 id="dialog-title">{headerTitle}</h2>
    </div>

    <div class="settings-layout">
      <nav class="settings-nav">
        <button class:active={activeSection === 'starmap'} on:click={() => pickSection('starmap')}>Starmap</button>
        <button class:active={activeSection === 'generation'} on:click={() => pickSection('generation')}>Generation</button>
        <button class:active={activeSection === 'time'} on:click={() => pickSection('time')}>Time</button>
        <button class:active={activeSection === 'technology'} on:click={() => pickSection('technology')}>Tech</button>
        <button class:active={activeSection === 'planets'} on:click={() => pickSection('planets')}>Planets</button>
        <button class:active={activeSection === 'system'} on:click={() => pickSection('system')}>System</button>
      </nav>

      <div class="settings-content">
        {#if activeSection === 'starmap'}
          <div class="form-group">
            <label for="starmapName">Map Name</label>
            <input type="text" id="starmapName" bind:value={starmapName}>
          </div>
          <div class="form-group">
            <label for="unitChoice">Distance/Scaling units</label>
            <select id="unitChoice" bind:value={unitChoice}>
              <option value="ly">Light Years (ly)</option>
              <option value="pc">Parsecs (pc)</option>
              <option value="diagrammatic">Diagrammatic (not scaled)</option>
            </select>
          </div>
          {#if unitChoice === 'diagrammatic'}
            <div class="form-group">
              <label for="abstractUnit">Abstract unit</label>
              <input type="text" id="abstractUnit" maxlength="6" placeholder="e.g. J for Jump" bind:value={abstractUnit}>
            </div>
            <div class="form-group">
              <label for="abstractOrder">Unit order</label>
              <select id="abstractOrder" bind:value={abstractOrder}>
                <option value="prefix">Before the number ({abstractUnit.trim() || 'J'}8)</option>
                <option value="suffix">After the number (8 {abstractUnit.trim() || 'J'})</option>
              </select>
            </div>
          {/if}
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
            </select>
          </div>
          <div class="form-group">
            <label title="Traveller import/UWP features + 1-hex-=-1-parsec scaling. The numbered hex is NOT forced — to show it, set the snap grid above to Hex.">
              <input type="checkbox" bind:checked={$starmapUiStore.travellerMode} /> Traveller mode
            </label>
          </div>

        {:else if activeSection === 'generation'}
          <h3>Reasons to visit</h3>
          <p class="section-hint">RPG hooks tagged onto worlds — mineable resources, scientific draws, frontier logistics and mysteries — inferred from the physics plus a seeded roll.</p>
          <div class="form-group">
            <label><input type="checkbox" bind:checked={$reasonsConfig.enabled} /> Add "reasons to visit" tags</label>
          </div>
          {#if $reasonsConfig.enabled}
            <div class="form-group reason-cats">
              {#each activeCategories($poiPacks) as cat}
                <label title={cat.desc}>
                  <input type="checkbox" checked={$reasonsConfig.categories[cat.id] !== false}
                    on:change={(e) => reasonsConfig.update((c) => ({ ...c, categories: { ...c.categories, [cat.id]: e.currentTarget.checked } }))} />
                  {cat.label}
                </label>
              {/each}
            </div>
            <button class="section-btn" on:click={() => { dispatch('editpoi'); showModal = false; }}>Edit PoI rule packs…</button>
          {/if}

          <!-- De-emphasised: the experimental generation engine isn't important right now. -->
          <div class="form-group engine-row">
            <label for="generationEngine">Generation engine</label>
            <select id="generationEngine" bind:value={generationEngine}>
              <option value="standard">Standard (Stable)</option>
              <option value="evolutionary">Evolutionary (Alpha Physics)</option>
            </select>
          </div>

        {:else if activeSection === 'time'}
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
          <p class="section-hint">Ship &amp; construct rulepack overrides.</p>
          <button class="section-btn" on:click={() => { dispatch('editfuel'); showModal = false; }}>Fuel &amp; Drives…</button>
          <button class="section-btn" on:click={() => { dispatch('editsensors'); showModal = false; }}>Sensors…</button>

        {:else if activeSection === 'planets'}
          <p class="section-hint">Planet rulepack overrides.</p>
          <button class="section-btn" on:click={() => { dispatch('editatmospheres'); showModal = false; }}>Atmospheres…</button>

        {:else}
          <p class="section-hint">App-wide preferences.</p>
          <button class="section-btn" on:click={() => { dispatch('llm'); showModal = false; }}>LLM Settings…</button>
          <a class="section-btn" href="/palette" on:click={() => showModal = false}>Appearance…</a>
        {/if}
      </div>
    </div>

    <div class="modal-actions">
      <button class="action-btn" on:click={handleBack} title="Back">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Back
      </button>
      <button class="action-btn primary" on:click={handleSave} title="Save">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save
      </button>
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
    overflow-x: hidden;
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
  .reason-cats { display: flex; flex-direction: column; gap: 6px; padding-left: 18px; }
  .reason-cats label { display: flex; align-items: center; gap: 7px; font-size: 0.92em; }
  /* Generation engine is experimental and low-priority — pushed to the bottom and faded. */
  .engine-row { margin-top: 28px; opacity: 0.4; font-size: 0.85em; }
  .engine-row:hover, .engine-row:focus-within { opacity: 0.85; }
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
  .settings-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .settings-head h2 { margin: 0; }
  .settings-back {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-control);
    color: var(--text);
    cursor: pointer;
  }
  .settings-back:hover { background: var(--bg-control-hover); }
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
    box-sizing: border-box;
  }
  input,
  select {
    width: 100%;
    padding: 0.5em;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text) !important; /* Ensure text is light */
    border-radius: 4px;
    /* Without border-box, 100% width + padding overflows the panel → spurious horizontal scrollbar. */
    box-sizing: border-box;
  }

  .modal-actions {
    margin-top: 2em;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .action-btn.primary {
    background: var(--accent);
    color: var(--on-accent, #fff);
    border-color: var(--accent);
  }
  .action-btn.primary:hover { background: var(--accent-hover, #ff7a45); }
  /* Pin inline-SVG size — a direct flex child otherwise collapses to 0 width. */
  .action-btn svg,
  .settings-back svg { flex: 0 0 auto; }

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
    .settings-modal > .settings-head { flex: 0 0 auto; }
    .settings-layout {
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      gap: 10px;
    }
    /* Drill-in: the nav is a vertical list of sections; tapping one shows its content
       and Back returns here (not all the way out). */
    .settings-nav {
      flex: 1 1 auto;
      flex-direction: column;
      border-right: none;
      padding-right: 0;
      gap: 6px;
    }
    .settings-nav button {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
    }
    .settings-modal:not(.drilled) .settings-nav button::after {
      content: '›';
      margin-left: auto;
      color: var(--text-faint, #8a8f9a);
      font-size: 1.2rem;
    }
    /* List level → show only the nav; drilled → show only the content. */
    .settings-modal:not(.drilled) .settings-content { display: none; }
    .settings-modal.drilled .settings-nav { display: none; }
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

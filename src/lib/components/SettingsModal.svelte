<script lang="ts">
  import type { Starmap } from '../types';
  import { createEventDispatcher, onMount } from 'svelte';
  import { ensureTemporalState } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar } from '$lib/temporal/utre';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import { skin, SKINS } from '$lib/styles/skinStore';
  // A45: the one list, filtered to what the 2D snap grid can draw — never a hand-written copy.
  import { SNAP_GRID_OPTIONS } from '$lib/map/mapOverlay';
  import { unitKind, campaignUnit, unitChangeOutcomes, UNIT_SHORT, type UnitChangeMode } from '$lib/map/distanceUnits';
  import { tagCategories, tagRulesEnabled, setCategoryEnabled } from '$lib/tags/tagCategories';
  import { clearAllData } from '$lib/starmapStorage';
  import { memoryReading, formatMB, MEMORY_WARN_FRAC } from '$lib/memoryWatch';
  import { loadStoredIce, saveStoredIce, parseIceText, iceToText } from '$lib/iceConfig';
  import { foreground } from '$lib/ui/foreground';
  // G16: the picture behind the stars. Campaign content, so it saves with the rest of this dialog.
  import MapBackgroundControls from './MapBackgroundControls.svelte';
  import type { MapBackground } from '../types';
  import { normaliseMapBackground } from '$lib/map/mapBackground';
  import { BUILTIN_ASSETS } from '$lib/player/presets';

  // BYO STUN/TURN for remote players (docs/dev/vtt-integration-design.md 11).
  let iceText = '';
  let iceStatus = '';
  onMount(() => { iceText = iceToText(loadStoredIce()); iceStatus = summariseIce(); });
  function saveIce() {
    const servers = parseIceText(iceText);
    saveStoredIce(servers.length ? servers : null);
    iceText = iceToText(servers);
    iceStatus = summariseIce();
  }
  function summariseIce(): string {
    const s = loadStoredIce();
    if (!s || s.length === 0) return 'Using the built-in relay only. New player links will not carry a custom relay.';
    const n = s.length;
    const tls = s.some((e) => (Array.isArray(e.urls) ? e.urls : [e.urls]).some((u) => /^turns:/i.test(u)));
    return `${n} custom server${n === 1 ? '' : 's'} saved${tls ? ' (includes a TLS relay - good for locked-down networks)' : ' (no turns: entry - a UDP-blocking network may still fail)'}. Re-share player links so they carry it.`;
  }

  let clearing = false;
  async function clearEverything() {
    if (!confirm('Clear ALL data?\n\nThis permanently deletes your saved starmap, tag categories, settings, palette and everything else this app has stored in this browser — reproducing a brand-new install. This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? Everything will be wiped and the app will reload as a new user.')) return;
    clearing = true;
    try { await clearAllData(); } finally { window.location.reload(); }
  }

  export let showModal: boolean;
  export let starmap: Starmap;
  // WS8: the name of the campaign kept from before a base-map upgrade, or null when there is none. The page
  // owns the snapshot; this is only the offer to go back to it.
  export let preUpgradeName: string | null = null;

  const dispatch = createEventDispatcher();

  // Sectioned settings (Starmap / Time / Tech / Planets / System). Orrery View was dropped (Q2).
  type Section = 'starmap' | 'tagging' | 'time' | 'technology' | 'planets' | 'system';
  // Sub-editors (Time & Calendars, Fuel & Drives…) reopen Settings at their section on close.
  export let initialSection: Section | null = null;
  let activeSection: Section = initialSection ?? 'starmap';

  // On narrow / touch the modal is a drill-in: a list of sections (drilled=false) →
  // a section's content (drilled=true). "Back" goes UP a level rather than closing.
  const SECTION_LABELS: Record<Section, string> = {
    starmap: 'Starmap', tagging: 'Tagging', time: 'Time', technology: 'Tech', planets: 'Planets', system: 'System'
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
    invertDisplay = starmap.invertDisplay ?? false;   // sync ONCE per open (see note below)
    mapBackground = normaliseMapBackground(starmap.mapBackground); // ...and for the same reason (G16)
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
  // Local, applied on Save. It's synced from the starmap ONCE when the modal opens (in the wasOpen
  // block above) — NOT on every reactive run. The old `$: if (showModal) …` re-ran whenever any
  // dependency changed (e.g. toggling the background image), resetting the user's unsaved invert choice
  // and making the two checkboxes appear to fight / self-uncheck.
  let invertDisplay = starmap.invertDisplay ?? false;
  // G16: the map background, on the same local-until-Save footing as invertDisplay above — it is
  // campaign content and rides the same 'save' payload as the name, the unit and the scale.
  let mapBackground: MapBackground = normaliseMapBackground(starmap.mapBackground);
  $: backgroundAssets = [...BUILTIN_ASSETS, ...(starmap.playerAssets ?? [])];


  // Starmap settings. The unit choice doubles as the scaling mode (matches the New Starmap
  // modal): ly/pc are scaled maps, diagrammatic uses a free abstract unit (e.g. J8 for Jump-8).
  let starmapName = starmap.name;
  const initialDiagrammatic = (starmap.mapMode ?? 'diagrammatic') === 'diagrammatic';
  let unitChoice: 'ly' | 'pc' | 'diagrammatic' = initialDiagrammatic
    ? 'diagrammatic'
    : ((starmap.distanceUnit || '').toLowerCase() === 'pc' ? 'pc' : 'ly');
  let abstractUnit = initialDiagrammatic ? (starmap.distanceUnit || 'J') : 'J';
  let abstractOrder: 'prefix' | 'suffix' = starmap.unitIsPrefix ? 'prefix' : 'suffix';
  // Traveller mode INFERS the unit: maps are parsec-scaled (1 hex = 1 pc), so the picker is
  // disabled and the choice coerced — including when the mode is ticked with the modal open.
  $: if ($starmapUiStore.travellerMode && unitChoice !== 'pc') unitChoice = 'pc';

  // ── Keep-my-data (browser storage persistence) ───────────────────────────────
  // Campaigns live in IndexedDB, which browsers may EVICT under storage pressure. We can only ASK for
  // persistence; the browser decides (Chrome grants on heuristics and may refuse silently, Firefox
  // prompts, Safari evicts long-unused sites regardless). So this reports exactly what was granted and
  // never claims the data is safe — file export stays the real guarantee.
  let storeState: import('$lib/storagePersistence').PersistenceState | null = null;
  let storeUsage = '—';
  let storeQuota = '—';
  let storeAsking = false;
  async function refreshStorage() {
    const { storageReport, formatBytes } = await import('$lib/storagePersistence');
    const r = await storageReport();
    storeState = r.state;
    storeUsage = formatBytes(r.usageBytes);
    storeQuota = formatBytes(r.quotaBytes);
  }
  async function askPersistence() {
    storeAsking = true;
    try {
      const { requestPersistence } = await import('$lib/storagePersistence');
      storeState = await requestPersistence();   // the ACTUAL outcome, re-read from the browser
      await refreshStorage();
    } finally {
      storeAsking = false;
    }
  }
  // Only look when the System section is actually open — no need to poke storage APIs otherwise.
  $: if (showModal && activeSection === 'system' && storeState === null) refreshStorage();

  let showScaleBar = starmap.scale?.showScaleBar ?? true;
  // WS7: depth counts toward distance by default; a GM can opt into visual-only height.
  let ignoreZForDistances = starmap.ignoreZForDistances ?? false;
  let measurementUnits: 'metric' | 'imperial' = starmap.measurementUnits ?? 'metric';
  let temperatureUnit: 'C' | 'F' | 'K' = starmap.temperatureUnit ?? 'C';
  // System edge — the "left the local system" boundary. Unset = each star's Hill limit; a number = a fixed AU.
  let systemEdgeMode: 'hill' | 'custom' = (starmap.systemEdgeAu ?? 0) > 0 ? 'custom' : 'hill';
  let systemEdgeAu: number = starmap.systemEdgeAu && starmap.systemEdgeAu > 0 ? starmap.systemEdgeAu : 10000;
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

  // ── A43: changing the interstellar unit means one of two things, and the app must not guess ──────
  // The GM either had the numbers right and the label wrong (relabel), or has the map right and wants
  // it read the other way (convert). Both are legitimate; picking one silently is how Alpha Centauri
  // came to read 14.33 ly against a true 4.37. So when — and ONLY when — the change is a real ly<->pc
  // switch on a scaled map, ask, worded as the two OUTCOMES on a system actually on this map.
  let pendingUnit: 'ly' | 'pc' | null = null;
  $: currentKind = unitKind(campaignUnit(starmap));
  // The example the prompt quotes: the system furthest from the first one, which is the distance a GM
  // is most likely to recognise as right or wrong. Falls back to a bare 1-unit example on a map too
  // small to have a pair.
  $: unitExample = (() => {
    const sys = starmap.systems ?? [];
    const ppu = starmap.scale?.pixelsPerUnit && starmap.scale.pixelsPerUnit > 0 ? starmap.scale.pixelsPerUnit : 25;
    if (sys.length < 2) return { name: null as string | null, reading: 1 };
    const a = sys[0];
    let best = sys[1], bestD = -1;
    for (const s of sys.slice(1)) {
      const dx = (s.position?.x ?? 0) - (a.position?.x ?? 0);
      const dy = (s.position?.y ?? 0) - (a.position?.y ?? 0);
      const dz = (s.position?.z ?? 0) - (a.position?.z ?? 0);
      const d = Math.hypot(dx, dy, dz);
      if (d > bestD) { bestD = d; best = s; }
    }
    return { name: best?.name ?? null, from: a?.name ?? null, reading: bestD / ppu };
  })();
  $: outcomes = pendingUnit ? unitChangeOutcomes(unitExample.reading, campaignUnit(starmap), pendingUnit) : null;
  const fmtUnitVal = (v: number) => v >= 100 ? Math.round(v).toLocaleString('en-GB') : v.toFixed(2);

  function handleSave() {
    // A real ly<->pc switch on a scaled map is the only case that needs the question. Going to or from
    // a diagrammatic unit has no conversion factor at all, and re-picking the same unit is not a change.
    const nextKind = unitChoice === 'diagrammatic' ? null : unitChoice;
    if (nextKind && currentKind && nextKind !== currentKind && (starmap.mapMode ?? 'diagrammatic') === 'scaled' && !pendingUnit) {
      pendingUnit = nextKind;
      return; // the confirm step calls commitSave with the GM's answer
    }
    commitSave('convert'); // unreachable for a unit change; the mode is ignored when the unit is unchanged
  }

  function commitSave(unitMode: UnitChangeMode) {
    pendingUnit = null;
    doSave(unitMode);
  }

  function doSave(unitMode: UnitChangeMode) {
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
      // A43: the GM's answer travels with the payload. The receiver owns the arithmetic (one module,
      // `applyUnitChange`); this modal owns only the question.
      unitMode,
      starmap: {
        name: starmapName,
        distanceUnit,
        unitIsPrefix: diagrammatic ? abstractOrder === 'prefix' : false,
        mapMode: diagrammatic ? 'diagrammatic' : 'scaled',
        invertDisplay,
        mapBackground,
        ignoreZForDistances,
        measurementUnits,
        temperatureUnit,
        systemEdgeAu: systemEdgeMode === 'custom' && systemEdgeAu > 0 ? systemEdgeAu : undefined,
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

  // G16: hand over to align mode. The DRAFT goes with the request rather than the saved value, so a
  // GM who has just picked an image and switched to map-fixed aligns THAT, not what was there before.
  // Same shape as the edittags / edittemporal hand-offs above: this dialog closes, the caller reopens
  // it at the Map section when the other surface is finished with.
  function startAlign(draft: MapBackground) {
    dispatch('alignbackground', { mapBackground: draft });
    showModal = false;
  }

  function handleClose() {
    showModal = false;
    dispatch('close');   // genuine dismissal (Back / backdrop) — lets the app re-tag for config changes
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
<div class="modal-backdrop" on:click={handleClose} role="button" tabindex="0" on:keydown={(e) => {if (e.key === 'Enter' || e.key === 'Space') handleClose()}} use:foreground>
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
        <button class:active={activeSection === 'tagging'} on:click={() => pickSection('tagging')}>Tagging</button>
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
            <label for="unitChoice" title={$starmapUiStore.travellerMode ? 'Traveller mode maps are parsec-scaled (1 hex = 1 pc), so the unit is inferred.' : undefined}>Distance/Scaling units</label>
            <select id="unitChoice" bind:value={unitChoice} disabled={$starmapUiStore.travellerMode}>
              <option value="ly">Light Years (ly)</option>
              <option value="pc">Parsecs (pc)</option>
              <option value="diagrammatic">Diagrammatic (not scaled)</option>
            </select>
            {#if $starmapUiStore.travellerMode}
              <p class="section-hint">Traveller mode: parsecs (1 hex = 1 pc).</p>
            {/if}
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
          <div class="form-group">
            <label for="measurementUnits" title="How in-system distances and speeds are shown (radii, orbits, sensor ranges, Δv). Values are stored in SI either way — this is display only. The interstellar map unit above is separate.">Measurement units (in-system)</label>
            <select id="measurementUnits" bind:value={measurementUnits}>
              <option value="metric">Metric (km, km/s)</option>
              <option value="imperial">Imperial (miles, mph)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="temperatureUnit" title="Temperature display — independent of the distance units above. Values are stored in Kelvin either way.">Temperature</label>
            <select id="temperatureUnit" bind:value={temperatureUnit}>
              <option value="C">Celsius (°C)</option>
              <option value="F">Fahrenheit (°F)</option>
              <option value="K">Kelvin (K)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="systemEdge" title="Where a coasting ship counts as having LEFT the local system (handed over to the starmap as an interstellar adrift ship). The Hill limit is the star's true gravitational reach (~2 ly) — set a tighter custom distance for quicker, gameplay-friendly departures.">System edge</label>
            <select id="systemEdge" bind:value={systemEdgeMode}>
              <option value="hill">Star's Hill limit (~2 ly)</option>
              <option value="custom">Custom distance…</option>
            </select>
          </div>
          {#if systemEdgeMode === 'custom'}
            <div class="form-group">
              <label for="systemEdgeAu">Edge distance (AU)</label>
              <input id="systemEdgeAu" type="number" min="1" step="any" bind:value={systemEdgeAu} />
            </div>
          {/if}

          <h3>Appearance</h3>
          <!-- G34 phase 4: a skin is CHROME, per viewer, persisted on this device only — units are
               campaign data (players inherit them), a skin is each viewer's own glasses. Applies
               instantly; no Save needed. Colour-as-information (body types, zones, hazards) never
               moves with a skin. Individual tokens can still be tuned at /palette. -->
          <div class="form-group">
            <label for="skinChoice" title="How THIS device draws the interface. Every viewer picks their own — it is not saved with the campaign. Applies immediately. Fine-tune single colours at /palette.">Interface skin (this device)</label>
            <select id="skinChoice" bind:value={$skin}>
              {#each SKINS as s}
                <option value={s.id}>{s.name} — {s.blurb}</option>
              {/each}
            </select>
          </div>

          <h3>Map display</h3>
          <!-- G16 "Background &amp; Overlay": ONE group, serving the GM 2D map, the player 2D map, the
               3D map's plane and the starmap document. It replaced a bare "Show background image"
               checkbox, which is now the first choice in its picker. -->
          <MapBackgroundControls {starmap} background={mapBackground} assets={backgroundAssets}
            disabledReason={invertDisplay ? 'The print (inverted) display hides the background image.' : ''}
            on:change={(e) => (mapBackground = e.detail)}
            on:align={(e) => startAlign(e.detail)} />
          <div class="form-group">
            <label title="Print-friendly white background + dark labels (disables the background image)."><input type="checkbox" bind:checked={invertDisplay} /> Invert Starmap display (print)</label>
          </div>
          <div class="form-group">
            <label title="Systems can sit above or below the map plane. By default that depth counts toward real distances (and so travel times). Turn this on to treat depth as purely visual and keep distances flat, as they were before.">
              <input type="checkbox" bind:checked={ignoreZForDistances} /> Ignore depth when measuring distances
            </label>
            <p class="section-hint">Off (recommended): a system's depth counts toward distance, so journeys are
              measured honestly in three dimensions. On: depth is decorative only and distances stay flat.</p>
          </div>
          <div class="form-group">
            <label for="gridType">Snap grid</label>
            <select id="gridType" bind:value={$starmapUiStore.gridType}>
              {#each SNAP_GRID_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
            </select>
          </div>
          <div class="form-group">
            <label title="Traveller import/UWP features + 1-hex-=-1-parsec scaling. The numbered hex is NOT forced — to show it, set the snap grid above to Hex.">
              <input type="checkbox" bind:checked={$starmapUiStore.travellerMode} /> Traveller mode
            </label>
          </div>
          <!-- G26: the GM's OWN star-glyph dials for this map (local, like the snap grid). The player
               views carry theirs in each preset, under Player Views. Size is LOG across the slider —
               half to double, the centre exactly 1x — so one notch left shrinks by as much as one notch
               right grows (owner, 2026-08-19). -->
          <div class="form-group">
            <label for="starSize" title="How big every star glyph draws — half to double the size the map shipped with. Your screen only; player views have their own under Player Views.">
              Star size <span class="section-hint" style="display:inline">&times;{($starmapUiStore.starSize ?? 1).toFixed(2)}</span>
            </label>
            <input id="starSize" type="range" min="-1" max="1" step="0.05" value={Math.log2($starmapUiStore.starSize ?? 1)} on:input={(e) => ($starmapUiStore.starSize = Math.pow(2, +e.currentTarget.value))} />
          </div>
          <div class="form-group">
            <label for="starScale" title="Spread the star glyphs by luminosity class: remnants and sub-dwarfs smallest, then dwarfs, giants, supergiants. 0% = all the same size; black holes keep their own glyph. Your screen only — player views have their own under Player Views.">
              Star size by class <span class="section-hint" style="display:inline">{$starmapUiStore.starScale <= 0 ? 'All equal' : `${Math.round($starmapUiStore.starScale * 100)}%`}</span>
            </label>
            <input id="starScale" type="range" min="0" max="2" step="0.05" bind:value={$starmapUiStore.starScale} />
          </div>

        {:else if activeSection === 'tagging'}
          <h3>Tagging</h3>
          <p class="section-hint">
            Tags are how a world or a ship says what it is like beyond its physics. They come from three places:
            the <strong>physics</strong>, which derives its own and can't be edited here (open the Newton panel — the
            apple — on any body, or the <a href="/physics" target="_blank" rel="noreferrer">physics page</a>, to see
            exactly which rule produced one); <strong>automated rules</strong> you can edit below; and
            <strong>you</strong>, on any body or construct's Tags tab.
          </p>
          <div class="form-group">
            <label title="Turns off every automated tagging rule at once. Physics tags and your own hand-added tags are unaffected.">
              <input type="checkbox" bind:checked={$tagRulesEnabled} /> Run automated tagging rules
            </label>
          </div>

          <p class="section-hint">
            Categories — tick to make one available. <strong>System</strong> categories can't be deleted because the
            engine matches their tags by name (refuelling, mining, drives, readiness), but you can switch them off
            and edit their tags freely.
          </p>
          <div class="form-group reason-cats">
            {#each $tagCategories as cat (cat.id)}
              <label class="cat-line" title={cat.description || ''}>
                <input type="checkbox" checked={cat.enabled} on:change={(e) => setCategoryEnabled(cat.id, e.currentTarget.checked)} />
                <span class="cat-swatch" style="background:{cat.color || '#888'}"></span>
                <span class="cat-name">
                  {cat.longName}
                  {#if cat.system}<span class="cat-req" title="Needed by the engine — can be switched off, but not deleted">system</span>{/if}
                  {#if cat.playerHidden}<span class="cat-hidden" title="Hidden from players">hidden</span>{/if}
                </span>
                <span class="cat-count">
                  {cat.tags.length} {cat.tags.length === 1 ? 'tag' : 'tags'}{#if cat.rules.length}, {cat.rules.length} {cat.rules.length === 1 ? 'rule' : 'rules'}{/if}
                </span>
              </label>
            {/each}
          </div>
          <button class="section-btn" on:click={() => { dispatch('edittags'); showModal = false; }}>Edit tag categories…</button>

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
          <button class="section-btn" on:click={() => { dispatch('editliquids'); showModal = false; }}>Liquids…</button>
          <button class="section-btn" on:click={() => { dispatch('editbiospheres'); showModal = false; }}>Biospheres…</button>
          <p class="section-hint">What each life morphology looks like, how much ground it covers by default, and
            the order it paints in — plus the pigments a world's light can favour.</p>

        {:else}
          <p class="section-hint">App-wide preferences.</p>
          <button class="section-btn" on:click={() => { dispatch('llm'); showModal = false; }}>LLM Settings…</button>
          <a class="section-btn" href="/palette" on:click={() => showModal = false}>Appearance…</a>
          <a class="section-btn" href="/discgallery" target="_blank" rel="noopener" on:click={() => showModal = false}>Rendered world gallery…</a>
          <p class="section-hint">A reference for how worlds are drawn from their physics and tags — polar ice, gas-giant banding, rotational shape and more.</p>

          <h4 class="advanced-head">Remote players — network relay</h4>
          <div class="form-group">
            <p class="section-hint">Player views on other devices connect peer-to-peer. That works on home and
              mobile networks by itself (a public relay is built in). A workplace network that blocks UDP can
              stop it — then a relay that speaks TLS on port 443 is needed. Paste your own STUN/TURN servers
              here, one per line as <code>turns:host:443|username|credential</code>; they are added ahead of
              the built-in ones and ride in every player link and QR you share from now on.</p>
            <textarea class="ice-input" rows="3" bind:value={iceText} on:change={saveIce}
              placeholder="turns:relay.example.com:443|user|secret"></textarea>
            <p class="section-hint">{iceStatus}</p>
          </div>

          <h4 class="advanced-head">Your data</h4>
          <div class="form-group">
            <p class="section-hint">Your campaigns are stored in this browser. Browsers may clear that storage
              when space runs low. You can ask this browser to keep it — but the browser decides, so this
              lowers the risk rather than removing it. Saving to a file is still the only real backup.</p>
            <p class="store-line">
              Status:
              {#if storeState === 'granted'}<strong class="ok">Browser has agreed to keep your data</strong>
              {:else if storeState === 'not-granted'}<strong class="warn">Not guaranteed — may be cleared if space runs low</strong>
              {:else if storeState === 'unsupported'}<strong class="warn">This browser doesn't support the setting</strong>
              {:else}checking…{/if}
            </p>
            <p class="store-line">Used: <strong>{storeUsage}</strong> of <strong>{storeQuota}</strong> available</p>
            {#if storeState !== 'granted' && storeState !== 'unsupported'}
              <button class="section-btn" on:click={askPersistence} disabled={storeAsking}>
                {storeAsking ? 'Asking the browser…' : 'Ask the browser to keep my data'}
              </button>
              <p class="section-hint">Some browsers grant this silently based on how often you use the app, and
                may refuse the first time. If it stays off, keep saving your campaign to a file.</p>
            {/if}
          </div>

          <h4 class="advanced-head">Memory</h4>
          <div class="form-group">
            {#if $memoryReading.supported}
              <p class="store-line">
                Using <strong>{formatMB($memoryReading.usedMB)}</strong> of
                <strong>{formatMB($memoryReading.limitMB)}</strong> the browser will allow
                (<strong class={$memoryReading.frac >= MEMORY_WARN_FRAC ? 'warn' : 'ok'}>{Math.round($memoryReading.frac * 100)}%</strong>)
              </p>
              <div class="mem-bar" role="img" aria-label="Memory usage {Math.round($memoryReading.frac * 100)} percent">
                <div class="mem-fill" class:warn={$memoryReading.frac >= MEMORY_WARN_FRAC} style="width:{Math.min(100, Math.round($memoryReading.frac * 100))}%"></div>
              </div>
              <p class="section-hint">Live memory used by this tab. If it climbs towards the limit the app will warn
                you; saving your campaign to a file and reloading the tab is the reliable way to bring it down.</p>
            {:else}
              <p class="store-line">This browser doesn't report memory usage.</p>
              <p class="section-hint">Chrome and Edge show a live figure here; other browsers offer no way to read it.</p>
            {/if}
          </div>

          <h4 class="advanced-head">Reporting a problem</h4>
          <div class="form-group">
            <p class="section-hint">Saves a file describing what the app is doing right now — how much memory it is
              using, what your device is, how long things took, and a copy of your starmap so the problem can be
              reproduced. It saves to this device; nothing is sent anywhere, and the file explains what is inside it.</p>
            <button class="section-btn" on:click={() => dispatch('diagnostics')}>Save a diagnostic file (.zip)…</button>
            <p class="section-hint">Post it to FrunkQ on the Discord with a note about what went wrong. It doubles as a
              backup of your campaign, so it is worth keeping either way.</p>
          </div>

          <!-- WS8: only shown while a pre-upgrade snapshot exists. This is the "go straight back" the upgrade
               screen promises, and it lives here because Your data is where copies of a campaign belong. -->
          {#if preUpgradeName}
            <div class="form-group">
              <p class="section-hint">You upgraded a campaign onto the updated bundled map. The version from
                before that upgrade is still here, and you can go back to it. Doing so replaces what is
                currently loaded, so save it to a file first if you want to keep it.</p>
              <button class="section-btn" on:click={() => dispatch('restorepreupgrade')}>
                Go back to "{preUpgradeName}" (before the upgrade)
              </button>
            </div>
          {/if}

          <h4 class="advanced-head danger-head">Danger zone</h4>
          <div class="form-group">
            <p class="section-hint">Wipe everything this app has stored in this browser — saved starmap, tag categories, settings, palette, session — and reload as a brand-new user. Useful for testing the first-run experience. Cannot be undone.</p>
            <button class="section-btn danger-btn" on:click={clearEverything} disabled={clearing}>{clearing ? 'Clearing…' : 'Clear all data…'}</button>
          </div>
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

  {#if pendingUnit && outcomes}
    <!-- A43. Deliberately worded as OUTCOMES on a real system, never as "convert": the GM knows which
         number is right and does not have to work out which mechanism produces it. -->
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="unit-confirm-backdrop" on:click|stopPropagation>
      <div class="unit-confirm" role="dialog" aria-modal="true" aria-labelledby="unit-confirm-title">
        <h3 id="unit-confirm-title">Changing to {UNIT_SHORT[pendingUnit]}</h3>
        {#if unitExample.name}
          <p class="lede">
            {unitExample.name} is currently <strong>{fmtUnitVal(unitExample.reading)} {UNIT_SHORT[currentKind ?? 'ly']}</strong>
            from {unitExample.from}. Which should it be?
          </p>
        {:else}
          <p class="lede">This map has no pair of systems to measure. Which did you mean?</p>
        {/if}
        <button class="unit-opt" on:click={() => commitSave('relabel')}>
          <span class="val">{fmtUnitVal(outcomes.relabel)} {UNIT_SHORT[pendingUnit]}</span>
          <span class="why">The distances were already right &mdash; only the unit was wrong.</span>
        </button>
        <button class="unit-opt" on:click={() => commitSave('convert')}>
          <span class="val">{fmtUnitVal(outcomes.convert)} {UNIT_SHORT[pendingUnit]}</span>
          <span class="why">The map is right &mdash; show the same distances in {UNIT_SHORT[pendingUnit]}.</span>
        </button>
        <button class="unit-cancel" on:click={() => (pendingUnit = null)}>Cancel</button>
      </div>
    </div>
  {/if}

</div>
{/if}

<style>
  /* A43 unit-change confirmation. Compact modal over the settings dialog, per the house popup style. */
  .unit-confirm-backdrop {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 5100; padding: 1rem;
  }
  .unit-confirm {
    background: var(--panel-bg, #161b22); border: 1px solid var(--border, #30363d);
    border-radius: 8px; padding: 1.1rem; max-width: 27rem; width: 100%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .unit-confirm h3 { margin: 0 0 0.5rem; font-size: 1rem; }
  .unit-confirm .lede { margin: 0 0 0.9rem; font-size: 0.85rem; line-height: 1.45; opacity: 0.85; }
  .unit-opt {
    display: block; width: 100%; text-align: left; cursor: pointer;
    background: var(--input-bg, #0d1117); border: 1px solid var(--border, #30363d);
    border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; color: inherit;
  }
  .unit-opt:hover { border-color: var(--accent, #58a6ff); }
  .unit-opt .val { display: block; font-size: 1.05rem; font-weight: 600; }
  .unit-opt .why { display: block; font-size: 0.78rem; opacity: 0.75; margin-top: 0.15rem; }
  .unit-cancel {
    display: block; width: 100%; margin-top: 0.25rem; padding: 0.45rem;
    background: none; border: none; color: inherit; opacity: 0.7; cursor: pointer; font-size: 0.85rem;
  }
  .unit-cancel:hover { opacity: 1; }

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
  .reason-cats { display: flex; flex-direction: column; gap: 4px; padding-left: 4px; }
  .reason-cats .cat-line { display: flex; align-items: center; gap: 8px; font-size: 0.92em; }
  .cat-swatch { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; }
  .cat-name { flex: 1; }
  .cat-count { color: var(--text-faint, #8a8f9a); font-size: 0.85em; }
  .cat-req { font-size: 0.62em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent, #5b8def); border: 1px solid currentColor; border-radius: 4px; padding: 0 3px; vertical-align: middle; }
  .store-line { font-size: 0.82rem; margin: 2px 0; color: var(--text-muted); }
  .store-line .ok { color: #6ad48b; }
  .store-line .warn { color: #ffb061; }
  .mem-bar {
    height: 8px;
    margin: 6px 0 4px;
    background: var(--bg-control, #1c1f27);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 5px;
    overflow: hidden;
  }
  .mem-fill { height: 100%; background: #6ad48b; transition: width 0.4s ease; }
  .mem-fill.warn { background: #ffb061; }
  .advanced-head { margin: 22px 0 8px; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint, #8a8f9a); border-top: 1px solid var(--border); padding-top: 14px; }
  .danger-head { color: var(--status-bad, #d04545); border-top-color: color-mix(in srgb, var(--status-bad, #d04545) 40%, var(--border)); }
  .danger-btn { border: 1px solid var(--status-bad, #d04545) !important; color: var(--status-bad, #d04545) !important; }
  .danger-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--status-bad, #d04545) 16%, transparent) !important; }
  .danger-btn:disabled { opacity: 0.6; cursor: default; }
  .ice-input { width: 100%; box-sizing: border-box; font: 12px/1.4 ui-monospace, monospace; background: rgba(255,255,255,0.05); color: inherit; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 8px; resize: vertical; }
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

</style>

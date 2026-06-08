<script lang="ts">
  // Companion App — the player-facing, GM-curated, live-synced field guide.
  // Mirrors /projector?sid= but is a player-driven *browse* of the same redacted snapshot the
  // GM already broadcasts (computePlayerSnapshot over SYNC_SYSTEM). Two flavours over one dataset:
  //   - lo-fi terminal (green / amber): the printed-report document under a phosphor CRT skin.
  //   - hi-tech console: the live projector orbital map, tap a body for player-safe data.
  // v1 is local-only: same-machine BroadcastChannel, zero network (spec COMPANION-APP-SPEC.md §3).
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { broadcastService } from '$lib/broadcast';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import ReportDocument from '$lib/reports/ReportDocument.svelte';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';
  import { AU_KM, G } from '$lib/constants';
  import type { System, RulePack, CelestialBody } from '$lib/types';

  type ThemeKey = 'green' | 'amber' | 'clean' | 'console';
  interface ThemeDef {
    label: string;
    blurb: string;
    tier: 'static' | 'interactive';
    reportTheme: string;            // which ReportDocument theme to render underneath
    tint: 'green' | 'amber' | 'none';
  }
  const THEMES: Record<ThemeKey, ThemeDef> = {
    green:   { label: 'Green Screen',     blurb: 'Salvaged CRT terminal',  tier: 'static',      reportTheme: 'retro',    tint: 'green' },
    amber:   { label: 'Amber Terminal',   blurb: 'Phosphor field unit',    tier: 'static',      reportTheme: 'retro',    tint: 'amber' },
    clean:   { label: 'Survey Datapad',   blurb: 'Clean instrument feed',  tier: 'static',      reportTheme: 'standard', tint: 'none'  },
    console: { label: 'Starship Console', blurb: 'Live orbital plot',      tier: 'interactive', reportTheme: 'standard', tint: 'none'  },
  };
  const THEME_ORDER: ThemeKey[] = ['green', 'amber', 'clean', 'console'];

  const EARTH_GRAVITY = 9.80665;
  const EARTH_MASS_KG = 5.972e24;

  let system: System | null = null;
  let rulePack: RulePack | null = null;
  let sessionId: string | null = null;
  let themeKey: ThemeKey = 'green';
  let lastUpdate: number | null = null;
  let connected = false;
  let showThemePicker = false;

  // Live clock (mirrors the projector animation loop so the interactive tier ticks).
  let currentTime = Date.now();
  let isPlaying = false;
  let timeScale = 0;
  let rafId = 0;

  // Interactive-tier selection.
  let focusedBodyId: string | null = null;
  let selectedBody: CelestialBody | null = null;

  $: theme = THEMES[themeKey];
  $: nowLabel = lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

  function setTheme(k: ThemeKey) {
    themeKey = k;
    showThemePicker = false;
    selectedBody = null;
    if (browser) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('theme', k);
        history.replaceState({}, '', u);
        localStorage.setItem('catalogue-theme', k);
      } catch { /* private mode / no history */ }
    }
  }

  function startClock() {
    if (!browser) return;
    let last = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - last) / 1000;
      if (isPlaying) currentTime += dt * timeScale * 1000;
      last = ts;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function handleFocus(e: CustomEvent<string | null>) {
    focusedBodyId = e.detail;
    const node = system?.nodes.find((n) => n.id === e.detail);
    selectedBody = node && node.kind === 'body' ? (node as CelestialBody) : null;
  }

  // --- player-safe derived display helpers (snapshot is already redacted) ---
  function fmt(n: number | undefined | null, d = 0) {
    if (n === undefined || n === null || !Number.isFinite(n)) return '-';
    if (Math.abs(n) > 1e15) return n.toExponential(2);
    return n.toLocaleString(undefined, { maximumFractionDigits: d });
  }
  function gravityG(b: CelestialBody) {
    if (!b.massKg || !b.radiusKm) return '-';
    const rm = b.radiusKm * 1000;
    return (G * b.massKg / (rm * rm) / EARTH_GRAVITY).toFixed(2) + ' g';
  }
  function massRel(b: CelestialBody) {
    if (!b.massKg) return '-';
    const m = b.massKg / EARTH_MASS_KG;
    return (m < 1000 ? m.toFixed(2) : m.toExponential(2)) + ' M⊕';
  }
  function tempC(b: CelestialBody) {
    return b.temperatureK === undefined ? '-' : Math.round(b.temperatureK - 273.15) + ' °C';
  }
  function orbitDist(b: CelestialBody) {
    const a = b.orbit?.elements?.a_AU;
    if (typeof a !== 'number' || a <= 0) return '-';
    return a < 0.05 ? fmt(a * AU_KM) + ' km' : a.toFixed(3) + ' AU';
  }
  function atmo(b: CelestialBody) {
    if (!b.atmosphere) return 'None';
    const p = b.atmosphere.pressure_bar ?? b.atmosphere.pressure_atm ?? 0;
    return `${b.atmosphere.name || 'Unknown'} (${p < 0.001 ? '<0.001' : p.toFixed(2)} bar)`;
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('sid');
    const urlTheme = params.get('theme') as ThemeKey | null;
    let stored: string | null = null;
    try { stored = localStorage.getItem('catalogue-theme'); } catch { /* ignore */ }
    if (urlTheme && THEMES[urlTheme]) themeKey = urlTheme;
    else if (stored && THEMES[stored as ThemeKey]) themeKey = stored as ThemeKey;

    try {
      rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json');
    } catch (e) {
      console.error('Catalogue: failed to load rulepack', e);
    }

    broadcastService.initReceiver(
      (sys) => { system = sys; lastUpdate = Date.now(); connected = true; },
      (pack) => { rulePack = pack; },
      (id) => { focusedBodyId = id; },
      () => { /* camera: catalogue is player-driven, ignore the GM camera */ },
      () => { /* view settings: not used in catalogue */ },
      (time) => {
        isPlaying = time.isPlaying;
        timeScale = time.timeScale;
        if (Math.abs(currentTime - time.currentTime) > 1000) currentTime = time.currentTime;
      },
      () => { /* GM crt toggle: catalogue uses its own theme */ },
      () => { /* greenscreen: n/a */ },
      sessionId
    );
    startClock();
  });

  onDestroy(() => {
    broadcastService.close();
    if (browser) cancelAnimationFrame(rafId);
  });
</script>

<svelte:head>
  <title>{system ? system.name : 'Field Guide'} — Catalogue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
</svelte:head>

<main class="catalogue tint-{theme.tint}" class:interactive={theme.tier === 'interactive'}>
  <!-- Device status bar -->
  <header class="statusbar">
    <span class="sys-name">{system ? system.name.toUpperCase() : 'NO SIGNAL'}</span>
    <span class="status" class:live={connected} class:offline={!connected}>
      {#if connected}● LIVE{:else}○ GM OFFLINE — last {nowLabel}{/if}
    </span>
    <button class="theme-btn" on:click={() => (showThemePicker = !showThemePicker)} aria-label="Change skin">
      {theme.label}
    </button>
  </header>

  {#if showThemePicker}
    <div class="theme-picker" role="menu">
      {#each THEME_ORDER as k}
        <button class="theme-option" class:active={k === themeKey} on:click={() => setTheme(k)} role="menuitem">
          <span class="opt-label">{THEMES[k].label}</span>
          <span class="opt-blurb">{THEMES[k].blurb}</span>
          <span class="opt-tier">{THEMES[k].tier === 'interactive' ? 'live map' : 'document'}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if !system}
    <!-- Waiting / offline -->
    <div class="waiting">
      <div class="waiting-inner">
        <h1>Awaiting carrier…</h1>
        <p>Open a system in the host session to receive the field guide.</p>
        {#if sessionId}<p class="sid">session {sessionId}</p>{/if}
        <button on:click={() => broadcastService.sendMessage({ type: 'REQUEST_SYNC', payload: sessionId })}>
          Re-acquire signal
        </button>
      </div>
    </div>
  {:else if theme.tier === 'interactive'}
    <!-- Hi-tech: live orbital map + tap-to-inspect -->
    <div class="console-stage">
      {#if rulePack}
        <SystemVisualizer
          {system}
          {rulePack}
          {currentTime}
          {focusedBodyId}
          showNames={true}
          toytownFactor={system.toytownFactor || 0}
          fullScreen={true}
          backgroundColor="#05070c"
          on:focus={handleFocus}
        />
      {/if}
      {#if selectedBody}
        <aside class="inspector">
          <div class="insp-head">
            <h2>{selectedBody.name}</h2>
            <button class="insp-close" on:click={() => (selectedBody = null)} aria-label="Close">×</button>
          </div>
          <div class="insp-sub">{(selectedBody.roleHint || 'body').toUpperCase()}{selectedBody.class ? ' · ' + selectedBody.class : ''}</div>
          <dl class="insp-grid">
            <dt>Orbit</dt><dd>{orbitDist(selectedBody)}</dd>
            <dt>Mass</dt><dd>{massRel(selectedBody)}</dd>
            <dt>Gravity</dt><dd>{gravityG(selectedBody)}</dd>
            <dt>Radius</dt><dd>{fmt(selectedBody.radiusKm)} km</dd>
            <dt>Temp</dt><dd>{tempC(selectedBody)}</dd>
            <dt>Atmosphere</dt><dd>{atmo(selectedBody)}</dd>
            {#if selectedBody.habitabilityScore}<dt>Habitability</dt><dd>{selectedBody.habitabilityScore.toFixed(0)}%</dd>{/if}
          </dl>
          {#if selectedBody.description}
            <p class="insp-desc">{selectedBody.description}</p>
          {/if}
        </aside>
      {:else}
        <div class="console-hint">Tap a world to read its file.</div>
      {/if}
    </div>
  {:else}
    <!-- Lo-fi / clean: the printed-report document under the chosen skin -->
    <div class="doc-scroll">
      <div class="phosphor">
        <ReportDocument {system} mode="Player" theme={theme.reportTheme} includeConstructs={true} chrome="catalogue" />
      </div>
    </div>
  {/if}

  {#if theme.tint !== 'none'}
    <CRTOverlay />
  {/if}
</main>

<style>
  :global(body) { margin: 0; }
  .catalogue {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #05070c;
    color: #cfd6e4;
    font-family: 'Courier New', ui-monospace, monospace;
    display: flex;
    flex-direction: column;
  }

  /* --- status bar (device chrome) --- */
  .statusbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    font-size: 12px;
    letter-spacing: 0.06em;
    background: rgba(0, 0, 0, 0.55);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    z-index: 50;
  }
  .sys-name { font-weight: 700; }
  .status { margin-left: auto; opacity: 0.85; }
  .status.live { color: #6fffa0; }
  .status.offline { color: #ffb061; }
  .theme-btn {
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 3px 10px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .theme-btn:hover { background: rgba(255, 255, 255, 0.16); }

  .theme-picker {
    position: absolute;
    top: 34px;
    right: 10px;
    z-index: 100;
    background: #0c1018;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 220px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  }
  .theme-option {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'label tier' 'blurb tier';
    gap: 0 8px;
    text-align: left;
    background: transparent;
    color: #cfd6e4;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 7px 9px;
    cursor: pointer;
    font: inherit;
  }
  .theme-option:hover { background: rgba(255, 255, 255, 0.06); }
  .theme-option.active { border-color: #6fffa0; }
  .opt-label { grid-area: label; font-weight: 700; font-size: 13px; }
  .opt-blurb { grid-area: blurb; font-size: 11px; opacity: 0.6; }
  .opt-tier { grid-area: tier; align-self: center; font-size: 10px; opacity: 0.55; text-transform: uppercase; }

  /* --- waiting state --- */
  .waiting { flex: 1; display: grid; place-items: center; text-align: center; }
  .waiting-inner h1 { font-size: 22px; margin: 0 0 8px; }
  .waiting-inner p { opacity: 0.7; margin: 4px 0; }
  .waiting-inner .sid { font-size: 11px; opacity: 0.4; }
  .waiting-inner button {
    margin-top: 14px;
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
    padding: 8px 16px;
    font: inherit;
    cursor: pointer;
  }

  /* --- lo-fi document tier --- */
  .doc-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: #04060a;
  }
  /* Phosphor look: invert the light "paper" report to a dark terminal, then tint. The
     invert+hue-rotate trick turns the line-printer document into glowing CRT text cheaply
     (the eventual upgrade is the Mappadux WebGL filter package — spec §5). */
  .tint-green .phosphor {
    filter: invert(1) sepia(1) saturate(3.2) hue-rotate(58deg) brightness(0.92) contrast(1.08);
  }
  .tint-amber .phosphor {
    filter: invert(1) sepia(1) saturate(3.4) hue-rotate(-14deg) brightness(0.95) contrast(1.06);
  }
  .tint-green .doc-scroll, .tint-amber .doc-scroll { background: #000; }
  .tint-green .phosphor, .tint-amber .phosphor { text-shadow: 0 0 1px currentColor; }

  /* --- hi-tech console tier --- */
  .console-stage { flex: 1; position: relative; min-height: 0; }
  .console-hint {
    position: absolute;
    bottom: 14px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 12px;
    opacity: 0.45;
    pointer-events: none;
  }
  .inspector {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 55%;
    overflow-y: auto;
    background: rgba(8, 11, 18, 0.92);
    backdrop-filter: blur(6px);
    border-top: 1px solid rgba(120, 180, 255, 0.35);
    padding: 14px 16px 20px;
    font-family: system-ui, sans-serif;
  }
  @media (min-width: 720px) {
    .inspector { left: auto; width: 340px; top: 0; bottom: 0; max-height: none; border-top: none; border-left: 1px solid rgba(120, 180, 255, 0.35); }
  }
  .insp-head { display: flex; align-items: baseline; gap: 10px; }
  .insp-head h2 { margin: 0; font-size: 20px; }
  .insp-close { margin-left: auto; background: none; border: none; color: #9fb0c8; font-size: 22px; line-height: 1; cursor: pointer; }
  .insp-sub { font-size: 11px; letter-spacing: 0.08em; opacity: 0.6; margin: 2px 0 12px; }
  .insp-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; margin: 0; font-size: 13px; }
  .insp-grid dt { opacity: 0.55; }
  .insp-grid dd { margin: 0; text-align: right; }
  .insp-desc { margin-top: 12px; font-size: 13px; line-height: 1.5; font-style: italic; opacity: 0.85; white-space: pre-wrap; }
</style>

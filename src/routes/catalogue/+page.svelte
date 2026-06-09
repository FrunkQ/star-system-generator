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
  import CatalogueBrowser from '$lib/catalogue/CatalogueBrowser.svelte';
  import { bodyFacts } from '$lib/catalogue/bodyFacts';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';
  import { AU_KM, G } from '$lib/constants';
  import type { System, RulePack, CelestialBody, Starmap } from '$lib/types';

  type ThemeKey = 'green' | 'amber' | 'guide' | 'clean' | 'console';
  interface ThemeDef {
    label: string;
    blurb: string;
    tier: 'static' | 'interactive';
    reportTheme: string;            // which ReportDocument theme to render underneath
    tint: 'green' | 'amber' | 'none';
  }
  const THEMES: Record<ThemeKey, ThemeDef> = {
    green:   { label: 'Green Screen',     blurb: 'Salvaged CRT terminal',     tier: 'static',      reportTheme: 'retro',    tint: 'green' },
    amber:   { label: 'Amber Terminal',   blurb: 'Phosphor field unit',       tier: 'static',      reportTheme: 'retro',    tint: 'amber' },
    guide:   { label: 'The Guide',        blurb: 'Friendly travel companion', tier: 'static',      reportTheme: 'standard', tint: 'none'  },
    clean:   { label: 'Survey Datapad',   blurb: 'Clean instrument feed',     tier: 'static',      reportTheme: 'standard', tint: 'none'  },
    console: { label: 'Starship Console', blurb: 'Live orbital plot',         tier: 'interactive', reportTheme: 'standard', tint: 'none'  },
  };
  const THEME_ORDER: ThemeKey[] = ['green', 'amber', 'guide', 'clean', 'console'];

  const EARTH_GRAVITY = 9.80665;
  const EARTH_MASS_KG = 5.972e24;

  // The guide is campaign-wide: the GM broadcasts the whole redacted starmap; the player browses
  // systems and drills into one. (Systems whose main star is hidden never arrive — see
  // computePlayerStarmapSnapshot.)
  let starmap: Starmap | null = null;
  let selectedSystemId: string | null = null;
  let branding: { name: string; logo: string | null } = { name: '', logo: null };
  let rulePack: RulePack | null = null;
  let sessionId: string | null = null;
  let themeKey: ThemeKey = 'green';
  let lastUpdate: number | null = null;
  let connected = false;
  let showThemePicker = false;
  // GM choice (?constructs=0) — whether artificial constructs appear in the guide, over and above
  // the standard player redaction (mirrors the printed report's "include constructs" option).
  let includeConstructs = true;

  $: selectedSystemNode = starmap?.systems.find((s) => s.id === selectedSystemId) || null;
  // The system the guide actually shows: the selected one, optionally with constructs stripped.
  $: displaySystem = (() => {
    const sys = selectedSystemNode?.system ?? null;
    if (!sys || includeConstructs) return sys;
    return { ...sys, nodes: sys.nodes.filter((n) => n.kind !== 'construct') };
  })();

  // Live clock for the interactive tier. Not synced to the GM at the starmap level — we just keep
  // the orbital plot gently in motion so it feels alive.
  let currentTime = Date.now();
  let isPlaying = true;
  let timeScale = 86400; // ~1 day per second
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
    const node = displaySystem?.nodes.find((n) => n.id === e.detail);
    // Surface natural bodies and artificial constructs alike (both are CelestialBody-shaped);
    // barycenters have no player-facing file, so they just clear the inspector.
    selectedBody = node && (node.kind === 'body' || node.kind === 'construct') ? (node as CelestialBody) : null;
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

  // One-line contents summary for a system card on the starmap-level list.
  function systemSummary(node: Starmap['systems'][number]): string {
    const ns = node.system?.nodes ?? [];
    const isStar = (n: any) => n.roleHint === 'star' || (Array.isArray(n.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
    let stars = 0, planets = 0, moons = 0, constructs = 0;
    for (const n of ns as any[]) {
      if (n.kind === 'construct') { if (includeConstructs) constructs++; continue; }
      if (isStar(n)) stars++;
      else if (n.roleHint === 'moon') moons++;
      else if (n.roleHint === 'planet' || n.roleHint === 'dwarf-planet') planets++;
    }
    const parts: string[] = [];
    if (stars) parts.push(`${stars} star${stars > 1 ? 's' : ''}`);
    if (planets) parts.push(`${planets} planet${planets > 1 ? 's' : ''}`);
    if (moons) parts.push(`${moons} moon${moons > 1 ? 's' : ''}`);
    if (constructs) parts.push(`${constructs} construct${constructs > 1 ? 's' : ''}`);
    return parts.join(' · ') || 'uncharted';
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('sid');
    includeConstructs = params.get('constructs') !== '0';
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

    // Receiver setup (filtering + cross-device peer dial). The per-system callbacks are unused at
    // the starmap level; we take the whole map via onStarmapUpdate below.
    broadcastService.initReceiver(
      () => {},
      (pack) => { rulePack = pack; },
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      sessionId
    );
    broadcastService.onStarmapUpdate = (map) => {
      starmap = map;
      lastUpdate = Date.now();
      connected = true;
    };
    broadcastService.onBrandingUpdate = (b) => { branding = b || { name: '', logo: null }; };
    broadcastService.sendMessage({ type: 'REQUEST_STARMAP', payload: sessionId });
    startClock();
  });

  onDestroy(() => {
    broadcastService.close();
    if (browser) cancelAnimationFrame(rafId);
  });
</script>

<svelte:head>
  <title>{selectedSystemNode?.name ?? starmap?.name ?? 'Field Guide'} — Catalogue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
</svelte:head>

<main class="catalogue tint-{theme.tint} skin-{themeKey}" class:interactive={theme.tier === 'interactive'}>
  <!-- Device status bar -->
  <header class="statusbar">
    {#if selectedSystemId}
      <button class="back-btn" on:click={() => { selectedSystemId = null; selectedBody = null; }} title="Back to all systems">‹ Systems</button>
    {/if}
    {#if branding.logo}<img class="brand-logo" src={branding.logo} alt="" />{/if}
    {#if branding.name}<span class="brand-name">{branding.name}</span>{/if}
    <span class="sys-name">{selectedSystemNode ? selectedSystemNode.name.toUpperCase() : (starmap ? (starmap.name || 'STARMAP').toUpperCase() : 'NO SIGNAL')}</span>
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

  {#if themeKey === 'guide' && (selectedSystemNode || starmap)}
    <div class="guide-banner">A traveller's guide to {selectedSystemNode?.name ?? starmap?.name} — friendly, illustrated, and mostly accurate.</div>
  {/if}

  {#if !starmap}
    <!-- Waiting / offline -->
    <div class="waiting">
      <div class="waiting-inner">
        <h1>Reaching the host…</h1>
        <p>Connecting to the game session. Make sure the host has the Field Guide open, then this
          will fill in automatically.</p>
        {#if sessionId}<p class="sid">session {sessionId}</p>{/if}
        <button on:click={() => broadcastService.sendMessage({ type: 'REQUEST_STARMAP', payload: sessionId })}>
          Retry
        </button>
      </div>
    </div>
  {:else if !selectedSystemId}
    <!-- Starmap level: choose a system -->
    <div class="doc-scroll">
      <div class="cat-browser">
        <header class="cat-head">
          <h1>{starmap.name || 'Known Space'}</h1>
          <p class="sub">{starmap.systems.length} system{starmap.systems.length === 1 ? '' : 's'} · tap one to explore</p>
        </header>
        <div class="sys-list">
          {#each starmap.systems as s (s.id)}
            <button class="sys-card" on:click={() => { selectedSystemId = s.id; selectedBody = null; }}>
              <span class="sys-card-name">★ {s.name}</span>
              <span class="sys-card-sub">{systemSummary(s)}</span>
            </button>
          {/each}
          {#if starmap.systems.length === 0}
            <p class="empty">No systems are visible in this guide yet.</p>
          {/if}
        </div>
      </div>
    </div>
  {:else if theme.tier === 'interactive'}
    <!-- Hi-tech: live orbital map + tap-to-inspect -->
    <div class="console-stage">
      {#if rulePack && displaySystem}
        <SystemVisualizer
          system={displaySystem}
          {rulePack}
          {currentTime}
          {focusedBodyId}
          showNames={true}
          toytownFactor={displaySystem.toytownFactor || 0}
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
            {#each bodyFacts(selectedBody) as f}
              <dt>{f.label}</dt><dd>{f.value}</dd>
            {/each}
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
    <!-- Lo-fi / datapad / Guide: diagrammatic browser — clickable layout + a body panel. -->
    <div class="doc-scroll">
      <CatalogueBrowser system={displaySystem} {includeConstructs} />
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
  .brand-logo { height: 20px; width: auto; max-width: 90px; object-fit: contain; }
  .brand-name { font-weight: 700; letter-spacing: 0.08em; opacity: 0.95; }
  .brand-name + .sys-name::before { content: '· '; opacity: 0.4; }
  .back-btn {
    background: transparent; color: inherit; border: 1px solid currentColor;
    border-radius: 4px; padding: 2px 9px; font: inherit; font-size: 11px; cursor: pointer; opacity: 0.85;
  }
  .back-btn:hover { opacity: 1; }

  /* Starmap-level system list (page-scoped; CatalogueBrowser has its own .cat-* styles). */
  .cat-browser { max-width: 760px; margin: 0 auto; padding: 16px 18px 40px; }
  .cat-head h1 { margin: 0; font-size: 1.5rem; letter-spacing: 0.02em; }
  .cat-head .sub { margin: 2px 0 14px; opacity: 0.6; font-size: 0.8rem; }
  .sys-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .sys-card {
    display: flex; flex-direction: column; gap: 4px; text-align: left;
    background: transparent; color: inherit; border: 1px solid currentColor; border-radius: 8px;
    padding: 12px 14px; cursor: pointer; opacity: 0.85; font: inherit;
  }
  .sys-card:hover { opacity: 1; background: color-mix(in srgb, currentColor 10%, transparent); }
  .sys-card-name { font-weight: 700; font-size: 1rem; }
  .sys-card-sub { font-size: 0.78rem; opacity: 0.7; }
  .empty { opacity: 0.5; font-style: italic; }
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

  /* --- diagrammatic browser tier --- */
  .doc-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: #04060a;
  }
  /* Each skin just sets the terminal colour + background; the browser is built from currentColor
     and thin borders, so it adopts the hue. CRTOverlay (added for tint != none) supplies scanlines.
     (A WebGL filter package — spec §5 — is the eventual upgrade over this CSS approach.) */
  .tint-green { color: #74f7b0; }
  .tint-green .doc-scroll { background: #020806; }
  .tint-green .sys-name, .tint-green .status.live { color: #74f7b0; }
  .tint-amber { color: #ffb766; }
  .tint-amber .doc-scroll { background: #0a0600; }
  .tint-amber .sys-name, .tint-amber .status.live { color: #ffb766; }
  .tint-green .doc-scroll, .tint-amber .doc-scroll { text-shadow: 0 0 1px currentColor; }

  /* --- The Guide: friendly illustrated travel companion (warm green book) --- */
  .guide-banner {
    flex: 0 0 auto;
    text-align: center;
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-size: 13px;
    color: #061a10;
    background: linear-gradient(180deg, #7CFFB2, #34d27e);
    padding: 7px 12px;
    letter-spacing: 0.02em;
  }
  .skin-guide { background: #04140d; color: #d6ffe8; font-family: Georgia, 'Times New Roman', serif; }
  .skin-guide .statusbar { background: #07241a; border-bottom-color: rgba(124, 255, 178, 0.3); }
  .skin-guide .status.live { color: #7CFFB2; }
  .skin-guide .sys-name { color: #7CFFB2; }
  .skin-guide .doc-scroll { background: #04140d; }
  .skin-clean { color: #dfe5ef; }
  .skin-clean .doc-scroll { background: #0b0e14; }

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

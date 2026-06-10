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
  import { MONO_COLORS, normalizeGuideConfig } from '$lib/catalogue/guideConfig';
  import type { MonoColor } from '$lib/catalogue/guideConfig';
  import { randomGuideNote } from '$lib/catalogue/guideNotes';
  import type { System, RulePack, CelestialBody, Starmap } from '$lib/types';

  // The view is GM-ENFORCED: the GM's Companion launcher broadcasts SYNC_GUIDECONFIG and the
  // guide applies it — there is no player-facing picker. The URL carries the initial choice so
  // the first paint matches before the broadcast lands.
  type ThemeKey = 'mono' | 'guide' | 'clean' | 'console';
  interface ThemeDef {
    label: string;
    blurb: string;
    tier: 'static' | 'interactive';
    reportTheme: string;            // which ReportDocument theme to render underneath
    tint: 'mono' | 'none';
  }
  const THEMES: Record<ThemeKey, ThemeDef> = {
    mono:    { label: 'Monochrome Terminal', blurb: 'Salvaged CRT terminal',     tier: 'static',      reportTheme: 'retro',    tint: 'mono' },
    guide:   { label: 'The Guide',           blurb: 'Friendly travel companion', tier: 'static',      reportTheme: 'standard', tint: 'none' },
    clean:   { label: 'Survey Datapad',      blurb: 'Clean instrument feed',     tier: 'static',      reportTheme: 'standard', tint: 'none' },
    console: { label: 'Starship Console',    blurb: 'Live orbital plot',         tier: 'interactive', reportTheme: 'standard', tint: 'none' },
  };

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
  let themeKey: ThemeKey = 'mono';
  let monoColor: MonoColor = 'green';
  let lastUpdate: number | null = null;
  let connected = false;
  // GM choice (?constructs=0) — whether artificial constructs appear in the guide, over and above
  // the standard player redaction (mirrors the printed report's "include constructs" option).
  let includeConstructs = true;

  let previewSystemId: string | null = null; // starmap-level: clicked-but-not-entered system
  $: previewNode = starmap?.systems.find((s) => s.id === previewSystemId) || null;
  $: selectedSystemNode = starmap?.systems.find((s) => s.id === selectedSystemId) || null;

  // Project the starmap's system positions into an SVG viewBox (with route lines) for the clickable
  // starmap diagram. Stays on top; the selected system's preview shows below.
  function computeStarmapView(map: Starmap | null) {
    if (!map?.systems?.length) return { W: 600, H: 300, nodes: [] as any[], routes: [] as any[] };
    const xs = map.systems.map((s) => s.position?.x ?? 0);
    const ys = map.systems.map((s) => s.position?.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const W = 600;
    const H = Math.max(240, Math.min(560, Math.round(W * (h / w)) || 300));
    const pad = 46;
    const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    const ox = pad + ((W - 2 * pad) - w * s) / 2 - minX * s;
    const oy = pad + ((H - 2 * pad) - h * s) / 2 - minY * s;
    const pos = new Map<string, { x: number; y: number }>();
    const nodes = map.systems.map((node) => {
      const x = (node.position?.x ?? 0) * s + ox;
      const y = (node.position?.y ?? 0) * s + oy;
      pos.set(node.id, { x, y });
      return { node, x, y };
    });
    const routes = (map.routes || []).map((r: any) => {
      const a = pos.get(r.sourceSystemId), b = pos.get(r.targetSystemId);
      return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
    }).filter(Boolean);
    return { W, H, nodes, routes };
  }
  $: starmapView = computeStarmapView(starmap);
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
  let rafId = 0;

  // Interactive-tier selection.
  let focusedBodyId: string | null = null;
  let selectedBody: CelestialBody | null = null;

  // --- Console navigation: a clickable star/planet list, with moons + constructs once a
  //     planet is focused. Jumping also focuses the visualizer on that body. ---
  function isStarNode(n: any): boolean {
    return n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
  }
  function isNavPlanet(n: any): boolean {
    return n?.kind === 'body' && !isStarNode(n) && n.roleHint !== 'moon' && n.roleHint !== 'belt' && n.roleHint !== 'ring' && n.roleHint !== 'barycenter';
  }
  $: consoleStars = ((displaySystem?.nodes ?? []) as any[]).filter(isStarNode) as CelestialBody[];
  function consolePlanetsOf(hostId: string): CelestialBody[] {
    return ((displaySystem?.nodes ?? []) as any[])
      .filter((n) => isNavPlanet(n) && (n.parentId === hostId || n.orbit?.hostId === hostId))
      .sort((a, b) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0)) as CelestialBody[];
  }
  function consoleChildrenOf(id: string | null): CelestialBody[] {
    if (!id) return [];
    return ((displaySystem?.nodes ?? []) as any[])
      .filter((n) => (n.parentId === id || n.orbit?.hostId === id) && (n.roleHint === 'moon' || n.kind === 'construct'))
      .sort((a, b) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0)) as CelestialBody[];
  }
  // The planet whose moon/construct family is open in the nav (and governs the adaptive clock):
  // the focused planet itself, or the focused child's parent planet.
  $: expandedPlanetId = (() => {
    const all = (displaySystem?.nodes ?? []) as any[];
    const f = all.find((n) => n.id === focusedBodyId);
    if (!f) return null;
    if (isNavPlanet(f)) return f.id as string;
    const pid = f.parentId || f.orbit?.hostId;
    const p = all.find((n) => n.id === pid);
    return p && isNavPlanet(p) ? (p.id as string) : null;
  })();
  $: expandedChildren = consoleChildrenOf(expandedPlanetId);
  function jumpTo(id: string) {
    focusedBodyId = id;
    const node = displaySystem?.nodes.find((n) => n.id === id);
    selectedBody = node && (node.kind === 'body' || node.kind === 'construct') ? (node as CelestialBody) : null;
  }

  // --- Adaptive time: slow the clock so the FASTEST orbiting object in view completes one
  //     orbit every ~2 seconds (fast moons stay selectable). "In view" = the focused body's
  //     children when it has any, else the system's planets. ---
  function periodSec(b: any): number | null {
    const d = b?.orbital_period_days;
    return typeof d === 'number' && d > 0 ? d * 86400 : null;
  }
  $: timeScale = (() => {
    const all = (displaySystem?.nodes ?? []) as any[];
    let watched: any[] = expandedChildren.length ? expandedChildren : [];
    if (!watched.length) watched = all.filter(isNavPlanet);
    const periods = watched.map(periodSec).filter((p): p is number => p !== null);
    if (!periods.length) return 86400; // fallback: ~a day per second
    return Math.max(1, Math.min(...periods) / 2);
  })();
  function fmtTimeRate(sps: number): string {
    const Y = 86400 * 365.25;
    if (sps >= 2 * Y) return `${Math.round(sps / Y)} years`;
    if (sps >= 2 * 86400) return `${Math.round(sps / 86400)} days`;
    if (sps >= 2 * 3600) return `${Math.round(sps / 3600)} hours`;
    if (sps >= 2 * 60) return `${Math.round(sps / 60)} minutes`;
    return `${Math.round(sps)} seconds`;
  }

  // --- The Guide: DON'T PANIC front cover (once per session) + random margin-note banners. ---
  let guideCoverDismissed = false;
  if (browser) {
    try { guideCoverDismissed = sessionStorage.getItem('sse-guide-cover-seen') === '1'; } catch { /* ignore */ }
  }
  function dismissGuideCover() {
    guideCoverDismissed = true;
    try { sessionStorage.setItem('sse-guide-cover-seen', '1'); } catch { /* ignore */ }
  }
  let topNote = '';
  let bottomNote = '';
  function rollNotes(_trigger: string | null) {
    const t = randomGuideNote();
    topNote = t;
    bottomNote = randomGuideNote(t);
  }
  // Fresh notes every time the reader moves between systems (or back to the map).
  $: rollNotes(selectedSystemId);
  const PANIC = "DON'T PANIC!!!!".split('');

  $: theme = THEMES[themeKey];
  $: nowLabel = lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

  // Apply a GM-broadcast (or URL-derived) view config.
  function applyGuideConfig(raw: { theme: string; monoColor: string; includeConstructs: boolean }) {
    const c = normalizeGuideConfig(raw);
    const themeChanged = c.theme !== themeKey;
    themeKey = c.theme;
    monoColor = c.monoColor;
    includeConstructs = c.includeConstructs;
    if (themeChanged) selectedBody = null;
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
    // Initial view from the URL (legacy green/amber theme keys fold into mono + colour);
    // the GM's SYNC_GUIDECONFIG broadcast takes over from there.
    applyGuideConfig({
      theme: params.get('theme') || 'mono',
      monoColor: params.get('color') || 'green',
      includeConstructs: params.get('constructs') !== '0',
    });

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
    broadcastService.onGuideConfigUpdate = (c) => { if (c) applyGuideConfig(c); };
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

<main class="catalogue tint-{theme.tint} skin-{themeKey}" class:interactive={theme.tier === 'interactive'} style="--mono:{MONO_COLORS[monoColor].hex}">
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
  </header>

  {#if themeKey === 'guide' && !guideCoverDismissed}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="guide-cover" role="button" tabindex="0" on:click={dismissGuideCover} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') dismissGuideCover(); }}>
      <div class="cover-inner">
        <p class="cover-pre">On the cover, in large friendly letters:</p>
        <div class="panic" aria-label="Don't panic">
          {#each PANIC as ch, i}<span style="--i:{i}">{ch === ' ' ? '\u00A0' : ch}</span>{/each}
        </div>
        <p class="cover-sub">The Field Guide: the standard repository for all knowledge and wisdom. Abridged. Redacted. Mostly accurate.</p>
        <p class="cover-hint">tap anywhere to open the Guide</p>
      </div>
    </div>
  {/if}

  {#if themeKey === 'guide' && (selectedSystemNode || starmap)}
    <div class="guide-banner">A traveller's guide to {selectedSystemNode?.name ?? starmap?.name} — friendly, illustrated, and mostly accurate.</div>
    {#if topNote}<div class="guide-note top">{topNote}</div>{/if}
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
        {#if starmap.systems.length === 0}
          <p class="empty">No systems are visible in this guide yet.</p>
        {:else}
          <svg class="starmap-diagram" viewBox="0 0 {starmapView.W} {starmapView.H}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Star map">
            {#each starmapView.routes as r}
              <line class="sm-route" x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
            {/each}
            {#each starmapView.nodes as p (p.node.id)}
              <g class="sm-node" class:sel={previewSystemId === p.node.id} role="button" tabindex="0"
                 on:click={() => (previewSystemId = p.node.id)} on:keydown={(e) => { if (e.key === 'Enter') previewSystemId = p.node.id; }}>
                <circle class="sm-star" cx={p.x} cy={p.y} r="6" />
                <text class="sm-label" x={p.x} y={p.y + 17} text-anchor="middle">{p.node.name}</text>
              </g>
            {/each}
          </svg>
          {#if previewNode}
            <section class="sm-preview">
              <h2>★ {previewNode.name}</h2>
              <p class="sm-sum">{systemSummary(previewNode)}</p>
              <button class="explore-btn" on:click={() => { selectedSystemId = previewNode.id; previewSystemId = null; selectedBody = null; }}>Explore system →</button>
            </section>
          {:else}
            <p class="sm-hint">Tap a system to preview it, then explore.</p>
          {/if}
        {/if}
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
      <!-- Jump list: stars + planets; the focused planet unfolds its moons/constructs. -->
      <nav class="console-nav" aria-label="System bodies">
        {#each consoleStars as star (star.id)}
          <button class="nav-item star" class:active={focusedBodyId === star.id} on:click={() => jumpTo(star.id)}>★ {star.name}</button>
          {#each consolePlanetsOf(star.id) as p (p.id)}
            <button class="nav-item" class:active={focusedBodyId === p.id} on:click={() => jumpTo(p.id)}>● {p.name}</button>
            {#if expandedPlanetId === p.id}
              {#each expandedChildren as c (c.id)}
                <button class="nav-item sub" class:active={focusedBodyId === c.id} on:click={() => jumpTo(c.id)}>{c.kind === 'construct' ? '◆' : '○'} {c.name}</button>
              {/each}
            {/if}
          {/each}
        {/each}
      </nav>
      <!-- Adaptive clock read-out: the fastest body in view does ~1 orbit per 2 s. -->
      <div class="time-rate">1 s ≈ {fmtTimeRate(timeScale)}</div>
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
      <CatalogueBrowser system={displaySystem} {includeConstructs} colorful={themeKey === 'guide'} />
    </div>
  {/if}

  {#if themeKey === 'guide' && starmap && bottomNote}
    <div class="guide-note bottom">{bottomNote}</div>
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
  .empty { opacity: 0.5; font-style: italic; }
  /* Clickable star map (skin-tinted via currentColor). */
  .starmap-diagram { width: 100%; height: auto; display: block; border: 1px solid currentColor; border-radius: 8px; }
  .sm-route { stroke: currentColor; stroke-opacity: 0.25; stroke-width: 1; }
  .sm-node { cursor: pointer; }
  .sm-star { fill: currentColor; opacity: 0.7; }
  .sm-node:hover .sm-star, .sm-node.sel .sm-star { opacity: 1; }
  .sm-node.sel .sm-star { stroke: currentColor; stroke-width: 3; }
  .sm-label { fill: currentColor; opacity: 0.85; font-size: 11px; }
  .sm-preview { margin-top: 14px; border: 1px solid currentColor; border-radius: 8px; padding: 12px 14px; }
  .sm-preview h2 { margin: 0 0 4px; font-size: 1.15rem; }
  .sm-sum { margin: 0 0 10px; opacity: 0.7; font-size: 0.85rem; }
  .explore-btn {
    background: color-mix(in srgb, currentColor 16%, transparent); color: inherit;
    border: 1px solid currentColor; border-radius: 6px; padding: 7px 14px; cursor: pointer; font: inherit;
  }
  .explore-btn:hover { background: color-mix(in srgb, currentColor 28%, transparent); }
  .sm-hint { margin-top: 12px; opacity: 0.5; font-size: 0.82rem; font-style: italic; }
  .status { margin-left: auto; opacity: 0.85; }
  .status.live { color: #6fffa0; }
  .status.offline { color: #ffb061; }
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
  .tint-mono { color: var(--mono, #74f7b0); }
  .tint-mono .doc-scroll { background: color-mix(in srgb, var(--mono, #74f7b0) 4%, #010204); text-shadow: 0 0 1px currentColor; }
  .tint-mono .sys-name, .tint-mono .status.live { color: var(--mono, #74f7b0); }

  /* --- The Guide: friendly illustrated travel companion — hopelessly, joyfully colourful.
     Several FRIENDLY fonts: rounded sans for body, comic/chalk for banners and the cover. --- */
  .guide-banner {
    flex: 0 0 auto;
    text-align: center;
    font-family: 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', 'Trebuchet MS', cursive;
    font-style: italic;
    font-size: 13px;
    color: #061a10;
    background: linear-gradient(90deg, #7CFFB2, #ffd76e, #ff9ce8, #8ed0ff, #7CFFB2);
    padding: 7px 12px;
    letter-spacing: 0.02em;
  }
  .skin-guide { background: #04140d; color: #d6ffe8; font-family: 'Trebuchet MS', 'Segoe UI', Verdana, sans-serif; }
  .skin-guide .statusbar { background: #07241a; border-bottom-color: rgba(124, 255, 178, 0.3); font-family: 'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', cursive; }
  .skin-guide .status.live { color: #7CFFB2; }
  .skin-guide .sys-name { color: #ffd76e; }
  .skin-guide .brand-name { color: #ff9ce8; }
  .skin-guide .doc-scroll { background: #04140d; }
  /* Random Guide margin notes, top and bottom. */
  .guide-note {
    flex: 0 0 auto;
    text-align: center;
    font-family: 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', 'Trebuchet MS', cursive;
    font-size: 12px;
    line-height: 1.45;
    padding: 6px 14px;
  }
  .guide-note.top { color: #06231a; background: linear-gradient(90deg, #8ed0ff, #b9a4ff); }
  .guide-note.bottom { color: #2a1606; background: linear-gradient(90deg, #ffd76e, #ff9c6e); border-top: 2px dashed rgba(0,0,0,0.35); }
  .guide-note.bottom::before { content: 'THE GUIDE SAYS: '; font-weight: 700; letter-spacing: 0.05em; }
  .guide-note.top::before { content: 'TRAVELLER ADVISORY: '; font-weight: 700; letter-spacing: 0.05em; }
  /* The front cover: big, friendly, colourful letters. Tap to pass. */
  .guide-cover {
    position: absolute;
    inset: 0;
    z-index: 300;
    display: grid;
    place-items: center;
    background: radial-gradient(ellipse at 50% 35%, #0a3322, #04140d 70%);
    cursor: pointer;
    text-align: center;
    padding: 24px;
  }
  .cover-inner { max-width: 560px; }
  .cover-pre {
    font-family: 'Trebuchet MS', Verdana, sans-serif;
    font-style: italic;
    color: #9fe8c4;
    opacity: 0.85;
    margin: 0 0 18px;
  }
  .panic {
    font-family: 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', 'Trebuchet MS', cursive;
    font-weight: 700;
    font-size: clamp(38px, 11vw, 92px);
    line-height: 1.05;
    user-select: none;
  }
  .panic span {
    display: inline-block;
    color: hsl(calc(var(--i) * 26), 95%, 66%);
    transform: rotate(calc((var(--i) - 7) * 1.6deg));
    text-shadow: 0 3px 0 rgba(0, 0, 0, 0.45);
  }
  .cover-sub {
    font-family: 'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', cursive;
    color: #d6ffe8;
    margin: 22px 0 0;
    font-size: 15px;
    line-height: 1.5;
  }
  .cover-hint {
    font-family: 'Trebuchet MS', Verdana, sans-serif;
    color: #7CFFB2;
    opacity: 0.6;
    font-size: 12px;
    margin-top: 26px;
    animation: cover-pulse 1.6s ease-in-out infinite;
  }
  @keyframes cover-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.85; } }
  .skin-clean { color: #dfe5ef; }
  .skin-clean .doc-scroll { background: #0b0e14; }

  /* --- hi-tech console tier --- */
  .console-stage { flex: 1; position: relative; min-height: 0; }
  .console-nav {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: calc(100% - 70px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: rgba(8, 11, 18, 0.78);
    border: 1px solid rgba(120, 180, 255, 0.3);
    border-radius: 8px;
    padding: 6px;
    min-width: 130px;
    max-width: 190px;
    font-family: system-ui, sans-serif;
  }
  .nav-item {
    text-align: left;
    background: transparent;
    color: #cfd6e4;
    border: none;
    border-radius: 5px;
    padding: 4px 8px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav-item:hover { background: rgba(120, 180, 255, 0.14); }
  .nav-item.active { background: rgba(120, 180, 255, 0.26); color: #fff; }
  .nav-item.star { font-weight: 700; }
  .nav-item.sub { padding-left: 22px; opacity: 0.9; font-size: 11.5px; }
  .time-rate {
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 20;
    font-family: system-ui, sans-serif;
    font-size: 11.5px;
    letter-spacing: 0.04em;
    color: #9fb0c8;
    background: rgba(8, 11, 18, 0.7);
    border: 1px solid rgba(120, 180, 255, 0.25);
    border-radius: 6px;
    padding: 4px 9px;
    pointer-events: none;
  }
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

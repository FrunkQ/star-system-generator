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
  import HoloView from '$lib/holo/HoloView.svelte';
  import BodyPicker from '$lib/components/BodyPicker.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';
  import { crtControls, CRT_DEFAULTS } from '$lib/catalogue/crtControls';
  import { AU_KM, G } from '$lib/constants';
  import { formatTempK, type MeasurementUnits, type TemperatureUnit } from '$lib/units';
  import { MONO_COLORS, normalizeGuideConfig } from '$lib/catalogue/guideConfig';
  import type { MonoColor } from '$lib/catalogue/guideConfig';
  import { randomGuideNote } from '$lib/catalogue/guideNotes';
  import type { System, RulePack, CelestialBody, Starmap } from '$lib/types';

  // The view is GM-ENFORCED: the GM's Companion launcher broadcasts SYNC_GUIDECONFIG and the
  // guide applies it — there is no player-facing picker. The URL carries the initial choice so
  // the first paint matches before the broadcast lands.
  type ThemeKey = 'mono' | 'guide' | 'clean' | 'console' | 'holo';
  interface ThemeDef {
    label: string;
    blurb: string;
    tier: 'static' | 'interactive' | 'holo';
    reportTheme: string;            // which ReportDocument theme to render underneath
    tint: 'mono' | 'none';
  }
  const THEMES: Record<ThemeKey, ThemeDef> = {
    mono:    { label: 'Monochrome Terminal', blurb: 'Salvaged CRT terminal',     tier: 'static',      reportTheme: 'retro',    tint: 'mono' },
    guide:   { label: 'The Guide',           blurb: 'Friendly travel companion', tier: 'static',      reportTheme: 'standard', tint: 'none' },
    clean:   { label: 'Survey Datapad',      blurb: 'Clean instrument feed',     tier: 'static',      reportTheme: 'standard', tint: 'none' },
    console: { label: 'Starship Console',    blurb: 'Live orbital plot',         tier: 'interactive', reportTheme: 'standard', tint: 'none' },
    holo:    { label: 'Holo Table',          blurb: '3D orbital hologram',       tier: 'holo',        reportTheme: 'standard', tint: 'none' },
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
  let themeKey: ThemeKey = 'guide';   // The Guide is the default pre-picked skin

  // Holo look presets + live style. A GM picks a preset (one dropdown) or opens the control panel to
  // tweak live and save a new preset. Filter ids are hardcoded here so the filter package (which pulls
  // in three) stays out of this route's chunk; HoloView lazy-loads the actual shaders.
  import { holoPresets, styleOf, saveHoloPreset, DEFAULT_STYLE, type HoloStyle } from '$lib/holo/holoStyle';
  let holoStyle: HoloStyle = { ...DEFAULT_STYLE };
  let holoPresetId = 'clean';
  let showHoloControls = false;
  // Momentary GM overrides — deliberately NOT part of holoStyle (never saved to a preset).
  let holoLabelsOn = true;
  let holoFilterBypass = false;
  let holoOrbitPaused = false;
  const HOLO_FILTERS = [
    { id: 'none', label: 'No filter' },
    { id: 'crt', label: 'CRT Terminal' },
    { id: 'night_vision', label: 'Night Vision' },
    { id: 'thermal', label: 'Thermal' }
  ];
  // The CRT phosphor colour lives in filterParams; expose it as a colour picker when CRT is chosen.
  $: crtPhosphor = (holoStyle.filterParams?.phosphor as string) || '#4dff88';
  function setCrtPhosphor(hex: string) {
    holoStyle = { ...holoStyle, filterParams: { ...(holoStyle.filterParams || {}), phosphor: hex } };
  }
  // Collapse a popover when the user interacts anywhere outside it.
  function clickOutside(node: HTMLElement, cb: () => void) {
    const handler = (e: Event) => { if (!node.contains(e.target as Node)) cb(); };
    document.addEventListener('pointerdown', handler, true);
    return { destroy() { document.removeEventListener('pointerdown', handler, true); } };
  }
  function applyHoloPreset(id: string) {
    const p = $holoPresets.find((x) => x.id === id);
    if (p) { holoStyle = styleOf(p); holoPresetId = id; }
  }
  function saveHoloStyleAsPreset() {
    const name = (typeof prompt === 'function' ? prompt('Name this look:', 'My Preset') : '') || '';
    if (!name.trim()) return;
    const p = saveHoloPreset(name, holoStyle);
    holoPresetId = p.id;
  }
  // CRT "screen content" effects applied to <main> on the mono skin (overlay layers live in CRTOverlay).
  // Invert is a PALETTE SWAP (handled by the .crt-invert class below), not a luminance filter:
  // the terminal colour becomes the background and the content goes dark (green-on-black ↔
  // black-on-green). Only brightness/contrast/skew/corners are filter/transform here.
  $: crtStyle = theme?.tint === 'mono'
    ? `filter: brightness(${$crtControls.brightness}) contrast(${$crtControls.contrast}); transform: skewX(${$crtControls.skew * 18}deg); border-radius: ${$crtControls.roundedCorners * 100}vmin;`
    : '';
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
  // Player time rate: a discrete ladder of "in-sim time per real second", from 1 s (real time) up
  // to 10 years/s. The control collapses to a play/pause icon and expands to a slider on click.
  const RATE_STEPS: { label: string; sec: number }[] = [
    { label: '1 s', sec: 1 }, { label: '1 min', sec: 60 }, { label: '1 h', sec: 3600 }, { label: '12 h', sec: 43200 },
    { label: '1 d', sec: 86400 }, { label: '2 d', sec: 172800 }, { label: '4 d', sec: 345600 }, { label: '1 wk', sec: 604800 },
    { label: '2 wk', sec: 1209600 }, { label: '1 mo', sec: 2592000 }, { label: '2 mo', sec: 5184000 }, { label: '6 mo', sec: 15552000 },
    { label: '1 yr', sec: 31557600 }, { label: '2 yr', sec: 63115200 }, { label: '5 yr', sec: 157788000 }, { label: '10 yr', sec: 315576000 }
  ];
  let rateIndex = 2; // default 1 s ≈ 1 h — inner planets visibly move, rings/belts shear
  let timeExpanded = false;

  // Interactive-tier selection.
  let focusedBodyId: string | null = null;
  let selectedBody: CelestialBody | null = null;
  // Phone: the body panel opens collapsed (name + type) and expands on a tap of the title.
  // Reset to collapsed whenever the selected body changes so each new tap starts small.
  let bodyExpanded = false;
  let _lastBodyId: string | null = null;
  $: if (selectedBody?.id !== _lastBodyId) { _lastBodyId = selectedBody?.id ?? null; bodyExpanded = false; }

  // Desktop: the right-hand body panel is drag-resizable from its left edge; the width is remembered.
  // Default is deliberately compact (~2/3 of the old 340px) so the map keeps the room.
  let inspectorWidth = 230;
  if (browser) { const s = Number(localStorage.getItem('holo-insp-width')); if (s >= 200 && s <= 640) inspectorWidth = s; }
  function startInspectorResize(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidth;
    const onMove = (ev: PointerEvent) => { inspectorWidth = Math.max(200, Math.min(640, startW + (startX - ev.clientX))); };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem('holo-insp-width', String(Math.round(inspectorWidth))); } catch { /* private mode */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

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
  // Console nav: planets PLUS belts and barycentres (shown as their dominant member, e.g. Pluto),
  // so they're not missing from the jump list. Each entry's `id` is what gets focused.
  function consoleBaryDominantId(bary: any): string {
    const ns = (displaySystem?.nodes ?? []) as any[];
    const members = ns.filter((n) => (bary.memberIds || []).includes(n.id) || n.parentId === bary.id);
    members.sort((a, b) => (b.massKg || 0) - (a.massKg || 0));
    return members[0]?.id ?? bary.id;
  }
  function consoleNavOf(hostId: string): { id: string; label: string; icon: string }[] {
    const ns = (displaySystem?.nodes ?? []) as any[];
    const beltMidAU = (n: any) => n.orbit?.elements?.a_AU
      || (n.radiusInnerKm && n.radiusOuterKm ? (n.radiusInnerKm + n.radiusOuterKm) / 2 / AU_KM : 0);
    const out: { id: string; label: string; icon: string; a: number }[] = [];
    for (const n of ns) {
      if (!(n.parentId === hostId || n.orbit?.hostId === hostId)) continue;
      if (isNavPlanet(n)) out.push({ id: n.id, label: n.name, icon: '●', a: n.orbit?.elements?.a_AU || 0 });
      else if (n.roleHint === 'belt') out.push({ id: n.id, label: n.name, icon: '◌', a: beltMidAU(n) });
      else if (n.kind === 'barycenter') {
        const domId = consoleBaryDominantId(n);
        const dom = ns.find((x) => x.id === domId);
        out.push({ id: domId, label: dom?.name ?? n.name, icon: '●', a: n.orbit?.elements?.a_AU || 0 });
      }
    }
    return out.sort((a, b) => a.a - b.a).map(({ id, label, icon }) => ({ id, label, icon }));
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
  // Words wrap as units (letters are individually coloured, so each word is a nowrap group).
  const PANIC_WORDS = "DON'T PANIC!!!!".split(' ').map((w, wi, arr) => ({
    letters: w.split(''),
    offset: arr.slice(0, wi).reduce((n, p) => n + p.length + 1, 0),
  }));

  $: theme = THEMES[themeKey];
  $: nowLabel = lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

  // Apply a GM-broadcast (or URL-derived) view config. The CRT effect is GM-controlled: if the
  // broadcast carries crt settings, adopt them (players have no CRT panel of their own).
  function applyGuideConfig(raw: { theme: string; monoColor: string; includeConstructs: boolean; crt?: Record<string, number | boolean> }) {
    const c = normalizeGuideConfig(raw);
    const themeChanged = c.theme !== themeKey;
    themeKey = c.theme;
    monoColor = c.monoColor;
    includeConstructs = c.includeConstructs;
    if (raw.crt && typeof raw.crt === 'object') {
      crtControls.set({ ...CRT_DEFAULTS, ...(raw.crt as any) });
    }
    if (themeChanged) selectedBody = null;
  }

  function startClock() {
    if (!browser) return;
    let last = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - last) / 1000;
      if (isPlaying) currentTime += dt * RATE_STEPS[rateIndex].sec * 1000;
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
    return b.temperatureK === undefined ? '-' : formatTempK(b.temperatureK, tempUnit);
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

  let units: MeasurementUnits = 'metric';   // in-system km/miles, from the launcher URL (?units=)
  let tempUnit: TemperatureUnit = 'C';       // temperature °C/°F/K, from the launcher URL (?temp=)

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('sid');
    units = params.get('units') === 'imperial' ? 'imperial' : 'metric';
    { const tp = params.get('temp'); tempUnit = tp === 'F' || tp === 'K' ? tp : 'C'; }
    // Initial view from the URL (legacy green/amber theme keys fold into mono + colour);
    // the GM's SYNC_GUIDECONFIG broadcast takes over from there.
    applyGuideConfig({
      theme: params.get('theme') || 'guide',   // The Guide is the default pre-picked skin
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

<main class="catalogue tint-{theme.tint} skin-{themeKey}" class:interactive={theme.tier === 'interactive'} class:crt-invert={theme.tint === 'mono' && $crtControls.invert} style="--mono:{MONO_COLORS[monoColor].hex}; {crtStyle}">
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
        <div class="panic" aria-label="Don't panic">
          {#each PANIC_WORDS as word, wi}{#if wi > 0}{' '}{/if}<span class="panic-word">{#each word.letters as ch, i}<span style="--i:{word.offset + i}">{ch}</span>{/each}</span>{/each}
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
  {:else if theme.tier === 'interactive' || theme.tier === 'holo'}
    <!-- Hi-tech: live orbital map (2D console or 3D holo table) + tap-to-inspect -->
    <div class="console-stage">
      {#if rulePack && displaySystem}
        {#if theme.tier === 'holo'}
          <HoloView system={displaySystem} {currentTime} {focusedBodyId} style={holoStyle} labelsVisible={holoLabelsOn} filterBypass={holoFilterBypass} orbitPaused={holoOrbitPaused} on:focus={handleFocus} />
          <!-- Preset picker: the GM's one-dropdown "how does this look" control. -->
          <div class="holo-presetbar">
            <select class="holo-preset" value={holoPresetId} on:change={(e) => applyHoloPreset((e.currentTarget as HTMLSelectElement).value)} aria-label="Look preset">
              {#each $holoPresets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <!-- Momentary GM toggles (not saved to the preset): quick labels on/off and a filter bypass. -->
            <button class="holo-toggle" class:off={!holoLabelsOn} on:click={() => (holoLabelsOn = !holoLabelsOn)} title={holoLabelsOn ? 'Hide labels' : 'Show labels'} aria-label="Toggle labels" aria-pressed={holoLabelsOn}>A</button>
            <button class="holo-toggle" class:off={holoFilterBypass} on:click={() => (holoFilterBypass = !holoFilterBypass)} title={holoFilterBypass ? 'Filter suspended — click to restore' : 'Suspend the visual filter'} aria-label="Bypass filter" aria-pressed={!holoFilterBypass}>◎</button>
            {#if (holoStyle.orbitSpeed ?? 0) > 0}
              <button class="holo-toggle" class:off={holoOrbitPaused} on:click={() => (holoOrbitPaused = !holoOrbitPaused)} title={holoOrbitPaused ? 'Auto view-orbit paused — click to resume' : 'Pause auto view-orbit'} aria-label="Pause view orbit" aria-pressed={!holoOrbitPaused}>↻</button>
            {/if}
            <button class="holo-tune" class:on={showHoloControls} on:click={() => (showHoloControls = !showHoloControls)} title="Adjust the look" aria-label="Adjust the look">⚙</button>
          </div>
          {#if showHoloControls}
            <!-- Live control panel: tweak the look and save it as a new preset. -->
            <div class="holo-panel">
              <label>Filter
                <select bind:value={holoStyle.filter}>
                  {#each HOLO_FILTERS as f}<option value={f.id}>{f.label}</option>{/each}
                </select>
              </label>
              {#if holoStyle.filter === 'crt'}
                <label class="hp-inline">Phosphor
                  <input type="color" value={crtPhosphor} on:input={(e) => setCrtPhosphor((e.currentTarget as HTMLInputElement).value)} />
                </label>
              {/if}
              <label>Label size <span class="hp-val">{holoStyle.labelSize ?? 11}px</span>
                <input type="range" min="8" max="24" step="1" bind:value={holoStyle.labelSize} />
              </label>
              <label>Bodies
                <select bind:value={holoStyle.bodyStyle}>
                  <option value="textured">True colour</option>
                  <option value="flat">Flat colour</option>
                  <option value="tint">Holo tint</option>
                </select>
              </label>
              <label>Spread <span class="hp-val">{holoStyle.compression === 0 ? 'true scale' : Math.round(holoStyle.compression * 100) + '%'}</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={holoStyle.compression} />
              </label>
              <label>Body size <span class="hp-val">{holoStyle.bodySize === 0 ? 'true' : holoStyle.bodySize >= 1 ? 'readable' : Math.round(holoStyle.bodySize * 100) + '%'}</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={holoStyle.bodySize} />
              </label>
              <label>View angle <span class="hp-val">{Math.round(holoStyle.angleDeg)}°</span>
                <input type="range" min="0" max="80" step="1" bind:value={holoStyle.angleDeg} />
              </label>
              <label>Belt detail <span class="hp-val">{Math.round(holoStyle.beltDetail * 100)}%</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={holoStyle.beltDetail} />
              </label>
              <label>Background
                <select bind:value={holoStyle.background}>
                  <option value="space">Space</option>
                  <option value="green">Greenscreen</option>
                  <option value="blue">Bluescreen</option>
                  <option value="black">Black</option>
                </select>
              </label>
              <label>Grid
                <select bind:value={holoStyle.grid}>
                  <option value="off">Off</option>
                  <option value="plain">Grid</option>
                  <option value="scaled">Grid + scale</option>
                </select>
              </label>
              <label>View orbit <span class="hp-val">{holoStyle.orbitSpeed === 0 ? 'off' : Math.round(holoStyle.orbitSpeed * 100) + '%'}</span>
                <input type="range" min="0" max="1" step="0.05" bind:value={holoStyle.orbitSpeed} />
              </label>
              <label class="hp-check"><input type="checkbox" bind:checked={holoStyle.whole} /> Frame whole system</label>
              <label class="hp-check"><input type="checkbox" bind:checked={holoStyle.skybox} /> Starfield</label>
              <button class="hp-save" on:click={saveHoloStyleAsPreset}>Save as preset…</button>
            </div>
          {/if}
        {:else}
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
      {/if}
      <!-- Body selector: the same compact command-strip picker the main app uses (chip + search +
           category drill-in), so it's tiny on mobile and needs no new learning. Replaces the old
           full-height jump list. -->
      {#if displaySystem}
        <div class="holo-picker-left">
          <BodyPicker
            nodes={displaySystem.nodes}
            focusedId={focusedBodyId}
            emptyLabel="Bodies"
            on:select={(e) => jumpTo(e.detail)}
          />
        </div>
      {/if}
      <!-- Adaptive clock read-out: the fastest body in view does ~1 orbit per 2 s. -->
      <!-- Player time controls (Field Guide): collapsed to a play/pause icon; click to expand a rate
           slider (arbitrary — just to see movement). The projector is GM-clock-driven instead. -->
      <div class="time-controls" class:expanded={timeExpanded} use:clickOutside={() => (timeExpanded = false)}>
        {#if timeExpanded}
          <button class="tc-btn" on:click={() => (isPlaying = !isPlaying)} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '❚❚' : '▶'}</button>
          <input class="tc-slider" type="range" min="0" max={RATE_STEPS.length - 1} step="1" bind:value={rateIndex} aria-label="Time rate" />
          <span class="tc-rate">1 s ≈ {RATE_STEPS[rateIndex].label}</span>
        {:else}
          <button class="tc-btn tc-icon" on:click={() => (timeExpanded = true)} aria-label="Time controls" title="Time controls">{isPlaying ? '❚❚' : '▶'}</button>
        {/if}
      </div>
      {#if selectedBody}
        <aside class="inspector" class:expanded={bodyExpanded} style="--insp-w:{inspectorWidth}px">
          <!-- Desktop: drag the left edge to resize the panel (width persisted). Hidden on phone. -->
          <div class="insp-resize" on:pointerdown={startInspectorResize} role="separator" aria-orientation="vertical" aria-label="Resize panel"></div>
          <div class="insp-head">
            <!-- On phones the panel opens to just name + type; tapping the title reveals the
                 picture and stats, so you can keep clicking around the system without a big
                 sheet swallowing the screen. On desktop the detail is always shown. -->
            <button class="insp-title" on:click={() => (bodyExpanded = !bodyExpanded)} aria-expanded={bodyExpanded} title="Show details">
              <h2>{selectedBody.name}</h2>
              <span class="insp-chevron" aria-hidden="true">▾</span>
            </button>
            <button class="insp-close" on:click={() => (selectedBody = null)} aria-label="Close">×</button>
          </div>
          <div class="insp-sub">{(selectedBody.roleHint || 'body').toUpperCase()}{selectedBody.kind !== 'construct' && selectedBody.class ? ' · ' + selectedBody.class : ''}</div>
          <div class="insp-detail">
            {#if selectedBody.image?.url}
              <img class="insp-photo" src={selectedBody.image.url} alt={(selectedBody.kind === 'construct' ? 'Image of ' : "Artist's impression of ") + selectedBody.name} />
            {/if}
            <dl class="insp-grid">
              {#each bodyFacts(selectedBody, units, tempUnit) as f}
                <dt>{f.label}</dt><dd>{f.value}</dd>
              {/each}
            </dl>
            {#if selectedBody.description}
              <p class="insp-desc">{selectedBody.description}</p>
            {/if}
          </div>
        </aside>
      {:else}
        <div class="console-hint">Tap a world to read its file.</div>
      {/if}
    </div>
  {:else}
    <!-- Lo-fi / datapad / Guide: diagrammatic browser — clickable layout + a body panel. -->
    <div class="doc-scroll">
      <CatalogueBrowser system={displaySystem} {includeConstructs} {units} {tempUnit} colorful={themeKey === 'guide'}
        imagery={themeKey === 'guide' ? 'disc' : themeKey === 'clean' ? 'photo' : 'none'} />
    </div>
  {/if}

  {#if themeKey === 'guide' && starmap && bottomNote}
    <div class="guide-note bottom">{bottomNote}</div>
  {/if}

</main>

<!-- CRT layers live OUTSIDE main so the brightness/invert/skew filter doesn't touch them. The CRT
     effect is GM-controlled (set in the GM's Companion launcher), so there's no player-side panel. -->
{#if theme.tint !== 'none'}
  <CRTOverlay color={MONO_COLORS[monoColor].hex} />
{/if}

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

  /* Invert = palette swap: the terminal colour becomes the background, content goes dark
     (green-on-black ↔ black-on-green). Content reads via currentColor, so flipping `color` +
     the backgrounds is enough; the few explicit var(--mono) text colours are overridden too. */
  .catalogue.tint-mono.crt-invert { background: var(--mono, #74f7b0); color: #04070b; }
  .tint-mono.crt-invert .doc-scroll { background: transparent; text-shadow: none; }
  .tint-mono.crt-invert .sys-name, .tint-mono.crt-invert .status.live { color: #04070b; }

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
    font-size: 15px;
    line-height: 1.5;
    padding: 9px 16px;
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
  .panic {
    font-family: 'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', 'Trebuchet MS', cursive;
    font-weight: 700;
    font-size: clamp(38px, 11vw, 92px);
    line-height: 1.05;
    user-select: none;
  }
  .panic-word { white-space: nowrap; display: inline-block; }
  .panic-word span {
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
  /* Object picker left-aligned (not centred) — matches the projector, leaves the centre clear. */
  .holo-picker-left :global(.body-picker) { left: 10px; right: auto; transform: none; }
  .time-controls {
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: system-ui, sans-serif;
    font-size: 11.5px;
    letter-spacing: 0.04em;
    color: #9fb0c8;
    background: rgba(8, 11, 18, 0.72);
    border: 1px solid rgba(120, 180, 255, 0.25);
    border-radius: 8px;
    padding: 4px 8px;
  }
  .tc-btn {
    min-width: 32px;
    min-height: 32px; /* finger-friendly */
    border: 1px solid rgba(120, 180, 255, 0.3);
    border-radius: 6px;
    background: rgba(20, 28, 42, 0.8);
    color: #cfe0f5;
    font-size: 12px;
    cursor: pointer;
  }
  .tc-btn:hover { background: rgba(40, 60, 96, 0.9); }
  .tc-rate { padding: 0 4px; white-space: nowrap; min-width: 68px; }
  .tc-slider { width: 130px; accent-color: #6aa0ff; }
  .time-controls:not(.expanded) { padding: 0; background: none; border: none; }
  .holo-presetbar {
    position: absolute;
    bottom: 12px;
    right: 12px;
    z-index: 21;
    display: flex;
    gap: 6px;
    align-items: stretch;
  }
  .holo-preset, .holo-tune, .holo-toggle, .holo-panel select, .holo-panel button {
    font-family: system-ui, sans-serif;
    font-size: 11.5px;
    color: #cfe0f5;
    background: rgba(8, 11, 18, 0.78);
    border: 1px solid rgba(120, 180, 255, 0.3);
    border-radius: 6px;
    cursor: pointer;
  }
  .holo-preset { padding: 5px 8px; min-height: 34px; }
  .holo-tune, .holo-toggle { width: 34px; min-height: 34px; font-size: 15px; }
  .holo-tune.on { background: rgba(60, 110, 190, 0.5); }
  /* Momentary toggles read "active" (feature on) normally, dimmed/struck when the GM has turned it off. */
  .holo-toggle.off { color: #7488a0; border-color: rgba(120, 180, 255, 0.15); text-decoration: line-through; }
  .holo-panel {
    position: absolute;
    bottom: 54px;
    right: 12px;
    z-index: 21;
    width: 210px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: rgba(8, 11, 18, 0.9);
    border: 1px solid rgba(120, 180, 255, 0.3);
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 11.5px;
    color: #cfe0f5;
  }
  .holo-panel label { display: flex; flex-direction: column; gap: 3px; }
  .holo-panel .hp-val { color: #8fa8c8; float: right; }
  .holo-panel input[type='range'] { width: 100%; accent-color: #6aa0ff; }
  .holo-panel .hp-check { flex-direction: row; align-items: center; gap: 6px; min-height: 30px; }
  .holo-panel .hp-save { padding: 7px; min-height: 34px; text-align: center; }
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
    .inspector { left: auto; width: var(--insp-w, 340px); top: 0; bottom: 0; max-height: none; border-top: none; border-left: 1px solid rgba(120, 180, 255, 0.35); }
    .insp-resize { display: block; }
  }
  .insp-resize {
    display: none;
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 8px;
    cursor: ew-resize;
    z-index: 2;
    touch-action: none;
  }
  .insp-resize:hover { background: rgba(120, 180, 255, 0.28); }
  .insp-head { display: flex; align-items: baseline; gap: 10px; }
  .insp-title { display: flex; align-items: baseline; gap: 8px; background: none; border: none; color: inherit; padding: 0; cursor: pointer; text-align: left; font: inherit; }
  .insp-head h2 { margin: 0; font-size: 20px; }
  .insp-chevron { display: none; font-size: 13px; opacity: 0.6; transition: transform 0.15s ease; }
  .inspector.expanded .insp-chevron { transform: rotate(180deg); }
  .insp-close { margin-left: auto; background: none; border: none; color: #9fb0c8; font-size: 22px; line-height: 1; cursor: pointer; }
  /* Phone: collapse to name + type; the title toggles the rest. Desktop always shows detail. */
  @media (max-width: 719px) {
    .insp-chevron { display: inline; }
    .inspector:not(.expanded) .insp-sub { margin-bottom: 0; }
    .inspector:not(.expanded) .insp-detail { display: none; }
  }
  .insp-sub { font-size: 11px; letter-spacing: 0.08em; opacity: 0.6; margin: 2px 0 12px; }
  .insp-photo { width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 0 12px; }
  .insp-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; margin: 0; font-size: 13px; }
  .insp-grid dt { opacity: 0.55; }
  .insp-grid dd { margin: 0; text-align: right; }
  .insp-desc { margin-top: 12px; font-size: 13px; line-height: 1.5; font-style: italic; opacity: 0.85; white-space: pre-wrap; }
</style>

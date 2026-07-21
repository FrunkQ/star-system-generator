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
  import { drawHud } from '$lib/catalogue/infoCard';
  import { drawCover } from '$lib/catalogue/coverCard';
  import FilteredCanvas from '$lib/components/FilteredCanvas.svelte';
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
  import { DEFAULT_STYLE, type HoloStyle } from '$lib/holo/holoStyle';
  // Unified player presets: the view is driven by a preset (URL ?preset= on open, then live SYNC_PRESET
  // from the GM's Player Views modal). holoStyleOf + BUILTIN_PRESETS are three-free (only types), so
  // importing them keeps three out of this route's chunk.
  import { BUILTIN_PRESETS, BUILTIN_ASSETS, holoStyleOf, systemStageStyle, accentSolid } from '$lib/player/presets';
  import type { PlayerPreset } from '$lib/player/presetTypes';
  // The unified player-view layers — the preset drives WHICH of these render (cover / starmap module /
  // system module) so a preset is deployed at full fidelity, not mapped onto a legacy skin.
  import CoverView from '$lib/components/CoverView.svelte';
  import { cssFilterApprox } from '$lib/player/cssFilterApprox';
  import FilterFrame from '$lib/components/FilterFrame.svelte';
  import GraphicLayer from '$lib/components/GraphicLayer.svelte';
  import Starmap2DView from '$lib/starmap/Starmap2DView.svelte';
  import Starmap3DView from '$lib/starmap/Starmap3DView.svelte';
  import FilteredListView from '$lib/components/FilteredListView.svelte';
  import FilteredDocumentView from '$lib/components/FilteredDocumentView.svelte';
  import { systemVisualStars } from '$lib/starmap/systemStars';
  import type { ListModel } from '$lib/catalogue/listCanvas';
  import { getClassColor } from '$lib/rendering/colors';
  import { RATE_STEPS, DEFAULT_RATE_INDEX } from '$lib/player/timeRates';
  import { inverseBoxCox } from '$lib/physics/scaling';
  import { perfCount } from '$lib/perfTrace';
  let holoStyle: HoloStyle = { ...DEFAULT_STYLE };
  // Momentary GM overrides — driven by the GM's Player Views modal via SYNC_PRESET (never saved).
  let holoLabelsOn = true;
  let holoFilterBypass = false;
  let holoOrbitPaused = false;
  // Collapse a popover when the user interacts anywhere outside it.
  function clickOutside(node: HTMLElement, cb: () => void) {
    const handler = (e: Event) => { if (!node.contains(e.target as Node)) cb(); };
    document.addEventListener('pointerdown', handler, true);
    return { destroy() { document.removeEventListener('pointerdown', handler, true); } };
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
  let rateIndex = DEFAULT_RATE_INDEX; // default 1 s ≈ 1 h — inner planets visibly move, rings/belts shear
  // The GM's clock (SYNC_TIME heartbeat, 1/s). While following the GM the player view runs on THIS —
  // absolute time and rate — so orbital positions match the GM's map exactly. Projector pattern:
  // advance locally at the GM's rate between heartbeats, snap on >1s drift.
  let gmTime: { currentTime: number; isPlaying: boolean; timeScale: number } | null = null;
  let timeExpanded = false;

  // Interactive-tier selection.
  let focusedBodyId: string | null = null;
  let selectedBody: CelestialBody | null = null;
  // Phone: the body panel opens collapsed (name + type) and expands on a tap of the title.
  // Reset to collapsed whenever the selected body changes so each new tap starts small.
  let bodyExpanded = false;
  let _lastBodyId: string | null = null;
  $: if (selectedBody?.id !== _lastBodyId) { _lastBodyId = selectedBody?.id ?? null; bodyExpanded = false; }
  // Phone vs desktop drives two behaviours: the holo's panel reframe (desktop only — on a phone the
  // collapsed panel is just a name bar) and the panel's × (phone: minimise back to the name bar;
  // desktop: close outright). matchMedia rather than a resize listener: it matches the CSS breakpoint
  // exactly and its change event fires for every viewport change (emulation included).
  const phoneMq = browser ? window.matchMedia('(max-width: 719px)') : null;
  let isPhone = phoneMq?.matches ?? false;

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
  // Short type label for a body row in the system list.
  function bodyTypeLabel(n: any): string {
    if (n.kind === 'construct') return String(n.construct_type || 'Construct').replace(/(^|[-_ ])(\w)/g, (_: string, s: string, c: string) => (s ? ' ' : '') + c.toUpperCase());
    if (isStarNode(n)) return 'Star';
    const r = String(n.roleHint || 'body').replace('-', ' ');
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
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
  // Fresh notes every time the reader MOVES — between systems, in/out of a body focus, or across the
  // cover/starmap/system layers. A fresh funny line each time the view changes (the guide "updates").
  $: rollNotes(`${selectedSystemId}|${focusedBodyId}|${showPresetCover}`);
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

  // --- Unified PlayerPreset deploy (?preset=<id> + live SYNC_PRESET) --------------------------------
  // Guarded/additive: only active once a preset is in play (URL on open, then the GM's Player Views
  // modal drives it live). Maps the preset's system view to a catalogue skin; for the 3D holo it feeds
  // the full holoStyle so it deploys at full fidelity. The GM's momentary overrides (hide labels /
  // suspend filter / pause orbit) come down the same channel. A null broadcast = hold screen.
  // Read the preset id from the URL SYNCHRONOUSLY (not in onMount) so the very first paint already knows
  // a preset is in play — otherwise the default 'guide' skin's DON'T PANIC cover flashes for a frame
  // before the preset resolves.
  let activePresetId: string | null = browser ? new URLSearchParams(window.location.search).get('preset') : null;
  let appliedPresetJson: string | null = null;
  let presetHold = false; // GM closed the view → show a hold screen
  const BUILTIN_THEME: Record<string, ThemeKey> = { guide: 'guide', datapad: 'clean', console: 'console', crt: 'mono', holo: 'holo', projection: 'holo' };
  function applyPlayerPreset(p: PlayerPreset) {
    // themeKey still drives the page chrome (background/status bar); the preset's own layers render on
    // top of it. holoStyle is always derived so a holo3d system view deploys at full fidelity.
    themeKey = BUILTIN_THEME[p.id] ?? (p.systemView === 'holo3d' ? 'holo' : p.systemView === 'list' ? 'guide' : 'console');
    includeConstructs = true;
    holoStyle = holoStyleOf(p);
    if (p.inspectorWidth) inspectorWidth = Math.max(200, Math.min(640, p.inspectorWidth)); // desktop; mobile ignores it
    // Default time: the preset picks the starting rate + play state (ignored while following the GM,
    // whose clock takes over wholesale).
    rateIndex = Math.max(0, Math.min(RATE_STEPS.length - 1, p.defaultRateIndex ?? DEFAULT_RATE_INDEX));
    isPlaying = p.defaultPlaying ?? true;
    selectedBody = null;
  }
  function applyOverrides(ov: import('$lib/broadcast').PresetOverrides) {
    holoLabelsOn = !ov.labelsHidden;
    holoFilterBypass = ov.filterBypass;
    holoOrbitPaused = ov.orbitPaused;
    overrideFollowGM = ov.followGM ?? null;
  }
  let overrideFollowGM: boolean | null = null;
  // Following the GM = the override (if set) else the preset's own followGM flag.
  $: followGMActive = (overrideFollowGM ?? activePreset?.followGM) ?? false;
  // Follow the GM's clock: snap to their absolute time when it drifts (a fresh follow, a GM scrub, or
  // rate change) — between heartbeats the local loop advances at the GM's own timeScale.
  function followTime(t: { currentTime: number; isPlaying: boolean; timeScale: number }) {
    gmTime = t;
    if (!followGMActive) return;
    isPlaying = t.isPlaying;
    if (Math.abs(currentTime - t.currentTime) > 1000) currentTime = t.currentTime;
  }
  // Follow the GM's MANUAL viewport (a pan/zoom of their orrery, not a body focus): mirror it as a
  // ROUGH viewport — the 2D map matches it flat; the 3D holo takes the same shot raised to its tilt.
  // The GM's pan/zoom live in the orrery's render space (Box-Cox-scaled AU under toytown), so convert
  // to TRUE AU here — the holo then maps through its own compression. Auto (FOLLOW) camera messages are
  // ignored: body-follow already rides SYNC_FOCUS and frames with the player's own ladder.
  function followViewport(pan: { x: number; y: number }, zoom: number, isManual: boolean, viewMin?: number) {
    if (!followGMActive || !isManual || !holoView || effectiveSystemTier !== 'holo' || !displaySystem) return;
    if (!(zoom > 0)) return;
    const halfGm = (viewMin ?? 900) / (2 * zoom); // half-extent in the GM's render space
    const factor = (displaySystem as any).toytownFactor || 0;
    let cx = pan.x, cy = pan.y, halfAU = halfGm;
    if (factor > 0) {
      // Same x0 the orrery derives (min orbit a × 0.1) — computable identically from the snapshot.
      const orbitAs = (displaySystem.nodes as any[])
        .filter((n) => (n.kind === 'body' || n.kind === 'construct') && n.orbit?.elements?.a_AU > 0)
        .map((n) => n.orbit.elements.a_AU);
      const x0 = Math.max((orbitAs.length ? Math.min(...orbitAs) : 0.01) * 0.1, 1e-8);
      const rGm = Math.hypot(pan.x, pan.y);
      const rTrue = inverseBoxCox(rGm, factor, x0);
      const k = rGm > 1e-9 ? rTrue / rGm : 1;
      cx = pan.x * k;
      cy = pan.y * k;
      halfAU = inverseBoxCox(rGm + halfGm, factor, x0) - rTrue; // outward half-width — rough is fine
    }
    holoView.setViewportAU(cx, cy, halfAU);
  }

  // Follow the GM: on the GM focusing a body, get past the cover, switch to its system, and frame it —
  // the holo (2D overhead or 3D) frames it the standard way; the list highlights + opens it.
  // The GM's ladder LEVEL (re-clicks / Reset View don't change the focus id, so this is the only
  // signal that the framing changed): focus the body, then take the exact level.
  function followFocusLevel(id: string, level: number) {
    if (!followGMActive || !id) return;
    followFocus(id); // cover/system/selection plumbing
    holoView?.setFocusLevel?.(id, level);
  }

  function followFocus(id: string | null) {
    if (!followGMActive) return;
    if (!id) { focusedBodyId = null; selectedBody = null; return; } // GM cleared focus → unfocus (camera stays)
    coverDismissed = true; // the first real GM click gets past the cover
    const sys = (starmap?.systems ?? []).find((s: any) => (s.system?.nodes ?? []).some((n: any) => n.id === id));
    if (sys && sys.id !== selectedSystemId) selectedSystemId = sys.id;
    focusedBodyId = id;
    selectBodyById(id);
  }
  // Resolve reactively so BOTH `activePresetId` AND `starmap` are tracked dependencies: a freshly
  // opened window sets activePresetId at mount while the starmap is still null, so we must re-resolve
  // (and apply) the moment the campaign's presets arrive — otherwise a custom preset never applies and
  // the window is stuck on the default skin. (resolvePreset() alone hides `starmap` inside a function.)
  $: pendingPreset = activePresetId
    ? (BUILTIN_PRESETS.find((p) => p.id === activePresetId) || (starmap?.playerPresets ?? []).find((p) => p.id === activePresetId) || null)
    : null;
  // Re-apply on CONTENT change, not just id change: saving an edit in the Player Views editor updates
  // the preset in place (same id) and rides the next SYNC_STARMAP — the open window must refresh live.
  $: pendingPresetJson = pendingPreset ? JSON.stringify(pendingPreset) : null;
  $: if (pendingPreset && pendingPresetJson && appliedPresetJson !== pendingPresetJson) {
    appliedPresetJson = pendingPresetJson;
    applyPlayerPreset(pendingPreset);
  }

  // ── Preset-driven rendering (the deployed player view) ─────────────────────────────────────────
  // When a preset is active it OWNS the layers: its cover, its chosen starmap module, its chosen system
  // module, its theme + filter — rather than the legacy skin's fixed UI.
  $: activePreset = pendingPreset;
  // "Players can click / focus / scrub" — false locks the surface: no picking, no camera, no clock,
  // no body picker, list rows not tappable. The view is a display driven by the GM (or its presets).
  $: presetInteractive = activePreset?.interactive !== false;
  $: presetAccent = activePreset ? accentSolid(activePreset.accentColor) : '#6aa0ff';
  $: presetFont = activePreset?.font || 'system-ui';
  // Guide tips: the preset picks off / top / bottom / both; the rolled notes fill the chosen edges.
  $: guideTipsMode = activePreset?.guideTips ?? 'off';
  $: tipTop = guideTipsMode === 'top' || guideTipsMode === 'both' ? topNote : '';
  $: tipBottom = guideTipsMode === 'bottom' || guideTipsMode === 'both' ? bottomNote : '';
  $: tipsOn = !!(tipTop || tipBottom);
  $: tipMono = activePreset?.bodyStyle === 'white';
  // Starmap "list" module, rendered to canvas through the real filter (FilteredListView).
  $: starmapListModel = {
    heading: starmap?.name || 'Known Space',
    rows: (starmap?.systems ?? []).map((node) => ({
      id: node.id,
      title: node.name,
      sub: systemSummary(node),
      dots: systemVisualStars(node.system).map((s) => s.color),
      selectable: true
    }))
  } as ListModel;
  // System "list" module → a canvas body list (real filter). Bodies + constructs, a coloured dot each.
  $: systemListModel = {
    heading: displaySystem?.name || 'System',
    rows: ((displaySystem?.nodes ?? []) as any[])
      .filter((n) => (n.kind === 'body' || n.kind === 'construct') && n.roleHint !== 'ring' && n.roleHint !== 'barycenter' && (includeConstructs || n.kind !== 'construct'))
      .map((n) => ({
        id: n.id,
        title: String(n.name ?? ''),
        sub: bodyTypeLabel(n),
        dots: [getClassColor(n)],
        selectable: true
      }))
  } as ListModel;
  function selectBodyById(id: string) {
    const n = (displaySystem?.nodes ?? []).find((x: any) => x.id === id) as CelestialBody | undefined;
    selectedBody = n && (n.kind === 'body' || n.kind === 'construct') ? n : null;
    bodyExpanded = false;
  }
  // The info panel eats the right edge of the holo stage on desktop/tablet, so the scene reframes
  // gently around the remaining strip while it's open (a phone panel is just a name bar — no reframe).
  $: holoPanelInset = !isPhone && selectedBody && !activePreset?.hideInfoPanel ? inspectorWidth : 0;
  $: presetAssets = [...BUILTIN_ASSETS, ...(starmap?.playerAssets ?? [])];
  // A DOM-layer filter (cover / list / 2D) — the holo3d modules run the real GLSL shader themselves.
  $: presetFilterActive = !!activePreset && activePreset.filter !== 'none' && !holoFilterBypass;
  $: presetFilterId = presetFilterActive ? activePreset!.filter : 'none';
  $: presetFilterParams = activePreset?.filterParams;
  // The body info block is DOM over the holo canvas, so the GLSL shader can't reach it. Give it the
  // matched CSS approximation so it reads as part of the same filtered surface (static — just a style).
  $: inspFx = presetFilterActive ? cssFilterApprox(presetFilterId, presetFilterParams) : null;
  $: infoFontScale = activePreset?.infoFontScale ?? 1;
  // HOLO info block goes through the REAL GPU filter: draw the (static) card to a canvas and composite
  // it into the holo render as a HUD quad, so it warps/rolls/tints with the shader. Only when the holo
  // view is filtered — otherwise the normal DOM inspector shows (no filter needed). The DOM inspector is
  // kept underneath (invisible) purely for its buttons.
  let hudW = 0, hudH = 0;
  $: hudMx = Math.round(hudW * 0.035);
  $: hudMy = Math.round(hudH * 0.045);
  // Preload the per-screen overlay bitmap (asset dataUrls are same-origin, so no WebGL taint).
  let overlayImg: HTMLImageElement | null = null;
  $: overlayAsset = activePreset?.systemOverlay ? presetAssets.find((a) => a.id === activePreset.systemOverlay!.assetId) : null;
  $: if (browser && overlayAsset) {
    const im = new Image();
    im.onload = () => { if (overlayAsset && im.src.endsWith(overlayAsset.dataUrl.slice(-24))) overlayImg = im; };
    im.src = overlayAsset.dataUrl;
  } else { overlayImg = null; }
  // Starmap overlay bitmap (its own image — the starmap/list surfaces composite it INTO the real filter).
  let starmapOverlayImg: HTMLImageElement | null = null;
  $: starmapOverlayAsset = activePreset?.starmapOverlay ? presetAssets.find((a) => a.id === activePreset.starmapOverlay!.assetId) : null;
  $: if (browser && starmapOverlayAsset) {
    const im = new Image();
    im.onload = () => { if (starmapOverlayAsset && im.src.endsWith(starmapOverlayAsset.dataUrl.slice(-24))) starmapOverlayImg = im; };
    im.src = starmapOverlayAsset.dataUrl;
  } else { starmapOverlayImg = null; }
  // Resolved {img, placement} overlays for the gfx surfaces (null until the image has loaded).
  $: starmapOverlayHud = starmapOverlayImg && activePreset?.starmapOverlay ? { img: starmapOverlayImg, placement: activePreset.starmapOverlay } : null;
  $: systemOverlayHud = overlayImg && activePreset?.systemOverlay ? { img: overlayImg, placement: activePreset.systemOverlay } : null;
  // The info card is desktop-only (phones keep the bottom-sheet DOM inspector); the overlay filters at any size.
  $: hudCardOn = effectiveSystemTier === 'holo' && !!selectedBody && presetFilterActive && hudW >= 720 && !activePreset?.hideInfoPanel;
  $: hudOverlayOn = effectiveSystemTier === 'holo' && !!activePreset?.systemOverlay && !!overlayImg; // HUD renders it whether or not a filter is active (the quad is part of the scene)
  // Tips ride the same HUD quad, and render even without the filter (the quad is part of the holo render).
  $: hudTipsOn = effectiveSystemTier === 'holo' && tipsOn && hudW > 0;
  $: hudActive = (hudCardOn || hudOverlayOn || hudTipsOn) && hudW > 0;
  $: hudCanvas = hudActive
    ? drawHud({
        viewW: hudW, viewH: hudH,
        overlay: hudOverlayOn && overlayImg && activePreset?.systemOverlay ? { img: overlayImg, placement: activePreset.systemOverlay } : null,
        card: hudCardOn && selectedBody ? {
          panelW: inspectorWidth,
          title: selectedBody.name,
          sub: selectedBody.roleHint || 'body',
          facts: bodyFacts(selectedBody, units, tempUnit),
          description: selectedBody.description || '',
          accent: presetAccent, font: presetFont, fontScale: infoFontScale,
          mono: activePreset?.bodyStyle === 'white'
        } : null,
        tips: hudTipsOn ? { top: tipTop, bottom: tipBottom, accent: presetAccent, font: presetFont, mono: tipMono } : null
      })
    : null;
  // The system level reuses the existing console/holo/doc stages; pick which by the preset's systemView.
  // The "2D map" is now the holo renderer LOCKED OVERHEAD + flat/unlit — a real top-down view that goes
  // through the same GPU filter and picking, instead of a separate SVG orrery + CSS approximation.
  $: effectiveSystemTier = activePreset
    ? (activePreset.systemView === 'holo3d' ? 'holo' : activePreset.systemView === 'diagram2d' ? 'holo' : 'static')
    : theme.tier;
  $: system2dOverhead = !!activePreset && activePreset.systemView === 'diagram2d';
  // WS2 Guide document: the interactive canvas document (schematic + in-page info block + navigator),
  // drawn by the block-model engine through the real filter. Falls under the 'static' tier (no 3D scene).
  $: systemDoc = !!activePreset && activePreset.systemView === 'document';
  $: docImagery = activePreset ? (activePreset.bodyGfx === 'photo' ? 'photo' : activePreset.bodyGfx === 'none' ? 'none' : 'disc') : 'none';
  $: docColorful = activePreset?.accentColor === 'rainbow';
  // 2D map = the holo locked overhead + flat. `whole` is NOT forced: with it off, tapping a body frames
  // (zooms) it just like the GM's orrery; a preset can still tick "Frame whole system" for a fixed plan view.
  // What the system stage renders with (the 2D map = the holo locked flat). Shared with the editor
  // preview via systemStageStyle, so the preview always shows exactly what players get.
  $: systemHoloStyle = activePreset ? systemStageStyle(activePreset, holoStyle) : holoStyle;
  // Cover through the REAL filter: draw it to a canvas + a FilteredCanvas surface (the cover has no 3D
  // scene behind it, so it gets its own GPU-filtered quad instead of a CSS approximation).
  let coverW = 0, coverH = 0;
  let coverGraphicImg: HTMLImageElement | null = null;
  $: coverGraphicAsset = activePreset?.cover?.graphic ? presetAssets.find((a) => a.id === activePreset.cover.graphic!.assetId) : null;
  $: if (browser && coverGraphicAsset) {
    const im = new Image(); im.onload = () => { coverGraphicImg = im; }; im.src = coverGraphicAsset.dataUrl;
  } else { coverGraphicImg = null; }
  $: coverFiltered = presetFilterActive && coverW > 0;
  $: coverCanvas = coverFiltered && activePreset
    ? drawCover({ viewW: coverW, viewH: coverH, cover: activePreset.cover, accent: activePreset.accentColor, font: presetFont, companyName: activePreset.companyName, footerText: activePreset.footerText,
        graphic: coverGraphicImg && activePreset.cover.graphic ? { img: coverGraphicImg, placement: activePreset.cover.graphic } : null,
        tips: tipsOn ? { top: tipTop, bottom: tipBottom } : null })
    : null;

  // Cover: show once per preset until the player taps through.
  let coverDismissed = false;
  let coverForId: string | null = null;
  $: if (activePreset?.cover?.enabled && coverForId !== activePreset.id) { coverForId = activePreset.id; coverDismissed = false; }
  $: showPresetCover = !!activePreset?.cover?.enabled && !coverDismissed && !!starmap && !presetHold;
  // Starmap disabled → players skip straight to the (first) system, no back-to-systems navigation.
  $: if (activePreset && activePreset.starmapEnabled === false && starmap?.systems?.length && !selectedSystemId) {
    selectedSystemId = starmap.systems[0].id;
  }

  function startClock() {
    if (!browser) return;
    let last = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - last) / 1000;
      // Following the GM: run at THEIR rate so positions match their map (heartbeats snap any drift).
      // Otherwise the player's own arbitrary clock.
      const rate = followGMActive && gmTime ? gmTime.timeScale : RATE_STEPS[rateIndex].sec;
      if (isPlaying) currentTime += dt * rate * 1000;
      last = ts;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function handleFocus(e: CustomEvent<string | null>) {
    if (e.detail) pushNavStep(); // each tap drills IN — give Back something to step out of
    focusedBodyId = e.detail;
    const node = displaySystem?.nodes.find((n) => n.id === e.detail);
    // Surface natural bodies and artificial constructs alike (both are CelestialBody-shaped);
    // barycenters have no player-facing file, so they just clear the inspector.
    selectedBody = node && (node.kind === 'body' || node.kind === 'construct') ? (node as CelestialBody) : null;
  }

  // ── Browser Back walks back UP the view hierarchy ──────────────────────────────────────────────
  // Drilling in is a sequence of steps (system → body → deeper ladder levels), so Back should undo them
  // one at a time — the ladder's own inverse first, then unfocus, then out to the starmap — and only
  // leave the page once there's nothing left to step out of. Every forward step pushes one entry.
  let holoView: HoloView;
  function pushNavStep() {
    if (browser) history.pushState({ sseNav: true }, '');
  }
  function onPopState() {
    if (holoView?.stepFocusUp?.()) return; // out one ladder level (level 3 → 2 → 1)
    if (focusedBodyId) { focusedBodyId = null; selectedBody = null; return; } // drop the focus
    if (selectedSystemId && activePreset?.starmapEnabled !== false) { selectedSystemId = null; selectedBody = null; return; } // back to the starmap
    // Nothing left to step out of — the browser has already navigated away.
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
    activePresetId = params.get('preset');
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
      (id) => followFocus(id), // GM focus → follow (only acts when followGMActive)
      (pan, zoom, isManual, viewMin) => followViewport(pan, zoom, isManual, viewMin), // GM manual pan/zoom → rough viewport
      () => {},
      (t) => followTime(t), // GM clock → inherited wholesale while following (absolute time + rate)
      () => {},
      () => {},
      sessionId
    );
    window.addEventListener('popstate', onPopState);
    broadcastService.onFocusLevelUpdate = (p) => followFocusLevel(p.id, p.level);
    broadcastService.onStarmapUpdate = (map) => {
      perfCount('sync.starmap'); // each one re-clones the campaign + rebuilds the scene — track it
      starmap = map;
      lastUpdate = Date.now();
      connected = true;
    };
    broadcastService.onBrandingUpdate = (b) => { branding = b || { name: '', logo: null }; };
    // A preset owns the view; ignore the GM's classic guide-config in that mode.
    broadcastService.onGuideConfigUpdate = (c) => { if (c && !activePresetId) applyGuideConfig(c); };
    // Live GM control (Player Views modal): switch preset, apply overrides, or hold (null).
    broadcastService.onPresetUpdate = (p) => {
      if (!p) { presetHold = true; return; }
      presetHold = false;
      activePresetId = p.presetId;
      if (p.overrides) applyOverrides(p.overrides);
    };
    broadcastService.sendMessage({ type: 'REQUEST_STARMAP', payload: sessionId });
    phoneMq?.addEventListener('change', onPhoneMq);
    startClock();
  });

  const onPhoneMq = () => (isPhone = phoneMq?.matches ?? false);

  onDestroy(() => {
    broadcastService.close();
    phoneMq?.removeEventListener('change', onPhoneMq);
    if (browser) { cancelAnimationFrame(rafId); window.removeEventListener('popstate', onPopState); }
  });
</script>

<svelte:head>
  <title>{selectedSystemNode?.name ?? starmap?.name ?? 'Field Guide'} — Catalogue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
</svelte:head>

<!-- The body info panel — shared by the holo/console tier AND the text-list tier (tap a body → its file). -->
{#snippet inspectorAside()}
  {#if selectedBody}
    <aside class="inspector" class:expanded={bodyExpanded} class:filtered={!!inspFx && !hudCardOn} class:hud-hidden={hudCardOn}
      style="--insp-w:{inspectorWidth}px; font-size:{Math.round(13 * infoFontScale)}px; filter:{inspFx && !hudCardOn ? inspFx.containerFilter : 'none'}; {activePreset ? `font-family:${presetFont};` : ''} {hudCardOn ? `right:${hudMx}px; top:${hudMy}px; bottom:${hudMy}px;` : ''}">
      {#if inspFx && !hudCardOn}
        {#if inspFx.tint}<div class="insp-fx-tint" style="background:{inspFx.tint}; opacity:{Math.min(0.9, inspFx.tintOpacity)}"></div>{/if}
        {#if inspFx.scanlineIntensity > 0}<div class="insp-fx-scan" style="opacity:{inspFx.scanlineIntensity * 0.6}; background-size:100% {inspFx.scanlineWidth}px"></div>{/if}
      {/if}
      <div class="insp-resize" on:pointerdown={startInspectorResize} role="separator" aria-orientation="vertical" aria-label="Resize panel"></div>
      <div class="insp-head">
        <button class="insp-title" on:click={() => (bodyExpanded = !bodyExpanded)} aria-expanded={bodyExpanded} title="Show details">
          <h2>{selectedBody.name}</h2>
          <span class="insp-chevron" aria-hidden="true">▾</span>
        </button>
        <!-- Phone: × only MINIMISES back to the name bar (tap the title to reopen) — closing outright
             left no way back to the data until another body was selected. Desktop closes as before. -->
        <button class="insp-close" on:click={() => { if (isPhone) bodyExpanded = false; else selectedBody = null; }} aria-label={isPhone ? 'Minimise' : 'Close'}>×</button>
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
  {/if}
{/snippet}

<main class="catalogue tint-{theme.tint} skin-{themeKey}" class:interactive={theme.tier === 'interactive'} class:crt-invert={theme.tint === 'mono' && $crtControls.invert} style="--mono:{MONO_COLORS[monoColor].hex}; {crtStyle}">
  {#if presetHold}
    <!-- GM closed the live view: a calm hold screen until they open one again. -->
    <div class="hold-screen">
      <div class="hold-badge">{branding.name || 'STANDBY'}</div>
      <h1>Please stand by</h1>
      <p>The GM has paused the display.</p>
    </div>
  {/if}
  {#if showPresetCover && activePreset}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="preset-cover" role="button" tabindex="0" bind:clientWidth={coverW} bind:clientHeight={coverH}
      on:click={() => (coverDismissed = true)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') coverDismissed = true; }}>
      {#if coverCanvas}
        <!-- Filtered: the cover is drawn to a canvas and run through the REAL GPU shader (warp/roll/tint). -->
        <FilteredCanvas source={coverCanvas} filterId={presetFilterId} filterParams={presetFilterParams ?? {}} />
      {:else}
        <CoverView cover={activePreset.cover} accentColor={activePreset.accentColor} font={presetFont}
          companyName={activePreset.companyName} footerText={activePreset.footerText} assets={presetAssets} />
      {/if}
      <span class="preset-cover-hint">tap to enter</span>
    </div>
  {/if}
  <!-- Device status bar -->
  <header class="statusbar" style={activePreset ? `font-family:${presetFont}` : ''}>
    {#if selectedSystemId && !(activePreset && activePreset.starmapEnabled === false)}
      <button class="back-btn" on:click={() => { selectedSystemId = null; selectedBody = null; }} title="Back to all systems">‹ Systems</button>
    {/if}
    {#if branding.logo}<img class="brand-logo" src={branding.logo} alt="" />{/if}
    {#if branding.name}<span class="brand-name">{branding.name}</span>{/if}
    <span class="sys-name">{selectedSystemNode ? selectedSystemNode.name.toUpperCase() : (starmap ? (starmap.name || 'STARMAP').toUpperCase() : 'NO SIGNAL')}</span>
    <span class="status" class:live={connected} class:offline={!connected}>
      {#if connected}● LIVE{:else}○ GM OFFLINE — last {nowLabel}{/if}
    </span>
  </header>

  {#if themeKey === 'guide' && !guideCoverDismissed && !activePresetId}
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

  {#if themeKey === 'guide' && (selectedSystemNode || starmap) && !activePreset}
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
  {:else if !selectedSystemId && activePreset && activePreset.starmapEnabled}
    <!-- Starmap level, PRESET-DRIVEN: the chosen module (text list / 2D / 3D), tap a system to enter. -->
    <div class="preset-stage" class:frozen={!presetInteractive} style="font-family:{presetFont}; --accent:{presetAccent}">
      {#if activePreset.starmapView === 'holo3d' || activePreset.starmapView === 'diagram2d'}
        <!-- 3D (or 2D = the same renderer LOCKED OVERHEAD): real GLSL filter + raycast selection. -->
        <Starmap3DView {starmap} accentColor={presetAccent} font={presetFont} grid={activePreset.grid}
          background={activePreset.background} angleDeg={activePreset.starmapView === 'diagram2d' ? 0 : activePreset.angleDeg}
          labelSize={activePreset.labelSize}
          filter={presetFilterActive ? activePreset.filter : 'none'} filterParams={activePreset.filterParams}
          tipTop={tipTop} tipBottom={tipBottom} tipMono={tipMono} routeGlow={activePreset.starmapRouteGlow} mono={activePreset.starmapMono}
          overlay={starmapOverlayHud} mapGrid={starmap?.mapGrid ?? null}
          flat={activePreset.starmapView === 'diagram2d'}
          lockRotation={activePreset.starmapView === 'diagram2d' && activePreset.lockRotation !== false}
          selectable={presetInteractive} on:select={(e) => { pushNavStep(); selectedSystemId = e.detail; selectedBody = null; }} />
      {:else}
        <!-- Text list rendered to canvas + the REAL GPU filter (no CSS fake), still tap-to-select + scroll. -->
        <FilteredListView model={starmapListModel} accent={presetAccent} font={presetFont} mono={tipMono}
          filterId={presetFilterId} filterParams={presetFilterParams ?? {}}
          tips={tipsOn ? { top: tipTop, bottom: tipBottom } : null} overlay={starmapOverlayHud}
          selectable={presetInteractive} on:select={(e) => { pushNavStep(); selectedSystemId = e.detail; selectedBody = null; }} />
      {/if}
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
              <button class="explore-btn" on:click={() => { pushNavStep(); selectedSystemId = previewNode.id; previewSystemId = null; selectedBody = null; }}>Explore system →</button>
            </section>
          {:else}
            <p class="sm-hint">Tap a system to preview it, then explore.</p>
          {/if}
        {/if}
      </div>
    </div>
  {:else if effectiveSystemTier === 'interactive' || effectiveSystemTier === 'holo'}
    <!-- Hi-tech: live orbital map (2D console or 3D holo table) + tap-to-inspect -->
    <div class="console-stage" class:frozen={!presetInteractive} bind:clientWidth={hudW} bind:clientHeight={hudH} style={activePreset ? `font-family:${presetFont}` : ''}>
      {#if rulePack && displaySystem}
        {#if effectiveSystemTier === 'holo'}
          <HoloView bind:this={holoView} system={displaySystem} {currentTime} {focusedBodyId} style={systemHoloStyle} labelsVisible={holoLabelsOn} filterBypass={holoFilterBypass} orbitPaused={holoOrbitPaused} {hudCanvas} viewInsetRight={holoPanelInset} on:focus={handleFocus} />
        {:else}
          <FilterFrame filterId={presetFilterId} params={presetFilterParams} active={presetFilterActive}>
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
          </FilterFrame>
        {/if}
      {/if}
      {#if activePreset?.systemOverlay && !hudOverlayOn}
        <div class="overlay-wrap"><FilterFrame filterId={presetFilterId} params={presetFilterParams} active={presetFilterActive}>
          <GraphicLayer placement={activePreset.systemOverlay} assets={presetAssets} />
        </FilterFrame></div>
      {/if}
      <!-- Body selector: the same compact command-strip picker the main app uses (chip + search +
           category drill-in), so it's tiny on mobile and needs no new learning. Replaces the old
           full-height jump list. -->
      {#if displaySystem && presetInteractive}
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
           slider (arbitrary — just to see movement). Hidden while following the GM (time is INHERITED
           from the GM's clock — positions match their map) and on non-interactive presets. -->
      {#if presetInteractive && !followGMActive}
        <div class="time-controls" class:expanded={timeExpanded} use:clickOutside={() => (timeExpanded = false)}>
          {#if timeExpanded}
            <button class="tc-btn" on:click={() => (isPlaying = !isPlaying)} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '❚❚' : '▶'}</button>
            <input class="tc-slider" type="range" min="0" max={RATE_STEPS.length - 1} step="1" bind:value={rateIndex} aria-label="Time rate" />
            <span class="tc-rate">1 s ≈ {RATE_STEPS[rateIndex].label}</span>
          {:else}
            <button class="tc-btn tc-icon" on:click={() => (timeExpanded = true)} aria-label="Time controls" title="Time controls">{isPlaying ? '❚❚' : '▶'}</button>
          {/if}
        </div>
      {/if}
      {#if selectedBody && !activePreset?.hideInfoPanel}
        {@render inspectorAside()}
      {:else if !selectedBody && !activePreset?.hideInfoPanel}
        <div class="console-hint">Tap a world to read its file.</div>
      {/if}
    </div>
  {:else if systemDoc}
    <!-- WS2 Guide document: the interactive canvas document (schematic + in-page body file + navigator),
         drawn by the block-model engine and wrecked by the real filter. The info block is PART OF THE
         PAGE, so there's no separate DOM inspector — tapping a world (on the chart or a navigator row)
         drills straight in. -->
    <div class="preset-stage preset-doc" class:frozen={!presetInteractive} style="font-family:{presetFont}; --accent:{presetAccent}">
      {#if displaySystem}
        <FilteredDocumentView
          system={displaySystem} selectedId={selectedBody?.id ?? null}
          font={presetFont} accent={presetAccent} mono={activePreset.bodyStyle === 'white'}
          colorful={docColorful} imagery={docImagery} hideInfoBlock={activePreset.hideInfoPanel}
          listStyle={activePreset.listStyle} documentStyle={activePreset.documentStyle} tagStyle={activePreset.tagStyle} themeColors={activePreset.themeColors}
          fontScale={infoFontScale}
          filterId={presetFilterId} filterParams={presetFilterParams ?? {}}
          units={units} tempUnit={tempUnit}
          tips={tipsOn ? { top: tipTop, bottom: tipBottom } : null} overlay={systemOverlayHud}
          companyName={activePreset.companyName} footerText={activePreset.footerText}
          selectable={presetInteractive}
          on:select={(e) => selectBodyById(e.detail)} />
      {/if}
    </div>
  {:else if activePreset}
    <!-- Preset text-list system view: a canvas-rendered body list through the REAL filter (no CSS fake),
         tap a body to open its file in the shared inspector. -->
    <div class="preset-stage preset-doc" class:frozen={!presetInteractive} style="font-family:{presetFont}; --accent:{presetAccent}">
      <FilteredListView model={systemListModel} accent={presetAccent} font={presetFont} mono={activePreset.bodyStyle === 'white'}
        filterId={presetFilterId} filterParams={presetFilterParams ?? {}}
        tips={tipsOn ? { top: tipTop, bottom: tipBottom } : null} overlay={systemOverlayHud}
        selectable={presetInteractive} selectedId={selectedBody?.id ?? null}
        on:select={(e) => selectBodyById(e.detail)} />
      {#if !activePreset.hideInfoPanel}{@render inspectorAside()}{/if}
    </div>
  {:else}
    <!-- Lo-fi / datapad / Guide: diagrammatic browser — clickable layout + a body panel. -->
    <div class="doc-scroll">
      <CatalogueBrowser system={displaySystem} {includeConstructs} {units} {tempUnit} colorful={themeKey === 'guide'}
        imagery={themeKey === 'guide' ? 'disc' : themeKey === 'clean' ? 'photo' : 'none'} />
    </div>
  {/if}

  {#if themeKey === 'guide' && starmap && bottomNote && !activePreset}
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

  .hold-screen {
    position: absolute; inset: 0; z-index: 500;
    background: radial-gradient(ellipse at center, #0b1119 0%, #05070c 75%);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
    text-align: center; color: #cfd6e4;
  }
  .hold-screen h1 { margin: 0; font-size: clamp(1.6rem, 5vw, 3rem); letter-spacing: 0.06em; }
  .hold-screen p { margin: 0; opacity: 0.6; }
  .hold-badge { font-size: 0.72rem; letter-spacing: 0.28em; text-transform: uppercase; opacity: 0.5; margin-bottom: 0.4rem; }

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

  /* Preset-driven layers (deployed player view). */
  .preset-stage { flex: 1; position: relative; min-height: 0; overflow: hidden; }
  /* Non-interactive preset ("Players can click / focus / scrub" off): the surface is a locked display —
     no picking, no camera orbit/pan/zoom, no scrolling. The GM drives it (follow / preset switches). */
  .frozen { pointer-events: none; }
  .preset-doc { position: relative; }
  .overlay-wrap { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .preset-cover { position: absolute; inset: 0; z-index: 60; cursor: pointer; background: #05070c; }
  .preset-cover-hint { position: absolute; bottom: 6%; left: 0; right: 0; text-align: center; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.6; color: #cfd6e4; pointer-events: none; }
  /* Filter approximation laid over the body info block so it reads as part of the filtered surface. */
  /* The holo view draws the info card INTO the filtered render (a HUD quad), so the DOM panel is kept
     only for its buttons: invisible but still interactive (close / resize / mobile toggle). */
  .inspector.hud-hidden { opacity: 0; }
  .insp-fx-tint { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color; z-index: 5; }
  .insp-fx-scan { position: absolute; inset: 0; pointer-events: none; z-index: 5; background-image: repeating-linear-gradient(to bottom, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 100%); }
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
  /* The title button fills the whole row so the toggle target is "anywhere on the title", not just the text. */
  .insp-title { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; gap: 8px; background: none; border: none; color: inherit; padding: 0; cursor: pointer; text-align: left; font: inherit; }
  .insp-head h2 { margin: 0; font-size: 20px; }
  .insp-chevron { display: none; font-size: 13px; opacity: 0.6; transition: transform 0.15s ease; }
  .inspector.expanded .insp-chevron { transform: rotate(180deg); }
  .insp-close { margin-left: auto; background: none; border: none; color: #9fb0c8; font-size: 22px; line-height: 1; cursor: pointer; }
  /* Phone: collapse to name + type; the title toggles the rest. Desktop always shows detail. */
  @media (max-width: 719px) {
    .insp-chevron { display: inline; }
    /* A comfortable full-width tap target on the collapsed bar (padding kept inside the row height). */
    .insp-title { padding: 10px 0; margin: -10px 0; }
    .inspector:not(.expanded) .insp-sub { margin-bottom: 0; }
    .inspector:not(.expanded) .insp-detail { display: none; }
    /* Collapsed = just the name bar; the × (minimise) only makes sense while expanded. */
    .inspector:not(.expanded) .insp-close { display: none; }
  }
  .insp-sub { font-size: 11px; letter-spacing: 0.08em; opacity: 0.6; margin: 2px 0 12px; }
  .insp-photo { width: 100%; height: auto; border-radius: 6px; display: block; margin: 0 0 12px; }
  .insp-grid { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; margin: 0; font-size: 13px; }
  .insp-grid dt { opacity: 0.55; }
  .insp-grid dd { margin: 0; text-align: right; }
  .insp-desc { margin-top: 12px; font-size: 13px; line-height: 1.5; font-style: italic; opacity: 0.85; white-space: pre-wrap; }
</style>

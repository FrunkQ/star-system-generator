<script lang="ts">
  // THE PLAYER VIEW — the player-facing, GM-curated, live-synced window onto the campaign.
  // It renders the redacted snapshot the GM broadcasts (computePlayerSnapshot over SYNC_SYSTEM /
  // SYNC_STARMAP), and WHAT it renders is decided entirely by a PlayerPreset: its cover, its starmap
  // module, its system module, its theme, its filter. One engine, many named looks.
  //
  // A42 (v2.1.702): the legacy skin registry that used to live here is GONE. There were once five
  // hard-coded "skins" (mono / guide / clean / console / holo) chosen by the GM's Field Guide
  // launcher and pushed over SYNC_GUIDECONFIG, plus a separate /projector window. Every one of them
  // is now a preset of this engine - see presets.ts, where `guide`, `datapad`, `console`, `crt`,
  // `holo` and `projection` are the same six looks rebuilt from one code path. There is no
  // preset-less path through this page any more: with no ?preset= the shipped Guide is used.
  import { onMount, onDestroy, beforeUpdate, afterUpdate } from 'svelte';
  // The category list resolves a highlighted tag's colour and label. `mapHighlights` here comes off the
  // BROADCAST (see the SYNC_PRESET handler), not off a local store — this window may be the player's.
  import { tagCategories } from '$lib/tags/tagCategories';
  import { applyTagStyles, tagCategoriesFromSnapshot } from '$lib/tags/tagStyleSync';
  import { transitionRegistry } from '$lib/transitions/TransitionRegistry';
  import { browser } from '$app/environment';
  import { broadcastService } from '$lib/broadcast';
  import { isAllowedEmbedOrigin } from '$lib/embedOrigins';
  import { parseIceParam } from '$lib/iceConfig';
  import { setModelFetcher, modelArrived } from '$lib/constructs/modelFetch';
  import { importEmbeddedModels } from '$lib/constructs/modelTransfer';
  import { calculateFullConstructSpecs } from '$lib/construct-logic';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { bodyFacts } from '$lib/catalogue/bodyFacts';
  import { buildGuideDocument } from '$lib/catalogue/document/guideDocument';
  import { skyStarsFor, magnitudeLimitFor } from '$lib/map/skyStars';
  import { makeDocTheme } from '$lib/catalogue/document/documentStyles';
  import { drawHud } from '$lib/catalogue/infoCard';
  import { drawCover } from '$lib/catalogue/coverCard';
  import FilteredCanvas from '$lib/components/FilteredCanvas.svelte';
  import HoloView from '$lib/holo/HoloView.svelte';
  import BodyPicker from '$lib/components/BodyPicker.svelte';
  import { AU_KM } from '$lib/constants';
  import { migrateUnitPrefs, type UnitPrefs } from '$lib/units';
  import { unitPrefs as unitPrefsStore, unitPrefsLocked } from '$lib/unitPrefsStore';
  import { randomGuideNote } from '$lib/catalogue/guideNotes';
  import type { System, RulePack, CelestialBody, Starmap } from '$lib/types';

  // The view is campaign-wide: the GM broadcasts the whole redacted starmap; the player browses
  // systems and drills into one. (Systems whose main star is hidden never arrive — see
  // computePlayerStarmapSnapshot.)
  let starmap: Starmap | null = null;
  let selectedSystemId: string | null = null;
  let branding: { name: string; logo: string | null } = { name: '', logo: null };
  let rulePack: RulePack | null = null;
  let sessionId: string | null = null;

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
  import Starmap3DView from '$lib/starmap/Starmap3DView.svelte';
  import FilteredListView from '$lib/components/FilteredListView.svelte';
  import QuoteInterstitial from '$lib/catalogue/QuoteInterstitial.svelte';
  import DocPanel from '$lib/components/DocPanel.svelte';
  import FilteredDocumentView from '$lib/components/FilteredDocumentView.svelte';
  import { starsOf, dominantOf } from '$lib/catalogue/document/systemTopology';
  import type { ListModel } from '$lib/catalogue/listCanvas';
  import { getClassColor } from '$lib/rendering/colors';
  import { RATE_STEPS, DEFAULT_RATE_INDEX } from '$lib/player/timeRates';
  import { unixMsToMasterSeconds, resolveCalendar } from '$lib/temporal/utre';
  import { inverseBoxCox } from '$lib/physics/scaling';
  import { perfCount } from '$lib/perfTrace';
  let holoStyle: HoloStyle = { ...DEFAULT_STYLE };
  // Momentary GM overrides — driven by the GM's Player Views modal via SYNC_PRESET (never saved).
  let holoLabelsOn = true;
  let holoOrbitLinesOn = true; // G5 momentary override; never persisted (A53)
  let holoFilterBypass = false;
  let holoOrbitPaused = false;
  // Collapse a popover when the user interacts anywhere outside it.
  function clickOutside(node: HTMLElement, cb: () => void) {
    const handler = (e: Event) => { if (!node.contains(e.target as Node)) cb(); };
    document.addEventListener('pointerdown', handler, true);
    return { destroy() { document.removeEventListener('pointerdown', handler, true); } };
  }
  let lastUpdate: number | null = null;
  let connected = false;
  // Liveness (vtt-integration-design 9.1/1D): `connected` is now DERIVED from the age of the last
  // frame heard from the GM (heartbeat every 5 s), so it goes back to OFFLINE when the GM stops —
  // it used to latch true on the first snapshot and never fall.
  let lastHeardAt = 0;
  let livenessTimer: ReturnType<typeof setInterval> | null = null;
  // Embed mode (design 9.1/1C): a host app (Mappadux StarMap, a VTT shim) frames this page and owns
  // the surrounding chrome, so the device status bar is hidden and a small parent postMessage
  // command set is enabled. Content, hold screen and waiting states are untouched.
  let embedMode = false;
  // Transport verdict from the guest side: true when STUN and every TURN candidate failed —
  // no direct or relayed path (usually a network that blocks UDP with no turns:443 relay).
  let linkBlocked = false;

  // A63: something big is on its way. The GM announces immediately before sending a starmap, and the
  // channel is ordered, so this always lands first. It is a HOLDING state, not progress — the parse
  // that follows blocks the main thread in one go, so nothing can animate through it. What it kills
  // is the reload temptation, which is the reported harm.
  let receiving: { systems: number; approxBytes?: number } | null = null;
  let receivingTimer: ReturnType<typeof setTimeout> | null = null;
  function clearReceiving() {
    if (receivingTimer) { clearTimeout(receivingTimer); receivingTimer = null; }
    receiving = null;
  }
  // "27 systems, ~5 MB" reads better than either alone, and the size is often absent (the first
  // joiner announces before the GM has ever sent one, so there is nothing measured to quote).
  $: receivingLabel = receiving
    ? `Receiving the starmap — ${receiving.systems} ${receiving.systems === 1 ? 'system' : 'systems'}`
      + (receiving.approxBytes ? `, ~${formatApproxBytes(receiving.approxBytes)}` : '')
      + '…'
    : '';
  function formatApproxBytes(n: number): string {
    return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  $: selectedSystemNode = starmap?.systems.find((s) => s.id === selectedSystemId) || null;

  // ANCHOR THE LOCAL CLOCK TO GAME TIME (RENDER-S18). This surface opens at `Date.now()`, but
  // everything the GM publishes about a ship - a burn window, a route's start and end - is stamped in
  // GAME-clock milliseconds. Measured in the field: a local clock at 5 Nov 2025 against a route
  // window opening 1 Jan 2026, so the route line was fully built, tessellated and correct, and hidden
  // because the clock was two months short of it. The drive plume was dark for the same reason, which
  // is why it read as a redaction fault for weeks - POSITIONS SURVIVE A WRONG EPOCH (a construct in
  // transit is placed by a stamped vector, not by the clock), so nothing else looks wrong.
  //
  // WHERE "NOW" COMES FROM, in order, and why it is not simply `epochT0`:
  //   1. The GM's own clock if a heartbeat has arrived. It is the definition of game time.
  //   2. Else the newest `vector_epoch_ms` on a construct. The GM's reconcile tick stamps it with
  //      THEIR clock every time it places a ship, and it rides every snapshot - so any system with
  //      traffic carries the GM's current time whether or not the session is following them.
  //   3. Else `epochT0`, which is the system's REFERENCE epoch and not its now - the GM scrubs
  //      forward from it, so it can be years adrift. A last resort, not the answer.
  // Anchoring is one-shot per system: it fixes the CALENDAR, and the local clock then runs at its
  // own rate from there. Deliberately NOT skipped while following the GM - "following" only means a
  // heartbeat will snap it later, and until the first one arrives the view is in the wrong year.
  let clockAnchoredFor: string | null = null;
  function gameNowOf(sys: any): number | null {
    let stamp: number | null = null;
    for (const n of sys?.nodes ?? []) {
      const t = (n as any).vector_epoch_ms;
      if (Number.isFinite(t)) stamp = stamp === null ? t : Math.max(stamp, t);
    }
    return stamp ?? (Number.isFinite(sys?.epochT0) ? sys.epochT0 : null);
  }
  // The campaign's own "now", kept fresh for the clock-reset button: the GM heartbeat where
  // connected (updates ~1/s), else the newest construct stamp on the viewed system. Null when
  // nothing knows - a bare local map has no campaign clock to return to.
  $: campaignNow = gmTime?.currentTime ?? (selectedSystemNode ? gameNowOf(selectedSystemNode.system) : null);
  // Adrift = worth offering the way home. The threshold is deliberately generous (an hour of game
  // time): the free-running clock diverges within seconds of opening, and a button that is ALWAYS
  // lit is furniture, not an affordance.
  $: clockAdrift = campaignNow !== null && Math.abs(currentTime - campaignNow) > 3600_000;
  function resetClockToCampaign() {
    const now = gmTime?.currentTime ?? (selectedSystemNode ? gameNowOf(selectedSystemNode.system) : null);
    if (now !== null && now !== undefined) currentTime = now;
  }
  // The campaign clock READOUT, shown only while following the GM (a free-running local clock is
  // deliberately unlabelled - naming an arbitrary time would dress the mess-about mode up as the
  // campaign's). Formatted through the campaign's OWN calendar - `temporal` rides the player
  // snapshot and this is the same resolver the GM's clock bar uses, so the two surfaces cannot
  // disagree about what a date is called. Driven off docNowMs (the 1 Hz wall clock) rather than the
  // per-frame time: a readout is only ever read to the second, and the calendar maths is bigint.
  $: followClockLabel = (() => {
    if (!followGMActive) return null;
    const t = (starmap as any)?.temporal;
    const calendar = t?.temporal_registry?.[t?.activeCalendarKey];
    if (calendar) {
      try { return resolveCalendar(unixMsToMasterSeconds(docNowMs), calendar).formatted; } catch { /* fall through */ }
    }
    return new Date(docNowMs).toUTCString().replace(/ GMT$/, '');
  })();
  $: if (selectedSystemNode && selectedSystemNode.id !== clockAnchoredFor) {
    const anchor = gmTime?.currentTime ?? gameNowOf(selectedSystemNode.system);
    if (anchor !== null && anchor !== undefined) {
      clockAnchoredFor = selectedSystemNode.id; // only count it as anchored once we HAD an answer
      if ((globalThis as any).__routeDebug) {
        console.log('[clockanchor]', JSON.stringify({
          from: gmTime?.currentTime != null ? 'gm-heartbeat' : 'construct-stamp-or-epoch',
          was: currentTime, now: anchor, movedDays: (anchor - currentTime) / 86400000
        }));
      }
      currentTime = anchor;
    }
  }
  // G9: the OTHER charted systems, as stars in this system's sky. Derived here rather than in the
  // scene because it is starmap knowledge, and recomputed only when the map or the viewed system
  // changes — never per frame. `off` skips the work entirely.
  $: skyStars = (activePreset?.constellations ?? 'off') === 'off'
    ? []
    : skyStarsFor(starmap, selectedSystemId,
        { magnitudeLimit: magnitudeLimitFor(activePreset!.constellations ?? 'off') });

  // A53: the GM's live "hide every ship and station" switch (Quick overrides). Never persisted here
  // either — it arrives with each SYNC_PRESET and a window that reconnects is told again.
  let constructsHidden = false;
  // The system the view shows. Redaction has already happened at the source (computePlayerSnapshot);
  // this is the selection, plus the one thing the GM can drop live.
  //
  // A53 — "DON'T SHOW THEM THE FLEET", restored as a LIVE OVERRIDE rather than as the preset field
  // A42 removed. The Field Guide's version was an authoring checkbox and a `?constructs=0` URL
  // parameter, and both were the wrong shape: the moment a GM actually wants this, it is mid-scene and
  // about the next thirty seconds, not about how the view was designed. So it sits with Hide labels
  // and Suspend filter in Quick overrides, rides the same SYNC_PRESET, and is momentary by design.
  //
  // Filtered HERE, at the one place every system surface reads from, rather than at each of them:
  // the 3D scene, the 2D map, the document, the body picker and the ship-plume table all derive from
  // `displaySystem`, so a construct dropped here is gone from all of them at once and none of them
  // needs to know the override exists.
  $: displaySystem = (() => {
    const sys = selectedSystemNode?.system ?? null;
    if (!sys || !constructsHidden) return sys;
    return { ...sys, nodes: sys.nodes.filter((n) => n.kind !== 'construct') };
  })();

  // G3: each modelled ship's drive data for the scene's plume - max accel (thrust reads as a
  // fraction of the ship's OWN capability) and the exhaust colour of its dominant engine
  // (engine-def pack data, G15(4)). Only the host holds the rule pack to derive either.
  $: shipAccelMap = (() => {
    if (!displaySystem || !rulePack) return null;
    const out: Record<string, { accelMs2: number; exhaustHex?: string }> = {};
    const defs = (rulePack as any)?.engineDefinitions?.entries ?? [];
    const fuels = (rulePack as any)?.fuelDefinitions?.entries ?? [];
    for (const n of displaySystem.nodes as any[]) {
      if (n.kind !== 'construct' || !n.model?.hash) continue;
      try {
        const g = calculateFullConstructSpecs(n, defs, fuels, null).maxVacuumG;
        if (g <= 0) continue;
        let exhaustHex: string | undefined;
        let bestThrust = -1;
        for (const inst of n.engines ?? []) {
          const def = defs.find((d: any) => d.id === inst.engine_id);
          const total = (def?.thrust_kN ?? 0) * (inst.quantity ?? 1);
          // 'none' is a real authored answer (a reactionless drive has no plume), not a missing
          // value - it wins the dominant slot like any other and the scene draws nothing.
          if (def?.exhaust_color_hex && total > bestThrust) { bestThrust = total; exhaustHex = def.exhaust_color_hex; }
        }
        out[n.id] = { accelMs2: g * 9.81, ...(exhaustHex ? { exhaustHex } : {}) };
      } catch { /* a ship with unresolvable engines just takes the fallback ceiling */ }
    }
    return out;
  })();

  // Live clock for the interactive tier. Not synced to the GM at the starmap level — we just keep
  // the orbital plot gently in motion so it feels alive.
  let currentTime = Date.now();
  // The clock the document/info surfaces are drawn against — see the note in the rAF loop below.
  let docNowMs = currentTime;
  let lastDocClock = 0;
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
  // ONE number owns this width and it is a FRACTION of the viewport, never a pixel count (F10): a
  // proportion travels from the GM's screen to a player's, a pixel count does not. The pixel width is
  // DERIVED from that fraction and the CURRENT viewport, so it tracks a resize and is right the first
  // time a window opens. It used to be converted to pixels ONCE, inside applyPlayerPreset, which is why
  // a width edited with the player window shut arrived at the proportions of whatever viewport last
  // applied the preset — and why editing and saving with it open appeared to "fix" it (A32).
  // The bounds MUST match PlayerPresetEditor's slider range, or the top of its travel moves nothing —
  // the live view used to clamp at 640 px against a slider that offered half of a 1920 px screen (960).
  const INSP_MIN_PCT = 0.15, INSP_MAX_PCT = 0.5; // == PlayerPresetEditor.svelte's range
  const INSP_MIN_PX = 200;                        // readability floor, never more than the max fraction
  let viewportW = browser ? window.innerWidth : 1280;
  let inspectorWidthPct = 0.18; // ≈ the old compact 230 px default at 1280, so the map keeps the room
  // A width this reader dragged for themselves, if any. It survives a reload and outranks the preset's
  // width on the FIRST application (see below) — but only there, so a GM re-deploying still lands.
  let storedWidthPct: number | null = null;
  if (browser) {
    const s = Number(localStorage.getItem('holo-insp-width-pct'));
    if (s >= INSP_MIN_PCT && s <= INSP_MAX_PCT) { storedWidthPct = s; inspectorWidthPct = s; }
  }
  $: inspectorWidth = (() => {
    const pct = Math.max(INSP_MIN_PCT, Math.min(INSP_MAX_PCT, inspectorWidthPct));
    const floor = Math.min(INSP_MIN_PX, viewportW * INSP_MAX_PCT);
    return Math.round(Math.max(floor, pct * viewportW));
  })();
  function startInspectorResize(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidth;
    // The drag writes back a FRACTION too, so a width dragged on one screen means the same thing on
    // the next one. Storing the pixels here is what gave this number two owners that disagreed.
    const onMove = (ev: PointerEvent) => {
      const px = startW + (startX - ev.clientX);
      inspectorWidthPct = Math.max(INSP_MIN_PCT, Math.min(INSP_MAX_PCT, px / Math.max(1, viewportW)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem('holo-insp-width-pct', inspectorWidthPct.toFixed(4)); } catch { /* private mode */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Short type label for a body row in the system list module.
  function bodyTypeLabel(n: any): string {
    if (n.kind === 'construct') return String(n.construct_type || 'Construct').replace(/(^|[-_ ])(\w)/g, (_: string, s: string, c: string) => (s ? ' ' : '') + c.toUpperCase());
    if (isStarNode(n)) return 'Star';
    const r = String(n.roleHint || 'body').replace('-', ' ');
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  function isStarNode(n: any): boolean {
    return n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
  }
  function jumpTo(id: string) {
    focusedBodyId = id;
    const node = displaySystem?.nodes.find((n) => n.id === id);
    selectedBody = node && (node.kind === 'body' || node.kind === 'construct') ? (node as CelestialBody) : null;
  }

  // --- Guide tips: the random margin notes a preset can switch on (guideTips: off/top/bottom/both).
  // Nothing to do with the retired Field Guide skin — these ride the preset's own HUD and document. ---
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

  $: nowLabel = lastUpdate ? new Date(lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';

  // --- Unified PlayerPreset deploy (?preset=<id> + live SYNC_PRESET) --------------------------------
  // A preset is ALWAYS in play. It picks the cover, the starmap module, the system module, the theme
  // and the filter; the GM's momentary overrides (hide labels / suspend filter / pause orbit) come
  // down the same channel, and a null SYNC_PRESET broadcast is the hold screen.
  //
  // THE FALLBACK, and why it is a preset rather than a default skin (A47/A42). An id that does not
  // resolve — and, since A42, a URL with no `?preset=` at all — lands on the shipped Guide preset,
  // which is what the old default skin became. `presetMissing` below is the difference between the
  // two cases: an id that was ASKED for and did not resolve is a broken link and says so; no id at
  // all is simply the default and says nothing.
  const FALLBACK_PRESET_ID = 'guide';
  // Resolved by id rather than by index so a reorder of the shipped list cannot silently move it; the
  // index is only the guard against someone renaming the id out from under this.
  const FALLBACK_PRESET = BUILTIN_PRESETS.find((p) => p.id === FALLBACK_PRESET_ID) ?? BUILTIN_PRESETS[0];
  // Read the preset id from the URL SYNCHRONOUSLY (not in onMount) so the very first paint already
  // knows which preset is in play, rather than painting the fallback's cover for a frame first.
  let activePresetId: string = (browser ? new URLSearchParams(window.location.search).get('preset') : null) || FALLBACK_PRESET_ID;
  let appliedPresetJson: string | null = null;
  let presetHold = false; // GM closed the view → show a hold screen
  function applyPlayerPreset(p: PlayerPreset) {
    // holoStyle is always derived so a holo3d system view deploys at full fidelity.
    holoStyle = holoStyleOf(p);
    // (The preset's inspectorWidthPct is adopted by the reactive block that CALLS this — see there for
    // why it cannot be assigned from inside a function.)
    // Default time: the preset picks the starting rate + play state (ignored while following the GM,
    // whose clock takes over wholesale).
    rateIndex = Math.max(0, Math.min(RATE_STEPS.length - 1, p.defaultRateIndex ?? DEFAULT_RATE_INDEX));
    isPlaying = p.defaultPlaying ?? true;
    selectedBody = null;
  }
  function applyOverrides(ov: import('$lib/broadcast').PresetOverrides) {
    holoLabelsOn = !ov.labelsHidden;
    holoOrbitLinesOn = !ov.orbitLinesHidden;
    holoFilterBypass = ov.filterBypass;
    holoOrbitPaused = ov.orbitPaused;
    constructsHidden = ov.constructsHidden === true;
    overrideFollowGM = ov.followGM ?? null;
    mapHighlights = (ov.highlightsMuted ? [] : (ov.mapHighlights ?? [])) as any;
  }
  // The GM's live highlight selection. The snapshot this view renders is already redacted, so a
  // secret tag cannot become a badge here however it is selected.
  let hostTagCategories: import('$lib/tags/tagCategories').TagCategory[] | null = null;
  let mapHighlights: import('$lib/tags/mapHighlights').MapHighlights = [];
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

  // A59 — FOLLOW THE GM BACK OUT TO THE MAP.
  //
  // `followFocus` above can only ever move the player INTO a system, because a focus is a body id.
  // Leaving one broadcast nothing at all, so a following player stayed in whatever system the GM had
  // last opened, watching a system the GM was no longer looking at. This is the other direction.
  //
  // GATED THE SAME WAY THE BACK GESTURE IS (`onPopState` below): a preset whose starmap layer is
  // DISABLED has deliberately locked its players into one system (WS5), and following the GM out of
  // it would break that lock-down rather than honour the GM. So the level is obeyed only when the
  // player has a starmap to be returned to.
  function followGmLevel(l: import('$lib/broadcast').GmLevel) {
    if (!followGMActive) return;
    if (l.level === 'starmap') {
      if (activePreset?.starmapEnabled === false) return; // locked into one system by design (WS5)
      selectedSystemId = null;
      selectedBody = null;
      focusedBodyId = null;
      return;
    }
    // 'system' carries the id, so a system the GM has SELECTED but not focused on any body is
    // followed too — which a body-focus message could never express.
    if (l.systemId && l.systemId !== selectedSystemId) {
      coverDismissed = true;
      selectedSystemId = l.systemId;
      selectedBody = null;
      focusedBodyId = null;
    }
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
  // the window is stuck on the fallback. (resolvePreset() alone hides `starmap` inside a function.)
  $: resolvedPreset =
    BUILTIN_PRESETS.find((p) => p.id === activePresetId)
    || (starmap?.playerPresets ?? []).find((p) => p.id === activePresetId)
    || null;
  // A47 — WHERE AN UNRESOLVED PRESET LANDS, AND THAT IT SAYS SO.
  // An id that resolved to nothing used to leave `activePreset` null, and every preset-driven branch
  // below is guarded on it — so the page fell through to whatever `themeKey` happened to be, which was
  // 'guide': the LEGACY Field Guide. That was wrong twice over. It was a different tool, not a degraded
  // version of the one asked for; and it was SILENT, so a GM whose link was stale saw a working screen
  // and no reason to doubt it. The fallback is now a real player preset — the shipped Guide, which is
  // what that legacy skin became — and the failure is stated on screen.
  // NOT-YET-ARRIVED IS NOT FAILED, and this is the whole subtlety. A custom preset lives on the
  // CAMPAIGN (`starmap.playerPresets`), which arrives by broadcast — a window opens, paints, and only
  // then receives SYNC_STARMAP. "Unresolved" is therefore the normal state for the first second of
  // every custom-preset window, and warning then would cry wolf on every open. It is a genuine failure
  // only once a campaign HAS arrived and still does not contain the id. (This also answers A47's own
  // question (1): custom ids DO resolve on the player side, through this list — what they cannot do is
  // resolve before the campaign carrying them lands, which is exactly why a built-in id looked fine in
  // the same session. A built-in needs no data at all.)
  $: presetMissing = !resolvedPreset && !!starmap;
  // The fallback waits for the same signal the message does, and for a second reason: applying it
  // early would count as the FIRST application, and `firstApply` below is what lets a width this
  // reader dragged outrank the preset's. A custom preset would then arrive second and overrule a drag
  // it was never meant to touch. A built-in id resolves with no data at all, so the ordinary no-URL
  // case never waits for anything.
  $: pendingPreset = resolvedPreset ?? (starmap ? FALLBACK_PRESET : null);
  // Announce it once per id, to the console as well as the screen: the screen tells whoever is looking
  // at the player window, the console gives the GM something to paste back.
  let warnedPresetId: string | null = null;
  $: if (presetMissing && warnedPresetId !== activePresetId) {
    warnedPresetId = activePresetId;
    console.warn(`[player view] preset "${activePresetId}" is not in this campaign — falling back to "${FALLBACK_PRESET.name}".`);
  }
  $: if (!presetMissing && warnedPresetId) warnedPresetId = null;
  // Dismissible, and re-armed whenever the id changes: a GM who has read it should not have to keep
  // reading it, but a DIFFERENT broken id is news again.
  let missingNoticeDismissedFor: string | null = null;
  $: showMissingNotice = presetMissing && missingNoticeDismissedFor !== activePresetId;
  // Re-apply on CONTENT change, not just id change: saving an edit in the Player Views editor updates
  // the preset in place (same id) and rides the next SYNC_STARMAP — the open window must refresh live.
  $: pendingPresetJson = pendingPreset ? JSON.stringify(pendingPreset) : null;
  $: if (pendingPreset && pendingPresetJson && appliedPresetJson !== pendingPresetJson) {
    const firstApply = appliedPresetJson === null;
    appliedPresetJson = pendingPresetJson;
    // The panel width is adopted HERE, in plain sight, rather than inside applyPlayerPreset. Svelte
    // orders `$:` statements by the assignments it can SEE: a write buried in a called function cannot
    // order the derivation that reads it, so `inspectorWidth` would be computed before this ran and
    // never recomputed — a stale width from a one-way write, which is A32 wearing a different hat.
    // WHO OWNS THE WIDTH: the preset, unless this reader has dragged one for themselves. On the FIRST
    // application (window opening) a stored drag wins, so a width dragged here survives a reload; on
    // every later one — the GM editing or swapping the preset live — the deploy wins, which is the
    // whole point of deploying it.
    if (pendingPreset.inspectorWidthPct && !(firstApply && storedWidthPct !== null)) {
      inspectorWidthPct = pendingPreset.inspectorWidthPct;
    }
    applyPlayerPreset(pendingPreset);
  }

  // ── Preset-driven rendering (the deployed player view) ─────────────────────────────────────────
  // When a preset is active it OWNS the layers: its cover, its chosen starmap module, its chosen system
  // module, its theme + filter — rather than the legacy skin's fixed UI.
  $: activePreset = pendingPreset;
  // "Players can click / focus / scrub" — false locks the surface: no picking, no camera, no clock,
  // no body picker, list rows not tappable. The view is a display driven by the GM (or its presets).
  $: presetInteractive = activePreset?.interactive !== false;

  // ── D8: VIEW-ENTRY transitions. Stepping between stages (starmap ↔ system, any view — document, 2D
  // map, 3D holo) plays the preset's transition over the whole stage: the outgoing screen is composited
  // from the stage's canvases just BEFORE Svelte swaps the DOM (beforeUpdate), then animated away over
  // the new view. WebGL canvases without preserveDrawingBuffer may snapshot blank — those regions fall
  // back to the dark ground, which still reads as a clean entry effect. The document's own per-PAGE
  // transition (inside FilteredDocumentView) is unchanged; this covers the page-level hops.
  let stageMain: HTMLElement;
  let entryOverlay: HTMLCanvasElement;
  let entryEngine: import('$lib/transitions/TransitionEngine').TransitionEngine | null = null;
  let renderedStageKey: string | null = null;
  let pendingEntrySnap: HTMLCanvasElement | null = null;
  $: stageKey = (!starmap || presetHold || !activePreset) ? ''
    : (selectedSystemId ? 'sys:' + activePreset.systemView : 'map:' + activePreset.starmapView);
  $: entryWanted = !!activePreset?.transition && activePreset.transition !== 'none';

  function captureStage(): HTMLCanvasElement | null {
    try {
      const r = stageMain.getBoundingClientRect();
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(r.width));
      c.height = Math.max(2, Math.round(r.height));
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#05070c';
      ctx.fillRect(0, 0, c.width, c.height);
      for (const cv of Array.from(stageMain.querySelectorAll('canvas'))) {
        if (cv === entryOverlay) continue;
        const b = cv.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        try { ctx.drawImage(cv, b.left - r.left, b.top - r.top, b.width, b.height); } catch { /* tainted / non-preserved WebGL */ }
      }
      return c;
    } catch { return null; }
  }

  async function runEntryTransition(snap: HTMLCanvasElement) {
    if (!activePreset || !entryOverlay) return;
    const def = transitionRegistry.getOrFallback(activePreset.transition ?? 'none');
    if (def.id === 'none') return;
    if (!entryEngine) {
      const { TransitionEngine } = await import('$lib/transitions/TransitionEngine');
      entryEngine = new TransitionEngine(entryOverlay);
    }
    try {
      const bmp = await createImageBitmap(snap);
      const params = Object.keys(activePreset.transitionParams ?? {}).length
        ? activePreset.transitionParams! : transitionRegistry.defaultParams(def.id);
      await entryEngine.run(def, params, entryOverlay, async () => {}, bmp);
    } catch { /* snapshot failed → plain cut */ }
  }

  beforeUpdate(() => {
    if (!browser || !entryWanted || !stageMain) return;
    // The DOM still shows the OUTGOING stage here — grab it before the swap.
    if (renderedStageKey && stageKey && stageKey !== renderedStageKey && !pendingEntrySnap) {
      pendingEntrySnap = captureStage();
    }
  });
  afterUpdate(() => {
    const changed = renderedStageKey !== stageKey;
    renderedStageKey = stageKey;
    const snap = pendingEntrySnap;
    pendingEntrySnap = null;
    if (snap && changed) void runEntryTransition(snap);
  });
  $: presetAccent = activePreset ? accentSolid(activePreset.accentColor) : '#6aa0ff';
  // The document engine wants the accent RAW — it resolves 'rainbow' itself, into spectrum headings
  // rather than a flat stand-in, and can only do that if the sentinel survives the trip. presetAccent
  // is the flattened form, correct for a CSS variable and wrong for the engine.
  $: presetAccentRaw = activePreset ? (activePreset.accentColor || '#6aa0ff') : '#6aa0ff';
  // Rainbow on the inspector's body-name heading — same condition renderDocument uses for its own
  // headings (`rainbow && !theme.mono`), so the name and the headings under it agree.
  $: inspTitleRainbow = presetAccentRaw === 'rainbow' && activePreset?.bodyStyle !== 'white';
  $: presetFont = activePreset?.font || 'system-ui';
  // Guide tips: the preset picks off / top / bottom / both; the rolled notes fill the chosen edges.
  $: guideTipsMode = activePreset?.guideTips ?? 'off';
  $: tipTop = guideTipsMode === 'top' || guideTipsMode === 'both' ? topNote : '';
  $: tipBottom = guideTipsMode === 'bottom' || guideTipsMode === 'both' ? bottomNote : '';
  $: tipsOn = !!(tipTop || tipBottom);
  $: tipMono = activePreset?.bodyStyle === 'white';
  // (The starmap "list" module is now the starmap DOCUMENT — built in starmapDocument.ts, D9.)
  // System "list" module → a canvas body list (real filter). Bodies + constructs, a coloured dot each.
  $: systemListModel = {
    heading: displaySystem?.name || 'System',
    rows: ((displaySystem?.nodes ?? []) as any[])
      .filter((n) => (n.kind === 'body' || n.kind === 'construct') && n.roleHint !== 'ring' && n.roleHint !== 'barycenter')
      .map((n) => ({
        id: n.id,
        title: String(n.name ?? ''),
        sub: bodyTypeLabel(n),
        dots: [getClassColor(n)],
        selectable: true
      }))
  } as ListModel;
  function selectBodyById(id: string) {
    let n = (displaySystem?.nodes ?? []).find((x: any) => x.id === id) as any;
    // A barycentre marker (e.g. Pluto-Charon) resolves to its dominant member — otherwise selectedBody
    // is null (a barycentre isn't a body/construct) and the document falls back to the primary star.
    if (n && n.kind === 'barycenter' && displaySystem) n = dominantOf(displaySystem, n);
    selectedBody = n && (n.kind === 'body' || n.kind === 'construct') ? (n as CelestialBody) : null;
    bodyExpanded = false;
  }
  // The document shows a barycentre AS its dominant member. When such a body is selected, feed the
  // document the BARYCENTRE id so its schematic marker highlights and the title reads "Pluto (…)".
  $: docSelectedId = (() => {
    if (!selectedBody || !displaySystem) return null;
    const bary = (displaySystem.nodes as any[]).find((n) => n.kind === 'barycenter' && dominantOf(displaySystem, n)?.id === selectedBody!.id);
    return bary ? bary.id : selectedBody.id;
  })();
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
  // A construct's facts want its HOST to describe where it is ("Adrian: Low Orbit"); resolved here so
  // the HUD card and the DOM fact list read the same figure the document builder produces (A2).
  $: hostOfSelected = (() => {
    const hid = (selectedBody as any)?.parentId || (selectedBody as any)?.orbit?.hostId;
    if (!hid || !displaySystem) return null;
    const n = (displaySystem.nodes ?? []).find((x) => x.id === hid);
    return n && n.kind === 'body' ? (n as CelestialBody) : null;
  })();
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
          facts: bodyFacts(selectedBody, prefs, { rulePack, host: hostOfSelected, liveReadings: !!activePreset?.liveReadings, system: displaySystem, nowMs: currentTime }),
          description: selectedBody.description || '',
          accent: presetAccent, font: presetFont, fontScale: infoFontScale,
          mono: activePreset?.bodyStyle === 'white',
          // D6 unify: the card body renders THESE (the shared panel-mode builder + theme). The body
          // graphic is omitted in the HUD (imagery 'none') — a live renderer can't sit inside the
          // filter-composited quad; the unfiltered aside shows it.
          blocks: displaySystem ? buildGuideDocument(displaySystem, docSelectedId ?? selectedBody.id, {
            nowMs: docNowMs,
            panel: true, prefs, imagery: 'none', tagStyle: activePreset?.tagStyle, rulePack, liveReadings: !!activePreset?.liveReadings,
            highlights: mapHighlights, tagCategories: hostTagCategories ?? $tagCategories
          }) : undefined,
          theme: activePreset ? makeDocTheme({
            font: presetFont, headingFont: activePreset.headingFont, fontScale: infoFontScale,
            mono: activePreset.bodyStyle === 'white', accent: presetAccent,
            documentStyle: activePreset.documentStyle, themeColors: activePreset.themeColors,
            listStyle: activePreset.listStyle
          }) : undefined
        } : null,
        tips: hudTipsOn ? { top: tipTop, bottom: tipBottom, accent: presetAccent, font: presetFont, mono: tipMono } : null
      })
    : null;
  // Which system stage renders, picked by the preset's systemView. The "2D map" is the holo renderer
  // LOCKED OVERHEAD + flat/unlit — a real top-down view that goes through the same GPU filter and
  // picking, rather than a separate SVG orrery under a CSS approximation.
  // (A42: there used to be a third tier, 'interactive', reachable only when NO preset was in play —
  // it mounted SystemVisualizer, the GM's own orrery, as the legacy Starship Console skin. With a
  // preset always in play it was unreachable, so both the tier and that mount are gone.)
  $: effectiveSystemTier = activePreset?.systemView === 'holo3d' || activePreset?.systemView === 'diagram2d' ? 'holo' : 'static';
  $: system2dOverhead = !!activePreset && activePreset.systemView === 'diagram2d';
  // WS2 Guide document: the interactive canvas document (schematic + in-page info block + navigator),
  // drawn by the block-model engine through the real filter. Falls under the 'static' tier (no 3D scene).
  $: systemDoc = !!activePreset && activePreset.systemView === 'document';
  // Pass the body-graphics mode straight through (sphere / disc / flat / photo / none) so the document
  // can render each distinctly.
  $: docImagery = activePreset ? activePreset.bodyGfx : 'none';
  $: docColorful = activePreset?.accentColor === 'rainbow';
  // Entering the Document view with nothing chosen: preselect the system's primary (most-massive) star
  // so its file shows straight away, rather than an empty "tap a world" prompt.
  $: if (systemDoc && displaySystem && !selectedBody) {
    const star = starsOf(displaySystem)[0] as CelestialBody | undefined;
    if (star) selectedBody = star;
  }
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
  //
  // A62: DISMISSING THE COVER IS A REVEAL, and a reveal has to re-size the surface underneath. The
  // reported symptom is a resize performed WHILE the cover is up, after which the starmap comes back
  // stretched — the stage is only covered rather than unmounted, so its ResizeObserver ought to have
  // fired, and "ought to" is what makes the fault intermittent. Rather than reach into each view,
  // fire a window resize on the next frame: every renderer that listens (Starmap3DView, HoloView)
  // re-reads its own container, and one that does not is unaffected. The frame's delay is so the
  // reveal has laid out before anything measures it.
  function dismissCover() {
    coverDismissed = true;
    if (browser) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  let coverDismissed = false;
  let coverForId: string | null = null;
  $: if (activePreset?.cover?.enabled && coverForId !== activePreset.id) { coverForId = activePreset.id; coverDismissed = false; }
  $: showPresetCover = !!activePreset?.cover?.enabled && !coverDismissed && !!starmap && !presetHold;
  // WS5 — starmap disabled → players are dropped straight into ONE system, with no back-to-systems
  // navigation. The preset PINS which system (GM's choice at authoring time, so a shared link always
  // lands in the same place); an unset or stale pin falls back to the first charted system.
  $: pinnedSystemNode = activePreset?.pinnedSystemId
    ? (starmap?.systems ?? []).find((s: any) => s.id === activePreset!.pinnedSystemId) ?? null
    : null;
  $: if (activePreset && activePreset.starmapEnabled === false && starmap?.systems?.length && !selectedSystemId) {
    selectedSystemId = (pinnedSystemNode ?? starmap.systems[0]).id;
  }
  // NB the pin governs where the player LANDS, not where they may stay: a followGM preset still tracks
  // the GM's current system (that's the point of projection mode). The lock is about never surfacing
  // the starmap — enforced on the exit paths (back button, popstate) below.

  function startClock() {
    if (!browser) return;
    let last = performance.now();
    const tick = (ts: number) => {
      const dt = (ts - last) / 1000;
      // Following the GM: run at THEIR rate so positions match their map (heartbeats snap any drift).
      // Otherwise the player's own arbitrary clock.
      const rate = followGMActive && gmTime ? gmTime.timeScale : RATE_STEPS[rateIndex].sec;
      if (isPlaying) currentTime += dt * rate * 1000;
      // G8: the document surfaces carry a "Next eclipse" row, and a date that has gone by should stop
      // being shown. They redraw a canvas, so they get the clock at ONE HERTZ OF WALL TIME rather than
      // per frame — the row only ever needs to be right to the second, whatever the time scale is.
      if (ts - lastDocClock > 1000) { lastDocClock = ts; docNowMs = currentTime; }
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

  // (A42: five local display helpers stood here — fmt, gravityG, massRel, orbitDist, atmo — and a
  //  sixth, tempC, had already been removed under B63/B70 for answering "what temperature is this
  //  world" with a different figure from the info block beside it. The remaining five were the same
  //  hazard, uncalled since the legacy skins' <dl> went: a private second formatter for gravity, mass,
  //  orbit distance and atmosphere, where `bodyFacts` is the one that reaches every surface.)

  // G34: per-quantity × body-type unit prefs. They ride the redacted starmap (SYNC_STARMAP), so a
  // GM cycling a unit reaches this window on the next snapshot. The legacy ?units=/?temp= launcher
  // params still seed the first paint for old links, through the same migration the GM map uses.
  let prefs: UnitPrefs = {};

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    sessionId = params.get('sid');
    activePresetId = params.get('preset') || FALLBACK_PRESET_ID;
    embedMode = params.get('embed') === '1';
    // BYO ICE relay from the share URL (design 11): must be known BEFORE dialling —
    // a player who cannot connect cannot be told anything over the channel.
    broadcastService.setIceServers(parseIceParam(params.get('ice')));
    broadcastService.onPeerFailed = (reason) => { linkBlocked = reason === 'ice-failed'; };
    { const tp = params.get('temp');
      prefs = migrateUnitPrefs({
        measurementUnits: params.get('units') === 'imperial' ? 'imperial' : 'metric',
        temperatureUnit: tp === 'F' || tp === 'K' ? tp : 'C'
      });
      // The runtime store feeds store-reading components (HoloView's grid legend); this window
      // never cycles a pref - players inherit, non-interactively.
      unitPrefsStore.set(prefs);
      unitPrefsLocked.set(true); }
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
      sessionId
    );
    window.addEventListener('popstate', onPopState);
    broadcastService.onFocusLevelUpdate = (p) => followFocusLevel(p.id, p.level);
    broadcastService.onGmLevelUpdate = (l) => followGmLevel(l); // A59
    broadcastService.onIncoming = (info) => {
      if (info?.what !== 'starmap') return;
      if (receivingTimer) clearTimeout(receivingTimer);
      receiving = { systems: info.systems ?? 0, approxBytes: info.approxBytes };
      // A LOST PAYLOAD MUST NOT PIN THE PILL. The announce is a separate message from the thing it
      // announces, so a dropped or failed SYNC_STARMAP would otherwise leave this up forever — which
      // is a worse lie than showing nothing, because it says "still working" when nothing is.
      receivingTimer = setTimeout(() => { receiving = null; receivingTimer = null; }, 30_000);
    };
    broadcastService.onStarmapUpdate = (map) => {
      perfCount('sync.starmap'); // each one re-clones the campaign + rebuilds the scene — track it
      clearReceiving();
      starmap = map;
      // G34: inherit the GM's unit choices, non-interactively. Absent on a pre-G34 GM build →
      // keep whatever the launch params seeded.
      if ((map as any)?.unitPrefs) { prefs = (map as any).unitPrefs; unitPrefsStore.set(prefs); }
      lastUpdate = Date.now();
      lastHeardAt = Date.now();
      connected = true;
    };
    broadcastService.onHeartbeat = () => { lastHeardAt = Date.now(); connected = true; };
    livenessTimer = setInterval(() => {
      const alive = Date.now() - lastHeardAt < 15_000;
      if (connected && !alive) {
        connected = false;
        broadcastService.redialPeer(); // remote guest: the host may have restarted — try again
      }
    }, 5000);
    if (embedMode) window.addEventListener('message', onParentMessage);
    broadcastService.onBrandingUpdate = (b) => { branding = b || { name: '', logo: null }; };
    // The GM's tag vocabulary. Applied to the presentation registries (so the info block's chips and
    // every describeTag consumer here read the GM's labels and colours) AND kept as categories for
    // the map badges, which resolve through markersFor. Without it this window falls back to the
    // SHIPPED DEFAULTS — right on the GM's own machine, where localStorage is shared, and wrong on
    // every other device.
    broadcastService.onTagStylesUpdate = (t) => {
      applyTagStyles(t);
      hostTagCategories = tagCategoriesFromSnapshot(t);
    };
    // Live GM control (Player Views modal): switch preset, apply overrides, or hold (null).
    broadcastService.onPresetUpdate = (p) => {
      if (!p) { presetHold = true; return; }
      presetHold = false;
      activePresetId = p.presetId;
      if (p.overrides) applyOverrides(p.overrides);
    };
    // G3: construct model binaries fetch by hash on demand. A viewer that misses the local store
    // asks through modelFetch; the GM answers with SYNC_MODEL; storing it (hash-verified inside
    // importEmbeddedModels) wakes the waiting viewer, and the glyph fallback gives way to the ship.
    setModelFetcher((hash) => broadcastService.sendMessage({ type: 'REQUEST_MODEL', payload: { targetId: sessionId, hash } }));
    broadcastService.onModelUpdate = async (m) => {
      const n = await importEmbeddedModels({ [m.hash]: { b64: m.b64, meta: m.meta as any } }).catch(() => 0);
      if (n > 0) modelArrived(m.hash);
    };
    broadcastService.sendMessage({ type: 'REQUEST_STARMAP', payload: sessionId });
    phoneMq?.addEventListener('change', onPhoneMq);
    startClock();
  });

  const onPhoneMq = () => (isPhone = phoneMq?.matches ?? false);

  // Parent → embedded view commands ({ns:'sse2-embed', v:1}). Origin-allowlisted; embed mode only.
  // `setPreset` lets a host switch between its own StarMap slots on ONE warm iframe (no reload);
  // a later GM SYNC_PRESET still wins — the GM drives the view, the host only picks the slot.
  function onParentMessage(e: MessageEvent) {
    if (!embedMode || window.parent === window || e.source !== window.parent) return;
    if (!isAllowedEmbedOrigin(e.origin)) return;
    const d = e.data;
    if (!d || d.ns !== 'sse2-embed' || d.v !== 1) return;
    if (d.cmd === 'ping') {
      window.parent.postMessage({ ns: 'sse2-embed', v: 1, event: 'pong', requestId: d.requestId ?? null }, e.origin);
    } else if (d.cmd === 'setPreset' && typeof d.presetId === 'string') {
      presetHold = false;
      activePresetId = d.presetId;
    }
  }

  onDestroy(() => {
    setModelFetcher(null); // stop routing model requests into a closed transport
    if (receivingTimer) clearTimeout(receivingTimer);
    if (livenessTimer) clearInterval(livenessTimer);
    if (browser) window.removeEventListener('message', onParentMessage);
    broadcastService.close();
    phoneMq?.removeEventListener('change', onPhoneMq);
    if (browser) { cancelAnimationFrame(rafId); window.removeEventListener('popstate', onPopState); }
  });
</script>

<!-- The info panel's pixel width is a fraction of THIS number, so a resize has to reach it (A32). -->
<svelte:window bind:innerWidth={viewportW} />

<svelte:head>
  <title>{selectedSystemNode?.name ?? starmap?.name ?? 'Player View'} — Star System Explorer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
</svelte:head>

<!-- The body info panel — shared by the holo/2D tier AND the text-list tier (tap a body → its file). -->
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
          <!-- The body NAME is panel chrome, not a document heading (DocPanel is mounted with
               showHeading={false}), so it never saw the preset's font colour — the rainbow reached
               "Tags" and the other in-document headings and stopped at the one line above them. It now
               takes the accent, and paints the same spectrum as `rainbowFill` when the accent IS the
               rainbow. Mono skins are exempt for the same reason the document exempts them: they
               bleach the page deliberately so a tinting filter has one palette to work on. -->
          <h2 class:rainbow={inspTitleRainbow} style={inspTitleRainbow ? '' : `color:${presetAccent}`}>{selectedBody.name}</h2>
          <span class="insp-chevron" aria-hidden="true">▾</span>
        </button>
        <!-- Phone: × only MINIMISES back to the name bar (tap the title to reopen) — closing outright
             left no way back to the data until another body was selected. Desktop closes as before. -->
        <button class="insp-close" on:click={() => { if (isPhone) bodyExpanded = false; else selectedBody = null; }} aria-label={isPhone ? 'Minimise' : 'Close'}>×</button>
      </div>
      <div class="insp-sub">{(selectedBody.roleHint || 'body').toUpperCase()}{selectedBody.kind !== 'construct' && selectedBody.class ? ' · ' + selectedBody.class : ''}</div>
      <div class="insp-detail">
        {#if activePreset && displaySystem}
          <!-- D6 unify: the SAME document engine renders the info block (facts + tags + description +
               body graphic) with the preset's full appearance. The aside stays as chrome (title,
               close, resize). (A42: a hand-rolled <dl> fact list used to sit in the {:else} here, for
               the legacy skins. It was a SECOND rendering of the info block — the exact duplication
               D6 exists to prevent — and it went with them.) -->
          <DocPanel system={displaySystem} selectedId={docSelectedId ?? selectedBody.id} showHeading={false} transparentBg {rulePack} liveReadings={!!activePreset?.liveReadings} nowMs={docNowMs}
            font={presetFont} headingFont={activePreset.headingFont} accent={presetAccentRaw} mono={activePreset.bodyStyle === 'white'}
            fontScale={infoFontScale} listStyle={activePreset.listStyle} documentStyle={activePreset.documentStyle}
            tagStyle={activePreset.tagStyle} themeColors={activePreset.themeColors}
            imagery={activePreset.bodyGfx} photoFrame={activePreset.photoFrame}
            bodyRender={activePreset.render} bodyStyle={activePreset.bodyStyle}
            interactive={presetInteractive} {prefs} tagStyles={hostTagCategories} />
        {/if}
      </div>
    </aside>
  {/if}
{/snippet}

<main bind:this={stageMain} class="catalogue">
  <!-- D8: view-entry transition overlay — the outgoing stage snapshot animates away here. -->
  <canvas class="entry-transition" bind:this={entryOverlay}></canvas>
  <!-- A47: the preset asked for is not in this campaign. Said plainly and OVER everything, including
       the cover — a fallback nobody is told about is the fault this replaces, and the GM is usually
       the first person looking at this window. -->
  {#if showMissingNotice}
    <div class="preset-missing" role="status">
      <span class="pm-text">This view's preset (<code>{activePresetId}</code>) is not in this campaign — showing <strong>{FALLBACK_PRESET.name}</strong> instead. Re-open it from Player Views to fix the link.</span>
      <button class="pm-close" aria-label="Dismiss" on:click={() => (missingNoticeDismissedFor = activePresetId)}>×</button>
    </div>
  {/if}
  <!-- A63: the holding pill. Sits with the other connection chrome and OVER the cover, because the
       cover is exactly when a joining player is waiting and has nothing else to look at. Indeterminate
       by design — see the note on `receiving`: the parse blocks the main thread, so there is no
       honest progress to show. -->
  {#if receiving}
    <div class="receiving-pill" role="status" aria-live="polite">
      <span class="rp-spin" aria-hidden="true"></span>
      <span>{receivingLabel}</span>
    </div>
  {/if}
  {#if presetHold}
    <!-- GM closed the live view: the quote interstitial holds the screen until they open one again. -->
    <QuoteInterstitial joinUrl={browser ? window.location.href : ''} brandName={branding.name}
      statusText="The GM has paused the display." />
  {/if}
  {#if showPresetCover && activePreset}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="preset-cover" role="button" tabindex="0" bind:clientWidth={coverW} bind:clientHeight={coverH}
      on:click={dismissCover} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') dismissCover(); }}>
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
  <header class="statusbar" class:embed={embedMode} style={activePreset ? `font-family:${presetFont}` : ''}>
    {#if selectedSystemId && !(activePreset && activePreset.starmapEnabled === false)}
      <button class="back-btn" on:click={() => { selectedSystemId = null; selectedBody = null; }} title="Back to all systems">‹ Systems</button>
    {/if}
    {#if !embedMode}
      {#if branding.logo}<img class="brand-logo" src={branding.logo} alt="" />{/if}
      {#if branding.name}<span class="brand-name">{branding.name}</span>{/if}
      <span class="sys-name">{selectedSystemNode ? selectedSystemNode.name.toUpperCase() : (starmap ? (starmap.name || 'STARMAP').toUpperCase() : 'NO SIGNAL')}</span>
      <span class="status" class:live={connected} class:offline={!connected}>
        {#if connected}● LIVE{:else}○ GM OFFLINE — last {nowLabel}{/if}
      </span>
    {/if}
  </header>

  {#if !starmap}
    <!-- Waiting / offline: the quote interstitial (connected, nothing broadcast yet). -->
    <QuoteInterstitial joinUrl={browser ? window.location.href : ''} brandName={branding.name}
      statusText={linkBlocked
        ? 'SENSOR LINK BLOCKED — this network will not carry a direct or relayed connection to the host (UDP blocked, no relay). Ask the GM for a link with a relay, or try another network.'
        : 'Reaching the host — this will fill in automatically once the GM is broadcasting.'}
      sessionId={sessionId ?? ''}>
      <button on:click={() => broadcastService.sendMessage({ type: 'REQUEST_STARMAP', payload: sessionId })}>
        Retry
      </button>
    </QuoteInterstitial>
  {:else if !selectedSystemId && activePreset && activePreset.starmapEnabled}
    <!-- Starmap level, PRESET-DRIVEN: the chosen module (text list / 2D / 3D), tap a system to enter. -->
    <div class="preset-stage" class:frozen={!presetInteractive} style="font-family:{presetFont}; --accent:{presetAccent}">
      {#if activePreset.starmapView === 'holo3d' || activePreset.starmapView === 'diagram2d'}
        <!-- 3D (or 2D = the same renderer LOCKED OVERHEAD): real GLSL filter + raycast selection. -->
        <Starmap3DView {starmap} accentColor={presetAccent} font={presetFont} grid={activePreset.starmapGrid ?? activePreset.grid}
          gridDepth={typeof activePreset.starmapGridDepth === 'number' ? activePreset.starmapGridDepth : (activePreset.starmapGridDepth ? 1 : 0)} gridFalloff={activePreset.starmapGridFalloff ?? 0.5}
          background={activePreset.background} angleDeg={activePreset.starmapView === 'diagram2d' ? 0 : activePreset.angleDeg}
          labelSize={activePreset.labelSize}
          highlights={mapHighlights} markerStyle={activePreset.markerStyle ?? 'label'}
          markerSize={activePreset.markerSize} flagStaff={activePreset.flagStaff} pinText={activePreset.pinText} tagStyles={hostTagCategories}
          filter={presetFilterActive ? activePreset.filter : 'none'} filterParams={activePreset.filterParams}
          tipTop={tipTop} tipBottom={tipBottom} tipMono={tipMono} routeGlow={activePreset.starmapRouteGlow} dropLines={activePreset.starmapDropLines !== false} mono={activePreset.starmapMono}
          overlay={starmapOverlayHud} mapGrid={starmap?.mapGrid ?? null} zExaggeration={activePreset.zExaggeration ?? 1} starScale={activePreset.starmapStarScale ?? 0} starSize={activePreset.starmapStarSize ?? 1}
          mapBackground={activePreset.showMapBackground !== false}
          flat={activePreset.starmapView === 'diagram2d'}
          lockRotation={activePreset.starmapView === 'diagram2d' && activePreset.lockRotation !== false}
          selectable={presetInteractive} on:select={(e) => { pushNavStep(); selectedSystemId = e.detail; selectedBody = null; }} />
      {:else}
        <!-- D9: the starmap DOCUMENT — the systems index through the SAME block-model engine as the
             system Guide document, taking the preset's full appearance (colouration, fonts, nav style,
             headers/footers) and the real GPU filter. Tap a system to enter. -->
        <FilteredDocumentView stage="starmap" {starmap}
          font={presetFont} headingFont={activePreset.headingFont} accent={presetAccentRaw} mono={activePreset.starmapMono}
          listStyle={activePreset.starmapListStyle ?? activePreset.listStyle} navStyle={activePreset.navStyle}
          documentStyle={activePreset.starmapDocumentStyle ?? activePreset.documentStyle}
          themeColors={activePreset.starmapThemeColors ?? activePreset.themeColors}
          starmapLayout={activePreset.starmapLayout} starmapFieldIcons={activePreset.starmapFieldIcons !== false}
          mapBackground={activePreset.showMapBackground !== false}
          fontScale={activePreset.starmapFontScale ?? infoFontScale}
          filterId={presetFilterId} filterParams={presetFilterParams ?? {}}
          tips={tipsOn ? { top: tipTop, bottom: tipBottom } : null} overlay={starmapOverlayHud}
          companyName={activePreset.companyName} footerText={activePreset.footerText}
          selectable={presetInteractive} on:select={(e) => { pushNavStep(); selectedSystemId = e.detail; selectedBody = null; }} tagStyles={hostTagCategories} />
      {/if}
    </div>
  {:else if effectiveSystemTier === 'holo'}
    <!-- Live orbital map (the holo renderer, tilted for 3D or locked overhead for 2D) + tap-to-inspect -->
    <div class="console-stage" class:frozen={!presetInteractive} bind:clientWidth={hudW} bind:clientHeight={hudH} style={activePreset ? `font-family:${presetFont}` : ''}>
      {#if rulePack && displaySystem}
        <HoloView bind:this={holoView} system={displaySystem} showGridLegend={true} {currentTime} {focusedBodyId} style={systemHoloStyle} {skyStars} labelsVisible={holoLabelsOn} orbitLinesVisible={holoOrbitLinesOn} filterBypass={holoFilterBypass} orbitPaused={holoOrbitPaused} {hudCanvas} viewInsetRight={holoPanelInset} shipAccel={shipAccelMap} transitMotion={followGMActive} highlights={mapHighlights} markerStyle={activePreset?.markerStyle} markerSize={activePreset?.markerSize} flagStaff={activePreset?.flagStaff} pinText={activePreset?.pinText} tagStyles={hostTagCategories} on:focus={handleFocus} />
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
            floating
            nodes={displaySystem.nodes}
            focusedId={focusedBodyId}
            emptyLabel="Bodies"
            on:select={(e) => jumpTo(e.detail)}
          />
        </div>
      {/if}
      <!-- Player time controls: collapsed to a play/pause icon; click to expand a rate slider
           (arbitrary — just to see movement). Hidden while following the GM (time is INHERITED from
           the GM's clock — positions match their map) and on non-interactive presets. -->
      {#if followClockLabel}
        <!-- Campaign time, in the campaign's own calendar. Sits where the local time controls
             would be - the two are mutually exclusive by construction (controls hide while
             following; this shows only then). -->
        <div class="follow-clock" title="Campaign time — following the GM's clock">{followClockLabel}</div>
      {/if}
      {#if presetInteractive && !followGMActive}
        <div class="time-controls" class:expanded={timeExpanded} use:clickOutside={() => (timeExpanded = false)}>
          {#if timeExpanded}
            <button class="tc-btn" on:click={() => (isPlaying = !isPlaying)} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '❚❚' : '▶'}</button>
            <input class="tc-slider" type="range" min="0" max={RATE_STEPS.length - 1} step="1" bind:value={rateIndex} aria-label="Time rate" />
            <span class="tc-rate">1 s ≈ {RATE_STEPS[rateIndex].label}</span>
            <!-- Back to the campaign's own clock. A free-running local clock diverges from the GM's
                 by design (this is the mess-about mode); the way home fades in once it has. The
                 anchor is the GM's live heartbeat when connected, else the newest time the GM
                 stamped on any placed construct - the same order the clock-anchor seed uses. -->
            <button class="tc-btn tc-reset" class:on={clockAdrift} on:click={resetClockToCampaign}
              aria-label="Reset to campaign time" title="Reset to campaign time">↺</button>
          {:else}
            <!-- Collapsed: this button SHOWS a pause glyph while running, so it must actually pause.
                 It used only to expand the panel, which meant a control that looked like pause and did
                 not pause — worse than showing no icon (inbox A36). It now does both, and the expanded
                 button beside it toggles back, so the pair stays consistent. -->
            <button class="tc-btn tc-icon" on:click={() => { isPlaying = !isPlaying; timeExpanded = true; }}
              aria-label={isPlaying ? 'Pause and show time controls' : 'Play and show time controls'}
              title={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? '❚❚' : '▶'}</button>
            <button class="tc-btn tc-reset" class:on={clockAdrift} on:click={resetClockToCampaign}
              aria-label="Reset to campaign time" title="Reset to campaign time">↺</button>
          {/if}
        </div>
      {/if}
      <!-- No "tap a world" prompt before the first selection. It was an absolutely-positioned overlay
           at the foot of the stage, so it never held any layout open — and it landed on top of the
           grid's scale caption, which occupies the same corner and says something a reader cannot work
           out for themselves. -->
      {#if selectedBody && !activePreset?.hideInfoPanel}
        {@render inspectorAside()}
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
          system={displaySystem} selectedId={docSelectedId} {rulePack} liveReadings={!!activePreset?.liveReadings} nowMs={docNowMs}
          font={presetFont} headingFont={activePreset.headingFont} accent={presetAccentRaw} mono={activePreset.bodyStyle === 'white'}
          colorful={docColorful} imagery={docImagery} photoFrame={activePreset.photoFrame} hideInfoBlock={activePreset.hideInfoPanel}
          bodyRender={activePreset.render} bodyStyle={activePreset.bodyStyle}
          listStyle={activePreset.listStyle} documentStyle={activePreset.documentStyle} tagStyle={activePreset.tagStyle} navStyle={activePreset.navStyle} themeColors={activePreset.themeColors}
          fontScale={infoFontScale}
          filterId={presetFilterId} filterParams={presetFilterParams ?? {}}
          prefs={prefs}
          tips={tipsOn ? { top: tipTop, bottom: tipBottom } : null} overlay={systemOverlayHud}
          companyName={activePreset.companyName} footerText={activePreset.footerText}
          transition={activePreset.transition} transitionParams={activePreset.transitionParams ?? {}}
          selectable={presetInteractive}
          on:select={(e) => selectBodyById(e.detail)} tagStyles={hostTagCategories} />
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
  {/if}
  <!-- (A42: the final {:else} here mounted CatalogueBrowser, the legacy Field Guide's SVG schematic +
       chip picker + inline panel. Its content assembly, its schematic and its topology walk were all
       ported into the document engine long ago — guideDocument.ts / systemSchematic.ts /
       systemTopology.ts each say so at the top — so the component was the last copy of code that had
       already been replaced.) -->

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

  /* D8: full-stage entry-transition overlay — above the stage, below the interstitial (500). Cleared
     (transparent) whenever no transition is running, so it never blocks the view; taps pass through. */
  .entry-transition { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 450; pointer-events: none; }
  /* A47 broken-link notice. Above the entry-transition overlay (450) and the preset cover (60) — it has
     to be readable whatever stage is showing, and it is deliberately NOT themed by the preset: this is
     the app talking, not the fiction. */
  /* A63. Above the cover (60) and the entry transition (450), below the broken-link notice (500) —
     that one is the app talking and must win. */
  .receiving-pill {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 470;
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 999px;
    background: rgba(8, 12, 20, 0.86); color: #cfe0f5;
    border: 1px solid rgba(120, 160, 210, 0.35);
    font: 400 0.78rem/1.2 system-ui, sans-serif;
    pointer-events: none; max-width: calc(100% - 24px);
  }
  .rp-spin {
    width: 11px; height: 11px; flex: 0 0 auto; border-radius: 50%;
    border: 2px solid rgba(140, 180, 230, 0.3); border-top-color: #8ab4e8;
    animation: rp-spin 0.8s linear infinite;
  }
  @keyframes rp-spin { to { transform: rotate(360deg); } }
  /* The spinner is the one thing here that MUST keep moving to mean anything, but it stops dead the
     moment the payload starts parsing — that is honest, and it is why the pill says "receiving"
     rather than showing a percentage it could not keep. */
  @media (prefers-reduced-motion: reduce) { .rp-spin { animation: none; } }

  .preset-missing {
    position: absolute; top: 0; left: 0; right: 0; z-index: 500;
    display: flex; align-items: flex-start; gap: 10px;
    padding: 8px 10px;
    background: #3a2a12; color: #ffd9a0;
    border-bottom: 1px solid #7a5a20;
    font: 400 0.78rem/1.4 system-ui, sans-serif;
  }
  .preset-missing code { font-family: ui-monospace, Consolas, monospace; font-size: 0.95em; color: #fff0d6; }
  .preset-missing .pm-text { flex: 1 1 auto; min-width: 0; }
  .pm-close {
    flex: 0 0 auto; background: none; border: none; color: inherit;
    font-size: 1.05rem; line-height: 1; cursor: pointer; padding: 0 2px;
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
  /* Embed mode: the host owns the chrome; only the back button (navigation) remains, floating. */
  .statusbar.embed { background: transparent; border-bottom: none; padding: 0; position: absolute; top: 6px; left: 8px; }
  .statusbar.embed:empty { display: none; }
  .sys-name { font-weight: 700; }
  .brand-logo { height: 20px; width: auto; max-width: 90px; object-fit: contain; }
  .brand-name { font-weight: 700; letter-spacing: 0.08em; opacity: 0.95; }
  .brand-name + .sys-name::before { content: '· '; opacity: 0.4; }
  .back-btn {
    background: transparent; color: inherit; border: 1px solid currentColor;
    border-radius: 4px; padding: 2px 9px; font: inherit; font-size: 11px; cursor: pointer; opacity: 0.85;
  }
  .back-btn:hover { opacity: 1; }

  .status { margin-left: auto; opacity: 0.85; }
  .status.live { color: #6fffa0; }
  .status.offline { color: #ffb061; }
  /* --- the live orbital-map stage (holo 3D / locked-overhead 2D) --- */
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
  /* The way back to campaign time: absent until the clock has wandered, then fades in. */
  .tc-reset { opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
  .tc-reset.on { opacity: 1; pointer-events: auto; }
  /* Campaign clock readout (follow-GM only) - same chrome as the time controls it replaces. */
  .follow-clock {
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 20;
    font-family: system-ui, sans-serif;
    font-size: 11.5px;
    letter-spacing: 0.06em;
    color: #9fb0c8;
    background: rgba(8, 11, 18, 0.72);
    border: 1px solid rgba(120, 180, 255, 0.25);
    border-radius: 8px;
    padding: 6px 10px;
    pointer-events: none;
  }
  .tc-slider { width: 130px; accent-color: #6aa0ff; }
  .time-controls:not(.expanded) { padding: 0; background: none; border: none; }
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
    /* Specific enough to BEAT the `.insp-resize { display: none }` block below it: that rule is later
       in the sheet at equal specificity, so the handle was hidden at every width and the panel could
       not be dragged at all. Found while verifying A32, whose third fault is about who owns the width
       the drag writes. */
    .inspector .insp-resize { display: block; }
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
  /* Same stops as RAINBOW_STOPS in renderDocument, so the name and the headings below it sweep alike. */
  .insp-head h2.rainbow {
    background: linear-gradient(90deg, #ff4d4d, #ff9f43, #ffd93d, #4dff88, #4db8ff, #9d6bff, #ff5ecd);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
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
</style>

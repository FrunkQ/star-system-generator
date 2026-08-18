<script lang="ts">
  export let data;
  const { exampleSystems } = data;
  import { onMount, onDestroy, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import type { RulePack, System, Starmap as StarmapType, StarSystemNode, Route } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem, renameNode, computePlayerSnapshot } from '$lib/api';
  import ReportConfigModal from '$lib/components/ReportConfigModal.svelte';
  import { validateStarmap, generateId } from '$lib/utils';
  import { broadcastService } from '$lib/broadcast';
  import { mintBroadcastId } from '$lib/broadcastId';
  import { computePlayerStarmapSnapshot } from '$lib/system/utils';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import { toLegacyMapGridType } from '$lib/map/mapOverlay';
  import { runningPresetId, liveOverrides } from '$lib/player/liveOverrides';
  import { playerPresetList } from '$lib/player/presetStore';
  import type { AnnouncePayload } from '$lib/broadcast';
  import { tagCategories } from '$lib/tags/tagCategories';
  import { tagStyleSnapshot } from '$lib/tags/tagStyleSync';
  import PlayerViewModal from '$lib/components/PlayerViewModal.svelte';
  import InterstellarTransitModal from '$lib/components/InterstellarTransitModal.svelte';
  import { brandingStore } from '$lib/catalogue/branding';
  import { starmapStore } from '$lib/starmapStore';
  import { perfStage, perfEnabled } from '$lib/perfTrace';
  import { APP_VERSION } from '$lib/constants';
  import { memoryReading, formatMB, MEMORY_WARN_FRAC, MEMORY_CRITICAL_FRAC, MEMORY_REARM_FRAC } from '$lib/memoryWatch';
  import { systemStore, viewportStore, measurementUnit, temperatureUnit } from '$lib/stores';
  import { attachStarmapUndo } from '$lib/undo/starmapUndo';
  import { setUndoPersist } from '$lib/undo/campaignHistory';
  import { hasSavedStarmap as hasPersistedStarmap, loadSavedStarmap, migrateLegacyStarmapToIndexedDb, saveStarmap,
           savePreUpgradeStarmap, loadPreUpgradeStarmap, clearPreUpgradeStarmap } from '$lib/starmapStorage';
  import NewStarmapModal from '$lib/components/NewStarmapModal.svelte';
  import RealSkyImportModal from '$lib/components/RealSkyImportModal.svelte';
  import { fillOutAll } from '$lib/import/realsky/fillout';
  import { completeImportedStars } from '$lib/import/realsky/stardefaults';
  import { PIXELS_PER_LY } from '$lib/import/realsky/constants.mjs';
  import GenerationWizard from '$lib/components/GenerationWizard.svelte';
  import Starmap from '$lib/components/Starmap.svelte';
  import SystemView from '$lib/components/SystemView.svelte';
  import BodyPicker from '$lib/components/BodyPicker.svelte';
  import TagFinder from '$lib/components/TagFinder.svelte';
  import RouteEditorModal from '$lib/components/RouteEditorModal.svelte';
  import SettingsModal from '$lib/components/SettingsModal.svelte';
  import TagCategoryEditor from '$lib/components/TagCategoryEditor.svelte';
  import { coiForStarmap, mergeStarmapCoIs, derivedStatusKey } from '$lib/constructs/coi';
  import LlmSettingsModal from '$lib/components/LlmSettingsModal.svelte';
  import EditFuelAndDrivesModal from '$lib/components/EditFuelAndDrivesModal.svelte';
  import AutopilotShipIcon from '$lib/components/AutopilotShipIcon.svelte';
  import EditAtmospheresModal from '$lib/components/EditAtmospheresModal.svelte';
  import EditLiquidsModal from '$lib/components/EditLiquidsModal.svelte';
  import EditBiospheresModal from '$lib/components/EditBiospheresModal.svelte';
  import { applyListDelta } from '$lib/rulepackDelta';
  import { allMorphologies } from '$lib/physics/vegetation';
  import { allPigments, pigmentModel } from '$lib/physics/pigments';
  import EditSensorsModal from '$lib/components/EditSensorsModal.svelte';
  import EditTemporalModal from '$lib/components/EditTemporalModal.svelte';
  import AboutModal from '$lib/components/AboutModal.svelte';
  import HelpMenuModal from '$lib/components/HelpMenuModal.svelte';
  import WelcomeModal from '$lib/components/WelcomeModal.svelte';
  import EvolutionaryWizard from '$lib/components/EvolutionaryWizard.svelte';
  import { createAnchoredTemporalState, ensureTemporalState, loadTemporalRegistryConfig, STARTDATE_EPOCH_OFFSET_T } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar, unixMsToMasterSeconds } from '$lib/temporal/utre';
  import { getJourneyBounds } from '$lib/transit/scheduler';
  import { sanitizeStarmapForRuntime } from '$lib/starmapSanitizer';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { fixUpImportedSystem, stripStarmapForExport } from '$lib/system/importFixup';
  import { collectModelsForExport, importEmbeddedModels, bytesToBase64 } from '$lib/constructs/modelTransfer';
  import { packBundle, unpackBundle, sniffBundle, BUNDLE_EXT } from '$lib/io/bundle';
  import { getModel as getStoredModel } from '$lib/constructs/modelStore';
  import { stampForSave } from '$lib/map/provenance';
  import { systemSeparation, zCounts } from '$lib/map/systemDistance';
  import { unitKind, campaignUnit, normaliseCampaignUnit, applyUnitChange, type UnitChangeMode } from '$lib/map/distanceUnits';
  import { rescaleMapBackgroundForRuler } from '$lib/map/mapBackground';
  import { shouldOfferUpgrade, dismissUpgrade, type UpgradeOffer } from '$lib/map/upgradeOffer';
  import BaseMapUpgradeModal from '$lib/components/BaseMapUpgradeModal.svelte';
  import { annotateReasonsToVisit, packsForStarmap, mergeStarmapPacks, applyStarmapReasonsConfig, reasonsConfig } from '$lib/physics/reasonsToVisit';
  import ShipPanel from '$lib/components/ShipPanel.svelte';
  import { constructDisplayPlacement, interstellarConstructIds, endJourneyAtSource } from '$lib/transit/interstellar';
  import { foreground } from '$lib/ui/foreground';

  let rulePacks: RulePack[] = [];
  let isLoading = true;
  let error: string | null = null;

  // Companion App broadcast lives here (root), not in SystemView, so the players' field guide works
  // whether the GM is on the starmap or inside a system. We own the session id; SystemView reuses it.
  // The id is the starmap's PERSISTENT `broadcastId` once a map is loaded (minted below, saved with
  // the map — docs/dev/vtt-integration-design.md 9.1/1A) so player links/QRs survive reloads and PC
  // moves; generateId() is only the pre-load fallback so the service is never idless.
  let broadcastSessionId = generateId();
  let showPlayerPresets = false;
  // Report on the STARMAP rail acts on the last-loaded system ($systemStore). The system view has its
  // own copy inside SystemView; this mirrors it so the rail entry works from the starmap too.
  let showReportConfigModal = false;
  function handleStarmapReport(event: CustomEvent<{ mode: 'GM' | 'Player'; theme: string; includeConstructs: boolean }>) {
    const sys = get(systemStore);
    showReportConfigModal = false;
    if (!sys) return;
    sessionStorage.setItem('reportData', JSON.stringify({
      system: sys, mode: event.detail.mode, theme: event.detail.theme,
      includeConstructs: event.detail.includeConstructs,
      units: get(measurementUnit), tempUnit: get(temperatureUnit)
    }));
    window.open('/report', '_blank');
  }
  let showInterstellarModal = false;
  let interstellarShipId = '';

  let showNewStarmapModal = false;
  let showRealSkyImportModal = false;
  let showGenerationWizard = false;
  let pendingWizardPosition: { x: number; y: number; z?: number } | null = null;
  let showEvolutionaryWizard = false;
  let pendingStarmapData: any = null;
  let currentSystemId: string | null = null;
  let previousSystemId: string | null = null;
  let selectedSystemForLink: string | null = null;

  let showRouteEditorModal = false;
  let routeToEdit: Route | null = null;
  let showSettingsModal = false;
  let showLlmSettingsModal = false;
  let showTagEditor = false;
  // Technology editors (rulepack overrides) + About — moved up here from Starmap so the
  // sectioned Settings modal can open them from either view.
  let showFuelModal = false;
  let showAtmosphereModal = false;
  let showLiquidsModal = false;
  let showBiospheresModal = false;
  let showSensorsModal = false;
  let showTemporalModal = false;
  let showAbout = false;
  let showHelpMenu = false;
  // First-run V2 welcome (shown once — returning V1 users need to know what changed).
  // Bumped with the welcome itself: anyone who dismissed the V2 one has this flag
  // already set, so a new welcome needs a new key or nobody ever sees it.
  const WELCOME_KEY = 'sse_welcome_v3_seen';
  let showWelcome = false;
  function dismissWelcome() {
    showWelcome = false;
    try { if (browser) localStorage.setItem(WELCOME_KEY, '1'); } catch { /* private mode */ }
  }
  // Sub-editors opened FROM Settings reopen it (at the section they came from) when closed,
  // so Back/close walks up the hierarchy instead of dumping the user back in the app.
  let settingsReturnSection: 'starmap' | 'time' | 'technology' | 'planets' | 'system' | null = null;
  function returnToSettings() {
    if (settingsReturnSection) showSettingsModal = true;
  }
  function applyStarmapOverrides(overrides: any) {
    starmapStore.update((s) => {
      if (!s) return s;
      const next: any = { ...s.rulePackOverrides, ...overrides };
      // An editor that hands back `undefined` for a section is saying "no override at all" — the GM
      // changed nothing, or changed it back. REMOVE the key rather than storing an empty one, or a
      // campaign accumulates a set of overrides that say nothing and read as if they said something.
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      return { ...s, rulePackOverrides: next };
    });
  }

  // Begin an interstellar journey from the transit planner: stamp it with the current game clock so
  // the ship marker animates along the starmap as time plays/scrubs.
  function handleStartJourney(e: CustomEvent<any>) {
    const d = e.detail;
    starmapStore.update((s) => {
      if (!s) return s;
      const startTimeSec = s.temporal?.displayTimeSec ?? '0';
      const journey = {
        id: `journey-${generateId()}`,
        shipId: d.shipId,
        shipName: d.shipName,
        fromSystemId: d.fromSystemId,
        toSystemId: d.toSystemId,
        toBodyId: d.toBodyId ?? null,
        toBodyName: d.toBodyName,
        mode: d.mode,
        startTimeSec: String(startTimeSec),
        durationSec: d.observerSeconds,
        ...(d.cannotStop ? { cannotStop: true } : {}),
        ...(d.toX != null && d.toY != null ? { toX: d.toX, toY: d.toY, toLabel: d.toLabel } : {}),
        ...(d.fromX != null && d.fromY != null ? { fromX: d.fromX, fromY: d.fromY, fromLabel: d.fromLabel } : {}),
        ...(d.redirectDvMs ? { redirectDvMs: d.redirectDvMs } : {}),
      };
      // Realistic mode drains the propellant the trip burns from the ship's tanks (scaled across tanks so
      // the total drops by the used mass). Departing spends the fuel even if the journey is later cancelled.
      const drainKg = Number(d.fuelUsedKg) || 0;
      const fuelDefs = (effectiveRulePack || selectedRulepack)?.fuelDefinitions?.entries || [];
      const systems = (drainKg <= 0) ? s.systems : s.systems.map((sys) => {
        if (sys.id !== d.fromSystemId || !sys.system?.nodes) return sys;
        const nodes = sys.system.nodes.map((n: any) => {
          if (n.id !== d.shipId || !n.fuel_tanks?.length) return n;
          let total = 0;
          for (const t of n.fuel_tanks) { const fd = fuelDefs.find((f: any) => f.id === t.fuel_type_id); if (fd) total += (t.current_units ?? 0) * fd.density_kg_per_m3; }
          if (total <= 0) return n;
          const factor = Math.max(0, (total - drainKg) / total);
          return { ...n, fuel_tanks: n.fuel_tanks.map((t: any) => ({ ...t, current_units: (t.current_units ?? 0) * factor })) };
        });
        return { ...sys, system: { ...sys.system, nodes } };
      });
      // One live journey per ship — starting a new one replaces any prior flight for that ship.
      const others = (s.activeJourneys ?? []).filter((j) => j.shipId !== d.shipId);
      return { ...s, systems, activeJourneys: [...others, journey] };
    });
    showInterstellarModal = false;
  }

  // --- All-Bodies picker (cross-starmap directory): find any body/construct across every
  // system and jump straight to it. Lives in the rail (PC side panel) / + menu (mobile). ---
  let showAllBodies = false;
  let showTagFinder = false; // find bodies by tag across all systems
  let showAllShips = false; // constructs-only directory ("Ships")
  let showRoutes = false; // routes & journeys list (in-system underway/planned + interstellar)
  $: routesData = (() => {
    const map = $starmapStore;
    if (!map) return { interstellar: [] as any[], journeys: [] as any[], interstellarJourneys: [] as any[], stranded: [] as any[], autopilotShips: [] as any[] };
    const sysName = (id: string) => map.systems.find((s) => s.id === id)?.name ?? id;
    const interstellar = (map.routes ?? []).map((r) => ({
      id: r.id, source: sysName(r.sourceSystemId), target: sysName(r.targetSystemId), distance: r.distance, unit: r.unit, name: r.name
    }));
    // Live interstellar flights (ships in transit between systems) — stored on the starmap, not on a
    // construct, so they're gathered separately. Status/progress + timing come from the game clock.
    const nowSec = Number(map.temporal?.displayTimeSec ?? 0);
    const cal = map.temporal?.temporal_registry?.[map.temporal?.activeCalendarKey ?? ''];
    const fmtDate = (sec: number) => { try { return cal ? resolveCalendar(BigInt(Math.round(sec)), cal).formatted : ''; } catch { return ''; } };
    const dDays = (sec: number) => Math.round((sec - nowSec) / 86400);   // +ahead / −behind, in days
    const rel = (sec: number) => { const d = dDays(sec); return d === 0 ? 'today' : d > 0 ? `in ${d}d` : `${-d}d ago`; };
    // A "when" line for a journey given its start/end (game seconds) + status.
    const whenLine = (start: number, end: number, status: string, pct: number) =>
      status === 'scheduled' ? `Departs ${fmtDate(start)} · ${rel(start)}`
      : status === 'completed' ? `Arrived ${fmtDate(end)} · ${rel(end)}`
      : `${pct}% · departed ${rel(start)} · arrives ${fmtDate(end)} (${rel(end)})`;
    const interstellarJourneys = (map.activeJourneys ?? []).map((j: any) => {
      const start = Number(j.startTimeSec ?? 0);
      const end = start + Number(j.durationSec ?? 0);
      const status = nowSec < start ? 'scheduled' : (nowSec >= end ? 'completed' : 'active');
      const pct = end > start ? Math.max(0, Math.min(100, Math.round(((nowSec - start) / (end - start)) * 100))) : 0;
      return {
        id: j.id, shipName: j.shipName ?? 'Ship', from: sysName(j.fromSystemId), to: sysName(j.toSystemId),
        fromSystemId: j.fromSystemId, toSystemId: j.toSystemId, toBodyId: j.toBodyId ?? null, toBodyName: j.toBodyName, status, pct,
        when: whenLine(start, end, status, pct)
      };
    });
    // Manual/player journeys go in the main list; autopilot-flown ones are pulled out and grouped per-ship
    // under the "Under autopilot" heading (kept off the manual list, and collapsible since a route can be long).
    const journeys: any[] = [];
    const apJourneysByConstruct: Record<string, any[]> = {};
    for (const sys of map.systems) {
      const nodes = sys.system?.nodes ?? [];
      const nodeName = (id: string) => (nodes as any[]).find((n) => n.id === id)?.name ?? id;
      for (const n of nodes as any[]) {
        if (n.kind !== 'construct') continue;
        for (const j of (n.scheduled_journeys ?? [])) {
          if (j.status !== 'scheduled' && j.status !== 'active') continue;
          const plans = j.plans ?? [];
          if (!plans.length) continue;
          const bounds = getJourneyBounds(plans);   // unix-MS timestamps
          // In-system journeys are unix-ms; whenLine/nowSec work in MASTER (since-Big-Bang) seconds. Convert,
          // or the dates resolve ~13.8 billion years off (the Big-Bang offset). See docs/time-architecture.md.
          const startS = bounds ? Number(unixMsToMasterSeconds(bounds.startMs)) : nowSec;
          const endS = bounds ? Number(unixMsToMasterSeconds(bounds.endMs)) : nowSec;
          const row = {
            id: j.id, constructId: n.id, constructName: n.name, systemId: sys.id, systemName: sys.name,
            origin: nodeName(plans[0].originId), target: nodeName(plans[plans.length - 1].targetId),
            status: j.status, legs: plans.length,
            when: whenLine(startS, endS, j.status, endS > startS ? Math.max(0, Math.min(100, Math.round(((nowSec - startS) / (endS - startS)) * 100))) : 0)
          };
          if (j.autopilot) (apJourneysByConstruct[n.id] = apJourneysByConstruct[n.id] || []).push(row);
          else journeys.push(row);
        }
      }
    }
    // Stranded = cut loose, coasting (not under power, not orbiting). In-system: a construct carrying a
    // cancelled journey with a captured cancelState. Interstellar: anything in adriftConstructs. (Times kept
    // out of here deliberately until the clock/epoch audit — just who & where.)
    const stranded: any[] = [];
    for (const sys of map.systems) {
      for (const n of (sys.system?.nodes ?? []) as any[]) {
        if (n.kind !== 'construct') continue;
        const cancelled = (n.scheduled_journeys ?? []).filter((j: any) => j.status === 'cancelled' && j.cancelState);
        if (!cancelled.length) continue;
        const last = cancelled[cancelled.length - 1];
        // Only stranded if the drift hasn't been SUPERSEDED — i.e. no later (non-cancelled) journey has
        // started since the cancel. A rescued ship now on/finished a new journey isn't adrift any more.
        // (Mirrors the supersede fix in sampleJourneyKinematicsAtTime / isCoastingNow.)
        const cancelSec = last.cancelledAtSec ? Number(last.cancelledAtSec) : 0;
        const superseded = (n.scheduled_journeys ?? []).some((j: any) => {
          if (j.status === 'cancelled') return false;
          const b = getJourneyBounds(j.plans ?? []);
          if (!b) return false;
          const startSec = b.startMs / 1000;
          return startSec > cancelSec && nowSec >= startSec;
        });
        if (superseded) continue;
        const plans = last.plans ?? [];
        const wasBound = plans.length ? ((sys.system?.nodes ?? []) as any[]).find((x) => x.id === plans[plans.length - 1].targetId)?.name : null;
        stranded.push({ id: n.id, constructName: n.name, where: sys.name, systemId: sys.id, wasBound, interstellar: false });
      }
    }
    for (const a of (map.adriftConstructs ?? [])) {
      if (!a.construct?.id) continue;
      const j = (map.activeJourneys ?? []).find((x: any) => x.shipId === a.construct.id);
      stranded.push({ id: a.construct.id, constructName: a.construct.name ?? 'Ship', where: 'Interstellar space', wasBound: sysName(a.toSystemId ?? ''), interstellar: true, journeyId: j?.id ?? null });
    }
    // Under autopilot — constructs with an engaged plan. (Plan summary for now; live action + the "!" stuck
    // marker arrive with the planner. Capture-only.)
    const autopilotShips: any[] = [];
    const TRAVERSAL_LABEL: Record<string, string> = { 'in-order': 'all in order', 'best-order': 'all, best order', 'any': 'any as needed' };
    for (const sys of map.systems) {
      for (const n of (sys.system?.nodes ?? []) as any[]) {
        if (n.kind !== 'construct' || !n.autopilot?.enabled) continue;
        const ap = n.autopilot;
        const nodeName = (id: string) => ((sys.system?.nodes ?? []) as any[]).find((x) => x.id === id)?.name ?? 'somewhere';
        const resNames = (keys: string[] = []) => keys.map((k: string) => k === 'people/passengers' ? 'passengers' : k.split('/')[1]).join('/');
        const legText = (leg: any) => {
          if (!leg) return '';
          if (leg.action === 'mine') return `mine ${resNames(leg.resourceKeys) || 'resource'}`;
          if (leg.action === 'transport') return `transport ${resNames(leg.resourceKeys) || 'cargo'}${leg.placeId ? ` from ${nodeName(leg.placeId)}` : ''}`;
          if (leg.action === 'escort') return `escort ${leg.placeId ? nodeName(leg.placeId) : 'ship'}${leg.escortKm != null ? ` @ ${leg.escortKm}km` : ''}`;
          const fly = (leg.loiterDays ?? 0) === 0;
          if (leg.action === 'patrol') return `${fly ? 'flyby' : 'patrol'} ${leg.placeId ? nodeName(leg.placeId) : 'system'}`;
          return `${fly ? 'flyby' : 'explore'}${resNames(leg.resourceKeys) ? ' for ' + resNames(leg.resourceKeys) : ''}`;
        };
        const first = ap.legs?.[0];
        const tail = `${TRAVERSAL_LABEL[ap.traversal] ?? ap.traversal}${ap.repeat === false ? ' · once' : ''}`;
        const summary = first ? `${legText(first)}${ap.legs.length > 1 ? ` +${ap.legs.length - 1}` : ''} · ${tail}` : 'no stops set';
        // Attention marker. orange = needs GM setup (no stops). red = stuck: engaged with a route but the
        // planner produced no journeys (couldn't reach/fuel the first hop, or all journeys were aborted).
        const hasLiveJourneys = (n.scheduled_journeys || []).some((l: any) => l.status !== 'cancelled');
        const attention = !ap.legs?.length ? 'intervention' : !hasLiveJourneys ? 'stuck' : null;
        const attentionLabel = attention === 'stuck' ? 'Stuck — no journeys (could not reach/fuel the next stop)' : attention === 'intervention' ? 'Needs setup — no stops added' : '';
        autopilotShips.push({ id: n.id, constructName: n.name, where: sys.name, systemId: sys.id, summary, attention, attentionLabel, journeys: apJourneysByConstruct[n.id] ?? [] });
      }
    }
    // Attention-needing ships sort to the top — best way to scan the fleet at a glance.
    const ATTN_RANK: Record<string, number> = { stuck: 0, intervention: 1, done: 2 };
    autopilotShips.sort((a, b) => (ATTN_RANK[a.attention] ?? 3) - (ATTN_RANK[b.attention] ?? 3));
    // Worst current attention across the fleet → drives the rail Routes notification dot.
    const worstAttention = autopilotShips.find((s) => s.attention)?.attention ?? null;
    return { interstellar, journeys, interstellarJourneys, stranded, autopilotShips, worstAttention };
  })();
  $: allShips = allBodies.filter((n: any) => n.kind === 'construct');
  $: allBodies = (() => {
    const map = $starmapStore;
    if (!map) return [] as any[];
    const nowSec = Number(map.temporal?.displayTimeSec ?? 0);
    const interIds = interstellarConstructIds(map, nowSec);
    const out: any[] = [];
    for (const sys of map.systems) {
      const sysName = sys.name;
      for (const n of (sys.system?.nodes ?? [])) {
        if (n.kind !== 'body' && n.kind !== 'construct') continue;
        // An interstellar construct (in transit / stranded) has left its system — list it under
        // "Interstellar space", not its source system, so it isn't found where it no longer is.
        if (n.kind === 'construct' && interIds.has(n.id)) {
          const j = (map.activeJourneys ?? []).find((x) => x.shipId === n.id);
          out.push({ ...n, __systemId: `interstellar:${n.id}`, __systemName: 'Interstellar space', __interstellar: true, __journeyId: j?.id ?? null });
        } else {
          out.push({ ...n, __systemId: sys.id, __systemName: sysName });
        }
      }
    }
    // Constructs fully pulled out into interstellar space (no longer in any system's nodes).
    for (const a of (map.adriftConstructs ?? [])) {
      const c = a.construct;
      if (c && !out.some((x) => x.id === c.id)) {
        out.push({ ...c, __systemId: `interstellar:${c.id}`, __systemName: 'Interstellar space', __interstellar: true, __journeyId: null });
      }
    }
    return out;
  })();
  // Find-by-tag node + scope lists. Interstellar constructs (in transit OR stranded) belong to no system
  // map, so each becomes its own pseudo-"system" (id `interstellar:<id>`) grouped at the bottom of the
  // scope dropdown; "All systems" still includes them. Adrift ships (not in any system's nodes) are added.
  $: tagFinderNodes = (() => {
    const map = $starmapStore;
    if (!map) return [] as any[];
    const nowSec = Number(map.temporal?.displayTimeSec ?? 0);
    const interIds = interstellarConstructIds(map, nowSec);
    const out: any[] = [];
    for (const sys of map.systems) {
      for (const n of (sys.system?.nodes ?? [])) {
        if (n.kind !== 'body' && n.kind !== 'construct') continue;
        if (n.kind === 'construct' && interIds.has(n.id)) {
          // Mirror the internal interstellar state as a (non-persisted) derived Status tag so you can
          // find e.g. all adrift / in-transit ships by tag — the rescue search.
          const sk = derivedStatusKey(constructDisplayPlacement(map, n.id, nowSec).kind);
          const tags = sk ? [...(n.tags ?? []), { key: sk, coi: true, derived: true }] : (n.tags ?? []);
          out.push({ ...n, tags, __systemId: `interstellar:${n.id}`, __systemName: n.name, __interstellar: true });
        } else if (n.kind === 'construct') {
          // In-system construct mid an in-system transit (a scheduled journey straddling now) gets the
          // derived "In transit (in-system)" status, mirroring the interstellar mirror above.
          const midTransit = (n.scheduled_journeys ?? []).some((j: any) => {
            if (j.status !== 'active' && j.status !== 'scheduled') return false;
            const b = (j.plans?.length) ? getJourneyBounds(j.plans) : null;
            return b ? (b.startMs / 1000 <= nowSec && nowSec < b.endMs / 1000) : false;
          });
          const tags = midTransit ? [...(n.tags ?? []), { key: 'status/in-transit-system', coi: true, derived: true }] : (n.tags ?? []);
          out.push({ ...n, tags, __systemId: sys.id, __systemName: sys.name });
        } else {
          out.push({ ...n, __systemId: sys.id, __systemName: sys.name });
        }
      }
    }
    for (const a of (map.adriftConstructs ?? [])) {
      const c = a.construct; if (!c) continue;
      if (out.some((n) => n.id === c.id)) continue;   // already added via a journey above
      const sk = derivedStatusKey(constructDisplayPlacement(map, c.id, nowSec).kind);
      const tags = sk ? [...(c.tags ?? []), { key: sk, coi: true, derived: true }] : (c.tags ?? []);
      out.push({ ...c, tags, __systemId: `interstellar:${c.id}`, __systemName: c.name, __interstellar: true });
    }
    return out;
  })();
  $: tagFinderSystems = (() => {
    const real = ($starmapStore?.systems ?? []).map((s) => ({ id: s.id, name: s.name, interstellar: false }));
    const seen = new Set<string>(); const inter: { id: string; name: string; interstellar: boolean }[] = [];
    for (const n of tagFinderNodes) if (n.__interstellar && !seen.has(n.__systemId)) { seen.add(n.__systemId); inter.push({ id: n.__systemId, name: n.__systemName, interstellar: true }); }
    return [...real, ...inter];
  })();

  // Every distinct tag key across the starmap — fed to the PoI editor for its "has tag" conditions.
  $: allTagKeys = (() => {
    const s = new Set<string>();
    for (const n of allBodies) for (const t of (n.tags ?? [])) if (t?.key) s.add(t.key);
    return [...s];
  })();
  function allBodiesContext(n: any): string {
    if (n.__interstellar) return 'Interstellar space';
    const parent = allBodies.find((x) => x.id === (n.orbit?.hostId || n.parentId) && x.__systemId === n.__systemId);
    const where = parent ? `orbits ${parent.name}` : '';
    return [n.__systemName, where].filter(Boolean).join(' · ');
  }
  function enterSystemAndFocus(sysId: string, focusId: string | null) {
    const currentMap = get(starmapStore);
    const systemNode = currentMap?.systems.find((s) => s.id === sysId);
    if (!systemNode) return;
    viewportStore.set(systemNode.viewport ?? { pan: { x: 0, y: 0 }, zoom: 1 });
    systemStore.set(JSON.parse(JSON.stringify(systemNode.system)));
    pushState('', focusId ? { systemId: sysId, focusId } : { systemId: sysId });
  }
  function handleAllBodiesSelect(e: CustomEvent<string>) {
    const node = allBodies.find((n) => n.id === e.detail);
    showAllBodies = false;
    if (!node) return;
    // Interstellar construct → open its starmap ship panel (it has no system to enter).
    if (node.__interstellar) {
      if (node.__journeyId) { if (currentSystemId) exitToStarmap(); shipPanelJourneyId = node.__journeyId; }
      return;
    }
    enterSystemAndFocus(node.__systemId, node.id);
  }
  function handleTagFinderSelect(e: CustomEvent<{ systemId: string; id: string }>) {
    showTagFinder = false;
    // An interstellar construct has no system to enter — open its starmap-level ship panel instead.
    if (e.detail.systemId?.startsWith('interstellar:')) {
      const j = ($starmapStore?.activeJourneys ?? []).find((x) => x.shipId === e.detail.id);
      if (j) { if (currentSystemId) exitToStarmap(); shipPanelJourneyId = j.id; }
      return;
    }
    enterSystemAndFocus(e.detail.systemId, e.detail.id);
  }
  // Inter-system distance from the system the GM is currently in, in the map's unit — only meaningful
  // on a scaled map and when inside a system. Null otherwise (→ TagFinder sorts alphabetically).
  // --- Starmap-level ship panel (an in-flight / stranded / arrived construct, opened from its
  // starmap marker). Full construct editor + in-flight controls, all against the store. ---
  let shipPanelJourneyId: string | null = null;
  $: shipPanel = (() => {
    const map = $starmapStore;
    if (!shipPanelJourneyId || !map) return null;
    const j = (map.activeJourneys ?? []).find((x) => x.id === shipPanelJourneyId);
    if (!j) return null;
    const sysNode = map.systems.find((s) => s.id === j.fromSystemId);   // construct still lives here pre-reconcile
    const construct = sysNode?.system?.nodes.find((n) => n.id === j.shipId) as any;
    if (!construct || !sysNode?.system) return null;
    const host = (sysNode.system.nodes.find((n) => n.id === construct.parentId) as any) ?? null;
    const p = constructDisplayPlacement(map, j.shipId, Number(map.temporal?.displayTimeSec ?? 0));
    let status: 'before' | 'transit' | 'adrift' | 'arrived' = 'before';
    let frac = 0;
    if (p.kind === 'transit') { status = 'transit'; frac = p.frac; }
    else if (p.kind === 'adrift') status = 'adrift';
    else if (p.kind === 'system' && p.systemId === j.toSystemId) status = 'arrived';
    return { journey: j, construct, system: sysNode.system, host, status, frac, fromName: sysNode.name, toName: map.systems.find((s) => s.id === j.toSystemId)?.name ?? '' };
  })();
  function handleShipResolve(journeyId: string, outcome: 'return' | 'arrive' | 'strand', coast?: boolean) {
    const m = $starmapStore;
    if (!m) return;
    const nowSec = String(m.temporal?.displayTimeSec ?? '0');
    // Send-home / cancel actually REMOVES the journey (it's undone — the ship is back in its origin), not
    // just marks it. Any later journeys for the same vessel become invalid (the chain can't skip a leg),
    // so they're removed too — with a warning that lists them first.
    if (outcome === 'return') {
      const journey = (m.activeJourneys ?? []).find((j) => j.id === journeyId);
      if (!journey) return;
      const sName = (id?: string) => m.systems.find((s) => s.id === id)?.name ?? id ?? '?';
      const future = (m.activeJourneys ?? []).filter((j) => j.id !== journeyId && j.shipId === journey.shipId);
      if (future.length) {
        const list = future.map((f) => `• ${sName(f.fromSystemId)} → ${sName(f.toSystemId)}`).join('\n');
        if (!confirm(`Cancelling this journey will permanently remove ${future.length} onward journey(s) for ${journey.shipName} (the chain can't continue without this leg):\n\n${list}\n\nProceed?`)) return;
      }
      let next = endJourneyAtSource(m, journeyId);          // drops the journey, ship stays in its origin
      if (future.length) next = { ...next, activeJourneys: (next.activeJourneys ?? []).filter((j) => j.shipId !== journey.shipId) };
      starmapStore.set(next);
      shipPanelJourneyId = null;                             // journey's gone — close its panel
      return;
    }
    // arrive / strand stay reversible (resume / re-fly) — just record the outcome.
    starmapStore.update((mm) => mm ? { ...mm, activeJourneys: (mm.activeJourneys ?? []).map((j) => j.id === journeyId ? { ...j, outcome, endedAtSec: nowSec, ...(outcome === 'strand' ? { strandCoast: coast } : {}) } : j) } : mm);
  }
  function handleShipResume(journeyId: string) {
    starmapStore.update((m) => m ? { ...m, activeJourneys: (m.activeJourneys ?? []).map((j) => j.id === journeyId ? { ...j, outcome: undefined, endedAtSec: undefined } : j) } : m);
  }
  function handleShipConstructUpdate(updated: any) {
    starmapStore.update((m) => m ? { ...m, systems: m.systems.map((s) => s.system ? { ...s, system: { ...s.system, nodes: s.system.nodes.map((n) => n.id === updated.id ? updated : n) } } : s) } : m);
  }

  // Refuel a starmap ship (fill its tanks). The construct still lives in its origin-system node.
  function handleShipRefuel(constructId: string) {
    starmapStore.update((m) => m ? { ...m, systems: m.systems.map((s) => s.system ? { ...s, system: { ...s.system, nodes: s.system.nodes.map((n) => (n.id === constructId && Array.isArray((n as any).fuel_tanks)) ? { ...n, fuel_tanks: (n as any).fuel_tanks.map((t: any) => ({ ...t, current_units: t.capacity_units })) } : n) } } : s) } : m);
  }

  function tagFinderDistance(systemId: string): number | null {
    const map = $starmapStore;
    if (systemId?.startsWith('interstellar:')) return null;   // interstellar ships have no system distance
    if (!currentSystemId || !map || (map.mapMode ?? 'diagrammatic') !== 'scaled') return null;
    if (systemId === currentSystemId) return 0;
    return getSystemDistanceLy(map, currentSystemId, systemId);
  }

  let selectedRulepack: RulePack | undefined;
  let fileInput: HTMLInputElement;
  let starmapComponent: Starmap;
  let hasSavedStarmap = false;
  let persistQueue: Promise<void> = Promise.resolve();

  $: currentSystemId = $page.state.systemId || null;

  // Robustly handle System -> Starmap transition (whether via Back button or UI)
  $: if (currentSystemId !== previousSystemId) {
      // console.log('System ID Change:', { from: previousSystemId, to: currentSystemId });
      if (previousSystemId && !currentSystemId) {
          // console.log('Exiting System View: Saving state and clearing store');
          // Exiting System View: Save state
          saveSystemState(previousSystemId);
          // Clear system store to free memory/reset views
          systemStore.set(null);
      }
      previousSystemId = currentSystemId;
  }

  function saveSystemState(sysId: string) {
      const currentViewport = get(viewportStore);
      const currentSystem = get(systemStore);

      starmapStore.update(starmap => {
          if (starmap && currentSystem) {
              const systemNode = starmap.systems.find(s => s.id === sysId);
              if (systemNode) {
                  systemNode.viewport = currentViewport;
                  systemNode.system = currentSystem;
                  // The map label tracks the primary star's name only until the GM gives the system
                  // its own name (see isNameUserDefined) — then it's pinned.
                  if (!systemNode.isNameUserDefined) systemNode.name = currentSystem.name;
                  const fallbackSec = BigInt(Math.floor((currentSystem.epochT0 || Date.now()) / 1000));
                  const temporalDisplaySec = parseClockSeconds(starmap.temporal?.displayTimeSec, fallbackSec).toString();
                  systemNode.time = { ...(systemNode.time || {}), displayTimeSec: temporalDisplaySec };
              }
          }
          return starmap;
      });
  }

  function getSystemEpochSeconds(node: StarSystemNode): bigint {
    return BigInt(Math.floor((node.system?.epochT0 || Date.now()) / 1000));
  }

  function getEffectiveSystemDisplaySeconds(starmap: StarmapType, node: StarSystemNode): bigint {
    const normalized = ensureTemporalState(starmap);
    const temporal = normalized.temporal!;
    const masterSec = parseClockSeconds(temporal.masterTimeSec, getSystemEpochSeconds(node));
    const globalDisplaySec = parseClockSeconds(temporal.displayTimeSec, masterSec);
    return globalDisplaySec;
  }

  $: effectiveRulePack = (() => {
      if (!selectedRulepack) return undefined;
      // Deep clone to avoid mutating the original rulepack which might be cached
      const pack = JSON.parse(JSON.stringify(selectedRulepack));

      if ($starmapStore?.rulePackOverrides) {
          const overrides = $starmapStore.rulePackOverrides;

          if (overrides.fuelDefinitions && pack.fuelDefinitions) {
              overrides.fuelDefinitions.forEach((f: any) => {
                  const idx = pack.fuelDefinitions.entries.findIndex((d: any) => d.id === f.id);
                  if (idx !== -1) pack.fuelDefinitions.entries[idx] = f;
                  else pack.fuelDefinitions.entries.push(f);
              });
          }

          if (overrides.engineDefinitions && pack.engineDefinitions) {
              overrides.engineDefinitions.forEach((e: any) => {
                  const idx = pack.engineDefinitions.entries.findIndex((d: any) => d.id === e.id);
                  if (idx !== -1) pack.engineDefinitions.entries[idx] = e;
                  else pack.engineDefinitions.entries.push(e);
              });
          }

          if (overrides.sensorDefinitions && pack.sensorDefinitions) {
              overrides.sensorDefinitions.forEach((s: any) => {
                  const idx = pack.sensorDefinitions.entries.findIndex((d: any) => d.id === s.id);
                  if (idx !== -1) pack.sensorDefinitions.entries[idx] = s;
                  else pack.sensorDefinitions.entries.push(s);
              });
          }

          if (overrides.gasPhysics) {
              pack.gasPhysics = { ...pack.gasPhysics, ...overrides.gasPhysics };
          }

          if (overrides.atmosphereCompositions && pack.distributions?.['atmosphere_composition']) {
              pack.distributions['atmosphere_composition'].entries = overrides.atmosphereCompositions;
          }

          if (overrides.liquids && overrides.liquids.length) {
              pack.liquids = overrides.liquids;  // whole-list replace; allLiquids(pack) prefers pack.liquids
          }

          // DELTAS laid over the pack's own lists, so anything the GM never touched keeps tracking
          // the shipped defaults. applyListDelta also accepts a whole list, which is what campaigns
          // saved before this carry.
          if (overrides.morphologies) {
              pack.morphologies = applyListDelta(allMorphologies(pack), overrides.morphologies, (m) => m.key);
          }
          if (overrides.pigments) {
              pack.pigments = applyListDelta(allPigments(pack), overrides.pigments, (p) => p.key);
          }
          if (overrides.pigmentModel) {
              pack.pigmentModel = { ...pigmentModel(pack), ...overrides.pigmentModel };
          }
      }
      return pack;
  })();

  onMount(async () => {
    try {
      const starterRulepack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json');
      rulePacks = [starterRulepack];
      selectedRulepack = starterRulepack;
      await loadTemporalRegistryConfig('/temporal/calendars.json');
    } catch (e: any) {
      error = e.message;
    } finally {
      isLoading = false;
    }

    // First-run V2 welcome — once per browser, independent of whether a starmap exists (V1 upgraders
    // have a saved map; new users don't). Shown over whatever loads underneath.
    try { if (browser && localStorage.getItem(WELCOME_KEY) !== '1') showWelcome = true; } catch { /* private mode */ }

    await migrateLegacyStarmapToIndexedDb();
    // The undo has to survive a reload — a GM who upgrades, closes the tab and thinks better of it tomorrow
    // still has the offer waiting in Settings.
    await refreshPreUpgradeSnapshot();
    hasSavedStarmap = await hasPersistedStarmap();
    if (hasSavedStarmap) {
      // Safe-mode brake: if the guard stamp survived from last time, the previous load never
      // reached a painted frame — auto-loading again would just repeat the hang. Ask instead.
      const tripped = loadGuardTripped();
      if (tripped) {
        console.warn('[sse-load] previous load did not complete; last stage:', tripped);
        loadGuardPrompt = tripped;
      } else {
        await handleLoadStarmap();
      }
    } else {
      showNewStarmapModal = true;
    }
  });

  // --- WS8: offer to move a campaign onto the updated bundled base map ---
  // Checked once per campaign id, whichever way it arrived (browser storage on startup, a loaded file, the
  // example map), because a GM whose campaign only ever lived in IndexedDB never "loads a file" at all and
  // would otherwise never see the offer. Every decision to stay quiet lives in shouldOfferUpgrade().
  let baseMapOffer: UpgradeOffer | null = null;
  let checkedUpgradeFor: string | null = null;
  async function maybeOfferBaseMapUpgrade(map: StarmapType | null) {
    if (!browser || !map || checkedUpgradeFor === map.id) return;
    checkedUpgradeFor = map.id;
    try {
      const result = await shouldOfferUpgrade(map);
      if (result.offer) baseMapOffer = result;
      else console.info('[base map] no upgrade offered:', result.reason);
    } catch (e) {
      console.warn('[base map] upgrade check failed', e);
    }
  }
  $: maybeOfferBaseMapUpgrade($starmapStore);

  // Accepting: the rebased campaign takes its systems from the bundled FILE, so they are authored inputs
  // that have not been through the physics engine yet — re-derive before it becomes current, exactly as
  // every other load path does.
  //
  // The snapshot is written BEFORE the store changes. Browser storage holds one campaign, so without this
  // the original would be overwritten by the next autosave, and the upgrade screen's promise that the GM
  // can go back to it would be false.
  async function acceptBaseMapUpgrade(next: StarmapType) {
    const original = $starmapStore;
    baseMapOffer = null;
    checkedUpgradeFor = next.id; // it is stamped to the current edition; do not re-offer
    if (original) {
      const stored = await savePreUpgradeStarmap(original);
      if (!stored) {
        alert(
          'The upgrade is ready, but a copy of your current campaign could not be kept in this browser.\n\n' +
          'Save your campaign to a file first if you have not already — otherwise there will be no way back to it.'
        );
      }
    }
    starmapStore.set(await recalcAllSystems(next));
    preUpgradeSnapshotName = original?.name ?? null;
  }

  // The undo, offered from Settings once a snapshot exists. Restoring is a decision, so the upgrade is not
  // offered again for that campaign afterwards — they have already seen it and said no.
  let preUpgradeSnapshotName: string | null = null;
  async function refreshPreUpgradeSnapshot() {
    if (!browser) return;
    preUpgradeSnapshotName = (await loadPreUpgradeStarmap())?.name ?? null;
  }
  async function restorePreUpgradeStarmap() {
    const snap = await loadPreUpgradeStarmap();
    if (!snap) { preUpgradeSnapshotName = null; return; }
    dismissUpgrade(snap.id);
    checkedUpgradeFor = snap.id;
    starmapStore.set(await recalcAllSystems(snap));
    await clearPreUpgradeStarmap();
    preUpgradeSnapshotName = null;
    showSettingsModal = false;
  }

  // --- Companion App broadcast (whole redacted starmap) ---
  // The player snapshot carries the GM's LIVE snap-grid (type + cell size) so the player-view starmap
  // draws the identical grid — the grid shape is UI state, not saved on the map, so it's injected here.
  function starmapSnapshotForPlayers(map: import('$lib/types').Starmap) {
    const ui = get(starmapUiStore);
    const type = toLegacyMapGridType(ui.travellerMode ? 'traveller-hex' : ui.gridType);
    return { ...computePlayerStarmapSnapshot(map), mapGrid: { type, size: 50 } };
  }
  // VTT integration discovery payload: what a host app (Mappadux StarMap, a Foundry/Owlbear shim)
  // needs to FIND, LABEL and CONNECT to this campaign. Identity + Player View names only.
  function announceNow(): AnnouncePayload | null {
    const map = get(starmapStore);
    if (!map?.broadcastId) return null;
    return {
      sessionId: map.broadcastId,
      starmapId: map.id,
      starmapName: map.name,
      presets: get(playerPresetList).map((p) => ({ id: p.id, name: p.name })),
      appVersion: APP_VERSION,
    };
  }
  let remoteNotice: string | null = null;
  let remoteNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  onDestroy(() => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (remoteNoticeTimer) clearTimeout(remoteNoticeTimer);
  });
  // Proactive re-announce on identity/preset-list change, so an open bridge hears a rename, a
  // different map loading, or a new Player View without polling. Fingerprint-gated like the rest.
  $: if (browser && $starmapStore?.broadcastId && $playerPresetList) {
    const a = announceNow();
    if (a) broadcastService.sendIfChanged({ type: 'ANNOUNCE', payload: a });
  }
  // Mint the persistent broadcast id on first load of any map that lacks one; the autosave
  // reactive persists it with the map. Minted ONCE — never re-derived on rename (that would
  // break every stored player link); regeneration is the owner's deliberate action only.
  $: if (browser && $starmapStore && !$starmapStore.broadcastId) {
    starmapStore.update((m) => (m && !m.broadcastId ? { ...m, broadcastId: mintBroadcastId(m.name) } : m));
  }
  // Adopt the map's id (and re-register the sender, re-hosting any live PeerJS registration)
  // whenever it changes: map load, or an owner-triggered regenerate.
  $: if (browser && $starmapStore?.broadcastId && $starmapStore.broadcastId !== broadcastSessionId) {
    broadcastSessionId = $starmapStore.broadcastId;
    broadcastService.initSender(broadcastSessionId);
    // Host on the broker as soon as the map has its persistent id. A stable, saved sid is only
    // worth anything if it can be DIALLED — and a cross-site host app (Mappadux on another domain)
    // can no longer reach this tab over the same-machine channel (Chrome partitions BroadcastChannel
    // in third-party iframes), so PeerJS is its only route to discover us. Cheap (one broker
    // registration, no data until someone connects); the id-collision prompt covers a stale tab.
    broadcastService.enableRemote();
  }
  onMount(() => {
    if (!browser) return;
    // G28: the CAMPAIGN's undo history. Attached here rather than in `Starmap.svelte` so that
    // entering a system and coming back does not throw away what the GM did to the map.
    // G28 persistence: the undo history rides the campaign object into IndexedDB, so the recorders
    // need the app's ONE autosave. They attach it in place and call this; they never set the store,
    // because every starmap emission recomputes the redacted player snapshot.
    setUndoPersist(() => { const m = get(starmapStore); if (m) enqueueStarmapPersist(m); });
    onDestroy(() => setUndoPersist(null));
    const detachMapUndo = attachStarmapUndo(() => selectedRulepack ?? null);
    onDestroy(detachMapUndo);
    broadcastService.initSender(broadcastSessionId);
    // Hosting collided with a LIVE session on the same id (stale tab on another PC, or a copied
    // starmap file). Never silently regenerate — the owner chooses (vtt-integration-design 9.1/1A).
    broadcastService.onHostIdUnavailable = () => {
      const regen = window.confirm(
        "Another session is already hosting this starmap's broadcast id (an old tab on another PC, or a copied starmap file).\n\n" +
        'OK — mint a NEW session id for this starmap. Existing player links and QR codes stop working.\n' +
        'Cancel — keep the current id: close the other session, then enable remote sharing again.'
      );
      if (regen) starmapStore.update((m) => (m ? { ...m, broadcastId: mintBroadcastId(m.name) } : m));
    };
    broadcastService.onRequestStarmap = (requestingId) => {
      if (requestingId && requestingId !== broadcastSessionId) return;
      const map = get(starmapStore);
      if (map) broadcastService.sendMessage({ type: 'SYNC_STARMAP', payload: starmapSnapshotForPlayers(map) });
      broadcastService.sendMessage({ type: 'SYNC_BRANDING', payload: get(brandingStore) });
      // A player joining (or reloading) AFTER the GM set the live overrides never used to hear about
      // them — Follow GM et al. only rode the modal's own broadcasts, so late windows silently ignored
      // the GM. Re-state the running view + overrides on every join. (Never send null here: a player
      // opened directly by URL is valid without the GM "running" a view — null means hold screen.)
      broadcastService.sendMessage({ type: 'SYNC_TAGSTYLES', payload: tagStyleSnapshot(get(tagCategories)) });
      const pid = get(runningPresetId);
      if (pid) broadcastService.sendMessage({ type: 'SYNC_PRESET', payload: { presetId: pid, overrides: get(liveOverrides) } });
    };
    // VTT integration (design 9.1/1B): discovery + remote-request answers. ANNOUNCE is identity
    // metadata only — never campaign content — so it is safe to answer any same-machine prober.
    broadcastService.onRequestHello = () => {
      const a = announceNow();
      if (a) broadcastService.sendMessage({ type: 'ANNOUNCE', payload: a });
    };
    broadcastService.onRequestRemote = () => {
      broadcastService.enableRemote();
      // Never host on the public broker silently: a small transient notice on the GM screen.
      remoteNotice = `Remote sharing enabled for "${get(starmapStore)?.name ?? 'this starmap'}" — players can now connect from other devices.`;
      if (remoteNoticeTimer) clearTimeout(remoteNoticeTimer);
      remoteNoticeTimer = setTimeout(() => (remoteNotice = null), 6000);
    };
    // Liveness (design 9.1/1D): a tiny wall-clock frame every 5 s. Receivers flip to OFFLINE when it
    // stops and remote guests re-dial — replaces a LIVE flag that used to latch true forever.
    heartbeatTimer = setInterval(() => broadcastService.sendMessage({ type: 'SYNC_HEARTBEAT', payload: Date.now() }), 5000);
    // G3: answer a player's model-by-hash request from the local store, once - the binary never
    // rides the snapshot (it would multiply every sendIfChanged resend). Chunked automatically.
    broadcastService.onRequestModel = async (_requestingId, hash) => {
      try {
        const stored = await getStoredModel(hash);
        if (!stored) return; // honestly absent: the player keeps its glyph fallback
        const { hash: _h, ...meta } = stored.meta;
        broadcastService.sendMessage({ type: 'SYNC_MODEL', payload: { hash, b64: bytesToBase64(stored.bytes), meta } });
      } catch { /* a failed read must not break the join burst */ }
    };
  });
  // Re-broadcast the redacted starmap whenever it (or the GM's grid choice) changes, so guides stay
  // live. starmapStore ticks with every systemStore emission (several per second while idle) and the
  // snapshot runs to hundreds of KB, so this goes through the fingerprint gate — only real changes leave.
  $: if (browser && $starmapStore && $starmapUiStore) {
    broadcastService.sendIfChanged({ type: 'SYNC_STARMAP', payload: starmapSnapshotForPlayers($starmapStore) });
  }
  // Push branding (company name + logo) to player views whenever the GM edits it.
  $: if (browser && $brandingStore) {
    broadcastService.sendIfChanged({ type: 'SYNC_BRANDING', payload: $brandingStore });
  }
  // THE TAG VOCABULARY, so a marker on a player's DEVICE is the colour the GM sees.
  // `tagCategories` is a localStorage store, so a second window on this machine shares it and a
  // player's phone does not — which is why every custom colour looked right in testing and arrived
  // as a default in play. Only the presentation subset crosses (see TagStyleSnapshot).
  $: if (browser && $tagCategories) {
    broadcastService.sendIfChanged({ type: 'SYNC_TAGSTYLES', payload: tagStyleSnapshot($tagCategories) });
  }
  // THE LIVE HIGHLIGHT SELECTION. It used to be broadcast ONLY by the Player Views modal's own
  // controls, and the place a GM actually picks highlights is Find by tag — which writes the store
  // and says nothing. The GM's map updated instantly (it reads the store) and the players' did not
  // change until the window was reopened and re-requested it. Broadcasting from HERE rather than from
  // each call site is the point: the next surface that touches `liveOverrides` inherits it instead of
  // reintroducing the same gap.
  // Guarded on a running view for the same reason the join handler is: a null SYNC_PRESET means "hold
  // screen", so a GM who has not opened a view must not accidentally push one.
  $: if (browser && $liveOverrides && $runningPresetId) {
    broadcastService.sendIfChanged({ type: 'SYNC_PRESET', payload: { presetId: $runningPresetId, overrides: $liveOverrides } });
  }

  // Keep the runtime display units in sync with the loaded starmap (source of truth).
  $: measurementUnit.set($starmapStore?.measurementUnits ?? 'metric');
  $: temperatureUnit.set($starmapStore?.temperatureUnit ?? 'C');

  // Subscribe to systemStore and update starmapStore
  systemStore.subscribe(system => {
    if (system) { // No need to check currentSystemId, the system knows its own ID
      starmapStore.update(starmap => {
        if (starmap) {
          // Robustly find the node: check both node.id (if matched system.id previously) and node.system.id
          const systemNode = starmap.systems.find(s => s.id === system.id || s.system.id === system.id);
          if (systemNode) {
            systemNode.system = system;
            if (!systemNode.isNameUserDefined) systemNode.name = system.name;
          }
        }
        return starmap;
      });
    }
  });

  // Auto-save the starmap to browser storage whenever it changes
  $: if (browser && $starmapStore) {
    enqueueStarmapPersist($starmapStore);
  }

  $: if ($starmapStore) {
    const normalized = withStarmapDefaults($starmapStore);
    if (normalized !== $starmapStore) {
      starmapStore.set(normalized);
    }
  }

  function roundDistance(value: number): number {
    return Math.round(value * 100) / 100;
  }

  function withStarmapDefaults(starmap: StarmapType): StarmapType {
    let changed = false;
    const sanitized = sanitizeStarmapForRuntime(starmap);
    if (sanitized !== starmap) changed = true;

    const mapMode = sanitized.mapMode ?? 'diagrammatic';
    if (!sanitized.mapMode) changed = true;
    const invertDisplay = sanitized.invertDisplay ?? false;
    if (sanitized.invertDisplay === undefined) changed = true;

    // A43: `distanceUnit` and `scale.unit` are two fields holding one concept and a save can carry them
    // DISAGREEING — which is why three call sites had each written out their own precedence. Fold them
    // here, on the way in, so nothing downstream has to. It copies a label; it never touches geometry.
    const unifiedUnit = campaignUnit(sanitized);
    if (sanitized.distanceUnit !== unifiedUnit || (sanitized.scale && sanitized.scale.unit !== unifiedUnit)) changed = true;

    const defaultUnit = unifiedUnit;
    const currentScale = sanitized.scale;
    const scale = currentScale && currentScale.pixelsPerUnit > 0
      ? { ...currentScale, unit: defaultUnit }
      : { unit: defaultUnit, pixelsPerUnit: 25, showScaleBar: true };
    if (!currentScale || !currentScale.unit || !(currentScale.pixelsPerUnit > 0) || currentScale.showScaleBar === undefined) {
      changed = true;
    }

    const temporalNormalized = ensureTemporalState(sanitized);
    if (temporalNormalized !== sanitized) changed = true;

    if (!changed) return sanitized;
    return { ...temporalNormalized, mapMode, invertDisplay, scale, distanceUnit: unifiedUnit, generationEngine: sanitized.generationEngine };
  }

  // WS7: this MUST go through lib/map/systemDistance.ts like every other distance. It used to measure
  // dx/dy only, so a route between two systems at different depths reported its planar shadow — a system
  // labelled "3.8 ly below the plane" could sit on a 2.1 ly route, which is geometrically impossible.
  // The shared module is the single place that decides whether depth counts.
  function getSystemDistanceLy(starmap: StarmapType, sourceSystemId: string, targetSystemId: string): number {
    const source = starmap.systems.find((s) => s.id === sourceSystemId);
    const target = starmap.systems.find((s) => s.id === targetSystemId);
    if (!source || !target) return 0;
    return roundDistance(
      systemSeparation(source.position, target.position, starmap.scale?.pixelsPerUnit ?? 25, !zCounts(starmap))
    );
  }

  function rebuildRouteDistancesFromGeometry(starmap: StarmapType): StarmapType {
    return {
      ...starmap,
      routes: starmap.routes.map((route) => ({
        ...route,
        distance: getSystemDistanceLy(starmap, route.sourceSystemId, route.targetSystemId),
        unit: starmap.distanceUnit
      }))
    };
  }

  function enqueueStarmapPersist(starmap: StarmapType) {
    const snapshot = JSON.parse(JSON.stringify(starmap)) as StarmapType;
    persistQueue = persistQueue
      .then(() => persistStarmap(snapshot))
      .catch((e) => console.error('Failed to persist starmap:', e));
  }

  async function persistStarmap(starmap: StarmapType) {
    await saveStarmap(starmap);
    hasSavedStarmap = true;
  }

  function handleCreateStarmap(event: CustomEvent<{ name: string; rulepack: RulePack; distanceUnit: string; unitIsPrefix: boolean; mapMode: 'diagrammatic' | 'scaled', generationEngine: string }>) {
    const { name, rulepack, distanceUnit, unitIsPrefix, mapMode, generationEngine } = event.detail;
    selectedRulepack = rulepack;
    
    if (generationEngine === 'evolutionary') {
      pendingStarmapData = { name, rulepack, distanceUnit, unitIsPrefix, mapMode };
      showEvolutionaryWizard = true;
      showNewStarmapModal = false;
      return;
    }

    const seed = `seed-${Date.now()}`;
    const newSystem = generateSystem(seed, rulepack, {}, 'Random', false);
    const anchoredTimeSec = STARTDATE_EPOCH_OFFSET_T.toString();
    const newStarmap: StarmapType = {
      id: `starmap-${Date.now()}`,
      name,
      distanceUnit,
      unitIsPrefix,
      mapMode,
      invertDisplay: false,
      scale: {
        unit: distanceUnit || 'LY',
        pixelsPerUnit: 25,
        showScaleBar: true
      },
      systems: [
        {
          id: newSystem.id,
          name: newSystem.name,
          position: { x: 0, y: 0 },
          system: newSystem,
          time: {
            displayTimeSec: anchoredTimeSec
          }
        },
      ],
      routes: [],
      temporal: createAnchoredTemporalState()
    };
    starmapStore.set(newStarmap);
    showNewStarmapModal = false;
  }

  function handleEvolutionaryWizardComplete(event: CustomEvent<System>) {
    const newSystem = event.detail;
    if (!pendingStarmapData) return;

    const { name, rulepack, distanceUnit, unitIsPrefix, mapMode, position } = pendingStarmapData;
    const anchoredTimeSec = STARTDATE_EPOCH_OFFSET_T.toString();
    
    if (position) {
      // Adding a system to an existing starmap
      const newSystemNode: StarSystemNode = {
        id: newSystem.id,
        name: newSystem.name,
        position: position,
        system: newSystem,
        time: {
          displayTimeSec: anchoredTimeSec
        }
      };

      starmapStore.update(starmap => {
        if (starmap) {
          starmap.systems = [...starmap.systems, newSystemNode];
        }
        return starmap;
      });
    } else {
      // Creating a new starmap
      const newStarmap: StarmapType = {
        id: `starmap-${Date.now()}`,
        name,
        distanceUnit,
        unitIsPrefix,
        mapMode,
        generationEngine: 'evolutionary',
        invertDisplay: false,
        scale: {
          unit: distanceUnit || 'LY',
          pixelsPerUnit: 25,
          showScaleBar: true
        },
        systems: [
          {
            id: newSystem.id,
            name: newSystem.name,
            position: { x: 0, y: 0 },
            system: newSystem,
            time: {
              displayTimeSec: anchoredTimeSec
            }
          },
        ],
        routes: [],
        temporal: createAnchoredTemporalState()
      };
      starmapStore.set(newStarmap);
    }
    
    showEvolutionaryWizard = false;
    pendingStarmapData = null;
  }

  function handleSystemClick(event: CustomEvent<string>) {
    const sysId = event.detail; // Local var to ensure immediate availability
    const currentMap = get(starmapStore);
    const systemNode = currentMap?.systems.find(s => s.id === sysId);
    if (systemNode) {
      if (currentMap) {
        const effectiveDisplaySec = getEffectiveSystemDisplaySeconds(currentMap, systemNode).toString();
        starmapStore.update((starmap) => {
          if (!starmap) return starmap;
          const normalized = ensureTemporalState(starmap);
          const updatedSystems = normalized.systems.map((s) => (
            s.id === sysId
              ? { ...s, time: { ...(s.time || {}), displayTimeSec: effectiveDisplaySec } }
              : s
          ));
          return {
            ...normalized,
            systems: updatedSystems,
            temporal: {
              ...normalized.temporal!,
              displayTimeSec: effectiveDisplaySec
            }
          };
        });
      }

      const refreshedNode = get(starmapStore)?.systems.find(s => s.id === sysId) || systemNode;
      if (refreshedNode.viewport) {
        viewportStore.set(refreshedNode.viewport);
      } else {
        viewportStore.set({ pan: { x: 0, y: 0 }, zoom: 1 });
      }
      systemStore.set(JSON.parse(JSON.stringify(refreshedNode.system)));
      // Push state to enter the system
      pushState('', { systemId: sysId });
    }
  }

  function handleSystemZoom(event: CustomEvent<string>) {
    const sysId = event.detail;
    const systemNode = get(starmapStore)?.systems.find(s => s.id === sysId);
    if (systemNode) {
      systemStore.set(JSON.parse(JSON.stringify(systemNode.system)));
    }
  }

        // Direct, unconditional exit straight to the starmap — clears the focused system and
        // replaces the (possibly multi-level focus) history entry so we land on the map, not
        // somewhere up the focus hierarchy or back at the initial page load.
        function exitToStarmap() {
            currentSystemId = null;
            systemStore.set(null);
            replaceState('', {});
        }

        function handleBackToStarmap(event: CustomEvent<{ force?: boolean }> | undefined) {
          // Forced exit (e.g. SystemView intercepting a Back button, or the persistent rail's
          // "← Starmap") goes straight to the map. A plain back walks the history stack so the
          // in-system "Zoom Out" hierarchy nav still works.
          const force = event?.detail?.force;
          if (force) {
              exitToStarmap();
          } else {
              history.back();
          }
        }
  // On load we re-run the FULL physics + tagging pipeline over every system, so a stored starmap
  // picks up the current model (new tags, sharpened PoI, ring/* derivation, …) rather than whatever
  // was baked in when it was last saved. A progress overlay (one tick per system) keeps it honest.
  //
  // --- Load guard (perf comb, 2026-08) -----------------------------------------------------------
  // A saved map that hangs the load must never brick the app: the map auto-loads on startup, so a
  // deterministic hang repeats on every visit and the user's only way out used to be wiping browser
  // data — losing the map (it happened; a low-end phone, two systems 85 kly apart, frozen at 100%).
  // The guard is a localStorage stage stamp: armed before the auto-load, advanced through the
  // stages, cleared only after the first starmap frame PAINTS. If it is still set on the next
  // startup, the previous load never finished — so we do not auto-load, and instead offer: try
  // again, start without the map (data untouched), or download the stored map as a file.
  // The stamp doubles as the diagnosis: it names the last stage that started.
  const LOAD_GUARD_KEY = 'sse-load-guard';
  let loadGuardArmed = false;
  let loadGuardPrompt: string | null = null; // non-null = show the safe-mode screen (value = stalled stage)
  function loadGuardArm(stage: string) { if (!browser) return; loadGuardArmed = true; loadGuardStage(stage); }
  function loadGuardStage(stage: string) { if (browser && loadGuardArmed) { try { localStorage.setItem(LOAD_GUARD_KEY, stage); } catch { /* private mode */ } } }
  function loadGuardClear() { loadGuardArmed = false; if (browser) { try { localStorage.removeItem(LOAD_GUARD_KEY); } catch { /* private mode */ } } }
  function loadGuardTripped(): string | null { if (!browser) return null; try { return localStorage.getItem(LOAD_GUARD_KEY); } catch { return null; } }
  // Emergency export: the stored map straight to a .json file WITHOUT rendering anything — the
  // escape hatch for a map that cannot load. Plain JSON on purpose: it is what the ordinary .json
  // load path reads back, and this path must not depend on any machinery that might be the hang.
  async function downloadStoredStarmap() {
    const saved = await loadSavedStarmap();
    if (!saved) { alert('No starmap found in browser storage.'); return; }
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(saved.name || 'starmap').replace(/[^\w\- ]+/g, '').trim() || 'starmap'}-recovered.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  let physicsProgress: { done: number; total: number; joke: string; current: string } | null = null;
  let recalcCancelRequested = false;
  let loadProcessed: string[] = [];   // systems fully re-derived this load, in order

  // --- Diagnostic bundle -------------------------------------------------------------------------
  // A load hang is the one fault a user cannot usefully report: the app is frozen, a phone has no
  // console, and the visible evidence is a stopped progress bar (which may read 100% — UI-L1). So
  // whenever a load is stopped or refuses to finish, offer to package the evidence: the map itself,
  // how far loading got, the device's memory, and the perf counters. It downloads to their machine;
  // nothing is uploaded, and they choose whether to send it.
  let diagnosticOffer: { reason: string; stalledOn: string | null; starmap: unknown | null; detail: string } | null = null;
  let diagnosticBuilding = false;
  let diagnosticDone = false;
  // On-demand from Settings → System: the same pack, built while the app is WORKING. This is the
  // one a bug report should carry — it says what was on screen, what the device is, what memory and
  // storage look like, and every counter collected so far, with the map that reproduces it.
  async function buildDiagnosticsOnDemand() {
    let storage: { usageBytes: number; quotaBytes: number } | null = null;
    try {
      const { storageReport } = await import('$lib/storagePersistence');
      const r = await storageReport();
      storage = { usageBytes: r.usageBytes, quotaBytes: r.quotaBytes };
    } catch { /* storage API unavailable; the rest of the report is still worth having */ }
    await downloadDiagnosticBundle({
      reason: 'requested by the user from Settings',
      stalledOn: null,
      starmap: $starmapStore ?? null,
      runtime: {
        openSystem: ($systemStore as any)?.name ?? null,
        view: $systemStore ? 'system view' : 'starmap',
        storage,
        perfTracingOn: perfEnabled()
      }
    });
  }

  // `src.starmap` is always the LIVE map (the store, or the one the recalc was mutating). The STORED
  // copy is re-read here, so the two are never confused at a call site — see engine map UI-L6.
  async function downloadDiagnosticBundle(ctx?: { reason: string; stalledOn: string | null; starmap: unknown | null; runtime?: any }) {
    const src = ctx ?? diagnosticOffer;
    if (!src) return;
    diagnosticBuilding = true;
    try {
      const { buildDiagnosticBundle } = await import('$lib/io/diagnosticBundle');
      // ALWAYS PREFER A FRESH READ FROM STORAGE, and this is not a detail: `recalcAllSystems`
      // rewrites `node.system` IN PLACE as it goes, so the in-memory map at the moment of a stop is
      // half re-derived — a mixture that never existed on disk and that nobody can load to reproduce
      // anything. The stored copy is the exact INPUT that failed, so it can be test-loaded elsewhere,
      // which is what separates "this map's data breaks the loader" from "this device is too slow".
      // The in-memory map is only a fallback for when storage itself cannot be read — a report with
      // an imperfect map still beats no report.
      let map: unknown | null = null;
      try { map = await loadSavedStarmap(); } catch { map = null; }
      let mapSource: 'stored' | 'in-memory' | 'none' = map ? 'stored' : 'none';
      // BOTH COPIES SHIP WHEN THEY DIFFER, and for a mid-load failure they always do: the stored one
      // is the input to test-load, the in-memory one shows how far the engine got and what it had
      // produced when it stopped. Together they say whether the data or the device is at fault.
      const live = src.starmap ?? null;
      if (!map && live) { map = live; mapSource = 'in-memory'; }
      const perf = (window as any).__ssePerf ?? {};
      const { bytes, filename } = buildDiagnosticBundle({
        reason: src.reason,
        starmap: map ?? null,
        liveStarmap: live,
        stages: perf.loadStages ?? [],
        counters: perf.counters ?? {},
        processed: loadProcessed,
        stalledOn: src.stalledOn,
        guardStage: loadGuardTripped(),
        runtime: src.runtime ?? null,
        mapSource
      }, APP_VERSION);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      diagnosticDone = true;
    } catch (e) {
      console.warn('[sse-load] diagnostic bundle failed', e);
      alert('Sorry — the diagnostic file could not be built. Saving your campaign to a file from the File menu still works.');
    } finally {
      diagnosticBuilding = false;
    }
  }

  // --- Memory warning (perf comb, 2026-08) -------------------------------------------------------
  // The app has genuinely hit out-of-memory in a live session, and a tab dies without a word when it
  // does. Warn ONCE at 80% of the browser's allocation limit and once more at 90%; re-arm only after
  // usage falls back below 65%, so a session hovering at the line is not nagged every poll. The
  // gauge itself (with the limit) lives in Settings → System → Memory.
  let memWarnLevel: 0 | 1 | 2 = 0;   // highest warning already shown this excursion
  let memBanner: { critical: boolean; text: string } | null = null;
  $: {
    const m = $memoryReading;
    if (m.supported) {
      if (m.frac < MEMORY_REARM_FRAC) {
        memWarnLevel = 0;
      } else if (m.frac >= MEMORY_CRITICAL_FRAC && memWarnLevel < 2) {
        memWarnLevel = 2;
        memBanner = { critical: true, text: `Memory is nearly exhausted — using ${formatMB(m.usedMB)} of the ${formatMB(m.limitMB)} this browser allows (${Math.round(m.frac * 100)}%). Save your campaign to a file NOW; the tab may be closed by the browser without warning. Reloading the tab after saving frees the memory.` };
      } else if (m.frac >= MEMORY_WARN_FRAC && memWarnLevel < 1) {
        memWarnLevel = 1;
        memBanner = { critical: false, text: `Memory is running low — using ${formatMB(m.usedMB)} of the ${formatMB(m.limitMB)} this browser allows (${Math.round(m.frac * 100)}%). A good moment to save your campaign to a file.` };
      }
    }
  }
  const PHYSICS_JOKES = [
    'Re-lighting the stars…', 'Nudging electrons back into orbit…', 'Asking the gas giants to hold still…',
    'Negotiating with the second law of thermodynamics…', 'Convincing the moons to stay tidally locked…',
    'Balancing the barycentres…', 'Letting the comets finish their laps…', 'Warming up the habitable zones…',
    'Counting the rings (twice)…', 'Apologising to Pluto…', 'Checking nobody fell into a black hole…',
    'Carrying the one — it is a big one…', 'Spinning up the dynamos…', 'Measuring twice, cutting the snow line once…',
    // v2.1.3
    'Teaching the binaries to share a centre…', 'Filing the asteroids under "lumpy"…',
    'Asking the tidally locked moons to face the front…', 'Dusting the accretion discs…',
    'Reticulating the snow lines…', 'Checking the auroras are the right colour…',
    'Sorting the ices by how well they stay put…', 'Weighing the worlds against their own composition…',
    'Waiting for the cryovolcanoes to stop showing off…', 'Politely ignoring the second sun…',
    // v2.1.4
    'Condensing the clouds at the correct altitude…', 'Asking Saturn where it keeps its methane…',
    'Waiting for the rain to reach the ground (it will not)…', 'Stacking the cloud decks in order…',
    'Letting the ammonia settle before the hydrosulphide…', 'Charging up the lightning…',
    'Rusting the iron on all the red planets…', 'Tilting the stars very slightly…',
    'Counting the sunspots, losing count, starting again…', 'Reading the sky as far up as it goes…'
  ];
  async function recalcAllSystems(starmap: StarmapType): Promise<StarmapType> {
    const systems = starmap.systems ?? [];
    if (!selectedRulepack || systems.length === 0) return starmap;
    recalcCancelRequested = false;
    const nameOf = (i: number) => systems[i]?.name || `system ${i + 1}`;
    physicsProgress = { done: 0, total: systems.length, joke: PHYSICS_JOKES[0], current: nameOf(0) };
    perfStage('physics.start');
    // Let the overlay PAINT (with the first system's name on it) before any synchronous physics
    // runs: tick() flushes the DOM but does not paint, and a hang inside process() would otherwise
    // freeze a blank card with no name to report. One frame's delay buys the diagnosis.
    await new Promise((r) => setTimeout(r, 30));
    let stoppedBefore: string | null = null;
    let stoppedIndex = 0;
    loadProcessed = [];
    for (let i = 0; i < systems.length; i++) {
      const node = systems[i];
      // The Stop button can only be HEARD between systems (one system's process() is synchronous);
      // while a system blocks, the overlay shows its name — that screenshot is the diagnosis.
      if (recalcCancelRequested) { stoppedBefore = nameOf(i); stoppedIndex = i; break; }
      loadGuardStage(`physics: ${nameOf(i)}`);
      try {
        if (node?.system?.nodes) {
          // STRIP baked-in derived data first (same as file import), THEN re-derive. Without the strip
          // a stored body keeps its old class/tags — the processor's guard won't re-classify a body that
          // already has a (stale) non-empty class — so an engine fix (e.g. the moon-eyeball correction)
          // would never show on a refresh of an existing map. Authored inputs + GM-pinned types survive.
          node.system = systemProcessor.process(fixUpImportedSystem(node.system, selectedRulepack), selectedRulepack);
        }
      } catch (e) { console.warn('Recalc failed for system', node?.name, e); }
      loadProcessed.push(nameOf(i));
      perfStage(`physics:${nameOf(i)}`); // sinceLastMs ≈ this system's processing cost
      physicsProgress = {
        done: i + 1, total: systems.length,
        joke: i % 3 === 2 ? PHYSICS_JOKES[(i + 1) % PHYSICS_JOKES.length] : physicsProgress.joke,
        current: i + 1 < systems.length ? nameOf(i + 1) : nameOf(i)
      };
      // Yield so the bar repaints + the run reads as real — but only while VISIBLE. A hidden tab
      // throttles timers to 1s, so this yield turned a background-tab load into ~1s PER SYSTEM
      // (measured: 46ms/system foreground, 1000ms hidden) — which itself reads as a hang. Hidden,
      // nothing paints and nobody clicks Stop, so there is nothing to yield for.
      if (typeof document === 'undefined' || !document.hidden) {
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    perfStage('physics.done');
    physicsProgress = null;
    if (stoppedBefore) {
      const kept = stoppedIndex;
      console.warn('[sse-load] recalc stopped by user:', kept, 'of', systems.length, 're-derived; next was', stoppedBefore);
      // Offer the diagnostic bundle rather than an alert that only the user can read: a load hang
      // is the one fault a user cannot usefully report (frozen app, no console on a phone), so the
      // moment they stop one is the moment to capture the evidence.
      diagnosticOffer = {
        reason: 'the user stopped the load',
        stalledOn: stoppedBefore,
        starmap,
        detail: `${kept} of ${systems.length} systems were refreshed with the current engine before you stopped. ` +
          `The rest keep the physics they were saved with — they still work, they just will not show the latest engine changes until a full load finishes. ` +
          `It was about to start "${stoppedBefore}".`
      };
    }
    return starmap;
  }

  async function handleLoadStarmap() {
    loadGuardArm('reading browser storage');
    perfStage('load.storageRead.start');
    const savedStarmap = await loadSavedStarmap();
    perfStage('load.storageRead.done');
    if (savedStarmap) {
      starmapStore.set(await recalcAllSystems(savedStarmap));
      // The first render is a known hang stage (it, not the physics, was where the reported phone
      // lockup sat — the bar read 2/2, 100%). Two independent clears, whichever fires first:
      // a PAINTED frame (double-rAF fires after the browser presents one), or 15s of a LIVE main
      // thread. The timer matters: a hidden or non-compositing tab paints no frames at all, so a
      // load that completed in a background tab would otherwise trip the guard falsely on the next
      // visit (found live). A timer can only fire if JS is actually running — a genuinely hung
      // render blocks BOTH paths, which is exactly the case the guard exists for.
      loadGuardStage('first starmap render');
      await tick();
      let guardCleared = false;
      const clearOnce = (how: string) => () => {
        if (guardCleared) return;
        guardCleared = true;
        perfStage(`load.complete(${how})`);
        loadGuardClear();
      };
      requestAnimationFrame(() => requestAnimationFrame(clearOnce('painted')));
      setTimeout(clearOnce('alive'), 15000);
    } else {
      loadGuardClear();
      alert('No starmap found in browser storage.');
    }
  }

  // The starter map to load is named by the modal (from the shipped manifest), so bundling another one is
  // a data change. Falls back to the original file for any caller that does not name one.
  // Real-sky import: the modal hands over converted systems (plus the honesty
  // report it already showed); this assembles them into a starmap, optionally
  // fills out each system with generated worlds around the confirmed anchors
  // (deterministic per star, tagged origin/generated), and runs the same
  // physics recalc every loaded map gets.
  async function handleRealSkyImport(event: CustomEvent<any>) {
    const { systems, fillOut, name, description } = event.detail;
    if (!selectedRulepack && rulePacks.length) selectedRulepack = rulePacks[0];
    if (!selectedRulepack) return;
    // The catalogues carry no stellar magnetic field or spin tilt; complete
    // them from the rule pack's bands, deterministically per star, exactly as
    // the generator does for its own stars.
    completeImportedStars(systems, selectedRulepack);
    if (fillOut) fillOutAll(systems.map((s: any) => ({ id: s.id, system: s.system })), selectedRulepack);
    const newStarmap: StarmapType = {
      id: `starmap-realsky-${Date.now()}`,
      name,
      description,
      distanceUnit: 'ly',
      unitIsPrefix: false,
      mapMode: 'scaled',
      generationEngine: 'standard',
      invertDisplay: false,
      scale: { unit: 'ly', pixelsPerUnit: PIXELS_PER_LY, showScaleBar: true },
      systems,
      routes: [],
      temporal: createAnchoredTemporalState()
    };
    showRealSkyImportModal = false;
    showNewStarmapModal = false;
    starmapStore.set(await recalcAllSystems(newStarmap));
  }

  async function handleLoadExampleStarmap(event?: CustomEvent<string>) {
      const file = event?.detail || 'Local_Neighbourhood-Starmap.json';
      try {
          const response = await fetch('/example-starmaps/' + file);
          if (!response.ok) throw new Error('Failed to load example starmap.');
          const data = await response.json();
          starmapStore.set(await recalcAllSystems(data));
          showNewStarmapModal = false;
      } catch (e) {
          alert('Error loading example starmap: ' + (e as Error).message);
      }
  }

  // "Add System" now opens the generation wizard (examples / presets / HR + age + knobs) instead of
  // dropping a fully-random system. The clicked position is remembered for placement.
  // WS7b: `z` is optional and only present when the system was placed with the relative-placement dialogue.
  // It has to be carried through to the wizard, or a system placed above the plane would land back on it.
  function handleAddSystemAt(event: CustomEvent<{ x: number; y: number; z?: number }>) {
    if (!$starmapStore || !selectedRulepack) return;
    const { x, y, z } = event.detail;
    pendingWizardPosition = z ? { x, y, z } : { x, y };
    showGenerationWizard = true;
  }

  // The wizard produced a fully-processed system — drop it at the remembered position.
  function placeGeneratedSystem(event: CustomEvent<{ system: System }>) {
    showGenerationWizard = false;
    const pos = pendingWizardPosition; pendingWizardPosition = null;
    if (!$starmapStore || !pos) return;
    const newSystem = event.detail.system;
    const displayTimeSec = parseClockSeconds($starmapStore.temporal?.displayTimeSec, STARTDATE_EPOCH_OFFSET_T).toString();
    const newSystemNode: StarSystemNode = { id: newSystem.id, name: newSystem.name, position: pos, system: newSystem, time: { displayTimeSec } };
    starmapStore.update(starmap => { if (starmap) starmap.systems = [...starmap.systems, newSystemNode]; return starmap; });
  }



  function handleSelectSystemForLink(event: CustomEvent<string>) {
    const systemId = event.detail;
    if (!selectedSystemForLink) {
      selectedSystemForLink = systemId;
    } else if (selectedSystemForLink !== systemId) {
      // Create a link between selectedSystemForLink and systemId
      if (!$starmapStore) return;

      const newRoute: Route = {
        id: `route-${Date.now()}`,
        sourceSystemId: selectedSystemForLink,
        targetSystemId: systemId,
        distance: ($starmapStore.mapMode ?? 'diagrammatic') === 'scaled'
          ? getSystemDistanceLy($starmapStore, selectedSystemForLink, systemId)
          : roundDistance(Math.floor(Math.random() * 10) + 1),
        unit: $starmapStore.distanceUnit,
        lineStyle: 'solid',
      };

      starmapStore.update(starmap => {
        if (starmap) {
          starmap.routes = [...starmap.routes, newRoute];
        }
        return starmap;
      });

      selectedSystemForLink = null;
    } else {
      // Clicking the same system again deselects it
      selectedSystemForLink = null;
    }
  }

  function handleEditRoute(event: CustomEvent<Route>) {
    routeToEdit = event.detail;
    showRouteEditorModal = true;
  }

  function handleSaveRoute(event: CustomEvent<Route>) {
    const updatedRoute = { ...event.detail, distance: roundDistance(Number(event.detail.distance || 0)) };
    starmapStore.update(starmap => {
      if (starmap) {
        const index = starmap.routes.findIndex(r => r.id === updatedRoute.id);
        if (index !== -1) {
          starmap.routes[index] = updatedRoute;
        }
      }
      return starmap;
    });
    routeToEdit = null;
    showRouteEditorModal = false;
  }

  function handleRescaleRoute(event: CustomEvent<{ route: Route; distance: number }>) {
    const { route, distance } = event.detail;
    const targetDistance = roundDistance(Number(distance || 0));
    if (targetDistance <= 0) return;

    starmapStore.update((starmap) => {
      if (!starmap) return starmap;
      const source = starmap.systems.find((s) => s.id === route.sourceSystemId);
      const target = starmap.systems.find((s) => s.id === route.targetSystemId);
      if (!source || !target) return starmap;

      const dx = target.position.x - source.position.x;
      const dy = target.position.y - source.position.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      if (pixelDistance <= 0) return starmap;

      const pixelsPerUnit = pixelDistance / targetDistance;
      const updated = {
        ...starmap,
        mapMode: 'scaled' as const,
        scale: {
          unit: starmap.distanceUnit || 'LY',
          pixelsPerUnit,
          showScaleBar: starmap.scale?.showScaleBar ?? true
        }
      };
      return rebuildRouteDistancesFromGeometry(updated);
    });

    routeToEdit = null;
    showRouteEditorModal = false;
  }

  function handleDeleteRoute(event: CustomEvent<string>) {
    const routeIdToDelete = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        starmap.routes = starmap.routes.filter(r => r.id !== routeIdToDelete);
      }
      return starmap;
    });
    routeToEdit = null;
    showRouteEditorModal = false;
  }

  // Rename a system's MAP NODE (its display name on the starmap), independent of the central star.
  function handleRenameSystem(event: CustomEvent<{ systemId: string; name: string }>) {
    const { systemId, name } = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        const node = starmap.systems.find(s => s.id === systemId || s.system?.id === systemId);
        if (node) { node.name = name; node.isNameUserDefined = true; }
      }
      return starmap;
    });
  }

  function handleDeleteSystem(event: CustomEvent<string>) {
    const target = event.detail;
    // Deleting a system is destructive and irreversible — everything in it (bodies, constructs,
    // routes, notes) is lost. Confirm first, naming the system so the GM knows exactly what goes.
    const existing = get(starmapStore);
    const targetNode = existing?.systems.find(s => s.id === target || s.system?.id === target);
    const label = targetNode?.name || 'this system';
    if (!confirm(`Delete "${label}"?\n\nThe entire system — every body, construct, route and note — will be permanently removed. This cannot be undone.\n\nDownload the starmap first if you want to keep a copy.`)) return;
    starmapStore.update(starmap => {
      if (starmap) {
        // Systems are keyed on the wrapper NODE id, but a delete can arrive with either that node id
        // (starmap right-click) or the inner system.id (deleting the primary star from inside the
        // system) — and for imported/legacy systems those two differ, so a straight s.id match misses.
        // Resolve to the node id first (same dual-id lookup used when saving a system back).
        const node = starmap.systems.find(s => s.id === target || s.system?.id === target);
        const nodeId = node?.id ?? target;
        starmap.systems = starmap.systems.filter(s => s.id !== nodeId);
        starmap.routes = starmap.routes.filter(r => r.sourceSystemId !== nodeId && r.targetSystemId !== nodeId);
      }
      return starmap;
    });
    selectedSystemForLink = null; // Deselect after deletion
    currentSystemId = null; // If the deleted system was being viewed, go back to starmap
    systemStore.set(null);
  }

  function handleRenameNode(event: CustomEvent<{nodeId: string, newName: string}>) {
    if (!$systemStore) return;
    const { nodeId, newName } = event.detail;
    systemStore.set(renameNode($systemStore, nodeId, newName));
  }

  function handleClearStarmap() {
    if (confirm('Clear the current starmap and start a new one?\n\nDownload it first if you want to keep a copy.')) {
      starmapStore.set(null);
      showNewStarmapModal = true;
    }
  }

  // File > New Starmap. Guard the destructive replace: only confirm when there's actually a
  // populated starmap to lose (first run / empty map opens straight to the modal).
  function handleRequestNewStarmap() {
    const current = get(starmapStore);
    const hasContent = !!current && Array.isArray(current.systems) && current.systems.length > 0;
    if (hasContent && !confirm('Start a new starmap?\n\nThis clears the current one. Download it first if you want to keep a copy.')) return;
    showNewStarmapModal = true;
  }

  // Re-run the PoI "reasons to visit" tagger across every system after the pack editor closes, so
  // rule/category/pack edits take effect immediately rather than waiting for the next body edit.
  function reprocessAllReasons() {
    starmapStore.update((map) => {
      if (!map) return map;
      for (const node of map.systems) if (node?.system) annotateReasonsToVisit(node.system);
      return { ...map };
    });
    const open = get(systemStore);
    if (open) { annotateReasonsToVisit(open); systemStore.set({ ...open }); }
  }

  async function handleDownloadStarmap() {
    if (!$starmapStore) return;

    // Strip derived physics from a CLONE before writing — the load path re-derives everything, so the
    // file needs only authored inputs. Keeps saved files small and free of stale baked-in data.
    const lean = stripStarmapForExport($starmapStore, selectedRulepack ?? undefined);
    // G3: embed construct model binaries (base64 by hash) so the file is self-contained — a
    // ModelRef without its binary would land on another machine as the icon-glyph fallback.
    const models = await collectModelsForExport(lean).catch(() => undefined);
    // Embed the user's PoI packs + reasons config so they travel inside the .json starmap file.
    // M1: stamp the build that wrote the file. See lib/map/provenance.ts for why explicit saves only.
    const exportObj = stampForSave({ ...lean, poiPacks: packsForStarmap(), reasonsConfig: get(reasonsConfig), coiCategories: coiForStarmap(), ...(models ? { models } : {}) });
    // A campaign carrying assets saves as a BUNDLE: a zip holding a small, readable starmap.json
    // beside the models and pictures as real files. One with no assets stays a plain .json, which
    // is the file GMs hand-edit and diff. Both load; the loader sniffs, it does not trust names.
    const base = `${$starmapStore.name.replace(/\s/g, '_') || 'starmap'}-Starmap`;
    const bundle = packBundle('starmap', exportObj, { models });
    const blob = bundle
      ? new Blob([bundle], { type: 'application/zip' })
      : new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = base + (bundle ? BUNDLE_EXT : '.json');
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUploadStarmap() {
    fileInput.click();
  }

  function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        // A save is either a bundle (zip) or plain JSON. Decided by the MAGIC NUMBER, so a
        // renamed file still opens; the bundle's assets are unpacked before anything reads them.
        const raw = new Uint8Array(reader.result as ArrayBuffer);
        let data: any;
        let bundledModels: Record<string, { b64: string; meta: Record<string, unknown> }> | null = null;
        if (sniffBundle(raw)) {
          const unpacked = unpackBundle(raw);
          if (unpacked.kind !== 'starmap') {
            alert('That bundle holds a single system, not a campaign. Open it from the system view instead.');
            return;
          }
          data = unpacked.doc;
          bundledModels = unpacked.models;
        } else {
          data = JSON.parse(new TextDecoder().decode(raw));
        }

        // Bring in any PoI packs / reasons config the starmap carries, BEFORE re-deriving systems,
        // so the embedded rules drive the re-tag below. These live app-wide once merged.
        mergeStarmapPacks(data.poiPacks);
        applyStarmapReasonsConfig(data.reasonsConfig);
        mergeStarmapCoIs(data.coiCategories);
        // G3: put embedded model binaries into the local hash store (each verified against its own
        // hash) so every ModelRef in the file has its model the moment the map opens.
        await importEmbeddedModels(bundledModels ?? data.models).catch(() => 0);

        const sanitized = sanitizeStarmapForRuntime(data as StarmapType);
        delete (sanitized as any).poiPacks;
        delete (sanitized as any).reasonsConfig;
        delete (sanitized as any).coiCategories;
        delete (sanitized as any).models;

        // One-way import fix-up: strip baked-in derived data / legacy tags from every embedded
        // system so the new engine re-derives cleanly (v1 starmaps otherwise carry stale physics).
        if (selectedRulepack && Array.isArray(sanitized.systems)) {
          for (const node of sanitized.systems) {
            if (node?.system?.nodes) {
              try { node.system = systemProcessor.process(fixUpImportedSystem(node.system, selectedRulepack), selectedRulepack); }
              catch (e) { console.warn('Fix-up failed for system', node.name, e); }
            }
          }
        }

        const errors = validateStarmap(sanitized);
        if (errors.length > 0) {
            alert('Starmap Validation Failed:\n\n' + errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n...and ${errors.length - 10} more errors.` : ''));
            console.error('Validation Errors:', errors);
            return;
        }

        starmapStore.set(sanitized);
        showNewStarmapModal = false;
      } catch (e) {
        alert('Error parsing JSON file. Please check the file format.');
        console.error(e);
      }
    };

    reader.readAsText(file);
  }


  function handleSaveSettings(event: CustomEvent<{ starmap: Partial<StarmapType>; unitMode?: UnitChangeMode }>) {
    const { starmap: starmapSettings, unitMode } = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        const merged = { ...starmap, ...starmapSettings };
        // A43. Changing the unit is a change of RULER, not of layout — positions stay in map units and a
        // distance is `mapUnits / pixelsPerUnit`, so both outcomes are reachable without rewriting a single
        // coordinate (the z/depth annotation included). WHICH outcome is the GM's call, asked at the moment
        // of change and carried here as `unitMode`; this code must not decide.
        //   convert — rescale the ruler: the map is right, express it the other way.
        //   relabel — leave the ruler: the numbers were right and the unit was wrong.
        // Until A43 this ALWAYS converted, which is precisely how a map mis-stamped as parsecs turned
        // Alpha Centauri's 4.37 into 14.33. Default stays 'convert' for any caller that does not ask.
        if (merged.scale && unitKind(campaignUnit(starmap)) && unitKind(merged.scale.unit)) {
          const rulerBefore = starmap.scale?.pixelsPerUnit ?? merged.scale.pixelsPerUnit;
          merged.scale = applyUnitChange(
            { ...merged.scale, unit: campaignUnit(starmap), pixelsPerUnit: rulerBefore },
            merged.scale.unit,
            unitMode ?? 'convert'
          );
          // G16: the map background's anchor is stored in UNITS, so it is one of the readings a
          // convert relabels. Nothing on the map moved, so the picture must not move either.
          merged.mapBackground = rescaleMapBackgroundForRuler(merged.mapBackground, rulerBefore, merged.scale.pixelsPerUnit);
        }
        // The two unit fields must never leave this function disagreeing (A43's second fault).
        Object.assign(merged, normaliseCampaignUnit(merged));
        if ((merged.mapMode ?? 'diagrammatic') === 'scaled') {
          return rebuildRouteDistancesFromGeometry(withStarmapDefaults(merged));
        }
        return withStarmapDefaults(merged);
      }
      return starmap;
    });
    showSettingsModal = false;
    reprocessAllReasons();   // apply any PoI category toggle changes across the map
  }

  function handleSaveLlmSettings() {
    showLlmSettingsModal = false;
  }


</script>

<svelte:head>
  <title>Star System Explorer</title>
</svelte:head>

<main>


  <input type="file" bind:this={fileInput} on:change={handleFileSelected} style="display: none;" accept=".json,.zip" />

  {#if remoteNotice}
    <div class="mem-banner" role="status">
      <span>{remoteNotice}</span>
      <button type="button" class="mem-banner-close" aria-label="Dismiss" on:click={() => (remoteNotice = null)}>×</button>
    </div>
  {/if}
  {#if memBanner}
    <div class="mem-banner" class:critical={memBanner.critical} role="alert">
      <span>{memBanner.text}</span>
      <button type="button" class="mem-banner-close" aria-label="Dismiss" on:click={() => (memBanner = null)}>×</button>
    </div>
  {/if}

  {#if physicsProgress}
    <div class="physics-overlay" role="status" aria-live="polite">
      <div class="physics-card">
        <h2>Running the physics…</h2>
        <div class="physics-bar"><div class="physics-fill" style="width:{Math.round((physicsProgress.done / physicsProgress.total) * 100)}%"></div></div>
        <div class="physics-meta">
          <span>{physicsProgress.done} / {physicsProgress.total} systems</span>
          <span>{Math.round((physicsProgress.done / physicsProgress.total) * 100)}%</span>
        </div>
        <p class="physics-current">{physicsProgress.current}</p>
        <p class="physics-joke">{recalcCancelRequested ? 'Stopping after this system…' : physicsProgress.joke}</p>
        <button class="physics-stop" type="button" disabled={recalcCancelRequested} on:click={() => (recalcCancelRequested = true)}>Stop load</button>
      </div>
    </div>
  {/if}

  {#if diagnosticOffer}
    <div class="physics-overlay" role="alertdialog" aria-modal="true" aria-label="Load stopped">
      <div class="physics-card">
        <h2>Load stopped</h2>
        <p class="physics-guard-detail">{diagnosticOffer.detail}</p>
        <p class="physics-guard-detail">
          You can save a diagnostic file that shows where loading got to, what your device had to work
          with, and includes a copy of the map itself. It saves to this device — nothing is sent anywhere,
          and you choose whether to share it.
        </p>
        <div class="physics-guard-actions">
          <button type="button" class="physics-guard-btn primary" disabled={diagnosticBuilding} on:click={downloadDiagnosticBundle}>
            {diagnosticBuilding ? 'Building the file…' : (diagnosticDone ? 'Save it again' : 'Save a diagnostic file (.zip)')}
          </button>
          <button type="button" class="physics-guard-btn" on:click={() => { diagnosticOffer = null; diagnosticDone = false; }}>
            {diagnosticDone ? 'Done — carry on' : 'No thanks, carry on'}
          </button>
        </div>
        {#if diagnosticDone}
          <p class="physics-joke">Saved. Post it to FrunkQ on the Discord with a note about what you were doing — the
            file also works as a backup of your campaign, so keep a copy.</p>
        {:else}
          <p class="physics-joke">It contains your campaign, including GM notes. The file explains what is inside it.</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if loadGuardPrompt}
    <div class="physics-overlay" role="alertdialog" aria-modal="true" aria-label="The last load did not finish">
      <div class="physics-card">
        <h2>The last load didn't finish</h2>
        <p class="physics-guard-detail">
          Loading stopped at: <strong>{loadGuardPrompt}</strong>.
          Your starmap is still saved in this browser — nothing has been lost.
        </p>
        <div class="physics-guard-actions">
          <button type="button" class="physics-guard-btn primary" on:click={async () => { loadGuardPrompt = null; await handleLoadStarmap(); }}>Try loading again</button>
          <button type="button" class="physics-guard-btn" on:click={() => { loadGuardPrompt = null; loadGuardClear(); showNewStarmapModal = true; }}>Start without loading it</button>
          <button type="button" class="physics-guard-btn" on:click={downloadStoredStarmap}>Download a copy (.json)</button>
          <button type="button" class="physics-guard-btn" disabled={diagnosticBuilding} on:click={() => downloadDiagnosticBundle({
            reason: `the previous load never finished (safe mode; stopped at "${loadGuardPrompt}")`,
            stalledOn: null,
            starmap: null
          })}>{diagnosticBuilding ? 'Building the file…' : 'Save a diagnostic file (.zip)'}</button>
        </div>
        <p class="physics-joke">If it keeps stopping at the same place, send the diagnostic file to FrunkQ on the Discord.</p>
      </div>
    </div>
  {/if}

  {#if isLoading}
    <p>Loading rule pack...</p>
  {:else if error}
    <p style="color: red;">Error: {error}</p>
  {:else if showEvolutionaryWizard && selectedRulepack}
    <EvolutionaryWizard rulepack={selectedRulepack} on:complete={handleEvolutionaryWizardComplete} on:cancel={() => { showEvolutionaryWizard = false; if (!$starmapStore) showNewStarmapModal = true; }} />
  {:else if showNewStarmapModal}
    <NewStarmapModal 
        rulepacks={rulePacks} 
        {hasSavedStarmap} 
        on:create={handleCreateStarmap} 
        on:load={handleLoadStarmap} 
        on:upload={handleUploadStarmap} 
        on:loadExampleStarmap={handleLoadExampleStarmap}
        on:realSkyImport={() => (showRealSkyImportModal = true)}
    />
    {#if showRealSkyImportModal}
      <RealSkyImportModal rulePack={effectiveRulePack} on:import={handleRealSkyImport} on:close={() => (showRealSkyImportModal = false)} />
    {/if}
  {:else if $starmapStore && currentSystemId}
    <!-- SystemView owns its own AppShell (rail/strip/canvas/bar/detail/fab); forward app nav. -->
    {#if $systemStore && effectiveRulePack}
      <SystemView
        system={$systemStore} rulePack={effectiveRulePack} {exampleSystems}
        {broadcastSessionId}
        routesAttention={routesData.worstAttention}
        on:new={handleRequestNewStarmap}
        on:open={handleUploadStarmap}
        on:save={handleDownloadStarmap}
        on:settings={() => { settingsReturnSection = null; showSettingsModal = true; }}
        on:llmsettings={() => { settingsReturnSection = null; showLlmSettingsModal = true; }}
        on:allbodies={() => showAllBodies = true}
        on:findtag={() => showTagFinder = true}
        on:allships={() => showAllShips = true}
        on:routes={() => showRoutes = true}
        on:about={() => showAbout = true}
        on:help={() => showHelpMenu = true}
        on:playerviews={() => showPlayerPresets = true}
        on:interstellar={(e) => { interstellarShipId = e.detail?.shipId || ''; showInterstellarModal = true; }}
        on:back={handleBackToStarmap}
        on:deletesystem={handleDeleteSystem}
        on:renameNode={handleRenameNode}
      />
    {/if}
  {:else if $starmapStore}
    <!-- Starmap owns its own AppShell now; forward its rail's app-nav. -->
    <Starmap
      bind:this={starmapComponent}
      starmap={$starmapStore}
      rulePack={selectedRulepack}
      routesAttention={routesData.worstAttention}
      on:new={handleRequestNewStarmap}
      on:playerviews={() => showPlayerPresets = true}
      on:report={() => showReportConfigModal = true}
      on:systemclick={handleSystemClick}
      on:focusconstruct={(e) => enterSystemAndFocus(e.detail.systemId, e.detail.id)}
      on:openship={(e) => shipPanelJourneyId = e.detail.journeyId}
      on:systemzoom={handleSystemZoom}
      on:addsystemat={handleAddSystemAt}
      on:selectsystemforlink={handleSelectSystemForLink}
      on:editroute={handleEditRoute}
      on:deletesystem={handleDeleteSystem}
      on:renamesystem={handleRenameSystem}
      on:download={handleDownloadStarmap}
      on:upload={handleUploadStarmap}
      on:clear={handleClearStarmap}
      on:settings={() => { settingsReturnSection = null; showSettingsModal = true; }}
      on:llmsettings={() => { settingsReturnSection = null; showLlmSettingsModal = true; }}
      on:allbodies={() => showAllBodies = true}
      on:findtag={() => showTagFinder = true}
      on:allships={() => showAllShips = true}
      on:routes={() => showRoutes = true}
      on:about={() => showAbout = true}
      on:help={() => showHelpMenu = true}
      on:updatestarmap={(e) => starmapStore.set(e.detail)}
      {selectedSystemForLink}
    />

  {/if}

  {#if showRouteEditorModal && routeToEdit && $starmapStore}
    <RouteEditorModal bind:showModal={showRouteEditorModal} route={routeToEdit} starmap={$starmapStore} on:save={handleSaveRoute} on:rescale={handleRescaleRoute} on:delete={handleDeleteRoute} />
  {/if}

  {#if showGenerationWizard && selectedRulepack}
    <GenerationWizard rulePack={selectedRulepack} {exampleSystems}
      on:generate={placeGeneratedSystem} on:close={() => { showGenerationWizard = false; pendingWizardPosition = null; }} />
  {/if}

  {#if showSettingsModal && $starmapStore}
    <SettingsModal
      bind:showModal={showSettingsModal}
      starmap={$starmapStore}
      initialSection={settingsReturnSection}
      preUpgradeName={preUpgradeSnapshotName}
      on:restorepreupgrade={restorePreUpgradeStarmap}
      on:save={handleSaveSettings}
      on:close={() => reprocessAllReasons()}
      on:edittemporal={() => { settingsReturnSection = 'time'; showTemporalModal = true; }}
      on:editfuel={() => { settingsReturnSection = 'technology'; showFuelModal = true; }}
      on:editatmospheres={() => { settingsReturnSection = 'planets'; showAtmosphereModal = true; }}
      on:editliquids={() => { settingsReturnSection = 'planets'; showLiquidsModal = true; }}
      on:editbiospheres={() => { settingsReturnSection = 'planets'; showBiospheresModal = true; }}
      on:editsensors={() => { settingsReturnSection = 'technology'; showSensorsModal = true; }}
      on:edittags={() => { settingsReturnSection = 'tagging'; showTagEditor = true; }}
      on:llm={() => { settingsReturnSection = 'system'; showLlmSettingsModal = true; }}
      on:diagnostics={buildDiagnosticsOnDemand}
      on:about={() => showAbout = true}
    />
  {/if}
  {#if showTagEditor}
    <TagCategoryEditor existingTags={allTagKeys} on:close={() => { showTagEditor = false; reprocessAllReasons(); if (settingsReturnSection) showSettingsModal = true; }} />
  {/if}

  {#if showLlmSettingsModal}
    <LlmSettingsModal bind:showModal={showLlmSettingsModal} on:save={handleSaveLlmSettings} on:close={() => { showLlmSettingsModal = false; returnToSettings(); }} />
  {/if}

  {#if showFuelModal && $starmapStore && selectedRulepack}
    <EditFuelAndDrivesModal showModal={showFuelModal} rulePack={selectedRulepack} starmap={$starmapStore} on:save={(e) => applyStarmapOverrides(e.detail)} on:close={() => { showFuelModal = false; returnToSettings(); }} />
  {/if}
  {#if showAtmosphereModal && $starmapStore && selectedRulepack}
    <EditAtmospheresModal showModal={showAtmosphereModal} rulePack={selectedRulepack} starmap={$starmapStore} on:save={(e) => applyStarmapOverrides(e.detail)} on:close={() => { showAtmosphereModal = false; returnToSettings(); }} />
  {/if}
  {#if showBiospheresModal && $starmapStore && selectedRulepack}
    <EditBiospheresModal showModal={showBiospheresModal} rulePack={effectiveRulePack ?? selectedRulepack} starmap={$starmapStore} on:save={(e) => applyStarmapOverrides(e.detail)} on:close={() => { showBiospheresModal = false; returnToSettings(); }} />
  {/if}
  {#if showLiquidsModal && $starmapStore && selectedRulepack}
    <EditLiquidsModal showModal={showLiquidsModal} rulePack={selectedRulepack} starmap={$starmapStore} on:save={(e) => applyStarmapOverrides(e.detail)} on:close={() => { showLiquidsModal = false; returnToSettings(); }} />
  {/if}
  {#if showSensorsModal && $starmapStore && selectedRulepack}
    <EditSensorsModal showModal={showSensorsModal} rulePack={selectedRulepack} starmap={$starmapStore} on:save={(e) => applyStarmapOverrides(e.detail)} on:close={() => { showSensorsModal = false; returnToSettings(); }} />
  {/if}
  {#if showTemporalModal && $starmapStore}
    <EditTemporalModal showModal={showTemporalModal} starmap={$starmapStore} on:save={(e) => starmapStore.update((s) => s ? { ...s, temporal: e.detail.temporal } : s)} on:close={() => { showTemporalModal = false; returnToSettings(); }} />
  {/if}
  {#if showWelcome}
    <WelcomeModal on:close={dismissWelcome} on:help={() => { dismissWelcome(); showHelpMenu = true; }} />
  {/if}
  {#if showHelpMenu}
    <HelpMenuModal on:close={() => showHelpMenu = false} />
  {/if}
  <!-- WS8: only ever shown for a campaign that descends from an OLDER edition of a bundled map. Held back
       until the welcome screen is out of the way, so a first-run user is not hit with both at once. -->
  {#if baseMapOffer && $starmapStore && !showWelcome}
    <BaseMapUpgradeModal
      campaign={$starmapStore}
      offer={baseMapOffer}
      on:backup={handleDownloadStarmap}
      on:accept={(e) => acceptBaseMapUpgrade(e.detail)}
      on:dismiss={() => { if ($starmapStore) dismissUpgrade($starmapStore.id); baseMapOffer = null; }}
      on:close={() => (baseMapOffer = null)}
    />
  {/if}
  {#if showAbout}
    <AboutModal rulePack={$systemStore ? effectiveRulePack : null} on:close={() => showAbout = false} />
  {/if}

  {#if showReportConfigModal}
    <ReportConfigModal on:generate={handleStarmapReport} on:close={() => showReportConfigModal = false} />
  {/if}

  {#if showPlayerPresets}
    <PlayerViewModal sessionId={broadcastSessionId} on:close={() => showPlayerPresets = false} />
  {/if}

  {#if showInterstellarModal && $starmapStore}
    <InterstellarTransitModal starmap={$starmapStore} rulePack={effectiveRulePack || selectedRulepack} initialShipId={interstellarShipId} on:startjourney={handleStartJourney} on:close={() => showInterstellarModal = false} />
  {/if}

  {#if showAllBodies}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showAllBodies = false)} use:foreground>
      <div class="allbodies-card" role="dialog" aria-label="Find a body" on:click|stopPropagation>
        <header class="allbodies-head">
          <span>All bodies &amp; constructs</span>
          <button class="allbodies-close" aria-label="Close" on:click={() => (showAllBodies = false)}>×</button>
        </header>
        <BodyPicker
          inline
          startOpen
          nodes={allBodies}
          focusedId={null}
          placeholder="Search every system…"
          emptyLabel="All bodies"
          contextOf={allBodiesContext}
          on:select={handleAllBodiesSelect}
        />
      </div>
    </div>
  {/if}

  {#if shipPanel}
    <ShipPanel
      construct={shipPanel.construct}
      system={shipPanel.system}
      hostBody={shipPanel.host}
      rulePack={effectiveRulePack || selectedRulepack}
      status={shipPanel.status}
      frac={shipPanel.frac}
      fromName={shipPanel.fromName}
      toName={shipPanel.toName}
      on:resolve={(e) => handleShipResolve(shipPanel.journey.id, e.detail.outcome, e.detail.coast)}
      on:resume={() => handleShipResume(shipPanel.journey.id)}
      on:newtransit={() => { interstellarShipId = shipPanel.construct.id; showInterstellarModal = true; shipPanelJourneyId = null; }}
      on:update={(e) => handleShipConstructUpdate(e.detail)}
      on:refuel={() => handleShipRefuel(shipPanel.construct.id)}
      on:close={() => (shipPanelJourneyId = null)}
    />
  {/if}

  {#if showTagFinder}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showTagFinder = false)} use:foreground>
      <div class="allbodies-card" role="dialog" aria-label="Find by tag" on:click|stopPropagation>
        <header class="allbodies-head">
          <span>Find by tag</span>
          <button class="allbodies-close" aria-label="Close" on:click={() => (showTagFinder = false)}>×</button>
        </header>
        <TagFinder
          nodes={tagFinderNodes}
          currentSystemId={currentSystemId}
          systems={tagFinderSystems}
          distanceOf={tagFinderDistance}
          distanceUnit={$starmapStore?.distanceUnit ?? 'ly'}
          contextOf={allBodiesContext}
          on:select={handleTagFinderSelect}
        />
      </div>
    </div>
  {/if}

  {#if showRoutes}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showRoutes = false)} use:foreground>
      <div class="allbodies-card" role="dialog" aria-label="Routes and journeys" on:click|stopPropagation>
        <header class="allbodies-head">
          <span>Routes &amp; journeys</span>
          <button class="allbodies-close" aria-label="Close" on:click={() => (showRoutes = false)}>×</button>
        </header>
        <div class="routes-body">
          <h4>In-system journeys ({routesData.journeys.length})</h4>
          {#if routesData.journeys.length === 0}
            <p class="routes-empty">No active or planned journeys.</p>
          {:else}
            {#each routesData.journeys as j (j.id)}
              <button class="route-row" on:click={() => { showRoutes = false; enterSystemAndFocus(j.systemId, j.constructId); }}>
                <span class="route-status {j.status}">{j.status}</span>
                <span class="route-col">
                  <span class="route-main"><strong>{j.constructName}</strong> · {j.origin} → {j.target}{j.legs > 1 ? ` (${j.legs} legs)` : ''}</span>
                  <span class="route-when">{j.when} · {j.systemName}</span>
                </span>
              </button>
            {/each}
          {/if}
          <h4>Interstellar journeys ({routesData.interstellarJourneys.length})</h4>
          {#if routesData.interstellarJourneys.length === 0}
            <p class="routes-empty">No interstellar journeys.</p>
          {:else}
            {#each routesData.interstellarJourneys as j (j.id)}
              <div class="route-row interstellar">
                <span class="route-status {j.status}">{j.status}{j.status === 'active' ? ` ${j.pct}%` : ''}</span>
                <div class="route-pills">
                  <button class="pill ship" title="Open the ship" on:click={() => { showRoutes = false; if (currentSystemId) handleBackToStarmap(); shipPanelJourneyId = j.id; }}>{j.shipName}</button>
                  <button class="pill" title="Go to origin system" on:click={() => { showRoutes = false; enterSystemAndFocus(j.fromSystemId, null); }}>{j.from}</button>
                  <span class="arrow">→</span>
                  <button class="pill" title="Go to destination system" on:click={() => { showRoutes = false; enterSystemAndFocus(j.toSystemId, j.toBodyId); }}>{j.to}{j.toBodyName ? ` (${j.toBodyName})` : ''}</button>
                </div>
                <span class="route-when">{j.when}</span>
              </div>
            {/each}
          {/if}
          <h4>Charted interstellar links ({routesData.interstellar.length})</h4>
          {#if routesData.interstellar.length === 0}
            <p class="routes-empty">No interstellar routes.</p>
          {:else}
            {#each routesData.interstellar as r (r.id)}
              <div class="route-row static">
                <span class="route-main"><strong>{r.source}</strong> → <strong>{r.target}</strong>{#if r.name}<span class="route-name-tag">{r.name}</span>{/if}</span>
                <span class="route-sys">{r.distance} {r.unit}</span>
              </div>
            {/each}
          {/if}
          {#if routesData.stranded.length}
            <h4>Stranded ships ({routesData.stranded.length})</h4>
            {#each routesData.stranded as s (s.id)}
              <div class="route-row static">
                <span class="route-main">
                  {#if s.interstellar && s.journeyId}
                    <button class="pill ship" title="Open the ship" on:click={() => { showRoutes = false; if (currentSystemId) handleBackToStarmap(); shipPanelJourneyId = s.journeyId; }}>{s.constructName}</button>
                  {:else if !s.interstellar}
                    <button class="pill ship" title="Go to the ship" on:click={() => { showRoutes = false; enterSystemAndFocus(s.systemId, s.id); }}>{s.constructName}</button>
                  {:else}<strong>{s.constructName}</strong>{/if}
                  <span class="route-stranded"> · adrift, coasting</span>
                </span>
                <span class="route-sys">{s.where}{#if s.wasBound} · was bound {s.wasBound}{/if}</span>
              </div>
            {/each}
          {/if}
          {#if routesData.autopilotShips.length}
            <h4 class="ap-heading"><AutopilotShipIcon size={14} /> Under autopilot ({routesData.autopilotShips.length})</h4>
            {#each routesData.autopilotShips as a (a.id)}
              <div class="route-row static ap-ship">
                <span class="route-main">
                  <button class="pill ship" title="Go to the ship" on:click={() => { showRoutes = false; enterSystemAndFocus(a.systemId, a.id); }}>{a.constructName}</button>
                  {#if a.attention}<span class="route-attention {a.attention}" title={a.attentionLabel}>!</span>{/if}
                  <span class="route-autopilot"> · {a.summary}</span>
                </span>
                <span class="route-sys">{a.where}</span>
              </div>
              {#if a.journeys.length}
                <details class="ap-legs">
                  <summary>{a.journeys.length} planned {a.journeys.length === 1 ? 'leg' : 'legs'}</summary>
                  {#each a.journeys as j (j.id)}
                    <button class="route-row ap-leg" on:click={() => { showRoutes = false; enterSystemAndFocus(j.systemId, j.constructId); }}>
                      <span class="route-status {j.status}">{j.status}</span>
                      <span class="route-col">
                        <span class="route-main">{j.origin} → {j.target}{j.legs > 1 ? ` (${j.legs} legs)` : ''}</span>
                        <span class="route-when">{j.when}</span>
                      </span>
                    </button>
                  {/each}
                </details>
              {/if}
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if showAllShips}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showAllShips = false)} use:foreground>
      <div class="allbodies-card" role="dialog" aria-label="Find a construct" on:click|stopPropagation>
        <header class="allbodies-head">
          <span>Constructs</span>
          <button class="allbodies-close" aria-label="Close" on:click={() => (showAllShips = false)}>×</button>
        </header>
        <BodyPicker
          inline
          startOpen
          nodes={allShips}
          focusedId={null}
          placeholder="Search every system…"
          emptyLabel="All constructs"
          contextOf={allBodiesContext}
          on:select={(e) => { showAllShips = false; handleAllBodiesSelect(e); }}
        />
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    font-family: sans-serif;
    /* padding removed: the AppShell fills the viewport (100vh); setup screens
       (loading / new-starmap modal / wizard) provide their own spacing. */
    padding: 0;
  }
  .physics-overlay {
    position: fixed;
    inset: 0;
    z-index: 4000;
    background: var(--bg-app, #0b0d12);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .physics-card {
    width: min(440px, 100%);
    text-align: center;
    color: var(--text, #e8e8e8);
  }
  .physics-card h2 { margin: 0 0 18px; font-weight: 600; }
  .physics-bar {
    height: 10px;
    background: var(--bg-control, #1c1f27);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    overflow: hidden;
  }
  .physics-fill {
    height: 100%;
    background: var(--accent, #6aa0d8);
    transition: width 0.15s ease;
  }
  .physics-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-faint, #8a8f9a);
    margin-top: 8px;
  }
  .physics-joke { margin: 18px 0 0; color: var(--text-muted, #aab); font-style: italic; min-height: 1.4em; }
  /* The system being processed RIGHT NOW — if the load hangs, this name is the diagnosis, so it is
     styled to survive a phone screenshot. */
  .physics-current { margin: 10px 0 0; font-size: 0.85rem; color: var(--text, #e8e8e8); overflow-wrap: anywhere; }
  .physics-stop {
    margin-top: 20px;
    padding: 8px 18px;
    background: var(--bg-control, #1c1f27);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    color: var(--text, #e8e8e8);
    cursor: pointer;
  }
  .physics-stop:hover:not(:disabled) { border-color: var(--accent, #6aa0d8); }
  .physics-stop:disabled { opacity: 0.5; cursor: default; }
  .physics-guard-detail { margin: 0 0 18px; color: var(--text-muted, #aab); }
  .physics-guard-actions { display: flex; flex-direction: column; gap: 10px; }
  .physics-guard-btn {
    padding: 10px 18px;
    background: var(--bg-control, #1c1f27);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    color: var(--text, #e8e8e8);
    cursor: pointer;
  }
  .physics-guard-btn:hover { border-color: var(--accent, #6aa0d8); }
  .physics-guard-btn.primary { border-color: var(--accent, #6aa0d8); }
  .mem-banner {
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5000; /* above the physics overlay: a memory warning must survive any screen */
    max-width: min(560px, calc(100vw - 24px));
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    background: var(--bg-control, #1c1f27);
    border: 1px solid #ffb061;
    border-radius: 8px;
    color: var(--text, #e8e8e8);
    font-size: 0.85rem;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
  }
  .mem-banner.critical { border-color: #ff6a6a; }
  .mem-banner-close {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: var(--text-muted, #aab);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
  }
  .mem-banner-close:hover { color: var(--text, #e8e8e8); }
  .allbodies-overlay {
    position: fixed;
    inset: 0;
    z-index: 1500;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .allbodies-card {
    display: flex;
    flex-direction: column;
    width: min(520px, 100%);
    height: min(70vh, 640px);
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    padding: 12px;
    box-sizing: border-box;
  }
  .allbodies-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px 10px;
    font-weight: 600;
    color: var(--text, #e8e8e8);
  }
  /* Phones: use nearly the whole screen — vertical space is scarce. */
  @media (max-width: 640px) {
    .allbodies-overlay { padding: 6px; }
    .allbodies-card { width: 100%; height: 94vh; padding: 10px; }
    .allbodies-head { padding: 0 2px 8px; }
  }
  .allbodies-close {
    width: 32px;
    height: 32px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
  }
  .routes-body { overflow-y: auto; overflow-x: hidden; padding: 4px 2px; }
  .ap-heading { display: flex; align-items: center; gap: 7px; }
  .ap-ship { border-left: 2px solid var(--accent, #ff5a1f); }
  .ap-legs { margin: 0 0 0.5em 0.6em; }
  .ap-legs > summary { cursor: pointer; color: var(--text-muted); font-size: 0.82em; padding: 0.2em 0; list-style-position: inside; user-select: none; }
  .ap-legs > summary:hover { color: var(--text); }
  .ap-legs .ap-leg { margin: 0.2em 0 0 0.4em; border-left: 2px solid #2f5d76; opacity: 0.92; }
  .routes-body .route-row { box-sizing: border-box; max-width: 100%; }
  .routes-body h4 {
    margin: 12px 0 6px;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint, #8a8f9a);
  }
  .routes-body h4:first-child { margin-top: 0; }
  .routes-empty { color: var(--text-faint, #8a8f9a); margin: 4px 0 8px; font-size: 0.9rem; }
  .route-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    margin-bottom: 4px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    cursor: pointer;
  }
  .route-row.static { cursor: default; }
  .route-row:not(.static):hover { background: var(--bg-control-hover, #232733); }
  .route-status {
    flex: 0 0 auto;
    font-size: 0.7rem;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 999px;
  }
  .route-status.active { background: color-mix(in srgb, var(--accent, #ff5a1f) 30%, transparent); color: var(--accent, #ff5a1f); }
  .route-status.scheduled { background: var(--bg-panel, #14161c); color: var(--text-muted, #cfcfcf); }
  .route-status.completed { background: color-mix(in srgb, #4fa86a 26%, transparent); color: #6fcf8f; }
  .route-main { flex: 1 1 auto; min-width: 0; font-size: 0.9rem; }
  .route-name-tag { margin-left: 8px; color: #8fd6ff; font-size: 0.78rem; font-style: italic; }
  .route-sys { flex: 0 0 auto; color: var(--text-faint, #8a8f9a); font-size: 0.8rem; }
  .route-col { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
  .route-when { font-size: 0.74rem; color: var(--text-faint, #8a8f9a); flex-basis: 100%; }
  .route-stranded { color: #e8a857; font-size: 0.82em; }
  .route-autopilot { color: #6aa0d8; font-size: 0.82em; }
  .route-attention { color: #fff; background: #cc5555; border-radius: 50%; font-weight: 700; font-size: 0.72em; padding: 0 5px; margin-left: 4px; }
  .route-attention.stuck { background: #cc5555; }
  .route-attention.intervention { background: #d8922f; }
  .route-attention.done { background: #4a9e5c; }
  /* Interstellar journey rows: source / destination / ship are individually clickable pills. */
  .route-row.interstellar { cursor: default; flex-wrap: wrap; }
  .route-pills { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; }
  .route-pills .pill {
    border: 1px solid var(--border, #2a2d36); border-radius: 6px; padding: 3px 9px;
    background: var(--bg-panel, #14161c); color: var(--text, #e8e8e8); cursor: pointer; font-size: 0.85rem;
  }
  .route-pills .pill:hover { border-color: var(--accent, #ff5a1f); }
  .route-pills .pill.ship { font-weight: 600; }
  .route-pills .arrow { color: var(--text-faint, #8a8f9a); }
  footer {
      margin-top: 2em;
      padding-top: 1em;
      border-top: 1px solid #333;
      color: #999;
      font-size: 0.9em;
  }

  .starmap-footer {
    margin-top: 2em; /* Ensure it's below other content */
    background-color: rgba(0, 0, 0, 0.7);
    color: #ccc; /* Slightly lighter for readability */
    padding: 10px 20px;
    font-size: 0.8em; /* Increased font size */
    text-align: center;
    z-index: 100;
    /* No fixed or absolute positioning here */
  }
  .starmap-footer a {
    color: #88ccff;
    text-decoration: none;
    pointer-events: auto; /* Re-enable clicks on links */
  }
</style>

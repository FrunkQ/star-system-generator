<script lang="ts">
  export let data;
  const { exampleSystems } = data;
  import { onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import type { RulePack, System, Starmap as StarmapType, StarSystemNode, Route } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { generateSystem, renameNode } from '$lib/api';
  import { validateStarmap, generateId } from '$lib/utils';
  import { broadcastService } from '$lib/broadcast';
  import { computePlayerStarmapSnapshot } from '$lib/system/utils';
  import CompanionModal from '$lib/components/CompanionModal.svelte';
  import InterstellarTransitModal from '$lib/components/InterstellarTransitModal.svelte';
  import { brandingStore } from '$lib/catalogue/branding';
  import { guideConfigStore } from '$lib/catalogue/guideConfig';
  import { crtControls } from '$lib/catalogue/crtControls';
  import { starmapStore } from '$lib/starmapStore';
  import { systemStore, viewportStore } from '$lib/stores';
  import { hasSavedStarmap as hasPersistedStarmap, loadSavedStarmap, migrateLegacyStarmapToIndexedDb, saveStarmap } from '$lib/starmapStorage';
  import NewStarmapModal from '$lib/components/NewStarmapModal.svelte';
  import GenerationWizard from '$lib/components/GenerationWizard.svelte';
  import Starmap from '$lib/components/Starmap.svelte';
  import SystemView from '$lib/components/SystemView.svelte';
  import BodyPicker from '$lib/components/BodyPicker.svelte';
  import TagFinder from '$lib/components/TagFinder.svelte';
  import RouteEditorModal from '$lib/components/RouteEditorModal.svelte';
  import SettingsModal from '$lib/components/SettingsModal.svelte';
  import PoIPackEditor from '$lib/components/PoIPackEditor.svelte';
  import LlmSettingsModal from '$lib/components/LlmSettingsModal.svelte';
  import EditFuelAndDrivesModal from '$lib/components/EditFuelAndDrivesModal.svelte';
  import EditAtmospheresModal from '$lib/components/EditAtmospheresModal.svelte';
  import EditSensorsModal from '$lib/components/EditSensorsModal.svelte';
  import EditTemporalModal from '$lib/components/EditTemporalModal.svelte';
  import AboutModal from '$lib/components/AboutModal.svelte';
  import EvolutionaryWizard from '$lib/components/EvolutionaryWizard.svelte';
  import { createAnchoredTemporalState, ensureTemporalState, loadTemporalRegistryConfig, STARTDATE_EPOCH_OFFSET_T } from '$lib/temporal/defaults';
  import { parseClockSeconds } from '$lib/temporal/utre';
  import { sanitizeStarmapForRuntime } from '$lib/starmapSanitizer';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { fixUpImportedSystem } from '$lib/system/importFixup';
  import { annotateReasonsToVisit, packsForStarmap, mergeStarmapPacks, applyStarmapReasonsConfig, reasonsConfig } from '$lib/physics/reasonsToVisit';

  let rulePacks: RulePack[] = [];
  let isLoading = true;
  let error: string | null = null;

  // Companion App broadcast lives here (root), not in SystemView, so the players' field guide works
  // whether the GM is on the starmap or inside a system. We own the session id; SystemView reuses it.
  let broadcastSessionId = generateId();
  let showCompanionModal = false;
  let showInterstellarModal = false;
  let interstellarShipId = '';

  let showNewStarmapModal = false;
  let showGenerationWizard = false;
  let pendingWizardPosition: { x: number; y: number } | null = null;
  let showEvolutionaryWizard = false;
  let pendingStarmapData: any = null;
  let currentSystemId: string | null = null;
  let previousSystemId: string | null = null;
  let selectedSystemForLink: string | null = null;

  let showRouteEditorModal = false;
  let routeToEdit: Route | null = null;
  let showSettingsModal = false;
  let showLlmSettingsModal = false;
  let showPoiEditor = false;
  // Technology editors (rulepack overrides) + About — moved up here from Starmap so the
  // sectioned Settings modal can open them from either view.
  let showFuelModal = false;
  let showAtmosphereModal = false;
  let showSensorsModal = false;
  let showTemporalModal = false;
  let showAbout = false;
  // Sub-editors opened FROM Settings reopen it (at the section they came from) when closed,
  // so Back/close walks up the hierarchy instead of dumping the user back in the app.
  let settingsReturnSection: 'starmap' | 'time' | 'technology' | 'planets' | 'system' | null = null;
  function returnToSettings() {
    if (settingsReturnSection) showSettingsModal = true;
  }
  function applyStarmapOverrides(overrides: any) {
    starmapStore.update((s) => s ? { ...s, rulePackOverrides: { ...s.rulePackOverrides, ...overrides } } : s);
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
      };
      // One live journey per ship — starting a new one replaces any prior flight for that ship.
      const others = (s.activeJourneys ?? []).filter((j) => j.shipId !== d.shipId);
      return { ...s, activeJourneys: [...others, journey] };
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
    if (!map) return { interstellar: [] as any[], journeys: [] as any[] };
    const sysName = (id: string) => map.systems.find((s) => s.id === id)?.name ?? id;
    const interstellar = (map.routes ?? []).map((r) => ({
      id: r.id, source: sysName(r.sourceSystemId), target: sysName(r.targetSystemId), distance: r.distance, unit: r.unit
    }));
    const journeys: any[] = [];
    for (const sys of map.systems) {
      const nodes = sys.system?.nodes ?? [];
      const nodeName = (id: string) => (nodes as any[]).find((n) => n.id === id)?.name ?? id;
      for (const n of nodes as any[]) {
        if (n.kind !== 'construct') continue;
        for (const j of (n.scheduled_journeys ?? [])) {
          if (j.status !== 'scheduled' && j.status !== 'active') continue;
          const plans = j.plans ?? [];
          if (!plans.length) continue;
          journeys.push({
            id: j.id, constructId: n.id, constructName: n.name, systemId: sys.id, systemName: sys.name,
            origin: nodeName(plans[0].originId), target: nodeName(plans[plans.length - 1].targetId),
            status: j.status, legs: plans.length
          });
        }
      }
    }
    return { interstellar, journeys };
  })();
  $: allShips = allBodies.filter((n: any) => n.kind === 'construct');
  $: allBodies = (() => {
    const map = $starmapStore;
    if (!map) return [] as any[];
    const out: any[] = [];
    for (const sys of map.systems) {
      const sysName = sys.name;
      for (const n of (sys.system?.nodes ?? [])) {
        if (n.kind === 'body' || n.kind === 'construct') {
          out.push({ ...n, __systemId: sys.id, __systemName: sysName });
        }
      }
    }
    return out;
  })();
  // Every distinct tag key across the starmap — fed to the PoI editor for its "has tag" conditions.
  $: allTagKeys = (() => {
    const s = new Set<string>();
    for (const n of allBodies) for (const t of (n.tags ?? [])) if (t?.key) s.add(t.key);
    return [...s];
  })();
  function allBodiesContext(n: any): string {
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
    if (node) enterSystemAndFocus(node.__systemId, node.id);
  }
  function handleTagFinderSelect(e: CustomEvent<{ systemId: string; id: string }>) {
    showTagFinder = false;
    enterSystemAndFocus(e.detail.systemId, e.detail.id);
  }
  // Inter-system distance from the system the GM is currently in, in the map's unit — only meaningful
  // on a scaled map and when inside a system. Null otherwise (→ TagFinder sorts alphabetically).
  function tagFinderDistance(systemId: string): number | null {
    const map = $starmapStore;
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
                  systemNode.name = currentSystem.name;
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

    await migrateLegacyStarmapToIndexedDb();
    hasSavedStarmap = await hasPersistedStarmap();
    if (hasSavedStarmap) {
      await handleLoadStarmap();
    } else {
      showNewStarmapModal = true;
    }
  });

  // --- Companion App broadcast (whole redacted starmap) ---
  onMount(() => {
    if (!browser) return;
    broadcastService.initSender(broadcastSessionId);
    broadcastService.onRequestStarmap = (requestingId) => {
      if (requestingId && requestingId !== broadcastSessionId) return;
      const map = get(starmapStore);
      if (map) broadcastService.sendMessage({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot(map) });
      broadcastService.sendMessage({ type: 'SYNC_BRANDING', payload: get(brandingStore) });
      broadcastService.sendMessage({ type: 'SYNC_GUIDECONFIG', payload: { ...get(guideConfigStore), crt: get(crtControls) } });
    };
  });
  // Re-broadcast the redacted starmap whenever it changes, so connected guides stay live.
  $: if (browser && $starmapStore) {
    broadcastService.sendMessage({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot($starmapStore) });
  }
  // Push branding (company name + logo) to guides whenever the GM edits it.
  $: if (browser && $brandingStore) {
    broadcastService.sendMessage({ type: 'SYNC_BRANDING', payload: $brandingStore });
  }
  // Push the GM-enforced guide view (skin/colour/constructs + CRT effect) whenever the GM changes it.
  $: if (browser && ($guideConfigStore || $crtControls)) {
    broadcastService.sendMessage({ type: 'SYNC_GUIDECONFIG', payload: { ...$guideConfigStore, crt: $crtControls } });
  }

  // Subscribe to systemStore and update starmapStore
  systemStore.subscribe(system => {
    if (system) { // No need to check currentSystemId, the system knows its own ID
      starmapStore.update(starmap => {
        if (starmap) {
          // Robustly find the node: check both node.id (if matched system.id previously) and node.system.id
          const systemNode = starmap.systems.find(s => s.id === system.id || s.system.id === system.id);
          if (systemNode) {
            systemNode.system = system;
            systemNode.name = system.name;
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

    const defaultUnit = sanitized.distanceUnit || 'LY';
    const currentScale = sanitized.scale;
    const scale = currentScale && currentScale.pixelsPerUnit > 0
      ? { ...currentScale, unit: currentScale.unit || defaultUnit }
      : { unit: defaultUnit, pixelsPerUnit: 25, showScaleBar: true };
    if (!currentScale || !currentScale.unit || !(currentScale.pixelsPerUnit > 0) || currentScale.showScaleBar === undefined) {
      changed = true;
    }

    const temporalNormalized = ensureTemporalState(sanitized);
    if (temporalNormalized !== sanitized) changed = true;

    if (!changed) return sanitized;
    return { ...temporalNormalized, mapMode, invertDisplay, scale, generationEngine: sanitized.generationEngine };
  }

  function getSystemDistanceLy(starmap: StarmapType, sourceSystemId: string, targetSystemId: string): number {
    const source = starmap.systems.find((s) => s.id === sourceSystemId);
    const target = starmap.systems.find((s) => s.id === targetSystemId);
    if (!source || !target) return 0;

    const dx = target.position.x - source.position.x;
    const dy = target.position.y - source.position.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const pixelsPerUnit = starmap.scale?.pixelsPerUnit ?? 25;
    if (pixelsPerUnit <= 0) return 0;
    return roundDistance(pixelDistance / pixelsPerUnit);
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
  let physicsProgress: { done: number; total: number; joke: string } | null = null;
  const PHYSICS_JOKES = [
    'Re-lighting the stars…', 'Nudging electrons back into orbit…', 'Asking the gas giants to hold still…',
    'Negotiating with the second law of thermodynamics…', 'Convincing the moons to stay tidally locked…',
    'Balancing the barycentres…', 'Letting the comets finish their laps…', 'Warming up the habitable zones…',
    'Counting the rings (twice)…', 'Apologising to Pluto…', 'Checking nobody fell into a black hole…',
    'Carrying the one — it is a big one…', 'Spinning up the dynamos…', 'Measuring twice, cutting the snow line once…'
  ];
  async function recalcAllSystems(starmap: StarmapType): Promise<StarmapType> {
    const systems = starmap.systems ?? [];
    if (!selectedRulepack || systems.length === 0) return starmap;
    physicsProgress = { done: 0, total: systems.length, joke: PHYSICS_JOKES[0] };
    await tick();
    for (let i = 0; i < systems.length; i++) {
      const node = systems[i];
      try { if (node?.system?.nodes) node.system = systemProcessor.process(node.system, selectedRulepack); }
      catch (e) { console.warn('Recalc failed for system', node?.name, e); }
      physicsProgress = { done: i + 1, total: systems.length, joke: i % 3 === 2 ? PHYSICS_JOKES[(i + 1) % PHYSICS_JOKES.length] : physicsProgress.joke };
      await new Promise((r) => setTimeout(r, 30));   // yield so the bar repaints + the run reads as real
    }
    physicsProgress = null;
    return starmap;
  }

  async function handleLoadStarmap() {
    const savedStarmap = await loadSavedStarmap();
    if (savedStarmap) {
      starmapStore.set(await recalcAllSystems(savedStarmap));
    } else {
      alert('No starmap found in browser storage.');
    }
  }

  async function handleLoadExampleStarmap() {
      try {
          const response = await fetch('/example-starmaps/Local_Neighbourhood-Starmap.json');
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
  function handleAddSystemAt(event: CustomEvent<{ x: number; y: number }>) {
    if (!$starmapStore || !selectedRulepack) return;
    pendingWizardPosition = { x: event.detail.x, y: event.detail.y };
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

  function handleDeleteSystem(event: CustomEvent<string>) {
    const systemIdToDelete = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        starmap.systems = starmap.systems.filter(s => s.id !== systemIdToDelete);
        starmap.routes = starmap.routes.filter(r => r.sourceSystemId !== systemIdToDelete && r.targetSystemId !== systemIdToDelete);
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

  function handleDownloadStarmap() {
    if (!$starmapStore) return;

    // Embed the user's PoI packs + reasons config so they travel inside the .json starmap file.
    const exportObj = { ...$starmapStore, poiPacks: packsForStarmap(), reasonsConfig: get(reasonsConfig) };
    const data = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$starmapStore.name.replace(/\s/g, '_') || 'starmap'}-Starmap.json`;
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

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);

        // Bring in any PoI packs / reasons config the starmap carries, BEFORE re-deriving systems,
        // so the embedded rules drive the re-tag below. These live app-wide once merged.
        mergeStarmapPacks(data.poiPacks);
        applyStarmapReasonsConfig(data.reasonsConfig);

        const sanitized = sanitizeStarmapForRuntime(data as StarmapType);
        delete (sanitized as any).poiPacks;
        delete (sanitized as any).reasonsConfig;

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


  function handleSaveSettings(event: CustomEvent<{ starmap: Partial<StarmapType> }>) {
    const { starmap: starmapSettings } = event.detail;
    starmapStore.update(starmap => {
      if (starmap) {
        const merged = { ...starmap, ...starmapSettings };
        if ((merged.mapMode ?? 'diagrammatic') === 'scaled') {
          return rebuildRouteDistancesFromGeometry(withStarmapDefaults(merged));
        }
        return withStarmapDefaults(merged);
      }
      return starmap;
    });
    showSettingsModal = false;
  }

  function handleSaveLlmSettings() {
    showLlmSettingsModal = false;
  }


</script>

<svelte:head>
  <title>Star System Explorer</title>
</svelte:head>

<main>


  <input type="file" bind:this={fileInput} on:change={handleFileSelected} style="display: none;" accept=".json" />

  {#if physicsProgress}
    <div class="physics-overlay" role="status" aria-live="polite">
      <div class="physics-card">
        <h2>Running the physics…</h2>
        <div class="physics-bar"><div class="physics-fill" style="width:{Math.round((physicsProgress.done / physicsProgress.total) * 100)}%"></div></div>
        <div class="physics-meta">
          <span>{physicsProgress.done} / {physicsProgress.total} systems</span>
          <span>{Math.round((physicsProgress.done / physicsProgress.total) * 100)}%</span>
        </div>
        <p class="physics-joke">{physicsProgress.joke}</p>
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
    />
  {:else if $starmapStore && currentSystemId}
    <!-- SystemView owns its own AppShell (rail/strip/canvas/bar/detail/fab); forward app nav. -->
    {#if $systemStore && effectiveRulePack}
      <SystemView
        system={$systemStore} rulePack={effectiveRulePack} {exampleSystems}
        {broadcastSessionId}
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
        on:catalogue={() => showCompanionModal = true}
        on:interstellar={(e) => { interstellarShipId = e.detail?.shipId || ''; showInterstellarModal = true; }}
        on:back={handleBackToStarmap}
        on:renameNode={handleRenameNode}
      />
    {/if}
  {:else if $starmapStore}
    <!-- Starmap owns its own AppShell now; forward its rail's app-nav. -->
    <Starmap
      bind:this={starmapComponent}
      starmap={$starmapStore}
      rulePack={selectedRulepack}
      on:new={handleRequestNewStarmap}
      on:catalogue={() => showCompanionModal = true}
      on:systemclick={handleSystemClick}
      on:systemzoom={handleSystemZoom}
      on:addsystemat={handleAddSystemAt}
      on:selectsystemforlink={handleSelectSystemForLink}
      on:editroute={handleEditRoute}
      on:deletesystem={handleDeleteSystem}
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
      on:save={handleSaveSettings}
      on:edittemporal={() => { settingsReturnSection = 'time'; showTemporalModal = true; }}
      on:editfuel={() => { settingsReturnSection = 'technology'; showFuelModal = true; }}
      on:editatmospheres={() => { settingsReturnSection = 'planets'; showAtmosphereModal = true; }}
      on:editsensors={() => { settingsReturnSection = 'technology'; showSensorsModal = true; }}
      on:editpoi={() => { settingsReturnSection = 'generation'; showPoiEditor = true; }}
      on:llm={() => { settingsReturnSection = 'system'; showLlmSettingsModal = true; }}
      on:about={() => showAbout = true}
    />
  {/if}
  {#if showPoiEditor}
    <PoIPackEditor existingTags={allTagKeys} on:close={() => { showPoiEditor = false; reprocessAllReasons(); if (settingsReturnSection) showSettingsModal = true; }} />
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
  {#if showSensorsModal && $starmapStore && selectedRulepack}
    <EditSensorsModal showModal={showSensorsModal} rulePack={selectedRulepack} starmap={$starmapStore} on:save={(e) => applyStarmapOverrides(e.detail)} on:close={() => { showSensorsModal = false; returnToSettings(); }} />
  {/if}
  {#if showTemporalModal && $starmapStore}
    <EditTemporalModal showModal={showTemporalModal} starmap={$starmapStore} on:save={(e) => starmapStore.update((s) => s ? { ...s, temporal: e.detail.temporal } : s)} on:close={() => { showTemporalModal = false; returnToSettings(); }} />
  {/if}
  {#if showAbout}
    <AboutModal rulePack={$systemStore ? effectiveRulePack : null} on:close={() => showAbout = false} />
  {/if}

  {#if showCompanionModal}
    <CompanionModal sessionId={broadcastSessionId} on:close={() => showCompanionModal = false} />
  {/if}

  {#if showInterstellarModal && $starmapStore}
    <InterstellarTransitModal starmap={$starmapStore} rulePack={effectiveRulePack || selectedRulepack} initialShipId={interstellarShipId} on:startjourney={handleStartJourney} on:close={() => showInterstellarModal = false} />
  {/if}

  {#if showAllBodies}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showAllBodies = false)}>
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

  {#if showTagFinder}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showTagFinder = false)}>
      <div class="allbodies-card" role="dialog" aria-label="Find by tag" on:click|stopPropagation>
        <header class="allbodies-head">
          <span>Find by tag</span>
          <button class="allbodies-close" aria-label="Close" on:click={() => (showTagFinder = false)}>×</button>
        </header>
        <TagFinder
          nodes={allBodies}
          currentSystemId={currentSystemId}
          distanceOf={tagFinderDistance}
          distanceUnit={$starmapStore?.distanceUnit ?? 'ly'}
          contextOf={allBodiesContext}
          on:select={handleTagFinderSelect}
        />
      </div>
    </div>
  {/if}

  {#if showRoutes}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showRoutes = false)}>
      <div class="allbodies-card" role="dialog" aria-label="Routes and journeys" on:click|stopPropagation>
        <header class="allbodies-head">
          <span>Routes &amp; journeys</span>
          <button class="allbodies-close" aria-label="Close" on:click={() => (showRoutes = false)}>×</button>
        </header>
        <div class="routes-body">
          <h4>Journeys underway &amp; planned ({routesData.journeys.length})</h4>
          {#if routesData.journeys.length === 0}
            <p class="routes-empty">No active or planned journeys.</p>
          {:else}
            {#each routesData.journeys as j (j.id)}
              <button class="route-row" on:click={() => { showRoutes = false; enterSystemAndFocus(j.systemId, j.constructId); }}>
                <span class="route-status {j.status}">{j.status}</span>
                <span class="route-main"><strong>{j.constructName}</strong> · {j.origin} → {j.target}{j.legs > 1 ? ` (${j.legs} legs)` : ''}</span>
                <span class="route-sys">{j.systemName}</span>
              </button>
            {/each}
          {/if}
          <h4>Interstellar routes ({routesData.interstellar.length})</h4>
          {#if routesData.interstellar.length === 0}
            <p class="routes-empty">No interstellar routes.</p>
          {:else}
            {#each routesData.interstellar as r (r.id)}
              <div class="route-row static">
                <span class="route-main"><strong>{r.source}</strong> → <strong>{r.target}</strong></span>
                <span class="route-sys">{r.distance} {r.unit}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if showAllShips}
    <div class="allbodies-overlay" role="presentation" on:click={() => (showAllShips = false)}>
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
  .routes-body { overflow-y: auto; padding: 4px 2px; }
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
  .route-main { flex: 1 1 auto; min-width: 0; font-size: 0.9rem; }
  .route-sys { flex: 0 0 auto; color: var(--text-faint, #8a8f9a); font-size: 0.8rem; }
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

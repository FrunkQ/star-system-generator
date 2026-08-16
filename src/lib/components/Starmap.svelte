<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { constructIconPath, constructIconShape } from '$lib/constructs/constructIcon';
  import { gestures } from '$lib/input/gestures';
  import { getPlanetColor as getStarColor } from '$lib/rendering/colors';
  import AppShell from './AppShell.svelte';
  import RailNav from './RailNav.svelte';
  import BodyPicker from './BodyPicker.svelte';
  import FullscreenButton from './FullscreenButton.svelte';
  import type { Starmap, System, CelestialBody, RulePack, Barycenter } from '$lib/types';
  import { constructDisplayPlacement, flybyTurn, interstellarConstructIds } from '$lib/transit/interstellar';
  import StarmapInfoPanel from './StarmapInfoPanel.svelte';
  import BottomSheet from './BottomSheet.svelte';
  import TimeDisplay from './TimeDisplay.svelte';
  import { railCollapsed } from '$lib/railStore';
  import Grid from './Grid.svelte';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import { systemSeparation, zCounts } from '$lib/map/systemDistance';
  import { stampForSave } from '$lib/map/provenance';
  import SaveSystemModal from './SaveSystemModal.svelte';
  import ImportTravellerModal from './ImportTravellerModal.svelte';
  import RealSkyImportModal from './RealSkyImportModal.svelte';
  import { completeImportedStars } from '$lib/import/realsky/stardefaults';
  import { fillOutAll } from '$lib/import/realsky/fillout';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { fixUpImportedSystem } from '$lib/system/importFixup';
  import AddTravellerSystemModal from './AddTravellerSystemModal.svelte';
  import StarmapScaleBar from './StarmapScaleBar.svelte';
  import SystemPlacementDialog from './SystemPlacementDialog.svelte';
  import { TravellerImporter } from '$lib/traveller/importer';
  import { computePlayerSnapshot } from '$lib/system/utils';
  import { packsForStarmap, reasonsConfig } from '$lib/physics/reasonsToVisit';
  import { coiForStarmap } from '$lib/constructs/coi';
  import { get } from 'svelte/store';
  import { APP_VERSION, APP_DATE } from '$lib/constants';
  import { ensureTemporalState, setMasterToDisplay } from '$lib/temporal/defaults';
  import TimeControls from './TimeControls.svelte';


  // MAP HIGHLIGHTS — a system badges the union of what everything INSIDE it carries, not just its
  // star. The interesting cases are never on the star: a faction holding one moon, a refuelling stop
  // at a gas giant. Several factions in one system is a real answer, so they all show.
  import { rollUpMarkers, capMarkers, type MapHighlights } from '$lib/tags/mapHighlights';
  import type { TagCategory } from '$lib/tags/tagCategories';
  // A system's badge IS the panel's tag chip, drawn small — see tags/tagPill.ts. The pill's width is
  // now MEASURED; it used to be guessed from the character count, so a wide label overflowed its own
  // rect and a narrow one sat in a rect too big for it.
  import { tagPillMetrics, tagPillSvg, tagPillText, TAG_PILL_OVERFLOW_BG, TAG_PILL_OVERFLOW_FG } from '$lib/tags/tagPill';
  const markerPill = tagPillMetrics(6);
  import { liveOverrides } from '$lib/player/liveOverrides';
  import { tagCategories } from '$lib/tags/tagCategories';
  $: activeHighlights = $liveOverrides.highlightsMuted ? [] : $liveOverrides.mapHighlights;
  // THE SELECTION IS PASSED IN, NEVER CLOSED OVER. `{@const hl = systemMarkers(systemNode)}` inside the
  // each-block only re-evaluates when a value it MENTIONS changes; a helper that reads `activeHighlights`
  // out of scope hides that dependency from the compiler, so the badges were computed once — against an
  // empty selection — and never again. The fade worked throughout, because its expression names
  // `highlightsActive` directly, which is why the map looked half-alive: systems dimmed, nothing badged.
  const systemMarkers = (sysNode: any, highlights: MapHighlights, cats: TagCategory[]) =>
    capMarkers(rollUpMarkers(sysNode?.system?.nodes ?? [], highlights, cats));
  // A HIGHLIGHT IS A FILTER on the starmap, by default and with no extra control: once something is
  // highlighted, the systems carrying none of it fade back. "Show me where the refuelling is" then
  // reads as a map answer instead of a hunt for small badges. Clearing the selection restores
  // everything — it is a visual emphasis, never a hide.
  $: highlightsActive = activeHighlights.length > 0;
  // Same rule as systemMarkers above: the caller names the reactive values, so the dependency is visible.
  const systemMatches = (sysNode: any, highlights: MapHighlights, cats: TagCategory[]) =>
    rollUpMarkers(sysNode?.system?.nodes ?? [], highlights, cats).length > 0;
  // The KEY. Badges alone do not explain themselves at starmap zoom, so the selection is listed with
  // its colours. Built from the same resolution the markers use, so it cannot disagree with them.
  $: highlightKey = (() => {
    const seen = new Map<string, { label: string; color: string; textColor: string }>();
    for (const sys of starmap?.systems ?? []) {
      for (const m of rollUpMarkers((sys as any)?.system?.nodes ?? [], activeHighlights, $tagCategories)) {
        if (!seen.has(m.key)) seen.set(m.key, { label: m.label, color: m.color, textColor: m.textColor });
      }
    }
    return [...seen.values()];
  })();

  export let starmap: Starmap;
  export let rulePack: RulePack; // We need this prop to show defaults!
  export let routesAttention: 'stuck' | 'intervention' | 'done' | null = null; // worst fleet attention → rail Routes dot
  export let linkingMode: boolean = false;
  export let selectedSystemForLink: string | null = null;

  const dispatch = createEventDispatcher();

  // Phase 03: Starmap owns its own AppShell (same shared rail as SystemView). RailNav app
  // nav forwards up to +page via dispatch; the niche bulk-editors stay in the header menu.
  let mode: 'desktop' | 'phone' = 'desktop';
  let railOpen = false; // phone slide-in rail (opened by the + menu FAB)
  const starmapFabActions = [{ id: 'reset', label: 'Reset view', icon: '↺' }];
  function handleStarmapFabAction(e: CustomEvent<string>) {
    if (e.detail === 'reset') resetView();
  }

  let svgElement: SVGSVGElement;
  let groupElement: SVGGElement;
  let starmapContainer: HTMLDivElement;

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuSystemId: string | null = null;
  let contextMenuRoute: Starmap['routes'][number] | null = null;
  let detectedSubsector: any = null;
  let isStarContextMenu = false;

  // Header State
  let showDropdown = false;
  let showSaveModal = false;
  let showImportModal = false;
  let showAddTravellerModal = false;
  
  let travellerImportCoords = { x: 0, y: 0 };

  // WS7b relative placement: the system being measured FROM, the live ghost position, and which side of the
  // map the dialogue is docked to. Non-null `placeOrigin` is what opens the dialogue.
  let placeOrigin: Starmap['systems'][number] | null = null;
  let placeGhost: { x: number; y: number; z?: number } | null = null;
  let placeSide: 'left' | 'right' = 'right';
  let placeInset = 16;

  const aboutContent = `
<h1>Star System Explorer</h1>

<p><strong>Version:</strong> ${APP_VERSION}<br>
<strong>Date:</strong> ${APP_DATE}</p>

<p>A tool for creating and exploring scientifically-plausible star systems.</p>

<hr>

<p><strong>Community & Support:</strong><br>
<a href="https://discord.gg/UAEq4zzjD8" target="_blank">Join us on Discord!</a><br>
<a href="https://youtu.be/LrgNh2PVOlg" target="_blank">Watch the Tutorial Video</a></p>
`;

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  // Map text must not grow with the map. Everything below lives INSIDE the world transform, so it tracks
  // its system as you pan and zoom — which is right — but it also inherits the scale, so zooming in blew
  // the names up to headlines and zooming out made them illegible. Dividing each text's font size and
  // its offset from the marker by the zoom cancels exactly that one inherited factor, leaving a constant
  // SCREEN size. (The 3D starmap gets the same result a different way: its labels are sprites with an
  // explicit size, which never inherit scene scale in the first place.)
  $: labelK = 1 / Math.max(0.05, zoom);

  let lastMouseX = 0;
  let lastMouseY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  // A node drag only "moves" (and so suppresses the follow-up select click) once it
  // crosses this many screen px. Without it, finger jitter on a touch tap would mark
  // a drag and you could never tap-to-select a system.
  const NODE_DRAG_THRESHOLD_PX = 5;

  let gridSize = 50;
  let svgScale = 1;
  let draggedSystemId: string | null = null;
  let dragMoved = false;
  let dragSvgScale = { x: 1, y: 1 };
  let dragRawPosition: { x: number; y: number } | null = null;
  let mapMode: 'diagrammatic' | 'scaled' = 'diagrammatic';
  let isScaled = false;
  let invertDisplay = false;
  let activeScale = { unit: 'LY', pixelsPerUnit: 25, showScaleBar: true };
  let scaleBarVisible = false;
  // Time-scrubber/playback state now lives in <TimeControls>; this view just
  // passes `temporal` down and persists `updatetemporal` events.
  $: ensuredTemporal = ensureTemporalState(starmap).temporal!;

  function handleTemporalUpdate(event: CustomEvent) {
    dispatch('updatestarmap', { ...ensureTemporalState(starmap), temporal: event.detail });
  }

  // Star Map clock actions are instant (no orbit animation here).
  function handleResetDisplay() {
    const normalized = ensureTemporalState(starmap);
    dispatch('updatestarmap', {
      ...normalized,
      temporal: { ...normalized.temporal!, displayTimeSec: normalized.temporal!.masterTimeSec }
    });
  }

  function handleSetActual() {
    const normalized = ensureTemporalState(starmap);
    dispatch('updatestarmap', { ...normalized, temporal: setMasterToDisplay(normalized.temporal!) });
  }

  let showAlphaDisclaimer = false;
  let alphaAcknowledged = false;
  let pendingAddSystemCoords: { x: number, y: number } | null = null;

  function cancelAlpha() {
    showAlphaDisclaimer = false;
    alphaAcknowledged = false;
    pendingAddSystemCoords = null;
  }

  function proceedAlpha() {
    showAlphaDisclaimer = false;
    alphaAcknowledged = true;
    if (pendingAddSystemCoords) {
      dispatch('addsystemat', pendingAddSystemCoords);
      pendingAddSystemCoords = null;
    }
  }

  $: mapMode = starmap.mapMode ?? 'diagrammatic';
  $: isScaled = mapMode === 'scaled';
  $: invertDisplay = starmap.invertDisplay ?? false;
  $: activeScale = starmap.scale ?? { unit: starmap.distanceUnit || 'LY', pixelsPerUnit: 25, showScaleBar: true };
  $: scaleBarVisible = isScaled && (activeScale.showScaleBar ?? true);
  $: if (invertDisplay && $starmapUiStore.showBackgroundImage) {
    starmapUiStore.update((ui) => ({ ...ui, showBackgroundImage: false }));
  }


  function roundDistance(value: number): number {
    return Math.round(value * 100) / 100;
  }

  function updateSvgScale() {
    if (!svgElement) return;
    const viewBox = svgElement.viewBox.baseVal;
    if (!viewBox.width) return;
    svgScale = svgElement.clientWidth / viewBox.width;
  }

  // WS7: distances come from the ONE shared module so routes, the measure tool and journey duration
  // can never disagree about whether depth counts. Depth counts unless the campaign opts out.
  function getRouteDistance(source: { x: number; y: number; z?: number }, target: { x: number; y: number; z?: number }, pixelsPerUnit: number): number {
    return roundDistance(systemSeparation(source, target, pixelsPerUnit, !zCounts(starmap)));
  }

  function formatRouteDistance(distance: number): string {
    return Number.isFinite(distance) ? distance.toFixed(2) : '0.00';
  }

  function recomputeScaledRoutes(updatedSystems: Starmap['systems'], force = false) {
    if ((!force && !isScaled) || !activeScale || activeScale.pixelsPerUnit <= 0) return starmap.routes;
    const byId = new Map(updatedSystems.map((s) => [s.id, s]));
    return starmap.routes.map((route) => {
      const source = byId.get(route.sourceSystemId);
      const target = byId.get(route.targetSystemId);
      if (!source || !target) return route;
      return {
        ...route,
        distance: getRouteDistance(source.position, target.position, activeScale.pixelsPerUnit),
        unit: starmap.distanceUnit
      };
    });
  }

  function handleScaleBarToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const scale = starmap.scale ?? { unit: starmap.distanceUnit || 'LY', pixelsPerUnit: 25, showScaleBar: true };
    dispatch('updatestarmap', { ...starmap, scale: { ...scale, showScaleBar: checked } });
  }

  function handleInvertDisplayToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    dispatch('updatestarmap', { ...starmap, invertDisplay: checked });
  }

  // Routes: stopPropagation keeps the root gesture layer from capturing the pointer,
  // so the route's own on:click (open editor) still fires for a tap — same treatment
  // as nodes below. Without it the SVG root's pointer capture retargets the click and
  // the route editor can never open.
  function handleRoutePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
  }

  // Node drag (Phase 02): pointer-based. stopPropagation keeps the root gesture layer
  // from ever registering this pointer (so it can't pan), and we track move/up on the
  // window so a drag that leaves the node still works. No pointer-capture, so the node's
  // own on:click (select) still fires for a tap.
  function handleSystemPointerDown(event: PointerEvent, systemId: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    draggedSystemId = systemId;
    dragMoved = false;
    lastMouseX = dragStartX = event.clientX;
    lastMouseY = dragStartY = event.clientY;

    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    dragSvgScale = {
      x: viewBox.width / svgRect.width,
      y: viewBox.height / svgRect.height
    };

    const draggedSystem = starmap.systems.find((s) => s.id === systemId);
    dragRawPosition = draggedSystem ? { x: draggedSystem.position.x, y: draggedSystem.position.y } : null;

    window.addEventListener('pointermove', onSystemDragMove);
    window.addEventListener('pointerup', onSystemDragEnd);
    window.addEventListener('pointercancel', onSystemDragEnd);
  }

  function onSystemDragMove(event: PointerEvent) {
    if (!draggedSystemId) return;
    const deltaX = event.clientX - lastMouseX;
    const deltaY = event.clientY - lastMouseY;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    // Hold position until the press clearly becomes a drag, so a tap still selects.
    if (!dragMoved) {
      if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) < NODE_DRAG_THRESHOLD_PX) return;
      dragMoved = true;
    }

    const worldDeltaX = (deltaX * dragSvgScale.x) / zoom;
    const worldDeltaY = (deltaY * dragSvgScale.y) / zoom;
    if (dragRawPosition) {
      dragRawPosition = {
        x: dragRawPosition.x + worldDeltaX,
        y: dragRawPosition.y + worldDeltaY
      };
    }
    const updatedSystems = starmap.systems.map((systemNode) => {
      if (systemNode.id !== draggedSystemId) return systemNode;
      const nextX = dragRawPosition ? dragRawPosition.x : systemNode.position.x + worldDeltaX;
      const nextY = dragRawPosition ? dragRawPosition.y : systemNode.position.y + worldDeltaY;
      const snapped = snapPointToCurrentGrid(nextX, nextY);
      // Spread the old position first: dragging moves a system ACROSS the map plane, it does not reset its
      // depth. Naming x/y explicitly here would silently drop z on every drag.
      return { ...systemNode, position: { ...systemNode.position, x: snapped.x, y: snapped.y } };
    });
    const updatedStarmap = {
      ...starmap,
      systems: updatedSystems,
      routes: recomputeScaledRoutes(updatedSystems)
    };
    dispatch('updatestarmap', updatedStarmap);
  }

  function onSystemDragEnd() {
    draggedSystemId = null;
    dragRawPosition = null;
    window.removeEventListener('pointermove', onSystemDragMove);
    window.removeEventListener('pointerup', onSystemDragEnd);
    window.removeEventListener('pointercancel', onSystemDragEnd);
  }

  // Traveller mode uses the 1-hex-=-1-parsec geometry for SNAPPING, parsec scaling, subsector
  // detection and import placement — that logic stays on effectiveGridType.
  $: effectiveGridType = $starmapUiStore.travellerMode ? 'traveller-hex' : $starmapUiStore.gridType;
  // …but the VISIBLE grid obeys the snap-grid switch in Settings: Traveller mode no longer FORCES
  // the numbered hex overlay. Choose "Hex" to see it; "None"/"Grid" hides it while Traveller data,
  // parsec scale and snapping keep working underneath.
  // WS3: picking "Traveller hex" explicitly shows the numbered overlay for ANY user, mode or not.
  $: displayGridType = $starmapUiStore.gridType === 'traveller-hex'
    ? 'traveller-hex'
    : $starmapUiStore.travellerMode
      ? ($starmapUiStore.gridType === 'hex' ? 'traveller-hex' : $starmapUiStore.gridType)
      : $starmapUiStore.gridType;

  // --- Active interstellar journeys: ships in flight along the starmap, driven by the game clock. ---
  $: journeyNowSec = Number(ensuredTemporal?.displayTimeSec ?? 0);
  $: activeJourneys = starmap.activeJourneys ?? [];
  const systemById = (id: string) => starmap.systems.find((s) => s.id === id);
  // The construct node behind a journey (for its assigned icon). It still lives in a system until reconcile.
  const journeyShip = (j: any): any => {
    for (const s of starmap.systems) { const n = (s.system?.nodes ?? []).find((x: any) => x.id === j.shipId); if (n) return n; }
    return null;
  };
  // SVG path for a construct's icon_type, from the ONE glyph vocabulary (inbox A34). The private copy
  // this replaces had already drifted: it fell back to a DIAMOND where every other surface falls back
  // to a triangle, so a construct with no authored icon_type drew as a different shape here than on
  // the orrery, in the holo scene and in its own info block. Circle still renders as a <circle>.
  const iconPath = (type?: string): string => constructIconPath(constructIconShape(type), 0, 0, 10);
  // Edge colour by journey state: black under way, red stranded, green arrived.
  const EDGE_TRANSIT = '#111', EDGE_STRANDED = '#d04545', EDGE_ARRIVED = '#2f9e57';

  // Clicking a ship opens the starmap-level ship panel (+page owns it: full construct editor + the
  // in-flight controls). All journey resolution + construct edits are handled there against the store.
  function requestCancelJourney(j: any, mx?: number, my?: number) {
    // A construct endpoint needs no z here: `resolveMeasure` re-derives its whole position (depth
    // included) from the clock on every frame, so the ship stays tracked as time advances.
    if (measureMode && mx !== undefined && my !== undefined) { measurePick(mx, my, undefined, j.shipName, j.shipId); return; }
    dispatch('openship', { journeyId: j.id });
  }

  function snapPointToCurrentGrid(x: number, y: number): { x: number; y: number } {
    if (effectiveGridType === 'none') return { x, y };

    const originX = 0;
    const originY = 0;

    if (effectiveGridType === 'grid') {
      const cellIndexX = Math.floor((x - originX) / gridSize);
      const cellIndexY = Math.floor((y - originY) / gridSize);
      return {
        x: (cellIndexX * gridSize) + (gridSize / 2) + originX,
        y: (cellIndexY * gridSize) + (gridSize / 2) + originY
      };
    }

    if (effectiveGridType === 'hex' || effectiveGridType === 'traveller-hex') {
      const hexSize = gridSize / 2;
      const hexHeight = Math.sqrt(3) * hexSize;
      const horizDist = 1.5 * hexSize;

      const approxCol = (x - originX) / horizDist;
      const approxRow = (y - originY) / hexHeight - (Math.abs(Math.round(approxCol)) % 2) * 0.5;

      const c = Math.round(approxCol);
      const r = Math.round(approxRow);

      let minDistSq = Infinity;
      let closestCenter = { x, y };

      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nr = r + dr;
          const nc = c + dc;
          const nx = originX + nc * horizDist;
          const ny = originY + nr * hexHeight + (Math.abs(nc) % 2) * (hexHeight / 2);

          const dx = x - nx;
          const dy = y - ny;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistSq) {
            minDistSq = distSq;
            closestCenter = { x: nx, y: ny };
          }
        }
      }
      return closestCenter;
    }

    return { x, y };
  }

  $: if (effectiveGridType === 'traveller-hex') {
    // Traveller convention: 1 hex center-to-center equals 1 parsec.
    const hexSize = gridSize / 2;
    const hexCenterToCenterPx = Math.sqrt(3) * hexSize;
    const currentScale = starmap.scale ?? { unit: starmap.distanceUnit || 'LY', pixelsPerUnit: 25, showScaleBar: true };

    const needsUnitUpdate = starmap.distanceUnit !== 'pc' || starmap.unitIsPrefix;
    const needsModeUpdate = (starmap.mapMode ?? 'diagrammatic') !== 'scaled';
    const needsScaleUpdate =
      currentScale.unit !== 'pc' ||
      Math.abs((currentScale.pixelsPerUnit || 0) - hexCenterToCenterPx) > 0.0001;

    if (needsUnitUpdate || needsModeUpdate || needsScaleUpdate) {
      const newStarmap = {
        ...starmap,
        distanceUnit: 'pc',
        unitIsPrefix: false,
        mapMode: 'scaled' as const,
        scale: {
          ...currentScale,
          unit: 'pc',
          pixelsPerUnit: hexCenterToCenterPx,
          showScaleBar: currentScale.showScaleBar ?? true
        }
      };
      dispatch('updatestarmap', newStarmap);
    }
  }

  function handleSaveStarmap(event: CustomEvent<{mode: 'GM' | 'Player', includeConstructs: boolean}>) {
      const { mode, includeConstructs } = event.detail;
      
      // Deep copy first
      const starmapToSave = JSON.parse(JSON.stringify(starmap));

      // Process each system
      starmapToSave.systems = starmapToSave.systems.map((node: any) => {
          // If the system data is loaded in the node
          if (node.system) {
              if (mode === 'Player') {
                  node.system = computePlayerSnapshot(node.system);
              }
              if (!includeConstructs) {
                  node.system.nodes = node.system.nodes.filter((n: any) => n.kind !== 'construct');
              }
          }
          return node;
      });

      // A GM "Full Backup" must be self-contained: embed the user's PoI packs + reasons config so they
      // travel inside the file (matching the rail's Download). The Player handout deliberately omits them
      // (the computed tags are already baked into the redacted bodies; the rule definitions stay GM-side).
      if (mode === 'GM') {
          (starmapToSave as any).poiPacks = packsForStarmap();
          (starmapToSave as any).reasonsConfig = get(reasonsConfig);
          (starmapToSave as any).coiCategories = coiForStarmap();
      }

      // Download. M1: stamp the build that wrote the file — see lib/map/provenance.ts. A Player handout is
      // stamped too: it is still a file this build produced, and knowing which build made it is the point.
      const json = JSON.stringify(stampForSave(starmapToSave), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${starmap.name.replace(/\s+/g, '_') || 'starmap'}-Starmap${mode === 'Player' ? '-Player' : ''}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  }

  // Zoom about a canvas-relative point (old handleWheel logic, generalised to a factor so
  // wheel and pinch share it). Respects the "disable mouse zoom" setting for both.
  function zoomAt(factor: number, localX: number, localY: number) {
    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;
    const mouseX = localX * scaleX;
    const mouseY = localY * scaleY;
    panX = mouseX - (mouseX - panX) * factor;
    panY = mouseY - (mouseY - panY) * factor;
    zoom = zoom * factor;
  }

  // Bridge the gesture long-press / right-click (canvas-relative point) to the existing
  // map context menu, which expects a MouseEvent with screen coords.
  function openMapContextMenuAt(localX: number, localY: number) {
    const svgRect = svgElement.getBoundingClientRect();
    handleMapContextMenu({
      clientX: localX + svgRect.left,
      clientY: localY + svgRect.top,
      preventDefault: () => {},
      stopPropagation: () => {}
    } as unknown as MouseEvent);
  }

  // Unified pointer gestures on the SVG root: pan / pinch-zoom / long-press menu. Pointers
  // that start on a system node are stopPropagation'd by handleSystemPointerDown, so they
  // never reach here (no pan-while-dragging-a-node). Tap on blank does nothing (as before),
  // so onTap is intentionally omitted. Starmap pan has no inertia (unchanged).
  const starmapGestures = {
    onPan: ({ dx, dy }: { dx: number; dy: number }) => { panX += dx; panY += dy; },
    onZoom: ({ factor, x, y }: { factor: number; x: number; y: number }) => zoomAt(factor, x, y),
    onLongPress: ({ x, y }: { x: number; y: number }) => openMapContextMenuAt(x, y)
  };

  function resetView() {
    if (starmap.systems.length === 0) {
      // Center on World (0,0)
      const viewBox = svgElement.viewBox.baseVal;
      panX = viewBox.width / 2;
      panY = viewBox.height / 2;
      zoom = 1;
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const system of starmap.systems) {
      minX = Math.min(minX, system.position.x);
      minY = Math.min(minY, system.position.y);
      maxX = Math.max(maxX, system.position.x);
      maxY = Math.max(maxY, system.position.y);
    }

    const paddingLeft = 75;
    const paddingRight = 160; // Extra space for long system names
    const paddingVertical = 50;

    const bboxWidth = maxX - minX + paddingLeft + paddingRight;
    const bboxHeight = maxY - minY + paddingVertical * 2;

    const viewBox = svgElement.viewBox.baseVal;
    const zoomX = viewBox.width / bboxWidth;
    const zoomY = viewBox.height / bboxHeight;
    const newZoom = Math.min(zoomX, zoomY) * 1.2; // Zoom in 20% more than the tightest fit

    // Cap the newZoom at the default starting zoom of 1
    zoom = Math.min(newZoom, 1);

    // Center point calculation:
    // We want the visual center of the viewBox to align with the center of the bounding box
    // BUT shifted to account for the asymmetric padding.
    // The "center" of the content is (minX + maxX) / 2.
    // The "center" of the padded area is (minX - paddingLeft + maxX + paddingRight) / 2.
    // This shifts the view so that more space is visible on the right.
    const centerX = (minX - paddingLeft + maxX + paddingRight) / 2;
    const centerY = minY + (maxY - minY) / 2;

    panX = viewBox.width / 2 - centerX * zoom;
    panY = viewBox.height / 2 - centerY * zoom;
  }

  onMount(async () => {
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('resize', updateSvgScale);
    resetView();
    updateSvgScale();
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
    window.removeEventListener('resize', updateSvgScale);
    onSystemDragEnd(); // clear any in-flight node-drag window listeners
  });

  function handleClickOutside(event: MouseEvent) {
    if (showContextMenu) {
      closeContextMenu();
    }
  }

      // getStarColor is now the canonical getPlanetColor (aliased on import) so a star is
      // the SAME colour here, in the orrery, and on summary cards — all token-driven.
  // A system is hidden from the players' field guide when its ROOT node is player-hidden — for a
  // multi-star system that's the top barycenter, for a single star it's the star itself. Hiding an
  // underlying star only hides that star (not the whole system). Flagged on the GM map with a
  // crossed-eye reminder.
  function isSystemHidden(node: Starmap['systems'][number]): boolean {
      const ns = node.system?.nodes || [];
      const root = ns.find((n) => n.kind === 'barycenter' && !n.parentId) || ns.find((n) => !n.parentId);
      return !!root && !!(root as any).object_playerhidden;
  }

  function getVisualNodes(system: System): CelestialBody[] {
      const stars = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
      if (stars.length > 0) {
          // Sort by mass descending so primary is first
          return stars.sort((a, b) => (b.massKg || 0) - (a.massKg || 0));
      }
      // No stars? Return root node if it's a body
      const root = system.nodes.find(n => n.parentId === null);
      if (root && root.kind === 'body') return [root as CelestialBody];
      return [];
  }

  // --- BodyPicker (starmap-scoped: pick a system by name, OR an interstellar ship) ---
  // Ships in transit / stranded belong to no system, so the orrery pickers hide them; here at starmap
  // level they DO belong — listed under their own "Interstellar" group (and findable by name).
  $: interstellarPickerNodes = (() => {
      const ids = interstellarConstructIds(starmap, journeyNowSec);
      const out: any[] = [];
      for (const id of ids) {
          let construct: any = null, journeyId: string | null = null;
          const j = (activeJourneys ?? []).find((x) => x.shipId === id);
          if (j) { journeyId = j.id; construct = journeyShip(j); }
          if (!construct) construct = (starmap.adriftConstructs ?? []).find((a) => a.construct?.id === id)?.construct;
          if (!construct) continue;
          const p = constructDisplayPlacement(starmap, id, journeyNowSec);
          out.push({ ...construct, kind: 'construct', __interstellar: true, __journeyId: journeyId, __state: p.kind });
      }
      return out;
  })();
  $: pickerNodes = [...starmap.systems, ...interstellarPickerNodes];

  const systemPickerCategorize = (n: any) => n?.kind === 'construct' ? ['Constructs'] : ['Systems'];
  function systemPickerColor(sysNode: any): string {
      if (sysNode?.kind === 'construct') return sysNode.icon_color || '#ffd23f';
      const vis = getVisualNodes(sysNode.system);
      return vis.length ? getStarColor(vis[0]) : '#888';
  }
  function countNodes(n: any[]) {
      let stars = 0, planets = 0, moons = 0, constructs = 0;
      for (const x of n) {
          if (x.kind === 'construct') constructs++;
          else if (x.kind === 'body') {
              if (x.roleHint === 'star') stars++;
              else if (x.roleHint === 'planet') planets++;
              else if (x.roleHint === 'moon') moons++;
          }
      }
      return { stars, planets, moons, constructs };
  }
  function systemPickerContext(sysNode: any): string {
      if (sysNode?.kind === 'construct') return sysNode.__state === 'adrift' ? 'adrift in interstellar space' : 'in transit';
      const c = countNodes(sysNode.system?.nodes ?? []);
      const bits = [] as string[];
      if (c.stars) bits.push(`${c.stars}★`);
      if (c.planets) bits.push(`${c.planets} plt`);
      if (c.moons) bits.push(`${c.moons} mn`);
      if (c.constructs) bits.push(`${c.constructs} con`);
      return bits.join(' · ');
  }
  // Aggregate summary across the whole starmap, shown at the top of the picker dropdown.
  $: starmapSummary = (() => {
      let stars = 0, planets = 0, moons = 0, constructs = 0;
      for (const sys of starmap.systems) {
          const c = countNodes(sys.system?.nodes ?? []);
          stars += c.stars; planets += c.planets; moons += c.moons; constructs += c.constructs;
      }
      return `${starmap.systems.length} systems · ${stars} stars · ${planets} planets · ${moons} moons · ${constructs} constructs`;
  })();
  function handlePickSystem(e: CustomEvent<string>) {
      const ship = interstellarPickerNodes.find((n) => n.id === e.detail);
      if (ship) { if (ship.__journeyId) dispatch('openship', { journeyId: ship.__journeyId }); return; }
      dispatch('systemclick', e.detail);
  }

  function getBlackHoleType(body: CelestialBody): 'none' | 'BH' | 'BH_active' {
      if (body.classes.includes('star/BH_active') || body.classes.includes('BH_active')) return 'BH_active';
      if (body.classes.includes('star/BH') || body.classes.includes('BH')) return 'BH';
      return 'none';
  }

  // --- Measure tool (scaled maps only): tap two targets — any stars or interstellar ships — to read the
  //     distance between them, in the map's scale units. ---
  let measureMode = false;
  // An endpoint is a fixed point (star) or — when constructId is set — a moving construct, in which case
  // its position is re-derived from the clock so the ruler TRACKS the ship as time advances.
  // WS7: an endpoint carries DEPTH. Without it `posZ` reads both ends as the reference plane and the
  // 3D branch of `systemSeparation` returns the planar answer however the campaign is configured — the
  // flag looks wired and does nothing. A construct's z is not picked up here (it is re-derived from the
  // clock in `resolveMeasure` every frame, so anything stored at pick time is immediately overwritten).
  type MeasureEnd = { x: number; y: number; z?: number; label: string; constructId?: string };
  let measureA: MeasureEnd | null = null;
  let measureB: MeasureEnd | null = null;
  function toggleMeasure() { measureMode = !measureMode; if (!measureMode) { measureA = null; measureB = null; } }
  function measurePick(x: number, y: number, z: number | undefined, label: string, constructId?: string) {
    // Depth is part of identity: two systems CAN share an x/y and differ only in z, which is exactly
    // what WS7 made possible, and picking one then the other must read as two distinct ends.
    const same = (e: MeasureEnd) => constructId ? e.constructId === constructId : (!e.constructId && x === e.x && y === e.y && (z ?? 0) === (e.z ?? 0));
    if (!measureA || (measureA && measureB)) { measureA = { x, y, z, label, constructId }; measureB = null; }
    else if (!same(measureA)) { measureB = { x, y, z, label, constructId }; }
  }
  // Resolve an endpoint to a live position: a construct endpoint follows its clock-derived placement
  // (transit/adrift point, or the system it's resting in); a plain point stays put. Takes nowSec + sm as
  // args so the reactive statements below re-run when the clock or starmap changes.
  function resolveMeasure(ep: MeasureEnd | null, nowSec: number, sm: Starmap): MeasureEnd | null {
    if (!ep) return null;
    if (ep.constructId) {
      const pl = constructDisplayPlacement(sm, ep.constructId, nowSec);
      if (pl.kind === 'transit' || pl.kind === 'adrift') return { ...ep, x: pl.x, y: pl.y, z: pl.z };
      // Resting in a system: the ship's depth IS that system's depth, known exactly.
      if (pl.kind === 'system') { const s = systemById(pl.systemId); if (s) return { ...ep, x: s.position.x, y: s.position.y, z: s.position.z }; }
    }
    return ep;
  }
  $: mA = resolveMeasure(measureA, journeyNowSec, starmap);
  $: mB = resolveMeasure(measureB, journeyNowSec, starmap);
  $: measureDist = (mA && mB && activeScale.pixelsPerUnit > 0)
    ? roundDistance(systemSeparation(mA, mB, activeScale.pixelsPerUnit, !zCounts(starmap)))
    : null;

  function handleStarClick(event: MouseEvent, systemId: string) {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    if (event.button === 0) { // Left click
      if (measureMode) {
        const s = systemById(systemId);
        if (s) measurePick(s.position.x, s.position.y, s.position.z, s.name);
      } else if (linkingMode) {
        dispatch('selectsystemforlink', systemId);
      } else {
        dispatch('systemclick', systemId);
      }
    }
  }

  function handleStarDblClick(systemId: string) {
    dispatch('systemzoom', systemId);
  }

  function handleStarContextMenu(event: MouseEvent, systemId: string) {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu = true;
    isStarContextMenu = true;
    const rect = starmapContainer.getBoundingClientRect();
    contextMenuX = event.clientX - rect.left;
    contextMenuY = event.clientY - rect.top;
    contextMenuSystemId = systemId;
    contextMenuRoute = null;
  }

  let contextMenuClickCoords = { x: 0, y: 0 };

  function handleMapContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu = true;
    isStarContextMenu = false;
    const rect = starmapContainer.getBoundingClientRect();
    contextMenuX = event.clientX - rect.left;
    contextMenuY = event.clientY - rect.top;
    contextMenuSystemId = null;
    contextMenuRoute = null;

    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;

    let clickX = ((event.clientX - svgRect.left) * scaleX - panX) / zoom;
    let clickY = ((event.clientY - svgRect.top) * scaleY - panY) / zoom;

    const snapped = snapPointToCurrentGrid(clickX, clickY);
    clickX = snapped.x;
    clickY = snapped.y;

    contextMenuClickCoords = { x: clickX, y: clickY };

    // Subsector Detection
    detectedSubsector = null;
    if (effectiveGridType === 'traveller-hex' && starmap.travellerMetadata) {
        const size = gridSize / 2;
        const hexWidth = 2 * size;
        const hexHeight = Math.sqrt(3) * size;
        const horizDist = 1.5 * size;

        for (const sub of starmap.travellerMetadata.importedSubsectors) {
            const dx = clickX - sub.originX;
            const dy = clickY - sub.originY;
            // Buffer checks to handle edge of hexes
            if (dx >= -size && dx < (8 * horizDist) && 
                dy >= -hexHeight/2 && dy < (10 * hexHeight)) {
                detectedSubsector = sub;
                break;
            }
        }
    }
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextMenuSystemId = null;
    contextMenuRoute = null;
  }

  // Links: LEFT-click is inert (no accidental edit modals mid-pan); right-click / long-press opens
  // this menu with Edit Link as its only option.
  function handleRouteContextMenu(event: MouseEvent, route: Starmap['routes'][number]) {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu = true;
    isStarContextMenu = false;
    const rect = starmapContainer.getBoundingClientRect();
    contextMenuX = event.clientX - rect.left;
    contextMenuY = event.clientY - rect.top;
    contextMenuSystemId = null;
    contextMenuRoute = route;
  }

  function handleContextMenuEditRoute() {
    if (contextMenuRoute) dispatch('editroute', contextMenuRoute);
    closeContextMenu();
  }

  function handleContextMenuAddSystem() {
    dispatch('addsystemat', contextMenuClickCoords);
    closeContextMenu();
  }

  // Real-sky import at a clicked point: the region lands centred here,
  // co-located with whatever the map already holds. Same shape as the
  // Traveller subsector import above, but from the astronomy catalogues.
  let showRealSkyModal = false;
  let realSkyAnchor = { x: 0, y: 0 };
  let realSkyPreviewR = 0; // live footprint ring radius, in map px

  function handleContextMenuRealSky() {
    realSkyAnchor = { ...contextMenuClickCoords };
    realSkyPreviewR = 0;
    showRealSkyModal = true;
    closeContextMenu();
  }

  function handleRealSkyAppend(event: CustomEvent<any>) {
    const { systems, fillOut } = event.detail;
    // Same completion + processing every imported system gets on load:
    // pack-band star field/tilt, then the full physics pass (the Traveller
    // importer processes before dispatching for the same reason).
    completeImportedStars(systems, rulePack);
    if (fillOut) fillOutAll(systems.map((s: any) => ({ id: s.id, system: s.system })), rulePack);
    for (const entry of systems) {
      entry.system = systemProcessor.process(fixUpImportedSystem(entry.system, rulePack), rulePack);
    }
    const existingIds = new Set(starmap.systems.map((s) => s.id));
    const added = systems.filter((s: any) => !existingIds.has(s.id));
    dispatch('updatestarmap', { ...starmap, systems: [...starmap.systems, ...added] });
    showRealSkyModal = false;
    realSkyPreviewR = 0;
  }

  // WS7b — place a new system RELATIVE to this one, by bearing / elevation / distance. The dialogue docks
  // to whichever side of the map the origin ISN'T on, so the live ghost stays visible while you drag.
  function handleContextMenuAddNear() {
    if (contextMenuSystemId) {
      const sys = starmap.systems.find((s) => s.id === contextMenuSystemId);
      if (sys) {
        placeOrigin = sys;
        placeGhost = null;
        // Dock the panel to whichever side of the MAP CANVAS the origin is not on, so the ghost stays in
        // sight. Both measurements have to be in the container's frame (which is what contextMenuX is in)
        // and the inset has to clear the rail and the detail sidebar — the container spans those too.
        const cont = starmapContainer?.getBoundingClientRect();
        const svg = svgElement?.getBoundingClientRect();
        if (cont && svg) {
          const svgLeft = svg.left - cont.left;
          placeSide = contextMenuX > svgLeft + svg.width / 2 ? 'left' : 'right';
          placeInset = Math.round((placeSide === 'left' ? svgLeft : cont.right - svg.right) + 16);
        } else {
          placeSide = 'right';
          placeInset = 16;
        }
      }
    }
    closeContextMenu();
  }
  // The distance slider's top end: a tenth of the map's own diagonal, rounded to something friendly, so the
  // range suits a 12 ly neighbourhood and a 4000 ly sector alike without the GM configuring anything.
  $: placeMaxDistance = (() => {
    const perUnit = activeScale.pixelsPerUnit > 0 ? activeScale.pixelsPerUnit : 25;
    const xs = starmap.systems.map((s) => s.position.x), ys = starmap.systems.map((s) => s.position.y);
    if (!xs.length) return 50;
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / perUnit;
    const raw = Math.max(5, span / 2);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.ceil(raw / mag) * mag;
  })();
  function handlePlaceSystem(pos: { x: number; y: number; z?: number }) {
    placeOrigin = null;
    placeGhost = null;
    dispatch('addsystemat', pos);
  }

  // WS7 — the SIMPLE depth path, for GMs who think in 2D: type how far above or below the map plane the
  // system sits, in the campaign's own distance unit. (Spherical RA/Dec entry is the power tool; this is
  // the plain door.) Stored in MAP units, so it converts through the scale like every other coordinate.
  function handleContextMenuDepth() {
    if (contextMenuSystemId) {
      const sys = starmap.systems.find((s) => s.id === contextMenuSystemId);
      if (sys) {
        const perUnit = activeScale.pixelsPerUnit > 0 ? activeScale.pixelsPerUnit : 1;
        const unit = starmap.distanceUnit || 'ly';
        const currentUnits = (sys.position.z ?? 0) / perUnit;
        const reply = prompt(
          `Depth of ${sys.name} in ${unit}\n\nPositive is above the map plane, negative below. 0 puts it back on the plane.`,
          String(Number(currentUnits.toFixed(3)))
        );
        if (reply !== null) {
          const v = Number(reply.trim());
          if (Number.isFinite(v)) {
            const nextSystems = starmap.systems.map((s) =>
              s.id === contextMenuSystemId ? { ...s, position: { ...s.position, z: v * perUnit } } : s
            );
            // Depth counts toward distance unless the campaign opted out, so any route touching this
            // system needs its stored distance recomputed — force it even on a diagrammatic map.
            dispatch('updatestarmap', { ...starmap, systems: nextSystems, routes: recomputeScaledRoutes(nextSystems, true) });
          }
        }
      }
    }
    closeContextMenu();
  }

  // Rename the SYSTEM (the map node) independently of its central star — the star name is only the
  // default, so a system can carry its own name (e.g. "Hyperspace bypass hub" vs the star "Sol").
  function handleContextMenuRename() {
    if (contextMenuSystemId) {
      const sys = starmap.systems.find((s) => s.id === contextMenuSystemId);
      const next = prompt('Rename system', sys?.name ?? '');
      if (next !== null && next.trim() && next.trim() !== sys?.name) {
        dispatch('renamesystem', { systemId: contextMenuSystemId, name: next.trim() });
      }
    }
    closeContextMenu();
  }

  function handleContextMenuLink() {
    if (contextMenuSystemId) {
      dispatch('selectsystemforlink', contextMenuSystemId);
    }
    closeContextMenu();
  }

  function handleContextMenuDelete() {
    if (contextMenuSystemId) {
      dispatch('deletesystem', contextMenuSystemId);
    }
    closeContextMenu();
  }

  function handleDeleteSubsector() {
      if (!detectedSubsector || !starmap.travellerMetadata) return;
      
      const subId = detectedSubsector.id;
      const subName = detectedSubsector.name;
      
      if (confirm(`Delete entire subsector ${subName} and all its systems?`)) {
          const newSystems = starmap.systems.filter(s => s.subsectorId !== subId);
          const newImported = starmap.travellerMetadata.importedSubsectors.filter(s => s.id !== subId);
          
          const newStarmap = {
              ...starmap,
              systems: newSystems,
              travellerMetadata: {
                  ...starmap.travellerMetadata,
                  importedSubsectors: newImported
              }
          };
          
          dispatch('updatestarmap', newStarmap);
      }
      closeContextMenu();
  }

  function handleContextMenuTravellerImport() {
      // Snap to nearest hex center if in hex mode
      if (effectiveGridType === 'hex' || effectiveGridType === 'traveller-hex') {
          // Re-calculate closest center using the logic from handleMapContextMenu
          // We can't reuse local vars from that function, so we must recalc or store the snapped coord.
          // contextMenuClickCoords is currently set to the snapped center in handleMapContextMenu!
          // Let's verify...
          // Yes: "contextMenuClickCoords = { x: clickX, y: clickY };" where clickX/Y are updated to closestCenter.
          // So it is already snapped?
          // Let's double check handleMapContextMenu logic.
          
          /* 
             In handleMapContextMenu:
             ...
             clickX = closestCenter.x;
             clickY = closestCenter.y;
             ...
             contextMenuClickCoords = { x: clickX, y: clickY };
          */
          
          // It seems it IS already snapped. 
          // However, the user mentioned "snapping to the centre and stra alignment".
          // If I already snapped it, maybe the issue is that "Import Here" usually implies "This Hex becomes 0101".
          // If the click was on 0202, we want 0101 to be at (0202_x - delta_x, 0202_y - delta_y).
          // But the importer currently takes (originX, originY) and places 0101 AT that location.
          // So if I click 0202, the importer puts "Cronor 0101" at 0202. 
          // That is correct behavior for "Import Here" (Start the subsector at this hex).
          
          travellerImportCoords = { ...contextMenuClickCoords };
      } else {
          travellerImportCoords = { ...contextMenuClickCoords };
      }
      
      showImportModal = true;
      closeContextMenu();
  }

  function handleTravellerImport(event: CustomEvent<any>) {
      const { sector, subsectorCode, rawData } = event.detail;
      const importer = new TravellerImporter();
      
      const { systems, metadata } = importer.processSubsectorData(
          sector,
          subsectorCode,
          rawData,
          travellerImportCoords.x,
          travellerImportCoords.y,
          gridSize,
          rulePack
      );

      const newMetadata = starmap.travellerMetadata || { importedSubsectors: [] };
      if (metadata) {
          newMetadata.importedSubsectors.push(metadata);
      }

      const newStarmap = {
          ...starmap,
          systems: [...starmap.systems, ...systems],
          travellerMetadata: newMetadata
      };

      dispatch('updatestarmap', newStarmap);
      showImportModal = false;
  }

  function handleContextMenuAddTravellerSystem() {
      // Use the same coordinates logic as Import
      travellerImportCoords = { ...contextMenuClickCoords };
      showAddTravellerModal = true;
      closeContextMenu();
  }

  function handleAddTravellerSystem(event: CustomEvent<any>) {
      const data = event.detail;
      const importer = new TravellerImporter();
      
      // Generate System using the new public method
      const system = importer.generateTravellerSystem(data, rulePack);
      
      const newSystemNode = {
          id: system.id,
          name: data.name,
          position: { x: travellerImportCoords.x, y: travellerImportCoords.y },
          system: system,
          subsectorId: 'manual-add' // Optional marker
      };

      const newStarmap = {
          ...starmap,
          systems: [...starmap.systems, newSystemNode]
      };

      dispatch('updatestarmap', newStarmap);
      showAddTravellerModal = false;
  }
</script>

<div class="starmap-container" class:invert-display={invertDisplay} style="touch-action: none;" bind:this={starmapContainer}>
  <AppShell bind:mode bind:railOpen sheetTitle={starmap.name}>
    <svelte:fragment slot="rail">
      <RailNav
        activeView="starmap"
        rulerOn={measureMode}
        rulerAvailable={isScaled}
        {routesAttention}
        on:ruler={() => { railOpen = false; toggleMeasure(); }}
        on:starmap={() => { railOpen = false; }}
        on:new={() => dispatch('new')}
        on:open={() => dispatch('upload')}
        on:save={() => dispatch('download')}
        on:settings={() => dispatch('settings')}
        on:llmsettings={() => dispatch('llmsettings')}
        on:about={() => dispatch('about')}
        on:help={() => dispatch('help')}
        on:navigate={() => (railOpen = false)}
        on:allbodies={() => { railOpen = false; dispatch('allbodies'); }}
        on:findtag={() => { railOpen = false; dispatch('findtag'); }}
        on:allships={() => { railOpen = false; dispatch('allships'); }}
        on:routes={() => { railOpen = false; dispatch('routes'); }}
        on:playerviews={() => { railOpen = false; dispatch('playerviews'); }}
        on:report={() => { railOpen = false; dispatch('report'); }}
        on:clear={() => { railOpen = false; dispatch('clear'); }}
      />
    </svelte:fragment>
    <svelte:fragment slot="canvas">
  <div class="starmap-canvas">
    {#if ensuredTemporal}
      <div class="time-display-overlay"><TimeDisplay temporal={ensuredTemporal} /></div>
    {/if}
    <BodyPicker
      floating
      nodes={pickerNodes}
      focusedId={null}
      emptyLabel="Starmap"
      placeholder="Search systems & ships…"
      top={mode === 'phone' ? 64 : 56}
      categorize={systemPickerCategorize}
      colorOf={systemPickerColor}
      contextOf={systemPickerContext}
      summaryText={starmapSummary}
      roleOf={(n) => n?.kind === 'construct' ? 'construct' : 'system'}
      filterItems={() => true}
      sections={true}
      on:select={handlePickSystem}
    />
    <!-- Desktop: a draggable floating info panel. Phone uses the bottom sheet instead. -->
    {#if mode !== 'phone'}
      <StarmapInfoPanel {starmap} on:update={(e) => dispatch('updatestarmap', e.detail)} />
    {/if}
    <div class="ov-topright">
      {#if mode === 'phone'}<FullscreenButton />{/if}
      <button class="ov-reset" title="Reset view" aria-label="Reset view" on:click={resetView}>⟲{#if !$railCollapsed} Reset View{/if}</button>
    </div>
    <svg
      bind:this={svgElement}
      class="starmap"
      class:with-background={$starmapUiStore.showBackgroundImage && !invertDisplay}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 800 600"
      use:gestures={starmapGestures}
      role="button"
      tabindex="0"
      style="touch-action: none;"
    >
      <g bind:this={groupElement} transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
      <Grid
        gridType={displayGridType}
        {gridSize} 
        {panX} 
        {panY} 
        {zoom} 
        viewWidth={800} 
        viewHeight={600} 
        originX={0} 
        originY={0} 
        travellerMetadata={starmap.travellerMetadata}
      />
      {#each starmap.routes as route}
        {@const sourceSystem = starmap.systems.find(s => s.id === route.sourceSystemId)}
        {@const targetSystem = starmap.systems.find(s => s.id === route.targetSystemId)}
        {#if sourceSystem && targetSystem}
          {@const strokeWidth = 2}
          {@const midX = (sourceSystem.position.x + targetSystem.position.x) / 2}
          {@const midY = (sourceSystem.position.y + targetSystem.position.y) / 2}
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route-clickable-area"
            on:pointerdown={handleRoutePointerDown}
            on:contextmenu={(e) => handleRouteContextMenu(e, route)}
          />
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route"
            class:jump-route={route.lineStyle === 'dashed'}
            style="stroke-width: {strokeWidth}px;"
          />
          <!-- A8: constant SCREEN size under zoom, like the system names (A4). Both the font and the
               offset from the line divide by the zoom, cancelling the one factor inherited from the
               world transform. -->
          <text
            x={midX}
            y={midY - 5 * labelK}
            class="route-label"
            style="font-size:{10 * labelK}px; stroke-width:{2 * labelK}px"
            on:pointerdown={handleRoutePointerDown}
            on:contextmenu={(e) => handleRouteContextMenu(e, route)}
          >
            {starmap.unitIsPrefix ? starmap.distanceUnit : ''}{formatRouteDistance(route.distance)}{!starmap.unitIsPrefix ? ` ${starmap.distanceUnit}` : ''}
          </text>
          {#if route.name}
            <!-- Name runs along the line: rotated about the midpoint, flipped to stay readable. -->
            {@const rawAngle = Math.atan2(targetSystem.position.y - sourceSystem.position.y, targetSystem.position.x - sourceSystem.position.x) * 180 / Math.PI}
            {@const nameAngle = rawAngle > 90 ? rawAngle - 180 : rawAngle < -90 ? rawAngle + 180 : rawAngle}
            <!-- The rotation is about the midpoint, so scaling the offset keeps the name the same
                 distance off the line at every zoom; the transform itself needs no change. -->
            <text
              x={midX}
              y={midY + 10 * labelK}
              class="route-name"
              style="font-size:{7 * labelK}px; stroke-width:{1.5 * labelK}px"
              transform={`rotate(${nameAngle}, ${midX}, ${midY})`}
              on:pointerdown={handleRoutePointerDown}
              on:contextmenu={(e) => handleRouteContextMenu(e, route)}
            >
              {route.name}
            </text>
          {/if}
        {/if}
      {/each}

      <!-- Active journeys, placed by deriving from the log at the current clock: a moving ship
           (trail behind, dashed path ahead) while in transit, or a static glyph when stranded. -->
      {#each activeJourneys as journey (journey.id)}
        {@const p = constructDisplayPlacement(starmap, journey.shipId, journeyNowSec)}
        {@const ship = journeyShip(journey)}
        {@const fill = ship?.icon_color || '#ffd23f'}
        {#if p.kind === 'transit'}
          {@const from = (journey.fromX != null && journey.fromY != null) ? { position: { x: journey.fromX, y: journey.fromY }, name: journey.fromLabel || 'Deep space' } : systemById(journey.fromSystemId)}
          {@const to = (journey.toX != null && journey.toY != null) ? { position: { x: journey.toX, y: journey.toY }, name: journey.toLabel || 'Deep space' } : systemById(journey.toSystemId)}
          {#if from && to}
            <line class="journey-trail" x1={from.position.x} y1={from.position.y} x2={p.x} y2={p.y} />
            <line class="journey-ahead" x1={p.x} y1={p.y} x2={to.position.x} y2={to.position.y} />
            {#if journey.cannotStop}
              <!-- Can't brake: the powered leg (yellow) reaches the destination, then it drifts on (red),
                   shown from departure so you can see the overshoot — and the slingshot — coming. The
                   drift heading is the incoming direction turned by the star's flyby deflection. -->
              {@const turn = flybyTurn(starmap, journey, from.position, to.position)}
              {@const ddx0 = to.position.x - from.position.x}
              {@const ddy0 = to.position.y - from.position.y}
              {@const ddx = turn ? ddx0 * Math.cos(turn) - ddy0 * Math.sin(turn) : ddx0}
              {@const ddy = turn ? ddx0 * Math.sin(turn) + ddy0 * Math.cos(turn) : ddy0}
              {@const dmag = Math.hypot(ddx, ddy) || 1}
              <line class="journey-drift" x1={to.position.x} y1={to.position.y} x2={to.position.x + (ddx / dmag) * 4000} y2={to.position.y + (ddy / dmag) * 4000} />
            {/if}
            <g class="journey-ship" role="button" tabindex="0" transform="translate({p.x}, {p.y})"
               on:pointerdown|stopPropagation={() => requestCancelJourney(journey, p.x, p.y)}
               on:keydown={(e) => { if (e.key === 'Enter') requestCancelJourney(journey); }}>
              <title>{journey.shipName} → {journey.toBodyName || to.name} ({Math.round(p.frac * 100)}%) — click for options</title>
              {#if ship?.icon_type === 'circle'}<circle r="5" {fill} stroke={EDGE_TRANSIT} stroke-width="1.6" />
              {:else}<path d={iconPath(ship?.icon_type)} {fill} stroke={EDGE_TRANSIT} stroke-width="1.6" />{/if}
              <text class="journey-label" x="8" y="3">{journey.shipName}</text>
              {#if ship?.object_playerhidden}<g class="hidden-eye" transform="translate(7,-7) scale(0.5)" pointer-events="none"><title>Hidden from players — not shown in the field guide</title><path d="M-5 0 C -3 -3.2, 3 -3.2, 5 0 C 3 3.2, -3 3.2, -5 0 Z" fill="none" stroke="#ff6b6b" stroke-width="1.4" /><circle cx="0" cy="0" r="1.5" fill="#ff6b6b" /><line x1="-6" y1="4.5" x2="6" y2="-4.5" stroke="#ff6b6b" stroke-width="1.6" /></g>{/if}
            </g>
          {/if}
        {:else if p.kind === 'adrift'}
          <g class="journey-ship adrift" role="button" tabindex="0" transform="translate({p.x}, {p.y})"
             on:pointerdown|stopPropagation={() => requestCancelJourney(journey, p.x, p.y)}
             on:keydown={(e) => { if (e.key === 'Enter') requestCancelJourney(journey); }}>
            <title>{journey.shipName} — {(p.vx || p.vy) ? 'coasting (out of fuel to stop)' : 'stranded'} in interstellar space. Click for options.</title>
            {#if p.vx || p.vy}
              {@const mag = Math.hypot(p.vx, p.vy) || 1}
              <!-- Project the onward heading a long way so a fly-by visibly tears off across (and off) the
                   map; the SVG clips it at the edge. -->
              <line class="journey-drift" x1="0" y1="0" x2={(p.vx / mag) * 4000} y2={(p.vy / mag) * 4000} />
            {/if}
            {#if ship?.icon_type === 'circle'}<circle r="5.5" {fill} stroke={EDGE_STRANDED} stroke-width="2.2" />
            {:else}<path d={iconPath(ship?.icon_type)} {fill} stroke={EDGE_STRANDED} stroke-width="2.2" />{/if}
            <text class="journey-label" x="8" y="3">{journey.shipName} (adrift)</text>
            {#if ship?.object_playerhidden}<g class="hidden-eye" transform="translate(7,-7) scale(0.5)" pointer-events="none"><title>Hidden from players — not shown in the field guide</title><path d="M-5 0 C -3 -3.2, 3 -3.2, 5 0 C 3 3.2, -3 3.2, -5 0 Z" fill="none" stroke="#ff6b6b" stroke-width="1.4" /><circle cx="0" cy="0" r="1.5" fill="#ff6b6b" /><line x1="-6" y1="4.5" x2="6" y2="-4.5" stroke="#ff6b6b" stroke-width="1.6" /></g>{/if}
          </g>
        {:else if p.kind === 'system' && p.systemId === journey.toSystemId}
          <!-- Arrived: parked marker at the destination (until reconcile moves the node into it). -->
          {@const to = systemById(journey.toSystemId)}
          {#if to}
            <g class="journey-ship arrived" role="button" tabindex="0" transform="translate({to.position.x}, {to.position.y})"
               on:pointerdown|stopPropagation={() => requestCancelJourney(journey, to.position.x, to.position.y)}
               on:keydown={(e) => { if (e.key === 'Enter') requestCancelJourney(journey); }}>
              <title>{journey.shipName} — arrived at {to.name}. Click for options.</title>
              {#if ship?.icon_type === 'circle'}<circle r="5" {fill} stroke={EDGE_ARRIVED} stroke-width="1.8" />
              {:else}<path d={iconPath(ship?.icon_type)} {fill} stroke={EDGE_ARRIVED} stroke-width="1.8" />{/if}
              {#if ship?.object_playerhidden}<g class="hidden-eye" transform="translate(7,-7) scale(0.5)" pointer-events="none"><title>Hidden from players — not shown in the field guide</title><path d="M-5 0 C -3 -3.2, 3 -3.2, 5 0 C 3 3.2, -3 3.2, -5 0 Z" fill="none" stroke="#ff6b6b" stroke-width="1.4" /><circle cx="0" cy="0" r="1.5" fill="#ff6b6b" /><line x1="-6" y1="4.5" x2="6" y2="-4.5" stroke="#ff6b6b" stroke-width="1.6" /></g>{/if}
            </g>
          {/if}
        {/if}
      {/each}

          {#each starmap.systems as systemNode}
        {@const hl = systemMarkers(systemNode, activeHighlights, $tagCategories)}
        {#if hl.shown.length}
          <g class="hl-markers" transform="translate({systemNode.position.x + 8 * labelK}, {systemNode.position.y - 10 * labelK}) scale({labelK})" pointer-events="none" style="font-size:{markerPill.fontPx}px; font-family:{markerPill.fontFamily}">
            {#each hl.shown as m, i (m.key)}
              {#if m.style === 'ring' || m.style === 'both'}
                <circle cx={-8} cy={10} r={9 + i * 2.5} fill="none" stroke={m.color} stroke-width="1.4" />
              {/if}
              {#if m.style !== 'ring'}
                {@const p = tagPillSvg(tagPillText(m), 0, i * markerPill.rowStep, markerPill)}
                <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} fill={m.color} />
                <text x={p.textX} y={p.textY} class="hl-text" fill={m.textColor}>{tagPillText(m)}</text>
              {/if}
            {/each}
            {#if hl.overflow}
              {@const p = tagPillSvg(`+${hl.overflow}`, 0, hl.shown.length * markerPill.rowStep, markerPill)}
              <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} fill={TAG_PILL_OVERFLOW_BG} />
              <text x={p.textX} y={p.textY} class="hl-text" fill={TAG_PILL_OVERFLOW_FG}>+{hl.overflow}</text>
            {/if}
          </g>
        {/if}
        {@const visualNodes = getVisualNodes(systemNode.system)}
        <g
          role="button"
          tabindex="0"
          class:hl-dim={highlightsActive && !systemMatches(systemNode, activeHighlights, $tagCategories)}
          on:pointerdown={(e) => handleSystemPointerDown(e, systemNode.id)}
          on:click={(e) => handleStarClick(e, systemNode.id)}
          on:dblclick={() => handleStarDblClick(systemNode.id)}
          on:contextmenu={(e) => handleStarContextMenu(e, systemNode.id)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStarClick(e, systemNode.id); }}
        >
          {#if isSystemHidden(systemNode)}
            <!-- Crossed-eye reminder: this system's main star is player-hidden, so it won't appear
                 in the players' field guide. -->
            <g class="hidden-eye" transform="translate({systemNode.position.x + 6}, {systemNode.position.y - 6}) scale(0.7)" pointer-events="none">
              <title>Hidden from players (main star hidden) — not shown in the field guide</title>
              <path d="M-5 0 C -3 -3.2, 3 -3.2, 5 0 C 3 3.2, -3 3.2, -5 0 Z" fill="none" stroke="#ff6b6b" stroke-width="1" />
              <circle cx="0" cy="0" r="1.5" fill="#ff6b6b" />
              <line x1="-6" y1="4.5" x2="6" y2="-4.5" stroke="#ff6b6b" stroke-width="1.2" />
            </g>
          {/if}
          {#if visualNodes.length === 0}
              <!-- Fallback for empty/invalid system -->
              <circle cx={systemNode.position.x} cy={systemNode.position.y} r={3} fill="#555" />
          {:else if visualNodes.length === 1}
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
          {:else if visualNodes.length === 2}
              <circle
                cx={systemNode.position.x - 5}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <circle
                cx={systemNode.position.x + 5}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
          {:else if visualNodes.length === 3}
              <!-- 3 Stars: Pyramid layout (Primary Top, others below) -->
              <!-- Primary (Top Center) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y - 6}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <!-- Second (Bottom Left) -->
              <circle
                cx={systemNode.position.x - 6}
                cy={systemNode.position.y + 5}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
              <!-- Third (Bottom Right) -->
              <circle
                cx={systemNode.position.x + 6}
                cy={systemNode.position.y + 5}
                r={5}
                style="fill: {getStarColor(visualNodes[2])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[2]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[2]) === 'BH'}
              />
          {:else}
              <!-- 4+ Stars: Diamond Layout -->
              <!-- Primary (Top) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y - 6}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <!-- Second (Bottom) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y + 6}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
              <!-- Third (Left) -->
              <circle
                cx={systemNode.position.x - 7}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[2])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[2]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[2]) === 'BH'}
              />
              <!-- Fourth (Right) -->
              <circle
                cx={systemNode.position.x + 7}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[3])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[3]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[3]) === 'BH'}
              />
              {#if visualNodes.length > 4}
                  <text
                    x={systemNode.position.x}
                    y={systemNode.position.y + 15}
                    class="plus-indicator"
                    text-anchor="middle"
                  >+</text>
              {/if}
          {/if}
        </g>
        <text
          x={systemNode.position.x + 15 * labelK}
          y={systemNode.position.y + 5 * labelK}
          class="star-label"
          style="font-size:{12 * labelK}px; stroke-width:{2 * labelK}px"
        >
          {systemNode.name}
        </text>
        <!-- WS7 DEPTH CUE: the GM map is 2D and cannot show height, so a system that sits off the plane
             says so in words. Without this, editing depth here is editing blind — you would only see the
             result by switching to the 3D view. Signed, in the campaign's own unit.
             A12: hidden when the campaign has opted out of counting depth — an annotation of a number
             that no longer affects any distance is noise. Gated on `zCounts`, the one predicate for
             that flag, so this can never disagree with what the measure tool is actually doing. -->
        {#if zCounts(starmap) && (systemNode.position.z ?? 0) !== 0 && activeScale.pixelsPerUnit > 0}
          {@const dz = (systemNode.position.z ?? 0) / activeScale.pixelsPerUnit}
          <text
            x={systemNode.position.x + 15 * labelK}
            y={systemNode.position.y + 16 * labelK}
            class="depth-label"
            style="font-size:{9 * labelK}px"
          >{dz > 0 ? '+' : ''}{Math.abs(dz) < 10 ? dz.toFixed(1) : Math.round(dz)} {activeScale.unit}</text>
        {/if}
      {/each}

      <!-- Real-sky import footprint: the live ring showing where an imported region will land and
           which existing systems it will surround, updating as the dialogue's radius slides. -->
      {#if showRealSkyModal && realSkyPreviewR > 0}
        <circle class="realsky-ring" cx={realSkyAnchor.x} cy={realSkyAnchor.y} r={realSkyPreviewR} />
        <circle class="realsky-anchor" cx={realSkyAnchor.x} cy={realSkyAnchor.y} r="3" />
      {/if}

      <!-- WS7b GHOST: where the system being placed would land. A tether back to the origin so the bearing
           is unmistakable, a dashed ring for the system itself, and — when it has depth — the same signed
           label the real systems carry, since a flat map cannot show height any other way. -->
      {#if placeOrigin && placeGhost}
        {@const gz = (placeGhost.z ?? 0) / (activeScale.pixelsPerUnit > 0 ? activeScale.pixelsPerUnit : 1)}
        <line class="ghost-tether" x1={placeOrigin.position.x} y1={placeOrigin.position.y} x2={placeGhost.x} y2={placeGhost.y} />
        <circle class="ghost-ring" cx={placeGhost.x} cy={placeGhost.y} r="9" />
        <circle class="ghost-core" cx={placeGhost.x} cy={placeGhost.y} r="3" />
        <text class="ghost-label" x={placeGhost.x + 14 * labelK} y={placeGhost.y + 5 * labelK} style="font-size:{10 * labelK}px">New system</text>
        {#if zCounts(starmap) && Math.abs(gz) > 1e-6 && activeScale.pixelsPerUnit > 0}
          <text class="depth-label" x={placeGhost.x + 14 * labelK} y={placeGhost.y + 16 * labelK} style="font-size:{9 * labelK}px"
          >{gz > 0 ? '+' : ''}{Math.abs(gz) < 10 ? gz.toFixed(1) : Math.round(gz)} {activeScale.unit}</text>
        {/if}
      {/if}

      <!-- Measure tool overlay: line + distance between the two picked targets (stars or ships). -->
      {#if measureMode && mA}
        <circle class="measure-pt" cx={mA.x} cy={mA.y} r="4" />
        {#if mB}
          <line class="measure-line" x1={mA.x} y1={mA.y} x2={mB.x} y2={mB.y} />
          <circle class="measure-pt" cx={mB.x} cy={mB.y} r="4" />
          <text
            class="measure-label"
            x={(mA.x + mB.x) / 2}
            y={(mA.y + mB.y) / 2 - 6 * labelK}
            text-anchor="middle"
            style="font-size:{11 * labelK}px; stroke-width:{3 * labelK}px"
          >{measureDist} {activeScale.unit}</text>
        {/if}
      {/if}
      </g>
    </svg>
    {#if highlightKey.length}
      <!-- The key. Screen-fixed like the scale bar, not part of the panned/zoomed scene. -->
      <div class="hl-key">
        <span class="hl-key-head">Highlighted</span>
        {#each highlightKey as k (k.label)}
          <span class="hl-key-row"><span class="hl-key-dot" style="background:{k.color}"></span>{k.label}</span>
        {/each}
      </div>
    {/if}
    <StarmapScaleBar
      {zoom}
      {svgScale}
      calibration={{ pixelsPerUnit: activeScale.pixelsPerUnit }}
      distanceUnit={starmap.distanceUnit}
      unitIsPrefix={starmap.unitIsPrefix}
      isScaled={scaleBarVisible}
    />
    {#if ensuredTemporal}
      <div class="time-overlay" class:phone={mode === 'phone'}>
        <TimeControls
          compact={mode === 'phone'}
          temporal={ensuredTemporal}
          on:updatetemporal={handleTemporalUpdate}
          on:resetdisplay={handleResetDisplay}
          on:setactual={handleSetActual}
        />
      </div>
    {/if}
  </div>
    </svelte:fragment>
  </AppShell>

  <!-- Phone only: starmap Description + GM Notes in a bottom sheet (the draggable floating
       panel is desktop-only). Rendered directly (not via the AppShell detail slot) so the
       desktop right panel stays collapsed. -->
  {#if mode === 'phone'}
    <BottomSheet title={starmap.name}>
      <div class="starmap-detail-mobile">
        <label class="sdm-field">
          <span class="sdm-label">Description</span>
          <textarea bind:value={starmap.description} on:change={() => dispatch('updatestarmap', starmap)} placeholder="Describe this starmap…" rows="4"></textarea>
        </label>
        <label class="sdm-field">
          <span class="sdm-label gm">GM Notes</span>
          <textarea bind:value={starmap.gmNotes} on:change={() => dispatch('updatestarmap', starmap)} placeholder="Secret GM-only notes…" rows="5"></textarea>
        </label>
      </div>
    </BottomSheet>
  {/if}

  {#if showContextMenu}
    <div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;">
      <ul>
        {#if contextMenuRoute}
            <li on:click={handleContextMenuEditRoute}>Edit Link…</li>
        {:else if contextMenuSystemId}
            <li on:click={handleContextMenuRename}>Rename System…</li>
            <li on:click={handleContextMenuDepth}>Set Depth…</li>
            <li on:click={handleContextMenuAddNear}>Add System near here…</li>
            <li on:click={handleContextMenuLink}>
              {#if selectedSystemForLink === null}
                Start Link
              {:else if selectedSystemForLink === contextMenuSystemId}
                Cancel Link
              {:else}
                Complete Link
              {/if}
            </li>
            <li on:click={handleContextMenuDelete}>Delete System</li>
        {:else}
                    <li on:click={handleContextMenuAddSystem}>Add System Here</li>
                    <li on:click={handleContextMenuRealSky}>Import Real Stars Here…</li>
                    {#if $starmapUiStore.travellerMode}
                        <li on:click={handleContextMenuAddTravellerSystem}>Add Traveller UWP Here</li>
                        <li on:click={handleContextMenuTravellerImport}>Add Traveller Map SubSector Here</li>
                        {#if detectedSubsector}
                            <li on:click={handleDeleteSubsector} class="danger">
                                Delete {detectedSubsector.sectorName ? detectedSubsector.sectorName + ' ' : ''}Subsector {detectedSubsector.subsectorCode}{detectedSubsector.name !== 'Subsector ' + detectedSubsector.subsectorCode ? ' (' + detectedSubsector.name + ')' : ''}
                            </li>
                        {/if}
                    {/if}
                  {/if}
                </ul>
              </div>
          {/if}

  {#if placeOrigin}
    <SystemPlacementDialog
      originName={placeOrigin.name}
      originPos={placeOrigin.position}
      unit={activeScale.unit}
      pixelsPerUnit={activeScale.pixelsPerUnit}
      maxDistance={placeMaxDistance}
      side={placeSide}
      inset={placeInset}
      on:change={(e) => (placeGhost = e.detail)}
      on:place={(e) => handlePlaceSystem(e.detail)}
      on:cancel={() => { placeOrigin = null; placeGhost = null; }}
    />
  {/if}

  {#if showSaveModal}
      <SaveSystemModal on:save={handleSaveStarmap} on:close={() => showSaveModal = false} />
  {/if}
  
  {#if showImportModal}
      <ImportTravellerModal
          showModal={showImportModal}
          on:import={handleTravellerImport}
          on:close={() => showImportModal = false}
      />
  {/if}

  {#if showRealSkyModal}
      <RealSkyImportModal
          {rulePack}
          mode="append"
          anchorPx={realSkyAnchor}
          existingSystems={starmap.systems}
          pixelsPerUnit={activeScale.pixelsPerUnit > 0 ? activeScale.pixelsPerUnit : 43.30127018922193}
          on:previewRadius={(e) => (realSkyPreviewR = e.detail)}
          on:import={handleRealSkyAppend}
          on:close={() => { showRealSkyModal = false; realSkyPreviewR = 0; }}
      />
  {/if}

  {#if showAddTravellerModal}
      <AddTravellerSystemModal 
          showModal={showAddTravellerModal} 
          on:generate={handleAddTravellerSystem} 
          on:close={() => showAddTravellerModal = false} 
      />
  {/if}

  {#if showAlphaDisclaimer}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="alpha-disclaimer-overlay" on:click|stopPropagation>
      <div class="alpha-modal" on:click|stopPropagation>
        <h2>DANGER --- DANGER</h2>
        <h3>You are entering the Alpha Zone</h3>
        
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

<style>
  /* Alpha Disclaimer Styles */
  .alpha-disclaimer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 5000;
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
    color: var(--text);
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
    color: var(--text);
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

  .context-menu {
    position: absolute;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    z-index: 100;
    color: var(--text);
  }
  .context-menu ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .context-menu li {
    padding: 0.5em 1em;
    cursor: pointer;
  }
  .context-menu li:hover {
    background-color: var(--bg-control-hover);
  }

  .starmap-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .starmap-detail-mobile {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sdm-field { display: flex; flex-direction: column; gap: 4px; }
  .sdm-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint, #8a8f9a);
  }
  .sdm-label.gm { color: var(--accent, #ff5a1f); }
  .starmap-detail-mobile textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    color: var(--text, #e8e8e8);
    padding: 8px;
    font: inherit;
    font-size: 0.9rem;
  }
  .time-display-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 57;
  }
  .ov-topright {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 56;
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .ov-reset {
    height: 32px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 86%, transparent);
    color: var(--text, #e8e8e8);
    font-size: 0.9rem;
    cursor: pointer;
    opacity: 0.55;
    backdrop-filter: blur(6px);
    white-space: nowrap;
  }
  .ov-reset:hover { opacity: 1; background: var(--bg-control-hover, #232733); }
  .ov-reset.active { opacity: 1; border-color: var(--accent, #5b8def); color: var(--accent, #5b8def); }
  .measure-line { stroke: var(--accent, #5b8def); stroke-width: 1.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
  .measure-pt { fill: var(--accent, #5b8def); }
  .measure-label { fill: var(--accent, #5b8def); font-size: 11px; font-weight: 600; paint-order: stroke; stroke: #000; stroke-width: 3px; stroke-linejoin: round; }
  .time-overlay {
    position: absolute;
    bottom: 14px;
    left: 14px;
    z-index: 55;
    max-width: min(460px, calc(100% - 28px));
  }
  .time-overlay.phone {
    position: fixed;
    z-index: 1150;
    bottom: 98px;
    left: 84px; /* clear the bottom-left menu FAB */
    right: 8px;
    transform: none;
    width: auto;
  }
  .starmap-canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    /* Fill the AppShell canvas slot (desktop grid row / phone inset:0 wrapper),
       which aren't flex containers — so flex:1 alone gives no height and the SVG
       falls back to its 800x600 aspect ratio. height:100% makes it fill. */
    height: 100%;
  }

  .starmap-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.5rem 0;
    flex-shrink: 0; /* Prevent header from shrinking */
    margin-top: 10px;
    margin-bottom: 10px;
    gap: 10px;
  }

  .starmap-header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .starmap-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }


  .header-controls {
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  .header-controls label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.9em;
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
  }

  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-content {
    display: block;
    position: absolute;
    background-color: var(--bg-panel);
    min-width: 200px;
    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.5);
    z-index: 1000;
    right: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 5px 0;
  }

  .dropdown-content button {
    color: var(--text);
    padding: 10px 16px;
    text-decoration: none;
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }

  .dropdown-content button:hover {background-color: var(--bg-control);}
  .dropdown-content button.danger { color: var(--status-bad); }
  .dropdown-content button.danger:hover { background-color: #442222; }

  .grid-select {
      padding: 4px;
      background: var(--bg-panel);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 3px;
  }
  .grid-select.inline {
      width: auto;
  }

  .hamburger-button {
    font-size: 1.5em;
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
    padding: 0 10px;
  }

  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; }

  .starmap {
    width: 100%;
    height: 100%;
    border: 1px solid #ccc;
    background-color: #000; /* Default background */
    /* A drag is a PAN here, never a text selection. Without this the browser treats a
       left-drag across the map as selecting the system labels it passes over, and a
       cluster of names lights up highlighted (A49). Scoped to the svg deliberately —
       the description box outside it is prose a GM may want to select and copy.
       Same guard the map's own hex numbering already carries (Grid.svelte). */
    user-select: none;
    -webkit-user-select: none;
  }

  .starmap.with-background {
    /* 
      Image Credit: ESO/S. Brunier 
      https://www.eso.org/public/images/eso0932a/
    */
    background-image: url('/images/ui/MilkyWay.jpg');
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
  }

  .starmap-container.invert-display .starmap {
    background-color: #ffffff;
    border-color: #333;
  }

  .starmap-container.invert-display .star-label,
  .starmap-container.invert-display .plus-indicator,
  .starmap-container.invert-display .route-label {
    fill: #111;
    stroke: #fff;
  }

  .starmap-container.invert-display .route-name {
    fill: #004a66;
    stroke: #fff;
  }

  .starmap-container.invert-display .route {
    stroke: #004a66;
  }

  .star {
    cursor: pointer;
  }

  .star.selected {
    stroke: #00ff00;
    stroke-width: 2;
  }

  .star.bh-active {
    stroke: #ffaa00;
    stroke-width: 2px;
  }

  .star.bh-quiescent {
    stroke: #444444;
    stroke-width: 1px;
  }

  .star-label {
    fill: #fff;
    font-size: 12px;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 2px;
  }
  /* WS7 depth cue — quieter than the name, so it reads as an annotation not a second label. */
  .depth-label { font-size: 9px; fill: #8fb4e0; opacity: 0.85; pointer-events: none; }

  /* WS7b: the not-yet-real system. Dashed and warm so it reads as a proposal, never as map content. */
  .ghost-tether { stroke: #ff7a45; stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.6; pointer-events: none; }
  .ghost-ring { fill: none; stroke: #ff7a45; stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.9; pointer-events: none; }
  .realsky-ring { fill: rgba(120, 180, 255, 0.06); stroke: #7ab8ff; stroke-width: 1.5; stroke-dasharray: 6 4; opacity: 0.9; pointer-events: none; }
  .realsky-anchor { fill: #7ab8ff; opacity: 0.9; pointer-events: none; }
  .ghost-core { fill: #ff7a45; opacity: 0.9; pointer-events: none; }
  .ghost-label { font-size: 10px; fill: #ff9a6b; pointer-events: none; }

  .plus-indicator {
    fill: #fff;
    font-size: 14px;
    font-weight: bold;
    pointer-events: none;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 2px;
  }

  .route {
    stroke: #00ccff;
    stroke-width: 1;
  }

  .route.jump-route {
    stroke-dasharray: 4;
  }

  .route-clickable-area {
    stroke: transparent;
    stroke-width: 10px;
    cursor: pointer;
  }

  .route-label {
    fill: #FFFF00;
    font-size: 10px;
    text-anchor: middle;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 2px;
    cursor: pointer;
  }

  .route-name {
    fill: #8fd6ff;
    font-size: 7px;
    letter-spacing: 0.05em;
    text-anchor: middle;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 1.5px;
    cursor: pointer;
  }

  /* Active journeys: the travelled trail is a faint solid line; the path still to go is dashed. */
  /* Powered journey = deep yellow (the planner's #ffcc00); the unavoidable drift = danger red. Yellow vs
     red reads far more clearly than the old orange-vs-red. */
  .journey-trail { stroke: #ffcc00; stroke-width: 1.5; opacity: 0.5; }
  .journey-ahead { stroke: #ffcc00; stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.9; }
  .journey-drift { stroke: #d04545; stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.9; }
  .journey-ship { cursor: pointer; }
  /* The ship marker uses the construct's own icon (fill = its icon_color) with a state-coloured edge
     (black under way, red stranded, green arrived) applied inline. */
  .journey-ship path, .journey-ship circle { paint-order: stroke; }
  .journey-ship:hover path, .journey-ship:hover circle { filter: brightness(1.25); }
  .journey-label {
    fill: #ffd23f; font-size: 9px; paint-order: stroke; stroke: #000; stroke-width: 2px;
    pointer-events: none;
  }
  .journey-cancel-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center; z-index: 2100;
  }
  .journey-cancel {
    background: var(--bg-panel); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 1.2rem 1.4rem; width: 360px; max-width: 92vw;
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  }
  .journey-cancel h3 { margin: 0 0 0.5rem; }
  .journey-cancel p { margin: 0 0 1rem; font-size: 0.88rem; color: var(--text-muted); line-height: 1.5; }
  .jc-buttons { display: flex; justify-content: flex-end; gap: 0.6rem; flex-wrap: wrap; }
  .jc-buttons button { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; background: var(--bg-control); color: var(--text); font: inherit; }
  .jc-buttons button.danger { background: var(--status-bad, #e0484d); color: #fff; }
  .jc-buttons button.primary { background: var(--accent, #ff5a1f); color: var(--on-accent, #fff); }

  /* Size and family are set on the .hl-markers group from the shared pill metrics — never restated here. */
  .hl-text { dominant-baseline: middle; }
  .hl-markers { pointer-events: none; }

  /* A highlight filters by emphasis: unmatched systems fade, they never vanish. */
  .hl-dim { opacity: 0.22; transition: opacity 120ms ease; }

  .hl-key { position: absolute; top: 10px; right: 10px; z-index: 6; display: flex; flex-direction: column; gap: 3px;
            background: rgba(12,15,22,0.82); border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px;
            font-size: 0.68rem; color: var(--text); pointer-events: none; max-width: 190px; }
  .hl-key-head { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); }
  .hl-key-row { display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hl-key-dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
</style>
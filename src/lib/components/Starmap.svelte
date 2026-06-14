<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { gestures } from '$lib/input/gestures';
  import { getPlanetColor as getStarColor } from '$lib/rendering/colors';
  import AppShell from './AppShell.svelte';
  import RailNav from './RailNav.svelte';
  import BodyPicker from './BodyPicker.svelte';
  import FullscreenButton from './FullscreenButton.svelte';
  import type { Starmap, System, CelestialBody, RulePack, Barycenter } from '$lib/types';
  import { constructDisplayPlacement } from '$lib/transit/interstellar';
  import StarmapInfoPanel from './StarmapInfoPanel.svelte';
  import BottomSheet from './BottomSheet.svelte';
  import TimeDisplay from './TimeDisplay.svelte';
  import { railCollapsed } from '$lib/railStore';
  import Grid from './Grid.svelte';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import SaveSystemModal from './SaveSystemModal.svelte';
  import ImportTravellerModal from './ImportTravellerModal.svelte';
  import AddTravellerSystemModal from './AddTravellerSystemModal.svelte';
  import StarmapScaleBar from './StarmapScaleBar.svelte';
  import { TravellerImporter } from '$lib/traveller/importer';
  import { computePlayerSnapshot } from '$lib/system/utils';
  import { APP_VERSION, APP_DATE } from '$lib/constants';
  import { ensureTemporalState, setMasterToDisplay } from '$lib/temporal/defaults';
  import TimeControls from './TimeControls.svelte';

  export let starmap: Starmap;
  export let rulePack: RulePack; // We need this prop to show defaults!
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
  let detectedSubsector: any = null;
  let isStarContextMenu = false;

  // Header State
  let showDropdown = false;
  let showSaveModal = false;
  let showImportModal = false;
  let showAddTravellerModal = false;
  
  let travellerImportCoords = { x: 0, y: 0 };
  
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

  function getRouteDistance(sourceX: number, sourceY: number, targetX: number, targetY: number, pixelsPerUnit: number): number {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    if (pixelsPerUnit <= 0) return 0;
    return roundDistance(pixelDistance / pixelsPerUnit);
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
        distance: getRouteDistance(source.position.x, source.position.y, target.position.x, target.position.y, activeScale.pixelsPerUnit),
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
      return { ...systemNode, position: { x: snapped.x, y: snapped.y } };
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
  $: displayGridType = $starmapUiStore.travellerMode
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
  // SVG path for a construct's icon_type (circle is rendered as a <circle> separately).
  const iconPath = (type?: string): string => {
    switch (type) {
      case 'square': return 'M-4,-4 H4 V4 H-4 Z';
      case 'triangle': return 'M0,-5 L5,4.5 L-5,4.5 Z';
      case 'cross': return 'M-5,-1.6 H-1.6 V-5 H1.6 V-1.6 H5 V1.6 H1.6 V5 H-1.6 V1.6 H-5 Z';
      default: return 'M0,-5 L5,0 L0,5 L-5,0 Z';   // diamond (and fallback)
    }
  };
  // Edge colour by journey state: black under way, red stranded, green arrived.
  const EDGE_TRANSIT = '#111', EDGE_STRANDED = '#d04545', EDGE_ARRIVED = '#2f9e57';

  // Clicking a ship opens the starmap-level ship panel (+page owns it: full construct editor + the
  // in-flight controls). All journey resolution + construct edits are handled there against the store.
  function requestCancelJourney(j: any) { dispatch('openship', { journeyId: j.id }); }

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

      // Download
      const json = JSON.stringify(starmapToSave, null, 2);
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

  // --- BodyPicker (starmap-scoped: pick a system by name) ---
  const systemPickerCategorize = () => ['Systems'];
  function systemPickerColor(sysNode: any): string {
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
      dispatch('systemclick', e.detail);
  }

  function getBlackHoleType(body: CelestialBody): 'none' | 'BH' | 'BH_active' {
      if (body.classes.includes('star/BH_active') || body.classes.includes('BH_active')) return 'BH_active';
      if (body.classes.includes('star/BH') || body.classes.includes('BH')) return 'BH';
      return 'none';
  }

  function handleStarClick(event: MouseEvent, systemId: string) {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    if (event.button === 0) { // Left click
      if (linkingMode) {
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
  }

  function handleContextMenuAddSystem() {
    dispatch('addsystemat', contextMenuClickCoords);
    closeContextMenu();
  }

  function handleContextMenuZoom() {
    if (contextMenuSystemId) {
      dispatch('systemzoom', contextMenuSystemId);
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
        on:starmap={() => { railOpen = false; }}
        on:new={() => dispatch('new')}
        on:open={() => dispatch('upload')}
        on:save={() => dispatch('download')}
        on:settings={() => dispatch('settings')}
        on:llmsettings={() => dispatch('llmsettings')}
        on:about={() => dispatch('about')}
        on:navigate={() => (railOpen = false)}
        on:allbodies={() => { railOpen = false; dispatch('allbodies'); }}
        on:findtag={() => { railOpen = false; dispatch('findtag'); }}
        on:allships={() => { railOpen = false; dispatch('allships'); }}
        on:routes={() => { railOpen = false; dispatch('routes'); }}
        on:catalogue={() => { railOpen = false; dispatch('catalogue'); }}
        on:clear={() => { railOpen = false; dispatch('clear'); }}
      />
    </svelte:fragment>
    <svelte:fragment slot="canvas">
  <div class="starmap-canvas">
    {#if ensuredTemporal}
      <div class="time-display-overlay"><TimeDisplay temporal={ensuredTemporal} /></div>
    {/if}
    <BodyPicker
      nodes={starmap.systems}
      focusedId={null}
      emptyLabel="Starmap"
      placeholder="Search systems…"
      top={mode === 'phone' ? 64 : 56}
      categorize={systemPickerCategorize}
      colorOf={systemPickerColor}
      contextOf={systemPickerContext}
      summaryText={starmapSummary}
      roleOf={() => 'system'}
      filterItems={() => true}
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
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route-clickable-area"
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
          <text
            x={(sourceSystem.position.x + targetSystem.position.x) / 2}
            y={(sourceSystem.position.y + targetSystem.position.y) / 2 - 5}
            class="route-label"
            on:click={() => dispatch('editroute', route)}
          >
            {starmap.unitIsPrefix ? starmap.distanceUnit : ''}{formatRouteDistance(route.distance)}{!starmap.unitIsPrefix ? ` ${starmap.distanceUnit}` : ''}
          </text>
        {/if}
      {/each}

      <!-- Active journeys, placed by deriving from the log at the current clock: a moving ship
           (trail behind, dashed path ahead) while in transit, or a static glyph when stranded. -->
      {#each activeJourneys as journey (journey.id)}
        {@const p = constructDisplayPlacement(starmap, journey.shipId, journeyNowSec)}
        {@const ship = journeyShip(journey)}
        {@const fill = ship?.icon_color || '#ffd23f'}
        {#if p.kind === 'transit'}
          {@const from = systemById(journey.fromSystemId)}
          {@const to = systemById(journey.toSystemId)}
          {#if from && to}
            <line class="journey-trail" x1={from.position.x} y1={from.position.y} x2={p.x} y2={p.y} />
            <line class="journey-ahead" x1={p.x} y1={p.y} x2={to.position.x} y2={to.position.y} />
            <g class="journey-ship" role="button" tabindex="0" transform="translate({p.x}, {p.y})"
               on:click|stopPropagation={() => requestCancelJourney(journey)}
               on:keydown={(e) => { if (e.key === 'Enter') requestCancelJourney(journey); }}>
              <title>{journey.shipName} → {journey.toBodyName || to.name} ({Math.round(p.frac * 100)}%) — click for options</title>
              {#if ship?.icon_type === 'circle'}<circle r="5" {fill} stroke={EDGE_TRANSIT} stroke-width="1.6" />
              {:else}<path d={iconPath(ship?.icon_type)} {fill} stroke={EDGE_TRANSIT} stroke-width="1.6" />{/if}
              <text class="journey-label" x="8" y="3">{journey.shipName}</text>
            </g>
          {/if}
        {:else if p.kind === 'adrift'}
          <g class="journey-ship adrift" role="button" tabindex="0" transform="translate({p.x}, {p.y})"
             on:click|stopPropagation={() => requestCancelJourney(journey)}
             on:keydown={(e) => { if (e.key === 'Enter') requestCancelJourney(journey); }}>
            <title>{journey.shipName} — stranded in interstellar space. Click for options.</title>
            {#if ship?.icon_type === 'circle'}<circle r="5.5" {fill} stroke={EDGE_STRANDED} stroke-width="2.2" />
            {:else}<path d={iconPath(ship?.icon_type)} {fill} stroke={EDGE_STRANDED} stroke-width="2.2" />{/if}
            <text class="journey-label" x="8" y="3">{journey.shipName} (adrift)</text>
          </g>
        {:else if p.kind === 'system' && p.systemId === journey.toSystemId}
          <!-- Arrived: parked marker at the destination (until reconcile moves the node into it). -->
          {@const to = systemById(journey.toSystemId)}
          {#if to}
            <g class="journey-ship arrived" role="button" tabindex="0" transform="translate({to.position.x}, {to.position.y})"
               on:click|stopPropagation={() => requestCancelJourney(journey)}
               on:keydown={(e) => { if (e.key === 'Enter') requestCancelJourney(journey); }}>
              <title>{journey.shipName} — arrived at {to.name}. Click for options.</title>
              {#if ship?.icon_type === 'circle'}<circle r="5" {fill} stroke={EDGE_ARRIVED} stroke-width="1.8" />
              {:else}<path d={iconPath(ship?.icon_type)} {fill} stroke={EDGE_ARRIVED} stroke-width="1.8" />{/if}
            </g>
          {/if}
        {/if}
      {/each}

      {#each starmap.systems as systemNode}
        {@const visualNodes = getVisualNodes(systemNode.system)}
        <g
          role="button"
          tabindex="0"
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
          x={systemNode.position.x + 15}
          y={systemNode.position.y + 5}
          class="star-label"
        >
          {systemNode.name}
        </text>
      {/each}
      </g>
    </svg>
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
        {#if contextMenuSystemId}
            <li on:click={handleContextMenuZoom}>Zoom to System</li>
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
  }

  /* Active journeys: the travelled trail is a faint solid line; the path still to go is dashed. */
  .journey-trail { stroke: var(--accent, #ff5a1f); stroke-width: 1.5; opacity: 0.5; }
  .journey-ahead { stroke: var(--accent, #ff5a1f); stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.85; }
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
</style>

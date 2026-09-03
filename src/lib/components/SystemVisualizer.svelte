<script lang="ts">
  import { niceStepBelow, formatNice } from '$lib/map/niceInterval';
  import { traceConstructIcon, constructIconShape } from '$lib/constructs/constructIcon';
  import { tetherAltitudesKm } from '$lib/constructs/megaGeometry';
  import { megaTypeDef, instanceMegaParams } from '$lib/constructs/megaTypes';
  import type { System, CelestialBody, Barycenter, RulePack, SystemNode } from '$lib/types';
  import type { TransitPlan } from '$lib/transit/types';
  import { getJourneyBounds, coastPathUnderGravity, sampleJourneyKinematicsAtTime, isFlybyPlan } from '$lib/transit/scheduler';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { computeWorldPositions } from "$lib/physics/worldPositions";
  import { getVisibleNodeIds } from "$lib/system/visibleNodes";
  import { AU_KM, EARTH_MASS_KG } from '../constants';
  import { debrisDensityFrac } from '$lib/rendering/debris';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints, tadpoleRegion, isTriangularPoint, tadpoleOutline,
           hillFactor, coOrbitalScale, COLLINEAR_ENVELOPE_HILL } from "$lib/physics/lagrange";
  import type { LagrangePointId } from "$lib/types";
  import { get } from 'svelte/store';
  import { unitPrefs } from '$lib/unitPrefsStore';
  import { formatDistanceKm, distanceFlavour } from '$lib/units';
  import { panStore, zoomStore } from '$lib/viewport/stores';
  import type { PanState } from '$lib/viewport/stores';
  import { clampZoom, dampedZoomStep, autoFrameStep, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM, frameForLevel, availableFrameLevels, firstFrameLevel, nextFrameLevel, suppressAutoZoomNearPeriapsis } from '$lib/viewport/camera';
  import { gestures } from '$lib/input/gestures';
  import { calculateAllStellarZones, calculateRocheLimit } from '$lib/physics/zones';
  import { hillSpheresAu } from '$lib/physics/twoBodyCoast';
  import { regionOfInterest, inRegionOfInterest } from '$lib/system/regionOfInterest';
  import { scaleBoxCox } from '../physics/scaling';
  import { findContainingHost, orbitPathProjected } from '$lib/physics/orbits';
  import { getNodeColor, STAR_COLOR_MAP, tokenRgba } from '$lib/rendering/colors';
  import { trueColorMode } from '$lib/rendering/colorModeStore';
  import { getPlanetTexture } from '$lib/rendering/planetTexture';
  import { oblatePolarFactor } from '$lib/rendering/bodyShape';
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';

  export let system: System | null;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;
  export let showNames: boolean = false;
  export let showZones: boolean = false;
  export let showLPoints: boolean = false;
  export let showTravellerZones: boolean = false;
  export let showSensors: boolean = false;
  export let showVectors: boolean = false;
  // G5: orbit-line strength on the GM's own map, 0..1 (1 = the look it has always had). A LOCAL
  // preference, passed in by the host from `systemUiStore` - the player side has its own value on
  // the preset, and the two are deliberately not one store (A10/A3).
  export let orbitOpacity: number = 1;
  export let showHillSpheres: boolean = false;
  // WS3 — the shared overlay vocabulary. The 2D system view had no grid of any kind; it now offers the
  // same set as every other spatial view (lattices in AU, or polar rings about the primary).
  import { isHexFamily } from '$lib/map/mapOverlay';
  export let overlay: import('$lib/map/mapOverlay').MapOverlay = 'off';
  // Lattice cell in AU; 0 = the automatic 1/2/5 ladder below.
  export let gridScaleAu: number = 0;
  // Every lattice this codebase draws is available at system scale; the cell is measured in AU.
  $: effOverlay = overlay;
  export let toytownFactor: number = 0;
  export let fullScreen: boolean = false;
  // Canvas backdrop — overridable so the projector can switch to a chroma-key green.
  export let backgroundColor: string = '#08090d';
  export let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';
  export let forceOrbitView: boolean = false;
  export let transitPlan: TransitPlan | null = null;
  export let completedPlans: TransitPlan[] = [];
  export let alternativePlans: TransitPlan[] = [];
  export let transitPreviewPos: { x: number, y: number } | null = null;
  export let isExecuting: boolean = false;
  // Measuring tape (ported from the wireframe): when on, taps pick two bodies and we draw a dashed
  // line + the straight-line distance between them in AU. Distance uses the TRUE (uncompressed) AU
  // positions, so it's correct even in Toytown scale.
  export let rulerActive: boolean = false;

  let rulerA: { id: string; name: string } | null = null;
  let rulerB: { id: string; name: string } | null = null;
  // Clear the measurement whenever the tool is switched off.
  $: if (!rulerActive) { rulerA = null; rulerB = null; }
  $: rulerDistanceAU = (() => {
    if (!rulerA || !rulerB) return null;
    const a = worldPositions.get(rulerA.id);
    const b = worldPositions.get(rulerB.id);
    if (!a || !b) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  })();

  const dispatch = createEventDispatcher<{
    focus: string | null,
    levelchange: { id: string; level: number },
    showBodyContextMenu: { node: CelestialBody, x: number, y: number },
    backgroundContextMenu: { x: number, y: number, dominantBody: CelestialBody | Barycenter | null, screenX: number, screenY: number, lagrangeHit?: { secondaryId: string; secondaryName: string; point: LagrangePointId } | null, circumbinaryHit?: { baryId: string; baryName: string } | null }
  }>();

  // --- Configurable Visuals ---
  const CLICK_AREA = { base_px: 10, buffer_px: 5 };
  const AUTO_ZOOM_MIN_UPDATE_MS = 180;
  const VELOCITY_VECTOR_COLOR = 'rgba(0, 212, 255, 0.95)';
  const ACCEL_VECTOR_COLOR = 'rgba(255, 155, 47, 0.95)';

  // --- Canvas and Rendering State ---
  let canvas: HTMLCanvasElement;
  // MAP HIGHLIGHTS (phase D). The GM's own map badges whatever the live selection names, in the
  // tag's own colour, so what you are about to push to the players is what you are already looking at.
  //
  // The PLAYER window runs its own copy of this component in a separate document, so it has its own
  // (empty) liveOverrides store — the GM's selection reaches it over the broadcast instead and is
  // passed in. Prop wins when given; otherwise the local store, which is the GM's own map.
  // Either way the tags being matched are whatever this view was handed, and a player view is handed
  // the redacted snapshot — so a secret tag cannot badge here regardless of what is selected.
  import { markersFor, capMarkers, type HighlightMarker, type MapHighlights } from '$lib/tags/mapHighlights';
  // A marker IS the panel's tag chip, drawn small — see tags/tagPill.ts. Nothing here re-invents its
  // padding, radius or font; only the size at which the shared shape is drawn belongs to this view.
  import { tagPillMetrics, drawTagPill, tagPillText, TAG_PILL_OVERFLOW_BG, TAG_PILL_OVERFLOW_FG } from '$lib/tags/tagPill';
  const MARKER_PILL_FONT_PX = 9;
  import { liveOverrides } from '$lib/player/liveOverrides';
  import { tagCategories } from '$lib/tags/tagCategories';
  import { shipBurnAt } from '$lib/constructs/shipBurn';
  import { orbitCirclePath, transferEllipsePath } from '$lib/transit/orbitChange';
  export let highlights: MapHighlights | null = null;
  // The mute is part of the selection's meaning, not a separate render flag: muted means "none".
  $: activeHighlights = $liveOverrides.highlightsMuted ? [] : (highlights ?? $liveOverrides.mapHighlights);

  // Foreground overlay canvas: sits above the PlanetDisc HTML layer; constructs + labels draw here
  // so they're never hidden behind a big planet disc. Sized to match `canvas` each frame.
  let fgCanvas: HTMLCanvasElement;
  let fgCtx: CanvasRenderingContext2D | null = null;
  let animationFrameId: number;
  let worldPositions = new Map<string, { x: number, y: number }>();
  // The circumbinary rings drawn THIS frame, in world coords, so the right-click hit test uses the
  // same geometry the user can see (G43's rule for the L-zones, reused).
  let circumbinaryAreas: { baryId: string; baryName: string; cx: number; cy: number; rInner: number; rOuter: number }[] = [];
  let scaledWorldPositions = new Map<string, { x: number, y: number }>();
  let stellarZones = new Map<string, any>();
  let needsReset = false;

  // --- Camera State ---
  let panState: PanState;
  let zoom: number;
  panStore.subscribe(value => panState = value);
  zoomStore.subscribe(value => zoom = value);
  
  // This is the pan value used for the current frame's render, to avoid store updates every frame
  let renderPan: PanState = { x: 0, y: 0 };

  // Big bodies are rendered by REUSING The Guide's PlanetDisc as an SVG overlay (so the tag-driven viz
  // — polar ice, auroras, glow, banding, shape — is identical in both views). Perf safeguards: only
  // bodies large on screen become overlays (few at a time), capped in count, and each disc is rendered
  // at a fixed reference size and GPU-scaled via CSS transform (no per-frame filter re-rasterising).
  const DISC_OVERLAY_REF = 220;   // px the PlanetDisc SVG is rendered at, then transform-scaled
  const DISC_OVERLAY_MIN_R = 11;  // min on-screen body radius (px) to promote to an overlay
  const DISC_OVERLAY_CAP = 14;    // max simultaneous overlays (biggest first)
  let discOverlays: { id: string; body: CelestialBody; x: number; y: number; scale: number; lightAngle: number | null }[] = [];
  let lastAutoZoomTarget: number = 0;
  let lastAutoZoomUpdateMs = 0;

  // --- Interaction State ---
  let isPanning = false;
  let inertiaRaf: number | null = null;
  let lastFocusedId: string | null = null;
  let isAnimatingFocus = false;
  // When the user zooms manually we stop the camera from auto-zooming back to the focused object's "ideal
  // frame" (which otherwise fights the wheel during playback). Pan-follow continues, so the object stays
  // centred at the user's chosen zoom. Cleared by any deliberate re-frame (new selection, re-click-to-step,
  // Reset view).
  export let userZoomOverride = false; // bindable: SystemView treats a zoom-driving user as MANUAL for camera broadcast
  let beltLabelClickAreas = new Map<string, { x1: number, y1: number, x2: number, y2: number }>();
  let x0_distance = 0.01; // Default pivot for distance scaling
  // Cache of coasting ships' forecast polylines, keyed by ship+clock so the conic isn't re-sampled per frame.
  // (The old settle-timer that upgraded a moon-free integration to a moon-inclusive one is gone: the forecast
  // now samples the same deterministic patched conic the ship actually follows — one fidelity, always.)
  const coastPathCache = new Map<string, { key: string; pts: { x: number; y: number }[] }>();

  let lastSystemId: string | null = null;
  let lastFramedPlanId: string | null = null;
  let lastPreviewSample: { tMs: number; pos: { x: number; y: number }; vel: { x: number; y: number } | null } | null = null;

  // Force re-render when system data changes deep down
  $: if (system) {
      // This dependency ensures that if any part of the system object 
      // is modified (even deep properties), Svelte acknowledges it.
      system = system; 
  }

  // --- Reactive Calculations ---
  $: if (system && system.id !== lastSystemId) {
    needsReset = true;
    lastSystemId = system.id;
  }
  $: if (forceOrbitView !== undefined) {
      if (focusedBodyId) handleFocusChange(focusedBodyId);
  }
  $: if (transitPlan && transitPlan.id !== lastFramedPlanId) {
      fitToPlan(transitPlan);
      lastFramedPlanId = transitPlan.id;
  }
  $: if (system && rulePack) {
    calculateAndStoreStellarZones();
  }

  $: worldPositions = calculateWorldPositions(system, currentTime);
  // THE REGION OF INTEREST for the current selection - one shared rule ($lib/system/regionOfInterest),
  // recomputed only when the selection or the node set changes rather than per frame. null = nothing
  // selected = no narrowing.
  // Named `roi`, not `region`: calculateAndStorePoints has its own local `region` (the tadpole
  // geometry), and two things called region in one file is how the wrong one gets read.
  $: roi = regionOfInterest(system?.nodes ?? [], focusedBodyId);
  $: if (!transitPreviewPos) {
      lastPreviewSample = null;
  }

  $: if (showLPoints) {
    calculateLagrangePointPositions();
  }

  $: if (worldPositions.size > 0 && system) {
    const orbitAs = system.nodes
      .filter(n => (n.kind === 'body' || n.kind === 'construct') && n.orbit?.elements?.a_AU)
      .map(n => n.orbit!.elements.a_AU)
      .filter(v => Number.isFinite(v) && v > 0);
    const minA = orbitAs.length > 0 ? Math.min(...orbitAs) : 0.01;
    x0_distance = Math.max(minA * 0.1, 1e-8);
  }


  function shouldSuppressAutoZoomNearPeriapsis(nodeId: string): boolean {
    return suppressAutoZoomNearPeriapsis({ nodeId, system, toytownFactor, scaledWorldPositions, worldPositions });
  }

  function fitToPlan(plan: TransitPlan) {
      if (!canvas || !plan || plan.segments.length === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const nodeIds = [plan.originId, plan.targetId];
      for (const id of nodeIds) {
          const pos = toytownFactor > 0 ? scaledWorldPositions.get(id) : worldPositions.get(id);
          if (pos) {
              if (pos.x < minX) minX = pos.x;
              if (pos.x > maxX) maxX = pos.x;
              if (pos.y < minY) minY = pos.y;
              if (pos.y > maxY) maxY = pos.y;
          }
      }
      for (const seg of plan.segments) {
          for (const pt of seg.pathPoints) {
              let x = pt.x;
              let y = pt.y;
              if (toytownFactor > 0 && !plan.isKinematic) {
                 const r = Math.sqrt(x*x + y*y);
                 const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
                 const angle = Math.atan2(y, x);
                 x = r_new * Math.cos(angle);
                 y = r_new * Math.sin(angle);
              }
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
          }
      }
      if (minX === Infinity) return;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const width = maxX - minX;
      const height = maxY - minY;
      const padding = 1.5;
      const targetWidth = Math.max(width, 0.0001); 
      const targetHeight = Math.max(height, 0.0001);
      const zoomX = canvas.width / (targetWidth * padding);
      const zoomY = canvas.height / (targetHeight * padding);
      const targetZoom = clampZoom(Math.min(zoomX, zoomY, MAX_CAMERA_ZOOM));
      cameraMode = 'MANUAL';
      panStore.set({ x: centerX, y: centerY }, { duration: 500 });
      zoomStore.set(targetZoom, { duration: 500 });
  }

  function calculateAndStoreStellarZones() {
    stellarZones.clear();
    if (!system) return;
    const stars = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'star');
    for (const star of stars) {
        const zones = calculateAllStellarZones(star as CelestialBody, rulePack, system.nodes);
        stellarZones.set(star.id, zones);
    }
  }

  function calculateScaledPositions() {
    if (!system || toytownFactor === 0) {
      scaledWorldPositions = worldPositions;
      return;
    }
    // `worldPositions` is reactive ($: line ~137) but this runs imperatively from the draw loop, which
    // ticks independently of Svelte's reactive flush. Right after a NEW system is loaded, `system` (a prop)
    // holds the new nodes while `worldPositions` can still be the PREVIOUS system's map for a frame — so a
    // lookup by a new node id misses and the `.x` reads below throw "reading 'x' of undefined" (the Procyon
    // load crash). Rebuild from the current system when the map is out of sync so true positions always
    // cover the nodes we're about to scale.
    let truePos = worldPositions;
    if (truePos.size < system.nodes.length || (system.nodes[0] && !truePos.has(system.nodes[0].id))) {
      truePos = calculateWorldPositions(system, currentTime);
    }
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    const newScaledPositions = new Map<string, { x: number, y: number }>();
    function getScaledPosition(nodeId: string): { x: number, y: number } {
      if (newScaledPositions.has(nodeId)) return newScaledPositions.get(nodeId)!;
      const node = nodesById.get(nodeId);
      if (!node) return { x: 0, y: 0 };
      if (node.parentId === null) {
        newScaledPositions.set(nodeId, { x: 0, y: 0 });
        return { x: 0, y: 0 };
      }
      const parentScaledPos = getScaledPosition(node.parentId);
      // Belt-and-braces: if a true position is still missing, fall back to the parent's position (the node
      // sits on its parent for this one frame) rather than dereferencing undefined.
      const nodeTruePos = truePos.get(node.id);
      const parentTruePos = truePos.get(node.parentId);
      if (!nodeTruePos || !parentTruePos) {
        newScaledPositions.set(nodeId, { ...parentScaledPos });
        return parentScaledPos;
      }
      let x: number, y: number;
      if ((node.kind === 'body' || node.kind === 'construct' || node.kind === 'barycenter') && node.orbit) {
        const { a_AU: a, e, omega_deg } = node.orbit.elements;
        const w = (omega_deg || 0) * (Math.PI / 180);
        const dxTrue = nodeTruePos.x - parentTruePos.x;
        const dyTrue = nodeTruePos.y - parentTruePos.y;
        const totalAngle = Math.atan2(dyTrue, dxTrue);
        const trueAnomaly = totalAngle - w;
        const a_scaled = scaleBoxCox(a, toytownFactor, x0_distance);
        let r_scaled: number;
        if (e === 0) r_scaled = a_scaled;
        else r_scaled = (a_scaled * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
        x = parentScaledPos.x + r_scaled * Math.cos(totalAngle);
        y = parentScaledPos.y + r_scaled * Math.sin(totalAngle);
      } else {
        const dxTrue = nodeTruePos.x - parentTruePos.x;
        const dyTrue = nodeTruePos.y - parentTruePos.y;
        const trueDistance = Math.sqrt(dxTrue * dxTrue + dyTrue * dyTrue);
        let scaledDistance = trueDistance;
        if (trueDistance > 0) scaledDistance = scaleBoxCox(trueDistance, toytownFactor, x0_distance);
        const angle = Math.atan2(dyTrue, dxTrue);
        x = parentScaledPos.x + scaledDistance * Math.cos(angle);
        y = parentScaledPos.y + scaledDistance * Math.sin(angle);
      }
      newScaledPositions.set(nodeId, { x, y });
      return { x, y };
    }
    for (const node of system.nodes) getScaledPosition(node.id);
    scaledWorldPositions = newScaledPositions;
  }

  // The consistent click-zoom ladder (see camera.ts FRAME_LEVELS): selecting an object frames its
  // first existing level; each re-click on the focused object steps down to the next.
  let focusLevel = 1;

  function levelsFor(nodeId: string): number[] {
      return availableFrameLevels({ nodeId, system, toytownFactor, scaledWorldPositions, worldPositions });
  }
  // Ladder stepping comes from the shared ruleset (viewport/camera) — the holo uses the very same rules.
  function firstLevelFor(nodeId: string): number {
      return firstFrameLevel(levelsFor(nodeId));
  }
  // The whole-system overview level for a target. A ROOT body with children now leads its ladder with a
  // close-up (see camera.frameLevelsFrom), but on ENTRY / Reset View we want the whole-system view (level
  // 2) instead — clicking the star then zooms in, and again returns to the whole system. Non-root or
  // childless targets just use their first level.
  function overviewLevelFor(nodeId: string): number {
      const node = system?.nodes.find(n => n.id === nodeId);
      const levels = levelsFor(nodeId);
      return (node && !node.parentId && levels.includes(2)) ? 2 : firstFrameLevel(levels);
  }
  function nextLevelFor(nodeId: string, current: number): number {
      return nextFrameLevel(levelsFor(nodeId), current);
  }

  function calculateFrameForNode(nodeId: string): { pan: PanState, zoom: number } {
      // forceOrbitView (e.g. the planner's orbit view) pins level 2 (object + satellites).
      const level = forceOrbitView ? 2 : focusLevel;
      return frameForLevel({
          nodeId, level, system, canvas,
          currentPan: get(panStore), currentZoom: get(zoomStore),
          toytownFactor, scaledWorldPositions, worldPositions, x0_distance
      });
  }

  export function resetView() {
      if (!system || !canvas) return;
      cameraMode = 'FOLLOW';
      userZoomOverride = false;
      const targetId = focusedBodyId || system.nodes.find(n => n.parentId === null)?.id;
      if (targetId) {
          focusLevel = overviewLevelFor(targetId); // Reset View on the root shows the whole system, not the star close-up
          dispatch('levelchange', { id: targetId, level: focusLevel }); // Reset View rides to followers too
          const frame = calculateFrameForNode(targetId);
          panStore.set(frame.pan, { duration: 0 });
          zoomStore.set(clampZoom(frame.zoom), { duration: 0 });
      }
  }

  $: if (focusedBodyId !== lastFocusedId && system && canvas && worldPositions.size > 0) {
      handleFocusChange(focusedBodyId);
  }

  function handleFocusChange(newFocusId: string | null) {
      const isInitialEntry = lastFocusedId === null; // first framing since this system mounted = system entry
      lastFocusedId = newFocusId;
      const targetId = newFocusId || system!.nodes.find(n => n.parentId === null)?.id;
      if (!targetId) return;
      const nodesById = new Map(system!.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(targetId);
      if (targetNode && targetNode.kind === 'body' && targetNode.roleHint === 'belt') return;
      // A NEW selection starts at the object's first existing framing level. Exception: on ENTRY to a
      // system we open on the whole-system overview (level 2) rather than the root star's close-up — a
      // click on the star then zooms in, and the next click returns to the whole system.
      focusLevel = isInitialEntry ? overviewLevelFor(targetId) : firstLevelFor(targetId);
      dispatch('levelchange', { id: targetId, level: focusLevel });
      startFocusAnimation(targetId);
  }

  function startFocusAnimation(targetId: string) {
      if (!system) return;
      const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
      const targetPosition = targetPositions.get(targetId);
      if (!targetPosition) return;
      cameraMode = 'FOLLOW';
      userZoomOverride = false;   // an explicit (re)frame re-engages auto-zoom from this object's level
      lastAutoZoomTarget = 0;
      isAnimatingFocus = true;
      const beforeViewport = { pan: get(panStore), zoom: get(zoomStore) };
      const rawAfterViewport = calculateFrameForNode(targetId);
      const afterViewport = { ...rawAfterViewport, zoom: clampZoom(rawAfterViewport.zoom) };
      const zoomRatio = Math.max(beforeViewport.zoom, afterViewport.zoom) / Math.min(beforeViewport.zoom, afterViewport.zoom);
      const isLongZoom = zoomRatio > 100;
      const totalDuration = isLongZoom ? 1500 : 750;
      if (isLongZoom) {
          const isZoomingOut = afterViewport.zoom < beforeViewport.zoom;
          const zoomDuration = totalDuration;
          const panDuration = totalDuration / 2;
          if (isZoomingOut) {
              const panStartDelay = totalDuration / 2;
              zoomStore.set(afterViewport.zoom, { duration: zoomDuration });
              setTimeout(() => panStore.set(afterViewport.pan, { duration: panDuration }), panStartDelay);
          } else {
              const panDur = totalDuration / 6;
              const zoomDur = totalDuration * 5 / 6;
              const zoomStartDelay = panDur;
              panStore.set(afterViewport.pan, { duration: panDur });
              setTimeout(() => zoomStore.set(afterViewport.zoom, { duration: zoomDur }), zoomStartDelay);
          }
      } else {
          panStore.set(afterViewport.pan, { duration: totalDuration });
          zoomStore.set(afterViewport.zoom, { duration: totalDuration });
      }
      setTimeout(() => isAnimatingFocus = false, totalDuration);
  }

  onMount(() => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const resizeObserver = new ResizeObserver(() => {
        canvas.width = parent.clientWidth;
        canvas.height = fullScreen ? parent.clientHeight : parent.clientWidth * (3 / 4);
    });
    resizeObserver.observe(parent);
    canvas.width = parent.clientWidth;
    canvas.height = fullScreen ? parent.clientHeight : parent.clientWidth * (3 / 4);
    animationFrameId = requestAnimationFrame(render);
    return () => {
        if (parent) resizeObserver.unobserve(parent);
        cancelAnimationFrame(animationFrameId);
    };
  });

  onDestroy(() => { cancelAnimationFrame(animationFrameId); stopInertia(); });

  // WS3 — the spatial overlay for the 2D system view. Drawn INSIDE the world transform (context coords
  // are world-AU minus renderPan), so it pans and zooms with the orrery; line widths are divided by the
  // zoom to stay hairline on screen. Lattice spacing is a 1/2/5-decade "nice" number of AU picked so the
  // cells stay a sensible size on screen at any zoom, and the polar modes ring the primary at the origin.
  function drawSystemOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (effOverlay === 'off' || !zoom) return;
    // Visible world rect (context coords).
    const hw = width / 2 / zoom, hh = height / 2 / zoom;
    const cx = renderPan.x, cy = renderPan.y;               // world point at screen centre
    const x0 = -hw, x1 = hw, y0 = -hh, y1 = hh;             // context-coord bounds
    // A cell of roughly 90 screen px, snapped to the shared 1/2/5 × 10^n ladder (map/niceInterval).
    // This view had the right idea first and kept it to itself — the ladder was inlined here and
    // nowhere else, so when G10 needed the same answer for the 3D system grid and both starmaps'
    // scale rings it would have become a second copy. It is the same arithmetic; only the home moved.
    // A PINNED cell wins over the ladder here exactly as it does on the 3D view — the whole point of
    // choosing "1 AU hexes" is that both renderings of the same system agree about what a cell is.
    // This map is linear (no radial compression at 2D), so the AU cell is the cell.
    const step = gridScaleAu > 0 ? gridScaleAu : niceStepBelow(90 / zoom);
    const line = 1 / zoom;
    ctx.save();
    ctx.lineWidth = line;
    ctx.strokeStyle = 'rgba(140,170,210,0.20)';
    ctx.fillStyle = 'rgba(160,185,220,0.55)';
    if (effOverlay === 'square') {
      ctx.beginPath();
      for (let x = Math.ceil((cx + x0) / step) * step; x <= cx + x1; x += step) { const c = x - cx; ctx.moveTo(c, y0); ctx.lineTo(c, y1); }
      for (let y = Math.ceil((cy + y0) / step) * step; y <= cy + y1; y += step) { const c = y - cy; ctx.moveTo(x0, c); ctx.lineTo(x1, c); }
      ctx.stroke();
    } else if (isHexFamily(effOverlay)) {
      // Flat-topped hex lattice with circumradius = step; CCRR numbering is a starmap-scale idea, so the
      // system view draws the Traveller choice as the plain lattice.
      const s = step, dx = s * Math.sqrt(3), dy = s * 1.5;
      const q0 = Math.floor((cx + x0) / dx) - 1, q1 = Math.ceil((cx + x1) / dx) + 1;
      const r0 = Math.floor((cy + y0) / dy) - 1, r1 = Math.ceil((cy + y1) / dy) + 1;
      ctx.beginPath();
      for (let r = r0; r <= r1; r++) {
        for (let q = q0; q <= q1; q++) {
          const hx = dx * (q + (r & 1 ? 0.5 : 0)) - cx, hy = dy * r - cy;
          for (let k = 0; k < 6; k++) {
            const a0 = (Math.PI / 180) * (60 * k - 30), a1 = (Math.PI / 180) * (60 * (k + 1) - 30);
            ctx.moveTo(hx + s * Math.cos(a0), hy + s * Math.sin(a0));
            ctx.lineTo(hx + s * Math.cos(a1), hy + s * Math.sin(a1));
          }
        }
      }
      ctx.stroke();
    } else {
      // Polar: rings about the primary (world origin) + spokes. 'scaled' labels each ring in AU.
      const ox = -cx, oy = -cy;                                    // the origin in context coords
      const maxR = Math.hypot(Math.max(Math.abs(x0 - ox), Math.abs(x1 - ox)), Math.max(Math.abs(y0 - oy), Math.abs(y1 - oy)));
      ctx.beginPath();
      for (let r = step; r <= maxR; r += step) { ctx.moveTo(ox + r, oy); ctx.arc(ox, oy, r, 0, Math.PI * 2); }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a) * maxR, oy + Math.sin(a) * maxR); }
      ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
      if (effOverlay === 'scaled') {
        ctx.save();
        ctx.scale(1 / zoom, 1 / zoom);          // labels in screen px, unscaled by the zoom
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let r = step; r <= maxR; r += step) {
          const lbl = `${formatNice(r)} AU`;   // one formatter, shared with every other scale label
          ctx.fillText(lbl, (ox + r) * zoom, oy * zoom - 2);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function screenToWorld(screenX: number, screenY: number): { x: number, y: number } {
      if (!canvas || !zoom) return { x: 0, y: 0 };
      const { width, height } = canvas;
      const worldX = (screenX - width / 2) / zoom + renderPan.x;
      const worldY = (screenY - height / 2) / zoom + renderPan.y;
      return { x: worldX, y: worldY };
  }
  
  function worldToScreen(worldX: number, worldY: number): { x: number, y: number } {
      if (!canvas || !zoom) return { x: 0, y: 0 };
      const { width, height } = canvas;
      const screenX = (worldX - renderPan.x) * zoom + width / 2;
      const screenY = (worldY - renderPan.y) * zoom + height / 2;
      return { x: screenX, y: screenY };
  }

  function render() {
    if (canvas && system) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Keep the foreground overlay canvas matched to the base canvas + wipe it for this frame.
      if (fgCanvas) {
        if (fgCanvas.width !== canvas.width || fgCanvas.height !== canvas.height) {
          fgCanvas.width = canvas.width; fgCanvas.height = canvas.height;
        }
        fgCtx = fgCanvas.getContext('2d');
        fgCtx?.clearRect(0, 0, fgCanvas.width, fgCanvas.height);
      } else {
        fgCtx = null;
      }
      calculateScaledPositions();
      if (needsReset) { resetView(); needsReset = false; }
      calculateLagrangePointPositions();
      if (focusedBodyId && cameraMode === 'FOLLOW' && !isPanning && !isAnimatingFocus) {
          const targetPosition = toytownFactor > 0 ? scaledWorldPositions.get(focusedBodyId) : worldPositions.get(focusedBodyId);
          if (targetPosition) {
              // Hold the focus dead-centre, then ease the framing via the SHARED auto-frame policy
              // (viewport/camera) — the same one the player views' 2D map runs.
              renderPan = targetPosition;
              const now = performance.now();
              const baseZoom = lastAutoZoomTarget > 0 ? lastAutoZoomTarget : get(zoomStore);
              const nextZoom = autoFrameStep({
                  current: baseZoom,
                  ideal: clampZoom(calculateFrameForNode(focusedBodyId).zoom),
                  userOverride: userZoomOverride,
                  suppress: shouldSuppressAutoZoomNearPeriapsis(focusedBodyId),
                  sinceLastMs: now - lastAutoZoomUpdateMs,
                  minUpdateMs: AUTO_ZOOM_MIN_UPDATE_MS
              });
              if (nextZoom !== null) {
                  zoomStore.set(nextZoom, { duration: 200 });
                  lastAutoZoomTarget = nextZoom;
                  lastAutoZoomUpdateMs = now;
              }
          }
      } else {
          renderPan = panState;
          lastAutoZoomTarget = 0;
      }
      // A draw exception must never kill the render loop (the next frame is only
      // scheduled after this returns) — one bad body would otherwise freeze the
      // whole canvas black. Log once (the debug dump captures it), keep rendering.
      try {
        drawSystem(ctx);
      } catch (err) {
        if (!drawErrorLogged) {
          drawErrorLogged = true;
          console.error('SystemVisualizer: draw failed, skipping frame(s):', err);
        }
      }
    }
    animationFrameId = requestAnimationFrame(render);
  }
  let drawErrorLogged = false;

  let lagrangePoints: Map<string, {x: number, y: number}> | null = null;
  // G43: the L4/L5 tadpole AREAS — one lobe per triangular point, in the render frame.
  //
  // ONLY FOR THE SELECTED OBJECT'S OWN PAIR (owner, 2026-08-26, on seeing every planet's lobes at
  // once: "maybe ONLY show the ones of the currently selected object — points for the others are
  // fine"). Every body still gets its five CROSSES; the shaded region is a focus affordance.
  //
  // The lobe is centred ON the point and spans the observed swarm amplitude, not the separatrix —
  // see physics/lagrange.tadpoleRegion for why those are very different pictures. The same entries
  // drive the right-click placement hit-test, so what you see is exactly what you can click.
  // Each zone is a POLYGON in render-frame world coordinates — the true tadpole contour for L4/L5,
  // and the station-keeping envelope for L1/L2/L3. One shape type for all five means the draw and
  // the placement hit-test read the SAME geometry and cannot drift apart.
  interface LagrangeArea {
      secondaryId: string;
      secondaryName: string;
      point: LagrangePointId;
      poly: { x: number; y: number }[];
  }
  let lagrangeAreas: LagrangeArea[] = [];

  // THE CO-ORBITAL TRACK — where the L-points actually are RIGHT NOW, which is not the orbit line.
  //
  // The triangular points form an equilateral triangle with the two bodies at every instant, so L3,
  // L4 and L5 all sit at exactly the secondary's CURRENT distance; L1/L2 sit a Hill radius inside and
  // outside that. The drawn orbit is the secondary's path over TIME, and on an eccentric orbit its
  // radius at some OTHER longitude is a different number — up to 5.5% different for Luna, and it
  // swings sign as the month goes round, so a different point looks wrong each time you look. The
  // points really do leave the orbit line, and this one faint circle is what makes that read as
  // geometry rather than as a bug: every point lands on it. On a circular orbit it coincides with the
  // orbit exactly (measured: 0.00% at every phase), which is the honest tell that it IS eccentricity.
  let lagrangeTrack: { cx: number; cy: number; r: number } | null = null;
  // Whose L-points are the SELECTED ones. Every pair still draws its five crosses, but the ones
  // that are not the selection's recede, so the selected body's points read at a glance instead of
  // being lost in a field of identical markers (owner, 2026-08-26: "it's confusing just now").
  // Null = nothing is selected that owns a set (a star), and then nothing is dimmed.
  let lagrangeFocusSecondaryId: string | null = null;
  function calculateLagrangePointPositions() {
      const idToUse = focusedBodyId || (system ? system.nodes.find(n => n.parentId === null)?.id : undefined);
      lagrangeAreas = [];
      lagrangeTrack = null;
      if (!system || !showLPoints || !idToUse) { lagrangePoints = null; return; }
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const focusedNode = nodesById.get(idToUse);
      if (!focusedNode || (focusedNode.kind !== 'body' && focusedNode.kind !== 'construct')) { lagrangePoints = null; return; }
      // WHOSE zones get shaded. The selected body's own, normally — and if the selection is
      // something already SITTING at a point (a trojan, or a station parked there), the zones of
      // the body it rides, which is the pair the user is looking at either way. Selecting a star
      // shades nothing: it is the primary of every pair below it, so "its" zones are all of them,
      // which is the noise this rule exists to remove.
      const focusedCoOrbital = (focusedNode as CelestialBody).coOrbital;
      const areaSecondaryId = focusedCoOrbital
          ? focusedCoOrbital.hostId
          : ((focusedNode as CelestialBody).roleHint === 'star' ? null : focusedNode.id);
      lagrangeFocusSecondaryId = areaSecondaryId;
      const allPoints = new Map<string, {x: number, y: number}>();
      const calculateAndStorePoints = (primary: CelestialBody, secondaries: CelestialBody[]) => {
          const primaryPos = worldPositions.get(primary.id);
          const scaledPrimaryPos = toytownFactor > 0 ? scaledWorldPositions.get(primary.id) : primaryPos;
          if (!primaryPos || !scaledPrimaryPos) return;
          for (const secondary of secondaries) {
              const secondaryPos = worldPositions.get(secondary.id);
              const scaledSecondaryPos = toytownFactor > 0 ? scaledWorldPositions.get(secondary.id) : secondaryPos;
              if (!secondaryPos || !scaledSecondaryPos || !secondary.orbit) continue;
              const relativeSecondaryPos = { x: secondaryPos.x - primaryPos.x, y: secondaryPos.y - primaryPos.y };
              const points = calculateLagrangePoints(primary, secondary, relativeSecondaryPos);
              const scaledRelativeSecondaryPos = { x: scaledSecondaryPos.x - scaledPrimaryPos.x, y: scaledSecondaryPos.y - scaledPrimaryPos.y };
              const angle = Math.atan2(scaledRelativeSecondaryPos.y, scaledRelativeSecondaryPos.x);
              points.forEach(p => {
                  let x = p.x; let y = p.y;
                  if (toytownFactor > 0) {
                      const realSecondaryDist = Math.sqrt(relativeSecondaryPos.x * relativeSecondaryPos.x + relativeSecondaryPos.y * relativeSecondaryPos.y);
                      const scaledSecondaryDist = Math.sqrt(scaledRelativeSecondaryPos.x * scaledRelativeSecondaryPos.x + scaledRelativeSecondaryPos.y * scaledRelativeSecondaryPos.y);
                      if (realSecondaryDist > 0) { const scaleFactor = scaledSecondaryDist / realSecondaryDist; x *= scaleFactor; y *= scaleFactor; }
                  }
                  if (!p.isRotated) {
                      const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
                      const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
                      x = rotatedX; y = rotatedY;
                  }
                  allPoints.set(`${p.name}-${secondary.id}`, { x: x + scaledPrimaryPos.x, y: y + scaledPrimaryPos.y });
              });
              // G43: the five zones, but ONLY for the pair the user has actually selected.
              if (primary.massKg && secondary.massKg && secondary.id === areaSecondaryId) {
                  const region = tadpoleRegion(secondary.massKg, primary.massKg);
                  const R = Math.sqrt(scaledRelativeSecondaryPos.x ** 2 + scaledRelativeSecondaryPos.y ** 2);
                  const thetaSec = Math.atan2(scaledRelativeSecondaryPos.y, scaledRelativeSecondaryPos.x);
                  const retro = !!secondary.orbit?.isRetrogradeOrbit;
                  lagrangeTrack = { cx: scaledPrimaryPos.x, cy: scaledPrimaryPos.y, r: R };
                  const mu = secondary.massKg / (primary.massKg + secondary.massKg);
                  // Normalised (secondary along +x, primary at origin) -> render frame. The scale is
                  // the CURRENT separation, not the semi-major axis, so an eccentric pair's zones
                  // breathe over the orbit the way the real pulsating-frame geometry does.
                  const place = (p: { x: number; y: number }) => {
                      const y = retro ? -p.y : p.y;
                      return {
                          x: scaledPrimaryPos.x + R * (p.x * Math.cos(thetaSec) - y * Math.sin(thetaSec)),
                          y: scaledPrimaryPos.y + R * (p.x * Math.sin(thetaSec) + y * Math.cos(thetaSec))
                      };
                  };
                  for (const point of ['l4', 'l5'] as const) {
                      const poly = tadpoleOutline(mu, point, region.swarmHalfAngleDeg).map(place);
                      if (poly.length >= 3) lagrangeAreas.push({ secondaryId: secondary.id, secondaryName: secondary.name, point, poly });
                  }
                  // The collinear envelopes: an ellipse about each point, sized on the Hill radius.
                  const k = hillFactor(secondary.massKg, primary.massKg);
                  for (const point of ['l1', 'l2', 'l3'] as const) {
                      const scale = coOrbitalScale(point, secondary.massKg, primary.massKg);
                      const cx = point === 'l3' ? -1 : scale;   // normalised, along the +x line
                      const along = COLLINEAR_ENVELOPE_HILL.alongOrbit * k;
                      const rad = COLLINEAR_ENVELOPE_HILL.radial * k;
                      const poly: { x: number; y: number }[] = [];
                      for (let s = 0; s < 40; s++) {
                          const a = (s / 40) * 2 * Math.PI;
                          poly.push(place({ x: cx + rad * Math.cos(a), y: along * Math.sin(a) }));
                      }
                      lagrangeAreas.push({ secondaryId: secondary.id, secondaryName: secondary.name, point, poly });
                  }
              }
          }
      };
      if (focusedNode.parentId) {
          const parent = nodesById.get(focusedNode.parentId);
          if (parent && parent.kind === 'body') {
              const siblings = system.nodes.filter(n => 
                  n.parentId === parent.id && 
                  n.kind === 'body' && 
                  (n as CelestialBody).roleHint !== 'belt' && 
                  (n as CelestialBody).roleHint !== 'ring'
              ) as CelestialBody[];
              calculateAndStorePoints(parent as CelestialBody, siblings);
          }
      }
      const children = system.nodes.filter(n => 
          n.parentId === focusedNode.id && 
          n.kind === 'body' && 
          (n as CelestialBody).roleHint !== 'belt' && 
          (n as CelestialBody).roleHint !== 'ring'
      ) as CelestialBody[];
      if (children.length > 0) calculateAndStorePoints(focusedNode as CelestialBody, children);
      lagrangePoints = allPoints.size > 0 ? allPoints : null;
  }

  // The projected orbit path for a construct, memoised on the ORBIT OBJECT. Sampling a full
  // revolution is 128 Kepler solves and this runs per frame per ship, so it must not be redone while
  // nothing has changed - and since a parked ship stopped rewriting its own node (RENDER-S36) the
  // orbit object is a stable key. A WeakMap so a deleted ship's path goes with it.
  const _orbitPathCache = new WeakMap<object, { x: number; y: number }[]>();
  function projectedOrbitPath(node: CelestialBody, parent: any): { x: number; y: number }[] | null {
      const key = node.orbit as unknown as object;
      if (!key) return null;
      const hit = _orbitPathCache.get(key);
      if (hit) return hit;
      const pts = orbitPathProjected(node, parent);
      if (pts.length > 1) _orbitPathCache.set(key, pts);
      return pts.length > 1 ? pts : null;
  }

  // Per-frame world positions now live in the shared physics/worldPositions module so the 2D orrery
  // and the 3D holo view place bodies identically (they differ only in the propagator). The construct
  // kinematics sampler is injected — it resolves a ship's position per-frame at the render clock
  // (transit path, coast conic, or post-arrival parking orbit) in the same frame as its host, which
  // stops the deep-zoom jitter a stored vector_position_au would cause between reconcile ticks.
  function calculateWorldPositions(system: System | null, currentTime: number): Map<string, { x: number, y: number }> {
      return computeWorldPositions(system, currentTime, sampleJourneyKinematicsAtTime);
  }

  // getVisibleNodeIds now lives in $lib/system/visibleNodes (imported above) so the 2D orrery and
  // the 3D holo view apply the same focus-based naming/visibility rule.

  // Draw a construct's icon glyph (triangle/circle/diamond/cross/square) centred
  // at (x, y) with the given pixel size. Single source of truth for both the
  // world-space pass (sizePx = 8 / zoom) and the screen-space overlay (sizePx = 8),
  // which had drifted apart. Screen-space sizing (8px) is the canonical default.
  // G53/G58: what does the plan view draw for an exotic besides its glyph? THE RECORD SAYS
  // (DATA-R33): `render2d.structure` - 'orbit-line' when the node's own orbit line IS the
  // structure (ring, torus, shell, swarm: centred on the host at their orbital radius), 'radial'
  // for a tether (a line from the host's drawn edge out to geostationary and the counterweight),
  // 'glyph' for a marker alone. Never a family test or a list of names here.
  function isMegaRing(node: any): boolean {
    return megaTypeDef(node?.megaType)?.capabilities.render2d.structure === 'orbit-line';
  }
  function isMegaRadial(node: any): boolean {
    return megaTypeDef(node?.megaType)?.capabilities.render2d.structure === 'radial';
  }

  // A body's DRAWN disc radius in world units - the toytown-scaled true radius with the same
  // per-role pixel floor the body pass draws with. One function, so the tether's base, the body
  // loop and anything else that must meet the disc edge agree by construction.
  function drawnDiscRadiusWorld(node: any, zoomNow: number): number {
    let radiusInAU = (node.radiusKm || 0) / AU_KM;
    if (toytownFactor > 0) radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
    let minRadiusPx = 2;
    if (node.roleHint === 'star') minRadiusPx = 4;
    else if (node.roleHint === 'planet') { const isGasGiant = (node.classes ?? []).some((c: string) => c.includes('gas-giant') || c.includes('ice-giant')); minRadiusPx = isGasGiant ? 3 : 2; }
    else if (node.roleHint === 'moon') minRadiusPx = 1;
    const minRadiusInWorld = minRadiusPx / zoomNow;
    return Math.sqrt(radiusInAU * radiusInAU + minRadiusInWorld * minRadiusInWorld);
  }

  // THE BEANSTALK ON THE PLAN VIEW (owner, 2026-09-02: "on the GM view we are still not seeing the
  // elevator being drawn - just a surface icon"). A line from the host's DRAWN disc edge, along the
  // direction the anchor glyph already sits on, out to the counterweight, with the geostationary
  // dock as a knob - every distance through the SAME toytown transform (`scaleBoxCox`) that places
  // the moons and sizes the discs, so geo lands between the disc and the Moon by monotonicity: the
  // 2D twin of the 3D satellite law (RENDER-S50). Inside the drawn disc, nothing is drawn and the
  // glyph carries it, honestly.
  function drawTetherRadial(ctx: CanvasRenderingContext2D, node: any, pos: { x: number; y: number }, pan: { x: number; y: number }, zoomNow: number): void {
      if (!system) return;
      const host = system.nodes.find(n => n.id === node.parentId) as any;
      if (!host || host.kind !== 'body') return;
      const hostPos = scaledWorldPositions.get(host.id);
      if (!hostPos) return;
      const def = megaTypeDef(node.megaType);
      if (!def) return;
      const spec = def.shape(instanceMegaParams(node, def, host), host);
      if (spec.family !== 'tether') return;
      const dims = (node.physical_parameters?.dimensionsM ?? []) as number[];
      const authoredKm = Math.max(0, ...dims.map((d: number) => Math.abs(Number(d)) || 0)) / 1000;
      const alt = tetherAltitudesKm(spec, authoredKm > 0 ? authoredKm : undefined);
      const hostKm = host.radiusKm || 0;
      if (!alt || !(hostKm > 0)) return;
      const drawnDist = (altKm: number) => {
          const au = (hostKm + altKm) / AU_KM;
          return toytownFactor > 0 ? scaleBoxCox(au, toytownFactor, x0_distance) : au;
      };
      const baseD = drawnDiscRadiusWorld(host, zoomNow);
      const dockD = drawnDist(alt.dockKm);
      const topD = drawnDist(alt.topKm);
      if (!(topD > baseD)) return;
      let dx = pos.x - hostPos.x, dy = pos.y - hostPos.y;
      const n = Math.hypot(dx, dy);
      if (n > 1e-12) { dx /= n; dy /= n; } else { dx = 1; dy = 0; }
      const hx = hostPos.x - pan.x, hy = hostPos.y - pan.y;
      ctx.save();
      ctx.strokeStyle = node.icon_color || '#9fe8a0';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2 / zoomNow;
      ctx.beginPath();
      ctx.moveTo(hx + dx * baseD, hy + dy * baseD);
      ctx.lineTo(hx + dx * topD, hy + dy * topD);
      ctx.stroke();
      if (dockD > baseD) {
          ctx.beginPath(); ctx.arc(hx + dx * dockD, hy + dy * dockD, 3 / zoomNow, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(hx + dx * topD, hy + dy * topD, 2 / zoomNow, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
  }

  function drawConstructGlyph(ctx: CanvasRenderingContext2D, node: CelestialBody, x: number, y: number, sizePx: number): void {
      // The ONE glyph vocabulary (inbox A34) — this was a private copy of the same five shapes.
      const c = node as any;
      ctx.fillStyle = c.icon_color || '#ffd24d';
      traceConstructIcon(ctx, constructIconShape(c.icon_type), x, y, sizePx);
      ctx.fill();
  }

  // Hit-test the canvas at screen coords (relative to the canvas element) and
  // return the nearest selectable node within its picking radius, plus the
  // click's world position. Shared by handleClick and handleContextMenu so the
  // hit-testing stays identical; the wrappers only differ in what they dispatch.
  function pickNodeAt(screenX: number, screenY: number): { node: CelestialBody; world: { x: number; y: number } } | null {
      if (!system) return null;
      const clickPos = screenToWorld(screenX, screenY);
      const clickableIds = getVisibleNodeIds(system, focusedBodyId);
      const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
      // Collect every node whose pick-radius contains the click, with its centre distance.
      const hits: { node: CelestialBody; distanceSq: number }[] = [];
      for (const node of system.nodes) {
          if (!clickableIds.has(node.id) || (node.kind !== 'body' && node.kind !== 'construct')) continue;
          const pos = targetPositions.get(node.id);
          if (!pos) continue;
          const dx = clickPos.x - pos.x; const dy = clickPos.y - pos.y;
          const distanceSq = dx * dx + dy * dy;
          let radiusInAU = (node.radiusKm || 0) / AU_KM;
          if (toytownFactor > 0) radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
          let minRadiusPx = 2;
          if (node.kind === 'construct') minRadiusPx = 12;
          else if (node.roleHint === 'star') minRadiusPx = 10;
          else if (node.roleHint === 'planet') { const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant')); minRadiusPx = isGasGiant ? 15 : 12; }
          else if (node.roleHint === 'moon') minRadiusPx = 8;
          const minRadiusInWorld = minRadiusPx / zoom;
          const finalRadius = Math.sqrt(Math.pow(radiusInAU, 2) + Math.pow(minRadiusInWorld, 2));
          if (distanceSq < finalRadius * finalRadius) hits.push({ node: node as CelestialBody, distanceSq });
      }
      if (!hits.length) return null;
      // Gate toward the PARENT when in doubt: if a hit's host is also under the cursor, drop the
      // child — a general click on a planet shouldn't grab one of its moons/constructs. Only when
      // the parent is NOT hit (you clicked a clearly-separated moon) does the child survive.
      const hitIds = new Set(hits.map((h) => h.node.id));
      const hostOf = (n: any) => (n.ui_parentId || n.parentId || n.orbit?.hostId) as string | undefined;
      const preferred = hits.filter((h) => { const p = hostOf(h.node); return !(p && hitIds.has(p)); });
      const pool = preferred.length ? preferred : hits;
      pool.sort((a, b) => a.distanceSq - b.distanceSq);
      return { node: pool[0].node, world: clickPos };
  }

  // --- Unified pointer gestures (Phase 02). Coords arriving here are canvas-relative
  //     (the gestures action subtracts getBoundingClientRect), matching the old
  //     `clientX - rect.left`. Behaviour is otherwise the pre-Phase-02 mouse logic. ---

  // Tap = the old handleClick body (focus, or zoom-in if already focused; belt labels first).
  function handleTap(clickX: number, clickY: number) {
      if (!system) return;
      // Measuring tape: tap picks endpoint A then B; a third tap restarts from that body as A.
      if (rulerActive) {
          const pick = pickNodeAt(clickX, clickY);
          if (!pick) return;
          if (!rulerA || (rulerA && rulerB)) { rulerA = { id: pick.node.id, name: pick.node.name }; rulerB = null; }
          else if (pick.node.id !== rulerA.id) { rulerB = { id: pick.node.id, name: pick.node.name }; }
          return;
      }
      if (showNames) {
          for (const [beltId, area] of beltLabelClickAreas.entries()) {
              if (clickX >= area.x1 && clickX <= area.x2 && clickY >= area.y1 && clickY <= area.y2) {
                  dispatch("focus", beltId); return;
              }
          }
      }
      const picked = pickNodeAt(clickX, clickY);
      if (picked) {
        if (picked.node.id === focusedBodyId) {
          // Re-click the focused object → step DOWN to the next existing framing level.
          focusLevel = nextLevelFor(picked.node.id, focusLevel);
          dispatch('levelchange', { id: picked.node.id, level: focusLevel }); // ladder steps ride to followers
          startFocusAnimation(picked.node.id);
        } else {
          dispatch("focus", picked.node.id);
        }
      }
  }

  // Long-press / right-click = the old handleContextMenu body. The menu is positioned in
  // screen space, so convert the canvas-relative point back via the bounding rect.
  function openContextMenu(clickX: number, clickY: number) {
      if (!system) return;
      const rect = canvas.getBoundingClientRect();
      const screenX = clickX + rect.left;
      const screenY = clickY + rect.top;
      const picked = pickNodeAt(clickX, clickY);
      if (picked) dispatch("showBodyContextMenu", { node: picked.node, x: screenX, y: screenY });
      else {
        const clickPos = screenToWorld(clickX, clickY);
        const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
        const dominantBody = findContainingHost(clickPos.x, clickPos.y, system.nodes, targetPositions);
        // G43: a click inside a drawn L4/L5 lobe offers trojan placement there. Same geometry and
        // px floor as the draw, so the clickable region is exactly the visible one.
        const lagrangeHit = hitTestLagrangeArea(clickPos.x, clickPos.y);
        // G45: a click inside a drawn circumbinary ring offers a P-type body of that pair.
        const circumbinaryHit = hitTestCircumbinaryArea(clickPos.x, clickPos.y);
        dispatch("backgroundContextMenu", { x: clickPos.x, y: clickPos.y, dominantBody, screenX, screenY, lagrangeHit, circumbinaryHit });
      }
  }

  // Inside a drawn circumbinary ring? Same centres and radii the draw published, so the clickable
  // region is exactly the visible one. An open ring (a root pair, no outer edge) has rOuter Infinity,
  // which is honest: outside the inner edge there is no further wall in this system.
  function hitTestCircumbinaryArea(wx: number, wy: number): { baryId: string; baryName: string } | null {
      if (!showHillSpheres) return null;
      for (const a of circumbinaryAreas) {
          const d = Math.hypot(wx - a.cx, wy - a.cy);
          if (d >= a.rInner && d <= a.rOuter) return { baryId: a.baryId, baryName: a.baryName };
      }
      return null;
  }

  // Point-in-polygon against the SAME outlines that were drawn, so the clickable region is exactly
  // the visible one for all five points — no second geometry to keep in step.
  function hitTestLagrangeArea(wx: number, wy: number): { secondaryId: string; secondaryName: string; point: LagrangePointId } | null {
      if (!showLPoints) return null;
      for (const area of lagrangeAreas) {
          const p = area.poly;
          let inside = false;
          for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
              const xa = p[a].x, ya = p[a].y, xb = p[b].x, yb = p[b].y;
              if (((ya > wy) !== (yb > wy)) && (wx < ((xb - xa) * (wy - ya)) / (yb - ya) + xa)) inside = !inside;
          }
          if (inside) return { secondaryId: area.secondaryId, secondaryName: area.secondaryName, point: area.point };
      }
      return null;
  }

  // Zoom about a canvas-relative point, keeping that point fixed (old handleWheel logic,
  // generalised to take a factor so wheel and pinch share it).
  function zoomAt(factor: number, screenX: number, screenY: number) {
      userZoomOverride = true;   // the user is driving zoom now — stop the auto-camera fighting them
      const worldPosBeforeZoom = screenToWorld(screenX, screenY);
      const newZoom = clampZoom(get(zoomStore) * factor);
      const newPanX = worldPosBeforeZoom.x - (screenX - canvas.width / 2) / newZoom;
      const newPanY = worldPosBeforeZoom.y - (screenY - canvas.height / 2) / newZoom;
      panStore.set({ x: newPanX, y: newPanY }, { duration: 0 });
      zoomStore.set(newZoom, { duration: 0 });
  }

  // Pan by a screen-pixel delta (old handleMouseMove logic).
  function panBy(dx: number, dy: number) {
      const z = get(zoomStore);
      const currentPan = get(panStore);
      panStore.set({ x: currentPan.x - dx / z, y: currentPan.y - dy / z }, { duration: 0 });
  }

  function stopInertia() {
      if (inertiaRaf !== null) { cancelAnimationFrame(inertiaRaf); inertiaRaf = null; }
  }

  // Fling: decay the release velocity (px/s) by 0.92 per frame, stop below 2 px/s.
  function startInertia(vx: number, vy: number) {
      stopInertia();
      if (Math.hypot(vx, vy) < 2) return;
      let vX = vx, vY = vy, lastT = 0;
      const step = (t: number) => {
          if (!lastT) { lastT = t; inertiaRaf = requestAnimationFrame(step); return; }
          const dt = (t - lastT) / 1000; lastT = t;
          panBy(vX * dt, vY * dt);
          vX *= 0.92; vY *= 0.92;
          if (Math.hypot(vX, vY) < 2) { inertiaRaf = null; return; }
          inertiaRaf = requestAnimationFrame(step);
      };
      inertiaRaf = requestAnimationFrame(step);
  }

  const canvasGestures = {
      onPanStart: () => { isPanning = true; cameraMode = 'MANUAL'; stopInertia(); if (canvas) canvas.style.cursor = 'grabbing'; },
      onPan: ({ dx, dy }: { dx: number; dy: number }) => panBy(dx, dy),
      onPanEnd: ({ vx, vy }: { vx: number; vy: number }) => { isPanning = false; if (canvas) canvas.style.cursor = 'grab'; startInertia(vx, vy); },
      onZoom: ({ factor, x, y }: { factor: number; x: number; y: number }) => zoomAt(factor, x, y),
      onTap: ({ x, y }: { x: number; y: number }) => handleTap(x, y),
      onLongPress: ({ x, y }: { x: number; y: number }) => openContextMenu(x, y)
  };

  // "#rrggbb" / "#rgb" / "rgb(...)" → "r,g,b" for building rgba() gradients.

  function hexToRgbTriplet(c: string): string {
      if (!c) return '255,255,255';
      if (c.startsWith('rgb')) { const m = c.match(/\d+/g); return m ? m.slice(0, 3).join(',') : '255,255,255'; }
      let h = c.replace('#', '');
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h, 16);
      if (Number.isNaN(n)) return '255,255,255';
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  // A construct is coasting now if it isn't on an active (non-cancelled) journey but has an aborted one
  // that's already taken effect — i.e. it's drifting/falling under gravity, so it gets a forecast path.
  function isCoastingNow(node: any): boolean {
      const logs = node.scheduled_journeys || [];
      if (!logs.length) return false;
      // On a real journey right now → in transit, not coasting.
      for (const l of logs) {
          if (l.status === 'cancelled') continue;
          const b = getJourneyBounds(l.plans);
          if (b && currentTime >= b.startMs && currentTime <= b.endMs) return false;
      }
      // A cancelled drift only coasts from its cancel time UNTIL the next journey begins. If a later journey
      // has since started (e.g. the ship was picked up and flown to Uranio), the drift is over — no forecast
      // line. Mirrors the supersede fix in sampleJourneyKinematicsAtTime; without it the drift line lingers,
      // pinned at the now-parked ship, after it has established orbit.
      for (const l of logs) {
          if (l.status !== 'cancelled' || !l.cancelledAtSec) continue;
          const cancelMs = Number(l.cancelledAtSec) * 1000;
          if (currentTime < cancelMs) continue;
          const superseded = logs.some((o: any) => {
              if (o === l || o.status === 'cancelled') return false;
              const ob = getJourneyBounds(o.plans);
              return ob && ob.startMs > cancelMs && currentTime >= ob.startMs;
          });
          if (!superseded) return true;
      }
      return false;
  }

  function drawSystem(baseCtx: CanvasRenderingContext2D) {
      if (!system || !zoom) return;
      const ctx = baseCtx;
      const { width, height } = canvas;
      const nextOverlays: typeof discOverlays = [];  // PlanetDisc overlays collected this frame
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      ctx.save();
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      drawSystemOverlay(ctx, width, height); // WS3 grid/overlay — under everything else
      // Zones are drawn in screen-space overlay after world-space pass for better dash/LOD performance.
      if (showTravellerZones) drawTravellerZones(ctx);
      drawSensorOverlay(ctx);   // gates internally on the global view toggle OR the ship's sensors flag
      for (const node of system.nodes) {
          if (!node.orbit || !node.parentId) continue;
          // A BELT OR A RING IS ITS OWN ORBIT LINE. Both are drawn just below as an annulus at the
          // radius they occupy, so an ellipse through the middle of that band is the same information
          // twice — and on a planet's rings it lands as a hard line across a soft disc. Belts have
          // been skipped here since they were introduced; rings were not, which is the asymmetry the
          // owner spotted: "can we get rid of the orbital lines of rings? The ring is enough."
          //
          // Only skipped where the band will ACTUALLY draw, though. The annulus below needs an inner
          // and an outer radius and a positive width between them; authored or imported data may have
          // neither, and dropping the ellipse as well would leave the body with nothing drawn at all.
          if (node.kind === 'body' && (node.roleHint === 'belt' || node.roleHint === 'ring')) {
              const drawsAsBand = !!node.radiusInnerKm && !!node.radiusOuterKm
                  && node.radiusOuterKm > node.radiusInnerKm;
              if (drawsAsBand) continue;
          }
          const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
          if (!parentPos) continue;
          let a = node.orbit.elements.a_AU; let e = node.orbit.elements.e;
          if (toytownFactor > 0) a = scaleBoxCox(a, toytownFactor, x0_distance);
          const b = a * Math.sqrt(1 - e * e); const c = a * e;
          // Bad orbit data (negative/NaN a, e >= 1) must not throw in ctx.ellipse
          // and freeze the canvas — skip this orbit line instead.
          if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b <= 0) continue;
          const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
          // The designed grey, scaled by the dial. Drawn as rgba rather than via globalAlpha so it
          // cannot leak into the fills that follow in this pass.
          ctx.strokeStyle = `rgba(51,51,51,${Math.max(0, Math.min(1, orbitOpacity))})`; ctx.lineWidth = 1 / zoom;

          // G53: A RING IS ITS OWN ORBIT LINE. Owner, 2026-08-28: *"gm map ringworlds can just use
          // the orbital line - coloured as ringworld - at a distance."* And he is right that this is
          // the honest drawing rather than a shortcut: a ringworld, torus, shell or swarm is
          // CENTRED on its host at exactly this radius, so the ellipse already traced here IS the
          // structure. It takes the construct's own colour and a heavier stroke, so the plan view
          // says "a thing lives on this path" instead of drawing a dot that pretends to be a place.
          // The glyph still draws on top as the click target (a whole ring is cumbersome to hit).
          const megaRing = isMegaRing(node as any);
          if (megaRing) {
            ctx.strokeStyle = (node as any).icon_color || '#9fe8a0';
            ctx.lineWidth = 2.5 / zoom;
          }

          // A LINE A SHIP IS NOT ON IS WORSE THAN NO LINE, AND THAT IS WHAT AN ELLIPSE FROM `a`, `e`
          // AND OMEGA ALONE IS FOR A SHIP THAT HAS FLOWN SOMEWHERE.
          //
          // The plan-view convention (2D is the plan view) is right for everything the FLAT propagator
          // also places. A construct with journeys is not one of those: `calculateWorldPositions`
          // injects `sampleJourneyKinematicsAtTime`, which parks a ship on the plane it actually
          // ARRIVED on, inclination and all. So the ship rode an inclined circle while its line was
          // drawn as a flat one and the two only met at two points - the owner's "the only orbit line
          // missing is when a construct establishes an orbit", with Tiangong's line correct beside it
          // because Tiangong has never flown anywhere and so IS placed by the flat propagator.
          //
          // Two rules, both keyed on what actually places the thing:
          //   - on a route right now -> no orbit line at all (it is not on its orbit), matching the 3D
          //     view's rule (RENDER-S37).
          //   - placed by the sampler -> draw the path the 3D walk walks, projected. Same rotation,
          //     same satellite framing, so the line passes through the ship BY CONSTRUCTION.
          const sampled = node.kind === 'construct' ? sampleJourneyKinematicsAtTime(system, node as CelestialBody, currentTime) : null;
          if (sampled && sampled.state !== 'Orbiting') continue;   // in transit or adrift: no orbit to draw
          const projected = sampled ? projectedOrbitPath(node as CelestialBody, nodesById.get(node.parentId)) : null;

          ctx.save();
          ctx.translate(parentPos.x - renderPan.x, parentPos.y - renderPan.y);
          ctx.beginPath();
          if (projected && projected.length > 1) {
            ctx.moveTo(projected[0].x, projected[0].y);
            for (let i = 1; i < projected.length; i++) ctx.lineTo(projected[i].x, projected[i].y);
          } else {
            ctx.rotate(omega_rad);
            ctx.ellipse(-c, 0, a, b, 0, 0, 2 * Math.PI);
          }
          ctx.stroke();
          ctx.restore();
      }
      for (const node of system.nodes) {
          if (node.kind === 'body' && (node.roleHint === 'belt' || node.roleHint === 'ring') && node.parentId) {
              const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
              if (!parentPos) continue;
              if (node.radiusInnerKm && node.radiusOuterKm) {
                  let innerRadiusAU = node.radiusInnerKm / AU_KM; let outerRadiusAU = node.radiusOuterKm / AU_KM;
                  if (toytownFactor > 0) {
                      innerRadiusAU = scaleBoxCox(innerRadiusAU, toytownFactor, x0_distance);
                      outerRadiusAU = scaleBoxCox(outerRadiusAU, toytownFactor, x0_distance);
                  }
                  const avgRadius = (innerRadiusAU + outerRadiusAU) / 2;
                  const widthAU = outerRadiusAU - innerRadiusAU;
                  if (widthAU <= 0) continue;
                  ctx.save();
                  ctx.translate(parentPos.x - renderPan.x, parentPos.y - renderPan.y);
                  if (node.roleHint === 'belt') ctx.lineWidth = Math.max(4 / zoom, widthAU);
                  else ctx.lineWidth = widthAU;
                  // Opacity tracks DENSITY (massKg as a debris-density proxy): Saturn's dense rings
                  // read solid, the other giants' thin rings are barely there; a denser belt looks
                  // less transparent. Legacy data with no density falls back to a moderate level.
                  const dens = debrisDensityFrac(node.massKg);
                  let alpha = node.roleHint === 'ring' ? (0.05 + dens * 0.5) : (0.02 + dens * 0.18);
                  ctx.strokeStyle = node.roleHint === 'ring' ? `rgba(200, 200, 200, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
                  ctx.beginPath();
                  let drewBeltEllipse = false;
                  if (node.roleHint === 'belt' && node.orbit) {
                      let a = node.orbit.elements.a_AU;
                      if (toytownFactor > 0) a = scaleBoxCox(a, toytownFactor, x0_distance);
                      const e = node.orbit.elements.e; const b = a * Math.sqrt(1 - e * e); const c = a * e;
                      const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
                      // Same negative/NaN guard as the orbit lines above — fall back to the arc.
                      if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) {
                          ctx.save(); ctx.rotate(omega_rad); ctx.ellipse(-c, 0, a, b, 0, 0, 2 * Math.PI); ctx.restore();
                          drewBeltEllipse = true;
                      }
                  }
                  if (!drewBeltEllipse) ctx.arc(0, 0, avgRadius, 0, 2 * Math.PI);
                  ctx.stroke();
                  if (node.roleHint === 'ring') {
                      const parent = nodesById.get(node.parentId);
                      if (parent && parent.kind === 'body' && parent.parentId) {
                          const grandParentPos = toytownFactor > 0 ? scaledWorldPositions.get(parent.parentId) : worldPositions.get(parent.parentId);
                          if (grandParentPos) {
                              const angleToStar = Math.atan2(parentPos.y - grandParentPos.y, parentPos.x - grandParentPos.x);
                              let planetRadiusAU = (parent.radiusKm || 0) / AU_KM;
                              if (toytownFactor > 0) planetRadiusAU = scaleBoxCox(planetRadiusAU, toytownFactor, x0_distance);
                              // Shadow width must match the planet's DRAWN disc, which has a minimum
                              // pixel size — using the raw radius made the umbra a point-source sliver
                              // far narrower than the visible planet. Same effective-radius rule as the
                              // body draw loop.
                              const isGiant = parent.classes?.some((c: string) => c.includes('gas-giant') || c.includes('ice-giant'));
                              const minPlanetPx = isGiant ? 3 : 2;
                              const effPlanetRadius = Math.sqrt(planetRadiusAU * planetRadiusAU + Math.pow(minPlanetPx / zoom, 2));
                              // Parallel-sided umbra: a band exactly one planet-diameter wide running
                              // anti-starward, clipped to the ring annulus. (An arc segment has
                              // constant ANGULAR width, so it fanned outward like a searchlight.)
                              ctx.save();
                              ctx.beginPath();
                              ctx.arc(0, 0, outerRadiusAU, 0, 2 * Math.PI);
                              ctx.arc(0, 0, innerRadiusAU, 0, 2 * Math.PI, true);
                              ctx.clip('evenodd');
                              ctx.rotate(angleToStar); // +x now points anti-starward
                              const umbra = ctx.createLinearGradient(0, -effPlanetRadius, 0, effPlanetRadius);
                              umbra.addColorStop(0, 'rgba(0,0,0,0)');
                              umbra.addColorStop(0.18, 'rgba(0,0,0,0.45)');
                              umbra.addColorStop(0.82, 'rgba(0,0,0,0.45)');
                              umbra.addColorStop(1, 'rgba(0,0,0,0)');
                              ctx.fillStyle = umbra;
                              ctx.fillRect(0, -effPlanetRadius, outerRadiusAU * 1.05, 2 * effPlanetRadius);
                              ctx.restore();
                          }
                      }
                  }
                  ctx.restore();
              }
          }
      }
      // A point belongs to the selection when its key names the selected secondary. Keys are
      // `${name}-${secondaryId}`, so the id is everything after the first hyphen.
      const lagrangeIsSelected = (key: string) =>
          !lagrangeFocusSecondaryId || key.slice(key.indexOf('-') + 1) === lagrangeFocusSecondaryId;
      if (showLPoints && lagrangeTrack && lagrangeTrack.r > 0) {
          // DASH BUDGET (owner's standing warning, and this view is exactly where it would bite).
          // A dash pattern costs per SEGMENT over the whole path, not over the visible part, so a
          // full circle at deep zoom is charged for its entire circumference even when almost all of
          // it is off-screen: at 100x that is ~45,000 segments and at 10,000x about 4.5 MILLION, which
          // is a stalled frame for a decorative line. The dashes are worth it here — they are what
          // says 'this is the L-points' own track, not the orbit' — so keep them, but fall back to a
          // solid stroke once the circumference stops being affordable. Solid costs the same at any
          // scale. Anything else that wants dashes at astronomical scale should do the same check.
          const circumferencePx = 2 * Math.PI * lagrangeTrack.r * zoom;
          const dashesAffordable = circumferencePx < 40000;   // ~2,800 segments
          ctx.beginPath();
          ctx.arc(lagrangeTrack.cx - renderPan.x, lagrangeTrack.cy - renderPan.y, lagrangeTrack.r, 0, 2 * Math.PI);
          if (dashesAffordable) ctx.setLineDash([6 / zoom, 8 / zoom]);
          ctx.lineWidth = 1 / zoom;
          ctx.strokeStyle = dashesAffordable ? 'rgba(120, 220, 180, 0.22)' : 'rgba(120, 220, 180, 0.13)';
          ctx.stroke();
          ctx.setLineDash([]);
      }
      if (showLPoints && lagrangeAreas.length) {
          // The zones, drawn as the shapes the physics actually makes: a true tadpole contour at
          // L4/L5 (fat head at the point, tail narrowing toward the secondary) and a station-keeping
          // ellipse at each collinear point.
          //
          // BOTH ARE GREEN, AND THAT IS A COLOUR-CHANNEL DECISION rather than a preference: AMBER IS
          // THE HILL SPHERE'S (`rgba(255, 232, 130, …)` further down), and the collinear zones used to
          // be amber too — which read as a Hill sphere, especially at L1/L2 where they genuinely sit
          // ON the Hill boundary and overlap it. Green now means "Lagrange" across all five. The two
          // kinds stay distinguishable within that: triangular zones are a saturated green and filled
          // (a body can sit there for free), collinear zones a cooler teal and fainter (nothing is
          // held there — a station-keeping envelope, not a trap).
          for (const area of lagrangeAreas) {
              const tri = isTriangularPoint(area.point);
              ctx.beginPath();
              ctx.moveTo(area.poly[0].x - renderPan.x, area.poly[0].y - renderPan.y);
              for (let i = 1; i < area.poly.length; i++) ctx.lineTo(area.poly[i].x - renderPan.x, area.poly[i].y - renderPan.y);
              ctx.closePath();
              ctx.fillStyle = tri ? 'rgba(0, 200, 100, 0.16)' : 'rgba(60, 205, 165, 0.075)';
              ctx.fill();
              ctx.lineWidth = 1 / zoom;
              ctx.strokeStyle = tri ? 'rgba(0, 200, 100, 0.35)' : 'rgba(60, 205, 165, 0.32)';
              ctx.stroke();
          }
      }
      if (showLPoints && lagrangePoints) {
          const crossSize = 5 / zoom; ctx.lineWidth = 1.5 / zoom;
          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0]; const isStable = isTriangularPoint(name);
              if (toytownFactor > 0 && !isStable) continue;
              const sel = lagrangeIsSelected(key);
              ctx.strokeStyle = sel
                  ? (isStable ? 'green' : '#888')
                  : (isStable ? 'rgba(0, 128, 0, 0.30)' : 'rgba(136, 136, 136, 0.25)');
              ctx.beginPath();
              const rx = pos.x - renderPan.x; const ry = pos.y - renderPan.y;
              ctx.moveTo(rx - crossSize, ry); ctx.lineTo(rx + crossSize, ry);
              ctx.moveTo(rx, ry - crossSize); ctx.lineTo(rx, ry + crossSize);
              ctx.stroke();
          }
      }
      for (const node of system.nodes) {
          const pos = getConstructDisplayPosition(node) || scaledWorldPositions.get(node.id);
          if (!pos) continue;
          const rx = pos.x - renderPan.x; const ry = pos.y - renderPan.y;
          if (node.kind === 'barycenter') {
              ctx.strokeStyle = '#888'; ctx.lineWidth = 1 / zoom;
              ctx.beginPath(); ctx.moveTo(rx - 10 / zoom, ry); ctx.lineTo(rx + 10 / zoom, ry);
              ctx.moveTo(rx, ry - 10 / zoom); ctx.lineTo(rx, ry + 10 / zoom);
              ctx.stroke();
          } else if (node.kind === 'construct') {
              if (isMegaRadial(node)) drawTetherRadial(ctx, node as any, pos, renderPan, zoom);
              drawConstructGlyph(ctx, node as CelestialBody, rx, ry, 8 / zoom);
          }
      }
      const trueColorOn = get(trueColorMode);
      // Primary star (most massive) world position — drives the day/night terminator on bodies.
      const primaryStarNode = system.nodes
          .filter((n) => n.kind === 'body' && (n as any).roleHint === 'star')
          .sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0))[0];
      const primaryStarPos = primaryStarNode ? scaledWorldPositions.get(primaryStarNode.id) : null;

      for (const node of system.nodes) {
          const pos = scaledWorldPositions.get(node.id);
          if (!pos || node.kind !== 'body') continue;
          if (node.roleHint === 'ring' || node.roleHint === 'belt') continue;
          const rx = pos.x - renderPan.x; const ry = pos.y - renderPan.y;
          const finalRadius = drawnDiscRadiusWorld(node, zoom);   // the one disc law

          // This body's geometry in SCREEN pixels — shared by the overlay promotion and the cull below.
          const sR = finalRadius * zoom;
          const sx = rx * zoom + width / 2, sy = ry * zoom + height / 2;

          // Promote a big-on-screen planet/moon to a PlanetDisc SVG overlay (true-colour only) so it
          // renders exactly like The Guide. Skip the canvas disc/effects for it — the overlay owns it.
          if (trueColorOn && (node.roleHint === 'planet' || node.roleHint === 'moon')
              && (node as any).apparentColor && sR >= DISC_OVERLAY_MIN_R) {
              // Only overlay bodies actually on screen, so the off-canvas giants can't steal the cap.
              if (sx + sR >= 0 && sx - sR <= width && sy + sR >= 0 && sy - sR <= height) {
                  const la = primaryStarPos ? Math.atan2(primaryStarPos.y - pos.y, primaryStarPos.x - pos.x) : null;
                  nextOverlays.push({ id: node.id, body: node as CelestialBody, x: sx, y: sy, scale: sR / (0.3 * DISC_OVERLAY_REF), lightAngle: la });
                  continue;
              }
          }

          // OFF-SCREEN CULL — the fix for the stutter when zooming back out from a station or a close
          // moon. Since any on-screen disc above DISC_OVERLAY_MIN_R is handled by the SVG overlay above,
          // everything reaching the canvas path below is either a few pixels across or COMPLETELY off
          // screen. The off-screen ones were not free: at that zoom a neighbouring planet's radius runs
          // to millions of pixels, and the canvas path still built a clip path that size and set up a
          // scaled blit into it before anything got clipped away. Skipping them outright costs nothing
          // visible. Stars throw a halo out to ~6.4 radii, so cull on the glow-inclusive box, and keep a
          // margin so nothing pops at the edge.
          const cullR = (node.roleHint === 'star' ? sR * 7 : sR) + 64;
          if (sx + cullR < 0 || sx - cullR > width || sy + cullR < 0 || sy - cullR > height) continue;

          // #5 Star glow — a soft additive halo behind the disc. A very active (flaring) star
          // throws a bigger, brighter halo; a feeding (active) black hole gets one too, in the
          // hot-orange of its accretion disc (quiescent holes stay dark).
          const isBlackHole = node.classes?.some((c) => c.includes('BH'));
          const isActiveBH = node.classes?.includes('star/BH_active');
          // Black-hole material infall (Eddington fraction, ~0..1+) drives the accretion look: more
          // feeding → a bigger, brighter, hotter disc + halo. Quiescent holes stay dark.
          const accRate = isActiveBH ? Math.max(0, Math.min(1.3, (node as any).accretionEddington ?? 0.5)) : 0;
          if (node.roleHint === 'star' && (!isBlackHole || isActiveBH)) {
              // 0..1 activity: stellar flare level for stars, the infall rate for a feeding hole.
              const activity = isActiveBH ? Math.min(1, 0.25 + accRate) : Math.max(0, Math.min(1, (node as any).flareActivity ?? 0));
              const glowR = finalRadius * (3.4 + activity * 3.0);
              // Feeding hole: disc colour warms from orange toward yellow-white as infall climbs.
              const col = isActiveBH ? `255,${Math.round(150 + accRate * 70)},${Math.round(40 + accRate * 110)}` : hexToRgbTriplet(getNodeColor(node));
              const core = 0.5 + activity * 0.4;   // brighter core when active
              const mid = 0.16 + activity * 0.22;
              const grad = ctx.createRadialGradient(rx, ry, finalRadius * 0.5, rx, ry, glowR);
              grad.addColorStop(0, `rgba(${col},${core})`);
              grad.addColorStop(0.35, `rgba(${col},${mid})`);
              grad.addColorStop(1, `rgba(${col},0)`);
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.beginPath(); ctx.arc(rx, ry, glowR, 0, 2 * Math.PI); ctx.fillStyle = grad; ctx.fill();
              ctx.restore();
          }

          // Draw the body as its actual (oblate) shape — a fast rotator is flattened along its poles.
          const ryRadius = finalRadius * oblatePolarFactor((node as CelestialBody).oblateness);
          ctx.beginPath();
          ctx.ellipse(rx, ry, finalRadius, ryRadius, 0, 0, 2 * Math.PI);

          // Custom Rendering for Black Holes
          if (node.classes?.includes('star/BH_active')) {
              ctx.fillStyle = '#000000';
              ctx.fill();
              // Accretion disc: thickens with the infall rate, and heats orange → yellow-white.
              ctx.lineWidth = Math.max(1.5 / zoom, finalRadius * (0.12 + accRate * 0.4));
              ctx.strokeStyle = accRate > 0.75 ? '#ffe0a0' : '#ffaa00';
              ctx.stroke();
          } else if (node.classes?.includes('star/BH')) {
              ctx.fillStyle = '#000000';
              ctx.fill();
              ctx.lineWidth = 1 / zoom;
              ctx.strokeStyle = '#444444'; // Subtle horizon visibility
              ctx.stroke();
          } else {
              // #9 Procedural disc in true-colour mode: land/ocean patches at the real coverage,
              // gas-giant banding, cloud + haze layers — once the disc is big enough to read.
              const tex = (trueColorOn && node.roleHint !== 'star' && (node as any).apparentColor && finalRadius * zoom > 5)
                  ? getPlanetTexture(node as CelestialBody)
                  : null;
              if (tex) {
                  ctx.save();
                  ctx.beginPath(); ctx.ellipse(rx, ry, finalRadius, ryRadius, 0, 0, 2 * Math.PI); ctx.clip();
                  ctx.drawImage(tex, rx - finalRadius, ry - ryRadius, finalRadius * 2, ryRadius * 2);
                  ctx.restore();
              } else {
                  ctx.fillStyle = getNodeColor(node);
                  ctx.fill();
              }
          }

          // Night side + magma are drawn in SCREEN space (identity transform). Canvas gradients
          // baked over the orrery's tiny world-space extents (~1e-5 AU under a huge zoom) collapse
          // to a single colour in the browser, so the terminator/lava silently vanished when zoomed
          // in. In device pixels they render correctly. Screen mapping: s = world·zoom + halfScreen.
          // (sx / sy / sR are computed once at the top of the loop — the overlay promotion and the
          // off-screen cull need the same numbers.)

          // #10 Night side — shade the hemisphere facing away from the primary star (skip stars/BH;
          // only when the disc is big enough on screen to read). A TIDALLY LOCKED world has a fixed,
          // pronounced terminator: a sharp, dark day/night divide (no rotation to even it out).
          if (node.roleHint !== 'star' && primaryStarPos && sR > 3) {
              const dx = primaryStarPos.x - pos.x, dy = primaryStarPos.y - pos.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len; // unit vector toward the star (screen Y not flipped)
              // A SHARP TERMINATOR NEEDS A PERMANENT FACE, which is `starTidallyLocked` and not the
              // despin boolean (inbox B69): a moon locked to its PLANET and a planet in a spin-orbit
              // RESONANCE both turn relative to the star, so both even their day/night out.
              const locked = !!(node as CelestialBody).starTidallyLocked;
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.beginPath(); ctx.arc(sx, sy, sR, 0, 2 * Math.PI); ctx.clip();
              const g = ctx.createLinearGradient(sx + ux * sR, sy + uy * sR, sx - ux * sR, sy - uy * sR);
              if (locked) {
                  g.addColorStop(0, 'rgba(0,0,0,0)');
                  g.addColorStop(0.48, 'rgba(0,0,0,0)');
                  g.addColorStop(0.6, 'rgba(0,0,0,0.45)');
                  g.addColorStop(1, 'rgba(0,0,0,0.6)');
              } else {
                  g.addColorStop(0, 'rgba(0,0,0,0)');
                  g.addColorStop(0.5, 'rgba(0,0,0,0.04)');
                  g.addColorStop(1, 'rgba(0,0,0,0.6)');
              }
              ctx.fillStyle = g;
              ctx.beginPath(); ctx.arc(sx, sy, sR, 0, 2 * Math.PI); ctx.fill();
              ctx.restore();
          }

          // Tidal volcanism — magma patches (Io). Tidal flexing dissipates strongest at low
          // latitudes, so the hotspots cluster in an EQUATORIAL band (with scatter). Opaque core +
          // additive bloom; placement seeded by the node id so it's stable frame-to-frame.
          if (node.roleHint !== 'star' && sR > 4) {
              const keys = (node.tags || []).map((t) => t.key);
              const lava = keys.includes('tidal/lava-flows');
              const volc = lava || keys.includes('tidal/volcanism') || keys.includes('tidal/hotspots');
              if (volc) {
                  const n = lava ? 8 : keys.includes('tidal/volcanism') ? 6 : 4;
                  const core = lava ? '255,244,200' : '255,210,120';  // white-hot vs incandescent orange
                  const mid  = lava ? '255,120,20'  : '220,70,18';    // molten orange / red
                  const mkRnd = () => { let s = 0; for (let k = 0; k < node.id.length; k++) s = (s * 31 + node.id.charCodeAt(k)) & 0xffffff; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
                  let rnd = mkRnd();
                  ctx.save();
                  ctx.setTransform(1, 0, 0, 1, 0, 0);
                  ctx.beginPath(); ctx.arc(sx, sy, sR, 0, 2 * Math.PI); ctx.clip();
                  for (let p = 0; p < n; p++) {
                      const lat = (rnd() * 2 - 1); const latEq = lat * lat * lat * 0.62; // dense near the equator
                      const lon = rnd() * 2 - 1;
                      const py = sy + latEq * sR;
                      const px = sx + lon * sR * 0.82 * Math.sqrt(Math.max(0, 1 - latEq * latEq));
                      const pr = sR * (0.08 + rnd() * 0.12);
                      const mg = ctx.createRadialGradient(px, py, 0, px, py, pr);
                      mg.addColorStop(0, `rgba(${core},0.98)`);
                      mg.addColorStop(0.4, `rgba(${mid},0.9)`);
                      mg.addColorStop(1, `rgba(${mid},0)`);
                      ctx.fillStyle = mg;
                      ctx.beginPath(); ctx.arc(px, py, pr, 0, 2 * Math.PI); ctx.fill();
                  }
                  ctx.globalCompositeOperation = 'lighter';
                  rnd = mkRnd(); // same placement → bloom sits over the patches
                  for (let p = 0; p < Math.ceil(n / 2); p++) {
                      const lat = (rnd() * 2 - 1); const latEq = lat * lat * lat * 0.62;
                      const lon = rnd() * 2 - 1;
                      const py = sy + latEq * sR;
                      const px = sx + lon * sR * 0.82 * Math.sqrt(Math.max(0, 1 - latEq * latEq));
                      const pr = sR * 0.22;
                      const bg = ctx.createRadialGradient(px, py, 0, px, py, pr);
                      bg.addColorStop(0, `rgba(${core},0.5)`);
                      bg.addColorStop(1, `rgba(${mid},0)`);
                      ctx.fillStyle = bg;
                      ctx.beginPath(); ctx.arc(px, py, pr, 0, 2 * Math.PI); ctx.fill();
                  }
                  ctx.restore();
              }
          }
      }
      // Publish this frame's PlanetDisc overlays (biggest first, capped) for the SVG layer to render.
      discOverlays = nextOverlays.length > DISC_OVERLAY_CAP
          ? [...nextOverlays].sort((a, b) => b.scale - a.scale).slice(0, DISC_OVERLAY_CAP)
          : nextOverlays;

      // Hill spheres — each planet-mass body's gravitational bubble, and EXACTLY the boundary the adrift
      // coast physics hands over at (same helper, so the drawn circle can't disagree with the handoff).
      // Solid light yellow + faint fill — dashed strokes over AU-scale circles make the canvas grind.
      // G44: WHOSE Hill spheres are drawn — the selected body's NEIGHBOURHOOD, one level in each
      // direction: itself, its parent, its siblings, and its children (owner, 2026-08-26: "someone
      // may pick earth and pop a construct around Luna - so seeing 1 down makes sense and all
      // parents and siblings - to cover weird moon of a moon rocks"). Selecting a PLANET is
      // therefore unchanged in practice — its siblings are the other planets, its parent the star —
      // while selecting a moon narrows to that moon's own neighbourhood instead of every bubble in
      // the system. No selection at all = draw everything, as before.
      // The REGION OF INTEREST is hoisted to a reactive value above - one shared rule for every
      // overlay that narrows by selection (owner, 2026-08-26: "stay consistent - we call this a
      // 'region of interest' selection - and reuse it where possible"). It replaced a local helper
      // here that went one level in each direction; the rule is now self + ALL ancestors + siblings
      // + ALL descendants, and a circumbinary body falls out of the sibling clause with no case of
      // its own.
      // Radial Box-Cox compression for a circle drawn around a node in Toytown: span it between its
      // scaled inner/outer radial extent and take the mean (the mode is stylised; exactness lives in
      // Real scale). Shared by the Hill bubbles and the circumbinary annulus so the two cannot drift.
      const drawnRadiusAu = (nodeId: string, rAu: number): number => {
          if (!(toytownFactor > 0)) return rAu;
          const world = worldPositions.get(nodeId);
          const d = world ? Math.hypot(world.x, world.y) : 0;
          const outer = scaleBoxCox(d + rAu, toytownFactor, x0_distance);
          const inner = scaleBoxCox(Math.max(0, d - rAu), toytownFactor, x0_distance);
          return Math.max(0, (outer - inner) / 2);
      };
      if (showHillSpheres && system) {
          for (const h of hillSpheresAu(system)) {
              if (!inRegionOfInterest(roi, h.id)) continue;
              const pos = toytownFactor > 0 ? scaledWorldPositions.get(h.id) : worldPositions.get(h.id);
              if (!pos) continue;
              const r = drawnRadiusAu(h.id, h.rAu);
              if (!(r > 0)) continue;
              ctx.beginPath();
              ctx.arc(pos.x - renderPan.x, pos.y - renderPan.y, r, 0, 2 * Math.PI);
              // Planets: shaded bubble. Stars: an unshaded line only (the "[Star] Hill Limit" — labelled in
              // screen space below), so a huge star limit doesn't wash the whole canvas in fill.
              if (!h.isStar) {
                  ctx.fillStyle = 'rgba(255, 232, 130, 0.06)';
                  ctx.fill();
              }
              ctx.strokeStyle = 'rgba(255, 232, 130, 0.38)';
              ctx.lineWidth = 1 / zoom;
              ctx.stroke();
          }
      }
      // THE CIRCUMBINARY ANNULUS (G45) — the ring a P-type body can live in around a pair.
      // COLOUR: the SAME FAMILY as the Hill sphere, one step deeper (owner, 2026-08-26: "the
      // circumbinary shading should be aligned - slightly different but same family of colours as
      // hill spheres... maybe yellow and deep yellow"). Hill is pale yellow 255,232,130; this is
      // deep gold 255,184,46. They read as two kinds of the same thing, which is what they are —
      // both answer "where can something orbit" — while Lagrange keeps the separate green channel
      // because it answers a different question. A third HUE said "unrelated", which was wrong.
      //
      // BOTH EDGES ARE READ FROM `bary.circumbinary`, NEVER RECOMPUTED HERE. The physics pass
      // publishes them (engine-map PHY-30) and the inner edge is a Holman & Wiegert fit this file has
      // no business restating. The outer edge is ABSENT for a root pair — nothing outside it to strip
      // it — and that is drawn as an open ring: inner stroke only, no outer wall and no fill, because
      // filling to an invented radius would draw a boundary the physics has not claimed.
      if (showHillSpheres && system) {
          circumbinaryAreas = [];
          for (const node of system.nodes) {
              if (node.kind !== 'barycenter') continue;
              const cb = (node as any).circumbinary;
              if (!cb || !(cb.innerAU > 0)) continue;
              if (!inRegionOfInterest(roi, node.id)) continue;
              const pos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
              if (!pos) continue;
              const rIn = drawnRadiusAu(node.id, cb.innerAU);
              const rOut = cb.outerAU > 0 ? drawnRadiusAu(node.id, cb.outerAU) : 0;
              if (!(rIn > 0)) continue;
              const cx = pos.x - renderPan.x, cy = pos.y - renderPan.y;
              // The ring itself: outer disc minus inner disc, drawn as one even-odd path so the hole
              // is a real hole rather than a second fill over the top.
              if (rOut > rIn) {
                  ctx.beginPath();
                  ctx.arc(cx, cy, rOut, 0, 2 * Math.PI);
                  ctx.arc(cx, cy, rIn, 0, 2 * Math.PI, true);
                  ctx.fillStyle = 'rgba(255, 184, 46, 0.07)';
                  ctx.fill();
              }
              ctx.strokeStyle = 'rgba(255, 184, 46, 0.55)';
              ctx.lineWidth = 1 / zoom;
              ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, 2 * Math.PI); ctx.stroke();
              if (rOut > rIn) { ctx.beginPath(); ctx.arc(cx, cy, rOut, 0, 2 * Math.PI); ctx.stroke(); }
              // Published for the right-click hit test, in the SAME frame's drawn radii, so the
              // clickable ring is exactly the visible one (the rule G43 set for the L-zones).
              circumbinaryAreas.push({
                  baryId: node.id, baryName: node.name ?? 'the pair',
                  cx: pos.x, cy: pos.y, rInner: rIn, rOuter: rOut > rIn ? rOut : Infinity
              });
          }
      }
      // Trip lines for each ship's current + NEXT journey only — enough to show who's going where without
      // a spider-web of the whole committed route (an autopilot ship may have many legs queued). Skip finished
      // trips. Drawn in burn colours (green accel / yellow coast / red brake): the ACTIVE leg bright, the next
      // one faded — brightness reads as now-vs-later, colour as where it burns. Planning lines draw on top.
      if (system) {
          for (const node of system.nodes) {
              if (node.kind !== 'construct') continue;
              const live = ((node as any).scheduled_journeys || [])
                  .filter((l: any) => l.status !== 'cancelled')
                  .map((l: any) => ({ l, b: getJourneyBounds(l.plans) }))
                  .filter((x: any) => x.b && currentTime <= x.b.endMs)     // not finished
                  .sort((a: any, b: any) => a.b.startMs - b.b.startMs);
              live.slice(0, 2).forEach((x: any, idx: number) => { // [0] = active/earliest, [1] = the next one
                  for (const plan of x.l.plans) drawTransitPlan(ctx, plan, false, idx === 0 ? 0.55 : 0.18, false, true);
              });
          }
      }
      // Predicted coast path for drifting/stopped ships — the conic they're about to follow (fall to the
      // star / ellipse / hyperbola). SOLID faint line (a dash over a path that can span billions of metres
      // makes the canvas compute a zillion dash segments → frame death). The 40-step integration is cached
      // per ship+clock so panning/zooming doesn't re-run it every frame.
      if (system) {
          for (const node of system.nodes) {
              if (node.kind !== 'construct' || !(node as any).vector_position_au || !isCoastingNow(node as any)) continue;
              const vp = (node as any).vector_position_au, vel = (node as any).vector_velocity_ms ?? { x: 0, y: 0 };
              const key = `${currentTime}|${vp.x},${vp.y}|${vel.x},${vel.y}`;
              let cached = coastPathCache.get(node.id);
              if (!cached || cached.key !== key) {
                  cached = { key, pts: coastPathUnderGravity(system, vp, vel, currentTime, 64) };
                  coastPathCache.set(node.id, cached);
              }
              const pts = cached.pts;
              if (pts.length < 2) continue;
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(255, 150, 50, 0.55)'; // ORANGE = uncontrolled coast (adrift), vs red = powered braking
              ctx.lineWidth = 1.4 / zoom;
              for (let i = 0; i < pts.length; i++) {
                  let p = pts[i];
                  if (toytownFactor > 0) {
                      const rr = Math.sqrt(p.x * p.x + p.y * p.y);
                      const rn = scaleBoxCox(rr, toytownFactor, x0_distance);
                      const ang = Math.atan2(p.y, p.x);
                      p = { x: rn * Math.cos(ang), y: rn * Math.sin(ang) };
                  }
                  if (i === 0) ctx.moveTo(p.x - renderPan.x, p.y - renderPan.y);
                  else ctx.lineTo(p.x - renderPan.x, p.y - renderPan.y);
              }
              ctx.stroke();
          }
      }
      if (completedPlans && completedPlans.length > 0) {
          for (const plan of completedPlans) drawTransitPlan(ctx, plan, true, isExecuting ? 0.2 : undefined, isExecuting);
      }
      if (!isExecuting && alternativePlans && alternativePlans.length > 0) {
          for (const plan of alternativePlans) drawTransitPlan(ctx, plan, false, 0.4);
      }
      if (transitPlan) drawTransitPlan(ctx, transitPlan, false, isExecuting ? 0.3 : undefined, isExecuting);
      if (transitPreviewPos) drawShipMarker(ctx, transitPreviewPos);
      ctx.restore();

      if (showZones) drawStellarZonesOverlay(ctx, width, height);
      
      // Draw Sensor Labels (Screen Space Overlay)
      if (focusedBodyId) {
          const node = system.nodes.find(n => n.id === focusedBodyId);
          if (node && node.kind === 'construct' && (node as CelestialBody).sensors && (showSensors || (node as any).sensors_active === true)) {
              const pos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
              if (pos) {
                  const screenPos = worldToScreen(pos.x, pos.y);
                  ctx.font = `12px sans-serif`;
                  ctx.textAlign = 'left';
                  ctx.lineWidth = 4;
                  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                  ctx.lineJoin = 'round';
                  
                  for (const sensor of (node as CelestialBody).sensors!) {
                      let rangeAU = sensor.range_km / AU_KM;
                      if (toytownFactor > 0) rangeAU = scaleBoxCox(rangeAU, toytownFactor, x0_distance);
                      
                      const screenRadius = rangeAU * zoom;
                      const tx = screenPos.x + screenRadius + 5;
                      const ty = screenPos.y;
                      
                      // Skip if label is way off screen
                      if (tx < -200 || tx > canvas.width + 200) continue;

                      ctx.strokeText(sensor.name, tx, ty);
                      ctx.fillStyle = 'rgba(136, 204, 255, 1)';
                      ctx.fillText(sensor.name, tx, ty);
                  }
              }
          }
      }
      
      // --- Foreground overlay: constructs, vectors, ruler and ALL labels draw on the overlay
      //     canvas (fgCtx) so they sit ABOVE the PlanetDisc overlays (which are an HTML layer over
      //     the base canvas). We're already in screen space (transform restored above) and fgCtx is
      //     a fresh identity-transform canvas, so worldToScreen coords match. Falls back to the base
      //     canvas if the overlay isn't ready yet. `ctx` is re-bound for this block only. ---
      {
      const ctx = fgCtx ?? baseCtx;
      // Draw Constructs and Barycenters (Screen Space Overlay)
      for (const node of system.nodes) {
          const pos = getConstructDisplayPosition(node) || scaledWorldPositions.get(node.id);
          if (!pos) continue;
          if (node.kind === 'barycenter' || node.kind === 'construct') {
              const screenPos = worldToScreen(pos.x, pos.y);
              if (screenPos.x < -20 || screenPos.x > width + 20 || screenPos.y < -20 || screenPos.y > height + 20) continue;
              if (node.kind === 'barycenter') {
                  ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
                  ctx.beginPath(); ctx.moveTo(screenPos.x - 5, screenPos.y); ctx.lineTo(screenPos.x + 5, screenPos.y);
                  ctx.moveTo(screenPos.x, screenPos.y - 5); ctx.lineTo(screenPos.x, screenPos.y + 5);
                  ctx.stroke();
              } else if (node.kind === 'construct') {
                  drawConstructGlyph(ctx, node as CelestialBody, screenPos.x, screenPos.y, 8);
              }
          }
      }
      if (showVectors) {
          drawConstructKinematicVectors(ctx);
      }

      if (toytownFactor === 0) drawScaleBar(ctx);
      if (rulerActive) drawRuler(ctx);
      if (showNames) {
          beltLabelClickAreas.clear();
          const visibleLabelIds = getVisibleNodeIds(system, focusedBodyId);
          ctx.font = `12px sans-serif`;
          ctx.lineWidth = 4; // Bolder outline
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.lineJoin = 'round';


          // One painter for both marker shapes. Canvas rather than DOM because it draws on the same overlay
          // as every other label and must not fight the pan/zoom transform.
          function drawMarkers(
              ctx: CanvasRenderingContext2D,
              markers: HighlightMarker[],
              x: number, y: number, discRadiusPx: number
          ) {
              if (!markers.length) return;
              const { shown, overflow } = capMarkers(markers);

              // RINGS first, nested outward, so a label drawn after sits on top of them.
              let ringR = Math.max(discRadiusPx, 3) + 3;
              for (const m of shown) {
                  if (m.style !== 'ring' && m.style !== 'both') continue;
                  ctx.beginPath();
                  ctx.arc(x, y, ringR, 0, Math.PI * 2);
                  ctx.strokeStyle = m.color;
                  ctx.lineWidth = 2;
                  ctx.stroke();
                  ringR += 4;                       // 2px stroke + 2px gap
              }

              // PILLS fan to the right of the body, stacked downward — a stable order, so a body's badges
              // do not reshuffle between frames. Shape comes from tagPill: this is the SAME object as
              // the chip in the Tags panel, drawn at map size, not a canvas lookalike of it.
              const pills = shown.filter((m) => m.style !== 'ring');
              if (!pills.length && !overflow) return;
              const prevFont = ctx.font;
              const prevAlign = ctx.textAlign;
              const prevBaseline = ctx.textBaseline;
              const pm = tagPillMetrics(MARKER_PILL_FONT_PX);
              let py = y + pm.height / 2 + 2;
              const px = x + Math.max(discRadiusPx, 3) + 5;
              for (const m of pills) {
                  drawTagPill(ctx, tagPillText(m), px, py, pm, m.color, m.textColor);
                  py += pm.rowStep;
              }
              if (overflow) {
                  drawTagPill(ctx, `+${overflow}`, px, py, pm, TAG_PILL_OVERFLOW_BG, TAG_PILL_OVERFLOW_FG);
              }
              ctx.font = prevFont;
              ctx.textAlign = prevAlign;
              ctx.textBaseline = prevBaseline;
          }

          // Draw labels child → parent (deepest hierarchy depth first) so a parent's label paints LAST
          // and sits on TOP of its satellites' labels in a crowded cluster — the parent is the most
          // important / most likely to be clicked.
          const labelNodeById = new Map(system.nodes.map((n) => [n.id, n]));
          const labelDepthCache = new Map<string, number>();
          const labelDepth = (n: any): number => {
              if (labelDepthCache.has(n.id)) return labelDepthCache.get(n.id)!;
              let d = 0, cur = n, guard = 0;
              while (cur?.parentId && guard++ < 32) { const p = labelNodeById.get(cur.parentId); if (!p) break; d++; cur = p; }
              labelDepthCache.set(n.id, d); return d;
          };
          const labelOrder = [...system.nodes].sort((a, b) => labelDepth(b) - labelDepth(a));

          for (const node of labelOrder) {
              if (!visibleLabelIds.has(node.id) || node.kind !== 'body') continue;
              if (node.roleHint === 'belt' && node.orbit && node.parentId) {
                  const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
                  if (!parentPos) continue;
                  let a = node.orbit.elements.a_AU; const e = node.orbit.elements.e;
                  if (toytownFactor > 0) a = scaleBoxCox(a, toytownFactor, x0_distance);
                  const apoapsisX = parentPos.x - (a * (1 + e)); const apoapsisY = parentPos.y;
                  const screenPos = worldToScreen(apoapsisX, apoapsisY);
                  ctx.textAlign = 'center';
                  
                  ctx.strokeText(node.name, screenPos.x, screenPos.y - 10);
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; 
                  ctx.fillText(node.name, screenPos.x, screenPos.y - 10);
                  
                  const textMetrics = ctx.measureText(node.name); const padding = 5;
                  const x1 = screenPos.x - (textMetrics.width / 2) - padding;
                  const y1 = screenPos.y - 20 - padding;
                  const x2 = screenPos.x + (textMetrics.width / 2) + padding;
                  const y2 = screenPos.y + padding;
                  beltLabelClickAreas.set(node.id, { x1, y1, x2, y2 });
              } else if (node.roleHint !== 'ring' && node.roleHint !== 'belt') {
                  const worldPos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
                  if (!worldPos) continue;
                  const screenPos = worldToScreen(worldPos.x, worldPos.y);
                  let radiusPx = 2;
                  if (node.roleHint === 'star') radiusPx = 4;
                  else if (node.roleHint === 'planet') { const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant')); radiusPx = isGasGiant ? 3 : 2; }
                  else if (node.roleHint === 'moon') radiusPx = 1;
                  ctx.textAlign = 'left'; 
                  
                  const tx = screenPos.x + radiusPx + 5;
                  const ty = screenPos.y;

                  ctx.strokeText(node.name, tx, ty);
                  if (node.classes?.includes('star/BH') || node.classes?.includes('star/BH_active')) {
                      ctx.fillStyle = '#ffffff';
                  } else {
                      ctx.fillStyle = getNodeColor(node);
                  }
                  ctx.fillText(node.name, tx, ty);
                  drawMarkers(ctx, markersFor(node.tags, activeHighlights, $tagCategories),
                              screenPos.x, screenPos.y, radiusPx);
              }
          }
          for (const node of system.nodes) {
              if (!visibleLabelIds.has(node.id) || node.kind !== 'construct') continue;
              const worldPos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
              if (!worldPos) continue;
              const screenPos = worldToScreen(worldPos.x, worldPos.y);
              const size = 8;
              ctx.textAlign = 'left'; 
              
              const tx = screenPos.x + size / 2 + 5;
              const ty = screenPos.y;

              ctx.strokeText(node.name, tx, ty);
              ctx.fillStyle = node.icon_color || '#f0f0f0'; 
              ctx.fillText(node.name, tx, ty);
              drawMarkers(ctx, markersFor((node as any).tags, activeHighlights, $tagCategories),
                          screenPos.x, screenPos.y, size / 2);
          }
      }
      if (showZones && stellarZones.size > 0) {
          const zoneLabels = [
              { key: 'rocheLimit', name: 'Roche Limit', color: tokenRgba('--zone-roche', '#b40000', 0.8) },
              { key: 'silicateLine', name: 'Rock Line', color: tokenRgba('--zone-rock-line', '#a52a2a', 0.8) },
              { key: 'sootLine', name: 'Soot Line', color: tokenRgba('--zone-soot-line', '#696969', 0.8) },
              { key: 'goldilocksInner', name: 'Habitable Zone', color: tokenRgba('--zone-habitable', '#00ff00', 0.8) },
              { key: 'formationFrostLine', name: 'Frost Line (Form.)', color: tokenRgba('--zone-frost-line', '#add8e6', 0.8) },
              { key: 'currentFrostLine', name: 'Frost Line (Curr.)', color: tokenRgba('--zone-frost-line', '#add8e6', 0.8) },
              { key: 'co2IceLine', name: 'CO2 Ice Line', color: tokenRgba('--zone-co2-ice', '#ffffff', 0.8) },
              { key: 'coIceLine', name: 'CO Ice Line', color: tokenRgba('--zone-co-ice', '#0000ff', 0.8) }
          ];
          ctx.font = `12px sans-serif`; ctx.textAlign = 'center';
          for (const [starId, zones] of stellarZones) {
              const starNode = system.nodes.find(n => n.id === starId) as CelestialBody;
              const starPos = toytownFactor > 0 ? scaledWorldPositions.get(starId) : worldPositions.get(starId);
              if (starPos && zones) {
                  for (const label of zoneLabels) {
                      let radius = 0;
                      if (label.key === 'goldilocksInner') radius = zones.goldilocks.inner;
                      else if (label.key === 'rocheLimit') { if (starNode) radius = calculateRocheLimit(starNode); }
                      else radius = zones[label.key];
                      if (radius > 0) {
                          let scaledRadius = radius;
                          if (toytownFactor > 0) scaledRadius = scaleBoxCox(radius, toytownFactor, x0_distance);
                          const screenPos = worldToScreen(starPos.x, starPos.y - scaledRadius);
                          if (screenPos.x < -80 || screenPos.x > width + 80 || screenPos.y < -40 || screenPos.y > height + 40) continue;
                          ctx.fillStyle = label.color; ctx.fillText(label.name, screenPos.x, screenPos.y - 5);
                      }
                  }
              }
          }
      }
      // Hill-limit labels — "[Star] Hill Limit" at the top of each star's Hill circle (frost-line style).
      if (showHillSpheres && system) {
          ctx.font = `12px sans-serif`; ctx.textAlign = 'center';
          for (const h of hillSpheresAu(system)) {
              if (!inRegionOfInterest(roi, h.id)) continue;
              if (!h.isStar) continue;
              const world = worldPositions.get(h.id);
              const pos = toytownFactor > 0 ? scaledWorldPositions.get(h.id) : world;
              if (!pos || !world) continue;
              const d = Math.hypot(world.x, world.y);
              const topR = toytownFactor > 0
                  ? Math.max(0, (scaleBoxCox(d + h.rAu, toytownFactor, x0_distance) - scaleBoxCox(Math.max(0, d - h.rAu), toytownFactor, x0_distance)) / 2)
                  : h.rAu;
              const screenPos = worldToScreen(pos.x, pos.y - topR);
              if (screenPos.x < -120 || screenPos.x > width + 120 || screenPos.y < -40 || screenPos.y > height + 40) continue;
              ctx.fillStyle = 'rgba(255, 232, 130, 0.9)';
              ctx.fillText(`${h.name} Hill Limit`, screenPos.x, screenPos.y - 5);
          }
      }
      if (showLPoints && lagrangePoints) {
          const crossSize = 5 / zoom; ctx.lineWidth = 1.5 / zoom;
          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0]; const isStable = isTriangularPoint(name);
              if (toytownFactor > 0 && !isStable) continue;
              const sel = lagrangeIsSelected(key);
              ctx.fillStyle = sel
                  ? (isStable ? 'green' : '#888')
                  : (isStable ? 'rgba(0, 128, 0, 0.30)' : 'rgba(136, 136, 136, 0.25)');
              const screenPos = worldToScreen(pos.x, pos.y);
              ctx.fillText(name, screenPos.x + 8, screenPos.y);
          }
      }
      } // --- end foreground overlay block ---
  }

  function drawSensorOverlay(ctx: CanvasRenderingContext2D) {
      if (!system || !zoom || !focusedBodyId) return;

      const node = system.nodes.find(n => n.id === focusedBodyId);
      if (!node || node.kind !== 'construct' || !(node as CelestialBody).sensors) return;
      // Per-ship sensors toggle drives the range rings (or the global Sensors view option).
      if (!showSensors && (node as any).sensors_active !== true) return;
      
      const pos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
      if (!pos) return;
      
      const sensors = (node as CelestialBody).sensors || [];
      const rx = pos.x - renderPan.x;
      const ry = pos.y - renderPan.y;

      for (const sensor of sensors) {
          let rangeAU = sensor.range_km / AU_KM;
          if (toytownFactor > 0) {
              rangeAU = scaleBoxCox(rangeAU, toytownFactor, x0_distance);
          }
          
          ctx.beginPath();
          ctx.arc(rx, ry, rangeAU, 0, 2 * Math.PI);
          ctx.strokeStyle = 'rgba(136, 204, 255, 0.6)'; // Light blue
          ctx.lineWidth = 1 / zoom;
          ctx.setLineDash([5 / zoom, 5 / zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
      }
  }

  function drawTravellerZones(ctx: CanvasRenderingContext2D) {
      if (!system || !zoom) return;
      
      for (const node of system.nodes) {
          if (node.kind !== 'body' || !node.radiusKm) continue;
          
          const pos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
          if (!pos) continue;
          
          let radiusAU = node.radiusKm / AU_KM;
          let jumpShadowRad = radiusAU * 200; // 100 Diameter = 200 Radius
          let mDriveRad = radiusAU * 2000;    // 1000 Diameter = 2000 Radius
          
          if (toytownFactor > 0) {
              jumpShadowRad = scaleBoxCox(jumpShadowRad, toytownFactor, x0_distance);
              mDriveRad = scaleBoxCox(mDriveRad, toytownFactor, x0_distance);
          }
          
          const rx = pos.x - renderPan.x;
          const ry = pos.y - renderPan.y;
          
          // Draw M-Drive Zone (Larger)
          ctx.beginPath();
          ctx.arc(rx, ry, mDriveRad, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();
          
          // Draw Jump Shadow (Smaller)
          ctx.beginPath();
          ctx.arc(rx, ry, jumpShadowRad, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 100, 100, 0.15)'; // Reddish shadow
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();
      }
  }

  function drawStellarZonesOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (!system || !zoom || stellarZones.size === 0) return;

    const margin = 24;
    const hugeRadiusSolidThresholdPx = Math.max(width, height) * 1.25;
    const isCircleVisible = (cx: number, cy: number, r: number) =>
      cx + r >= -margin && cx - r <= width + margin && cy + r >= -margin && cy - r <= height + margin;

    const toScreenRadius = (radiusAu: number): number => {
      if (radiusAu <= 0) return 0;
      let r = radiusAu;
      if (toytownFactor > 0) r = scaleBoxCox(r, toytownFactor, x0_distance);
      return r * zoom;
    };

    const drawZoneBand = (cx: number, cy: number, outerRadiusPx: number, innerRadiusPx: number, color: string) => {
      if (outerRadiusPx <= 0 || outerRadiusPx <= innerRadiusPx) return;
      if (!isCircleVisible(cx, cy, outerRadiusPx)) return;
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadiusPx, 0, 2 * Math.PI);
      if (innerRadiusPx > 0) {
        ctx.arc(cx, cy, innerRadiusPx, 0, 2 * Math.PI, true);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const drawZoneLine = (cx: number, cy: number, radiusPx: number, color: string) => {
      if (radiusPx <= 0) return;
      if (!isCircleVisible(cx, cy, radiusPx)) return;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      if (radiusPx > hugeRadiusSolidThresholdPx) {
        ctx.setLineDash([]);
      } else {
        ctx.setLineDash([6, 6]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    for (const [starId, zones] of stellarZones) {
      const starNode = system.nodes.find(n => n.id === starId) as CelestialBody | undefined;
      const starPos = toytownFactor > 0 ? scaledWorldPositions.get(starId) : worldPositions.get(starId);
      if (!starPos || !zones) continue;

      const screenStar = worldToScreen(starPos.x, starPos.y);
      const hzInner = toScreenRadius(zones.goldilocks?.inner || 0);
      const hzOuter = toScreenRadius(zones.goldilocks?.outer || 0);
      const kill = toScreenRadius(zones.killZone || 0);
      const danger = toScreenRadius(zones.dangerZone || 0);

      drawZoneBand(screenStar.x, screenStar.y, hzOuter, hzInner, tokenRgba('--zone-habitable', '#00ff00', 0.1));
      drawZoneBand(screenStar.x, screenStar.y, danger, kill, tokenRgba('--zone-danger', '#c86400', 0.2));
      drawZoneBand(screenStar.x, screenStar.y, kill, 0, tokenRgba('--zone-kill', '#b40000', 0.2));

      const rocheAu = starNode ? calculateRocheLimit(starNode) : 0;
      drawZoneLine(screenStar.x, screenStar.y, toScreenRadius(rocheAu), tokenRgba('--zone-roche', '#b40000', 0.5));
      drawZoneLine(screenStar.x, screenStar.y, toScreenRadius(zones.silicateLine || 0), tokenRgba('--zone-rock-line', '#a52a2a', 0.5));
      drawZoneLine(screenStar.x, screenStar.y, toScreenRadius(zones.sootLine || 0), tokenRgba('--zone-soot-line', '#696969', 0.5));

      // Dual Frost Lines
      const formationFrost = toScreenRadius(zones.formationFrostLine || 0);
      const currentFrost = toScreenRadius(zones.currentFrostLine || 0);

      // Draw Formation Frost Line (Dashed)
      if (formationFrost > 0) {
          ctx.beginPath();
          ctx.arc(screenStar.x, screenStar.y, formationFrost, 0, 2 * Math.PI);
          ctx.strokeStyle = tokenRgba('--zone-frost-line', '#add8e6', 0.5);
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
      }

      // Draw Current Frost Line (Solid/Standard dash)
      drawZoneLine(screenStar.x, screenStar.y, currentFrost, tokenRgba('--zone-frost-line', '#add8e6', 0.5));

      drawZoneLine(screenStar.x, screenStar.y, toScreenRadius(zones.co2IceLine || 0), tokenRgba('--zone-co2-ice', '#ffffff', 0.5));
      drawZoneLine(screenStar.x, screenStar.y, toScreenRadius(zones.coIceLine || 0), tokenRgba('--zone-co-ice', '#0000ff', 0.5));
    }
  }

  // Measuring tape overlay: dashed line + endpoint rings between the two picked bodies, with a
  // distance readout (AU, plus km when short) at the midpoint. Endpoints follow the bodies live.
  function drawRuler(ctx: CanvasRenderingContext2D) {
      if (!rulerA) return;
      const display = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
      const accent = '#ff9b2f';
      const ringAt = (id: string) => {
          const w = display.get(id);
          if (!w) return null;
          const s = worldToScreen(w.x, w.y);
          ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
          ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
          return s;
      };
      const sa = ringAt(rulerA.id);
      if (!sa) return;
      if (!rulerB) return;
      const sb = ringAt(rulerB.id);
      if (!sb) return;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([6, 5]);
      ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y);
      ctx.strokeStyle = accent; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.setLineDash([]);

      if (rulerDistanceAU != null) {
          const au = rulerDistanceAU;
          const label = au < 0.01
              ? formatDistanceKm(au * AU_KM, distanceFlavour(get(unitPrefs), 'planet'))
              : `${au.toFixed(au < 10 ? 3 : 2)} AU` + (au < 0.2 ? `  (${formatDistanceKm(au * AU_KM, distanceFlavour(get(unitPrefs), 'planet'))})` : '');
          const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
          ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(17, 20, 26, 0.9)';
          ctx.fillRect(mx - tw / 2 - 6, my - 20, tw + 12, 18);
          ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.strokeRect(mx - tw / 2 - 6, my - 20, tw + 12, 18);
          ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, mx, my - 11);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
  }

  function drawScaleBar(ctx: CanvasRenderingContext2D) {
      if (!canvas || !zoom) return;
      const barLengthPx = canvas.width / 3; let worldLengthAU = barLengthPx / zoom;
      let unit: string; let displayValue: number; let actualBarLengthPx: number;
      if (worldLengthAU >= 0.1) {
          unit = 'AU'; const power = Math.pow(10, Math.floor(Math.log10(worldLengthAU))); const multiples = [1, 2, 5]; let bestValue = 1;
          for (const m of multiples) { if (worldLengthAU / (m * power) >= 0.75) bestValue = m * power; }
          displayValue = bestValue; actualBarLengthPx = displayValue * zoom;
      } else {
          unit = 'km'; let worldLengthKM = worldLengthAU * AU_KM; const power = Math.pow(10, Math.floor(Math.log10(worldLengthKM))); const multiples = [1, 2, 5]; let bestValue = 1;
          for (const m of multiples) { if (worldLengthKM / (m * power) >= 0.75) bestValue = m * power; }
          displayValue = bestValue; actualBarLengthPx = (displayValue / AU_KM) * zoom;
      }
      // Bottom-RIGHT by default — the time transport pill lives bottom-left and was sitting on it.
      const margin = 20; const x = canvas.width - margin - actualBarLengthPx; const y = canvas.height - margin;
      ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + actualBarLengthPx, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.moveTo(x + actualBarLengthPx, y - 5); ctx.lineTo(x + actualBarLengthPx, y + 5); ctx.stroke();
      ctx.fillText(`${displayValue} ${unit}`, x + actualBarLengthPx / 2, y - 8);
  }

  function drawArrowScreen(
      ctx: CanvasRenderingContext2D,
      startX: number,
      startY: number,
      dirX: number,
      dirY: number,
      lengthPx: number,
      color: string
  ) {
      const mag = Math.hypot(dirX, dirY);
      if (!Number.isFinite(mag) || mag < 1e-9 || lengthPx <= 0) return;
      const ux = dirX / mag;
      const uy = dirY / mag;
      const endX = startX + ux * lengthPx;
      const endY = startY + uy * lengthPx;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const headLen = Math.max(5, Math.min(10, lengthPx * 0.25));
      const leftX = endX - ux * headLen - uy * (headLen * 0.5);
      const leftY = endY - uy * headLen + ux * (headLen * 0.5);
      const rightX = endX - ux * headLen + uy * (headLen * 0.5);
      const rightY = endY - uy * headLen - ux * (headLen * 0.5);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
  }

  function worldToDisplayPosition(worldPos: { x: number; y: number }): { x: number; y: number } {
      if (toytownFactor <= 0) return worldPos;
      const r = Math.hypot(worldPos.x, worldPos.y);
      const rNew = scaleBoxCox(r, toytownFactor, x0_distance);
      const a = Math.atan2(worldPos.y, worldPos.x);
      return { x: rNew * Math.cos(a), y: rNew * Math.sin(a) };
  }

  function getConstructDisplayPosition(node: SystemNode): { x: number; y: number } | null {
      if (node.kind !== 'construct') return null;
      if (!transitPreviewPos || node.id !== focusedBodyId) return null;
      return worldToDisplayPosition(transitPreviewPos);
  }

  function getPreviewVelocityEstimateMs(): { x: number; y: number } | null {
      if (!transitPreviewPos) return null;
      if (!lastPreviewSample) {
          lastPreviewSample = { tMs: currentTime, pos: { ...transitPreviewPos }, vel: null };
          return null;
      }
      const dt = (currentTime - lastPreviewSample.tMs) / 1000;
      const dxAu = transitPreviewPos.x - lastPreviewSample.pos.x;
      const dyAu = transitPreviewPos.y - lastPreviewSample.pos.y;
      if (dt > 0.05) {
          const vel = {
              x: (dxAu * AU_KM * 1000) / dt,
              y: (dyAu * AU_KM * 1000) / dt
          };
          lastPreviewSample = { tMs: currentTime, pos: { ...transitPreviewPos }, vel };
          return vel;
      }
      return lastPreviewSample.vel;
  }

  function computeNetGravityAccelerationMs2(
      positionAu: { x: number; y: number },
      selfId: string
  ): { x: number; y: number } {
      if (!system) return { x: 0, y: 0 };
      let ax = 0;
      let ay = 0;
      for (const node of system.nodes) {
          if (node.id === selfId) continue;
          if (node.kind !== 'body' && node.kind !== 'barycenter') continue;
          const massKg = node.kind === 'body'
              ? ((node as CelestialBody).massKg || 0)
              : ((node as Barycenter).effectiveMassKg || 0);
          if (massKg <= 0) continue;
          const sourcePos = worldPositions.get(node.id);
          if (!sourcePos) continue;
          const dxAu = sourcePos.x - positionAu.x;
          const dyAu = sourcePos.y - positionAu.y;
          const dxM = dxAu * AU_KM * 1000;
          const dyM = dyAu * AU_KM * 1000;
          const r2 = dxM * dxM + dyM * dyM;
          if (r2 < 1) continue;
          const r = Math.sqrt(r2);
          const a = (6.67430e-11 * massKg) / r2;
          ax += a * (dxM / r);
          ay += a * (dyM / r);
      }
      return { x: ax, y: ay };
  }

  function drawConstructKinematicVectors(ctx: CanvasRenderingContext2D) {
      if (!system) return;
      const previewVelMs = getPreviewVelocityEstimateMs();
      for (const node of system.nodes) {
          if (node.kind !== 'construct') continue;
          const isPreviewConstruct = !!(transitPreviewPos && node.id === focusedBodyId);
          if (!isPreviewConstruct && node.flight_state !== 'Transit' && node.flight_state !== 'Deep Space') continue;

          const overrideDisplay = getConstructDisplayPosition(node);
          const displayPos = overrideDisplay || (toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id));
          const physicalPos = (transitPreviewPos && node.id === focusedBodyId) ? transitPreviewPos : worldPositions.get(node.id);
          if (!displayPos || !physicalPos) continue;
          const screenPos = worldToScreen(displayPos.x, displayPos.y);
          if (!Number.isFinite(screenPos.x) || !Number.isFinite(screenPos.y)) continue;

          const vel = (transitPreviewPos && node.id === focusedBodyId && previewVelMs)
              ? previewVelMs
              : node.vector_velocity_ms;
          if (showVectors && vel && Number.isFinite(vel.x) && Number.isFinite(vel.y)) {
              const vMs = Math.hypot(vel.x, vel.y);
              const vLen = Math.max(14, Math.min(96, 10 + Math.log10(vMs + 1) * 14));
              drawArrowScreen(ctx, screenPos.x, screenPos.y, vel.x, vel.y, vLen, VELOCITY_VECTOR_COLOR);
          }

          if (showVectors) {
              const acc = computeNetGravityAccelerationMs2(physicalPos, node.id);
              // THE SHIP'S OWN DRIVE IS PART OF ITS ACCELERATION, and while it burns it is nearly all
              // of it: 0.3 g is 2.94 m/s2 against roughly 2.4e-4 m/s2 of solar gravity out at Jupiter,
              // four orders of magnitude. Showing gravity alone left the arrow pointing at the star
              // through the one part of a journey where the ship is being pushed somewhere else - a
              // reading that was correct for what it measured and a lie about what it was labelled
              // (the standing rule). Thrust direction comes from the segment that sized the burn; the
              // velocity fallback is for journeys committed before that was published.
              const burn = shipBurnAt(node, timeMs);
              if (burn.thrusting && burn.accelMs2 > 0) {
                  let dx = burn.thrustDir?.x, dy = burn.thrustDir?.y;
                  if (dx === undefined || dy === undefined) {
                      const m = vel ? Math.hypot(vel.x, vel.y) : 0;
                      if (m > 0) {
                          const sgn = burn.braking ? -1 : 1;
                          dx = (vel!.x / m) * sgn;
                          dy = (vel!.y / m) * sgn;
                      }
                  }
                  if (dx !== undefined && dy !== undefined) {
                      acc.x += dx * burn.accelMs2;
                      acc.y += dy * burn.accelMs2;
                  }
              }
              const aMs2 = Math.hypot(acc.x, acc.y);
              if (aMs2 > 1e-6 && Number.isFinite(aMs2)) {
                  const aLen = Math.max(10, Math.min(72, 8 + Math.log10(aMs2 * 100 + 1) * 18));
                  drawArrowScreen(ctx, screenPos.x, screenPos.y, acc.x, acc.y, aLen, ACCEL_VECTOR_COLOR);
              }
          }
      }
  }

  // colorized: keep the burn colours (green accel / yellow coast / red brake) even at a reduced alpha —
  // used for committed route lines, where brightness encodes current-vs-future but the colours still tell
  // you where the ship burns and where it coasts. Without it a reduced alpha means the flat "ghost" tint.
  function drawTransitPlan(ctx: CanvasRenderingContext2D, plan: TransitPlan, isCompleted: boolean = false, alphaOverride?: number, forceGrey: boolean = false, colorized: boolean = false) {
      if (!plan) return;
      const alpha = alphaOverride !== undefined ? alphaOverride : (isCompleted ? 0.6 : 1.0);
      const isGhost = alphaOverride !== undefined && !forceGrey && !colorized;
      // The toytown radial compression, in one place — it was written out three times in this
      // function and the terminal marker below would have made four.
      const mapPt = (p: { x: number; y: number }) => {
          if (!(toytownFactor > 0) || plan.isKinematic) return { x: p.x, y: p.y };
          const r = Math.hypot(p.x, p.y);
          const rn = scaleBoxCox(r, toytownFactor, x0_distance);
          const a = Math.atan2(p.y, p.x);
          return { x: rn * Math.cos(a), y: rn * Math.sin(a) };
      };
      // THE ORBIT-CHANGE PICTURE: initial orbit, transfer ellipse, final orbit, two burns.
      //
      // DRAWN IN THE HOST'S FRAME, which is the whole reason it reads as a manoeuvre. A ship lowering
      // its Jupiter orbit over three days is, heliocentrically, a 3.6-million-kilometre streak trailing
      // after Jupiter - because Jupiter travelled that far while the ship went round. Every other path
      // in this app is drawn that way and should be; this one must not, or the figure is a smear beside
      // two rings it never touches.
      //
      // So the whole figure is regenerated from the plan's radii and its plane against the host's
      // position NOW. That is exact rather than approximate: the map draws one instant, and at that
      // instant host-now plus host-relative IS the ship's global position, so the ship sits on the line
      // it is flying and the two circles are the orbits it is actually between.
      //
      // The flown path is still global and still what the samplers read - only the PICTURE changes
      // frame, which is the 'in its own frame' half of the principle this whole item is built on.
      let orbitChangeDrawn = false;
      if (plan.orbitChange && !forceGrey) {
          const oc = plan.orbitChange;
          const host = worldPositions.get(oc.hostId);
          if (host) {
              const strokeLocal = (pts: { x: number; y: number }[], dash: number[], colour: string, width: number) => {
                  ctx.beginPath();
                  ctx.setLineDash(dash.map((d) => d / zoom));
                  ctx.strokeStyle = colour;
                  ctx.lineWidth = width / zoom;
                  for (let i = 0; i < pts.length; i++) {
                      const q = mapPt({ x: host.x + pts[i].x, y: host.y + pts[i].y });
                      if (i === 0) ctx.moveTo(q.x - renderPan.x, q.y - renderPan.y);
                      else ctx.lineTo(q.x - renderPan.x, q.y - renderPan.y);
                  }
                  ctx.stroke();
                  ctx.setLineDash([]);
              };
              // Solid for the orbit being left, dashed for the one being joined, so which is which is
              // readable without a legend. Two rings only, and only while a plan is selected: RENDER-S31
              // charges a dash pattern over a shape's WHOLE path, so this stays a pair rather than a habit.
              strokeLocal(orbitCirclePath(oc.fromRadius_au, oc.u, oc.w, 128), [], `rgba(150, 200, 255, ${alpha * 0.5})`, 1.5);
              strokeLocal(orbitCirclePath(oc.toRadius_au, oc.u, oc.w, 128), [6, 6], `rgba(150, 200, 255, ${alpha * 0.8})`, 1.5);
              // The transfer itself, in the coast colour the rest of the app uses for a ballistic arc.
              const ell = transferEllipsePath(oc.fromRadius_au, oc.toRadius_au, oc.u, oc.w, 0, 1, 96);
              strokeLocal(ell.points, [], `rgba(255, 255, 0, ${alpha})`, isCompleted ? 2 : 3);
              // The two burns, where the reference figure puts them: at the start of the ellipse and at
              // its far end, on the ring each belongs to.
              const marks: [{ x: number; y: number }, string][] = [
                  [ell.points[0], '#4ade80'],
                  [ell.points[ell.points.length - 1], '#ff3333']
              ];
              for (const [ptLocal, colour] of marks) {
                  const q = mapPt({ x: host.x + ptLocal.x, y: host.y + ptLocal.y });
                  const x = q.x - renderPan.x;
                  const y = q.y - renderPan.y;
                  const size = 5 / zoom;
                  ctx.strokeStyle = colour;
                  ctx.lineWidth = 2 / zoom;
                  ctx.beginPath(); ctx.arc(x, y, size, 0, 2 * Math.PI); ctx.stroke();
                  ctx.beginPath();
                  ctx.moveTo(x - size * 1.9, y); ctx.lineTo(x - size * 0.7, y);
                  ctx.moveTo(x + size * 0.7, y); ctx.lineTo(x + size * 1.9, y);
                  ctx.moveTo(x, y - size * 1.9); ctx.lineTo(x, y - size * 0.7);
                  ctx.moveTo(x, y + size * 0.7); ctx.lineTo(x, y + size * 1.9);
                  ctx.stroke();
              }
              orbitChangeDrawn = true;
          }
      }

      if (!orbitChangeDrawn)
      for (const segment of plan.segments) {
          ctx.beginPath();
          if (forceGrey) { ctx.setLineDash([]); ctx.strokeStyle = `rgba(100, 100, 100, ${alpha})`; }
          else if (isGhost) ctx.strokeStyle = `rgba(200, 200, 255, ${alpha})`;
          else if (segment.type === 'Coast') { ctx.setLineDash([]); ctx.strokeStyle = `rgba(255, 255, 0, ${alpha})`; }
          else if (segment.type === 'Brake') { ctx.setLineDash([]); ctx.strokeStyle = `rgba(255, 51, 51, ${alpha})`; }
          // The aerobrake dip, in the purple it was asked for - distinct from the red of a brake
          // BURN because nothing is burning: the atmosphere is doing the work and the drive is dark.
          else if (segment.type === 'Aerobrake') { ctx.setLineDash([]); ctx.strokeStyle = `rgba(186, 104, 255, ${alpha})`; }
          else { ctx.setLineDash([]); ctx.strokeStyle = `rgba(0, 255, 0, ${alpha})`; }
          ctx.lineWidth = (isCompleted || isGhost || forceGrey ? 2 : 3) / zoom;
          for (let i = 0; i < segment.pathPoints.length; i++) {
              const p = mapPt(segment.pathPoints[i]);
              if (i === 0) ctx.moveTo(p.x - renderPan.x, p.y - renderPan.y);
              else ctx.lineTo(p.x - renderPan.x, p.y - renderPan.y);
          }
          ctx.stroke();
          if (segment.pathPoints.length > 0) {
              const p0 = mapPt(segment.pathPoints[0]);
              ctx.beginPath(); ctx.arc(p0.x - renderPan.x, p0.y - renderPan.y, 4 / zoom, 0, 2 * Math.PI); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
          }
      }

      // HOW THE PATH SAYS 'I STOP HERE' VERSUS 'I AM PASSING THROUGH'.
      //
      // Nothing used to distinguish them: a flyby and a rendezvous both end Accel -> Coast -> Brake
      // and the brake draws red in both, because a flyby DOES brake — it sheds closing speed down to
      // its intercept velocity rather than to zero. So the burn colours cannot carry this; only the
      // shape of the ending can. A rendezvous terminates in a ring at the destination. A flyby
      // carries on past it, in the coast colour, and ends in an arrowhead: the ship does not stop, so
      // neither does its line. The predicate is the transit layer's own `isFlybyPlan`, so the picture
      // and the post-arrival behaviour cannot disagree about what this plan is.
      if (!forceGrey && !isGhost) {
          const lastSeg = plan.segments[plan.segments.length - 1];
          const pts = lastSeg?.pathPoints ?? [];
          if (pts.length >= 2) {
              const tip = mapPt(pts[pts.length - 1]);
              const prev = mapPt(pts[pts.length - 2]);
              const hx = tip.x - prev.x, hy = tip.y - prev.y;
              const hLen = Math.hypot(hx, hy) || 1;
              const ux = hx / hLen, uy = hy / hLen;
              const tx = tip.x - renderPan.x, ty = tip.y - renderPan.y;
              ctx.lineWidth = 2 / zoom;
              if (isFlybyPlan(plan)) {
                  const tail = 26 / zoom, head = 8 / zoom;
                  const ex = tx + ux * tail, ey = ty + uy * tail;
                  ctx.strokeStyle = `rgba(255, 255, 0, ${alpha})`;   // coasting on past
                  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ex, ey); ctx.stroke();
                  ctx.beginPath();
                  for (const s of [1, -1]) {
                      const a = Math.atan2(uy, ux) + s * 2.618;      // 150 degrees back from the tip
                      ctx.moveTo(ex, ey);
                      ctx.lineTo(ex + Math.cos(a) * head, ey + Math.sin(a) * head);
                  }
                  ctx.stroke();
              } else {
                  ctx.strokeStyle = `rgba(255, 51, 51, ${alpha})`;   // stops here
                  ctx.beginPath(); ctx.arc(tx, ty, 5 / zoom, 0, 2 * Math.PI); ctx.stroke();
              }
          }
      }

      // Draw Burn Symbols (Corrections, etc)
      if (plan.burns && !forceGrey) {
          for (const burn of plan.burns) {
              // An orbit change's burns are marked as part of its FIGURE, in the host's frame, so they
              // are skipped here - `burn.position` is global at the moment of the burn and would land
              // wherever the host had got to by then.
              if (plan.orbitChange && (burn.type === 'Departure' || burn.type === 'Arrival')) continue;
              if (burn.type === 'Correction') {
                  const x = burn.position.x - renderPan.x;
                  const y = burn.position.y - renderPan.y;
                  const size = 3 / zoom;
                  
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 1 / zoom;
                  ctx.beginPath();
                  ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size);
                  ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size);
                  ctx.stroke();
              }
          }
      }

      ctx.setLineDash([]);
  }
  function drawShipMarker(ctx: CanvasRenderingContext2D, pos: {x: number, y: number}) {
      let x = pos.x; let y = pos.y;
      if (toytownFactor > 0) {
         let r = Math.sqrt(x*x + y*y); const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
         const angle = Math.atan2(y, x); x = r_new * Math.cos(angle); y = r_new * Math.sin(angle);
      }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - renderPan.x, y - renderPan.y, 6 / zoom, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2 / zoom; ctx.stroke();
  }
  export function fitToNodes(nodeIds: string[]) {
      if (!canvas || !system || nodeIds.length === 0) return;
      calculateScaledPositions();
      const positions: {x: number, y: number}[] = [];
      for (const id of nodeIds) {
          const pos = toytownFactor > 0 ? scaledWorldPositions.get(id) : worldPositions.get(id);
          if (pos) positions.push(pos);
      }
      if (positions.length === 0) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of positions) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
      const width = maxX - minX; const height = maxY - minY;
      const padding = 1.8; const targetWidth = Math.max(width, 0.1); const targetHeight = Math.max(height, 0.1);
      const zoomX = canvas.width / (targetWidth * padding); const zoomY = canvas.height / (targetHeight * padding);
      const targetZoom = clampZoom(Math.min(zoomX, zoomY, 500)); cameraMode = 'MANUAL';
      panStore.set({ x: centerX, y: centerY }, { duration: 500 }); zoomStore.set(targetZoom, { duration: 500 });
  }
</script>
<div class="viz-wrap"
     style:position="relative"
     style:width="100%"
     style:line-height="0"
     style:height={fullScreen ? '100%' : 'auto'}
     style:margin-top={fullScreen ? '0' : '1em'}>
  <canvas
      bind:this={canvas}
      use:gestures={canvasGestures}
      class:fullscreen={fullScreen}
      style:background-color={backgroundColor}
      style="cursor: grab; width: 100%; touch-action: none;"
      style:border={fullScreen ? 'none' : '1px solid #333'}
      style:display={fullScreen ? 'block' : 'inline-block'}
      style:height={fullScreen ? '100%' : 'auto'}
  ></canvas>
  <!-- PlanetDisc overlays for big bodies: rendered at a fixed size, GPU-scaled by CSS transform. -->
  <div style="position:absolute; inset:0; overflow:hidden; pointer-events:none;">
    {#each discOverlays as o (o.id)}
      <div style="position:absolute; left:0; top:0; width:{DISC_OVERLAY_REF}px; height:{DISC_OVERLAY_REF}px; transform-origin:0 0; transform:translate({o.x}px,{o.y}px) scale({o.scale}) translate(-50%,-50%); will-change:transform;">
        <PlanetDisc body={o.body} size={DISC_OVERLAY_REF} lightAngle={o.lightAngle} showStamp={false} />
      </div>
    {/each}
  </div>
  <!-- Foreground overlay: constructs + labels, painted above the disc layer so they're never hidden. -->
  <canvas bind:this={fgCanvas} style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;"></canvas>
</div>

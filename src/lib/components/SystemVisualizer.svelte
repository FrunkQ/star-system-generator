<script lang="ts">
  import type { System, CelestialBody, Barycenter, RulePack, SystemNode } from '$lib/types';
  import type { TransitPlan } from '$lib/transit/types';
  import { getJourneyBounds, coastPathUnderGravity } from '$lib/transit/scheduler';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";
  import { AU_KM, EARTH_MASS_KG } from '../constants';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints } from "$lib/physics/lagrange";
  import { get } from 'svelte/store';
  import { panStore, zoomStore } from '$lib/viewport/stores';
  import type { PanState } from '$lib/viewport/stores';
  import { clampZoom, dampedZoomStep, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM, frameForLevel, availableFrameLevels, suppressAutoZoomNearPeriapsis } from '$lib/viewport/camera';
  import { gestures } from '$lib/input/gestures';
  import { calculateAllStellarZones, calculateRocheLimit } from '$lib/physics/zones';
  import { scaleBoxCox } from '../physics/scaling';
  import { findContainingHost } from '$lib/physics/orbits';
  import { getNodeColor, STAR_COLOR_MAP, tokenRgba } from '$lib/rendering/colors';
  import { trueColorMode } from '$lib/rendering/colorModeStore';
  import { getPlanetTexture } from '$lib/rendering/planetTexture';

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
    showBodyContextMenu: { node: CelestialBody, x: number, y: number },
    backgroundContextMenu: { x: number, y: number, dominantBody: CelestialBody | Barycenter | null, screenX: number, screenY: number }
  }>();

  // --- Configurable Visuals ---
  const CLICK_AREA = { base_px: 10, buffer_px: 5 };
  const AUTO_ZOOM_MIN_UPDATE_MS = 180;
  const VELOCITY_VECTOR_COLOR = 'rgba(0, 212, 255, 0.95)';
  const ACCEL_VECTOR_COLOR = 'rgba(255, 155, 47, 0.95)';

  // --- Canvas and Rendering State ---
  let canvas: HTMLCanvasElement;
  let animationFrameId: number;
  let worldPositions = new Map<string, { x: number, y: number }>();
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
  let userZoomOverride = false;
  let beltLabelClickAreas = new Map<string, { x1: number, y1: number, x2: number, y2: number }>();
  let x0_distance = 0.01; // Default pivot for distance scaling
  // Cache of coasting ships' forecast polylines, keyed by ship+clock so it isn't re-integrated per frame.
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
      const parentTruePos = worldPositions.get(node.parentId)!;
      const nodeTruePos = worldPositions.get(node.id)!;
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
  function firstLevelFor(nodeId: string): number {
      return levelsFor(nodeId)[0] ?? 3;
  }
  function nextLevelFor(nodeId: string, current: number): number {
      const levels = levelsFor(nodeId);
      const idx = levels.indexOf(current);
      // Advance to the next existing level; clamp at the deepest (no wrap).
      return idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : levels[levels.length - 1] ?? current;
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
          focusLevel = firstLevelFor(targetId);
          const frame = calculateFrameForNode(targetId);
          panStore.set(frame.pan, { duration: 0 });
          zoomStore.set(clampZoom(frame.zoom), { duration: 0 });
      }
  }

  $: if (focusedBodyId !== lastFocusedId && system && canvas && worldPositions.size > 0) {
      handleFocusChange(focusedBodyId);
  }

  function handleFocusChange(newFocusId: string | null) {
      lastFocusedId = newFocusId;
      const targetId = newFocusId || system!.nodes.find(n => n.parentId === null)?.id;
      if (!targetId) return;
      const nodesById = new Map(system!.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(targetId);
      if (targetNode && targetNode.kind === 'body' && targetNode.roleHint === 'belt') return;
      // A NEW selection starts at the object's first existing framing level.
      focusLevel = firstLevelFor(targetId);
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
      calculateScaledPositions();
      if (needsReset) { resetView(); needsReset = false; }
      calculateLagrangePointPositions();
      if (focusedBodyId && cameraMode === 'FOLLOW' && !isPanning && !isAnimatingFocus) {
          const targetPosition = toytownFactor > 0 ? scaledWorldPositions.get(focusedBodyId) : worldPositions.get(focusedBodyId);
          if (targetPosition) {
              renderPan = targetPosition;
              const idealFrame = calculateFrameForNode(focusedBodyId);
              const idealZoom = clampZoom(idealFrame.zoom);
              const now = performance.now();
              const tooSoon = now - lastAutoZoomUpdateMs < AUTO_ZOOM_MIN_UPDATE_MS;
              const suppressNearPeriapsis = shouldSuppressAutoZoomNearPeriapsis(focusedBodyId);
              const currentZoom = get(zoomStore);
              const baseZoom = lastAutoZoomTarget > 0 ? lastAutoZoomTarget : currentZoom;
              const nextZoom = dampedZoomStep(baseZoom, idealZoom);
              const deltaRatio = Math.abs(nextZoom - baseZoom) / Math.max(baseZoom, MIN_CAMERA_ZOOM);

              if (!userZoomOverride && !suppressNearPeriapsis && !tooSoon && deltaRatio > 0.02) {
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
  function calculateLagrangePointPositions() {
      const idToUse = focusedBodyId || (system ? system.nodes.find(n => n.parentId === null)?.id : undefined);
      if (!system || !showLPoints || !idToUse) { lagrangePoints = null; return; }
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const focusedNode = nodesById.get(idToUse);
      if (!focusedNode || (focusedNode.kind !== 'body' && focusedNode.kind !== 'construct')) { lagrangePoints = null; return; }
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

  function calculateWorldPositions(system: System | null, currentTime: number): Map<string, { x: number, y: number }> {
      if (!system) return new Map();
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const positions = new Map<string, { x: number, y: number }>();
      function getPosition(nodeId: string): { x: number, y: number } {
          if (positions.has(nodeId)) return positions.get(nodeId)!;
          const node = nodesById.get(nodeId);
          if (!node) return { x: 0, y: 0 };
          if (node.kind === 'construct' && node.vector_position_au) {
              const absolute = { x: node.vector_position_au.x, y: node.vector_position_au.y };
              positions.set(nodeId, absolute);
              return absolute;
          }
          if (node.parentId === null) { positions.set(nodeId, { x: 0, y: 0 }); return { x: 0, y: 0 }; }
          const parentPos = getPosition(node.parentId);
          let relativePos = { x: 0, y: 0 };
          if ((node.kind === 'body' || node.kind === 'construct' || node.kind === 'barycenter') && node.orbit) {
              const isStationary = node.kind === 'construct' && (node.physical_parameters?.massKg || 0) === 0;
              const timeToPropagate = isStationary ? node.orbit.t0 : currentTime;
              const propagated = propagate(node, timeToPropagate);
              if (propagated) relativePos = propagated;
          }
          const absolutePos = { x: parentPos.x + relativePos.x, y: parentPos.y + relativePos.y };
          positions.set(nodeId, absolutePos);
          return absolutePos;
      }
      for (const node of system.nodes) getPosition(node.id);
      return positions;
  }

  function getVisibleNodeIds(system: System, focusedBodyId: string | null): Set<string> {
      const visibleIds = new Set<string>();
      if (!system) return visibleIds;
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const primaryStar = system.nodes.find(n => n.parentId === null);
      let focusNode = nodesById.get(focusedBodyId || '');
      if (!focusNode) focusNode = primaryStar;
      if (!focusNode) return visibleIds;
      let current: SystemNode | undefined = focusNode;
      while (current) {
          visibleIds.add(current.id);
          current = current.parentId ? nodesById.get(current.parentId) : undefined;
      }
      const focusNodeHasChildren = system.nodes.some(n => n.parentId === focusNode.id);
      let contextBody = focusNode;
      if (!focusNodeHasChildren) contextBody = focusNode.parentId ? nodesById.get(focusNode.parentId) ?? focusNode : focusNode;
      visibleIds.add(contextBody.id);
      system.nodes.forEach(n => { if (n.parentId === contextBody.id) visibleIds.add(n.id); });
      if (contextBody.parentId) {
        const grandparentId = contextBody.parentId;
        system.nodes.forEach(n => { if (n.parentId === grandparentId) visibleIds.add(n.id); });
      }
      // Barycentres are TRANSPARENT containers: whenever a barycentre is visible (e.g. a binary-planet
      // pair shown as a child of the focused star), its member bodies are too — otherwise the binary
      // planets (grandchildren of the star) would be invisible/unclickable. Iterate to handle nesting.
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const n of system.nodes) {
          if (n.kind === 'barycenter' && visibleIds.has(n.id) && Array.isArray((n as any).memberIds)) {
            for (const m of (n as any).memberIds) if (!visibleIds.has(m)) { visibleIds.add(m); expanded = true; }
          }
        }
      }
      return visibleIds;
  }

  // Draw a construct's icon glyph (triangle/circle/diamond/cross/square) centred
  // at (x, y) with the given pixel size. Single source of truth for both the
  // world-space pass (sizePx = 8 / zoom) and the screen-space overlay (sizePx = 8),
  // which had drifted apart. Screen-space sizing (8px) is the canonical default.
  function drawConstructGlyph(ctx: CanvasRenderingContext2D, node: CelestialBody, x: number, y: number, sizePx: number): void {
      const size = sizePx;
      const c = node as any;
      ctx.fillStyle = c.icon_color || '#ffd24d';
      if (c.icon_type === 'circle') {
          ctx.beginPath(); ctx.arc(x, y, size / 2, 0, 2 * Math.PI); ctx.fill();
      } else if (c.icon_type === 'diamond') {
          ctx.beginPath(); ctx.moveTo(x, y - size / 2); ctx.lineTo(x + size / 2, y);
          ctx.lineTo(x, y + size / 2); ctx.lineTo(x - size / 2, y); ctx.closePath(); ctx.fill();
      } else if (c.icon_type === 'cross') {
          const thickness = size / 3;
          ctx.fillRect(x - thickness / 2, y - size / 2, thickness, size);
          ctx.fillRect(x - size / 2, y - thickness / 2, size, thickness);
      } else if (c.icon_type === 'square') {
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
      } else {
          // Default: triangle (bodies are circles/spheres, so constructs read as triangles)
          ctx.beginPath(); ctx.moveTo(x, y - size / 2); ctx.lineTo(x + size / 2, y + size / 2);
          ctx.lineTo(x - size / 2, y + size / 2); ctx.closePath(); ctx.fill();
      }
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
        dispatch("backgroundContextMenu", { x: clickPos.x, y: clickPos.y, dominantBody, screenX, screenY });
      }
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
  // Belt/ring DENSITY as a 0..1 fraction from its massKg debris-density proxy (log scale,
  // 1e-5..1.0 Earth masses — mirrors getBeltDensityDescription). Drives how solid we draw it.
  // Undefined density (legacy data) → a moderate default so it stays visible.
  function debrisDensityFrac(massKg: number | undefined): number {
      if (massKg === undefined || massKg <= 0) return 0.3;
      const me = massKg / EARTH_MASS_KG;
      const lo = Math.log(1e-5), hi = Math.log(1.0);
      return Math.max(0, Math.min(1, (Math.log(me) - lo) / (hi - lo)));
  }

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
      for (const l of logs) {
          if (l.status === 'cancelled') continue;
          const b = getJourneyBounds(l.plans);
          if (b && currentTime >= b.startMs && currentTime <= b.endMs) return false;
      }
      return logs.some((l: any) => l.status === 'cancelled' && l.cancelledAtSec && Number(l.cancelledAtSec) * 1000 <= currentTime);
  }

  function drawSystem(ctx: CanvasRenderingContext2D) {
      if (!system || !zoom) return;
      const { width, height } = canvas;
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      ctx.save();
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      // Zones are drawn in screen-space overlay after world-space pass for better dash/LOD performance.
      if (showTravellerZones) drawTravellerZones(ctx);
      drawSensorOverlay(ctx);   // gates internally on the global view toggle OR the ship's sensors flag
      for (const node of system.nodes) {
          if (!node.orbit || !node.parentId || (node.kind === 'body' && node.roleHint === 'belt')) continue;
          const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
          if (!parentPos) continue;
          let a = node.orbit.elements.a_AU; let e = node.orbit.elements.e;
          if (toytownFactor > 0) a = scaleBoxCox(a, toytownFactor, x0_distance);
          const b = a * Math.sqrt(1 - e * e); const c = a * e;
          // Bad orbit data (negative/NaN a, e >= 1) must not throw in ctx.ellipse
          // and freeze the canvas — skip this orbit line instead.
          if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b <= 0) continue;
          const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
          ctx.strokeStyle = "#333"; ctx.lineWidth = 1 / zoom;
          ctx.save();
          ctx.translate(parentPos.x - renderPan.x, parentPos.y - renderPan.y);
          ctx.rotate(omega_rad);
          ctx.beginPath();
          ctx.ellipse(-c, 0, a, b, 0, 0, 2 * Math.PI);
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
      if (showLPoints && lagrangePoints) {
          const crossSize = 5 / zoom; ctx.lineWidth = 1.5 / zoom;
          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0]; const isStable = name === 'L4' || name === 'L5';
              if (toytownFactor > 0 && !isStable) continue;
              ctx.strokeStyle = isStable ? 'green' : '#888';
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
          let radiusInAU = (node.radiusKm || 0) / AU_KM;
          if (toytownFactor > 0) radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
          let minRadiusPx = 2;
          if (node.roleHint === 'star') minRadiusPx = 4;
          else if (node.roleHint === 'planet') { const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant')); minRadiusPx = isGasGiant ? 3 : 2; }
          else if (node.roleHint === 'moon') minRadiusPx = 1;
          const minRadiusInWorld = minRadiusPx / zoom;
          const finalRadius = Math.sqrt(Math.pow(radiusInAU, 2) + Math.pow(minRadiusInWorld, 2));

          // #5 Star glow — a soft additive halo behind the disc. A very active (flaring) star
          // throws a bigger, brighter halo; a feeding (active) black hole gets one too, in the
          // hot-orange of its accretion disc (quiescent holes stay dark).
          const isBlackHole = node.classes?.some((c) => c.includes('BH'));
          const isActiveBH = node.classes?.includes('star/BH_active');
          if (node.roleHint === 'star' && (!isBlackHole || isActiveBH)) {
              // 0..1 activity: stellar flare level for stars, full-tilt for a feeding hole.
              const activity = isActiveBH ? 1 : Math.max(0, Math.min(1, (node as any).flareActivity ?? 0));
              const glowR = finalRadius * (3.4 + activity * 3.0);
              const col = isActiveBH ? '255,150,40' : hexToRgbTriplet(getNodeColor(node));
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

          ctx.beginPath();
          ctx.arc(rx, ry, finalRadius, 0, 2 * Math.PI);

          // Custom Rendering for Black Holes
          if (node.classes?.includes('star/BH_active')) {
              ctx.fillStyle = '#000000';
              ctx.fill();
              ctx.lineWidth = Math.max(2 / zoom, finalRadius * 0.2); // Accretion disk
              ctx.strokeStyle = '#ffaa00'; // Hot orange
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
                  ctx.beginPath(); ctx.arc(rx, ry, finalRadius, 0, 2 * Math.PI); ctx.clip();
                  ctx.drawImage(tex, rx - finalRadius, ry - finalRadius, finalRadius * 2, finalRadius * 2);
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
          const sx = rx * zoom + width / 2;
          const sy = ry * zoom + height / 2;
          const sR = finalRadius * zoom;

          // #10 Night side — shade the hemisphere facing away from the primary star (skip stars/BH;
          // only when the disc is big enough on screen to read). A TIDALLY LOCKED world has a fixed,
          // pronounced terminator: a sharp, dark day/night divide (no rotation to even it out).
          if (node.roleHint !== 'star' && primaryStarPos && sR > 3) {
              const dx = primaryStarPos.x - pos.x, dy = primaryStarPos.y - pos.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len, uy = dy / len; // unit vector toward the star (screen Y not flipped)
              const locked = !!(node as CelestialBody).tidallyLocked;
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
      // Faint trip lines for EVERY ship's current/upcoming journey, so the whole map shows who's going
      // where (not just the ship being planned). Skip finished trips. Bright planning lines draw on top.
      if (system) {
          for (const node of system.nodes) {
              if (node.kind !== 'construct') continue;
              for (const log of ((node as any).scheduled_journeys || [])) {
                  if (log.status === 'cancelled') continue;
                  const b = getJourneyBounds(log.plans);
                  if (!b || currentTime > b.endMs) continue;
                  for (const plan of log.plans) drawTransitPlan(ctx, plan, false, 0.16, true);
              }
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
              ctx.strokeStyle = 'rgba(208, 69, 69, 0.5)';
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
      if (showLPoints && lagrangePoints) {
          const crossSize = 5 / zoom; ctx.lineWidth = 1.5 / zoom;
          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0]; const isStable = name === 'L4' || name === 'L5';
              if (toytownFactor > 0 && !isStable) continue;
              ctx.fillStyle = isStable ? 'green' : '#888';
              const screenPos = worldToScreen(pos.x, pos.y);
              ctx.fillText(name, screenPos.x + 8, screenPos.y);
          }
      }
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
              ? `${Math.round(au * AU_KM).toLocaleString()} km`
              : `${au.toFixed(au < 10 ? 3 : 2)} AU` + (au < 0.2 ? `  (${Math.round(au * AU_KM).toLocaleString()} km)` : '');
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
              const aMs2 = Math.hypot(acc.x, acc.y);
              if (aMs2 > 1e-6 && Number.isFinite(aMs2)) {
                  const aLen = Math.max(10, Math.min(72, 8 + Math.log10(aMs2 * 100 + 1) * 18));
                  drawArrowScreen(ctx, screenPos.x, screenPos.y, acc.x, acc.y, aLen, ACCEL_VECTOR_COLOR);
              }
          }
      }
  }

  function drawTransitPlan(ctx: CanvasRenderingContext2D, plan: TransitPlan, isCompleted: boolean = false, alphaOverride?: number, forceGrey: boolean = false) {
      if (!plan) return;
      const alpha = alphaOverride !== undefined ? alphaOverride : (isCompleted ? 0.6 : 1.0);
      const isGhost = alphaOverride !== undefined && !forceGrey;
      for (const segment of plan.segments) {
          ctx.beginPath();
          if (forceGrey) { ctx.setLineDash([]); ctx.strokeStyle = `rgba(100, 100, 100, ${alpha})`; }
          else if (isGhost) ctx.strokeStyle = `rgba(200, 200, 255, ${alpha})`;
          else if (segment.type === 'Coast') { ctx.setLineDash([]); ctx.strokeStyle = `rgba(255, 255, 0, ${alpha})`; }
          else if (segment.type === 'Brake') { ctx.setLineDash([]); ctx.strokeStyle = `rgba(255, 51, 51, ${alpha})`; }
          else { ctx.setLineDash([]); ctx.strokeStyle = `rgba(0, 255, 0, ${alpha})`; }
          ctx.lineWidth = (isCompleted || isGhost || forceGrey ? 2 : 3) / zoom;
          for (let i = 0; i < segment.pathPoints.length; i++) {
              let p = segment.pathPoints[i];
              if (toytownFactor > 0 && !plan.isKinematic) { 
                 const r = Math.sqrt(p.x*p.x + p.y*p.y); const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
                 const angle = Math.atan2(p.y, p.x); const x_new = r_new * Math.cos(angle); const y_new = r_new * Math.sin(angle);
                 p = { x: x_new, y: y_new };
              }
              if (i === 0) ctx.moveTo(p.x - renderPan.x, p.y - renderPan.y);
              else ctx.lineTo(p.x - renderPan.x, p.y - renderPan.y);
          }
          ctx.stroke();
          if (segment.pathPoints.length > 0) {
              const p0 = segment.pathPoints[0]; let x = p0.x; let y = p0.y;
              if (toytownFactor > 0 && !plan.isKinematic) {
                 const r = Math.sqrt(x*x + y*y); const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
                 const angle = Math.atan2(y, x); x = r_new * Math.cos(angle); y = r_new * Math.sin(angle);
              }
              ctx.beginPath(); ctx.arc(x - renderPan.x, y - renderPan.y, 4 / zoom, 0, 2 * Math.PI); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
          }
      }

      // Draw Burn Symbols (Corrections, etc)
      if (plan.burns && !forceGrey) {
          for (const burn of plan.burns) {
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
<canvas
    bind:this={canvas}
    use:gestures={canvasGestures}
    class:fullscreen={fullScreen}
    style:background-color={backgroundColor}
    style="cursor: grab; width: 100%; touch-action: none;"
    style:border={fullScreen ? 'none' : '1px solid #333'}
    style:margin-top={fullScreen ? '0' : '1em'}
    style:display={fullScreen ? 'block' : 'inline-block'}
    style:height={fullScreen ? '100%' : 'auto'}
></canvas>

<script lang="ts">
  import type { System, CelestialBody, Barycenter, RulePack, SystemNode } from '$lib/types';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";
  import { AU_KM } from '../constants';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints } from "$lib/physics/lagrange";
  import { get } from 'svelte/store';
  import { panStore, zoomStore } from '$lib/cameraStore';
  import type { PanState } from '$lib/cameraStore';
  import { calculateAllStellarZones, calculateRocheLimit } from '$lib/physics/zones';
  import { scaleBoxCox } from '$lib/physics/scaling';

  export let system: System | null;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;
  export let showNames: boolean = false;
  export let showZones: boolean = false;
  export let showLPoints: boolean = false;
  export let toytownFactor: number = 0;

  const dispatch = createEventDispatcher<{ focus: string | null }>();

  function getPlanetColor(node: CelestialBody): string {
    if (node.roleHint === 'star') return '#fff'; // White
    if (node.tags?.some(t => t.key === 'habitability/earth-like' || t.key === 'habitability/human')) return '#007bff'; // Blue
    if (node.biosphere) return '#00ff00'; // Green
    const isIceGiant = node.classes?.some(c => c.includes('ice-giant'));
    if (isIceGiant) return '#add8e6'; // Light Blue
    const isGasGiant = node.classes?.some(c => c.includes('gas-giant'));
    if (isGasGiant) return '#cc0000'; // Darker Red for Gas Giants
    return '#cc6600'; // Darker Orange/Brown for Terrestrial Bodies
  }

  // --- Configurable Visuals ---
  const CLICK_AREA = { base_px: 10, buffer_px: 5 };

  // --- Canvas and Rendering State ---
  let canvas: HTMLCanvasElement;
  let animationFrameId: number;
  let worldPositions = new Map<string, { x: number, y: number }>();
  let scaledWorldPositions = new Map<string, { x: number, y: number }>();
  let stellarZones: Record<string, any> | null = null;
  let needsReset = false;

  // --- Camera State ---
  let pan: PanState;
  let zoom: number;
  panStore.subscribe(value => pan = value);
  zoomStore.subscribe(value => zoom = value);
  $: camera = { pan, zoom };

  // --- Interaction State ---
  let isPanning = false;
  let lastPanX: number;
  let lastPanY: number;
  let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';
  let lastFocusedId: string | null = null;
  let isAnimatingFocus = false;
  let beltLabelClickAreas = new Map<string, { x1: number, y1: number, x2: number, y2: number }>();
  let x0_distance = 0.01; // Default pivot for distance scaling

  // --- Reactive Calculations ---
  $: if (system) {
    needsReset = true;
  }
  $: if (system && rulePack) {
    calculateAndStoreStellarZones();
  }
  $: if (showLPoints) {
    calculateLagrangePointPositions();
  }

  function calculateAndStoreStellarZones() {
    if (!system) {
      stellarZones = null;
      return;
    }
    const primaryStar = system.nodes.find(n => n.parentId === null && n.kind === 'body' && n.roleHint === 'star');
    if (primaryStar) {
      stellarZones = calculateAllStellarZones(primaryStar as CelestialBody, rulePack);
    } else {
      stellarZones = null;
    }
  }

  function calculateScaledPositions() {
    if (!system || toytownFactor === 0) {
      scaledWorldPositions = worldPositions; // If toytownFactor is 0, use original positions
      return;
    }

    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    const newScaledPositions = new Map<string, { x: number, y: number }>();

    // Collect all distances for normalization
    const distances: number[] = [];
    for (const node of system.nodes) {
      if (node.parentId && worldPositions.has(node.id) && worldPositions.has(node.parentId)) {
        const parentPos = worldPositions.get(node.parentId)!;
        const nodePos = worldPositions.get(node.id)!;
        const dx = nodePos.x - parentPos.x;
        const dy = nodePos.y - parentPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
          distances.push(distance);
        }
      }
    }

    // Determine x0 for distances (e.g., 1/10th of the smallest non-zero distance)
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0.01; // Default if no distances
    x0_distance = minDistance * 0.1; 

    // Recursively calculate scaled positions
    function getScaledPosition(nodeId: string): { x: number, y: number } {
      if (newScaledPositions.has(nodeId)) return newScaledPositions.get(nodeId)!;

      const node = nodesById.get(nodeId);
      if (!node) return { x: 0, y: 0 };

      if (node.parentId === null) {
        newScaledPositions.set(nodeId, { x: 0, y: 0 });
        return { x: 0, y: 0 };
      }

      const parentScaledPos = getScaledPosition(node.parentId); // Get parent's scaled position
      const parentTruePos = worldPositions.get(node.parentId)!; // Get parent's true position
      const nodeTruePos = worldPositions.get(node.id)!; // Get node's true position

      const dxTrue = nodeTruePos.x - parentTruePos.x;
      const dyTrue = nodeTruePos.y - parentTruePos.y;
      const trueDistance = Math.sqrt(dxTrue * dxTrue + dyTrue * dyTrue);

      let scaledDistance = trueDistance;
      if (trueDistance > 0) {
        scaledDistance = scaleBoxCox(trueDistance, toytownFactor, x0_distance);
      }

      // Reconstruct position based on scaled distance and original angle
      const angle = Math.atan2(dyTrue, dxTrue);
      const x = parentScaledPos.x + scaledDistance * Math.cos(angle);
      const y = parentScaledPos.y + scaledDistance * Math.sin(angle);

      newScaledPositions.set(nodeId, { x, y });
      return { x, y };
    }

    // Populate scaledWorldPositions for all nodes
    for (const node of system.nodes) {
      getScaledPosition(node.id);
    }
    scaledWorldPositions = newScaledPositions;
  }

  // --- Public Functions ---
  function calculateFrameForNode(nodeId: string): { pan: PanState, zoom: number } {
      const currentPan = get(panStore);
      const currentZoom = get(zoomStore);
      if (!system || !canvas) return { pan: currentPan, zoom: currentZoom };

      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(nodeId);
      const targetPosition = worldPositions.get(nodeId);

      if (!targetNode || !targetPosition) return { pan: currentPan, zoom: currentZoom };

      const hasChildren = system.nodes.some(n => n.parentId === nodeId);

      if (hasChildren) {
          const children = system.nodes.filter(n => n.parentId === nodeId);
          let maxOrbit = children.reduce((max, node) => {
              if (node.kind === 'body' && node.orbit) {
                  return Math.max(max, node.orbit.elements.a_AU * (1 + node.orbit.elements.e));
              }
              return max;
          }, 0);

          if (maxOrbit === 0 && targetNode.kind === 'body' && targetNode.radiusKm) {
              maxOrbit = targetNode.radiusKm / AU_KM;
          }

          const paddingFactor = 1.02; // 2% padding
          const targetWorldSize = maxOrbit * 2 * paddingFactor;

          let newZoom = currentZoom;
          if (targetWorldSize > 0) {
              const zoomX = canvas.width / targetWorldSize;
              const zoomY = canvas.height / targetWorldSize;
              newZoom = Math.min(zoomX, zoomY);
          }
          return { pan: targetPosition, zoom: newZoom };
      } else {
          // Body has NO children, frame it and its parent
          const parentNode = targetNode.parentId ? nodesById.get(targetNode.parentId) : null;
          if (parentNode) {
              const parentPosition = worldPositions.get(parentNode.id);
              if (parentPosition) {
                  const dx = targetPosition.x - parentPosition.x;
                  const dy = targetPosition.y - parentPosition.y;
                  const distance = Math.sqrt(dx*dx + dy*dy);
                  let newZoom;
                  if (distance > 0) {
                      newZoom = (Math.min(canvas.width, canvas.height) / 2) / (distance * 1.02);
                  } else {
                      newZoom = currentZoom * 2;
                  }
                  return { pan: targetPosition, zoom: newZoom };
              }
          }
          // No parent or parent position not found, just center with current zoom
          return { pan: targetPosition, zoom: currentZoom };
      }
  }

  export function resetView() {
      if (!system || !canvas) return;
      cameraMode = 'FOLLOW';
      const targetId = focusedBodyId || system.nodes.find(n => n.parentId === null)?.id;

      if (targetId) {
          const frame = calculateFrameForNode(targetId);
          panStore.set(frame.pan, { duration: 0 });
          zoomStore.set(frame.zoom, { duration: 0 });
      }
  }

  // --- Reactive Logic for Triggering Animation ---
  $: if (focusedBodyId && focusedBodyId !== lastFocusedId && system && canvas && worldPositions.size > 0) {
      handleFocusChange(focusedBodyId);
  }

  function handleFocusChange(newFocusId: string) {
      lastFocusedId = newFocusId;

      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(newFocusId);

      // Do not animate camera for belts, just accept the focus change
      if (targetNode && targetNode.kind === 'body' && targetNode.roleHint === 'belt') {
          return;
      }
      
      startFocusAnimation(newFocusId);
  }

  function startFocusAnimation(targetId: string) {
      if (!system) return;
      const targetPosition = worldPositions.get(targetId);
      if (!targetPosition) return;

      cameraMode = 'FOLLOW';
      isAnimatingFocus = true;

      const beforeViewport = { pan: get(panStore), zoom: get(zoomStore) };
      const afterViewport = calculateFrameForNode(targetId);
      
      const zoomRatio = Math.max(beforeViewport.zoom, afterViewport.zoom) / Math.min(beforeViewport.zoom, afterViewport.zoom);
      const isLongZoom = zoomRatio > 100;
      const totalDuration = isLongZoom ? 1500 : 750;

      console.log(`Animating transition. Long Zoom: ${isLongZoom}, Duration: ${totalDuration}ms, Zoom Ratio: ${zoomRatio.toFixed(2)}`, { before: beforeViewport, after: afterViewport });

      if (isLongZoom) {
          const isZoomingOut = afterViewport.zoom < beforeViewport.zoom;
          const zoomDuration = totalDuration; // Keep zoom long
          const panDuration = totalDuration / 2; // Shorten pan

          if (isZoomingOut) {
              // Zoom first, then pan. Start the pan when the zoom is halfway through.
              const panStartDelay = totalDuration / 2;
              zoomStore.set(afterViewport.zoom, { duration: zoomDuration });
              setTimeout(() => {
                  panStore.set(afterViewport.pan, { duration: panDuration });
              }, panStartDelay);
          } else {
              // Pan first, then zoom. Pan completes, then zoom starts.
              const panDuration = totalDuration / 6; // Pan takes 1/6 of total duration (quicker)
              const zoomDuration = totalDuration * 5 / 6; // Zoom takes remaining 5/6
              const zoomStartDelay = panDuration; // Start zoom after pan finishes

              panStore.set(afterViewport.pan, { duration: panDuration });
              setTimeout(() => {
                  zoomStore.set(afterViewport.zoom, { duration: zoomDuration });
              }, zoomStartDelay);
          }
      } else {
          // Simultaneous animation for short zooms
          panStore.set(afterViewport.pan, { duration: totalDuration });
          zoomStore.set(afterViewport.zoom, { duration: totalDuration });
      }

      // Re-enable follow logic after the animation is complete
      setTimeout(() => {
          isAnimatingFocus = false;
      }, totalDuration);
  }

  // --- Svelte Lifecycle ---
  onMount(() => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const resizeObserver = new ResizeObserver(() => {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientWidth * (3 / 4);
    });
    resizeObserver.observe(parent);
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientWidth * (3 / 4);
    
    animationFrameId = requestAnimationFrame(render);
    return () => {
        if (parent) resizeObserver.unobserve(parent);
        cancelAnimationFrame(animationFrameId);
    };
  });

  onDestroy(() => cancelAnimationFrame(animationFrameId));

  // --- Coordinate Transformation ---
  function screenToWorld(screenX: number, screenY: number): { x: number, y: number } {
      if (!canvas || !camera || !camera.pan) return { x: 0, y: 0 };
      const { width, height } = canvas;
      const targetWorldPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
      const worldX = (screenX - width / 2) / camera.zoom + camera.pan.x;
      const worldY = (screenY - height / 2) / camera.zoom + camera.pan.y;
      return { x: worldX, y: worldY };
  }
  
  function worldToScreen(worldX: number, worldY: number): { x: number, y: number } {
      if (!canvas || !camera || !camera.pan) return { x: 0, y: 0 };
      const { width, height } = canvas;
      const screenX = (worldX - camera.pan.x) * camera.zoom + width / 2;
      const screenY = (worldY - camera.pan.y) * camera.zoom + height / 2;
      return { x: screenX, y: screenY };
  }

  // --- Main Render Loop ---
  function render() {
    if (canvas && system) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return; // Prevent drawing if context is not yet available

      if (ctx) {
        calculateWorldPositions();
        calculateScaledPositions(); // Ensure scaled positions are in sync
        if (needsReset) {
            resetView();
            needsReset = false;
        }
        calculateLagrangePointPositions(); // Calculate L-points each frame

        if (focusedBodyId && cameraMode === 'FOLLOW' && !isPanning && !isAnimatingFocus) {
            const targetPosition = toytownFactor > 0 ? scaledWorldPositions.get(focusedBodyId) : worldPositions.get(focusedBodyId);
            if (targetPosition) {
                panStore.set(targetPosition, { duration: 0 });
            }
        }

        drawSystem(ctx);
      }
    }
    animationFrameId = requestAnimationFrame(render);
  }

  // --- Position Calculation ---
  let lagrangePoints: Map<string, {x: number, y: number}> | null = null;

  function calculateLagrangePointPositions() {
      const idToUse = focusedBodyId || (system ? system.nodes.find(n => n.parentId === null)?.id : undefined);

      if (!system || !showLPoints || !idToUse) {
          lagrangePoints = null;
          return;
      }

      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const focusedNode = nodesById.get(idToUse);
      if (!focusedNode || focusedNode.kind !== 'body') {
          lagrangePoints = null;
          return;
      }

      const allPoints = new Map<string, {x: number, y: number}>();

      // Helper function to do the core calculation
      const calculateAndStorePoints = (primary: CelestialBody, secondaries: CelestialBody[]) => {
          const primaryPos = worldPositions.get(primary.id);
          if (!primaryPos) return;

          for (const secondary of secondaries) {
              const secondaryPos = worldPositions.get(secondary.id);
              if (!secondaryPos || !secondary.orbit) continue;

              const relativeSecondaryPos = { x: secondaryPos.x - primaryPos.x, y: secondaryPos.y - primaryPos.y };
              const points = calculateLagrangePoints(primary, secondary, relativeSecondaryPos);
              const angle = Math.atan2(relativeSecondaryPos.y, relativeSecondaryPos.x);

              points.forEach(p => {
                  let x = p.x;
                  let y = p.y;
                  if (!p.isRotated) {
                      const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
                      const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
                      x = rotatedX;
                      y = rotatedY;
                  }
                  allPoints.set(`${p.name}-${secondary.id}`, { x: x + primaryPos.x, y: y + primaryPos.y });
              });
          }
      };

      // 1. Show L-points for the focused body and its siblings relative to their parent.
      if (focusedNode.parentId) {
          const parent = nodesById.get(focusedNode.parentId);
          if (parent && parent.kind === 'body') {
              const siblings = system.nodes.filter(n => n.parentId === parent.id && n.kind === 'body');
              calculateAndStorePoints(parent, siblings);
          }
      }

      // 2. If the focused body has children, show L-points for them relative to the focused body.
      const children = system.nodes.filter(n => n.parentId === focusedNode.id && n.kind === 'body');
      if (children.length > 0) {
          calculateAndStorePoints(focusedNode, children);
      }
      
      lagrangePoints = allPoints.size > 0 ? allPoints : null;
  }

  function calculateWorldPositions() {
      if (!system) return;
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const positions = new Map<string, { x: number, y: number }>();
      function getPosition(nodeId: string): { x: number, y: number } {
          if (positions.has(nodeId)) return positions.get(nodeId)!;
          const node = nodesById.get(nodeId);
          if (!node) return { x: 0, y: 0 };
          if (node.parentId === null) {
              positions.set(nodeId, { x: 0, y: 0 });
              return { x: 0, y: 0 };
          }
          const parentPos = getPosition(node.parentId);
          let relativePos = { x: 0, y: 0 };
          if (node.kind === 'body' && node.orbit) {
              const propagated = propagate(node, currentTime);
              if (propagated) relativePos = propagated;
          }
          const absolutePos = { x: parentPos.x + relativePos.x, y: parentPos.y + relativePos.y };
          positions.set(nodeId, absolutePos);
          return absolutePos;
      }
      for (const node of system.nodes) getPosition(node.id);
      worldPositions = positions;
  }

  /**
   * Determines which nodes should be visible/clickable based on the current focus.
   */
  function getVisibleNodeIds(system: System, focusedBodyId: string | null): Set<string> {
      const visibleIds = new Set<string>();
      if (!system) return visibleIds;

      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const primaryStar = system.nodes.find(n => n.parentId === null);
      
      const focusNode = nodesById.get(focusedBodyId || primaryStar?.id || '');
      if (!focusNode) return visibleIds;

      // 1. Always add all ancestors of the focused body
      let current: SystemNode | undefined = focusNode;
      while (current) {
          visibleIds.add(current.id);
          current = current.parentId ? nodesById.get(current.parentId) : undefined;
      }

      // 2. Determine the context body
      const focusNodeHasChildren = system.nodes.some(n => n.parentId === focusNode.id);
      let contextBody = focusNode;
      if (!focusNodeHasChildren) {
          contextBody = focusNode.parentId ? nodesById.get(focusNode.parentId) ?? focusNode : focusNode;
      }

      // 3. Add the context body and its direct children
      visibleIds.add(contextBody.id);
      system.nodes.forEach(n => {
          if (n.parentId === contextBody.id) {
              visibleIds.add(n.id);
          }
      });

      // 4. If the context body has a parent, add all of its siblings
      if (contextBody.parentId) {
        const grandparentId = contextBody.parentId;
        system.nodes.forEach(n => {
            if (n.parentId === grandparentId) {
                visibleIds.add(n.id);
            }
        });
      }
      
      return visibleIds;
  }

  // --- Event Handlers ---
  function handleClick(event: MouseEvent) {
      if (!system) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      // Check for belt label clicks first
      if (showNames) {
          for (const [beltId, area] of beltLabelClickAreas.entries()) {
              if (clickX >= area.x1 && clickX <= area.x2 && clickY >= area.y1 && clickY <= area.y2) {
                  dispatch("focus", beltId);
                  return; // Belt clicked, do nothing else
              }
          }
      }

      const clickPos = screenToWorld(clickX, clickY);
      let clickedNodeId: string | null = null;
      let minDistanceSq = Infinity;

      const clickableIds = getVisibleNodeIds(system, focusedBodyId);
      const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;

      for (const node of system.nodes) {
          if (!clickableIds.has(node.id) || node.kind !== 'body') continue;

          const pos = targetPositions.get(node.id);
          if (!pos) continue;

          const dx = clickPos.x - pos.x;
          const dy = clickPos.y - pos.y;
          const distanceSq = dx * dx + dy * dy;
          const radiusInAU = (node.radiusKm || 0) / AU_KM;
          const clickRadiusInAU = Math.max(
              radiusInAU + (CLICK_AREA.buffer_px / camera.zoom),
              CLICK_AREA.base_px / camera.zoom
          );
          if (distanceSq < clickRadiusInAU * clickRadiusInAU) {
              if (distanceSq < minDistanceSq) {
                  minDistanceSq = distanceSq;
                  clickedNodeId = node.id;
              }
          }
      }
      if (clickedNodeId) {
        if (clickedNodeId === focusedBodyId) {
          // It IS the current focus, zoom in 2x
          zoomStore.set(get(zoomStore) * 2);
        } else {
          // It is not the object in focus, dispatch focus event
          dispatch("focus", clickedNodeId);
        }
      }
  }

  function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldPosBeforeZoom = screenToWorld(mouseX, mouseY);
      const zoomFactor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      const newZoom = get(zoomStore) * zoomFactor;
      const newPanX = worldPosBeforeZoom.x - (mouseX - canvas.width / 2) / newZoom;
      const newPanY = worldPosBeforeZoom.y - (mouseY - canvas.height / 2) / newZoom;
      
      panStore.set({ x: newPanX, y: newPanY }, { duration: 0 });
      zoomStore.set(newZoom, { duration: 0 });
  }

  function handleMouseDown(event: MouseEvent) {
      isPanning = true;
      cameraMode = 'MANUAL'; // User is taking control
      lastPanX = event.clientX;
      lastPanY = event.clientY;
      canvas.style.cursor = 'grabbing';
  }

  function handleMouseUp() {
      isPanning = false;
      canvas.style.cursor = 'grab';
  }

  function handleMouseMove(event: MouseEvent) {
      if (!isPanning) return;
      const dx = event.clientX - lastPanX;
      const dy = event.clientY - lastPanY;
      
      const panDeltaX = dx / get(zoomStore);
      const panDeltaY = dy / get(zoomStore);

      const currentPan = get(panStore);
      panStore.set({
          x: currentPan.x - panDeltaX,
          y: currentPan.y - panDeltaY
      }, { duration: 0 });

      lastPanX = event.clientX;
      lastPanY = event.clientY;
  }

  // --- Drawing Logic ---
  const STAR_COLOR_MAP: Record<string, string> = { "O": "#9bb0ff", "B": "#aabfff", "A": "#cad8ff", "F": "#f8f7ff", "G": "#fff4ea", "K": "#ffd2a1", "M": "#ffc46f", "WD": "#f0f0f0", "NS": "#c0c0ff", "magnetar": "#800080", "BH": "#000000", "default": "#ffffff" };

  function drawSystem(ctx: CanvasRenderingContext2D) {
      if (!system || !camera || !camera.pan) return;
      const { width, height } = canvas;
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      
      ctx.save();
      ctx.fillStyle = "#08090d";
      ctx.fillRect(0, 0, width, height);
      
      // --- Camera Transformation (applies to all world-coordinate drawing below) ---
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.pan.x, -camera.pan.y);

      // --- Draw Stellar Zones (if enabled) ---
      if (showZones) {
        drawStellarZones(ctx);
      }

      // --- Drawing Orbits (except for belts) ---
      for (const node of system.nodes) {
          if (node.kind !== 'body' || !node.orbit || !node.parentId || node.roleHint === 'belt') continue;
          
          const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
          if (!parentPos) continue;
          
          let a = node.orbit.elements.a_AU;
          let e = node.orbit.elements.e;

          if (toytownFactor > 0) {
              a = scaleBoxCox(a, toytownFactor, x0_distance);
          }
          
          const b = a * Math.sqrt(1 - e * e);
          const c = a * e; // distance from center to focus
          
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1 / camera.zoom;
          ctx.beginPath();
          ctx.ellipse(parentPos.x - c, parentPos.y, a, b, 0, 0, 2 * Math.PI);
          ctx.stroke();
      }

      // --- Draw Belts and Rings (in background) ---
      for (const node of system.nodes) {
          if (node.kind === 'body' && (node.roleHint === 'belt' || node.roleHint === 'ring') && node.parentId) {
              const parentPos = worldPositions.get(node.parentId);
              if (!parentPos) continue;

              if (node.radiusInnerKm && node.radiusOuterKm) {
                  const innerRadiusAU = node.radiusInnerKm / AU_KM;
                  const outerRadiusAU = node.radiusOuterKm / AU_KM;
                  const avgRadius = (innerRadiusAU + outerRadiusAU) / 2;
                  const widthAU = outerRadiusAU - innerRadiusAU;

                  if (widthAU <= 0) continue;

                  if (node.roleHint === 'belt') {
                      ctx.lineWidth = Math.max(4 / camera.zoom, widthAU);
                  } else {
                      ctx.lineWidth = widthAU;
                  }

                  let alpha = node.roleHint === 'ring' ? 0.3 : 0.07;
                  
                  ctx.strokeStyle = node.roleHint === 'ring' ? `rgba(200, 200, 200, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
                  
                  ctx.beginPath();
                  if (node.roleHint === 'belt' && node.orbit) {
                      const a = node.orbit.elements.a_AU;
                      const e = node.orbit.elements.e;
                      const b = a * Math.sqrt(1 - e * e);
                      const c = a * e;
                      ctx.ellipse(parentPos.x - c, parentPos.y, a, b, 0, 0, 2 * Math.PI);
                  } else {
                      ctx.arc(parentPos.x, parentPos.y, avgRadius, 0, 2 * Math.PI);
                  }
                  ctx.stroke();
              }

              if (node.roleHint === 'ring') {
                  const parent = nodesById.get(node.parentId);
                  if (parent && parent.kind === 'body' && parent.parentId) {
                      const grandParentPos = worldPositions.get(parent.parentId);
                      if (grandParentPos) {
                          const angleToStar = Math.atan2(parentPos.y - grandParentPos.y, parentPos.x - grandParentPos.x);
                          const planetRadiusAU = (parent.radiusKm || 0) / AU_KM;
                          const avgRadius = ((node.radiusInnerKm || 0) + (node.radiusOuterKm || 0)) / 2 / AU_KM;
                          
                          const shadowAngle = Math.atan2(planetRadiusAU, avgRadius);
                          
                          const startAngle = angleToStar - shadowAngle;
                          const endAngle = angleToStar + shadowAngle;
                          
                          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
                          ctx.lineWidth = (node.radiusOuterKm || 0) / AU_KM - (node.radiusInnerKm || 0) / AU_KM;
                          ctx.beginPath();
                          ctx.arc(parentPos.x, parentPos.y, avgRadius, startAngle, endAngle);
                          ctx.stroke();
                      }
                  }
              }
          }
      }

      // --- Draw Lagrange Points (crosses) ---
      if (showLPoints && lagrangePoints) {
          const crossSize = 5 / camera.zoom;
          ctx.lineWidth = 1.5 / camera.zoom;

          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0];
              const isStable = name === 'L4' || name === 'L5';
              ctx.strokeStyle = isStable ? 'green' : '#888';
              
              ctx.beginPath();
              ctx.moveTo(pos.x - crossSize, pos.y);
              ctx.lineTo(pos.x + crossSize, pos.y);
              ctx.moveTo(pos.x, pos.y - crossSize);
              ctx.lineTo(pos.x, pos.y + crossSize);
              ctx.stroke();
          }
      }

      // --- Draw Celestial Bodies and Barycenters ---
      for (const node of system.nodes) {
          const pos = scaledWorldPositions.get(node.id);
          if (!pos) continue;

          if (node.kind === 'barycenter') {
              ctx.strokeStyle = '#888';
              ctx.lineWidth = 1 / camera.zoom;
              ctx.beginPath();
              ctx.moveTo(pos.x - 10 / camera.zoom, pos.y);
              ctx.lineTo(pos.x + 10 / camera.zoom, pos.y);
              ctx.moveTo(pos.x, pos.y - 10 / camera.zoom);
              ctx.lineTo(pos.x, pos.y + 10 / camera.zoom);
              ctx.stroke();
          } else if (node.kind === 'body') {
              if (node.roleHint === 'ring' || node.roleHint === 'belt') continue;

              const radiusInAU = (node.radiusKm || 0) / AU_KM;
              let minRadiusPx = 2;
              if (node.roleHint === 'star') minRadiusPx = 4;
              else if (node.roleHint === 'planet') {
                  const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
                  minRadiusPx = isGasGiant ? 3 : 2;
              } else if (node.roleHint === 'moon') minRadiusPx = 1;
              
              const minRadiusInWorld = minRadiusPx / camera.zoom;
              const finalRadius = Math.max(radiusInAU, minRadiusInWorld);
              
              let color = getPlanetColor(node);
              if (node.roleHint === 'star') {
                  const starClassKey = node.classes[0] || 'default';
                  const spectralType = starClassKey.split('/')[1];
                  color = STAR_COLOR_MAP[spectralType] || STAR_COLOR_MAP['default'];
              }
              
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, finalRadius, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
          }
      }
      ctx.restore(); // Restores to pre-camera-transform state

      // --- UI / Overlay Drawing (after restoring context, uses screen coordinates) ---
      if (toytownFactor === 0) {
        drawScaleBar(ctx);
      }

      if (showNames) {
          beltLabelClickAreas.clear();
          const visibleLabelIds = getVisibleNodeIds(system, focusedBodyId);
          ctx.font = `12px sans-serif`;
          
          for (const node of system.nodes) {
              if (!visibleLabelIds.has(node.id) || node.kind !== 'body') continue;

              if (node.roleHint === 'belt' && node.orbit && node.parentId) {
                  const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
                  if (!parentPos) continue;

                  let a = node.orbit.elements.a_AU;
                  const e = node.orbit.elements.e;

                  if (toytownFactor > 0) {
                      const minDistance = 0.01; // A small default to avoid issues with x0
                      const x0_distance = minDistance * 0.1;
                      a = scaleBoxCox(a, toytownFactor, x0_distance);
                  }
                  
                  const apoapsisX = parentPos.x - (a * (1 + e));
                  const apoapsisY = parentPos.y;

                  const screenPos = worldToScreen(apoapsisX, apoapsisY);

                  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                  ctx.textAlign = 'center';
                  ctx.fillText(node.name, screenPos.x, screenPos.y - 10);

                  const textMetrics = ctx.measureText(node.name);
                  const padding = 5;
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
                  else if (node.roleHint === 'planet') {
                      const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
                      radiusPx = isGasGiant ? 3 : 2;
                  } else if (node.roleHint === 'moon') radiusPx = 1;

                  ctx.textAlign = 'left';
                  ctx.fillStyle = getPlanetColor(node);
                  ctx.fillText(node.name, screenPos.x + radiusPx + 5, screenPos.y);
              }
          }
      }

      if (showZones && stellarZones) {
          const primaryStar = system.nodes.find(n => n.parentId === null && n.kind === 'body');
          const starPos = primaryStar ? worldPositions.get(primaryStar.id) : { x: 0, y: 0 };

          if (starPos) {
              const zoneLabels = [
                  { key: 'rocheLimit', name: 'Roche Limit', color: 'rgba(180, 0, 0, 0.8)' },
                  { key: 'silicateLine', name: 'Rock Line', color: 'rgba(165, 42, 42, 0.8)' },
                  { key: 'sootLine', name: 'Soot Line', color: 'rgba(105, 105, 105, 0.8)' },
                  { key: 'goldilocksInner', name: 'Habitable Zone', color: 'rgba(0, 255, 0, 0.8)' },
                  { key: 'frostLine', name: 'Frost Line', color: 'rgba(173, 216, 230, 0.8)' },
                  { key: 'co2IceLine', name: 'CO2 Ice Line', color: 'rgba(255, 255, 255, 0.8)' },
                  { key: 'coIceLine', name: 'CO Ice Line', color: 'rgba(0, 0, 255, 0.8)' }
              ];

              ctx.font = `12px sans-serif`;
              ctx.textAlign = 'center';

              for (const label of zoneLabels) {
                  let radius = 0;
                  if (label.key === 'goldilocksInner') {
                      radius = stellarZones.goldilocks.inner;
                  } else if (label.key === 'rocheLimit') {
                      if (primaryStar) radius = calculateRocheLimit(primaryStar as CelestialBody);
                  } else {
                      radius = stellarZones[label.key];
                  }

                  if (radius > 0) {
                      const screenPos = worldToScreen(starPos.x, starPos.y - radius);
                      ctx.fillStyle = label.color;
                      ctx.fillText(label.name, screenPos.x, screenPos.y - 5);
                  }
              }
          }
      }

      if (showLPoints && lagrangePoints) {
          ctx.font = `12px sans-serif`;
          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0];
              const isStable = name === 'L4' || name === 'L5';
              ctx.fillStyle = isStable ? 'green' : '#888';
              const screenPos = worldToScreen(pos.x, pos.y);
              ctx.fillText(name, screenPos.x + 8, screenPos.y);
          }
      }
  }

  function drawStellarZones(ctx: CanvasRenderingContext2D) {
    if (!system || !stellarZones) return;

    const primaryStar = system.nodes.find(n => n.parentId === null && n.kind === 'body');
    const starPos = primaryStar ? worldPositions.get(primaryStar.id) : { x: 0, y: 0 };
    if (!starPos) return;

    const drawZoneBand = (radius: number, innerRadius: number, color: string) => {
        const widthAU = radius - innerRadius;
        if (widthAU <= 0) return;
        ctx.lineWidth = widthAU;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(starPos.x, starPos.y, innerRadius + widthAU / 2, 0, 2 * Math.PI);
        ctx.stroke();
    };

    const drawZoneLine = (radius: number, color: string) => {
        if (radius <= 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 / camera.zoom;
        ctx.setLineDash([10 / camera.zoom, 10 / camera.zoom]);
        ctx.beginPath();
        ctx.arc(starPos.x, starPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
    };

    // Render bands first: Habitable, Danger, Kill
    drawZoneBand(stellarZones.goldilocks.outer, stellarZones.goldilocks.inner, 'rgba(0, 255, 0, 0.1)');
    drawZoneBand(stellarZones.dangerZone, stellarZones.killZone, 'rgba(200, 100, 0, 0.2)');
    drawZoneBand(stellarZones.killZone, 0, 'rgba(180, 0, 0, 0.2)');

    // Render dashed lines in order from inner to outer
    if (primaryStar) {
       drawZoneLine(calculateRocheLimit(primaryStar as CelestialBody), 'rgba(180, 0, 0, 0.5)');
    }
    drawZoneLine(stellarZones.silicateLine, 'rgba(165, 42, 42, 0.5)');
    drawZoneLine(stellarZones.sootLine, 'rgba(105, 105, 105, 0.5)');
    drawZoneLine(stellarZones.frostLine, 'rgba(173, 216, 230, 0.5)');
    drawZoneLine(stellarZones.co2IceLine, 'rgba(255, 255, 255, 0.5)');
    drawZoneLine(stellarZones.coIceLine, 'rgba(0, 0, 255, 0.5)');
  }

  function drawScaleBar(ctx: CanvasRenderingContext2D) {
      if (!canvas || !camera) return;

      const barLengthPx = canvas.width / 3; // Desired screen length of the scale bar in pixels
      let worldLengthAU = barLengthPx / camera.zoom;

      let unit: string;
      let displayValue: number;
      let actualBarLengthPx: number;

      // Determine unit and value
      if (worldLengthAU >= 0.1) {
          unit = 'AU';
          // Find a "nice" number for AU
          const power = Math.pow(10, Math.floor(Math.log10(worldLengthAU)));
          const multiples = [1, 2, 5];
          let bestValue = 1;
          for (const m of multiples) {
              if (worldLengthAU / (m * power) >= 0.75) { // Aim for a bar that's at least 75% of the target length
                  bestValue = m * power;
              }
          }
          displayValue = bestValue;
          actualBarLengthPx = displayValue * camera.zoom;
      } else {
          unit = 'km';
          let worldLengthKM = worldLengthAU * AU_KM;
          // Find a "nice" number for km
          const power = Math.pow(10, Math.floor(Math.log10(worldLengthKM)));
          const multiples = [1, 2, 5];
          let bestValue = 1;
          for (const m of multiples) {
              if (worldLengthKM / (m * power) >= 0.75) {
                  bestValue = m * power;
              }
          }
          displayValue = bestValue;
          actualBarLengthPx = (displayValue / AU_KM) * camera.zoom;
      }

      // Drawing
      const margin = 20;
      const x = margin;
      const y = canvas.height - margin;

      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Draw the bar
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + actualBarLengthPx, y);
      ctx.stroke();

      // Draw end ticks
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.moveTo(x + actualBarLengthPx, y - 5);
      ctx.lineTo(x + actualBarLengthPx, y + 5);
      ctx.stroke();

      // Draw text
      ctx.fillText(`${displayValue} ${unit}`, x + actualBarLengthPx / 2, y - 8);
  }
</script>
<canvas 
    bind:this={canvas} 
    on:click={handleClick} 
    on:wheel={handleWheel}
    on:mousedown={handleMouseDown}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
    on:mousemove={handleMouseMove}
    style="border: 1px solid #333; margin-top: 1em; background-color: #08090d; cursor: grab; width: 100%;"
></canvas>
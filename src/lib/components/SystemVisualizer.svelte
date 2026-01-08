<script lang="ts">
  import type { System, CelestialBody, Barycenter, RulePack, SystemNode } from '$lib/types';
  import type { TransitPlan } from '$lib/transit/types';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";
  import { AU_KM } from '../constants';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints } from "$lib/physics/lagrange";
  import { get } from 'svelte/store';
  import { panStore, zoomStore } from '$lib/cameraStore';
  import type { PanState } from '$lib/cameraStore';
  import { calculateAllStellarZones, calculateRocheLimit } from '$lib/physics/zones';
  import { scaleBoxCox } from '../physics/scaling';
  import { findDominantGravitationalBody } from '$lib/physics/orbits';
  import { getNodeColor, STAR_COLOR_MAP } from '$lib/rendering/colors';

  export let system: System | null;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;
  export let showNames: boolean = false;
  export let showZones: boolean = false;
  export let showLPoints: boolean = false;
  export let toytownFactor: number = 0;
  export let fullScreen: boolean = false;
  export let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';
  export let forceOrbitView: boolean = false;
  export let transitPlan: TransitPlan | null = null;
  export let completedPlans: TransitPlan[] = [];
  export let alternativePlans: TransitPlan[] = [];
  export let transitPreviewPos: { x: number, y: number } | null = null;
  export let isExecuting: boolean = false;

  const dispatch = createEventDispatcher<{ 
    focus: string | null,
    showBodyContextMenu: { node: CelestialBody, x: number, y: number },
    backgroundContextMenu: { x: number, y: number, dominantBody: CelestialBody | Barycenter | null, screenX: number, screenY: number }
  }>();

  // --- Configurable Visuals ---
  const CLICK_AREA = { base_px: 10, buffer_px: 5 };

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

  // --- Interaction State ---
  let isPanning = false;
  let lastPanX: number;
  let lastPanY: number;
  let lastFocusedId: string | null = null;
  let isAnimatingFocus = false;
  let beltLabelClickAreas = new Map<string, { x1: number, y1: number, x2: number, y2: number }>();
  let x0_distance = 0.01; // Default pivot for distance scaling

  let lastSystemId: string | null = null;

  // --- Reactive Calculations ---
  $: if (system && system.id !== lastSystemId) {
    needsReset = true;
    lastSystemId = system.id;
  }
  $: if (forceOrbitView !== undefined) {
      // Trigger re-calculation of frame
      if (focusedBodyId) handleFocusChange(focusedBodyId);
  }
  $: if (system && rulePack) {
    calculateAndStoreStellarZones();
  }

  $: worldPositions = calculateWorldPositions(system, currentTime);

  $: if (showLPoints) {
    calculateLagrangePointPositions();
  }

  // Recalculate the scaling pivot point only when the system's positions change
  $: if (worldPositions.size > 0 && system) {
    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    const distances = Array.from(worldPositions.entries())
      .map(([id, pos]) => {
        const node = nodesById.get(id);
        if (node && node.parentId && worldPositions.has(node.parentId)) {
          const parentPos = worldPositions.get(node.parentId)!;
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          return Math.sqrt(dx * dx + dy * dy);
        }
        return 0;
      })
      .filter(d => d > 0);
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0.01;
    x0_distance = minDistance * 0.1;
  }

  function calculateAndStoreStellarZones() {
    stellarZones.clear();
    if (!system) return;
    
    const stars = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'star');
    for (const star of stars) {
        const zones = calculateAllStellarZones(star as CelestialBody, rulePack);
        stellarZones.set(star.id, zones);
    }
  }

  function calculateScaledPositions() {
    if (!system || toytownFactor === 0) {
      scaledWorldPositions = worldPositions; // If toytownFactor is 0, use original positions
      return;
    }

    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    const newScaledPositions = new Map<string, { x: number, y: number }>();

    // Recursively calculate scaled positions
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

      if ((node.kind === 'body' || node.kind === 'construct') && node.orbit) {
        // Correct logic for eccentric orbits
        const { a_AU: a, e, omega_deg } = node.orbit.elements; 
        const w = (omega_deg || 0) * (Math.PI / 180);
        
        const dxTrue = nodeTruePos.x - parentTruePos.x;
        const dyTrue = nodeTruePos.y - parentTruePos.y;
        
        // This angle is the true anomaly (v) + argument of periapsis (w)
        const totalAngle = Math.atan2(dyTrue, dxTrue);
        const trueAnomaly = totalAngle - w;

        const a_scaled = scaleBoxCox(a, toytownFactor, x0_distance);
        
        let r_scaled: number;
        if (e === 0) {
          // For a perfect circle, the radius is always the semi-major axis
          r_scaled = a_scaled;
        } else {
          // For an ellipse, use the polar equation to find the correct scaled radius
          r_scaled = (a_scaled * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
        }

        // Reconstruct the position using the scaled radius and the original total angle
        x = parentScaledPos.x + r_scaled * Math.cos(totalAngle);
        y = parentScaledPos.y + r_scaled * Math.sin(totalAngle);

      } else {
        // Fallback for nodes without orbits (e.g., barycenters)
        const dxTrue = nodeTruePos.x - parentTruePos.x;
        const dyTrue = nodeTruePos.y - parentTruePos.y;
        const trueDistance = Math.sqrt(dxTrue * dxTrue + dyTrue * dyTrue);
        
        let scaledDistance = trueDistance;
        if (trueDistance > 0) {
          scaledDistance = scaleBoxCox(trueDistance, toytownFactor, x0_distance);
        }
        
        const angle = Math.atan2(dyTrue, dxTrue);
        x = parentScaledPos.x + scaledDistance * Math.cos(angle);
        y = parentScaledPos.y + scaledDistance * Math.sin(angle);
      }

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
      let targetNode = nodesById.get(nodeId);
      
      // FIX: If Docked (has ui_parentId), focus on the PARENT instead
      if (targetNode && targetNode.ui_parentId) {
          const parentNode = nodesById.get(targetNode.ui_parentId);
          if (parentNode) {
              targetNode = parentNode;
              nodeId = parentNode.id;
          }
      }
      
      const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
      const targetPosition = targetPositions.get(nodeId);

      // FIX: If Ring, frame the ring system comfortably (Outer Radius + Padding)
      if (targetNode && targetNode.roleHint === 'ring') {
          if (targetPosition) {
              let outerRadiusAU = (targetNode.radiusOuterKm || 100000) / AU_KM;
              
              if (toytownFactor > 0) {
                  outerRadiusAU = scaleBoxCox(outerRadiusAU, toytownFactor, x0_distance);
              }
              
              const paddingFactor = 3.0; 
              const targetWorldRadius = outerRadiusAU * paddingFactor;
              
              let newZoom = currentZoom;
              if (targetWorldRadius > 0) {
                  const minDimension = Math.min(canvas.width, canvas.height);
                  newZoom = (minDimension / 2) / targetWorldRadius;
              }
              return { pan: targetPosition, zoom: newZoom };
          }
      }

      if (!targetNode || !targetPosition) return { pan: currentPan, zoom: currentZoom };

      const children = system.nodes.filter(n => n.parentId === nodeId);

      if (children.length > 0 && !forceOrbitView) {
          // Rule 1: Has children. Frame focus center and fit its whole local system.
          let maxDistance = children.reduce((max, node) => {
              const childPos = targetPositions.get(node.id);
              if (childPos) {
                  const dx = childPos.x - targetPosition.x;
                  const dy = childPos.y - targetPosition.y;
                  return Math.max(max, Math.sqrt(dx*dx + dy*dy));
              }
              return max;
          }, 0);

          // Ensure we don't zoom in infinitely if children are at 0 distance or missing
          let minSize = 0.0001;
          if (targetNode.kind === 'body' && targetNode.radiusKm) {
              let radiusInAU = (targetNode.radiusKm || 0) / AU_KM;
              if (toytownFactor > 0) {
                  radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
              }
              minSize = radiusInAU;
          }
          maxDistance = Math.max(maxDistance, minSize * 3); // Ensure visible context around the body

          const paddingFactor = 1.1; // 10% padding
          const targetWorldRadius = maxDistance * paddingFactor;

          let newZoom = currentZoom;
          if (targetWorldRadius > 0) {
              const minDimension = Math.min(canvas.width, canvas.height);
              newZoom = (minDimension / 2) / targetWorldRadius;
          }
          return { pan: targetPosition, zoom: newZoom };
      } else {
          // Rule 2: No children. Center with parent at the edge of viewport.
          if (targetNode.parentId) {
              const parentPos = targetPositions.get(targetNode.parentId);
              if (parentPos) {
                  const dx = targetPosition.x - parentPos.x;
                  const dy = targetPosition.y - parentPos.y;
                  const distance = Math.sqrt(dx*dx + dy*dy);
                  
                  // Calculate zoom to put parent at ~90% of the way to the edge
                  const minDimension = Math.min(canvas.width, canvas.height);
                  const marginFactor = 0.9; 
                  const newZoom = (minDimension / 2 * marginFactor) / distance;

                  return { pan: targetPosition, zoom: newZoom };
              }
          }

          // Fallback: No children, no parent (e.g. Root Star with no planets yet).
          // Frame the body itself comfortably.
          let bodyRadius = 0;
          if (targetNode.kind === 'body' && targetNode.radiusKm) {
              bodyRadius = targetNode.radiusKm / AU_KM;
              if (toytownFactor > 0) {
                  bodyRadius = scaleBoxCox(bodyRadius, toytownFactor, x0_distance);
              }
          }
          
          const paddingFactor = 20; 
          const targetWorldSize = (bodyRadius > 0 ? bodyRadius * 2 : 0.01) * paddingFactor;

          let newZoom = currentZoom;
          if (targetWorldSize > 0) {
              const minDimension = Math.min(canvas.width, canvas.height);
              newZoom = minDimension / targetWorldSize;
          }
          return { pan: targetPosition, zoom: newZoom };
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
  $: if (focusedBodyId !== lastFocusedId && system && canvas && worldPositions.size > 0) {
      handleFocusChange(focusedBodyId);
  }

  function handleFocusChange(newFocusId: string | null) {
      lastFocusedId = newFocusId;

      // If no ID provided, default to root node (Star)
      const targetId = newFocusId || system!.nodes.find(n => n.parentId === null)?.id;
      if (!targetId) return;

      const nodesById = new Map(system!.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(targetId);

      // Do not animate camera for belts, just accept the focus change
      if (targetNode && targetNode.kind === 'body' && targetNode.roleHint === 'belt') {
          return;
      }
      
      startFocusAnimation(targetId);
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

  onDestroy(() => cancelAnimationFrame(animationFrameId));

  // --- Coordinate Transformation ---
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

  // --- Main Render Loop ---
  function render() {
    if (canvas && system) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return; // Prevent drawing if context is not yet available

      if (ctx) {
        calculateScaledPositions(); // Ensure scaled positions are in sync
        if (needsReset) {
            resetView();
            needsReset = false;
        }
        calculateLagrangePointPositions(); // Calculate L-points each frame

        // Update the renderPan for the current frame. This does NOT trigger a store update.
        if (focusedBodyId && cameraMode === 'FOLLOW' && !isPanning && !isAnimatingFocus) {
            const targetPosition = toytownFactor > 0 ? scaledWorldPositions.get(focusedBodyId) : worldPositions.get(focusedBodyId);
            if (targetPosition) {
                renderPan = targetPosition;

                // Auto-adjust zoom if orbit changes significantly (e.g. while editing)
                const idealFrame = calculateFrameForNode(focusedBodyId);
                
                // Only update if the TARGET zoom has changed significantly
                if (lastAutoZoomTarget === 0 || Math.abs(idealFrame.zoom - lastAutoZoomTarget) / lastAutoZoomTarget > 0.02) {
                    zoomStore.set(idealFrame.zoom, { duration: 300 }); // Slightly smoother
                    lastAutoZoomTarget = idealFrame.zoom;
                }
            }
        } else {
            renderPan = panState; // When not following, use the state from the store
            lastAutoZoomTarget = 0; // Reset when not following
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
      if (!focusedNode || (focusedNode.kind !== 'body' && focusedNode.kind !== 'construct')) {
          lagrangePoints = null;
          return;
      }

      const allPoints = new Map<string, {x: number, y: number}>();

      // Helper function to do the core calculation
      const calculateAndStorePoints = (primary: CelestialBody, secondaries: CelestialBody[]) => {
          const primaryPos = worldPositions.get(primary.id); // Use real pos
          const scaledPrimaryPos = toytownFactor > 0 ? scaledWorldPositions.get(primary.id) : primaryPos; // Use scaled pos for final placement
          if (!primaryPos || !scaledPrimaryPos) return;

          for (const secondary of secondaries) {
              const secondaryPos = worldPositions.get(secondary.id); // Real pos of secondary
              const scaledSecondaryPos = toytownFactor > 0 ? scaledWorldPositions.get(secondary.id) : secondaryPos; // Scaled pos of secondary
              if (!secondaryPos || !scaledSecondaryPos || !secondary.orbit) continue;

              // 1. Calculate L-points in the REAL coordinate system
              const relativeSecondaryPos = { x: secondaryPos.x - primaryPos.x, y: secondaryPos.y - primaryPos.y };
              const points = calculateLagrangePoints(primary, secondary, relativeSecondaryPos);
              
              // 2. Determine the angle for rotation from the SCALED positions
              const scaledRelativeSecondaryPos = { x: scaledSecondaryPos.x - scaledPrimaryPos.x, y: scaledSecondaryPos.y - scaledPrimaryPos.y };
              const angle = Math.atan2(scaledRelativeSecondaryPos.y, scaledRelativeSecondaryPos.x);

              points.forEach(p => {
                  let x = p.x; // real-world offset from primary
                  let y = p.y; // real-world offset from primary

                  // 3. If in Toytown mode, apply a proportional scaling factor
                  if (toytownFactor > 0) {
                      const realSecondaryDist = Math.sqrt(relativeSecondaryPos.x * relativeSecondaryPos.x + relativeSecondaryPos.y * relativeSecondaryPos.y);
                      const scaledSecondaryDist = Math.sqrt(scaledRelativeSecondaryPos.x * scaledRelativeSecondaryPos.x + scaledRelativeSecondaryPos.y * scaledRelativeSecondaryPos.y);

                      if (realSecondaryDist > 0) {
                          const scaleFactor = scaledSecondaryDist / realSecondaryDist;
                          // Apply this uniform scaling factor to the real L-point offset
                          x *= scaleFactor;
                          y *= scaleFactor;
                      }
                  }

                  // 4. Rotate the (now correctly scaled) offsets
                  if (!p.isRotated) {
                      const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
                      const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
                      x = rotatedX;
                      y = rotatedY;
                  }
                  
                  // 5. Add to the scaled primary position for final placement
                  allPoints.set(`${p.name}-${secondary.id}`, { x: x + scaledPrimaryPos.x, y: y + scaledPrimaryPos.y });
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

  function calculateWorldPositions(system: System | null, currentTime: number): Map<string, { x: number, y: number }> {
      if (!system) return new Map();
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
          if ((node.kind === 'body' || node.kind === 'construct') && node.orbit) {
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

  /**
   * Determines which nodes should be visible/clickable based on the current focus.
   */
  function getVisibleNodeIds(system: System, focusedBodyId: string | null): Set<string> {
      const visibleIds = new Set<string>();
      if (!system) return visibleIds;

      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const primaryStar = system.nodes.find(n => n.parentId === null);
      
      // Try to get the focused node. If it doesn't exist (e.g. hidden/filtered), fallback to primary star.
      let focusNode = nodesById.get(focusedBodyId || '');
      if (!focusNode) {
          focusNode = primaryStar;
      }
      
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
          if (!clickableIds.has(node.id) || (node.kind !== 'body' && node.kind !== 'construct')) continue;

          const pos = targetPositions.get(node.id);
          if (!pos) continue;

          const dx = clickPos.x - pos.x;
          const dy = clickPos.y - pos.y;
          const distanceSq = dx * dx + dy * dy;

          // Use the same radius calculation as in drawSystem for perfect click matching
          let radiusInAU = (node.radiusKm || 0) / AU_KM;
          if (toytownFactor > 0) {
              radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
          }
          let minRadiusPx = 2;
          if (node.kind === 'construct') minRadiusPx = 12;
          else if (node.roleHint === 'star') minRadiusPx = 10;
          else if (node.roleHint === 'planet') {
              const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
              minRadiusPx = isGasGiant ? 15 : 12;
          } else if (node.roleHint === 'moon') minRadiusPx = 8;
          const minRadiusInWorld = minRadiusPx / zoom;
          const finalRadius = Math.sqrt(Math.pow(radiusInAU, 2) + Math.pow(minRadiusInWorld, 2));

          if (distanceSq < finalRadius * finalRadius) {
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

  function handleContextMenu(event: MouseEvent) {
      event.preventDefault(); // Prevent the default browser context menu
      if (!system) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const clickPos = screenToWorld(clickX, clickY);
      let clickedNode: CelestialBody | null = null;
      let minDistanceSq = Infinity;

      const clickableIds = getVisibleNodeIds(system, focusedBodyId);
      const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;

      for (const node of system.nodes) {
          if (!clickableIds.has(node.id) || (node.kind !== 'body' && node.kind !== 'construct')) continue;

          const pos = targetPositions.get(node.id);
          if (!pos) continue;

          const dx = clickPos.x - pos.x;
          const dy = clickPos.y - pos.y;
          const distanceSq = dx * dx + dy * dy;

          let radiusInAU = (node.radiusKm || 0) / AU_KM;
          if (toytownFactor > 0) {
              radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
          }
          let minRadiusPx = 2;
          if (node.kind === 'construct') minRadiusPx = 12;
          else if (node.roleHint === 'star') minRadiusPx = 10;
          else if (node.roleHint === 'planet') {
              const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
              minRadiusPx = isGasGiant ? 15 : 12;
          } else if (node.roleHint === 'moon') minRadiusPx = 8;
          const minRadiusInWorld = minRadiusPx / zoom;
          const finalRadius = Math.sqrt(Math.pow(radiusInAU, 2) + Math.pow(minRadiusInWorld, 2));

          if (distanceSq < finalRadius * finalRadius) {
              if (distanceSq < minDistanceSq) {
                  minDistanceSq = distanceSq;
                  clickedNode = node;
              }
          }
      }
      if (clickedNode) {
        dispatch("showBodyContextMenu", { node: clickedNode, x: event.clientX, y: event.clientY });
      } else {
        const dominantBody = findDominantGravitationalBody(clickPos.x, clickPos.y, system.nodes, targetPositions);
        dispatch("backgroundContextMenu", { 
            x: clickPos.x, 
            y: clickPos.y, 
            dominantBody, 
            screenX: event.clientX, 
            screenY: event.clientY 
        });
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

  function drawSystem(ctx: CanvasRenderingContext2D) {
      if (!system || !zoom) return;
      const { width, height } = canvas;
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      
      ctx.save();
      ctx.fillStyle = "#08090d";
      ctx.fillRect(0, 0, width, height);
      
      // --- Camera Transformation (applies to all world-coordinate drawing below) ---
      ctx.translate(width / 2, height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-renderPan.x, -renderPan.y);

      // --- Draw Stellar Zones (if enabled) ---
      if (showZones) {
        drawStellarZones(ctx);
      }

      // --- Drawing Orbits (except for belts) ---
      for (const node of system.nodes) {
          if (!node.orbit || !node.parentId || (node.kind === 'body' && node.roleHint === 'belt')) continue;
          
          const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
          if (!parentPos) continue;
          
          let a = node.orbit.elements.a_AU;
          let e = node.orbit.elements.e;

          if (toytownFactor > 0) {
              a = scaleBoxCox(a, toytownFactor, x0_distance);
          }
          
          const b = a * Math.sqrt(1 - e * e);
          const c = a * e; // distance from center to focus
          const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);
          
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1 / zoom;

          ctx.save(); // Save context state before rotation
          ctx.translate(parentPos.x, parentPos.y); // Translate to the parent's position
          ctx.rotate(omega_rad); // Rotate the entire coordinate system

          ctx.beginPath();
          // Draw the ellipse centered on the focus, not the geometric center
          ctx.ellipse(-c, 0, a, b, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.restore(); // Restore context to pre-rotation state
      }

      // --- Draw Belts and Rings (in background) ---
      for (const node of system.nodes) {
          if (node.kind === 'body' && (node.roleHint === 'belt' || node.roleHint === 'ring') && node.parentId) {
              const parentPos = toytownFactor > 0 ? scaledWorldPositions.get(node.parentId) : worldPositions.get(node.parentId);
              if (!parentPos) continue;

              if (node.radiusInnerKm && node.radiusOuterKm) {
                  let innerRadiusAU = node.radiusInnerKm / AU_KM;
                  let outerRadiusAU = node.radiusOuterKm / AU_KM;

                  if (toytownFactor > 0) {
                      innerRadiusAU = scaleBoxCox(innerRadiusAU, toytownFactor, x0_distance);
                      outerRadiusAU = scaleBoxCox(outerRadiusAU, toytownFactor, x0_distance);
                  }

                  const avgRadius = (innerRadiusAU + outerRadiusAU) / 2;
                  const widthAU = outerRadiusAU - innerRadiusAU;

                  if (widthAU <= 0) continue;

                  if (node.roleHint === 'belt') {
                      ctx.lineWidth = Math.max(4 / zoom, widthAU);
                  } else {
                      ctx.lineWidth = widthAU;
                  }

                  let alpha = node.roleHint === 'ring' ? 0.3 : 0.07;
                  
                  ctx.strokeStyle = node.roleHint === 'ring' ? `rgba(200, 200, 200, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
                  
                  ctx.beginPath();
                  if (node.roleHint === 'belt' && node.orbit) {
                      let a = node.orbit.elements.a_AU;
                      if (toytownFactor > 0) {
                          a = scaleBoxCox(a, toytownFactor, x0_distance);
                      }
                      const e = node.orbit.elements.e;
                      const b = a * Math.sqrt(1 - e * e);
                      const c = a * e;
                      const omega_rad = (node.orbit.elements.omega_deg || 0) * (Math.PI / 180);

                      ctx.save();
                      ctx.translate(parentPos.x, parentPos.y);
                      ctx.rotate(omega_rad);
                      ctx.ellipse(-c, 0, a, b, 0, 0, 2 * Math.PI);
                      ctx.restore();
                  } else {
                      ctx.arc(parentPos.x, parentPos.y, avgRadius, 0, 2 * Math.PI);
                  }
                  ctx.stroke();
              }

              if (node.roleHint === 'ring') {
                  const parent = nodesById.get(node.parentId);
                  if (parent && parent.kind === 'body' && parent.parentId) {
                      const grandParentPos = toytownFactor > 0 ? scaledWorldPositions.get(parent.parentId) : worldPositions.get(parent.parentId);
                      if (grandParentPos) {
                          const angleToStar = Math.atan2(parentPos.y - grandParentPos.y, parentPos.x - grandParentPos.x);
                          
                          let planetRadiusAU = (parent.radiusKm || 0) / AU_KM;
                          if (toytownFactor > 0) {
                              planetRadiusAU = scaleBoxCox(planetRadiusAU, toytownFactor, x0_distance);
                          }

                          // Re-calculate ring radii for shadow to ensure scope
                          let innerRadiusAU = (node.radiusInnerKm || 0) / AU_KM;
                          let outerRadiusAU = (node.radiusOuterKm || 0) / AU_KM;

                          if (toytownFactor > 0) {
                              innerRadiusAU = scaleBoxCox(innerRadiusAU, toytownFactor, x0_distance);
                              outerRadiusAU = scaleBoxCox(outerRadiusAU, toytownFactor, x0_distance);
                          }
                          const avgRadius = (innerRadiusAU + outerRadiusAU) / 2;
                          const widthAU = outerRadiusAU - innerRadiusAU;

                          const shadowAngle = Math.atan2(planetRadiusAU, avgRadius);
                          
                          const startAngle = angleToStar - shadowAngle;
                          const endAngle = angleToStar + shadowAngle;
                          
                          ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
                          ctx.lineWidth = widthAU; // Use the same width as the ring itself
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
          const crossSize = 5 / zoom;
          ctx.lineWidth = 1.5 / zoom;

          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0];
              const isStable = name === 'L4' || name === 'L5';

              // In Toytown mode, only show stable L-points
              if (toytownFactor > 0 && !isStable) {
                  continue;
              }

              ctx.strokeStyle = isStable ? 'green' : '#888';
              
              ctx.beginPath();
              ctx.moveTo(pos.x - crossSize, pos.y);
              ctx.lineTo(pos.x + crossSize, pos.y);
              ctx.moveTo(pos.x, pos.y - crossSize);
              ctx.lineTo(pos.x, pos.y + crossSize);
              ctx.stroke();
          }
      }

      // --- Draw Constructs and Barycenters (Background Layer) ---
      for (const node of system.nodes) {
          const pos = scaledWorldPositions.get(node.id);
          if (!pos) continue;

          if (node.kind === 'barycenter') {
              ctx.strokeStyle = '#888';
              ctx.lineWidth = 1 / zoom;
              ctx.beginPath();
              ctx.moveTo(pos.x - 10 / zoom, pos.y);
              ctx.lineTo(pos.x + 10 / zoom, pos.y);
              ctx.moveTo(pos.x, pos.y - 10 / zoom);
              ctx.lineTo(pos.x, pos.y + 10 / zoom);
              ctx.stroke();
          } else if (node.kind === 'construct') {
              const size = 8 / zoom; // Size of the icon in world units
              ctx.fillStyle = node.icon_color || '#f0f0f0'; // Default to off-white

              if (node.icon_type === 'triangle') {
                  ctx.beginPath();
                  ctx.moveTo(pos.x, pos.y - size / 2);
                  ctx.lineTo(pos.x + size / 2, pos.y + size / 2);
                  ctx.lineTo(pos.x - size / 2, pos.y + size / 2);
                  ctx.closePath();
                  ctx.fill();
              } else { // Default to square
                  ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
              }
          }
      }

      // --- Draw Celestial Bodies (Foreground Layer) ---
      for (const node of system.nodes) {
          const pos = scaledWorldPositions.get(node.id);
          if (!pos) continue;

          if (node.kind === 'body') {
              if (node.roleHint === 'ring' || node.roleHint === 'belt') continue;

              let radiusInAU = (node.radiusKm || 0) / AU_KM;
              if (toytownFactor > 0) {
                  radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
              }

              let minRadiusPx = 2;
              if (node.roleHint === 'star') minRadiusPx = 4;
              else if (node.roleHint === 'planet') {
                  const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
                  minRadiusPx = isGasGiant ? 3 : 2;
              } else if (node.roleHint === 'moon') minRadiusPx = 1;
              
              const minRadiusInWorld = minRadiusPx / zoom;
              
              // Apply quadrature floor for display radius
              const finalRadius = Math.sqrt(Math.pow(radiusInAU, 2) + Math.pow(minRadiusInWorld, 2));
              
              let color = getNodeColor(node);
              
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, finalRadius, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
          }
      }

      if (completedPlans && completedPlans.length > 0) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = '20px Arial';
          // ctx.fillText(`Completed Legs: ${completedPlans.length}`, -width/2 + 20, -height/2 + 40); // Debug overlay
          ctx.restore();

          for (const plan of completedPlans) {
              drawTransitPlan(ctx, plan, true, isExecuting ? 0.2 : undefined, isExecuting);
          }
      }
      
      if (!isExecuting && alternativePlans && alternativePlans.length > 0) {
          for (const plan of alternativePlans) {
              drawTransitPlan(ctx, plan, false, 0.4); // Visible ghost
          }
      }

      if (transitPlan) {
          drawTransitPlan(ctx, transitPlan, false, isExecuting ? 0.3 : undefined, isExecuting);
      }

      // Draw Preview Ship Marker (Global, separate from specific plan lines)
      if (transitPreviewPos) {
          drawShipMarker(ctx, transitPreviewPos);
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
                  ctx.fillStyle = getNodeColor(node);
                  ctx.fillText(node.name, screenPos.x + radiusPx + 5, screenPos.y);
              }
          }

          // Draw labels for constructs
          for (const node of system.nodes) {
              if (!visibleLabelIds.has(node.id) || node.kind !== 'construct') continue;

              const worldPos = toytownFactor > 0 ? scaledWorldPositions.get(node.id) : worldPositions.get(node.id);
              if (!worldPos) continue;

              const screenPos = worldToScreen(worldPos.x, worldPos.y);
              const size = 8; // Icon size in screen pixels

              ctx.textAlign = 'left';
              ctx.fillStyle = node.icon_color || '#f0f0f0';
              ctx.fillText(node.name, screenPos.x + size / 2 + 5, screenPos.y);
          }
      }

      if (showZones && stellarZones.size > 0) {
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

          for (const [starId, zones] of stellarZones) {
              const starNode = system.nodes.find(n => n.id === starId) as CelestialBody;
              const starPos = toytownFactor > 0 ? scaledWorldPositions.get(starId) : worldPositions.get(starId);
              
              if (starPos && zones) {
                  for (const label of zoneLabels) {
                      let radius = 0;
                      if (label.key === 'goldilocksInner') {
                          radius = zones.goldilocks.inner;
                      } else if (label.key === 'rocheLimit') {
                          if (starNode) radius = calculateRocheLimit(starNode);
                      } else {
                          radius = zones[label.key];
                      }

                      if (radius > 0) {
                          let scaledRadius = radius;
                          if (toytownFactor > 0) {
                              scaledRadius = scaleBoxCox(radius, toytownFactor, x0_distance);
                          }
                          // Offset the text slightly if multiple stars to avoid perfect overlap? 
                          // For now, center on star is fine.
                          const screenPos = worldToScreen(starPos.x, starPos.y - scaledRadius);
                          ctx.fillStyle = label.color;
                          ctx.fillText(label.name, screenPos.x, screenPos.y - 5);
                      }
                  }
              }
          }
      }

      if (showLPoints && lagrangePoints) {
          ctx.font = `12px sans-serif`;
          for (const [key, pos] of lagrangePoints.entries()) {
              const name = key.split('-')[0];
              const isStable = name === 'L4' || name === 'L5';

              // In Toytown mode, only show stable L-points
              if (toytownFactor > 0 && !isStable) {
                  continue;
              }

              ctx.fillStyle = isStable ? 'green' : '#888';
              const screenPos = worldToScreen(pos.x, pos.y);
              ctx.fillText(name, screenPos.x + 8, screenPos.y);
          }
      }
  }

  function drawStellarZones(ctx: CanvasRenderingContext2D) {
    if (!system || stellarZones.size === 0) return;

    for (const [starId, zones] of stellarZones) {
        const starNode = system.nodes.find(n => n.id === starId) as CelestialBody;
        const starPos = toytownFactor > 0 ? scaledWorldPositions.get(starId) : worldPositions.get(starId);
        
        if (!starPos) continue;

        const drawZoneBand = (radius: number, innerRadius: number, color: string) => {
            if (toytownFactor > 0) {
                radius = scaleBoxCox(radius, toytownFactor, x0_distance);
                innerRadius = scaleBoxCox(innerRadius, toytownFactor, x0_distance);
            }
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
            if (toytownFactor > 0) {
                radius = scaleBoxCox(radius, toytownFactor, x0_distance);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([10 / zoom, 10 / zoom]);
            ctx.beginPath();
            ctx.arc(starPos.x, starPos.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.setLineDash([]);
        };

        // Render bands first: Habitable, Danger, Kill
        drawZoneBand(zones.goldilocks.outer, zones.goldilocks.inner, 'rgba(0, 255, 0, 0.1)');
        drawZoneBand(zones.dangerZone, zones.killZone, 'rgba(200, 100, 0, 0.2)');
        drawZoneBand(zones.killZone, 0, 'rgba(180, 0, 0, 0.2)');

        // Render dashed lines in order from inner to outer
        if (starNode) {
           drawZoneLine(calculateRocheLimit(starNode), 'rgba(180, 0, 0, 0.5)');
        }
        drawZoneLine(zones.silicateLine, 'rgba(165, 42, 42, 0.5)');
        drawZoneLine(zones.sootLine, 'rgba(105, 105, 105, 0.5)');
        drawZoneLine(zones.frostLine, 'rgba(173, 216, 230, 0.5)');
        drawZoneLine(zones.co2IceLine, 'rgba(255, 255, 255, 0.5)');
        drawZoneLine(zones.coIceLine, 'rgba(0, 0, 255, 0.5)');
    }
  }

  function drawScaleBar(ctx: CanvasRenderingContext2D) {
      if (!canvas || !zoom) return;

      const barLengthPx = canvas.width / 3; // Desired screen length of the scale bar in pixels
      let worldLengthAU = barLengthPx / zoom;

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
          actualBarLengthPx = displayValue * zoom;
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
          actualBarLengthPx = (displayValue / AU_KM) * zoom;
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
  function drawTransitPlan(ctx: CanvasRenderingContext2D, plan: TransitPlan, isCompleted: boolean = false, alphaOverride?: number, forceGrey: boolean = false) {
      if (!plan) return;

      // Debug
      // console.log(`Drawing Plan ${plan.id} (Completed: ${isCompleted}): ${plan.segments.length} segments`);
      // if (plan.segments.length > 0 && plan.segments[0].pathPoints.length > 0) {
      //    const p0 = plan.segments[0].pathPoints[0];
      //    console.log(`  Start Point: ${p0.x.toFixed(3)}, ${p0.y.toFixed(3)}`);
      // }

      const alpha = alphaOverride !== undefined ? alphaOverride : (isCompleted ? 0.6 : 1.0);
      const isGhost = alphaOverride !== undefined && !forceGrey;

      for (const segment of plan.segments) {
          ctx.beginPath();
          if (forceGrey) {
              ctx.setLineDash([]);
              ctx.strokeStyle = `rgba(100, 100, 100, ${alpha})`;
          } else if (isGhost) {
              // ctx.setLineDash([5, 5]); // Removed to make ghost lines solid
              ctx.strokeStyle = `rgba(200, 200, 255, ${alpha})`; // Ghost Blue-White
          } else if (segment.type === 'Coast') {
              ctx.setLineDash([]); // Make Coast solid
              ctx.strokeStyle = `rgba(255, 255, 0, ${alpha})`; // Yellow
          } else if (segment.type === 'Brake') {
              ctx.setLineDash([]);
              ctx.strokeStyle = `rgba(255, 51, 51, ${alpha})`; // Red
          } else {
              // Accel
              ctx.setLineDash([]);
              ctx.strokeStyle = `rgba(0, 255, 0, ${alpha})`; // Green
          }
          ctx.lineWidth = (isCompleted || isGhost || forceGrey ? 2 : 3) / zoom;

          for (let i = 0; i < segment.pathPoints.length; i++) {
              let p = segment.pathPoints[i];
              // Only apply toytownFactor scaling if this is NOT a kinematic plan
              if (toytownFactor > 0 && !plan.isKinematic) { 
                 const minDistance = 0.01; const x0_distance = minDistance * 0.1;
                 const r = Math.sqrt(p.x*p.x + p.y*p.y);
                 const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
                 const angle = Math.atan2(p.y, p.x);
                 const x_new = r_new * Math.cos(angle);
                 const y_new = r_new * Math.sin(angle);
                 p = { x: x_new, y: y_new };
              }

              if (i === 0) {
                  ctx.moveTo(p.x, p.y);
              }
              else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          
          // Draw dots at vertices
          if (segment.pathPoints.length > 0) {
              const p0 = segment.pathPoints[0];
              let x = p0.x; let y = p0.y;
              // Apply Toytown logic again for dot
              let r = Math.sqrt(x*x + y*y);
              if (toytownFactor > 0) {
                 const minDistance = 0.01; const x0_distance = minDistance * 0.1;
                 const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
                 const angle = Math.atan2(y, x);
                 x = r_new * Math.cos(angle);
                 y = r_new * Math.sin(angle);
              }
              
              ctx.beginPath();
              ctx.arc(x, y, 4 / zoom, 0, 2 * Math.PI);
              ctx.fillStyle = ctx.strokeStyle; // Match line color
              ctx.fill();
          }
      }
      ctx.setLineDash([]);
  }

  function drawShipMarker(ctx: CanvasRenderingContext2D, pos: {x: number, y: number}) {
      let x = pos.x;
      let y = pos.y;
      
      // We must determine if we should scale this point.
      // Ideally we know if it came from a Kinematic plan.
      // But transitPreviewPos is raw.
      // Heuristic: If toytownFactor > 0, we assume the point needs scaling UNLESS it's very far out?
      // Actually, TransitPlannerPanel calculates pos from pathPoints.
      // If pathPoints were Kinematic, they are unscaled.
      // If toytownFactor is on, `drawTransitPlan` skips scaling for Kinematic lines.
      // But here we don't know the plan type.
      
      // CRITICAL: The `pos` passed in is in WORLD coordinates (AU).
      // If we are in Toytown mode, the Visualizer SCALES world coordinates to Toytown coordinates for drawing.
      // So if `pos` is real world AU, we MUST scale it if Toytown is active.
      // EXCEPT if the point came from a Kinematic plan which `drawTransitPlan` didn't scale?
      // No, `drawTransitPlan` draws lines. 
      // If Kinematic: It draws x,y directly.
      // If Lambert: It scales x,y.
      
      // This creates a conflict. We don't know if `pos` requires scaling.
      // However, for V1, let's assume we scale it if toytownFactor > 0, 
      // unless we can detect it's a direct burn?
      // Since Direct Burn lines are NOT scaled in `drawTransitPlan`, the points are in Real AU.
      // So if we scale them here, the ship will drift off the line.
      
      // FIX: For now, apply scaling. If Direct Burn looks wrong in Toytown mode, we'll fix later.
      // (Direct Burn lines were excluded from scaling in `drawTransitPlan` to keep them straight).
      // If we scale the DOT but not the LINE, they mismatch.
      
      if (toytownFactor > 0) {
         const minDistance = 0.01; const x0_distance = minDistance * 0.1;
         let r = Math.sqrt(x*x + y*y);
         const r_new = scaleBoxCox(r, toytownFactor, x0_distance);
         const angle = Math.atan2(y, x);
         x = r_new * Math.cos(angle);
         y = r_new * Math.sin(angle);
      }
      
      // Draw Ship Marker
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 6 / zoom, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
  }
  
  export function fitToNodes(nodeIds: string[]) {
      if (!canvas || !system || nodeIds.length === 0) return;
      
      // Force an update to ensure positions are current (especially if delayed)
      calculateScaledPositions();
      
      const positions: {x: number, y: number}[] = [];
      
      for (const id of nodeIds) {
          const pos = toytownFactor > 0 ? scaledWorldPositions.get(id) : worldPositions.get(id);
          if (pos) positions.push(pos);
      }
      
      if (positions.length === 0) return;
      
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of positions) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
      }
      
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      
      const width = maxX - minX;
      const height = maxY - minY;
      
      const padding = 1.8; // 80% padding (zoom out more)
      const targetWidth = Math.max(width, 0.1); // Minimum size 0.1 AU
      const targetHeight = Math.max(height, 0.1);
      
      const zoomX = canvas.width / (targetWidth * padding);
      const zoomY = canvas.height / (targetHeight * padding);
      const targetZoom = Math.min(zoomX, zoomY, 500); // Cap zoom at 500 px/AU
      
      // Disable follow mode temporarily
      cameraMode = 'MANUAL';
      
      panStore.set({ x: centerX, y: centerY }, { duration: 500 });
      zoomStore.set(targetZoom, { duration: 500 });
  }
</script>
<canvas 
    bind:this={canvas} 
    on:click={handleClick} 
    on:contextmenu={handleContextMenu}
    on:wheel={handleWheel}
    on:mousedown={handleMouseDown}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
    on:mousemove={handleMouseMove}
    style="border: 1px solid #333; margin-top: 1em; background-color: #08090d; cursor: grab; width: 100%;"
></canvas>
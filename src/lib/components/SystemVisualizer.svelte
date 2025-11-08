<script lang="ts">
  import type { System, CelestialBody, Barycenter, RulePack, SystemNode } from '$lib/types';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";
  import { AU_KM } from '../constants';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints } from "$lib/physics/lagrange";
  import { get } from 'svelte/store';
  import { cameraStore } from '$lib/cameraStore';
  import type { CameraState } from '$lib/cameraStore';

  // --- Component Props ---
  export let system: System | null;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;
  export let showNames: boolean = false;
  export let showZones: boolean = false;
  export let showLPoints: boolean = false;
  export let getPlanetColor: (node: CelestialBody) => string = () => '#fff';

  const dispatch = createEventDispatcher<{ focus: string | null }>();

  // --- Configurable Visuals ---
  const CLICK_AREA = { base_px: 10, buffer_px: 5 };
  const ANIMATION_DURATION = 0; // ms for the crash zoom

  // --- Canvas and Rendering State ---
  let canvas: HTMLCanvasElement;
  let animationFrameId: number;
  let worldPositions = new Map<string, { x: number, y: number }>();

  // --- Camera State ---
  let camera: CameraState;
  cameraStore.subscribe(value => camera = value);

  // --- Interaction State ---
  let isPanning = false;
  let lastPanX: number;
  let lastPanY: number;
  let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';
  let lastFocusedId: string | null = null;
  let isAnimatingFocus = false;
  let animState = {
      startTime: 0,
      startPan: { x: 0, y: 0 },
      endPan: { x: 0, y: 0 },
      startZoom: 100,
      endZoom: 100,
  };

  // --- Public Functions ---
  function calculateFrameForNode(nodeId: string): { pan: {x: number, y: number}, zoom: number } {
      const currentCamera = get(cameraStore);
      if (!system || !canvas) return currentCamera;

      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(nodeId);
      const targetPosition = worldPositions.get(nodeId);

      if (!targetNode || !targetPosition) return currentCamera;

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

          let newZoom = currentCamera.zoom;
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
                      newZoom = currentCamera.zoom * 2;
                  }
                  return { pan: targetPosition, zoom: newZoom };
              }
          }
          // No parent or parent position not found, just center with current zoom
          return { pan: targetPosition, zoom: currentCamera.zoom };
      }
  }

  export function resetView() {
      if (!system || !canvas) return;
      isAnimatingFocus = false; // Stop any ongoing animation
      cameraMode = 'FOLLOW'; // Reset mode on view reset
      
      const targetId = focusedBodyId || system.nodes.find(n => n.parentId === null)?.id;

      if (targetId) {
          const beforeViewport = get(cameraStore); // Capture current state
          const frame = calculateFrameForNode(targetId);
          cameraStore.set(frame);
          const afterViewport = { ...frame }; // Capture new state
          console.log('Viewport Change (Reset View):', { before: beforeViewport, after: afterViewport });
      }
  }

  // --- Reactive Logic for Triggering Animation ---
  $: if (focusedBodyId && focusedBodyId !== lastFocusedId && system && canvas && worldPositions.size > 0) {
      isAnimatingFocus = true; // Prevent FOLLOW logic from running prematurely
      lastFocusedId = focusedBodyId;
      startFocusAnimation(focusedBodyId);
  }

  function startFocusAnimation(targetId: string) {
      if (!system) return;
      const targetPosition = worldPositions.get(targetId);
      if (!targetPosition) return;

      cameraMode = 'FOLLOW';

      const beforeViewport = get(cameraStore); // Capture current state
      const newFrame = calculateFrameForNode(targetId);

      animState = {
          startTime: performance.now(),
          startPan: { ...beforeViewport.pan },
          endPan: newFrame.pan,
          startZoom: beforeViewport.zoom,
          endZoom: newFrame.zoom,
      };

      // isAnimatingFocus is already set
      const afterViewport = { pan: newFrame.pan, zoom: newFrame.zoom }; // Capture new state
      console.log('Viewport Change (Focus Animation):', { before: beforeViewport, after: afterViewport });
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
      if (ctx) {
        calculateWorldPositions();

        if (isAnimatingFocus) {
            const elapsedTime = performance.now() - animState.startTime;
            const t = Math.min(elapsedTime / ANIMATION_DURATION, 1.0);

            // Directly set the final state without interpolation
            const newX = animState.endPan.x;
            const newY = animState.endPan.y;
            const newZoom = animState.endZoom;

            cameraStore.set({ pan: { x: newX, y: newY }, zoom: newZoom });

            if (t >= 1.0) {
                isAnimatingFocus = false;
            }
        } else if (focusedBodyId && cameraMode === 'FOLLOW' && !isPanning && !isAnimatingFocus) {
            const targetPosition = worldPositions.get(focusedBodyId);
            if (targetPosition) {
                cameraStore.update(c => ({ ...c, pan: targetPosition }));
            }
        }

        drawSystem(ctx);
      }
    }
    animationFrameId = requestAnimationFrame(render);
  }

  // --- Position Calculation ---
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
      const clickPos = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
      let clickedNodeId: string | null = null;
      let minDistanceSq = Infinity;

      const clickableIds = getVisibleNodeIds(system, focusedBodyId);

      for (const node of system.nodes) {
          if (!clickableIds.has(node.id) || node.kind !== 'body') continue;

          const pos = worldPositions.get(node.id);
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
          cameraStore.update(c => ({ ...c, zoom: c.zoom * 2 }));
        } else {
          // It is not the object in focus, dispatch focus event
          dispatch("focus", clickedNodeId);
        }
      }
  }

  function handleWheel(event: WheelEvent) {
      event.preventDefault();
      isAnimatingFocus = false; // Interrupt animation
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const worldPosBeforeZoom = screenToWorld(mouseX, mouseY);
      const zoomFactor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      const newZoom = camera.zoom * zoomFactor;
      const newPanX = worldPosBeforeZoom.x - (mouseX - canvas.width / 2) / newZoom;
      const newPanY = worldPosBeforeZoom.y - (mouseY - canvas.height / 2) / newZoom;
      cameraStore.set({ pan: { x: newPanX, y: newPanY }, zoom: newZoom });
  }

  function handleMouseDown(event: MouseEvent) {
      isAnimatingFocus = false; // Interrupt animation
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
      
      const panDeltaX = dx / camera.zoom;
      const panDeltaY = dy / camera.zoom;

      cameraStore.update(current => ({
          ...current,
          pan: {
              x: current.pan.x - panDeltaX,
              y: current.pan.y - panDeltaY
          }
      }), { duration: 0 });

      lastPanX = event.clientX;
      lastPanY = event.clientY;
  }

  // --- Drawing Logic ---
  const STAR_COLOR_MAP: Record<string, string> = { "O": "#9bb0ff", "B": "#aabfff", "A": "#cad8ff", "F": "#f8f7ff", "G": "#fff4ea", "K": "#ffd2a1", "M": "#ffc46f", "WD": "#f0f0f0", "NS": "#c0c0ff", "magnetar": "#800080", "BH": "#000000", "default": "#ffffff" };

  function drawSystem(ctx: CanvasRenderingContext2D) {
      if (!system || !camera || !camera.pan) return;
      const { width, height } = canvas;
      
      ctx.save();
      ctx.fillStyle = "#08090d";
      ctx.fillRect(0, 0, width, height);
      
      ctx.translate(width / 2, height / 2);
      ctx.scale(camera.zoom, camera.zoom);

      for (const node of system.nodes) {
          if (node.kind !== 'body' || !node.orbit || !node.parentId) continue;
          const parentPos = worldPositions.get(node.parentId);
          if (!parentPos) continue;
          const relParentX = parentPos.x - camera.pan.x;
          const relParentY = parentPos.y - camera.pan.y;
          const a = node.orbit.elements.a_AU;
          const e = node.orbit.elements.e;
          const b = a * Math.sqrt(1 - e * e);
          const c = a * e;
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1 / camera.zoom;
          ctx.beginPath();
          ctx.ellipse(relParentX - c, relParentY, a, b, 0, 0, 2 * Math.PI);
          ctx.stroke();
      }

      for (const node of system.nodes) {
          const pos = worldPositions.get(node.id);
          if (!pos) continue;
          const relX = pos.x - camera.pan.x;
          const relY = pos.y - camera.pan.y;

          if (node.kind === 'barycenter') {
              ctx.strokeStyle = '#888';
              ctx.lineWidth = 1 / camera.zoom;
              ctx.beginPath();
              ctx.moveTo(relX - 10 / camera.zoom, relY);
              ctx.lineTo(relX + 10 / camera.zoom, relY);
              ctx.moveTo(relX, relY - 10 / camera.zoom);
              ctx.lineTo(relX, relY + 10 / camera.zoom);
              ctx.stroke();
          } else if (node.kind === 'body') {
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
              ctx.arc(relX, relY, finalRadius, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
          }
      }
      ctx.restore();

      drawScaleBar(ctx);

      if (showNames) {
          const visibleLabelIds = getVisibleNodeIds(system, focusedBodyId);
          ctx.font = `12px sans-serif`;
          
          for (const node of system.nodes) {
              if (!visibleLabelIds.has(node.id) || node.kind !== 'body') continue;

              const worldPos = worldPositions.get(node.id);
              if (!worldPos) continue;

              const screenPos = worldToScreen(worldPos.x, worldPos.y);
              
              let radiusPx = 2;
              if (node.roleHint === 'star') radiusPx = 4;
              else if (node.roleHint === 'planet') {
                  const isGasGiant = node.classes.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
                  radiusPx = isGasGiant ? 3 : 2;
              } else if (node.roleHint === 'moon') radiusPx = 1;

              ctx.fillStyle = getPlanetColor(node);
              ctx.fillText(node.name, screenPos.x + radiusPx + 5, screenPos.y);
          }
      }
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
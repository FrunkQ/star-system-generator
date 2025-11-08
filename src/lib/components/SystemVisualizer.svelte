<script lang="ts">
  import type { System, CelestialBody, Barycenter, RulePack, SystemNode } from '$lib/types';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";
  import { AU_KM } from '../constants';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints } from "$lib/physics/lagrange";
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
  const ANIMATION_DURATION = 1500; // ms for the crash zoom

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
  export function resetView() {
      if (!system || !canvas) return;
      isAnimatingFocus = false; // Stop any ongoing animation
      cameraMode = 'FOLLOW'; // Reset mode on view reset
      const primaryStar = system.nodes.find(n => n.parentId === null);
      const initialPan = primaryStar ? worldPositions.get(primaryStar.id) || {x: 0, y: 0} : { x: 0, y: 0 };
      
      const children = system.nodes.filter(n => n.parentId === primaryStar?.id);
      const maxOrbit = children.reduce((max, node) => {
          if (node.kind === 'body' && node.orbit) {
              return Math.max(max, node.orbit.elements.a_AU * (1 + node.orbit.elements.e));
          }
          return max;
      }, 0);

      const initialZoom = maxOrbit > 0 ? (Math.min(canvas.width, canvas.height) / 2) / (maxOrbit * 1.2) : 100;

      cameraStore.set({ pan: initialPan, zoom: initialZoom });
  }

  // --- Reactive Logic for Triggering Animation ---
  $: if (focusedBodyId && focusedBodyId !== lastFocusedId && system && canvas && worldPositions.size > 0) {
      lastFocusedId = focusedBodyId;
      startFocusAnimation(focusedBodyId);
  }

  function startFocusAnimation(targetId: string) {
      if (!system) return;
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      const targetNode = nodesById.get(targetId);
      const targetPosition = worldPositions.get(targetId);

      if (!targetNode || !targetPosition) return;

      cameraMode = 'FOLLOW';

      // Determine the context body for framing the zoom
      const targetHasChildren = system.nodes.some(n => n.parentId === targetId);
      let contextBody = targetNode;
      if (!targetHasChildren) {
          contextBody = targetNode.parentId ? nodesById.get(targetNode.parentId) ?? targetNode : targetNode;
      }

      // Calculate zoom based on the context body's children
      const children = system.nodes.filter(n => n.parentId === contextBody.id);
      const maxOrbit = children.reduce((max, node) => {
          if (node.kind === 'body' && node.orbit) {
              return Math.max(max, node.orbit.elements.a_AU * (1 + node.orbit.elements.e));
          }
          return max;
      }, 0);
      
      const newZoom = maxOrbit > 0 
          ? (Math.min(canvas.width, canvas.height) / 2) / (maxOrbit * 1.5)
          : camera.zoom; // Maintain zoom if context body has no orbiting children

      animState = {
          startTime: performance.now(),
          startPan: { ...camera.pan },
          endPan: targetPosition,
          startZoom: camera.zoom,
          endZoom: newZoom,
      };

      isAnimatingFocus = true;
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
    
    calculateWorldPositions();
    resetView();

    animationFrameId = requestAnimationFrame(render);
    return () => {
        if (parent) resizeObserver.unobserve(parent);
        cancelAnimationFrame(animationFrameId);
    };
  });

  onDestroy(() => cancelAnimationFrame(animationFrameId));

  // --- Coordinate Transformation ---
  function screenToWorld(screenX: number, screenY: number): { x: number, y: number } {
      if (!canvas || !camera) return { x: 0, y: 0 };
      const { width, height } = canvas;
      const worldX = (screenX - width / 2) / camera.zoom + camera.pan.x;
      const worldY = (screenY - height / 2) / camera.zoom + camera.pan.y;
      return { x: worldX, y: worldY };
  }
  
  function worldToScreen(worldX: number, worldY: number): { x: number, y: number } {
      if (!canvas || !camera) return { x: 0, y: 0 };
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

            const s = Math.sin(Math.PI / 2 * t);
            const c = Math.cos(Math.PI / 2 * t);

            const newX = animState.startPan.x * (1 - s) + animState.endPan.x * s;
            const newY = animState.startPan.y * (1 - s) + animState.endPan.y * s;
            const newZoom = animState.startZoom * (1 - s) + animState.endZoom * s;

            cameraStore.set({ pan: { x: newX, y: newY }, zoom: newZoom });

            if (t >= 1.0) {
                isAnimatingFocus = false;
            }
        } else if (focusedBodyId && cameraMode === 'FOLLOW' && !isPanning) {
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
      if (clickedNodeId) dispatch("focus", clickedNodeId);
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
      if (!system || !camera) return;
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
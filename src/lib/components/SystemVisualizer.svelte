<script lang="ts">
  import type { System, CelestialBody } from "$lib/types";
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";

  export let system: System | null;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;

  const dispatch = createEventDispatcher<{ focus: string | null }>();

  let canvas: HTMLCanvasElement;
  let animationFrameId: number;
  // This map will now store coordinates in the "world" space of the current view
  const positions = new Map<string, { x: number, y: number, radius: number }>();

  // --- Viewport State ---
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isPanning = false;
  let lastPanX: number;
  let lastPanY: number;

  export function resetView() {
      panX = 0;
      panY = 0;
      zoom = 1;
  }

  // --- Svelte Lifecycle ---
  onMount(() => {
    animationFrameId = requestAnimationFrame(render);
  });

  onDestroy(() => {
    cancelAnimationFrame(animationFrameId);
  });

  // --- Main Render Loop ---
  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawSystem(ctx);
    }
    animationFrameId = requestAnimationFrame(render);
  }

  // --- Event Handlers ---
  function handleClick(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    // Transform click coordinates into the "world" space by inverting pan and zoom
    const clickX = (event.clientX - rect.left - panX) / zoom;
    const clickY = (event.clientY - rect.top - panY) / zoom;

    const nodes = system?.nodes || [];
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const pos = positions.get(node.id);
        if (!pos) continue;

        const dx = clickX - pos.x;
        const dy = clickY - pos.y;
        // The click radius also needs to be in world space
        const clickRadius = Math.max(10 / zoom, pos.radius + (5 / zoom));
        if (dx * dx + dy * dy < clickRadius * clickRadius) {
            dispatch("focus", node.id);
            return;
        }
    }
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = zoom * zoomFactor;

    panX = mouseX - (mouseX - panX) * zoomFactor;
    panY = mouseY - (mouseY - panY) * zoomFactor;
    zoom = newZoom;
  }

  function handleMouseDown(event: MouseEvent) {
    isPanning = true;
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
    panX += dx;
    panY += dy;
    lastPanX = event.clientX;
    lastPanY = event.clientY;
  }

  // --- Drawing Logic ---
  const STAR_COLOR_MAP: Record<string, string> = {
    "O": "#9bb0ff", "B": "#aabfff", "A": "#cad8ff", "F": "#f8f7ff",
    "G": "#fff4ea", "K": "#ffd2a1", "M": "#ffc46f", "WD": "#f0f0f0",
    "NS": "#c0c0ff", "magnetar": "#d0a0ff", "BH": "#000000", "default": "#ffffff",
  };

  function drawSystem(ctx: CanvasRenderingContext2D) {
    if (!system || !system.nodes) return;

    const width = canvas.width;
    const height = canvas.height;
    
    ctx.save();
    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, width, height);
    
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    positions.clear();

    const focusId = focusedBodyId || system.nodes.find(n => n.parentId === null)?.id;
    if (!focusId) { ctx.restore(); return; }

    const focusBody = nodesById.get(focusId);
    if (!focusBody) { ctx.restore(); return; }

    const children = system.nodes.filter(n => n.parentId === focusId);

    const maxOrbit = children.reduce((max, node) => {
        if (node.kind === 'body' && node.orbit) {
            return Math.max(max, node.orbit.elements.a_AU * (1 + node.orbit.elements.e));
        }
        return max;
    }, 0);
    const scale = (Math.min(width, height) / 2) / (maxOrbit * 1.2 || 0.1);

    const viewCenterX = width / 2;
    const viewCenterY = height / 2;

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1 / zoom;

    // --- Draw Orbits, Rings, and Belts ---
    for (const node of children) {
        if (node.kind !== 'body') continue;

        if (node.roleHint === 'belt' && node.orbit) {
            const a = node.orbit.elements.a_AU * scale;
            const e = node.orbit.elements.e;
            const b = a * Math.sqrt(1 - e * e);
            const c = a * e;
            ctx.strokeStyle = "#666";
            ctx.beginPath();
            ctx.ellipse(viewCenterX - c, viewCenterY, a, b, 0, 0, 2 * Math.PI);
            ctx.stroke();
            // Could draw dots here in the future
        } else if (node.orbit) {
            const a = node.orbit.elements.a_AU * scale;
            const e = node.orbit.elements.e;
            const b = a * Math.sqrt(1 - e * e);
            const c = a * e;
            ctx.strokeStyle = "#333";
            ctx.beginPath();
            ctx.ellipse(viewCenterX - c, viewCenterY, a, b, 0, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    // --- Draw Bodies ---
    // Draw focus body at center
    let focusBodyRadius = 2;
    let focusBodyColor = "#aaa";
    if (focusBody.kind === 'body') {
        if (focusBody.roleHint === 'star') {
            const starClassKey = focusBody.classes[0]?.split('/')[1] || 'default';
            focusBodyColor = STAR_COLOR_MAP[starClassKey] || STAR_COLOR_MAP['default'];
            focusBodyRadius = Math.max(15, (focusBody.radiusKm || 696340) / 696340 * 20);
        } else { 
            focusBodyRadius = 25;
        }
    }
    ctx.beginPath();
    ctx.arc(viewCenterX, viewCenterY, focusBodyRadius, 0, 2 * Math.PI);
    ctx.fillStyle = focusBodyColor;
    ctx.fill();
    positions.set(focusBody.id, { x: viewCenterX, y: viewCenterY, radius: focusBodyRadius });

    // Draw Rings under children
    const rings = system.nodes.filter(n => n.parentId === focusId && n.roleHint === 'ring');
    for (const ring of rings) {
        if (ring.kind !== 'body') continue;
        const innerRadius = (ring.radiusInnerKm || 0) / AU_KM * scale;
        const outerRadius = (ring.radiusOuterKm || 0) / AU_KM * scale;
        
        const avgRadius = (innerRadius + outerRadius) / 2;
        const ringWidth = outerRadius - innerRadius;

        ctx.strokeStyle = "rgba(150, 150, 150, 0.4)";
        ctx.lineWidth = ringWidth;
        ctx.beginPath();
        ctx.arc(viewCenterX, viewCenterY, avgRadius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // Draw children
    for (const node of children) {
        if (node.kind !== 'body' || !node.orbit) continue;

        const pos = propagate(node, currentTime);
        if (!pos) continue;

        const x = viewCenterX + pos.x * scale;
        const y = viewCenterY + pos.y * scale;

        let childRadius = 2;
        if (node.roleHint === 'planet') {
            childRadius = Math.max(2, (node.radiusKm || 6371) / 6371 * 0.9);
        } else if (node.roleHint === 'moon') {
            childRadius = Math.max(1, (node.radiusKm || 1737) / 1737 * 0.7);
        }

        ctx.beginPath();
        ctx.arc(x, y, childRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#aaa";
        ctx.fill();
        positions.set(node.id, { x: x, y: y, radius: childRadius });
    }
    ctx.restore();
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
    width={800} 
    height={600} 
    style="border: 1px solid #333; margin-top: 1em; background-color: #08090d; cursor: grab;"
></canvas>
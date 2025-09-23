<script lang="ts">
  import type { System, CelestialBody } from "$lib/types";
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { propagate } from "$lib/api";

  export let system: System | null;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;

  const dispatch = createEventDispatcher<{ focus: string | null }>();

  // --- Configurable Visuals ---
  const VISUAL_SCALING = {
      star:       { base: 12, multiplier: 15 },
      planet:     { base: 2,  multiplier: 1.0 },
      moon:       { base: 1,  multiplier: 0.8 },
      ring:       { min_px: 2, opacity: 0.3 },
      belt:       { width_px: 4, opacity: 0.4 },
      click_area: { base: 10, buffer: 5 },
  };

  let canvas: HTMLCanvasElement;
  let animationFrameId: number;
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
    const clickX = (event.clientX - rect.left - panX) / zoom;
    const clickY = (event.clientY - rect.top - panY) / zoom;

    const nodes = system?.nodes || [];
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const pos = positions.get(node.id);
        if (!pos) continue;

        const dx = clickX - pos.x;
        const dy = clickY - pos.y;
        const clickRadius = Math.max(VISUAL_SCALING.click_area.base / zoom, pos.radius + (VISUAL_SCALING.click_area.buffer / zoom));
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
  const AU_KM = 149597870.7;
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
    if (!focusBody || focusBody.kind !== 'body') { ctx.restore(); return; }

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

    // --- Draw Orbits and Belts ---
    for (const node of children) {
        if (node.kind !== 'body' || !node.orbit) continue;
        const a = node.orbit.elements.a_AU * scale;
        const e = node.orbit.elements.e;
        const b = a * Math.sqrt(1 - e * e);
        const c = a * e;
        
        ctx.beginPath();
        if (node.roleHint === 'belt') {
            ctx.strokeStyle = `rgba(150, 150, 150, ${VISUAL_SCALING.belt.opacity})`;
            ctx.lineWidth = VISUAL_SCALING.belt.width_px / zoom;
            ctx.ellipse(viewCenterX - c, viewCenterY, a, b, 0, 0, 2 * Math.PI);
            ctx.stroke();
        } else {
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1 / zoom;
            ctx.ellipse(viewCenterX - c, viewCenterY, a, b, 0, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    // --- Draw Rings ---
    const rings = system.nodes.filter(n => n.parentId === focusId && n.roleHint === 'ring');
    for (const ring of rings) {
        if (ring.kind !== 'body') continue;
        const innerRadius = (ring.radiusInnerKm || 0) / AU_KM * scale;
        const outerRadius = (ring.radiusOuterKm || 0) / AU_KM * scale;
        const ringWidth = outerRadius - innerRadius;

        if (ringWidth < VISUAL_SCALING.ring.min_px) {
            const midRadius = (innerRadius + outerRadius) / 2;
            ctx.strokeStyle = `rgba(150, 150, 150, ${VISUAL_SCALING.ring.opacity})`;
            ctx.lineWidth = VISUAL_SCALING.ring.min_px;
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, midRadius, 0, 2 * Math.PI);
            ctx.stroke();
        } else {
            ctx.fillStyle = `rgba(150, 150, 150, ${VISUAL_SCALING.ring.opacity})`;
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, outerRadius, 0, 2 * Math.PI);
            ctx.arc(viewCenterX, viewCenterY, innerRadius, 0, 2 * Math.PI, true);
            ctx.fill();
        }
    }

    // --- Draw Bodies ---
    // Draw focus body at center
    let focusBodyRadius = 2;
    let focusBodyColor = "#aaa";
    if (focusBody.roleHint === 'star') {
        const starClassKey = focusBody.classes[0]?.split('/')[1] || 'default';
        focusBodyColor = STAR_COLOR_MAP[starClassKey] || STAR_COLOR_MAP['default'];
        focusBodyRadius = Math.max(VISUAL_SCALING.star.base, (focusBody.radiusKm || 696340) / 696340 * VISUAL_SCALING.star.multiplier);
    } else { 
        focusBodyRadius = 25;
    }
    ctx.beginPath();
    ctx.arc(viewCenterX, viewCenterY, focusBodyRadius, 0, 2 * Math.PI);
    ctx.fillStyle = focusBodyColor;
    ctx.fill();
    positions.set(focusBody.id, { x: viewCenterX, y: viewCenterY, radius: focusBodyRadius });

    // Draw children
    for (const node of children) {
        if (node.kind !== 'body' || !node.orbit || node.roleHint === 'belt') continue; // Don't draw a body for belts

        const pos = propagate(node, currentTime);
        if (!pos) continue;

        const x = viewCenterX + pos.x * scale;
        const y = viewCenterY + pos.y * scale;

        let childRadius = 2;
        if (node.roleHint === 'planet') {
            childRadius = Math.max(VISUAL_SCALING.planet.base, (node.radiusKm || 6371) / 6371 * VISUAL_SCALING.planet.multiplier);
        } else if (node.roleHint === 'moon') {
            childRadius = Math.max(VISUAL_SCALING.moon.base, (node.radiusKm || 1737) / 1737 * VISUAL_SCALING.moon.multiplier);
        }

        ctx.beginPath();
        ctx.arc(x, y, childRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#aaa";
        ctx.fill();
        positions.set(node.id, { x: x, y: y, radius: childRadius });

        // Draw miniature rings if they exist
        const hasRing = system.nodes.some(n => n.parentId === node.id && n.roleHint === 'ring');
        if (hasRing) {
            ctx.strokeStyle = `rgba(150, 150, 150, ${VISUAL_SCALING.ring.opacity})`;
            ctx.lineWidth = (VISUAL_SCALING.ring.min_px || 2) / zoom;
            ctx.beginPath();
            ctx.arc(x, y, childRadius + (4 / zoom), 0, 2 * Math.PI);
            ctx.stroke();
        }
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
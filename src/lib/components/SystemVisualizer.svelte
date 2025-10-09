'''<script lang="ts">
  import type { System, CelestialBody, Barycenter } from '$lib/types';
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
  let positions: Record<string, { x: number, y: number, radius: number }> = {};

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
        const pos = positions[node.id];
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
    positions = {};

    const focusId = focusedBodyId || system.nodes.find(n => n.parentId === null)?.id;
    if (!focusId) { ctx.restore(); return; }

    const focusBody = nodesById.get(focusId);
    if (!focusBody) { ctx.restore(); return; } // Allow barycenters

    const children = system.nodes.filter(n => n.parentId === focusId) as (CelestialBody | Barycenter)[];

    const orbitingChildren = children.filter(n => n.kind === 'body' && n.orbit) as CelestialBody[];
    let maxOrbit = orbitingChildren.reduce((max, node) => {
        return Math.max(max, node.orbit!.elements.a_AU * (1 + node.orbit!.elements.e));
    }, 0);

    const ringChildren = children.filter(n => n.kind === 'body' && n.roleHint === 'ring') as CelestialBody[];
    for (const ring of ringChildren) {
        maxOrbit = Math.max(maxOrbit, (ring.radiusOuterKm || 0) / AU_KM);
    }

    const scale = (Math.min(width, height) / 2) / (maxOrbit * 1.2 || 0.1);

    const viewCenterX = width / 2;
    const viewCenterY = height / 2;

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1 / zoom;

    // --- Draw Orbits and Belts ---
    for (const node of orbitingChildren) {
        const a = node.orbit!.elements.a_AU * scale;
        const e = node.orbit!.elements.e;
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

    // --- Draw Bodies ---
    // Draw focus body at center, or a marker for a barycenter
    if (focusBody.kind === 'barycenter') {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.moveTo(viewCenterX - 10 / zoom, viewCenterY);
        ctx.lineTo(viewCenterX + 10 / zoom, viewCenterY);
        ctx.moveTo(viewCenterX, viewCenterY - 10 / zoom);
        ctx.lineTo(viewCenterX, viewCenterY + 10 / zoom);
        ctx.stroke();
        positions[focusBody.id] = { x: viewCenterX, y: viewCenterY, radius: 10 / zoom };
        } else if (focusBody.kind === 'body') {
            const hasAccretionDisk = ringChildren.some(r => r.classes.includes('ring/accretion_disk'));
            if (hasAccretionDisk) {
                // Don't draw the central body, the disk implies its presence
                positions[focusBody.id] = { x: viewCenterX, y: viewCenterY, radius: 10 / zoom };
            } else {
                const body = focusBody as CelestialBody;
                let focusBodyRadius = 2;
                let focusBodyColor = "#aaa";
                if (body.roleHint === 'star') {
                    const starClassKey = body.classes[0] || 'default';
                    focusBodyColor = STAR_COLOR_MAP[starClassKey.split('/')[1]] || STAR_COLOR_MAP['default'];
                    focusBodyRadius = Math.max(VISUAL_SCALING.star.base, (body.radiusKm || 696340) / 696340 * VISUAL_SCALING.star.multiplier);
                } else { 
                    focusBodyRadius = 25;
                }
                ctx.beginPath();
                ctx.arc(viewCenterX, viewCenterY, focusBodyRadius, 0, 2 * Math.PI);
                ctx.fillStyle = focusBodyColor;
                ctx.fill();
                positions[focusBody.id] = { x: viewCenterX, y: viewCenterY, radius: focusBodyRadius };
            }
        }
    // --- Draw Rings for focused body ---
    for (const ring of ringChildren) {
        const innerRadius = (ring.radiusInnerKm || 0) / AU_KM * scale;
        const outerRadius = (ring.radiusOuterKm || 0) / AU_KM * scale;
        
        if (ring.classes.includes('ring/accretion_disk')) {
            ctx.strokeStyle = '#ff6600'; // Orange-red for the accretion disk
            ctx.lineWidth = (outerRadius - innerRadius);
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, innerRadius + (outerRadius - innerRadius) / 2, 0, 2 * Math.PI);
            ctx.stroke();
        } else {
            ctx.fillStyle = `rgba(150, 150, 150, ${VISUAL_SCALING.ring.opacity})`;
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, outerRadius, 0, 2 * Math.PI);
            ctx.arc(viewCenterX, viewCenterY, innerRadius, 0, 2 * Math.PI, true);
            ctx.fill();
        }
    }

    // Draw children
    for (const node of orbitingChildren) {
        if (node.roleHint === 'belt') continue;

        const pos = propagate(node, currentTime);
        if (!pos) continue;

        const x = viewCenterX + pos.x * scale;
        const y = viewCenterY + pos.y * scale;

        let childRadius = 2;
        let childColor = "#aaa";

        if (node.roleHint === 'star') {
            const starClassKey = node.classes[0] || 'default';
            childColor = STAR_COLOR_MAP[starClassKey.split('/')[1]] || STAR_COLOR_MAP['default'];
            childRadius = Math.max(VISUAL_SCALING.star.base, (node.radiusKm || 696340) / 696340 * VISUAL_SCALING.star.multiplier);
        } else if (node.roleHint === 'planet') {
            childRadius = Math.max(VISUAL_SCALING.planet.base, (node.radiusKm || 6371) / 6371 * VISUAL_SCALING.planet.multiplier);
        } else if (node.roleHint === 'moon') {
            childRadius = Math.max(VISUAL_SCALING.moon.base, (node.radiusKm || 1737) / 1737 * VISUAL_SCALING.moon.multiplier);
        }

        ctx.beginPath();
        ctx.arc(x, y, childRadius, 0, 2 * Math.PI);
        ctx.fillStyle = childColor;
        ctx.fill();
        positions[node.id] = { x: x, y: y, radius: childRadius };

        // Draw miniature rings if they exist
        const hasRing = system.nodes.some(n => n.parentId === node.id && (n as CelestialBody).roleHint === 'ring');
        if (hasRing) {
            const inner = childRadius + (2 / zoom);
            const outer = childRadius + (5 / zoom);
            ctx.fillStyle = `rgba(150, 150, 150, ${VISUAL_SCALING.ring.opacity})`;
            ctx.beginPath();
            ctx.arc(x, y, outer, 0, 2 * Math.PI);
            ctx.arc(x, y, inner, 0, 2 * Math.PI, true);
            ctx.fill();
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
></canvas>'''
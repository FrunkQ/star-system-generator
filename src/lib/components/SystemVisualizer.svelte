<script lang="ts">
  import type { System, CelestialBody, Barycenter } from '$lib/types';
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { get } from 'svelte/store';
  import { propagate } from "$lib/api";
  import { SOLAR_RADIUS_KM, EARTH_RADIUS_KM } from '../constants';
  import * as zones from "$lib/physics/zones";
  import { calculateLagrangePoints } from "$lib/physics/lagrange";
  import { viewportStore } from '$lib/stores';

  export let system: System | null;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let focusedBodyId: string | null = null;
  export let showNames: boolean = false;
  export let showZones: boolean = false;
  export let showLPoints: boolean = false;
  export let getPlanetColor: (node: CelestialBody) => string = () => '#fff';
  export let visualScalingMultiplier: number = 1.0;

  const dispatch = createEventDispatcher<{ focus: string | null }>();

  // --- Configurable Visuals ---
  const VISUAL_SCALING = {
      massive_star: { base: 0.1, multiplier: 30 },
      main_sequence_star: { base: 0.1, multiplier: 30 },
      low_mass_star: { base: 0.1, multiplier: 30 },
      star_remnant: { base: 0.1, multiplier: 10000 },
      terrestrial: { base: 0.1, multiplier: 1.0 },
      gas_giant:   { base: 0.1, multiplier: 1.0 },
      ice_giant:   { base: 0.1, multiplier: 1.0 },
      moon:        { base: 0.1,  multiplier: 0.8 },
      ring:        { min_px: 2, opacity: 0.3 },
      belt:        { width_px: 4, opacity: 0.4 },
      click_area:  { base: 10, buffer: 5 },
  };

  let canvas: HTMLCanvasElement;
  let animationFrameId: number;
  let positions: Record<string, { x: number, y: number, radius: number }> = {};

  // --- Viewport State (now from store) ---
  let panX = get(viewportStore).panX;
  let panY = get(viewportStore).panY;
  let zoom = get(viewportStore).zoom;
  viewportStore.subscribe(value => {
      panX = value.panX;
      panY = value.panY;
      zoom = value.zoom;
  });

  let isPanning = false;
  let lastPanX: number;
  let lastPanY: number;

  export function resetView() {
      viewportStore.set({ panX: 0, panY: 0, zoom: 1 });
  }

  // --- Svelte Lifecycle ---
  onMount(() => {
    animationFrameId = requestAnimationFrame(render);

    const parent = canvas.parentElement;
    if (parent) {
        const resizeObserver = new ResizeObserver(() => {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientWidth * (3 / 4);
        });
        resizeObserver.observe(parent);

        // Set initial size
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientWidth * (3 / 4);

        return () => {
            if (parent) {
                resizeObserver.unobserve(parent);
            }
        };
    }
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

    const newPanX = mouseX - (mouseX - panX) * zoomFactor;
    const newPanY = mouseY - (mouseY - panY) * zoomFactor;
    
    viewportStore.set({ panX: newPanX, panY: newPanY, zoom: newZoom });
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
    viewportStore.update(current => ({ ...current, panX: current.panX + dx, panY: current.panY + dy }));
    lastPanX = event.clientX;
    lastPanY = event.clientY;
  }

  // --- Drawing Logic ---
  const AU_KM = 149597870.7;
  const STAR_COLOR_MAP: Record<string, string> = {
    "O": "#9bb0ff", "B": "#aabfff", "A": "#cad8ff", "F": "#f8f7ff",
    "G": "#fff4ea", "K": "#ffd2a1", "M": "#ffc46f", "WD": "#f0f0f0",
    "NS": "#c0c0ff", "magnetar": "#800080", "BH": "#000000", "default": "#ffffff",
  };

  function drawZones(ctx: CanvasRenderingContext2D, viewCenterX: number, viewCenterY: number, scale: number, focusBody: CelestialBody | Barycenter) {
    if (!system || !focusBody) return;

    const zoneStyles = {
        roche: { color: 'rgba(255, 0, 0, 0.5)', label: 'Roche Limit' },
        silicate: { color: 'rgba(165, 42, 42, 0.5)', label: 'Silicate Line' },
        soot: { color: 'rgba(105, 105, 105, 0.5)', label: 'Soot Line' },
        goldilocks: { color: 'rgba(0, 255, 0, 0.1)', label: 'Habitable Zone' },
        frost: { color: 'rgba(173, 216, 230, 0.5)', label: 'Frost Line' },
        co2: { color: 'rgba(255, 255, 255, 0.5)', label: 'CO2 Ice Line' },
        co: { color: 'rgba(0, 0, 255, 0.5)', label: 'CO Ice Line' },
    };

    ctx.lineWidth = 1 / zoom;
    ctx.font = `${12 / zoom}px sans-serif`;
    ctx.setLineDash([5 / zoom, 15 / zoom]);

    if (focusBody.kind === 'body' && focusBody.roleHint === 'star') {
        const primaryStar = focusBody as CelestialBody;
        const allZones = zones.calculateAllStellarZones(primaryStar, rulePack);

        // Goldilocks Zone (band)
        const goldilocks = allZones.goldilocks;
        const innerRadius = goldilocks.inner * scale;
        const outerRadius = goldilocks.outer * scale;
        ctx.fillStyle = zoneStyles.goldilocks.color;
        ctx.beginPath();
        ctx.arc(viewCenterX, viewCenterY, outerRadius, 0, 2 * Math.PI);
        ctx.arc(viewCenterX, viewCenterY, innerRadius, 0, 2 * Math.PI, true); // Counter-clockwise for the inner circle
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(zoneStyles.goldilocks.label, viewCenterX + (innerRadius + outerRadius) / 2, viewCenterY);

        // Danger Zone
        const dangerZoneRadiusAU = allZones.dangerZone;
        if (dangerZoneRadiusAU > 0) {
            const radius = dangerZoneRadiusAU * scale;
            ctx.fillStyle = 'rgba(255, 165, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText('Danger Zone', viewCenterX + radius, viewCenterY);
        }

        // Kill Zone
        const killZoneRadiusAU = allZones.killZone;
        if (killZoneRadiusAU > 0) {
            const radius = killZoneRadiusAU * scale;
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText('Kill Zone', viewCenterX + radius, viewCenterY);
        }

        // Other zones (lines)
        const zoneCalculations = {
            silicate: allZones.silicateLine,
            soot: allZones.sootLine,
            frost: allZones.frostLine,
            co2: allZones.co2IceLine,
            co: allZones.coIceLine,
        };

        for (const [key, radiusAU] of Object.entries(zoneCalculations)) {
            if (radiusAU > 0) {
                const radius = radiusAU * scale;
                const style = zoneStyles[key as keyof typeof zoneStyles];
                ctx.strokeStyle = style.color;
                ctx.beginPath();
                ctx.arc(viewCenterX, viewCenterY, radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.fillText(style.label, viewCenterX + radius, viewCenterY);
            }
        }
    } else if (focusBody.kind === 'body') {
        // Show Roche limit for planets
        const primaryBody = focusBody as CelestialBody;
        const radiusAU = zones.calculateRocheLimit(primaryBody);
        if (radiusAU > 0) {
            const radius = radiusAU * scale;
            const style = zoneStyles.roche;
            ctx.strokeStyle = style.color;
            ctx.beginPath();
            ctx.arc(viewCenterX, viewCenterY, radius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.fillText(style.label, viewCenterX + radius, viewCenterY);
        }
    }

    ctx.setLineDash([]); // Reset to solid lines
  }


  function getPlanetCategory(node: CelestialBody): 'terrestrial' | 'gas_giant' | 'ice_giant' {
      if (node.classes.some(c => c.includes('gas-giant'))) {
          return 'gas_giant';
      }
      if (node.classes.some(c => c.includes('ice-giant'))) {
          return 'ice_giant';
      }
      return 'terrestrial';
  }

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

    /*
    // --- Draw Focused Body's Orbit and L-Points ---
    if (focusBody && focusBody.kind === 'body' && focusBody.parentId) {
        const parent = nodesById.get(focusBody.parentId) as CelestialBody;
        if (parent && (focusBody as CelestialBody).orbit) {
            const orbit = (focusBody as CelestialBody).orbit!;
            const pos = propagate(focusBody as CelestialBody, currentTime);

            // --- FIX FOR PRECISION BUG ---
            // When focused on a body with no children, the main `scale` can become enormous.
            // We must calculate a local scale for drawing this body's own orbit to prevent floating-point errors.
            const parentOrbitScale = (Math.min(width, height) / 2) / (orbit.elements.a_AU * (1 + orbit.elements.e) * 1.2 || 0.1);

            if (pos) {
                const parentX = viewCenterX - pos.x * parentOrbitScale;
                const parentY = viewCenterY - pos.y * parentOrbitScale;

                const a = orbit.elements.a_AU * parentOrbitScale;
                const e = orbit.elements.e;
                const b = a * Math.sqrt(1 - e * e);
                const c = a * e;

                ctx.strokeStyle = "#555"; // Faint color for the orbit line
                ctx.lineWidth = 1 / zoom;
                ctx.beginPath();
                ctx.ellipse(parentX - c, parentY, a, b, 0, 0, 2 * Math.PI);
                ctx.stroke();

                if (showLPoints) {
                    const lagrangePoints = calculateLagrangePoints(parent, focusBody as CelestialBody, pos);
                    const angle = Math.atan2(pos.y, pos.x);

                    ctx.font = `${10 / zoom}px sans-serif`;

                    for (const lp of lagrangePoints) {
                        const isL4L5 = lp.name === 'L4' || lp.name === 'L5';
                        ctx.fillStyle = isL4L5 ? '#00ff00' : '#aaa';
                        ctx.strokeStyle = isL4L5 ? '#00ff00' : '#aaa';

                        let finalX = lp.x;
                        let finalY = lp.y;

                        if (!lp.isRotated) {
                            const rotatedX = lp.x * Math.cos(angle) - lp.y * Math.sin(angle);
                            const rotatedY = lp.x * Math.sin(angle) + lp.y * Math.cos(angle);
                            finalX = rotatedX;
                            finalY = rotatedY;
                        }

                        const x = parentX + finalX * parentOrbitScale;
                        const y = parentY + finalY * parentOrbitScale;

                        ctx.beginPath();
                        ctx.moveTo(x - 3 / zoom, y - 3 / zoom);
                        ctx.lineTo(x + 3 / zoom, y + 3 / zoom);
                        ctx.moveTo(x + 3 / zoom, y - 3 / zoom);
                        ctx.lineTo(x - 3 / zoom, y + 3 / zoom);
                        ctx.lineWidth = 1 / zoom;
                        ctx.stroke();
                        ctx.fillText(lp.name, x + 5 / zoom, y);
                    }
                }
            }
        }
    }
    */

    if (showZones) {
        drawZones(ctx, viewCenterX, viewCenterY, scale, focusBody);
    }

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1 / zoom;

    const primaryStar = system.nodes.find(n => n.roleHint === 'star' && n.parentId === null) as CelestialBody;
    const goldilocks = primaryStar ? zones.calculateGoldilocksZone(primaryStar) : null;

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
            const isHabitable = goldilocks && node.orbit!.elements.a_AU > goldilocks.inner && node.orbit!.elements.a_AU < goldilocks.outer;
            ctx.strokeStyle = isHabitable ? 'rgba(0, 255, 0, 0.5)' : "#333";
            ctx.lineWidth = 1 / zoom;
            ctx.ellipse(viewCenterX - c, viewCenterY, a, b, 0, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    // --- Draw Lagrange Points ---
    if (showLPoints) {
        ctx.font = `${10 / zoom}px sans-serif`;

        for (const node of orbitingChildren) {
            if (node.roleHint === 'belt') continue;

            const primary = system.nodes.find(n => n.id === node.parentId) as CelestialBody;
            if (!primary) continue;

            const pos = propagate(node, currentTime);
            if (!pos) continue;

            const lagrangePoints = calculateLagrangePoints(primary, node, pos);

            const angle = Math.atan2(pos.y, pos.x);

            for (const lp of lagrangePoints) {
                const isL4L5 = lp.name === 'L4' || lp.name === 'L5';
                ctx.fillStyle = isL4L5 ? '#00ff00' : '#aaa';
                ctx.strokeStyle = isL4L5 ? '#00ff00' : '#aaa';

                let finalX = lp.x;
                let finalY = lp.y;

                if (!lp.isRotated) {
                    // Rotate the Lagrange point position by the angle of the secondary body
                    const rotatedX = lp.x * Math.cos(angle) - lp.y * Math.sin(angle);
                    const rotatedY = lp.x * Math.sin(angle) + lp.y * Math.cos(angle);
                    finalX = rotatedX;
                    finalY = rotatedY;
                }

                const x = viewCenterX + finalX * scale;
                const y = viewCenterY + finalY * scale;

                // Draw a cross
                ctx.beginPath();
                ctx.moveTo(x - 3 / zoom, y - 3 / zoom);
                ctx.lineTo(x + 3 / zoom, y + 3 / zoom);
                ctx.moveTo(x + 3 / zoom, y - 3 / zoom);
                ctx.lineTo(x - 3 / zoom, y + 3 / zoom);
                ctx.lineWidth = 1 / zoom;
                ctx.stroke();

                // Draw label
                ctx.fillText(lp.name, x + 5 / zoom, y);
            }
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
                    const spectralType = starClassKey.split('/')[1];
                    focusBodyColor = STAR_COLOR_MAP[spectralType] || STAR_COLOR_MAP['default'];

                    const scaling = VISUAL_SCALING[body.starCategory || 'main_sequence_star'] || VISUAL_SCALING.main_sequence_star;
                    focusBodyRadius = Math.max(scaling.base, (body.radiusKm || SOLAR_RADIUS_KM) / SOLAR_RADIUS_KM * scaling.multiplier * (visualScalingMultiplier ** 2));

                } else { 
                    focusBodyRadius = 25;
                }
                ctx.beginPath();
                ctx.arc(viewCenterX, viewCenterY, focusBodyRadius, 0, 2 * Math.PI);
                ctx.fillStyle = focusBodyColor;
                ctx.fill();
                if (focusBodyColor === '#000000') { // If it's a black hole
                    ctx.beginPath();
                    ctx.arc(viewCenterX, viewCenterY, focusBodyRadius, 0, 2 * Math.PI);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1 / zoom;
                    ctx.stroke();
                }
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
        let childColor = getPlanetColor(node);

        if (node.roleHint === 'star') {
            const starClassKey = node.classes[0] || 'default';
            const spectralType = starClassKey.split('/')[1];
            childColor = STAR_COLOR_MAP[spectralType] || STAR_COLOR_MAP['default'];

            const scaling = VISUAL_SCALING[node.starCategory || 'main_sequence_star'] || VISUAL_SCALING.main_sequence_star;
            childRadius = Math.max(scaling.base, (node.radiusKm || SOLAR_RADIUS_KM) / SOLAR_RADIUS_KM * scaling.multiplier * (visualScalingMultiplier ** 2));

        } else if (node.roleHint === 'planet') {
            const category = getPlanetCategory(node);
            const scaling = VISUAL_SCALING[category] || VISUAL_SCALING.terrestrial;
            childRadius = Math.max(scaling.base, (node.radiusKm || EARTH_RADIUS_KM) / EARTH_RADIUS_KM * scaling.multiplier * visualScalingMultiplier);
        } else if (node.roleHint === 'moon') {
            childRadius = Math.max(VISUAL_SCALING.moon.base, (node.radiusKm || 1737) / 1737 * visualScalingMultiplier * 0.5); // Moons are half the multiplier of planets
        }

        ctx.beginPath();
        ctx.arc(x, y, childRadius, 0, 2 * Math.PI);
        ctx.fillStyle = childColor;
        ctx.fill();
        if (childColor === '#000000') { // If it's a black hole
            ctx.beginPath();
            ctx.arc(x, y, childRadius, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
        }
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

        if (showNames) {
            ctx.fillStyle = getPlanetColor(node);
            ctx.font = `${12 / zoom}px sans-serif`;
            ctx.fillText(node.name, x + childRadius + 5 / zoom, y);
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
    style="border: 1px solid #333; margin-top: 1em; background-color: #08090d; cursor: grab; width: 100%;"
></canvas>

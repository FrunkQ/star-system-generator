<script lang="ts">
  import type { System, CelestialBody } from "$lib/types";
  import { onMount, onDestroy } from "svelte";
  import { propagate } from "$lib/api";

  export let system: System | null;
  export let currentTime: number;

  let canvas: HTMLCanvasElement;
  let animationFrameId: number;

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawSystem(ctx);
    }
    animationFrameId = requestAnimationFrame(render);
  }

  onMount(() => {
    render();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationFrameId);
  });

  const STAR_COLOR_MAP: Record<string, string> = {
    "O": "#9bb0ff", "B": "#aabfff", "A": "#cad8ff", "F": "#f8f7ff",
    "G": "#fff4ea", "K": "#ffd2a1", "M": "#ffc46f", "WD": "#f0f0f0",
    "NS": "#c0c0ff", "magnetar": "#d0a0ff", "BH": "#000000", "default": "#ffffff",
  };

  function drawSystem(ctx: CanvasRenderingContext2D) {
    if (!system || !system.nodes) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, width, height);

    const nodesById = new Map(system.nodes.map(n => [n.id, n]));
    const positions = new Map<string, { x: number, y: number }>();

    const maxOrbit = system.nodes.reduce((max, node) => {
        if (node.kind === 'body' && node.orbit && node.orbit.hostId.endsWith('-star-1')) {
            return Math.max(max, node.orbit.elements.a_AU);
        }
        return max;
    }, 0);
    const scale = (Math.min(width, height) / 2) / (maxOrbit * 1.2 || 10);

    // --- Calculate all positions first (handles hierarchy) ---
    for (const node of system.nodes) {
        if (positions.has(node.id)) continue; // Already calculated
        
        const path = [node];
        let current = node;
        while (current.parentId && !positions.has(current.parentId)) {
            const parent = nodesById.get(current.parentId);
            if (!parent) break;
            path.unshift(parent);
            current = parent;
        }

        for (const body of path) {
            if (positions.has(body.id)) continue;
            let parentPos = { x: centerX, y: centerY };
            if (body.parentId) {
                parentPos = positions.get(body.parentId) || parentPos;
            }

            if (body.kind === 'body' && body.orbit) {
                const pos = propagate(body, currentTime);
                if (pos) {
                    positions.set(body.id, { x: parentPos.x + pos.x * scale, y: parentPos.y + pos.y * scale });
                } else {
                    positions.set(body.id, parentPos);
                }
            } else {
                positions.set(body.id, parentPos);
            }
        }
    }

    // --- Draw Orbits and Bodies ---
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    for (const node of system.nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;

        // Draw Orbit
        if (node.kind === 'body' && node.orbit) {
            const parentPos = positions.get(node.parentId!) || { x: centerX, y: centerY };
            ctx.beginPath();
            const radius = node.orbit.elements.a_AU * scale;
            ctx.arc(parentPos.x, parentPos.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    for (const node of system.nodes) {
        const pos = positions.get(node.id);
        if (!pos || node.kind !== 'body') continue;

        let bodyRadius = 2;
        let color = "#aaa";

        if (node.roleHint === 'star') {
            const starClassKey = node.classes[0]?.split('/')[1] || 'default';
            color = STAR_COLOR_MAP[starClassKey] || STAR_COLOR_MAP['default'];
            bodyRadius = Math.max(15, (node.radiusKm || 696340) / 696340 * 20);
        } else if (node.roleHint === 'planet') {
            bodyRadius = Math.max(2, (node.radiusKm || 6371) / 6371 * 1.2);
        } else if (node.roleHint === 'moon') {
            bodyRadius = Math.max(1, (node.radiusKm || 1737) / 1737 * 0.7);
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, bodyRadius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
    }
  }

</script>

<canvas bind:this={canvas} width={800} height={600} style="border: 1px solid #333; margin-top: 1em; background-color: #08090d;"></canvas>

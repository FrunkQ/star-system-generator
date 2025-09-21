<script lang="ts">
  import type { System, CelestialBody } from "$lib/types";
  import { onMount } from "svelte";

  export let system: System | null;

  let canvas: HTMLCanvasElement;

  // Redraw when the system object changes
  $: if (canvas && system) {
    const ctx = canvas.getContext("2d");
    if (ctx) drawSystem(ctx);
  }

  const STAR_COLOR_MAP: Record<string, string> = {
    "star/O": "#9bb0ff",
    "star/B": "#aabfff",
    "star/A": "#cad8ff",
    "star/F": "#f8f7ff",
    "star/G": "#fff4ea",
    "star/K": "#ffd2a1",
    "star/M": "#ffc46f",
    "star/WD": "#f0f0f0",
    "star/NS": "#c0c0ff",
    "star/magnetar": "#d0a0ff",
    "star/BH": "#000000",
    "default": "#ffffff",
  };

  function drawSystem(ctx: CanvasRenderingContext2D) {
    if (!system || !system.nodes) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Clear canvas
    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, width, height);

    const star = system.nodes.find(n => n.parentId === null) as CelestialBody;
    if (!star) return;

    // Determine scale
    const maxOrbit = system.nodes.reduce((max, node) => {
        if (node.kind === 'body' && node.orbit) {
            return Math.max(max, node.orbit.elements.a_AU);
        }
        return max;
    }, 0);
    const scale = (Math.min(width, height) / 2) / (maxOrbit * 1.2 || 10); // pixels per AU

    // --- Draw Orbits ---
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (const node of system.nodes) {
        if (node.kind === 'body' && node.orbit) {
            ctx.beginPath();
            const radius = node.orbit.elements.a_AU * scale;
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    // --- Draw Star ---
    const starClass = star.classes[0] || 'default';
    const starColor = STAR_COLOR_MAP[starClass.split('/')[1]] || STAR_COLOR_MAP['default'];
    const starRadius = Math.max(5, (star.radiusKm || 696340) / 696340 * 5); // Scaled radius
    ctx.beginPath();
    ctx.arc(centerX, centerY, starRadius, 0, 2 * Math.PI);
    ctx.fillStyle = starColor;
    ctx.fill();

    // --- Draw Planets ---
    for (const node of system.nodes) {
        if (node.kind === 'body' && node.orbit) {
            const radius = node.orbit.elements.a_AU * scale;
            const angle = node.orbit.elements.M0_rad;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            const planetRadius = Math.max(1.5, (node.radiusKm || 6371) / 6371 * 2);
            ctx.beginPath();
            ctx.arc(x, y, planetRadius, 0, 2 * Math.PI);
            ctx.fillStyle = "#aaa";
            ctx.fill();
        }
    }
  }

</script>

<canvas bind:this={canvas} width={800} height={600} style="border: 1px solid #333; margin-top: 1em; background-color: #08090d;"></canvas>

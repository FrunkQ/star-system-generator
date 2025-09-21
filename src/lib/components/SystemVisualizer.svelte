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
  const positions = new Map<string, { x: number, y: number, radius: number }>();

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

  function handleClick(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (const [id, pos] of positions.entries()) {
        const dx = x - pos.x;
        const dy = y - pos.y;
        if (dx * dx + dy * dy < pos.radius * pos.radius) {
            dispatch("focus", id);
            return;
        }
    }
  }

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
    positions.clear();

    const focusId = focusedBodyId || system.nodes.find(n => n.parentId === null)?.id;
    if (!focusId) return;

    const focusBody = nodesById.get(focusId);
    if (!focusBody) return;

    const children = system.nodes.filter(n => n.parentId === focusId);

    const maxOrbit = children.reduce((max, node) => {
        if (node.kind === 'body' && node.orbit) {
            return Math.max(max, node.orbit.elements.a_AU);
        }
        return max;
    }, 0);
    const scale = (Math.min(width, height) / 2) / (maxOrbit * 1.2 || 0.1); // pixels per AU

    // --- Calculate and Draw --- 
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    // Draw focus body at center
    let bodyRadius = 2;
    let color = "#aaa";
    if (focusBody.kind === 'body') {
        if (focusBody.roleHint === 'star') {
            const starClassKey = focusBody.classes[0]?.split('/')[1] || 'default';
            color = STAR_COLOR_MAP[starClassKey] || STAR_COLOR_MAP['default'];
            bodyRadius = Math.max(15, (focusBody.radiusKm || 696340) / 696340 * 20);
        } else {
            bodyRadius = Math.max(8, (focusBody.radiusKm || 6371) / 6371 * 10);
        }
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, bodyRadius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    positions.set(focusBody.id, { x: centerX, y: centerY, radius: bodyRadius });

    // Draw children
    for (const node of children) {
        if (node.kind !== 'body' || !node.orbit) continue;

        // Draw Orbit
        ctx.beginPath();
        const orbitRadius = node.orbit.elements.a_AU * scale;
        ctx.arc(centerX, centerY, orbitRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Draw Body
        const pos = propagate(node, currentTime);
        if (!pos) continue;

        const x = centerX + pos.x * scale;
        const y = centerY + pos.y * scale;

        let childRadius = 2;
        if (node.roleHint === 'planet') {
            childRadius = Math.max(2, (node.radiusKm || 6371) / 6371 * 1.2);
        } else if (node.roleHint === 'moon') {
            childRadius = Math.max(1, (node.radiusKm || 1737) / 1737 * 0.7);
        }

        ctx.beginPath();
        ctx.arc(x, y, childRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "#aaa";
        ctx.fill();
        positions.set(node.id, { x, y, radius: childRadius });
    }
  }

</script>

<canvas bind:this={canvas} on:click={handleClick} width={800} height={600} style="border: 1px solid #333; margin-top: 1em; background-color: #08090d;"></canvas>
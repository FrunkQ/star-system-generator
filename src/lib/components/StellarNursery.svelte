<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import type { StarSeed } from '$lib/physics/stellar-evolution';

    const dispatch = createEventDispatcher();
    
    export let starsToPlace: StarSeed[] = [];
    export let placedStars: StarSeed[] = [];
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    
    let draggingStarIndex: number | null = null;
    let adjustingVectorIndex: number | null = null;
    
    const AU_KM = 149597870.7;
    const PIXELS_PER_AU = 20;
    const CANVAS_SIZE_AU = 40; 

    function getCanvasPos(star: StarSeed) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const x = centerX + (star.pos.x / 1000 / AU_KM) * PIXELS_PER_AU;
        const y = centerY + (star.pos.y / 1000 / AU_KM) * PIXELS_PER_AU;
        return { x, y };
    }

    function drawNursery() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Draw Grid
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 1;
        for (let r = 5; r <= CANVAS_SIZE_AU / 2; r += 5) {
            ctx.beginPath(); ctx.arc(centerX, centerY, r * PIXELS_PER_AU, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#4a5568'; ctx.font = '10px sans-serif';
            ctx.fillText(`${r} AU`, centerX + r * PIXELS_PER_AU + 5, centerY);
        }

        // Draw Stars & Vectors
        placedStars.forEach((star, i) => {
            const pos = getCanvasPos(star);
            const vEndX = pos.x + (star.vel.x / 1000) * 2;
            const vEndY = pos.y + (star.vel.y / 1000) * 2;
            
            // Velocity Handle
            ctx.strokeStyle = '#4299e1';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(vEndX, vEndY); ctx.stroke();
            
            ctx.fillStyle = '#4299e1';
            ctx.beginPath(); ctx.arc(vEndX, vEndY, 5, 0, Math.PI * 2); ctx.fill();
            
            // Star Body
            ctx.fillStyle = getStarColor(star.temperatureK);
            ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath(); ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            
            if (draggingStarIndex === i || adjustingVectorIndex === i) {
                ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2); ctx.stroke();
            }
        });
    }

    function handleMouseDown(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        placedStars.forEach((star, i) => {
            const pos = getCanvasPos(star);
            const vEndX = pos.x + (star.vel.x / 1000) * 2;
            const vEndY = pos.y + (star.vel.y / 1000) * 2;
            
            if (Math.sqrt((mouseX - pos.x)**2 + (mouseY - pos.y)**2) < 10) { draggingStarIndex = i; return; }
            if (Math.sqrt((mouseX - vEndX)**2 + (mouseY - vEndY)**2) < 10) { adjustingVectorIndex = i; return; }
        });

        if (draggingStarIndex === null && adjustingVectorIndex === null && starsToPlace.length > 0) {
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const star = starsToPlace.shift()!;
            star.pos = { x: ((mouseX - centerX) / PIXELS_PER_AU) * AU_KM * 1000, y: ((mouseY - centerY) / PIXELS_PER_AU) * AU_KM * 1000, z: 0 };
            star.vel = { x: (Math.random() - 0.5) * 5000, y: (Math.random() - 0.5) * 5000, z: 0 };
            placedStars = [...placedStars, star];
            starsToPlace = [...starsToPlace];
            drawNursery();
            dispatch('change', { placedStars, starsToPlace });
        }
    }

    function handleMouseMove(e: MouseEvent) {
        if (draggingStarIndex === null && adjustingVectorIndex === null) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        if (draggingStarIndex !== null) {
            placedStars[draggingStarIndex].pos = { x: ((mouseX - centerX) / PIXELS_PER_AU) * AU_KM * 1000, y: ((mouseY - centerY) / PIXELS_PER_AU) * AU_KM * 1000, z: 0 };
        } else if (adjustingVectorIndex !== null) {
            const pos = getCanvasPos(placedStars[adjustingVectorIndex]);
            placedStars[adjustingVectorIndex].vel = { x: (mouseX - pos.x) / 2 * 1000, y: (mouseY - pos.y) / 2 * 1000, z: 0 };
        }
        drawNursery();
    }

    function handleMouseUp() { draggingStarIndex = null; adjustingVectorIndex = null; dispatch('change', { placedStars, starsToPlace }); }

    function getStarColor(temp: number) {
        if (temp >= 30000) return '#9bb2ff';
        if (temp >= 10000) return '#cad7ff';
        if (temp >= 7500) return '#f8f7ff';
        if (temp >= 6000) return '#fff4ea';
        if (temp >= 5200) return '#fff2a1';
        if (temp >= 3700) return '#ffcc6f';
        return '#ff9833';
    }

    onMount(() => { ctx = canvas.getContext('2d')!; drawNursery(); });
</script>

<div class="nursery-container">
    <div class="header">
        <h3>Step 2: Place Stars in Space</h3>
        <p>Click to place. Drag stars to move. <strong>Drag blue circles</strong> to set initial velocity.</p>
    </div>
    <div class="canvas-wrapper">
        <canvas bind:this={canvas} width="600" height="600" on:mousedown={handleMouseDown} on:mousemove={handleMouseMove} on:mouseup={handleMouseUp}></canvas>
        <div class="pending-stars">
            <h4>Ready to Place:</h4>
            {#if starsToPlace.length === 0} <p class="empty">No stars selected. Go back to Step 1.</p>
            {:else}
                <div class="stars-row">
                    {#each starsToPlace as star} <div class="mini-star" style="background: {getStarColor(star.temperatureK)}">{star.spectralClass}</div> {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .nursery-container { display: flex; flex-direction: column; align-items: center; gap: 1rem; background: #1a202c; padding: 1rem; border-radius: 8px; }
    .canvas-wrapper { display: flex; gap: 2rem; align-items: flex-start; }
    canvas { background: #000; border: 1px solid #4a5568; cursor: crosshair; }
    .pending-stars { background: #2d3748; padding: 1rem; border-radius: 4px; min-width: 150px; }
    .stars-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .mini-star { width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center; color: #000; font-weight: bold; font-size: 0.8rem; }
    .empty { font-size: 0.8rem; color: #a0aec0; font-style: italic; }
</style>

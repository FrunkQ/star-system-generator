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
    let hoverHandleIndex: number | null = null;
    
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
        ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1;
        for (let r = 5; r <= CANVAS_SIZE_AU / 2; r += 5) {
            ctx.beginPath(); ctx.arc(centerX, centerY, r * PIXELS_PER_AU, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#4a5568'; ctx.font = '10px sans-serif';
            ctx.fillText(`${r} AU`, centerX + r * PIXELS_PER_AU + 5, centerY);
        }

        // Draw Dynamic Scale Bar (10 AU)
        ctx.strokeStyle = '#a0aec0'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, canvas.height - 40); ctx.lineTo(30 + 10 * PIXELS_PER_AU, canvas.height - 40);
        ctx.moveTo(30, canvas.height - 45); ctx.lineTo(30, canvas.height - 35);
        ctx.moveTo(30 + 10 * PIXELS_PER_AU, canvas.height - 45); ctx.lineTo(30 + 10 * PIXELS_PER_AU, canvas.height - 35);
        ctx.stroke();
        ctx.fillStyle = '#a0aec0'; ctx.font = '10px monospace';
        ctx.fillText('10 AU Scale', 30, canvas.height - 50);

        // 1. Draw Star Bodies FIRST (so they are under handles)
        placedStars.forEach((star, i) => {
            const pos = getCanvasPos(star);
            ctx.fillStyle = getStarColor(star.temperatureK);
            ctx.shadowBlur = 15; ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath(); ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            
            if (draggingStarIndex === i) {
                ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2); ctx.stroke();
            }
        });

        // 2. Draw Vectors and Handles ON TOP
        placedStars.forEach((star, i) => {
            const pos = getCanvasPos(star);
            const vEndX = pos.x + (star.vel.x / 1000) * 2;
            const vEndY = pos.y + (star.vel.y / 1000) * 2;
            const speedKmS = Math.sqrt(star.vel.x**2 + star.vel.y**2) / 1000;
            
            // Vector Line
            ctx.strokeStyle = '#00ff00'; // NEON GREEN
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(vEndX, vEndY); ctx.stroke();
            ctx.setLineDash([]);
            
            // Handle Handle (Circular)
            ctx.fillStyle = '#00ff00';
            if (hoverHandleIndex === i || adjustingVectorIndex === i) {
                ctx.shadowBlur = 10; ctx.shadowColor = '#00ff00';
            }
            ctx.beginPath(); ctx.arc(vEndX, vEndY, 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            // Speed Label
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`${speedKmS.toFixed(1)} km/s`, vEndX + 10, vEndY + 4);
        });
    }

    function handleMouseDown(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // CHECK HANDLES FIRST (they are on top)
        for (let i = placedStars.length - 1; i >= 0; i--) {
            const star = placedStars[i];
            const pos = getCanvasPos(star);
            const vEndX = pos.x + (star.vel.x / 1000) * 2;
            const vEndY = pos.y + (star.vel.y / 1000) * 2;
            if (Math.sqrt((mouseX - vEndX)**2 + (mouseY - vEndY)**2) < 12) { 
                adjustingVectorIndex = i; return; 
            }
        }

        // CHECK STARS SECOND
        for (let i = placedStars.length - 1; i >= 0; i--) {
            const star = placedStars[i];
            const pos = getCanvasPos(star);
            if (Math.sqrt((mouseX - pos.x)**2 + (mouseY - pos.y)**2) < 12) { 
                draggingStarIndex = i; return; 
            }
        }

        // PLACE NEW STAR
        if (draggingStarIndex === null && adjustingVectorIndex === null && starsToPlace.length > 0) {
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const star = starsToPlace.shift()!;
            star.pos = { x: ((mouseX - centerX) / PIXELS_PER_AU) * AU_KM * 1000, y: ((mouseY - centerY) / PIXELS_PER_AU) * AU_KM * 1000, z: 0 };
            // Default random small starting vector
            star.vel = { x: (Math.random() - 0.5) * 10000, y: (Math.random() - 0.5) * 10000, z: 0 };
            placedStars = [...placedStars, star];
            starsToPlace = [...starsToPlace];
            drawNursery();
            dispatch('change', { placedStars, starsToPlace });
        }
    }

    function handleMouseMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Hover detection for handles
        hoverHandleIndex = null;
        for (let i = placedStars.length - 1; i >= 0; i--) {
            const star = placedStars[i];
            const pos = getCanvasPos(star);
            const vEndX = pos.x + (star.vel.x / 1000) * 2;
            const vEndY = pos.y + (star.vel.y / 1000) * 2;
            if (Math.sqrt((mouseX - vEndX)**2 + (mouseY - vEndY)**2) < 12) { 
                hoverHandleIndex = i; break;
            }
        }

        if (draggingStarIndex !== null) {
            placedStars[draggingStarIndex].pos = { x: ((mouseX - centerX) / PIXELS_PER_AU) * AU_KM * 1000, y: ((mouseY - centerY) / PIXELS_PER_AU) * AU_KM * 1000, z: 0 };
        } else if (adjustingVectorIndex !== null) {
            const pos = getCanvasPos(placedStars[adjustingVectorIndex]);
            // Convert pixel delta back to velocity meters
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

    onMount(() => { 
        if (container) { canvas.width = container.clientWidth; canvas.height = container.clientHeight; }
        ctx = canvas.getContext('2d')!; 
        drawNursery(); 
    });
    
    let container: HTMLDivElement;
</script>

<div class="nursery-container">
    <div class="header">
        <h3>Step 2: Place Stars in Space</h3>
        <p>Click to place. Drag stars to move. <strong>Drag Green Circles</strong> to set velocity.</p>
    </div>
    <div class="canvas-viewport" bind:this={container}>
        <canvas bind:this={canvas} on:mousedown={handleMouseDown} on:mousemove={handleMouseMove} on:mouseup={handleMouseUp}></canvas>
        <div class="pending-stars">
            <h4>Ready to Place:</h4>
            {#if starsToPlace.length === 0} <p class="empty">All stars placed. Proceed to Step 3.</p>
            {:else}
                <div class="stars-row">
                    {#each starsToPlace as star} <div class="mini-star" style="background: {getStarColor(star.temperatureK)}">{star.spectralClass}</div> {/each}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .nursery-container { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; height: 100%; }
    .canvas-viewport { position: relative; width: 95vw; height: 60vh; background: #000; border: 1px solid #4a5568; border-radius: 8px; box-shadow: 0 0 50px rgba(0,0,0,0.9); overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
    .pending-stars { position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.8); padding: 1rem; border-radius: 4px; min-width: 150px; border: 1px solid #4a5568; }
    .stars-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .mini-star { width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center; color: #000; font-weight: bold; font-size: 0.8rem; }
    .empty { font-size: 0.8rem; color: #a0aec0; font-style: italic; }
</style>

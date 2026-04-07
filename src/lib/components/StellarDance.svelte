<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { type StarSeed, stepNBody, handleMergers } from '$lib/physics/stellar-evolution';

    const dispatch = createEventDispatcher();
    
    export let stars: StarSeed[] = [];
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let animationId: number;
    
    let isRunning = true;
    let timeScale = 100000;
    let autoZoom = 0.5;
    let currentCenterX = 0;
    let currentCenterY = 0;
    
    let simStars: StarSeed[] = [];
    let history: { [id: string]: { x: number, y: number }[] } = {};
    let systemTimeYears = 0;
    const MAX_SIM_TIME_YEARS = 1000000; // 1 Million Years for settling

    function startSimulation() {
        simStars = JSON.parse(JSON.stringify(stars)); 
        simStars.forEach(s => history[s.id] = []);
        systemTimeYears = 0;
        // Reset camera
        currentCenterX = 0;
        currentCenterY = 0;
        autoZoom = 0.5;
        loop();
    }

    function updateCamera() {
        const active = simStars.filter(s => !s.isMerged);
        if (active.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        active.forEach(s => {
            const distAU = Math.sqrt(s.pos.x**2 + s.pos.y**2) / 149597870700;
            // Only frame ejected stars if they are still relatively close (within 150 AU)
            if (s.isEjected && distAU > 150) return; 

            minX = Math.min(minX, s.pos.x);
            maxX = Math.max(maxX, s.pos.x);
            minY = Math.min(minY, s.pos.y);
            maxY = Math.max(maxY, s.pos.y);
        });

        // Add small buffer to bounds
        const targetX = (minX + maxX) / 2;
        const targetY = (minY + maxY) / 2;
        
        // Smoothly pan camera
        currentCenterX += (targetX - currentCenterX) * 0.1;
        currentCenterY += (targetY - currentCenterY) * 0.1;

        const spanX = Math.abs(maxX - minX);
        const spanY = Math.abs(maxY - minY);
        const AU_TO_M = 149597870700;
        
        // Calculate zoom level to fit the span
        const targetSpanAU = Math.max(10, Math.max(spanX, spanY) / AU_TO_M) * 1.5;
        const targetZoom = 10 / targetSpanAU; 
        
        // Smoothly zoom
        autoZoom += (targetZoom - autoZoom) * 0.05;
    }

    function loop() {
        if (isRunning && systemTimeYears < MAX_SIM_TIME_YEARS) {
            const dt = timeScale;
            for (let i = 0; i < 5; i++) {
                simStars = stepNBody(simStars, dt);
                const result = handleMergers(simStars);
                simStars = result.stars;
                systemTimeYears += dt / (365.25 * 24 * 3600);
            }
            draw();
        }
        animationId = requestAnimationFrame(loop);
    }

    function draw() {
        if (!ctx || !canvas) return;
        updateCamera();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const viewCenterX = canvas.width / 2;
        const viewCenterY = canvas.height / 2;
        const AU_TO_PX = (149597870700) / 100 * autoZoom;

        const toScreen = (worldX: number, worldY: number) => ({
            x: viewCenterX + (worldX - currentCenterX) / AU_TO_PX,
            y: viewCenterY + (worldY - currentCenterY) / AU_TO_PX
        });

        // Draw Trails
        simStars.forEach(star => {
            if (star.isMerged) return;
            const h = history[star.id];
            h.push({ x: star.pos.x, y: star.pos.y });
            if (h.length > 100) h.shift();

            ctx.strokeStyle = getStarColor(star.temperatureK) + '44';
            ctx.beginPath();
            h.forEach((p, i) => {
                const screen = toScreen(p.x, p.y);
                if (i === 0) ctx.moveTo(screen.x, screen.y);
                else ctx.lineTo(screen.x, screen.y);
            });
            ctx.stroke();
        });

        // Draw Stars
        simStars.forEach(star => {
            if (star.isMerged) return;
            const screen = toScreen(star.pos.x, star.pos.y);
            
            // Extreme ejection check
            const distAU = Math.sqrt(star.pos.x**2 + star.pos.y**2) / 149597870700;
            if (distAU > 2000) star.isEjected = true;

            ctx.shadowBlur = 10;
            ctx.shadowColor = getStarColor(star.temperatureK);
            ctx.fillStyle = getStarColor(star.temperatureK);
            
            ctx.beginPath();
            const radius = Math.max(3, (star.radiusKm / 696340) * 5 * autoZoom);
            ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'white';
            ctx.font = '10px sans-serif';
            ctx.fillText(star.spectralClass, screen.x + 8, screen.y + 4);
        });
    }

    function getStarColor(temp: number) {
        if (temp >= 30000) return '#9bb2ff';
        if (temp >= 10000) return '#cad7ff';
        if (temp >= 7500) return '#f8f7ff';
        if (temp >= 6000) return '#fff4ea';
        if (temp >= 5200) return '#fff2a1';
        if (temp >= 3700) return '#ffcc6f';
        return '#ff9833';
    }

    function finish() {
        const settledStars = simStars.filter(s => !s.isEjected && !s.isMerged);
        dispatch('settled', settledStars);
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        startSimulation();
    });

    onDestroy(() => {
        if (animationId) cancelAnimationFrame(animationId);
    });
</script>

<div class="dance-container">
    <div class="dance-header">
        <h3>Step 3: The Stellar Dance</h3>
        <p>Simulation Time: {Math.round(systemTimeYears).toLocaleString()} years</p>
    </div>

    <div class="canvas-container">
        <canvas bind:this={canvas} width="800" height="500"></canvas>
        
        <div class="controls">
            <div class="left-ctrl">
                <button on:click={() => isRunning = !isRunning}>
                    {isRunning ? 'Pause' : 'Resume'}
                </button>
                <button on:click={startSimulation}>Reset</button>
            </div>

            <div class="center-ctrl">
                <span>Simulation Progress:</span>
                <progress value={systemTimeYears} max={MAX_SIM_TIME_YEARS}></progress>
            </div>

            <div class="right-ctrl">
                <button class="finish-btn" on:click={finish}>Finalize Orbits</button>
            </div>
        </div>
    </div>

    <div class="status-panel">
        <div class="stat">
            <span class="label">Bound Stars:</span>
            <span class="value">{simStars.filter(s => !s.isEjected && !s.isMerged).length}</span>
        </div>
        <div class="stat">
            <span class="label">Merged:</span>
            <span class="value">{simStars.filter(s => s.isMerged).length}</span>
        </div>
        <div class="stat">
            <span class="label">Ejected:</span>
            <span class="value">{simStars.filter(s => s.isEjected).length}</span>
        </div>
    </div>
</div>

<style>
    .dance-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        align-items: center;
        width: 100%;
    }

    .canvas-container {
        position: relative;
        background: #000;
        border: 1px solid #4a5568;
        border-radius: 4px;
    }

    .controls {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0,0,0,0.6);
        padding: 10px;
        border-radius: 4px;
    }

    .center-ctrl {
        display: flex;
        align-items: center;
        gap: 10px;
        color: white;
        font-size: 0.8rem;
    }

    progress {
        width: 200px;
    }

    .status-panel {
        display: flex;
        gap: 2rem;
        background: #2d3748;
        padding: 1rem;
        border-radius: 8px;
    }

    .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .stat .label {
        font-size: 0.7rem;
        color: #a0aec0;
        text-transform: uppercase;
    }

    .stat .value {
        font-size: 1.2rem;
        font-weight: bold;
        color: #63b3ed;
    }

    .finish-btn {
        background: #38a169;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }

    .finish-btn:hover {
        background: #2f855a;
    }

    button {
        background: #4a5568;
        color: white;
        border: none;
        padding: 5px 15px;
        border-radius: 4px;
        cursor: pointer;
    }
</style>

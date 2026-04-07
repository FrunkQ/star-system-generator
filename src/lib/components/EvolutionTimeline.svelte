<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { simulateAccretion, type AccreteSnapshot, mapAccreteToBody } from '$lib/physics/accrete-adapter';
    import { type StarSeed, deriveStarFromHR } from '$lib/physics/stellar-evolution';
    import type { System, Node, ID } from '$lib/types';

    const dispatch = createEventDispatcher();
    
    export let stars: StarSeed[] = [];
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let container: HTMLDivElement;

    // Timeline State
    let snapshots: AccreteSnapshot[] = [];
    let currentYear = 0; 
    let maxYear = 15000000000; // 15 Billion Years
    
    let currentSnapshot: AccreteSnapshot | null = null;
    let isLoading = true;

    // View State
    let autoZoom = 1.0;
    let camX = 0; let camY = 0;
    let pixelsPerMeter = 1e-10;
    const AU_TO_M = 149597870700;

    function generateTimeline() {
        isLoading = true;
        // Generate Accrete snapshots (0 - 100 Myr)
        setTimeout(() => {
            snapshots = simulateAccretion(stars);
            currentSnapshot = snapshots[0];
            updateCamera(true);
            isLoading = false;
            draw();
        }, 100);
    }

    function handleSliderChange() {
        if (currentYear <= 100000000) {
            // Birth Phase (0 - 100 Myr): Use Accrete snapshots
            const progress = currentYear / 100000000;
            const idx = Math.min(snapshots.length - 1, Math.floor(progress * snapshots.length));
            currentSnapshot = snapshots[idx];
        } else {
            // Life/Death Phase (100 Myr - 15 Gyr): Age the system
            const ageGyr = currentYear / 1000000000;
            const baseState = snapshots[snapshots.length - 1];
            
            // Apply stellar aging (Luminosity increases over time)
            const agedStars = baseState.stars.map(s => {
                const ageFactor = 1 + (ageGyr / 10) * 0.5; // Simple linear expansion
                const agedLum = s.luminositySolar * ageFactor;
                const agedTemp = s.temperatureK * (1 - (ageGyr / 15) * 0.1);
                const props = deriveStarFromHR(agedTemp, agedLum);
                return { ...s, ...props };
            });

            currentSnapshot = {
                year: currentYear,
                stars: agedStars,
                planets: baseState.planets
            };
        }
        updateCamera();
        draw();
    }

    function updateCamera(instant = false) {
        if (!currentSnapshot) return;
        const active = currentSnapshot.planets;
        
        let minX = -10 * AU_TO_M, maxX = 10 * AU_TO_M, minY = -10 * AU_TO_M, maxY = 10 * AU_TO_M;
        active.forEach(p => {
            const r = p.a * AU_TO_M;
            minX = Math.min(minX, -r); maxX = Math.max(maxX, r);
            minY = Math.min(minY, -r); maxY = Math.max(maxY, r);
        });

        const targetPPM = (Math.min(canvas.width, canvas.height) * 0.8) / Math.max(maxX - minX, maxY - minY);
        if (instant) pixelsPerMeter = targetPPM;
        else pixelsPerMeter += (targetPPM - pixelsPerMeter) * 0.1;
    }

    function draw() {
        if (!ctx || !canvas || !currentSnapshot) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const ppm = pixelsPerMeter;

        // Draw Orbits
        currentSnapshot.planets.forEach(p => {
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, p.a * AU_TO_M * ppm, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Draw Planets
        currentSnapshot.planets.forEach((p, i) => {
            const x = cx + p.a * AU_TO_M * ppm;
            ctx.fillStyle = p.isGasGiant ? '#63b3ed' : '#a0aec0';
            ctx.beginPath();
            ctx.arc(x, cy, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#718096';
            ctx.font = '10px sans-serif';
            ctx.fillText(p.isGasGiant ? 'Gas' : 'Terr', x + 8, cy + 4);
        });

        // Draw Stars
        currentSnapshot.stars.forEach(star => {
            ctx.fillStyle = getStarColor(star.temperatureK);
            ctx.shadowBlur = 30; ctx.shadowColor = ctx.fillStyle;
            const radius = 15;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
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

    function finalize() {
        if (!currentSnapshot) return;
        
        const systemId = `evo-${Date.now()}`;
        const nodes: Node[] = [];

        // 1. Create Star Node(s)
        currentSnapshot.stars.forEach((s, i) => {
            const starBody: Node = {
                id: `star-${i}`,
                body: {
                    id: `star-${i}`,
                    name: `Star ${s.spectralClass}`,
                    massKg: s.massKg,
                    radiusKm: s.radiusKm,
                    temperatureK: s.temperatureK,
                    classes: ['star'],
                    tags: []
                },
                orbit: { parentId: systemId, elements: { a_AU: 0, e: 0, i_deg: 0, lan_deg: 0, arg_p_deg: 0, ma_t0_deg: 0 } },
                children: []
            };
            nodes.push(starBody);
        });

        // 2. Create Planet Nodes
        currentSnapshot.planets.forEach((p, i) => {
            nodes.push(mapAccreteToBody(p, `planet-${i}`, nodes[0].id));
        });

        const finalSystem: System = {
            id: systemId,
            name: "Evolutionary System",
            seed: "evolutionary",
            epochT0: Date.now(),
            age_Gyr: currentYear / 1000000000,
            nodes,
            rulePackId: "starter-sf",
            rulePackVersion: "1.0.0",
            tags: [{ key: "Evolutionary" }],
            toytownFactor: 0,
            visualScalingMultiplier: 0.5,
            isManuallyEdited: false
        };
        
        dispatch('complete', finalSystem);
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        generateTimeline();
    });
</script>

<div class="evolution-container">
    <div class="header">
        <h3>Step 4: System Evolution</h3>
        <p>Current Age: {(currentYear / 1000000).toFixed(1)} Million Years</p>
        {#if currentYear > 1000000000}
            <p class="era-label">Stable Main Sequence</p>
        {:else if currentYear > 100000000}
            <p class="era-label">Post-Accretion Settlement</p>
        {:else}
            <p class="era-label">Birth Phase (Accretion Snapshots)</p>
        {/if}
    </div>

    <div class="canvas-viewport" bind:this={container}>
        {#if isLoading}
            <div class="loader">Running Accrete.js Simulation...</div>
        {/if}
        <canvas bind:this={canvas}></canvas>
        
        <div class="timeline-controls">
            <div class="slider-row">
                <span>Birth</span>
                <input 
                    type="range" 
                    min="0" 
                    max={maxYear} 
                    step={1000000} 
                    bind:value={currentYear} 
                    on:input={handleSliderChange} 
                />
                <span>Death</span>
            </div>
            <div class="actions-row">
                <button class="primary-btn" on:click={finalize}>Finalize & Create System</button>
            </div>
        </div>
    </div>
</div>

<style>
    .evolution-container { display: flex; flex-direction: column; align-items: center; width: 100%; height: 100%; gap: 1rem; }
    .era-label { color: #63b3ed; font-weight: bold; font-size: 0.9rem; margin-top: -0.5rem; }
    .canvas-viewport { position: relative; width: 95vw; height: 60vh; background: #000; border: 1px solid #4a5568; border-radius: 8px; box-shadow: 0 0 50px rgba(0,0,0,0.9); overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; }
    .loader { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; background: rgba(0,0,0,0.8); color: #63b3ed; font-weight: bold; z-index: 10; }
    .timeline-controls { position: absolute; bottom: 20px; left: 20px; right: 20px; background: rgba(0,0,0,0.85); padding: 1.5rem; border-radius: 8px; display: flex; flex-direction: column; gap: 1rem; border: 1px solid #4a5568; backdrop-filter: blur(8px); }
    .slider-row { display: flex; align-items: center; gap: 1.5rem; color: #a0aec0; font-size: 0.9rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    input[type="range"] { flex-grow: 1; height: 8px; border-radius: 4px; background: #2d3748; appearance: none; cursor: pointer; }
    input[type="range"]::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #63b3ed; cursor: pointer; border: 2px solid white; }
    .actions-row { display: flex; justify-content: center; }
    .primary-btn { background: #38a169; color: white; border: none; padding: 12px 30px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 1.1rem; }
    .primary-btn:hover { background: #2f855a; box-shadow: 0 0 15px rgba(72, 187, 120, 0.4); }
</style>

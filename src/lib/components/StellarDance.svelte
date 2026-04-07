<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { type StarSeed, stepNBody, handleMergers, shiftToBarycentricFrame, checkEjections, deriveStarFromHR } from '$lib/physics/stellar-evolution';

    const dispatch = createEventDispatcher();
    
    export let stars: StarSeed[] = [];
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let container: HTMLDivElement;
    let animationId: number;
    
    let isRunning = true;
    let systemTimeYears = 0;
    let stableYears = 0;
    const MAX_SIM_TIME_YEARS = 1000000; 
    const STABILITY_THRESHOLD_YEARS = 100000;

    // Simulation State
    let simStars: StarSeed[] = [];
    let history: { [id: string]: { x: number, y: number }[] } = {};
    let orbitProfiles: { [id: string]: { x: number, y: number }[] } = {};
    let adaptiveTimeScale = 1; 
    let eventLog: string[] = [];
    let eventCount = 0;
    
    // Logarithmic Time Warp
    let timeWarpPower = 0; 
    $: timeWarpMult = Math.pow(10, timeWarpPower);

    // Physics Metrics
    let minSepAU = 0;
    let relVelKM = 0;
    let yearsPerSec = 0;
    let isSloMo = false;

    // Camera State
    let camX = 0; let camY = 0;
    let pixelsPerMeter = 1e-10; 
    const AU_TO_M = 149597870700;
    const G = 6.67430e-11;

    function addEvent(msg: string) {
        eventLog = [msg, ...eventLog].slice(0, 5);
        eventCount++;
    }

    function startSimulation() {
        if (animationId) cancelAnimationFrame(animationId);
        simStars = shiftToBarycentricFrame(JSON.parse(JSON.stringify(stars))); 
        history = {}; orbitProfiles = {};
        simStars.forEach(s => history[s.id] = []);
        systemTimeYears = 0; stableYears = 0; timeWarpPower = 0; 
        eventLog = ["Simulation Started"]; eventCount = 0;
        isRunning = true;
        if (simStars.length <= 1) { 
            isRunning = false; 
            addEvent("Single star: Stable");
            generateOrbitProfiles();
            updateCamera(true);
        } else {
            updateCamera(true);
        }
        loop();
    }

    function generateOrbitProfiles() {
        if (simStars.length <= 1) return;
        const active = simStars.filter(s => !s.isMerged && !s.isEjected);
        let projStars = JSON.parse(JSON.stringify(simStars));
        const dt = 100000; 
        orbitProfiles = {};
        active.forEach(s => orbitProfiles[s.id] = []);
        for (let i = 0; i < 1500; i++) {
            projStars = stepNBody(projStars, dt);
            active.forEach(s => {
                const ps = projStars.find((p: any) => p.id === s.id);
                if (ps) orbitProfiles[s.id].push({ x: ps.pos.x, y: ps.pos.y });
            });
        }
    }

    function updateCamera(instant = false) {
        const active = simStars.filter(s => !s.isMerged && !s.isEjected && !s.isUnbound);
        if (active.length === 0) return;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let totalMass = 0; let baryX = 0, baryY = 0;
        active.forEach(s => {
            minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
            minY = Math.min(minY, s.pos.y); maxY = Math.max(maxY, s.pos.y);
            baryX += s.pos.x * s.massKg; baryY += s.pos.y * s.massKg;
            totalMass += s.massKg;
        });
        const targetX = baryX / totalMass;
        const targetY = baryY / totalMass;
        const spanX = Math.max(25 * AU_TO_M, (maxX - minX) * 1.8);
        const spanY = Math.max(25 * AU_TO_M, (maxY - minY) * 1.8);
        const targetPPM = Math.min((canvas.width * 0.85) / spanX, (canvas.height * 0.85) / spanY);
        if (instant) { camX = targetX; camY = targetY; pixelsPerMeter = targetPPM; }
        else {
            camX += (targetX - camX) * 0.1;
            camY += (targetY - camY) * 0.1;
            pixelsPerMeter += (targetPPM - pixelsPerMeter) * 0.1;
        }
    }

    function loop() {
        if (isRunning && systemTimeYears < MAX_SIM_TIME_YEARS) {
            const active = simStars.filter(s => !s.isMerged && !s.isEjected);
            
            // INSTANT STABILITY IF 1 STAR REMAINS
            if (active.length <= 1 && systemTimeYears > 100) { 
                isRunning = false; 
                addEvent("System Stabilized: 1 Star");
                generateOrbitProfiles(); 
                updateCamera(true); 
                return; 
            }

            let minDist = Infinity; let relVel = 0; let totalMass = 0;
            active.forEach(s => totalMass += s.massKg);
            for(let i=0; i<active.length; i++) {
                for(let j=i+1; j<active.length; j++) {
                    const d = Math.sqrt((active[j].pos.x - active[i].pos.x)**2 + (active[j].pos.y - active[i].pos.y)**2);
                    if (d < minDist) { minDist = d; relVel = Math.sqrt((active[j].vel.x - active[i].vel.x)**2 + (active[j].vel.y - active[i].vel.y)**2); }
                }
            }
            minSepAU = minDist / AU_TO_M;
            relVelKM = relVel / 1000;

            isSloMo = timeWarpPower < 0.1 && active.length > 1 && (minDist / AU_TO_M < 5 || relVel > 80000); 
            const interactionFactor = Math.max(0.01, Math.min(1, (minDist || 1e15) / (20 * AU_TO_M)));
            const velocityFactor = Math.max(1, relVel / 20000);
            const targetTS = (5000000 * interactionFactor / velocityFactor) * timeWarpMult * (isSloMo ? 0.1 : 1.0);
            adaptiveTimeScale += (targetTS - adaptiveTimeScale) * 0.05;
            adaptiveTimeScale = Math.max(1, adaptiveTimeScale);

            let structuralEvent = false;
            const iterations = timeWarpPower > 2 ? 100 : (timeWarpPower > 1 ? 40 : 10);
            const dt_per_substep = adaptiveTimeScale / iterations;
            const startYears = systemTimeYears;
            
            for (let i = 0; i < iterations; i++) {
                const preCount = active.length;
                simStars = stepNBody(simStars, dt_per_substep);
                
                const mergeRes = handleMergers(simStars);
                simStars = mergeRes.stars;
                if (mergeRes.mergedAny) { 
                    structuralEvent = true; 
                    simStars.forEach(s => {
                        if (!s.isMerged && !s.isEjected) {
                            const updated = deriveStarFromHR(s.temperatureK, Math.pow(s.massKg / 1.989e30, 3.5));
                            s.spectralClass = updated.spectralClass;
                            s.category = updated.category;
                            s.luminosityClass = updated.luminosityClass;
                        }
                    });
                    addEvent("Stars Merged: Properties Updated"); 
                }
                
                const ejectRes = checkEjections(simStars);
                simStars = ejectRes.stars;
                if (ejectRes.ejectedAny) { structuralEvent = true; addEvent("Star Unbound (Escaping)"); }

                const postActive = simStars.filter(s => !s.isMerged && !s.isEjected);
                if (postActive.length !== preCount) structuralEvent = true;
                
                if (structuralEvent) {
                    const bound = simStars.filter(s => !s.isMerged && !s.isEjected && !s.isUnbound);
                    shiftToBarycentricFrame(bound);
                    stableYears = 0;
                }

                const deltaYears = dt_per_substep / (365.25 * 24 * 3600);
                systemTimeYears += deltaYears;
                if (!structuralEvent) stableYears += deltaYears;
            }
            yearsPerSec = (systemTimeYears - startYears) * 60; 
            if (stableYears > STABILITY_THRESHOLD_YEARS) { isRunning = false; generateOrbitProfiles(); updateCamera(true); }
        }
        draw();
        animationId = requestAnimationFrame(loop);
    }

    function draw() {
        if (!ctx || !canvas) return;
        updateCamera();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2; const cy = canvas.height / 2;
        const toScreen = (x: number, y: number) => ({ x: cx + (x - camX) * pixelsPerMeter, y: cy + (y - camY) * pixelsPerMeter });

        // Trails
        simStars.forEach(star => {
            if (star.isMerged || star.isEjected) return;
            const h = isRunning ? history[star.id] : orbitProfiles[star.id];
            if (!h) return;
            if (isRunning) h.push({ x: star.pos.x, y: star.pos.y });
            if (isRunning && h.length > 1500) h.shift();
            ctx.strokeStyle = getStarColor(star.temperatureK) + (isRunning ? (star.isUnbound ? '11' : '22') : '66');
            ctx.lineWidth = isRunning ? 1 : 2;
            ctx.beginPath();
            h.forEach((p, i) => { const s = toScreen(p.x, p.y); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
            if (!isRunning && h.length > 0) { const s = toScreen(h[0].x, h[0].y); ctx.lineTo(s.x, s.y); }
            ctx.stroke();
        });

        // Stars
        simStars.forEach(star => {
            if (star.isMerged || star.isEjected) return;
            const s = toScreen(star.pos.x, star.pos.y);
            if (star.isUnbound) {
                if (s.x < -50 || s.x > canvas.width + 50 || s.y < -50 || s.y > canvas.height + 50) {
                    star.isEjected = true; addEvent(`Star ${star.spectralClass} Ejected`); return;
                }
            }
            if (s.x < -100 || s.x > canvas.width + 100 || s.y < -100 || s.y > canvas.height + 100) return;
            const logRadius = Math.log10(star.radiusKm / 10000); 
            const finalRadius = Math.max(6, Math.min(40, logRadius * 10));
            ctx.shadowBlur = 20; ctx.shadowColor = getStarColor(star.temperatureK);
            ctx.fillStyle = getStarColor(star.temperatureK);
            if (star.isUnbound) ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.arc(s.x, s.y, finalRadius, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; ctx.fillStyle = 'white'; ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${star.spectralClass} (${(star.massKg / 1.989e30).toFixed(1)}M⊙)`, s.x + finalRadius + 6, s.y + 4);
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

    onMount(() => { ctx = canvas.getContext('2d')!; setTimeout(() => { if (container) { canvas.width = container.clientWidth; canvas.height = container.clientHeight; } startSimulation(); }, 100); });
    onDestroy(() => { if (animationId) cancelAnimationFrame(animationId); });
</script>

<div class="dance-container">
    <div class="dance-header">
        <h3>Step 3: The Stellar Dance</h3>
        <p class="status-msg" class:stable={!isRunning}>
            {#if !isRunning} System Stabilized
            {:else} Simulating Gravitational Settling...
            {/if}
        </p>
        <div class="timer">{Math.round(systemTimeYears).toLocaleString()} years elapsed</div>
    </div>

    <div class="canvas-viewport" bind:this={container}>
        <canvas bind:this={canvas}></canvas>
        <div class="debug-panel">
            <div class="debug-row"><span>Sim Speed:</span> <span>{Math.round(yearsPerSec).toLocaleString()} yr/s</span></div>
            <div class="debug-row"><span>Min Sep:</span> <span>{minSepAU.toFixed(2)} AU</span></div>
            <div class="debug-row"><span>Stability:</span> <span>{Math.round(stableYears).toLocaleString()} yr</span></div>
            <div class="event-log">
                {#each eventLog as msg} <div>[Event] {msg}</div> {/each}
            </div>
        </div>
        <div class="controls">
            <div class="left-ctrl">
                <button on:click={() => isRunning = !isRunning}>{isRunning ? 'Pause' : 'Resume'}</button>
                <button on:click={startSimulation}>Reset</button>
            </div>
            <div class="center-ctrl">
                <div class="warp-control">
                    <span>Time Warp:</span>
                    <input type="range" min="0" max="3" step="0.1" bind:value={timeWarpPower} />
                    <span class="warp-val">{Math.round(timeWarpMult)}x</span>
                </div>
                <div class="progress-stack">
                    <progress value={systemTimeYears} max={MAX_SIM_TIME_YEARS}></progress>
                    <div class="progress-label">Stability Lock</div>
                    <progress class="stability-bar" value={stableYears} max={STABILITY_THRESHOLD_YEARS}></progress>
                </div>
            </div>
            <button class="finish-btn" on:click={() => dispatch('settled', simStars.filter(s => !s.isEjected && !s.isMerged))}>Finalize Orbits</button>
        </div>
    </div>

    <div class="status-panel">
        <div class="stat"><span class="label">Bound:</span><span class="value">{simStars.filter(s => !s.isEjected && !s.isMerged).length}</span></div>
        <div class="stat"><span class="label">Merged:</span><span class="value">{simStars.filter(s => s.isMerged).length}</span></div>
        <div class="stat"><span class="label">Ejected:</span><span class="value">{simStars.filter(s => s.isEjected).length}</span></div>
    </div>
</div>

<style>
    .dance-container { display: flex; flex-direction: column; gap: 1rem; align-items: center; width: 100%; height: 100%; }
    .status-msg { font-weight: bold; color: #63b3ed; }
    .status-msg.stable { color: #48bb78; }
    .timer { font-family: monospace; font-size: 0.9rem; color: #a0aec0; }
    .canvas-viewport { position: relative; width: 95vw; height: 60vh; background: #000; border: 1px solid #4a5568; border-radius: 8px; box-shadow: 0 0 50px rgba(0,0,0,0.9); overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }
    .debug-panel { position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); pointer-events: none; min-width: 180px; }
    .debug-row { display: flex; justify-content: space-between; gap: 20px; font-family: monospace; font-size: 0.7rem; color: #48bb78; }
    .event-log { margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px; font-family: monospace; font-size: 0.65rem; color: #a0aec0; }
    .controls { position: absolute; bottom: 15px; left: 15px; right: 15px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.85); padding: 12px; border-radius: 6px; backdrop-filter: blur(8px); border: 1px solid #4a5568; }
    .warp-control { display: flex; align-items: center; gap: 10px; color: #a0aec0; font-size: 0.75rem; }
    .warp-val { color: #63b3ed; font-weight: bold; min-width: 40px; }
    .progress-stack { display: flex; flex-direction: column; gap: 4px; width: 30%; }
    .progress-label { font-size: 0.6rem; color: #718096; text-transform: uppercase; text-align: center; }
    progress { width: 100%; height: 6px; border-radius: 3px; }
    progress.stability-bar::-webkit-progress-value { background-color: #4299e1; }
    .status-panel { display: flex; gap: 3rem; background: #2d3748; padding: 1rem 2rem; border-radius: 8px; border: 1px solid #4a5568; }
    .stat { display: flex; flex-direction: column; align-items: center; }
    .stat .label { font-size: 0.7rem; color: #a0aec0; text-transform: uppercase; }
    .stat .value { font-size: 1.4rem; font-weight: bold; color: #63b3ed; }
    .finish-btn { background: #38a169; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    button { background: #4a5568; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
</style>

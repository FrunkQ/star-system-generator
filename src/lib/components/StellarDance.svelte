<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from 'svelte';
    import { type StarSeed, stepNBody, handleMergers, shiftToBarycentricFrame, checkEjections, deriveStarFromHR } from '$lib/physics/stellar-evolution';

    const dispatch = createEventDispatcher();
    
    export let stars: StarSeed[] = [];
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let container: HTMLDivElement;
    let animationId: number;
    let logicalWidth = 800;
    let logicalHeight = 600;
    
    let isRunning = true;
    // ... rest of state ...

    // (Omitted unchanged state for brevity in thought, but must include all logic)
    let systemTimeYears = 0;
    let stableYears = 0;
    const MAX_SIM_TIME_YEARS = 1000000; 
    const STABILITY_THRESHOLD_YEARS = 100000;

    // Simulation State
    let simStars: StarSeed[] = [];
    let history: { [id: string]: { x: number, y: number }[] } = {};
    let orbitProfiles: { [id: string]: { x: number, y: number }[] } = {};
    let eventLog: string[] = [];
    let eventCount = 0;
    
    // Simplified Speed Logic
    let timeWarpPower = 0; 
    let slowdownFactor = 1.0; // Drops during events, lerps back to 1.0
    let eventPauseFrames = 0;
    $: timeWarpMult = Math.pow(10, timeWarpPower);

    // Visual Effects
    interface VisualEffect { starId?: string; x: number; y: number; life: number; maxLife: number; type: 'impact' | 'eject'; color: string; }
    let visualEffects: VisualEffect[] = [];

    // Physics Metrics
    let minSepAU = 0;
    let relVelKM = 0;
    let yearsPerSec = 0;

    // Camera State
    let camX = 0; let camY = 0;
    let pixelsPerMeter = 1e-10; 
    const AU_TO_M = 149597870700;
    const G = 6.67430e-11;

    function addEvent(msg: string) {
        eventLog = [msg, ...eventLog].slice(0, 5);
        eventCount++;
    }

    function triggerEventSlowdown(type: 'impact' | 'eject', x: number, y: number, color: string, starId?: string) {
        // Heavy slowdown, scales to counter high time warp settings
        slowdownFactor = 0.005 / Math.max(1, timeWarpMult * 0.5); 
        eventPauseFrames = 60; // Hold the pause for 1 full second (at 60fps)
        visualEffects.push({
            starId, x, y, 
            life: 1.0, 
            maxLife: type === 'impact' ? 90 : 180, // Longer visual effect duration
            type, 
            color 
        });
    }

    function startSimulation() {
        if (animationId) cancelAnimationFrame(animationId);
        simStars = shiftToBarycentricFrame(JSON.parse(JSON.stringify(stars))); 
        history = {}; orbitProfiles = {};
        visualEffects = [];
        simStars.forEach(s => history[s.id] = []);
        systemTimeYears = 0; stableYears = 0; slowdownFactor = 1.0; eventPauseFrames = 0;
        eventLog = ["Simulation Started"]; eventCount = 0;
        isRunning = true;
        updateCamera(true);
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
        active.forEach(s => {
            minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
            minY = Math.min(minY, s.pos.y); maxY = Math.max(maxY, s.pos.y);
        });

        // Geometric center of the bounding box
        const targetX = (minX + maxX) / 2;
        const targetY = (minY + maxY) / 2;

        // Add 50% margin (1.5x span) and enforce a larger minimum scale of 25 AU
        const spanX = Math.max(25 * AU_TO_M, (maxX - minX) * 1.5);
        const spanY = Math.max(25 * AU_TO_M, (maxY - minY) * 1.5);
        
        const targetPPM = Math.min(logicalWidth / spanX, logicalHeight / spanY);

        if (instant) { 
            camX = targetX; camY = targetY; pixelsPerMeter = targetPPM; 
        } else {
            // Smooth tracking during events, faster tracking at high warp
            // Use slowdownFactor to prevent jarring camera snaps during ejections
            const baseTrackSpeed = Math.min(1.0, 0.1 * timeWarpMult);
            const trackSpeed = slowdownFactor < 0.5 ? Math.min(0.02, baseTrackSpeed) : baseTrackSpeed;
            camX += (targetX - camX) * trackSpeed;
            camY += (targetY - camY) * trackSpeed;
            
            // Zoom is always slightly smoother than pan
            const zoomSpeed = Math.min(0.1, trackSpeed * 0.5);
            pixelsPerMeter += (targetPPM - pixelsPerMeter) * zoomSpeed;
        }
    }

    function loop() {
        // ... (rest of loop is same)
        if (isRunning && systemTimeYears < MAX_SIM_TIME_YEARS) {
            const activeBound = simStars.filter(s => !s.isMerged && !s.isEjected && !s.isUnbound);
            
            // Stabilize immediately if 1 or 0 bound stars remain (ignore escaping stars)
            if (activeBound.length <= 1 && systemTimeYears > 100) { 
                isRunning = false; 
                addEvent("System Stabilized");
                generateOrbitProfiles(); 
                updateCamera(true); 
                return; 
            }

            // Simple direct speed control
            const baseTimeStepPerFrame = 500000 * timeWarpMult; 
            const currentDt = baseTimeStepPerFrame * slowdownFactor;
            
            // Recover from slowdown - Wait for pause to finish, then accelerate back up over 1 second
            if (eventPauseFrames > 0) {
                eventPauseFrames--;
            } else {
                slowdownFactor += (1.0 - slowdownFactor) * 0.02;
            }

            const iterations = timeWarpPower > 2 ? 50 : 10;
            const dt_per_substep = currentDt / iterations;
            const startYears = systemTimeYears;
            
            for (let i = 0; i < iterations; i++) {
                simStars = stepNBody(simStars, dt_per_substep);
                
                // Check Mergers
                const mergeRes = handleMergers(simStars);
                if (mergeRes.mergedAny) { 
                    const mergedStar = simStars.find(s => s.isMerged && !s.alreadyProcessed);
                    if (mergedStar) {
                        triggerEventSlowdown('impact', mergedStar.pos.x, mergedStar.pos.y, getStarColor(mergedStar.temperatureK));
                        mergedStar.alreadyProcessed = true;
                    }
                    addEvent("Stars Merged"); 
                }
                
                // Check Ejections
                const ejectRes = checkEjections(simStars);
                if (ejectRes.ejectedAny) { 
                    const newlyUnbound = simStars.find(s => s.isUnbound && !s.alreadyHighlighted);
                    if (newlyUnbound) {
                        triggerEventSlowdown('eject', newlyUnbound.pos.x, newlyUnbound.pos.y, '#ff3333', newlyUnbound.id);
                        newlyUnbound.alreadyHighlighted = true;
                    }
                    addEvent("Star Escaping"); 

                    // RE-CENTER FRAME ON BOUND STARS
                    // This stops the system from drifting away and restores the orbital trails (spirographs)
                    const bound = simStars.filter(s => !s.isMerged && !s.isEjected && !s.isUnbound);
                    if (bound.length > 0) {
                        let totalMass = 0, baryX = 0, baryY = 0, momX = 0, momY = 0;
                        bound.forEach(s => {
                            totalMass += s.massKg; 
                            baryX += s.pos.x * s.massKg; baryY += s.pos.y * s.massKg;
                            momX += s.vel.x * s.massKg; momY += s.vel.y * s.massKg;
                        });
                        if (totalMass > 0) {
                            const pShiftX = baryX / totalMass, pShiftY = baryY / totalMass;
                            const vDriftX = momX / totalMass, vDriftY = momY / totalMass;

                            simStars.forEach(s => {
                                s.pos.x -= pShiftX; s.pos.y -= pShiftY;
                                s.vel.x -= vDriftX; s.vel.y -= vDriftY;
                                // Clear history to prevent jumping lines
                                if (history[s.id]) history[s.id] = [];
                            });

                            // Adjust camera so it doesn't jump!
                            camX -= pShiftX;
                            camY -= pShiftY;

                            // Adjust non-bound visual effects so they don't jump relative to the frame
                            visualEffects.forEach(ef => {
                                if (!ef.starId) {
                                    ef.x -= pShiftX; ef.y -= pShiftY;
                                }
                            });
                        }
                    }
                }

                const deltaYears = dt_per_substep / (365.25 * 24 * 3600);
                systemTimeYears += deltaYears;
                stableYears += deltaYears;
                
                if (mergeRes.mergedAny || ejectRes.ejectedAny) {
                    stableYears = 0;
                    // IMMEDIATELY break out of substeps to prevent instant fast-forwarding 
                    // before the slowdown factor can be applied on the next frame!
                    break;
                }
            }
            yearsPerSec = (systemTimeYears - startYears) * 60; 
            if (stableYears > STABILITY_THRESHOLD_YEARS) { isRunning = false; generateOrbitProfiles(); updateCamera(true); }
        }

        // Update visual effects life
        visualEffects = visualEffects.filter(ef => {
            ef.life -= 1 / ef.maxLife;
            return ef.life > 0;
        });

        draw();
        animationId = requestAnimationFrame(loop);
    }

    function draw() {
        if (!ctx || !canvas) return;
        updateCamera();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = logicalWidth / 2; const cy = logicalHeight / 2;
        const toScreen = (x: number, y: number) => ({ x: cx + (x - camX) * pixelsPerMeter, y: cy + (y - camY) * pixelsPerMeter });

        // Trails
        simStars.forEach(star => {
            if (star.isMerged || star.isEjected) return;
            const h = isRunning ? history[star.id] : orbitProfiles[star.id];
            if (!h) return;
            if (isRunning && slowdownFactor > 0.5) { // Only record history when not in super-slowmo
                h.push({ x: star.pos.x, y: star.pos.y });
                if (h.length > 1500) h.shift();
            }
            ctx.strokeStyle = getStarColor(star.temperatureK) + (star.isUnbound ? 'cc' : 'aa');
            ctx.lineWidth = isRunning ? 1 : 2;
            ctx.beginPath();
            h.forEach((p, i) => { const s = toScreen(p.x, p.y); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
            ctx.stroke();
        });

        // Visual Effects (Impacts/Highlights)
        visualEffects.forEach(ef => {
            let px = ef.x; let py = ef.y;
            if (ef.starId) {
                const star = simStars.find(s => s.id === ef.starId);
                if (star) { px = star.pos.x; py = star.pos.y; }
            }
            const s = toScreen(px, py);
            
            if (ef.type === 'impact') {
                ctx.strokeStyle = ef.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(s.x, s.y, (1 - ef.life) * 100, 0, Math.PI * 2);
                ctx.globalAlpha = ef.life;
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            } else if (ef.type === 'eject') {
                ctx.strokeStyle = '#ff3333';
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(s.x, s.y, 30 + Math.sin(Date.now()/100) * 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        // Stars
        simStars.forEach(star => {
            if (star.isMerged || star.isEjected) return;
            
            // Physical distance check for permanent ejection
            const dist = Math.sqrt(star.pos.x**2 + star.pos.y**2 + star.pos.z**2);
            if (star.isUnbound && dist > 1500 * AU_TO_M) { star.isEjected = true; return; }

            const s = toScreen(star.pos.x, star.pos.y);

            // Vector Line
            const speedKmS = Math.sqrt(star.vel.x**2 + star.vel.y**2) / 1000;
            const vectorLen = Math.max(30, Math.min(200, speedKmS * 1.0)); // Scale visual length reasonably
            const angle = Math.atan2(star.vel.y, star.vel.x);
            const vEndX = s.x + Math.cos(angle) * vectorLen;
            const vEndY = s.y + Math.sin(angle) * vectorLen;

            if (isRunning) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 2]);
                ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(vEndX, vEndY); ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = '#00ff00';
                ctx.font = '9px monospace';
                ctx.fillText(`${speedKmS.toFixed(1)} km/s`, vEndX + 5, vEndY + 3);
            }

            // Reduced radius for better aesthetics
            const radius = Math.max(4, Math.min(20, (star.radiusKm / 100000) * 5));
            ctx.shadowBlur = star.isUnbound ? 10 : 20; 
            ctx.shadowColor = star.isUnbound ? '#ff3333' : getStarColor(star.temperatureK);
            ctx.fillStyle = getStarColor(star.temperatureK);
            if (star.isUnbound) ctx.globalAlpha = 0.3;
            ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'white'; ctx.font = 'bold 11px sans-serif';
            ctx.fillText(`${star.spectralClass}`, s.x + radius + 6, s.y + 4);
        });

        // Dynamic Scale Bar
        drawScaleBar();
    }

    function drawScaleBar() {
        if (!ctx) return;
        const targetWidthPx = 100;
        const mPerPx = 1 / pixelsPerMeter;
        const targetMeters = targetWidthPx * mPerPx;
        const targetAU = targetMeters / AU_TO_M;

        // Find a nice round AU number (1, 5, 10, 50, 100...)
        const magnitude = Math.pow(10, Math.floor(Math.log10(targetAU)));
        const firstDigit = targetAU / magnitude;
        let niceAU = magnitude;
        if (firstDigit >= 5) niceAU = 5 * magnitude;
        else if (firstDigit >= 2) niceAU = 2 * magnitude;

        const barWidthPx = (niceAU * AU_TO_M) * pixelsPerMeter;
        const bx = 30;
        const by = logicalHeight - 100; // Above the controls

        ctx.strokeStyle = '#a0aec0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx + barWidthPx, by);
        ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5);
        ctx.moveTo(bx + barWidthPx, by - 5); ctx.lineTo(bx + barWidthPx, by + 5);
        ctx.stroke();

        ctx.fillStyle = '#a0aec0';
        ctx.font = '10px monospace';
        ctx.fillText(`${niceAU.toLocaleString()} AU`, bx, by - 10);
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

    function handleResize() {
        if (!container || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        logicalWidth = rect.width;
        logicalHeight = rect.height;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        draw();
    }

    onMount(() => { 
        ctx = canvas.getContext('2d')!; 
        window.addEventListener('resize', handleResize);
        setTimeout(() => { 
            handleResize();
            startSimulation(); 
        }, 100); 
    });
    onDestroy(() => { 
        if (animationId) cancelAnimationFrame(animationId); 
        window.removeEventListener('resize', handleResize);
    });
</script>

<div class="dance-container">
    <div class="dance-header">
        <h3>Step 3: The Stellar Dance</h3>
        <p class="status-msg" class:stable={!isRunning}>
            {#if !isRunning} System Stabilized
            {:else if eventPauseFrames > 0 || slowdownFactor < 0.9} 
                <span style="color: #ff3333; animation: pulse 1s infinite;">⚠ EVENT SLOWDOWN ⚠</span>
            {:else} Simulating Gravitational Settling...
            {/if}
        </p>
        <div class="timer">
            {Math.round(systemTimeYears).toLocaleString()} years elapsed
            <span style="color: #48bb78; margin-left: 10px;">({Math.round(yearsPerSec).toLocaleString()} yr/s)</span>
        </div>
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
            <button class="finish-btn" on:click={() => dispatch('settled', simStars.filter(s => !s.isEjected && !s.isMerged && !s.isUnbound))}>Finalize Orbits</button>
        </div>
    </div>

    <div class="status-panel">
        <div class="stat"><span class="label">Bound:</span><span class="value">{simStars.filter(s => !s.isEjected && !s.isMerged && !s.isUnbound).length}</span></div>
        <div class="stat"><span class="label">Merged:</span><span class="value">{simStars.filter(s => s.isMerged).length}</span></div>
        <div class="stat"><span class="label">Ejected:</span><span class="value">{simStars.filter(s => s.isEjected || s.isUnbound).length}</span></div>
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

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
</style>

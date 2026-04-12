<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { simulateAccretion, type AccreteSnapshot, mapAccreteToBody, recalculatePlanetAgedState } from '$lib/physics/accrete-adapter';
    import { type StarSeed, deriveStarFromHR } from '$lib/physics/stellar-evolution';
    import type { System, Node, ID, CelestialBody } from '$lib/types';
    import { getPlanetColor } from '$lib/rendering/colors';

    const dispatch = createEventDispatcher();
    
    export let stars: StarSeed[] = [];
    export let diskConfig: any = {};
    export let diskPresets: any[] = [];
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let container: HTMLDivElement;

    // Timeline State
    let snapshots: AccreteSnapshot[] = [];
    let sliderValue = 0; // 0 to 1.0
    let currentYear = 0; 
    let maxYear = 15000000000; // Default until recalculated
    
    let currentSnapshot: AccreteSnapshot | null = null;
    let isLoading = true;

    // View State
    let pixelsPerMeter = 1e-10;
    const AU_TO_M = 149597870700;

    /**
     * Non-linear mapping for the slider: "Slow-Fast-Slow"
     * Gives more resolution at the beginning (birth) and end (death) of the timeline.
     * Uses a sigmoid-like cubic function: f(x) = 3x^2 - 2x^3
     */
    function mapSliderToYear(val: number): number {
        const t = val;
        const eased = t < 0.5 
            ? 4 * t * t * t 
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
        
        return eased * maxYear;
    }

    /**
     * Inverse of mapSliderToYear to find slider position for a given year
     * Used for drawing tick marks.
     */
    function mapYearToSlider(y: number): number {
        const target = y / maxYear;
        // Binary search for t since easing function is monotonic
        let low = 0, high = 1;
        for (let i = 0; i < 15; i++) {
            const mid = (low + high) / 2;
            const val = mid < 0.5 ? 4 * mid * mid * mid : 1 - Math.pow(-2 * mid + 2, 3) / 2;
            if (val < target) low = mid;
            else high = mid;
        }
        return (low + high) / 2;
    }

    function getScaleTicks(max: number) {
        const ticks = [];
        // Fixed points for Birth
        ticks.push({ year: 0, label: '0' });
        ticks.push({ year: 100000000, label: '100m' });

        // Dynamic Gyr/Myr ticks
        const step = max > 2000000000 ? 1000000000 : 100000000;
        for (let y = step; y < max; y += step) {
            if (y <= 100000000) continue; 
            ticks.push({ 
                year: y, 
                label: y >= 1000000000 ? `${y/1000000000}G` : `${y/1000000}m` 
            });
        }
        return ticks.map(t => ({ ...t, pos: mapYearToSlider(t.year) * 100 }));
    }

    /**
     * Helper to format years into readable strings (Myr, Gyr)
     */
    function formatYear(y: number): string {
        if (y >= 1000000000) return `${(y / 1000000000).toFixed(1)} Gyr`;
        if (y >= 1000000) return `${(y / 1000000).toFixed(0)} Myr`;
        return `${y.toLocaleString()} yr`;
    }

    function generateTimeline() {
        isLoading = true;
        
        // Calculate maxYear based on primary star lifespan
        const primary = stars.reduce((prev, curr) => (prev.massKg > curr.massKg) ? prev : curr);
        const mSolar = primary.massKg / 1.989e30;
        const lifespanGyr = 10 / Math.pow(mSolar, 2.5);
        
        // Show 20% past death to see remnants
        maxYear = Math.max(200000000, lifespanGyr * 1.2 * 1000000000);

        setTimeout(() => {
            snapshots = simulateAccretion(stars, diskConfig);
            sliderValue = 0;
            currentYear = 0;
            currentSnapshot = snapshots[0];
            updateCamera(true);
            isLoading = false;
            draw();
        }, 100);
    }

    function handleSliderInput() {
        currentYear = mapSliderToYear(sliderValue);
        
        if (currentYear <= 100000000) {
            const progress = currentYear / 100000000;
            const idx = Math.min(snapshots.length - 1, Math.floor(progress * snapshots.length));
            currentSnapshot = snapshots[idx];
        } else {
            const ageYears = currentYear;
            const ageGyr = currentYear / 1000000000;
            const baseState = snapshots[snapshots.length - 1];
            
            const agedStars = baseState.stars.map(s => {
                const mSolar = s.massKg / 1.989e30;
                const lifespanGyr = 10 / Math.pow(mSolar, 2.5);
                
                let agedLum = s.luminositySolar;
                let agedTemp = s.temperatureK;
                let isDead = false;

                if (ageGyr > lifespanGyr) {
                    const deathProgress = Math.min(1.0, (ageGyr - lifespanGyr) / (lifespanGyr * 0.2));
                    if (deathProgress < 0.9) {
                        agedLum = s.luminositySolar * (1 + deathProgress * 500); 
                        agedTemp = s.temperatureK * (0.8 - deathProgress * 0.4);
                    } else {
                        isDead = true;
                        if (mSolar > 8) {
                            agedLum = 1e-6; agedTemp = 100000; 
                        } else {
                            agedLum = 1e-3; agedTemp = 25000; 
                        }
                    }
                } else {
                    const msProgress = ageGyr / lifespanGyr;
                    agedLum = s.luminositySolar * (1 + msProgress * 0.8);
                    agedTemp = s.temperatureK * (1 + msProgress * 0.05);
                }

                const props = deriveStarFromHR(Math.max(2000, agedTemp), agedLum);
                return { ...s, ...props, isDead };
            });

            const primaryStar = agedStars.reduce((prev, curr) => (prev.massKg > curr.massKg) ? prev : curr);
            const agedPlanets = baseState.planets.map(p => {
                const aged = recalculatePlanetAgedState(p, primaryStar.massKg, primaryStar.luminositySolar, ageYears, diskConfig);
                const starRadiusAU = (agedStars[0].radiusKm || 696340) / 149597870;
                if ((p.axis || p.a) < starRadiusAU * 1.2) {
                    return { ...aged, isEngulfed: true };
                }
                return aged;
            });

            currentSnapshot = {
                year: currentYear,
                stars: agedStars,
                planets: agedPlanets
            };
        }
        updateCamera();
        draw();
    }

    function updateCamera(instant = false) {
        if (!currentSnapshot) return;
        const active = currentSnapshot.planets.filter(p => !p.isEngulfed);
        
        let maxX = 10 * AU_TO_M;
        if (active.length > 0) {
            active.forEach(p => {
                maxX = Math.max(maxX, (p.axis || p.a) * AU_TO_M);
            });
        }

        // We want the star on the left, so we view from 0 to maxX
        const targetPPM = (canvas.width * 0.8) / maxX;
        if (instant) pixelsPerMeter = targetPPM;
        else pixelsPerMeter += (targetPPM - pixelsPerMeter) * 0.1;
    }

    function draw() {
        if (!ctx || !canvas || !currentSnapshot) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const offsetX = 100; // Left margin for the star
        const cy = canvas.height / 2;
        const ppm = pixelsPerMeter;

        // Draw Orbits
        currentSnapshot.planets.forEach(p => {
            if (p.isEngulfed) return;
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(offsetX, cy, (p.axis || p.a) * AU_TO_M * ppm, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Draw Planets
        currentSnapshot.planets.forEach((p, i) => {
            if (p.isEngulfed) return;
            const x = offsetX + (p.axis || p.a) * AU_TO_M * ppm;
            
            // Map Accrete planet to mock CelestialBody for color function
            const mockBody: any = {
                classes: p.isGasGiant ? ['planet/gas-giant'] : ['planet/terrestrial'],
                tags: []
            };
            if (p.surfaceTemp > 273 && p.surfaceTemp < 373) mockBody.tags.push({ key: 'habitability/earth-like' });
            
            ctx.fillStyle = getPlanetColor(mockBody as CelestialBody);
            ctx.beginPath();
            ctx.arc(x, cy, p.isGasGiant ? 6 : 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Reference Number
            ctx.fillStyle = 'white';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((i + 1).toString(), x, cy - 12);
        });

        // Draw Stars
        currentSnapshot.stars.forEach((star, i) => {
            ctx.fillStyle = getStarColor(star.temperatureK);
            ctx.shadowBlur = star.isDead ? 10 : 40; 
            ctx.shadowColor = ctx.fillStyle;
            const radius = 25 * (star.radiusKm / 696340);
            ctx.beginPath(); ctx.arc(offsetX, cy, Math.max(star.isDead ? 5 : 10, radius), 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            
            // Reference Number (for multiple stars if they merged or just the first)
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(i === 0 ? "S" : `S${i}`, offsetX, cy - radius - 15);
        });
        ctx.textAlign = 'start';
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
        currentSnapshot.stars.forEach((s, i) => {
            nodes.push({
                id: `star-${i}`,
                body: { id: `star-${i}`, name: `Star ${s.spectralClass}`, massKg: s.massKg, radiusKm: s.radiusKm, temperatureK: s.temperatureK, classes: ['star'], tags: [] },
                orbit: { parentId: systemId, elements: { a_AU: 0, e: 0, i_deg: 0, lan_deg: 0, arg_p_deg: 0, ma_t0_deg: 0 } },
                children: []
            });
        });
        currentSnapshot.planets.forEach((p, i) => {
            if (p.isEngulfed) return;
            nodes.push(mapAccreteToBody(p, `planet-${i}`, nodes[0].id));
        });
        const finalSystem: System = {
            id: systemId, name: "Evolutionary System", seed: "evolutionary", epochT0: Date.now(), age_Gyr: currentYear / 1000000000, nodes,
            rulePackId: "starter-sf", rulePackVersion: "1.0.0", tags: [{ key: "Evolutionary" }], toytownFactor: 0, visualScalingMultiplier: 0.5, isManuallyEdited: false
        };
        dispatch('complete', finalSystem);
    }

    function applyPreset(preset: any) {
        diskConfig = { ...preset };
        delete (diskConfig as any).name;
        delete (diskConfig as any).desc;
        generateTimeline(); // Auto re-evolve on preset change
    }

    function handleResize() {
        if (!container || !canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        // Important: Update coordinate space logic if necessary
        // In our draw() we use canvas.width/height which now include dpr
        // Let's adjust draw to use logical CSS pixels for cx/cy
        draw();
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        window.addEventListener('resize', handleResize);
        handleResize();
        generateTimeline();
    });
</script>

<div class="evolution-container">
    <div class="header">
        <div class="title-row">
            <h3>Step 4: System Evolution</h3>
            <div class="age-display">
                <span class="value">{(currentYear / 1000000).toFixed(1)}</span>
                <span class="unit">Million Years</span>
            </div>
        </div>
        {#if currentYear > 1000000000}
            <p class="era-label stable">Stable Main Sequence</p>
        {:else if currentYear > 100000000}
            <p class="era-label settlement">Post-Accretion Settlement</p>
        {:else}
            <p class="era-label birth">Birth Phase (Accretion Snapshots)</p>
        {/if}
    </div>

    <div class="canvas-viewport" bind:this={container}>
        {#if isLoading}
            <div class="loader">Running Accrete.js Simulation...</div>
        {/if}
        <canvas bind:this={canvas}></canvas>
        
        <div class="timeline-controls">
            <div class="slider-row">
                <span class="label">Birth</span>
                <div class="slider-container">
                    <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.001" 
                        bind:value={sliderValue} 
                        on:input={handleSliderInput} 
                    />
                    <div class="ticks">
                        {#each getScaleTicks(maxYear) as tick}
                            <div class="tick" style="left: {tick.pos}%">
                                <span class="tick-label">{tick.label}</span>
                            </div>
                        {/each}
                    </div>
                </div>
                <span class="label">Death</span>
            </div>
        </div>
    </div>

    <div class="details-list">
        {#if currentSnapshot}
            <div class="section">
                <h4>Stellar Info</h4>
                <div class="body-card star">
                    <span class="ref">S</span>
                    <div class="card-content">
                        <span class="name">{currentSnapshot.stars[0].category} ({currentSnapshot.stars[0].spectralClass})</span>
                        <span class="stats">
                            {currentSnapshot.stars[0].luminositySolar.toFixed(2)} L☉ | 
                            {currentSnapshot.stars[0].temperatureK.toFixed(0)} K |
                            {(currentSnapshot.stars[0].radiusKm / 696340).toFixed(2)} R☉
                        </span>
                    </div>
                </div>
            </div>

            <div class="section">
                <h4>Planetary Catalog</h4>
                <div class="planet-list">
                    {#each currentSnapshot.planets as p, i}
                        {#if !p.isEngulfed}
                            <div class="planet-entry-container">
                                <div class="body-card planet-entry">
                                    <span class="ref">{i + 1}</span>
                                    <div class="card-content full-stats">
                                        <div class="top-summary">
                                            <div class="name-row">
                                                <span class="name">{p.planetType || (p.isGasGiant ? 'Gas Giant' : 'Terrestrial')}</span>
                                                {#if p.breathabilityCode === 1}<span class="hab-badge">Breathable</span>{/if}
                                                {#if p.hydrosphere > 0.5}<span class="water-badge">Ocean</span>{/if}
                                                {#if p.greenhouseEffect}<span class="warn-badge">Greenhouse</span>{/if}
                                            </div>
                                            <div class="main-stats-row">
                                                <span class="stat">Dist: <b>{(p.axis || p.a).toFixed(2)}</b> AU</span>
                                                <span class="stat">Temp: <b>{(p.surfaceTemp - 273.15).toFixed(0)}</b>°C</span>
                                                <span class="stat">Mass: <b>{(p.earthMass || 0).toFixed(2)}</b> M⊕</span>
                                                <span class="stat">Grav: <b>{(p.surfaceGravity || 0).toFixed(2)}</b> G</span>
                                            </div>
                                        </div>
                                        
                                        <div class="sub-details-row">
                                            <div class="detail-group">
                                                <span class="label">Physical:</span>
                                                <span>Rad: <b>{(p.radius || 0).toLocaleString()}</b>km</span>
                                                <span>Day: <b>{(p.dayLength || 0).toFixed(1)}</b>h</span>
                                                <span>Tilt: <b>{(p.axialTilt || 0).toFixed(1)}</b>°</span>
                                            </div>
                                            <div class="detail-group">
                                                <span class="label">Surface:</span>
                                                <span>Water: <b>{(p.hydrosphere * 100).toFixed(0)}</b>%</span>
                                                <span>Ice: <b>{(p.iceCover * 100).toFixed(0)}</b>%</span>
                                                <span>Atmo: <b>{(p.surfacePressure || 0).toFixed(0)}</b>mb</span>
                                            </div>
                                            <div class="detail-group gases">
                                                <span class="label">Gases:</span>
                                                {#each (p.atmosphere || []).slice(0, 4) as gas}
                                                    <span class="gas-pill" title={gas.name}>{gas.symbol}</span>
                                                {/each}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>

            <div class="section disk-config-section">
                <h4>Protoplanetary Disk Properties</h4>
                <p class="hint">Adjust the formation environment and re-evolve to see different outcomes.</p>
                
                <div class="disk-layout">
                    <div class="presets-pane">
                        <div class="preset-grid">
                            {#each diskPresets as preset}
                                <button class="preset-btn" on:click={() => applyPreset(preset)} title={preset.desc}>
                                    {preset.name}
                                </button>
                            {/each}
                        </div>
                        <button class="secondary-btn re-evolve-btn" on:click={generateTimeline}>Re-evolve System</button>
                    </div>

                    <div class="sliders-pane">
                        <div class="slider-group">
                            <label>Dust Density (A): <span>{diskConfig.A.toFixed(4)}</span></label>
                            <input type="range" min="0.0005" max="0.005" step="0.0001" bind:value={diskConfig.A} />
                        </div>
                        <div class="slider-group">
                            <label>Dust-to-Gas (K): <span>{diskConfig.K}</span></label>
                            <input type="range" min="10" max="200" step="1" bind:value={diskConfig.K} />
                        </div>
                        <div class="slider-group">
                            <label>Eccentricity (W): <span>{diskConfig.W.toFixed(2)}</span></label>
                            <input type="range" min="0.05" max="0.8" step="0.01" bind:value={diskConfig.W} />
                        </div>
                        <div class="slider-group">
                            <label>Critical Mass (B): <span>{diskConfig.B.toExponential(1)}</span></label>
                            <input type="range" min="0.000005" max="0.00005" step="0.000001" bind:value={diskConfig.B} />
                        </div>
                    </div>
                </div>
            </div>
        {/if}
        <div class="actions">
            <button class="primary-btn finalize-btn" on:click={finalize}>Finalize & Create System</button>
        </div>
    </div>
</div>

<style>
    .evolution-container { display: flex; flex-direction: column; width: 100%; height: 100%; gap: 1rem; color: #e2e8f0; }
    
    .header { display: flex; flex-direction: column; gap: 0.25rem; }
    .title-row { display: flex; justify-content: space-between; align-items: baseline; }
    .age-display { font-family: monospace; font-size: 1.2rem; background: #1a202c; padding: 0.25rem 0.75rem; border-radius: 4px; border: 1px solid #4a5568; }
    .age-display .unit { font-size: 0.8rem; color: #a0aec0; margin-left: 0.5rem; }
    
    .era-label { font-weight: bold; font-size: 0.9rem; }
    .era-label.birth { color: #f6ad55; }
    .era-label.settlement { color: #63b3ed; }
    .era-label.stable { color: #48bb78; }

    .canvas-viewport { position: relative; width: 100%; height: 40vh; background: #08090d; border: 1px solid #2d3748; border-radius: 8px; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; }
    
    .loader { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; background: rgba(0,0,0,0.8); color: #63b3ed; font-weight: bold; z-index: 10; }
    
    .timeline-controls { position: absolute; bottom: 15px; left: 15px; right: 15px; background: rgba(26, 32, 44, 0.9); padding: 1rem 1rem 2rem 1rem; border-radius: 6px; border: 1px solid #4a5568; backdrop-filter: blur(4px); }
    .slider-row { display: flex; align-items: center; gap: 1rem; }
    .slider-row .label { color: #718096; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; width: 40px; }

    .slider-container { flex-grow: 1; position: relative; display: flex; flex-direction: column; }
    input[type="range"] { width: 100%; height: 6px; border-radius: 3px; background: #2d3748; appearance: none; cursor: pointer; z-index: 2; }

    .ticks { position: absolute; top: 12px; left: 0; right: 0; height: 20px; pointer-events: none; }
    .tick { position: absolute; top: 0; width: 1px; height: 6px; background: #4a5568; display: flex; justify-content: center; }
    .tick-label { position: absolute; top: 8px; font-size: 0.65rem; color: #718096; white-space: nowrap; transform: translateX(-50%); }

    input[type="range"]::-webkit-slider-thumb {
 appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #63b3ed; cursor: pointer; border: 2px solid white; box-shadow: 0 0 10px rgba(99, 179, 237, 0.5); }

    .details-list { display: flex; flex-direction: column; gap: 1.5rem; padding: 0.5rem; overflow-y: auto; flex-grow: 1; }
    .section h4 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: #718096; margin-bottom: 0.75rem; border-bottom: 1px solid #2d3748; padding-bottom: 0.25rem; }
    
    .planet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
    
    .planet-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .planet-entry-container { border: 1px solid #2d3748; border-radius: 6px; background: #1a202c; }
    .planet-entry { padding: 0.75rem; }
    
    .full-stats { flex-grow: 1; display: flex; flex-direction: column; gap: 0.75rem; }
    .top-summary { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem; }
    
    .name-row { display: flex; align-items: center; gap: 0.75rem; }
    .name-row .name { font-weight: bold; color: #63b3ed; font-size: 1rem; }
    
    .hab-badge, .water-badge, .warn-badge { font-size: 0.6rem; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
    .hab-badge { background: #2f855a; color: white; }
    .water-badge { background: #2b6cb0; color: white; }
    .warn-badge { background: #c53030; color: white; }
    
    .main-stats-row { display: flex; gap: 1.2rem; font-size: 0.85rem; color: #a0aec0; }
    .main-stats-row .stat b { color: #63b3ed; }
    
    .sub-details-row { display: flex; gap: 2rem; }
    .detail-group { display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: #718096; }
    .detail-group .label { font-weight: bold; color: #4a5568; text-transform: uppercase; font-size: 0.65rem; }
    .detail-group span b { color: #cbd5e0; }
    
    .gas-pill { font-size: 0.6rem; background: #2d3748; padding: 1px 5px; border-radius: 3px; color: #a0aec0; border: 1px solid #4a5568; }

    .body-card { display: flex; align-items: flex-start; gap: 1rem; background: #1a202c; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #2d3748; }
    .body-card .ref { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #2d3748; border-radius: 4px; font-weight: bold; font-size: 0.8rem; color: #63b3ed; }
    .card-content { display: flex; flex-direction: column; }
    .card-content .name { font-weight: bold; font-size: 0.9rem; }
    .card-content .stats { font-family: monospace; font-size: 0.75rem; color: #a0aec0; }

    /* Disk Config Styles */
    .disk-config-section { background: rgba(26, 32, 44, 0.5); padding: 1rem; border-radius: 8px; border: 1px solid #2d3748; margin-top: 1rem; }
    .disk-layout { display: flex; gap: 2rem; margin-top: 1rem; }
    .presets-pane { flex: 1; display: flex; flex-direction: column; gap: 1rem; }
    .preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .preset-btn { background: #1a202c; border: 1px solid #4a5568; color: #a0aec0; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
    .preset-btn:hover { background: #2d3748; color: white; border-color: #63b3ed; }
    
    .sliders-pane { flex: 2; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .slider-group { display: flex; flex-direction: column; gap: 0.5rem; }
    .slider-group label { font-size: 0.75rem; font-weight: bold; color: #a0aec0; text-transform: uppercase; display: flex; justify-content: space-between; }
    .slider-group label span { color: #63b3ed; font-family: monospace; }
    .slider-group input[type="range"] { width: 100%; height: 4px; }
    
    .re-evolve-btn { width: 100%; margin-top: auto; border: 1px solid #4a5568; }
    .finalize-btn { padding: 12px 48px; font-size: 1.1rem; }

    .actions { display: flex; justify-content: center; gap: 1rem; margin-top: 2rem; padding-bottom: 2rem; }
    .primary-btn { background: #38a169; color: white; border: none; padding: 10px 24px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: all 0.2s; }
    .primary-btn:hover { background: #2f855a; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(47, 133, 90, 0.3); }

    .secondary-btn { background: #4a5568; color: white; border: none; padding: 10px 24px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: all 0.2s; }
    .secondary-btn:hover { background: #2d3748; transform: translateY(-1px); }
</style>

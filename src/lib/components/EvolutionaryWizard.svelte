<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { RulePack, System } from '$lib/types';
    import type { StarSeed } from '$lib/physics/stellar-evolution';
    import HRDiagram from './HRDiagram.svelte';
    import StellarNursery from './StellarNursery.svelte';
    import StellarDance from './StellarDance.svelte';

    export let rulepack: RulePack;
    const dispatch = createEventDispatcher();

    let step = 1;
    let starsToPlace: StarSeed[] = [];
    let placedStars: StarSeed[] = [];
    let settledStars: StarSeed[] = [];
    
    let hoverStar: StarSeed | null = null;

    function handleStarSelected(event: CustomEvent<StarSeed>) {
        starsToPlace = [...starsToPlace, event.detail];
    }

    function handleNurseryChange(event: CustomEvent<{ placedStars: StarSeed[], starsToPlace: StarSeed[] }>) {
        placedStars = event.detail.placedStars;
        starsToPlace = event.detail.starsToPlace;
    }

    function handleStellarSettled(event: CustomEvent<StarSeed[]>) {
        settledStars = event.detail;
        step += 1;
    }

    function removeStar(index: number) {
        const combined = [...starsToPlace, ...placedStars];
        const starId = combined[index].id;
        starsToPlace = starsToPlace.filter(s => s.id !== starId);
        placedStars = placedStars.filter(s => s.id !== starId);
    }

    function clearAllStars() {
        starsToPlace = [];
        placedStars = [];
    }

    function nextStep() {
        if (step === 1 && starsToPlace.length === 0 && placedStars.length === 0) {
            alert("Please pick at least one star properties to continue.");
            return;
        }
        if (step === 2 && placedStars.length === 0) {
            alert("Please place at least one star in space.");
            return;
        }
        step += 1;
    }

    function prevStep() {
        if (step > 1) {
            step -= 1;
        } else {
            dispatch('cancel');
        }
    }

    function finalize() {
        const finalSystem: any = {
            id: `evolutionary-${Date.now()}`,
            name: "New Evolutionary System",
            seed: "evolutionary-seed",
            epochT0: Date.now(),
            age_Gyr: 5.0,
            nodes: [],
            rulePackId: rulepack.id,
            rulePackVersion: rulepack.version,
            tags: [{ key: "Evolutionary" }],
            toytownFactor: 0,
            visualScalingMultiplier: 0.5,
            isManuallyEdited: false
        };
        dispatch('complete', finalSystem);
    }
</script>

<div class="wizard-container">
    <div class="wizard-header">
        <div class="header-main">
            <h2>Evolutionary System Wizard (Alpha)</h2>
            <div class="header-actions">
                <button class="back-btn" on:click={prevStep}>{step === 1 ? 'Abandon' : 'Back'}</button>
                <button class="cancel-btn" on:click={() => dispatch('cancel')}>Close</button>
            </div>
        </div>
        <div class="steps">
            <span class="step" class:active={step === 1}>1. Stellar Birth</span>
            <span class="step" class:active={step === 2}>2. Stellar Nursery</span>
            <span class="step" class:active={step === 3}>3. Stellar Dance</span>
            <span class="step" class:active={step === 4}>4. Evolution</span>
        </div>
    </div>

    <div class="wizard-content">
        {#if step === 1}
            <div class="phase split-layout">
                <div class="left-pane">
                    <HRDiagram 
                        selectedStars={[...starsToPlace, ...placedStars]} 
                        on:select={handleStarSelected} 
                        on:hover={(e) => hoverStar = e.detail}
                    />
                </div>
                <div class="right-pane details-panel">
                    <h3>Stellar Birth</h3>
                    
                    <div class="star-stats">
                        <div class="stat-row">
                            <span class="label">Category:</span>
                            <span class="value" style="color: {hoverStar?.category.includes('Invalid') ? '#e53e3e' : (hoverStar ? '#63b3ed' : '#a0aec0')}">
                                {hoverStar?.category ?? '—'}
                            </span>
                        </div>
                        <div class="stat-row">
                            <span class="label">Spectral Class:</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                {#if hoverStar}
                                    <div class="mini-star-inline class-{hoverStar.spectralClass}"></div>
                                    <span class="value">{hoverStar.spectralClass}{hoverStar.luminosityClass}</span>
                                {:else}
                                    <span class="value">—</span>
                                {/if}
                            </div>
                        </div>
                        <div class="stat-row">
                            <span class="label">Temperature:</span>
                            <span class="value">{hoverStar ? Math.round(hoverStar.temperatureK).toLocaleString() + ' K' : '—'}</span>
                        </div>
                        <div class="stat-row">
                            <span class="label">Luminosity:</span>
                            <span class="value">{hoverStar ? hoverStar.luminositySolar.toExponential(2) + ' L⊙' : '—'}</span>
                        </div>
                        <div class="stat-row">
                            <span class="label">Mass:</span>
                            <span class="value">{hoverStar ? (hoverStar.massKg / 1.989e30).toFixed(2) + ' M⊙' : '—'}</span>
                        </div>
                        <div class="stat-row">
                            <span class="label">Radius:</span>
                            <span class="value">{hoverStar ? (hoverStar.radiusKm / 696340).toFixed(2) + ' R⊙' : '—'}</span>
                        </div>
                    </div>

                    <div class="error-zone">
                        {#if hoverStar?.category.includes('Invalid')}
                            <p class="error-text">Impossible star configuration. Please select a point within the colored regions.</p>
                        {:else}
                            <p class="hint">Hover the diagram to see star details.</p>
                        {/if}
                    </div>

                    <div class="queue-section">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4>Stars to Place ({starsToPlace.length + placedStars.length}/50)</h4>
                            {#if starsToPlace.length > 0 || placedStars.length > 0}
                                <button class="clear-all-btn" on:click={clearAllStars}>Clear All</button>
                            {/if}
                        </div>
                        <div class="stars-table">
                            {#each [...starsToPlace, ...placedStars] as star, i}
                                <div class="star-row-item">
                                    <div class="star-id-badge class-{star.spectralClass}">{i + 1}</div>
                                    <div class="star-info">
                                        <span class="type">{star.category} ({star.spectralClass}{star.luminosityClass})</span>
                                        <span class="params">
                                            {(star.massKg / 1.989e30).toFixed(2)}M⊙ | {star.luminositySolar.toExponential(1)}L⊙
                                        </span>
                                    </div>
                                    <button class="delete-star-btn" on:click={() => removeStar(i)}>×</button>
                                </div>
                            {/each}
                            {#if starsToPlace.length === 0 && placedStars.length === 0}
                                <p class="empty-hint">No stars selected yet.</p>
                            {/if}
                        </div>
                    </div>

                    <div class="actions">
                        <button 
                            class="primary-btn" 
                            on:click={nextStep} 
                            disabled={(starsToPlace.length === 0 && placedStars.length === 0)}
                        >
                            Next: Place in Space
                        </button>
                    </div>
                </div>
            </div>
        {:else if step === 2}
            <div class="phase full-width">
                <StellarNursery {starsToPlace} {placedStars} on:change={handleNurseryChange} />
                <div class="actions">
                    <button class="primary-btn" on:click={nextStep} disabled={placedStars.length === 0}>
                        Next: Stellar Dance
                    </button>
                </div>
            </div>
        {:else if step === 3}
            <div class="phase full-width">
                <StellarDance stars={placedStars} on:settled={handleStellarSettled} />
            </div>
        {:else if step === 4}
            <div class="phase">
                <h3>Phase 4: Evolution Timeline</h3>
                <p>Settled Stars: {settledStars.length}</p>
                <div class="placeholder-slider">
                    [ Unified Timeline Slider Placeholder ]
                </div>
                <button class="primary-btn" on:click={finalize}>Finalize & Create System</button>
            </div>
        {/if}
    </div>
</div>

<style>
    .wizard-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #1a202c;
        color: white;
        z-index: 2000;
        display: flex;
        flex-direction: column;
        padding: 2rem;
    }

    .wizard-header {
        border-bottom: 1px solid #4a5568;
        padding-bottom: 1rem;
        margin-bottom: 2rem;
    }

    .header-main {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .header-actions {
        display: flex;
        gap: 10px;
    }

    .steps {
        display: flex;
        gap: 2rem;
        font-size: 0.9rem;
        color: #a0aec0;
    }

    .step.active {
        color: #63b3ed;
        font-weight: bold;
        text-decoration: underline;
    }

    .wizard-content {
        flex-grow: 1;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .phase.split-layout {
        display: flex;
        gap: 3rem;
        width: 100%;
        max-width: 1200px;
        align-items: flex-start;
    }

    .details-panel {
        background: #2d3748;
        padding: 2rem;
        border-radius: 8px;
        min-width: 300px;
        flex-grow: 1;
    }

    .star-stats {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        margin: 1rem 0;
        min-height: 200px;
    }

    .stat-row {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid #4a5568;
        padding-bottom: 0.4rem;
    }

    .stat-row .label {
        color: #a0aec0;
        font-size: 0.85rem;
    }

    .stat-row .value {
        font-weight: bold;
        font-family: monospace;
        font-size: 0.9rem;
    }

    .mini-star-inline {
        width: 12px;
        height: 12px;
        border-radius: 50%;
    }

    .mini-star {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        font-weight: bold;
        color: black;
    }

    /* Spectral Class Colors */
    .class-O { background: #9bb2ff; box-shadow: 0 0 10px #9bb2ff; }
    .class-B { background: #cad7ff; box-shadow: 0 0 10px #cad7ff; }
    .class-A { background: #f8f7ff; box-shadow: 0 0 10px #f8f7ff; }
    .class-F { background: #fff4ea; box-shadow: 0 0 10px #fff4ea; }
    .class-G { background: #fff2a1; box-shadow: 0 0 10px #fff2a1; }
    .class-K { background: #ffcc6f; box-shadow: 0 0 10px #ffcc6f; }
    .class-M { background: #ff9833; box-shadow: 0 0 10px #ff9833; }

    .error-text {
        color: #e53e3e;
        font-size: 0.8rem;
        font-style: italic;
    }

    .error-zone {
        min-height: 2.5rem;
    }

    .hint {
        color: #718096;
        font-size: 0.8rem;
        font-style: italic;
    }

    .stars-table {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 1rem;
        max-height: 250px;
        overflow-y: auto;
    }

    .star-row-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        background: #1a202c;
        padding: 0.5rem;
        border-radius: 4px;
        border: 1px solid #4a5568;
    }

    .star-id-badge {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: bold;
        color: black;
        flex-shrink: 0;
    }

    .star-info {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        text-align: left;
    }

    .star-info .type {
        font-size: 0.75rem;
        font-weight: bold;
    }

    .star-info .params {
        font-size: 0.7rem;
        color: #a0aec0;
    }

    .delete-star-btn {
        background: transparent;
        border: none;
        color: #e53e3e;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0 5px;
    }

    .delete-star-btn:hover {
        color: #fc8181;
    }

    .clear-all-btn {
        background: #e53e3e;
        color: white;
        border: none;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.7rem;
        cursor: pointer;
    }

    .clear-all-btn:hover {
        background: #c53030;
    }

    .empty-hint {
        font-size: 0.8rem;
        color: #718096;
        font-style: italic;
    }

    .actions {
        margin-top: 1rem;
    }

    .primary-btn {
        background-color: #3182ce;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 4px;
        font-size: 1.1rem;
        cursor: pointer;
        font-weight: bold;
        width: 100%;
    }

    .primary-btn:disabled {
        background-color: #4a5568;
        cursor: not-allowed;
        opacity: 0.7;
    }

    .back-btn {
        background: #4a5568;
        color: white;
        border: none;
        padding: 5px 15px;
        border-radius: 4px;
        cursor: pointer;
    }

    .cancel-btn {
        background: transparent;
        color: #a0aec0;
        border: 1px solid #4a5568;
        padding: 5px 15px;
        border-radius: 4px;
        cursor: pointer;
    }

    .placeholder-slider {
        width: 500px;
        height: 300px;
        background: #2d3748;
        border: 2px dashed #4a5568;
        margin: 2rem auto;
        display: flex;
        justify-content: center;
        align-items: center;
        color: #718096;
    }
</style>

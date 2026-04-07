<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { RulePack, System } from '$lib/types';

    export let rulepack: RulePack;
    const dispatch = createEventDispatcher();

    let step = 1;
    let wizardComplete = false;

    function nextStep() {
        step += 1;
    }

    function finalize() {
        // Placeholder for the final System object
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
        <h2>Evolutionary System Wizard (Alpha)</h2>
        <div class="steps">
            <span class="step" class:active={step === 1}>1. Star Birth</span>
            <span class="step" class:active={step === 2}>2. Stellar Dance</span>
            <span class="step" class:active={step === 3}>3. Accretion</span>
            <span class="step" class:active={step === 4}>4. Evolution</span>
        </div>
    </div>

    <div class="wizard-content">
        {#if step === 1}
            <div class="phase">
                <h3>Phase 1: Star Birth (H-R Diagram)</h3>
                <p>Select your initial stars on the Hertzsprung-Russell diagram.</p>
                <div class="placeholder-diagram">
                    [ Interactive H-R Diagram Placeholder ]
                </div>
                <button on:click={nextStep}>Next: Stellar Dance</button>
            </div>
        {:else if step === 2}
            <div class="phase">
                <h3>Phase 2: Stellar Dance (N-Body Settling)</h3>
                <p>Watch the stars settle into stable orbits.</p>
                <div class="placeholder-dance">
                    [ N-Body Simulation View Placeholder ]
                </div>
                <button on:click={nextStep}>Next: Accretion Phase</button>
            </div>
        {:else if step === 3}
            <div class="phase">
                <h3>Phase 3: Accretion Phase</h3>
                <p>Watch planets form from the protoplanetary disk.</p>
                <div class="placeholder-accretion">
                    [ Accrete.js Visualization Placeholder ]
                </div>
                <button on:click={nextStep}>Next: Lifespan Evolution</button>
            </div>
        {:else if step === 4}
            <div class="phase">
                <h3>Phase 4: Lifespan Evolution</h3>
                <p>Scrub the timeline to see the system age.</p>
                <div class="placeholder-slider">
                    [ Timeline Slider Placeholder ]
                </div>
                <button on:click={finalize}>Finalize & Create System</button>
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
        text-align: center;
    }

    .phase {
        max-width: 600px;
    }

    .placeholder-diagram, .placeholder-dance, .placeholder-accretion, .placeholder-slider {
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

    button {
        background-color: #3182ce;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 1.1rem;
        cursor: pointer;
    }

    button:hover {
        background-color: #2b6cb0;
    }
</style>

<!-- src/lib/components/PlacementMenu.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { CelestialBody, Barycenter, Orbit } from '../types';
    import { getValidClassifications } from '../generation/placement';
    import { starmapStore } from '../starmapStore';

    export let x: number;
    export let y: number;
    export let orbit: Orbit;
    export let host: CelestialBody | Barycenter;

    const dispatch = createEventDispatcher();

    let validClassifications: string[] = [];
    starmapStore.subscribe(store => {
        if (store.rulePack) {
            validClassifications = getValidClassifications(orbit, host, store.rulePack);
        }
    });

    function selectClassification(classification: string) {
        dispatch('select', { classification });
    }
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
    <ul>
        {#each validClassifications as classification}
            <li on:click={() => selectClassification(classification)}>
                {classification}
            </li>
        {/each}
    </ul>
</div>

<style>
    .context-menu {
        position: absolute;
        background-color: #333;
        border: 1px solid #555;
        padding: 5px;
        z-index: 1000;
    }
    ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    li {
        padding: 5px 10px;
        cursor: pointer;
    }
    li:hover {
        background-color: #555;
    }
</style>

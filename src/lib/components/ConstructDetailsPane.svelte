<script lang="ts">
  // Construct (ship) detail block, extracted from SystemView (Phase 01.7): the three
  // mutually-exclusive states for a focused construct - ship log (ShipLogPane), edit
  // (ConstructSidePanel), or derived specs (ConstructDerivedSpecs, with the
  // takeoff/land/plan-transit/open-log actions). hostBody (current host) is passed in;
  // currentTime-dependent counts come in as props. Actions dispatch back so SystemView
  // keeps the orchestration handlers and the isShipLogOpen/isEditing/isPlanning flags.
  //
  // Two close semantics are kept distinct: 'closelog' (ShipLogPane) vs 'closeedit'
  // (ConstructSidePanel) - SystemView wires each to its own handler.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, StarSystem } from '$lib/types';
  import { describeTag } from '$lib/tags/tagPresentation';
  import ShipLogPane from './ShipLogPane.svelte';
  import ConstructSidePanel from './ConstructSidePanel.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';

  export let focusedBody: CelestialBody;
  export let system: StarSystem;
  export let rulePack: any;
  // The construct's *current* host, resolved by SystemView from its journeys (where it
  // has actually travelled to), not its authored parentId. Drives the orbit readout and
  // landing analysis, so a ship parked at a planet shows that planet rather than the star.
  export let hostBody: CelestialBody | null = null;
  export let isShipLogOpen: boolean = false;
  export let isEditing: boolean = false;
  export let isPlanning: boolean = false;
  export let futureJourneyCount: number = 0;
  export let clearFutureCount: number = 0;
  export let activeCount: number = 0;

  const dispatch = createEventDispatcher();
</script>

{#if focusedBody.kind === 'construct'}
    {#if isShipLogOpen}
        <ShipLogPane
            focusedBody={focusedBody}
            clearFutureCount={clearFutureCount}
            activeCount={activeCount}
            on:close={() => dispatch('closelog')}
            on:clearfuture
            on:cancelactive
        />
    {:else if isEditing}
        <ConstructSidePanel
            {system}
            construct={focusedBody}
            hostBody={hostBody}
            {rulePack}
            hideActions={isPlanning}
            on:update
            on:delete
            on:close={() => dispatch('closeedit')}
            on:tabchange
        />
    {:else}
        <ConstructDerivedSpecs
            construct={focusedBody}
            hostBody={hostBody}
            {rulePack}
            futureJourneyCount={futureJourneyCount}
            isEditingConstruct={isEditing}
            hideActions={isPlanning}
            on:planTransit
            on:openJourneyLog
            on:cancelactive
            on:takeoff
            on:land
        />
        <!-- Tags at the bottom of the read-only view, mirroring a body's detail pane. -->
        {#if focusedBody.tags && focusedBody.tags.length > 0}
            <div class="construct-tags">
                <span class="tags-label">Tags</span>
                <div class="tags-container">
                    {#each focusedBody.tags as tag}
                        {@const info = describeTag(tag.key)}
                        <span class="tag" style="border-color: {info.color}; color: {info.color};" title={info.description}>{info.label}{#if tag.value}: {tag.value}{/if}</span>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
{/if}

<style>
    .construct-tags { margin-top: 0.75em; padding-top: 0.6em; border-top: 1px solid var(--border); }
    .tags-label { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
    .tags-container { display: flex; flex-wrap: wrap; gap: 0.5em; margin-top: 0.5em; }
    .tag { background-color: var(--bg-control); padding: 0.2em 0.5em; border: 1px solid; border-radius: 3px; font-size: 0.8em; }
</style>

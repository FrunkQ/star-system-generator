<script lang="ts">
  // Construct (ship) detail block, extracted from SystemView (Phase 01.7): the three
  // mutually-exclusive states for a focused construct - ship log (ShipLogPane), edit
  // (ConstructSidePanel), or derived specs (ConstructDerivedSpecs, with the
  // takeoff/land/plan-transit/open-log actions). parentBody (host) is derived here;
  // currentTime-dependent counts come in as props. Actions dispatch back so SystemView
  // keeps the orchestration handlers and the isShipLogOpen/isEditing/isPlanning flags.
  //
  // Two close semantics are kept distinct: 'closelog' (ShipLogPane) vs 'closeedit'
  // (ConstructSidePanel) - SystemView wires each to its own handler.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, StarSystem } from '$lib/types';
  import ShipLogPane from './ShipLogPane.svelte';
  import ConstructSidePanel from './ConstructSidePanel.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';

  export let focusedBody: CelestialBody;
  export let system: StarSystem;
  export let rulePack: any;
  export let isShipLogOpen: boolean = false;
  export let isEditing: boolean = false;
  export let isPlanning: boolean = false;
  export let futureJourneyCount: number = 0;
  export let clearFutureCount: number = 0;
  export let activeCount: number = 0;

  const dispatch = createEventDispatcher();

  $: parentBody = focusedBody.parentId
    ? system?.nodes.find(n => n.id === (focusedBody.ui_parentId || focusedBody.parentId)) ?? null
    : null;
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
            hostBody={parentBody}
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
            hostBody={parentBody}
            {rulePack}
            futureJourneyCount={futureJourneyCount}
            isEditingConstruct={isEditing}
            hideActions={isPlanning}
            on:planTransit
            on:openJourneyLog
            on:takeoff
            on:land
        />
    {/if}
{/if}

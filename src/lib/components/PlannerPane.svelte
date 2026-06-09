<script lang="ts">
  // Transit-planning view, extracted from SystemView (Phase 01.7): the TransitPlannerPanel
  // plus the read-only ConstructDerivedSpecs shown beneath it while planning. This is a
  // thin markup wrapper - the ~10-var transit-chaining state machine (addNextLeg /
  // undoLastLeg / executePlan / close, and the preview/target/plan/alternatives updates)
  // stays in SystemView as named handlers; this pane just forwards TransitPlannerPanel's
  // events upward and binds departureDelayDays through.
  import type { StarSystem, CelestialBody } from '$lib/types';
  import TransitPlannerPanel from './TransitPlannerPanel.svelte';
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';

  export let system: StarSystem;
  export let rulePack: any;
  export let currentTime: number;            // SystemView's transitChainTime cursor
  export let originId: string;               // plannerOriginId
  export let constructId: string;            // planningConstructId
  export let completedPlans: any[] = [];     // completedTransitPlans
  export let initialState: any = undefined;  // transitChainState (chain start r/v)
  export let departureDelayDays: number = 0; // bound back to SystemView's transitDelayDays
  export let focusedBody: CelestialBody | null = null;
  export let hostBody: CelestialBody | null = null;  // parentBody of the construct
  export let futureJourneyCount: number = 0;
</script>

<TransitPlannerPanel
    {system}
    {rulePack}
    {currentTime}
    {originId}
    {constructId}
    completedPlans={completedPlans}
    {initialState}
    bind:departureDelayDays
    on:planUpdate
    on:alternativesUpdate
    on:executionStateChange
    on:previewUpdate
    on:targetSelected
    on:addNextLeg
    on:undoLastLeg
    on:executePlan
    on:interstellar
    on:close
/>
{#if focusedBody}
    <ConstructDerivedSpecs
        construct={focusedBody}
        {hostBody}
        {rulePack}
        futureJourneyCount={futureJourneyCount}
        hideActions={true}
        on:planTransit
        on:openJourneyLog
        on:takeoff
        on:land
    />
{/if}

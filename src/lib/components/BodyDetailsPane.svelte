<script lang="ts">
  // Non-construct body detail block, extracted from SystemView (Phase 01.7):
  // the edit panel (BodySidePanel) vs read-only technical view (BodyTechnicalDetails)
  // for stars / planets / moons / belts etc. parentBody + rootStar are derived here
  // from the system; update/delete/close/tabchange dispatch back so SystemView keeps
  // the mode state machine and the store mutations.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, StarSystem } from '$lib/types';
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';
  import BodySidePanel from './BodySidePanel.svelte';

  export let focusedBody: CelestialBody;
  export let system: StarSystem;
  export let rulePack: any;
  export let isEditing: boolean = false;

  const dispatch = createEventDispatcher();

  $: parentBody = focusedBody.parentId
    ? system?.nodes.find(n => n.id === (focusedBody.ui_parentId || focusedBody.parentId)) ?? null
    : null;
  $: rootStar = system?.nodes.find(n => n.parentId === null) ?? null;
</script>

{#if focusedBody.kind !== 'construct'}
    {#if isEditing}
        <BodySidePanel
            body={focusedBody}
            {rulePack}
            {system}
            parentBody={parentBody}
            rootStar={rootStar}
            on:update
            on:delete
            on:close
            on:tabchange
        />
    {:else}
        <BodyTechnicalDetails body={focusedBody} {rulePack} parentBody={parentBody} rootStar={rootStar} />
    {/if}
{/if}

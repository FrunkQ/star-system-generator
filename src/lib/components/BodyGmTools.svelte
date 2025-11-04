<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter } from "$lib/types";

  export let body: CelestialBody | Barycenter | null;

  const dispatch = createEventDispatcher();

  function handleDelete() {
      if (!body) return;
      if (confirm(`Are you sure you want to delete ${body.name} and everything orbiting it?`)) {
          dispatch('deleteNode', body.id);
      }
  }
</script>

<div class="gm-tools">
    <h3>GM Tools</h3>
    <div class="tools-container">
        {#if body && body.parentId !== null}
            <button class="delete-button" on:click={handleDelete}>Delete {body.name}</button>
        {/if}
        
        <button on:click={() => dispatch('addNode', { hostId: body.id, planetType: 'planet/terrestrial' })}>Add Terrestrial</button>
        {#if body && (body.kind !== 'body' || (body.massKg || 0) > 10 * 5.972e24)}
            <button on:click={() => dispatch('addNode', { hostId: body.id, planetType: 'planet/gas-giant' })}>Add Gas Giant</button>
        {/if}

        {#if body && body.kind === 'body' && (body.roleHint === 'star' || body.roleHint === 'planet')}
            <button on:click={() => dispatch('addHabitablePlanet', { hostId: body.id, habitabilityType: 'earth-like' })}>Add Earth-like</button>
            <button on:click={() => dispatch('addHabitablePlanet', { hostId: body.id, habitabilityType: 'human-habitable' })}>Add Human-Habitable</button>
            <button on:click={() => dispatch('addHabitablePlanet', { hostId: body.id, habitabilityType: 'alien-habitable' })}>Add Alien-Habitable</button>
        {/if}
    </div>
</div>

<style>
  .gm-tools {
      margin-top: 1.5em;
      padding-top: 1em;
      border-top: 1px solid #444;
  }
  .gm-tools h3 {
      margin: 0 0 0.5em 0;
      color: #ff3e00;
  }
  .tools-container {
      display: flex;
      gap: 1em;
      margin-bottom: 1em;
  }
  .delete-button {
      background-color: #800;
      color: white;
      border: 1px solid #c00;
  }
</style>
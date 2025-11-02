<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Route } from '../types';

  export let showModal: boolean;
  export let route: Route;

  const dispatch = createEventDispatcher();

  let editedDistance: number = route.distance;
  let editedUnit: string = route.unit;

  function saveChanges() {
    dispatch('save', { ...route, distance: editedDistance, unit: editedUnit });
    showModal = false;
  }

  function cancel() {
    showModal = false;
  }

  function deleteRoute() {
    dispatch('delete', route.id);
    showModal = false;
  }
</script>

{#if showModal}
  <div class="modal-background">
    <div class="modal">
      <h2>Edit Route</h2>
      <label>
        Distance:
        <input type="number" bind:value={editedDistance} />
      </label>
      <label>
        Unit:
        <input type="text" bind:value={editedUnit} />
      </label>
      <div class="buttons">
        <button on:click={saveChanges}>Save</button>
        <button on:click={deleteRoute} class="delete-button">Delete</button>
        <button on:click={cancel}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .modal {
    background-color: #333;
    padding: 20px;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
  }

  .delete-button {
    background-color: #ff4d4d;
    color: white;
  }
</style>
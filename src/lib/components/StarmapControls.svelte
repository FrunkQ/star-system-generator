<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();
</script>

<div class="starmap-controls">
  <button on:click={() => dispatch('newSystem')}>New System</button>
  <button on:click={() => dispatch('save')}>Save</button>
  <button on:click={() => dispatch('load')}>Load</button>
</div>

<style>
  .starmap-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 10px;
  }
</style>

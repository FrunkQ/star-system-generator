<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let x: number;
  export let y: number;
  export let isStar: boolean;

  const dispatch = createEventDispatcher();
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
  <ul>
    {#if isStar}
      <li on:click={() => dispatch('zoom')}>Zoom to System</li>
      <li on:click={() => dispatch('link')}>Start Link</li>
      <li on:click={() => dispatch('delete')}>Delete System</li>
    {:else}
      <li on:click={() => dispatch('addsystem')}>Add System Here</li>
    {/if}
  </ul>
</div>

<style>
  .context-menu {
    position: absolute;
    background-color: #333;
    border: 1px solid #555;
    border-radius: 5px;
    z-index: 100;
    color: #eee;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 0.5em 1em;
    cursor: pointer;
  }
  li:hover {
    background-color: #555;
  }
</style>
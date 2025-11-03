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
      <li><button on:click={() => dispatch('zoom')}>Zoom In</button></li>
      <li><button on:click={() => dispatch('link')}>Link System</button></li>
      <li><button on:click={() => dispatch('delete')}>Delete System</button></li>
    {:else}
      <li><button on:click={() => dispatch('addsystem')}>Add System</button></li>
    {/if}
  </ul>
</div>

<style>
  .context-menu {
    position: absolute;
    background-color: #444;
    border: 1px solid #555;
    border-radius: 5px;
    padding: 5px;
    z-index: 1000;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li button {
    width: 100%;
    padding: 5px 10px;
    background: none;
    border: none;
    color: white;
    text-align: left;
    cursor: pointer;
  }

  li button:hover {
    background-color: #555;
  }
</style>
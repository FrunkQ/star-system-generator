<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // Local reactive variables for editing
  let name = construct.name;
  let constructClass = construct.class;
  let iconType = construct.icon_type || 'square';
  let iconColor = construct.icon_color || '#ffffff';

  // Function to dispatch updates
  function updateConstruct() {
    const updatedConstruct: CelestialBody = {
      ...construct,
      name,
      class: constructClass,
      icon_type: iconType,
      icon_color: iconColor,
    };
    dispatch('update', updatedConstruct);
  }

  // React to changes in local variables and dispatch update
  $: { name, constructClass, iconType, iconColor; updateConstruct(); }
</script>

<div class="tab-panel">
  <h3>General Properties</h3>

  <div class="form-group">
    <label for="construct-name">Name:</label>
    <input type="text" id="construct-name" bind:value={name} />
  </div>

  <div class="form-group">
    <label for="construct-class">Class:</label>
    <input type="text" id="construct-class" bind:value={constructClass} />
  </div>

  <div class="form-group">
    <label for="icon-type">Icon Type:</label>
    <select id="icon-type" bind:value={iconType}>
      <option value="square">Square</option>
      <option value="triangle">Triangle</option>
      <option value="circle">Circle</option>
    </select>
  </div>

  <div class="form-group">
    <label for="icon-color">Icon Color:</label>
    <input type="color" id="icon-color" bind:value={iconColor} />
  </div>
</div>

<style>
  .tab-panel {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
  }

  label {
    margin-bottom: 5px;
    color: #ccc;
    font-size: 0.9em;
  }

  input[type="text"],
  input[type="color"],
  select {
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #555;
    background-color: #444;
    color: #eee;
    font-size: 1em;
  }

  input[type="color"] {
    height: 35px; /* Adjust height for color input */
    padding: 2px;
  }
</style>

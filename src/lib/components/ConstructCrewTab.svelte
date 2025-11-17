<script lang="ts">
  import type { CelestialBody } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  function handleChange() {
    dispatch('update');
  }
</script>

<div class="grid">
  <div class="form-group">
    <label for="current-crew">Current Crew ({construct.crew?.current ?? 0})</label>
    <input
      id="current-crew"
      type="range"
      min="0"
      max={construct.crew?.max ?? 0}
      step="1"
      bind:value={construct.crew.current}
      on:input={handleChange}
    />
  </div>
  <div class="form-group">
    <label for="max-crew">Max Crew</label>
    <input
      id="max-crew"
      type="number"
      min="0"
      step="1"
      bind:value={construct.crew.max}
      on:change={handleChange}
    />
  </div>
  <div class="form-group">
    <label for="current-consumables"
      >Current Consumables ({construct.systems?.life_support?.consumables_current_person_days ??
        0})</label
    >
    <input
      id="current-consumables"
      type="range"
      min="0"
      max={construct.systems?.life_support?.consumables_max_person_days ?? 0}
      step="1"
      bind:value={construct.systems.life_support.consumables_current_person_days}
      on:input={handleChange}
    />
  </div>
  <div class="form-group">
    <label for="max-consumables">Max Consumables (Person-days)</label>
    <input
      id="max-consumables"
      type="number"
      min="0"
      step="1"
      bind:value={construct.systems.life_support.consumables_max_person_days}
      on:change={handleChange}
    />
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  .form-group {
    display: flex;
    flex-direction: column;
  }
  .derived {
    background-color: #2a2a2a;
    padding: 0.5rem;
    border-radius: 3px;
  }
  .derived span {
    font-weight: bold;
    color: #ff3e00;
    margin-top: 0.5rem;
  }
  label {
    margin-bottom: 0.5rem;
    color: #aaa;
  }
  input[type='range'] {
    margin-top: 0.5rem;
  }
</style>

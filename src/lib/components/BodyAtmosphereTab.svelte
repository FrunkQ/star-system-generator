<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let body: CelestialBody;

  const dispatch = createEventDispatcher();

  let gases: { name: string, percent: number }[] = [];

  function init() {
      if (!body.atmosphere) {
          gases = [];
      } else {
          gases = Object.entries(body.atmosphere.composition).map(([name, val]) => ({ name, percent: val * 100 }));
      }
  }

  $: if (body) init();

  function updateAtmosphere() {
      if (!body.atmosphere) {
           body.atmosphere = { name: 'Custom Atmosphere', pressure_bar: 0, composition: {} };
      }
      
      const composition: Record<string, number> = {};
      let total = 0;
      for (const gas of gases) {
          if (gas.name) {
              composition[gas.name] = gas.percent / 100;
              total += gas.percent;
          }
      }
      
      body.atmosphere.composition = composition;
      
      // Auto-update name based on main component? Or leave as is.
      
      dispatch('update');
  }

  function addGas() {
      gases = [...gases, { name: '', percent: 0 }];
  }

  function removeGas(index: number) {
      gases = gases.filter((_, i) => i !== index);
      updateAtmosphere();
  }
  
  function createAtmosphere() {
      body.atmosphere = { name: 'Thin Atmosphere', pressure_bar: 0.1, composition: { 'CO2': 0.9, 'N2': 0.1 } };
      init();
      dispatch('update');
  }

  function removeAtmosphere() {
      delete body.atmosphere;
      init();
      dispatch('update');
  }
</script>

<div class="tab-panel">
    {#if !body.atmosphere}
        <p>No atmosphere present.</p>
        <button on:click={createAtmosphere}>Create Atmosphere</button>
    {:else}
        <div class="form-group">
            <label>Surface Pressure (bar)</label>
            <input type="number" step="0.001" bind:value={body.atmosphere.pressure_bar} on:input={() => dispatch('update')} />
        </div>
        
        <div class="form-group">
            <label>Name / Type</label>
            <input type="text" bind:value={body.atmosphere.name} on:input={() => dispatch('update')} />
        </div>

        <hr />
        <h4>Composition</h4>
        
        {#each gases as gas, i}
            <div class="gas-row">
                <input type="text" placeholder="Gas Name" bind:value={gas.name} on:input={updateAtmosphere} style="flex: 2;" />
                <input type="number" placeholder="%" bind:value={gas.percent} on:input={updateAtmosphere} style="flex: 1;" />
                <button class="delete-btn" on:click={() => removeGas(i)}>X</button>
            </div>
        {/each}
        
        <div class="actions">
            <button on:click={addGas}>+ Add Gas</button>
            <button class="danger" on:click={removeAtmosphere}>Remove Atmosphere</button>
        </div>
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  input { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; }
  
  .gas-row { display: flex; gap: 5px; margin-bottom: 5px; }
  
  button { padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; background: #555; color: #eee; }
  .delete-btn { background: #cc0000; color: white; padding: 0 10px; }
  .actions { display: flex; justify-content: space-between; margin-top: 10px; }
  .danger { background: #cc0000; color: white; }
</style>

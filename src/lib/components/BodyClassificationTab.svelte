<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let body: CelestialBody;

  const dispatch = createEventDispatcher();

  function handleUpdate() {
    dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="form-group">
        <label>Role Hint (System Hierarchy)</label>
        <select bind:value={body.roleHint} on:change={handleUpdate}>
            <option value="star">Star</option>
            <option value="planet">Planet</option>
            <option value="moon">Moon</option>
            <option value="belt">Belt</option>
            <option value="barycenter">Barycenter</option>
        </select>
        <p class="hint">Changing this affects how the object is visualized and treated in the hierarchy.</p>
    </div>

    <div class="form-group">
        <label>Primary Classification</label>
        <input type="text" bind:value={body.classes[0]} on:input={handleUpdate} placeholder="e.g., planet/terrestrial/desert" />
    </div>

    <div class="form-group">
        <label>Secondary Classes</label>
        <textarea 
            value={body.classes.slice(1).join(', ')} 
            on:input={(e) => {
                const val = e.currentTarget.value;
                const extras = val.split(',').map(s => s.trim()).filter(s => s);
                body.classes = [body.classes[0], ...extras];
                handleUpdate();
            }}
            placeholder="Comma separated list"
        ></textarea>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; }
  label { margin-bottom: 5px; color: #ccc; font-size: 0.9em; }
  select, input, textarea { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; width: 100%; box-sizing: border-box; }
  .hint { font-size: 0.8em; color: #888; margin-top: 5px; }
</style>

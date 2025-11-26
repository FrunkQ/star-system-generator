<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';

  export let body: CelestialBody;

  const dispatch = createEventDispatcher();
  
  let newKey = '';
  let newValue = '';

  function removeTag(index: number) {
      if (!body.tags) return;
      body.tags = body.tags.filter((_, i) => i !== index);
      dispatch('update');
  }

  function addTag() {
      if (!newKey) return;
      if (!body.tags) body.tags = [];
      body.tags = [...body.tags, { key: newKey, value: newValue }];
      newKey = '';
      newValue = '';
      dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="tags-list">
        {#if body.tags && body.tags.length > 0}
            {#each body.tags as tag, i}
                <div class="tag-item">
                    <span class="tag-key">{tag.key}</span>
                    {#if tag.value}<span class="tag-sep">:</span> <span class="tag-value">{tag.value}</span>{/if}
                    <button class="delete-btn" on:click={() => removeTag(i)}>X</button>
                </div>
            {/each}
        {:else}
            <p class="no-tags">No tags.</p>
        {/if}
    </div>

    <div class="add-tag-form">
        <h4>Add Tag</h4>
        <div class="row">
            <input type="text" placeholder="Key (e.g. habitability/human)" bind:value={newKey} />
            <input type="text" placeholder="Value (optional)" bind:value={newValue} />
        </div>
        <button class="add-btn" on:click={addTag} disabled={!newKey}>Add</button>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  
  .tag-item { 
      display: flex; align-items: center; gap: 5px; 
      background: #333; padding: 5px 10px; border-radius: 4px; 
      margin-bottom: 5px;
  }
  .tag-key { font-weight: bold; color: #88ccff; }
  .tag-value { color: #eee; }
  .tag-sep { color: #888; }
  .delete-btn { margin-left: auto; background: none; border: none; color: #cc0000; cursor: pointer; font-weight: bold; }
  
  .no-tags { color: #888; font-style: italic; }

  .add-tag-form { border-top: 1px solid #555; padding-top: 10px; }
  .row { display: flex; gap: 5px; margin-bottom: 5px; }
  input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; }
  .add-btn { width: 100%; padding: 8px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .add-btn:disabled { background-color: #555; color: #888; cursor: not-allowed; }
</style>

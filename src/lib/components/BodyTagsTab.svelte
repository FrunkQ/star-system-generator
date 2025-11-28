<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();
  
  let newKey = '';
  let newValue = '';

  const commonTags = [
      'tidally-locked', 'geologically-active', 'subsurface-ocean', 'magnetic-field',
      'rings', 'mineral-rich', 'rare-metals', 'high-gravity', 'low-gravity',
      'habitability/human', 'habitability/alien-hardy', 'ruins', 'artifact',
      'biodiversity/high', 'biodiversity/low'
  ];

  function removeTag(index: number) {
      if (!body.tags) return;
      body.tags = body.tags.filter((_, i) => i !== index);
      dispatch('update');
  }

  function addSuggestedTag(tagKey: string) {
      if (!body.tags) body.tags = [];
      if (!body.tags.some(t => t.key === tagKey)) {
          body.tags = [...body.tags, { key: tagKey }];
          dispatch('update');
      }
  }

  function addCustomTag() {
      if (!newKey) return;
      if (!body.tags) body.tags = [];
      body.tags = [...body.tags, { key: newKey, value: newValue }];
      newKey = '';
      newValue = '';
      dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="tags-section">
        <div class="tag-group">
            <span class="group-label">Current:</span>
            <div class="tags-list">
                {#if body.tags && body.tags.length > 0}
                    {#each body.tags as tag, i}
                        <button class="tag-chip active" on:click={() => removeTag(i)} title="Click to remove">
                            {tag.key}{#if tag.value}: {tag.value}{/if} <span class="x">×</span>
                        </button>
                    {/each}
                {:else}
                    <span class="no-tags">None</span>
                {/if}
            </div>
        </div>
        
        <div class="tag-group">
            <span class="group-label">Common:</span>
            <div class="tags-list">
                {#each commonTags as sTag}
                    {#if !body.tags?.some(t => t.key === sTag)}
                        <button class="tag-chip suggested" on:click={() => addSuggestedTag(sTag)} title="Click to add">
                            {sTag} <span class="plus">+</span>
                        </button>
                    {/if}
                {/each}
            </div>
        </div>
    </div>

    <hr />
    <h4>Add Custom Tag</h4>
    
    <div class="add-tag-form">
        <div class="row">
            <input type="text" placeholder="Key (e.g. faction/control)" bind:value={newKey} />
            <input type="text" placeholder="Value (optional)" bind:value={newValue} />
        </div>
        <button class="add-btn" on:click={addCustomTag} disabled={!newKey}>Add Custom Tag</button>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  
  .tags-section { display: flex; flex-direction: column; gap: 15px; }
  .tag-group { display: flex; align-items: flex-start; gap: 10px; }
  .group-label { font-size: 0.8em; color: #888; width: 60px; margin-top: 5px; flex-shrink: 0; }
  .tags-list { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }
  
  .tag-chip { border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.8em; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background-color 0.2s; }
  .tag-chip.active { background-color: #3b82f6; color: white; }
  .tag-chip.active:hover { background-color: #2563eb; }
  .tag-chip.suggested { background-color: #333; color: #88ccff; border: 1px dashed #444; }
  .tag-chip.suggested:hover { background-color: #444; }
  .x, .plus { font-weight: bold; font-size: 1.1em; line-height: 0.5; }
  
  .no-tags { color: #555; font-style: italic; margin-top: 5px; }

  .add-tag-form { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 5px; }
  input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; }
  .add-btn { width: 100%; padding: 8px; background-color: #333; color: #eee; border: 1px solid #555; border-radius: 4px; cursor: pointer; }
  .add-btn:hover { background-color: #444; }
  .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: #88ccff; font-size: 0.9em; text-transform: uppercase; }
</style>
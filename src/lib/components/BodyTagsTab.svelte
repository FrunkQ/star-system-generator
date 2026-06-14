<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { describeTag, SUGGESTED_TAGS, isManagedTag } from '$lib/tags/tagPresentation';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  let newKey = '';
  let newValue = '';

  const commonTags = SUGGESTED_TAGS;

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
                        {@const info = describeTag(tag.key)}
                        {@const managed = isManagedTag(tag.key)}
                        <button
                            class="tag-chip active"
                            class:managed
                            style="background-color: {info.color};"
                            on:click={() => { if (!managed) removeTag(i); }}
                            title={managed
                                ? `${info.description || info.label}\n\nAuto-derived (physics or a PoI rule) — re-applied every recalculation, so it can't be removed by hand. Change the rules to alter it.`
                                : (info.description ? `${info.description}\n(your tag — click to remove)` : 'Your tag — click to remove')}
                        >
                            {info.label}{#if tag.value}: {tag.value}{/if}
                            <span class="x">{managed ? '🔒' : '×'}</span>
                        </button>
                    {/each}
                {:else}
                    <span class="no-tags">None</span>
                {/if}
            </div>
            <p class="tag-hint">🔒 = auto-derived from physics or a PoI rule (locked). Tags you add are removable.</p>
        </div>
        
        <div class="tag-group">
            <span class="group-label">Common:</span>
            <div class="tags-list">
                {#each commonTags as sTag}
                    {#if !body.tags?.some(t => t.key === sTag)}
                        {@const sInfo = describeTag(sTag)}
                        <button class="tag-chip suggested" on:click={() => addSuggestedTag(sTag)} title={sInfo.description || 'Click to add'}>
                            {sInfo.label} <span class="plus">+</span>
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
  .group-label { font-size: 0.8em; color: var(--text-faint); width: 60px; margin-top: 5px; flex-shrink: 0; }
  .tags-list { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }
  
  .tag-chip { border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.8em; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background-color 0.2s; }
  .tag-chip.active { background-color: #3b82f6; color: white; }
  .tag-chip.active:hover { background-color: #2563eb; }
  .tag-chip.managed { cursor: default; opacity: 0.92; }
  .tag-chip.managed .x { font-size: 0.85em; }
  .tag-hint { font-size: 0.72em; color: var(--text-faint); margin: 4px 0 0; width: 100%; }
  .tag-chip.suggested { background-color: var(--bg-panel); color: var(--link); border: 1px dashed var(--border); }
  .tag-chip.suggested:hover { background-color: var(--bg-control); }
  .x, .plus { font-weight: bold; font-size: 1.1em; line-height: 0.5; }

  .no-tags { color: var(--text-faint); font-style: italic; margin-top: 5px; }

  .add-tag-form { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 5px; }
  input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  .add-btn { width: 100%; padding: 8px; background-color: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
  .add-btn:hover { background-color: var(--bg-control); }
  .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }
</style>
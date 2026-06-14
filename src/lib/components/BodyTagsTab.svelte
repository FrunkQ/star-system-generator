<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { describeTag, SUGGESTED_TAGS, tagSource } from '$lib/tags/tagPresentation';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  let newKey = '';
  let newValue = '';
  const commonTags = SUGGESTED_TAGS;

  function removeTag(key: string) {
      if (!body.tags) return;
      body.tags = body.tags.filter((t) => t.key !== key);
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

  // Group the body's tags by SOURCE so the player can see where each came from: their own first,
  // then PoI-rule tags (changeable via the pack) and physics tags (fixed) under category headings.
  interface TagItem { key: string; value?: string; label: string; color: string; textColor: string; desc: string; }
  $: groups = (() => {
    const manual: TagItem[] = [];
    const poi: Record<string, TagItem[]> = {};
    const physics: Record<string, TagItem[]> = {};
    for (const t of body.tags ?? []) {
      const info = describeTag(t.key);
      const item: TagItem = { key: t.key, value: t.value, label: info.label, color: info.color, textColor: info.textColor || '#fff', desc: info.description };
      const src = tagSource(t.key);
      if (src === 'manual') manual.push(item);
      else { const bucket = src === 'poi' ? poi : physics; (bucket[info.group] ||= []).push(item); }
    }
    return { manual, poi, physics };
  })();
  const sortedGroups = (r: Record<string, TagItem[]>) => Object.keys(r).sort();
</script>

<div class="tab-panel">
  <div class="tags-section">
    {#if !(body.tags && body.tags.length)}
      <span class="no-tags">No tags yet.</span>
    {/if}

    <!-- Your own tags (removable). -->
    {#if groups.manual.length}
      <div class="tag-group">
        <h5 class="src-head manual-head">Yours</h5>
        <div class="tags-list">
          {#each groups.manual as t (t.key)}
            <button class="tag-chip active" style="background-color:{t.color}; color:{t.textColor}" title={(t.desc ? t.desc + '\n\n' : '') + 'Your tag — click to remove'} on:click={() => removeTag(t.key)}>
              {t.label}{#if t.value}: {t.value}{/if} <span class="x">×</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- PoI-rule tags: changeable by editing the pack (orange lock). -->
    {#each sortedGroups(groups.poi) as g (g)}
      <div class="tag-group">
        <h5 class="src-head poi-head">{g} <span class="src-note">· PoI rule</span></h5>
        <div class="tags-list">
          {#each groups.poi[g] as t (t.key)}
            <button class="tag-chip locked" style="background-color:{t.color}; color:{t.textColor}" title={(t.desc || t.label) + '\n\nFrom a PoI rule — re-applied every run. Change the rule/pack to alter it.'}>
              {t.label}{#if t.value}: {t.value}{/if}
              <svg class="lock poi" viewBox="0 0 24 24" width="11" height="11"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="#111" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Physics-derived tags: fixed (red lock). -->
    {#each sortedGroups(groups.physics) as g (g)}
      <div class="tag-group">
        <h5 class="src-head physics-head">{g} <span class="src-note">· physics</span></h5>
        <div class="tags-list">
          {#each groups.physics[g] as t (t.key)}
            <button class="tag-chip locked" style="background-color:{t.color}" title={(t.desc || t.label) + '\n\nDerived from the physics — fixed, recomputed every run.'}>
              {t.label}{#if t.value}: {t.value}{/if}
              <svg class="lock physics" viewBox="0 0 24 24" width="11" height="11"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="#111" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
          {/each}
        </div>
      </div>
    {/each}

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
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 14px; }
  .tags-section { display: flex; flex-direction: column; gap: 10px; }
  .tag-group { display: flex; flex-direction: column; gap: 5px; }
  .src-head { margin: 4px 0 2px; font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .src-note { opacity: 0.6; text-transform: none; letter-spacing: 0; }
  .manual-head { color: var(--link, #6aa0d8); }
  .poi-head { color: #e0973a; }
  .physics-head { color: var(--text-faint); }
  .group-label { font-size: 0.8em; color: var(--text-faint); }
  .tags-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag-chip { border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.8em; cursor: pointer; display: flex; align-items: center; gap: 5px; color: #fff; }
  .tag-chip.active:hover { filter: brightness(1.12); }
  .tag-chip.locked { cursor: default; }
  .tag-chip.suggested { background-color: var(--bg-panel); color: var(--link); border: 1px dashed var(--border); }
  .tag-chip.suggested:hover { background-color: var(--bg-control); }
  .x, .plus { font-weight: bold; font-size: 1.1em; line-height: 0.5; }
  .lock { flex: 0 0 auto; }
  .lock.physics { color: #ef4444; }   /* red outline — physics, cannot change */
  .lock.poi { color: #f59e0b; }       /* orange outline — PoI rule, changeable */
  .no-tags { color: var(--text-faint); font-style: italic; }
  .add-tag-form { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 5px; }
  input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  .add-btn { width: 100%; padding: 8px; background-color: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
  .add-btn:hover { background-color: var(--bg-control); }
  .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }
</style>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { describeTag, tagSource } from '$lib/tags/tagPresentation';
  import { poiPacks, activeCategories } from '$lib/physics/reasonsToVisit';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  // Add-a-tag form: pick a category (Custom = free-form key) → name → live preview of the full tag.
  let newCat = 'custom';
  let newName = '';
  let newValue = '';
  $: cats = activeCategories($poiPacks);
  const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9/_-]/g, '');
  $: previewKey = newCat === 'custom' ? (newName.trim() || 'tag') : `${newCat}/${slug(newName) || 'name'}`;
  $: previewInfo = describeTag(previewKey);

  // The existing PoI tags defined in the chosen category that this body doesn't have yet — click one to
  // add it manually (kept as the player's own, so the reasons pass never strips it).
  $: availableInCat = newCat === 'custom' ? [] : (() => {
    const have = new Set((body.tags ?? []).map((t) => t.key));
    const seen = new Set<string>();
    const out: { key: string; label: string; color: string; textColor: string }[] = [];
    for (const p of $poiPacks) {
      if (p.enabled === false) continue;
      for (const r of p.rules ?? []) {
        if (r.category !== newCat || !r.tag || have.has(r.tag) || seen.has(r.tag)) continue;
        seen.add(r.tag);
        const info = describeTag(r.tag);
        out.push({ key: r.tag, label: info.label, color: info.color, textColor: info.textColor || '#fff' });
      }
    }
    return out;
  })();
  function addExisting(key: string) {
    if (!body.tags) body.tags = [];
    if (!body.tags.some((t) => t.key === key)) { body.tags = [...body.tags, { key, manual: true }]; dispatch('update'); }
  }

  function removeTag(key: string) {
      if (!body.tags) return;
      body.tags = body.tags.filter((t) => t.key !== key);
      dispatch('update');
  }
  function addCustomTag() {
      const key = newCat === 'custom' ? newName.trim() : `${newCat}/${slug(newName)}`;
      if (!key || (newCat !== 'custom' && !slug(newName))) return;
      if (!body.tags) body.tags = [];
      if (!body.tags.some((t) => t.key === key)) {
          // manual:true marks it as the player's own — it survives the reasons re-tag pass even when
          // filed under an existing category, and always reads as "Yours" (removable).
          body.tags = [...body.tags, { key, value: newValue || undefined, manual: true }];
          dispatch('update');
      }
      newName = ''; newValue = '';
  }

  // Group the body's tags by SOURCE so the player can see where each came from: their own first,
  // then PoI-rule tags (changeable via the pack) and physics tags (fixed) under category headings.
  // A manual:true tag is always "Yours" regardless of its namespace.
  interface TagItem { key: string; value?: string; label: string; color: string; textColor: string; desc: string; }
  $: groups = (() => {
    const manual: TagItem[] = [];
    const poi: Record<string, TagItem[]> = {};
    const physics: Record<string, TagItem[]> = {};
    for (const t of body.tags ?? []) {
      const info = describeTag(t.key);
      const item: TagItem = { key: t.key, value: t.value, label: info.label, color: info.color, textColor: info.textColor || '#fff', desc: info.description };
      const src = t.manual ? 'manual' : tagSource(t.key);
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

  <hr />
  <h4>Add a tag</h4>
  <div class="add-tag-form">
    <label class="fld">Category
      <select bind:value={newCat}>
        <option value="custom">Custom</option>
        {#each cats as c}<option value={c.id}>{c.label}</option>{/each}
      </select>
    </label>
    {#if availableInCat.length}
      <div class="avail-row">
        <span class="avail-lbl">Available:</span>
        {#each availableInCat as a (a.key)}
          <button class="avail-chip" style="background:{a.color}; color:{a.textColor}" on:click={() => addExisting(a.key)} title="Add {a.label}">+ {a.label}</button>
        {/each}
      </div>
    {/if}
    <label class="fld">Name (what players see)
      <input type="text" bind:value={newName} placeholder={newCat === 'custom' ? 'e.g. Smugglers, faction/control' : 'e.g. spice'} />
    </label>
    <label class="fld">Value (optional)
      <input type="text" bind:value={newValue} placeholder="e.g. Empire, 7" />
    </label>
    <div class="preview-row">Players see:
      <span class="tag-chip-preview" style="background:{previewInfo.color}; color:{previewInfo.textColor || '#fff'}">{previewInfo.label}{#if newValue.trim()}: {newValue}{/if}</span>
      {#if previewInfo.label.toLowerCase() !== previewKey.toLowerCase()}<code class="key-hint">{previewKey}</code>{/if}
    </div>
    <button class="add-btn" on:click={addCustomTag} disabled={!newName.trim()}>Add tag</button>
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
  .tags-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag-chip { border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.8em; cursor: pointer; display: flex; align-items: center; gap: 5px; color: #fff; }
  .tag-chip.active:hover { filter: brightness(1.12); }
  .tag-chip.locked { cursor: default; }
  .x { font-weight: bold; font-size: 1.1em; line-height: 0.5; }
  .lock { flex: 0 0 auto; }
  .lock.physics { color: #ef4444; }   /* red outline — physics, cannot change */
  .lock.poi { color: #f59e0b; }       /* orange outline — PoI rule, changeable */
  .no-tags { color: var(--text-faint); font-style: italic; }
  .add-tag-form { display: flex; flex-direction: column; gap: 8px; }
  .fld { display: flex; flex-direction: column; gap: 3px; font-size: 0.75em; color: var(--text-muted); }
  select { padding: 7px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  .preview-row { display: flex; align-items: center; gap: 7px; font-size: 0.75em; color: var(--text-muted); flex-wrap: wrap; }
  .tag-chip-preview { font-size: 0.92em; padding: 2px 7px; border-radius: 4px; }
  .avail-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .avail-lbl { font-size: 0.72em; color: var(--text-faint); }
  .avail-chip { border: none; border-radius: 4px; padding: 3px 8px; font-size: 0.78em; cursor: pointer; }
  .avail-chip:hover { filter: brightness(1.12); }
  .key-hint { font-family: var(--font-mono, monospace); font-size: 0.85em; color: var(--text-faint); }
  .add-btn { width: 100%; padding: 8px; background-color: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
  .add-btn:hover { background-color: var(--bg-control); }
  .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }
</style>

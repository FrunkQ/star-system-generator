<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { coiCategories, activeCoICategories, orphanedCoITags, removeCoITag, toggleCoI, constructHasCoI, addCoITag, type CoICategory } from '$lib/constructs/coi';
  import { describeTag } from '$lib/tags/tagPresentation';

  export let construct: CelestialBody;
  const dispatch = createEventDispatcher();

  // Re-read after each toggle so chips reflect the construct's current tags.
  let tick = 0;
  function toggle(cat: CoICategory, key: string) {
    toggleCoI(construct, cat, key);
    tick++;
    dispatch('update');
  }
  $: cats = activeCoICategories($coiCategories);
  $: has = (key: string) => { void tick; return constructHasCoI(construct, key); };
  // Tags whose category was turned off or removed — kept on the ship but shown greyed/inactive.
  $: orphans = (void tick, orphanedCoITags(construct, $coiCategories));
  function dropOrphan(key: string) { removeCoITag(construct, key); tick++; dispatch('update'); }

  // --- Add a tag: mirrors the body/PoI "Add a tag" form (category-first → name → live preview). Adding
  //     under a category persists it there (so it shows in the CoI editor + everywhere); Custom files it
  //     under a free-form "Custom" category. ---
  let newCat = 'custom';
  let newName = '';
  let newValue = '';
  const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9/_-]/g, '');
  $: previewKey = `${newCat}/${slug(newName) || 'name'}`;
  $: previewInfo = describeTag(previewKey);
  function addCustom() {
    const label = newName.trim();
    if (!label) return;
    const cat = $coiCategories.find((c) => c.id === newCat);
    const key = addCoITag(newCat, cat?.label || 'Custom', label);
    if (key && !construct.tags?.some((t) => t.key === key)) {
      (construct.tags ?? (construct.tags = [])).push({ key, value: newValue.trim() || undefined, manual: true, coi: true } as any);
      tick++;
      dispatch('update');
    }
    newName = ''; newValue = '';
  }

  // The existing tags defined in the chosen category that this construct doesn't carry yet — click one to
  // add it (mirrors the PoI/body adder: pick a category → see what's available → click, or type a custom).
  $: availableInCat = newCat === 'custom' ? [] : (() => {
    void tick;
    const cat = $coiCategories.find((c) => c.id === newCat);
    if (!cat) return [] as { key: string; label: string; color?: string; textColor?: string }[];
    return cat.tags
      .filter((t) => !t.derived && !has(t.key))
      .map((t) => ({ key: t.key, label: t.label, color: cat.color, textColor: cat.textColor }));
  })();
  function addExisting(key: string) {
    const cat = $coiCategories.find((c) => c.id === newCat);
    if (cat) toggle(cat, key);
  }
</script>

<div class="coi-tab">
  <p class="hint">Tag this construct by hand. <strong>Owner</strong> sets how punctual it is (its tardiness); <strong>Purpose</strong> describes what it does. These travel with the starmap and feed autopilot later.</p>

  {#each cats as cat (cat.id)}
    {@const applied = cat.tags.filter((t) => !t.derived && has(t.key))}
    {#if applied.length}
      <div class="cat">
        <div class="cat-head">
          <span class="swatch" style="background:{cat.color || '#666'}"></span>
          <span class="cat-label">{cat.label}</span>
        </div>
        <div class="chips">
          {#each applied as t (t.key)}
            <button
              class="chip on"
              style={`background:${cat.color || '#444'}; color:${cat.textColor || '#fff'}; border-color:${cat.color || '#444'}`}
              title={t.tardiness !== undefined ? `Tardiness ${t.tardiness} · click to remove` : 'Click to remove'}
              on:click={() => toggle(cat, t.key)}
            >{t.label} ✕</button>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
  {#if !cats.some((c) => c.tags.some((t) => !t.derived && has(t.key))) && !orphans.length}
    <p class="empty-note">No tags on this construct yet — pick a category below to see what's available, or add your own.</p>
  {/if}

  <hr />
  <h4>Add a tag</h4>
  <div class="add-tag-form">
    <label class="fld">Category
      <select bind:value={newCat}>
        <option value="custom" style="color: var(--accent, #5b8def); font-weight: 600;">Custom</option>
        {#each $coiCategories as c (c.id)}<option value={c.id} style={c.required ? 'font-weight: 700;' : ''}>{c.label}</option>{/each}
      </select>
    </label>
    {#if availableInCat.length}
      <div class="avail-row">
        <span class="avail-lbl">Available:</span>
        {#each availableInCat as a (a.key)}
          <button class="avail-chip" style="background:{a.color || '#444'}; color:{a.textColor || '#fff'}" on:click={() => addExisting(a.key)} title="Add {a.label}">+ {a.label}</button>
        {/each}
      </div>
    {/if}
    <label class="fld">Name
      <input type="text" bind:value={newName} placeholder={newCat === 'custom' ? 'e.g. Flagship, faction' : 'e.g. tug'} on:keydown={(e) => e.key === 'Enter' && addCustom()} />
    </label>
    <label class="fld">Value (optional)
      <input type="text" bind:value={newValue} placeholder="e.g. Empire, 7" />
    </label>
    <div class="preview-row">Shows as:
      <span class="tag-chip-preview" style="background:{previewInfo.color}; color:{previewInfo.textColor || '#fff'}">{previewInfo.label}{#if newValue.trim()}: {newValue}{/if}</span>
      {#if previewInfo.label.toLowerCase() !== previewKey.toLowerCase()}<code class="key-hint">{previewKey}</code>{/if}
    </div>
    <button class="add-btn" on:click={addCustom} disabled={!newName.trim()}>Add tag</button>
  </div>

  {#if orphans.length}
    <div class="cat inactive">
      <div class="cat-head">
        <span class="swatch off"></span>
        <span class="cat-label">Inactive</span>
        <span class="one">category turned off or removed</span>
      </div>
      <div class="chips">
        {#each orphans as o (o.key)}
          <span class="chip ghost" title="This tag's category is no longer active. It's kept on the construct — remove it with ✕.">
            {o.label}
            <button class="drop" on:click={() => dropOrphan(o.key)} aria-label="Remove tag">✕</button>
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .coi-tab { display: flex; flex-direction: column; gap: 14px; padding: 10px; }
  .hint { font-size: 0.82em; color: var(--text-faint, #8a8f9a); margin: 0; line-height: 1.4; }
  .cat { display: flex; flex-direction: column; gap: 6px; }
  .cat-head { display: flex; align-items: center; gap: 8px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .cat-label { font-weight: 600; color: var(--text, #e8e8e8); }
  .one { font-size: 0.72em; color: var(--text-faint, #8a8f9a); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    padding: 3px 10px; border-radius: 999px; font-size: 0.8em; cursor: pointer;
    background: var(--bg-control, #20232b); color: var(--text-muted, #b8bcc4);
    border: 1px solid var(--border, #333); transition: all 0.1s;
  }
  .chip:hover { border-color: var(--accent, #5b8def); }
  .chip.on { font-weight: 600; }
  .inactive { opacity: 0.6; }
  .swatch.off { background: var(--border, #555); }
  .chip.ghost { display: inline-flex; align-items: center; gap: 5px; font-style: italic; cursor: default; border-style: dashed; }
  .chip.ghost .drop { background: none; border: none; color: var(--text-muted, #b8bcc4); cursor: pointer; padding: 0; font-size: 0.9em; }
  .empty-note { font-size: 0.82em; color: var(--text-faint, #888); font-style: italic; margin: 4px 0 0; }
  .avail-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .avail-lbl { font-size: 0.72em; color: var(--text-faint, #888); }
  .avail-chip { border: none; border-radius: 999px; padding: 3px 9px; font-size: 0.78em; cursor: pointer; }
  .avail-chip:hover { filter: brightness(1.12); }
  .add-tag-form { display: flex; flex-direction: column; gap: 8px; }
  .fld { display: flex; flex-direction: column; gap: 3px; font-size: 0.75em; color: var(--text-muted); }
  .add-tag-form select { padding: 7px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  .add-tag-form input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  .preview-row { display: flex; align-items: center; gap: 7px; font-size: 0.75em; color: var(--text-muted); flex-wrap: wrap; }
  .tag-chip-preview { font-size: 0.92em; padding: 2px 7px; border-radius: 4px; }
  .key-hint { font-family: var(--font-mono, monospace); font-size: 0.85em; color: var(--text-faint); }
  .add-btn { width: 100%; padding: 8px; background-color: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
  .add-btn:hover { background-color: var(--bg-control); }
  .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }
</style>

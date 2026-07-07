<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { coiCategories, resetCoIs, exportCoIs, importCoIs, mergeStarmapCoIs, setCoIEnabled, type CoICategory } from '$lib/constructs/coi';
  import HelpModal from './HelpModal.svelte';
  import tagsGuide from '../../../docs/tags-guide.md?raw';

  let showHelp = false;
  const dispatch = createEventDispatcher();
  let fileInput: HTMLInputElement;
  $: cats = $coiCategories;

  function save() {
    const blob = new Blob([exportCoIs(cats)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'constructs-of-interest.json';
    a.click(); URL.revokeObjectURL(url);
  }
  function load(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { mergeStarmapCoIs(importCoIs(r.result as string)); }
      catch (err) { alert('Could not load that CoI pack: ' + (err as Error).message); }
    };
    r.readAsText(f);
    (e.target as HTMLInputElement).value = '';
  }

  const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function mutate(fn: (cats: CoICategory[]) => CoICategory[]) { coiCategories.update(fn); }

  function addCategory() {
    const label = prompt('New category name (e.g. Faction)?');
    if (!label) return;
    const id = slug(label);
    mutate((cs) => cs.some((c) => c.id === id) ? cs : [...cs, { id, label, color: '#666', textColor: '#fff', single: false, enabled: true, tags: [] }]);
  }
  function removeCategory(id: string) {
    if (!confirm('Remove this category and its tags?')) return;
    mutate((cs) => cs.filter((c) => c.id !== id));
  }
  function addTag(cat: CoICategory) {
    const label = prompt(`New ${cat.label} tag?`);
    if (!label) return;
    const key = `${cat.id}/${slug(label)}`;
    mutate((cs) => cs.map((c) => c.id === cat.id && !c.tags.some((t) => t.key === key)
      ? { ...c, tags: [...c.tags, { key, label }] } : c));
  }
  function removeTag(cat: CoICategory, key: string) {
    mutate((cs) => cs.map((c) => c.id === cat.id ? { ...c, tags: c.tags.filter((t) => t.key !== key) } : c));
  }
  function setCat(id: string, patch: Partial<CoICategory>) {
    mutate((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c));
  }
  function setTardiness(cat: CoICategory, key: string, v: number) {
    mutate((cs) => cs.map((c) => c.id === cat.id
      ? { ...c, tags: c.tags.map((t) => t.key === key ? { ...t, tardiness: isNaN(v) ? undefined : Math.max(0, Math.min(1, v)) } : t) } : c));
  }
</script>

<div class="backdrop" on:click={() => dispatch('close')} role="button" tabindex="-1" on:keydown={(e) => e.key === 'Escape' && dispatch('close')}>
  <div class="modal" on:click|stopPropagation role="dialog" aria-label="Constructs of Interest">
    <header>
      <h2>Constructs of Interest</h2>
      <div class="head-actions">
        <button type="button" class="coi-help" title="About tags, PoI & CoI" on:click={() => (showHelp = true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
          Guide
        </button>
        <button class="x" on:click={() => dispatch('close')} aria-label="Close">✕</button>
      </div>
    </header>
    {#if showHelp}<HelpModal markdown={tagsGuide} on:close={() => (showHelp = false)} />{/if}
    <p class="hint">Hand-applied tags for ships &amp; stations (set on a construct's Tags tab). Owner tags carry a tardiness (0 = always on time, 1 = very tardy). These travel inside the starmap file.</p>

    <div class="cats">
      {#each cats as cat (cat.id)}
        <div class="cat">
          <div class="cat-row">
            <label class="on" title={cat.required ? 'Core category — always available (autopilot needs it)' : 'Available on constructs'}><input type="checkbox" checked={cat.enabled === true || cat.required} disabled={cat.required} on:change={(e) => setCoIEnabled(cat.id, (e.currentTarget as HTMLInputElement).checked)} /></label>
            <input class="color" type="color" value={cat.color || '#666666'} on:input={(e) => setCat(cat.id, { color: (e.currentTarget as HTMLInputElement).value })} />
            <input class="label" value={cat.label} readonly={cat.required} title={cat.required ? 'Core category name is fixed (autopilot relies on it)' : ''} on:input={(e) => { if (!cat.required) setCat(cat.id, { label: (e.currentTarget as HTMLInputElement).value }); }} />
            {#if cat.required}<span class="req" title="Core category — required by autopilot">core</span>{/if}
            <label class="single" class:locked={cat.required} title={cat.required ? 'Fixed for this core category' : ''}><input type="checkbox" checked={cat.single} disabled={cat.required} on:change={(e) => setCat(cat.id, { single: (e.currentTarget as HTMLInputElement).checked })} /> one only</label>
            {#if !cat.required}<button class="del" title="Remove category" on:click={() => removeCategory(cat.id)}>🗑</button>{/if}
          </div>
          <div class="tags">
            {#each cat.tags as t (t.key)}
              <span class="tag" class:locked={t.locked} class:derived={t.derived} style="border-color:{cat.color}" title={t.locked ? 'Required baseline — can\'t be removed' : t.derived ? 'Set automatically from the ship\'s state' : ''}>
                {t.label}{#if t.derived} <span class="auto">auto</span>{/if}
                {#if cat.id === 'owner'}<input class="tard" type="number" min="0" max="1" step="0.05" value={t.tardiness ?? ''} title="Tardiness 0..1" on:input={(e) => setTardiness(cat, t.key, parseFloat((e.currentTarget as HTMLInputElement).value))} />{/if}
                {#if !t.locked && !t.derived}<button class="tx" on:click={() => removeTag(cat, t.key)} aria-label="Remove tag">✕</button>{/if}
              </span>
            {/each}
            <button class="add-tag" on:click={() => addTag(cat)}>+ tag</button>
          </div>
        </div>
      {/each}
    </div>

    <footer>
      <button on:click={addCategory}>+ Category</button>
      <button on:click={save} title="Download these CoIs as a pack file">Save…</button>
      <button on:click={() => fileInput.click()} title="Load a CoI pack (merges by category)">Load…</button>
      <input type="file" accept=".json" bind:this={fileInput} on:change={load} style="display:none" />
      <button class="reset" on:click={() => { if (confirm('Reset CoIs to the built-in defaults?')) resetCoIs(); }}>Reset to defaults</button>
      <button class="primary" on:click={() => dispatch('close')}>Done</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2100; }
  .modal { background: var(--bg-panel, #14161c); color: var(--text, #e8e8e8); border-radius: 8px; width: min(640px, 94vw); max-height: 88vh; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border, #333); padding-bottom: 0.5rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  .head-actions { display: flex; align-items: center; gap: 10px; }
  .coi-help { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--border, #333); border-radius: 6px; color: var(--text-muted, #b8bcc4); font-size: 0.78rem; padding: 3px 8px; cursor: pointer; }
  .coi-help:hover { color: var(--accent); border-color: var(--accent); }
  .coi-help svg { flex: 0 0 auto; }
  .x { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1rem; }
  .hint { font-size: 0.82em; color: var(--text-faint, #8a8f9a); margin: 0; line-height: 1.4; }
  .cats { display: flex; flex-direction: column; gap: 12px; }
  .cat { border: 1px solid var(--border, #333); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .cat-row { display: flex; align-items: center; gap: 8px; }
  .color { width: 28px; height: 28px; padding: 0; border: none; background: none; cursor: pointer; }
  .label { flex: 1; padding: 4px 6px; background: var(--bg-control, #20232b); border: 1px solid var(--border, #333); color: var(--text); border-radius: 4px; }
  .single { font-size: 0.78em; color: var(--text-muted); display: flex; align-items: center; gap: 3px; white-space: nowrap; }
  .del, .tx { background: none; border: none; cursor: pointer; color: var(--text-muted); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px 1px 8px; border: 1px solid var(--border, #333); border-radius: 999px; font-size: 0.72em; line-height: 1.5; }
  .tag.locked { padding-right: 8px; font-weight: 600; }
  .tag.derived { opacity: 0.8; border-style: dashed; }
  .tag .auto { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-faint, #8a8f9a); }
  .tag .tx { font-size: 0.95em; line-height: 1; padding: 0 0 0 1px; }
  .single.locked { opacity: 0.55; }
  .label[readonly] { opacity: 0.75; cursor: default; }
  .req { font-size: 0.62em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent, #5b8def); border: 1px solid currentColor; border-radius: 4px; padding: 0 3px; }
  .tard { width: 46px; padding: 1px 3px; font-size: 0.85em; background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 3px; }
  .add-tag { background: var(--bg-control, #20232b); border: 1px dashed var(--border, #555); border-radius: 999px; padding: 2px 10px; font-size: 0.8em; cursor: pointer; color: var(--text-muted); }
  footer { display: flex; gap: 0.5rem; justify-content: flex-end; border-top: 1px solid var(--border, #333); padding-top: 0.75rem; }
  footer button { padding: 6px 14px; border-radius: 4px; border: none; background: var(--bg-control, #20232b); color: var(--text); cursor: pointer; }
  footer .reset { color: var(--status-bad, #d04545); margin-right: auto; }
  footer .primary { background: var(--accent, #5b8def); }
</style>

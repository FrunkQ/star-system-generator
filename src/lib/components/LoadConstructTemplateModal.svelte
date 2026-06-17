<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { coiCategories, activeCoICategories, coiTagLabel } from '$lib/constructs/coi';

  export let rulePack: RulePack;
  export let mode: 'overwrite' | 'create' = 'overwrite';

  const dispatch = createEventDispatcher();

  let allTemplates: CelestialBody[] = [];
  let q = '';                            // free-text search — matches name, description AND tags
  let expanded: string | null = null;    // which category facet is open
  let filters: string[] = [];            // active tag keys (ANDed, like Find by tag)
  let selectedTemplate: CelestialBody | null = null;

  $: cats = $coiCategories;
  $: activeCats = activeCoICategories(cats);
  const label = (key: string) => coiTagLabel(key, cats);
  const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  onMount(() => {
    const flat: CelestialBody[] = [];
    if (rulePack?.constructTemplates) {
      for (const list of Object.values(rulePack.constructTemplates)) {
        if (Array.isArray(list)) flat.push(...(list as CelestialBody[]));
      }
    }
    allTemplates = flat;
  });

  const tagKeys = (t: CelestialBody): string[] => (t.tags || []).map((x: any) => x.key);

  // tag key -> templates carrying it (for facet counts).
  $: index = (() => {
    const m = new Map<string, CelestialBody[]>();
    for (const t of allTemplates) for (const k of tagKeys(t)) {
      const a = m.get(k); if (a) a.push(t); else m.set(k, [t]);
    }
    return m;
  })();

  // One facet per ENABLED CoI category, listing the tags actually present on the templates (with counts).
  // Categories the GM has turned off in Settings -> CoIs simply don't appear here.
  $: facets = activeCats
    .map((c) => ({
      id: c.id, label: c.label, color: c.color || '#888', textColor: c.textColor || '#fff',
      tags: c.tags.map((t) => t.key).filter((k) => index.has(k))
        .map((k) => ({ key: k, label: label(k), count: index.get(k)!.length }))
    }))
    .filter((f) => f.tags.length > 0);

  $: results = allTemplates.filter((t) => {
    const keys = new Set(tagKeys(t));
    if (!filters.every((f) => keys.has(f))) return false;          // must carry ALL active filter tags
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const inName = t.name?.toLowerCase().includes(s);
      const inDesc = t.description?.toLowerCase().includes(s);
      const inTags = [...keys].some((k) => k.toLowerCase().includes(s) || label(k).toLowerCase().includes(s));
      if (!inName && !inDesc && !inTags) return false;             // search spans names AND tags
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const catColor = (key: string) => activeCats.find((c) => key.startsWith(c.id + '/'))?.color || '#666';
  // Tags worth showing on a row — skip Status noise; lead class, owner, purpose, resource.
  const chipTags = (t: CelestialBody): string[] => {
    const keys = tagKeys(t).filter((k) => !k.startsWith('status/'));
    const rank = (k: string) => (k.startsWith('universe/') ? 0 : k.startsWith('class/') ? 1 : k.startsWith('owner/') ? 2 : k.startsWith('purpose/') ? 3 : k.startsWith('resource/') ? 4 : 5);
    return keys.sort((a, b) => rank(a) - rank(b));
  };

  function toggleFilter(key: string) {
    filters = filters.includes(key) ? filters.filter((k) => k !== key) : [...filters, key];
  }
  function clearAll() { q = ''; filters = []; expanded = null; }

  function handleLoad() {
    if (selectedTemplate) { dispatch('load', selectedTemplate); dispatch('close'); }
  }
  function close() { dispatch('close'); }
</script>

<div class="modal-background" on:click={close}>
  <div class="modal" on:click|stopPropagation>
    <h2>{mode === 'create' ? 'Create New Construct' : 'Load Construct Template'}</h2>
    {#if mode === 'overwrite'}
      <p class="warning">Warning: Overwrites current configuration.</p>
    {/if}

    <div class="filters-panel">
      <input class="search" type="text" placeholder="Search name or tag (e.g. Rocinante, shipyard, refuel)…" bind:value={q} />

      <!-- One bubble per enabled CoI category; open it to pick tags into the filter (ANDed). -->
      <div class="bubbles">
        {#each facets as f (f.id)}
          <button class="bubble" class:open={expanded === f.id} style="--c:{f.color}" on:click={() => (expanded = expanded === f.id ? null : f.id)}>
            {f.label} <span class="bcnt">{f.tags.length}</span>
          </button>
        {/each}
      </div>
      {#if expanded}
        {@const f = facets.find((x) => x.id === expanded)}
        {#if f}
          <div class="cat-tags">
            {#each f.tags as t (t.key)}
              <button class="chip" class:active={filters.includes(t.key)} style="background:{f.color}; color:{f.textColor}" on:click={() => toggleFilter(t.key)} title={t.key}>
                {t.label} <span class="cnt">{t.count}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}

      <div class="active-filters">
        {#if filters.length}
          <span class="flabel">Matching all:</span>
          {#each filters as key (key)}
            <button class="chip rm" style="background:{catColor(key)}" on:click={() => toggleFilter(key)} title="Remove">{label(key)} <span class="x">×</span></button>
          {/each}
          <button class="clear" on:click={clearAll}>Clear</button>
        {:else}
          <span class="hint">Open a category to filter, or search by name/tag.</span>
        {/if}
      </div>
    </div>

    <div class="browser-window">
      {#if results.length === 0}
        <div class="empty-msg">No constructs match.</div>
      {/if}
      {#each results as t (t.id || t.name)}
        <div class="browser-item {selectedTemplate === t ? 'selected' : ''}"
             on:click={() => (selectedTemplate = t)}
             on:dblclick={handleLoad}>
          <div class="icon-wrapper">
            <div class="construct-icon {t.icon_type || 'triangle'}" style="background-color: {t.icon_color || '#ffd24d'}"></div>
          </div>
          <div class="file-info">
            <span class="name">{t.name}</span>
            <div class="tag-chips">
              {#each chipTags(t) as k}<span class="tag-chip" style="border-color:{catColor(k)}">{label(k)}</span>{/each}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="footer">
      <div class="selected-info">
        {#if selectedTemplate}
          <strong>{selectedTemplate.name}</strong>
          <div class="stats">
            {roleLabel(selectedTemplate.roleHint || '')} •
            {((selectedTemplate.physical_parameters?.massKg || 0) / 1000).toLocaleString()}t •
            {selectedTemplate.systems?.power_plants?.[0]?.type || 'No Power'}
          </div>
        {:else}
          <span class="placeholder">{results.length} construct{results.length === 1 ? '' : 's'} — select one…</span>
        {/if}
      </div>
      <div class="buttons">
        <button class="secondary" on:click={close}>Cancel</button>
        <button class="primary" on:click={handleLoad} disabled={!selectedTemplate}>
          {mode === 'create' ? 'Create' : 'Load'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000; backdrop-filter: blur(2px);
  }
  .modal {
    background-color: var(--bg-panel); border-radius: 8px;
    display: flex; flex-direction: column; width: 640px; height: 580px;
    border: 1px solid var(--border); box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    color: var(--text); overflow: hidden;
  }
  h2 {
    margin: 0; padding: 15px; background-color: var(--bg-panel);
    border-bottom: 1px solid var(--border-soft); font-size: 1.2em; text-align: left;
  }
  .warning {
    background-color: #443300; color: var(--warning); margin: 0; padding: 5px;
    font-size: 0.8em; text-align: center;
  }

  .filters-panel {
    padding: 10px 15px; background-color: var(--bg-panel);
    border-bottom: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 8px;
  }
  .search {
    width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 5px;
    border: 1px solid var(--border); background: var(--bg-control); color: var(--text); font-size: 0.9em;
  }
  .search:focus { outline: none; border-color: var(--accent); }

  .bubbles { display: flex; flex-wrap: wrap; gap: 4px; }
  .bubble {
    background: color-mix(in srgb, var(--c) 22%, transparent); border: 1px solid var(--c);
    color: var(--text); border-radius: 999px; padding: 2px 9px; font-size: 0.74rem;
    cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  }
  .bubble.open { background: var(--c); color: #fff; }
  .bcnt { font-size: 0.68em; opacity: 0.7; }

  .cat-tags {
    display: flex; flex-wrap: wrap; gap: 5px; padding: 6px; max-height: 22vh; overflow-y: auto;
    background: var(--bg-control); border-radius: 6px;
  }
  .chip {
    border: none; border-radius: 4px; padding: 3px 8px; font-size: 0.78rem; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; color: #fff;
  }
  .chip:hover { filter: brightness(1.12); }
  .chip.active { outline: 2px solid #fff; }
  .cnt { font-size: 0.72em; opacity: 0.85; background: rgba(0,0,0,0.22); border-radius: 8px; padding: 0 5px; }

  .active-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 24px; }
  .flabel { font-size: 0.74rem; color: var(--text-faint); }
  .hint { font-size: 0.76rem; color: var(--text-faint); font-style: italic; }
  .chip.rm .x { font-weight: bold; margin-left: 2px; }
  .clear {
    background: none; border: 1px dashed var(--border); color: var(--text-faint);
    border-radius: 999px; padding: 2px 9px; font-size: 0.74rem; cursor: pointer;
  }

  .browser-window { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
  .browser-item {
    display: flex; align-items: flex-start; padding: 8px 12px; border-radius: 4px;
    cursor: pointer; transition: background-color 0.1s; border: 1px solid transparent;
  }
  .browser-item:hover { background-color: var(--bg-control); }
  .browser-item.selected { background-color: #004080; border-color: #0059b3; }
  .icon-wrapper { width: 24px; margin-right: 12px; padding-top: 2px; display: flex; justify-content: center; }
  .construct-icon { width: 14px; height: 14px; }
  .construct-icon.circle { border-radius: 50%; }
  .construct-icon.square { border-radius: 2px; }
  .construct-icon.triangle { clip-path: polygon(50% 0%, 0% 100%, 100% 100%); }
  .construct-icon.diamond { clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); }
  .file-info { display: flex; flex-direction: column; overflow: hidden; gap: 4px; }
  .file-info .name { color: var(--text); font-weight: 500; }
  .tag-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag-chip {
    font-size: 0.7em; padding: 1px 6px; border-radius: 3px;
    background: var(--bg-control-hover, rgba(255,255,255,0.07)); color: var(--text-muted);
    border: 1px solid var(--border-soft);
  }
  .empty-msg { color: var(--text-faint); text-align: center; margin-top: 50px; font-style: italic; }

  .footer {
    padding: 15px; background-color: var(--bg-panel); border-top: 1px solid var(--border-soft);
    display: flex; justify-content: space-between; align-items: center;
  }
  .selected-info { display: flex; flex-direction: column; text-align: left; font-size: 0.9em; max-width: 60%; }
  .selected-info .stats { color: var(--text-muted); font-size: 0.85em; }
  .placeholder { color: var(--text-faint); font-style: italic; }
  .buttons { display: flex; gap: 10px; }
  button.secondary { background-color: var(--bg-control); color: var(--text-muted); padding: 8px 16px; border-radius: 4px; cursor: pointer; border: none; font-size: 0.9em; }
  button.secondary:hover { background-color: var(--bg-control-hover); }
  button.primary { background-color: var(--accent); color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; border: none; font-size: 0.9em; }
  button.primary:hover { background-color: #0056b3; }
  button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

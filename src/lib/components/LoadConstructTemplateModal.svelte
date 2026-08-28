<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { coiCategories, activeCoICategories, coiTagLabel } from '$lib/constructs/coi';
  import { constructDriveTag, byId } from '$lib/constructs/inheritance';
  import { megaTypeDef, defaultMegaParams } from '$lib/constructs/megaTypes';
  import { effectiveMegaRequires, megaHardCheck, type MegaHost } from '$lib/constructs/megaPlacement';
  import { megaSummaryLine } from '$lib/constructs/megaPreview';
  import MegaPreview from '$lib/constructs/MegaPreview.svelte';

  export let rulePack: RulePack;
  export let mode: 'overwrite' | 'create' = 'overwrite';
  /** G53: the body this construct will be created around. When given (create mode), the
   *  Megaconstructs tab appears — IF anything passes its hard clauses for this host — and every
   *  mega row is judged against it. Absent (overwrite mode, or no host known): no mega tab, since
   *  a placement-sensitive category cannot be offered placement-blind. */
  export let hostBody: MegaHost | null = null;

  const dispatch = createEventDispatcher();

  let allTemplates: CelestialBody[] = [];
  let q = '';                            // free-text search — matches name, description AND tags
  let expanded: string | null = null;    // which category facet is open
  let filters: string[] = [];            // active tag keys (ANDed, like Find by tag)
  let selectedTemplate: CelestialBody | null = null;

  // G53: THE MEGACONSTRUCTS TAB — the owner's original ask, on the picker the wheel was invented
  // for: "only appears on the picker under their own tab when available - options greyed out
  // otherwise." Same evaluator as everywhere else; no placement rule lives in this file.
  let activeTab: 'constructs' | 'mega' = 'constructs';
  $: megaTemplates = mode === 'create' && hostBody ? ((rulePack?.constructTemplates?.mega ?? []) as CelestialBody[]) : [];
  $: megaRows = megaTemplates.map((t) => {
    const def = megaTypeDef(t.megaType);
    return { template: t, def, hard: megaHardCheck(effectiveMegaRequires(t, def), hostBody!, t.explain ?? def?.explain) };
  });
  $: megaTabAvailable = megaRows.some((r) => r.hard.ok);
  $: if (!megaTabAvailable && activeTab === 'mega') activeTab = 'constructs';

  function switchTab(tab: 'constructs' | 'mega'): void {
    if (tab === activeTab) return;
    activeTab = tab;
    selectedTemplate = null;   // a hidden selection under the other tab would make Create a mystery
  }

  // The footer's honest numbers for a selected mega: derive() at defaults on THIS host.
  $: selectedMegaSummary = (() => {
    if (activeTab !== 'mega' || !selectedTemplate || !hostBody) return '';
    const def = megaTypeDef(selectedTemplate.megaType);
    if (!def) return '';
    return megaSummaryLine(def.derive(defaultMegaParams(def, hostBody as CelestialBody), hostBody as CelestialBody));
  })();

  $: cats = $coiCategories;
  $: activeCats = activeCoICategories(cats);
  $: engineMap = byId(rulePack?.engineDefinitions);   // for engine→drive inheritance display
  const label = (key: string) => coiTagLabel(key, cats);
  const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  onMount(() => {
    const flat: CelestialBody[] = [];
    if (rulePack?.constructTemplates) {
      for (const [key, list] of Object.entries(rulePack.constructTemplates)) {
        // G53: the mega category has ITS OWN TAB above (judged per-host); it never joins this
        // placement-blind flatten — in overwrite mode, or with no host known, it is simply absent,
        // because a placement-sensitive category cannot be offered placement-blind.
        if (key === 'mega') continue;
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

  // ONE search predicate for both tabs — two copies of "does the query match" would drift.
  const matchesQuery = (t: CelestialBody, query: string): boolean => {
    if (!query.trim()) return true;
    const s = query.trim().toLowerCase();
    const keys = tagKeys(t);
    return Boolean(
      t.name?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      keys.some((k) => k.toLowerCase().includes(s) || label(k).toLowerCase().includes(s))
    );
  };

  $: results = allTemplates.filter((t) => {
    const keys = new Set(tagKeys(t));
    if (!filters.every((f) => keys.has(f))) return false;          // must carry ALL active filter tags
    return matchesQuery(t, q);                                     // search spans names AND tags
  }).sort((a, b) => a.name.localeCompare(b.name));

  // The mega tab searches but does not facet — seven rows need no bubbles, and the facet counts
  // are built from the ordinary catalogue. Available rows list first, greyed ones after, so what
  // this host can take is never below the fold.
  $: megaResults = megaRows
    .filter((r) => matchesQuery(r.template, q))
    .sort((a, b) => Number(b.hard.ok) - Number(a.hard.ok) || a.template.name.localeCompare(b.template.name));

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
    <h2>{mode === 'create' ? (megaTabAvailable ? 'Create New Construct/Megaconstruct' : 'Create New Construct') : 'Load Construct Template'}</h2>
    {#if mode === 'overwrite'}
      <p class="warning">Warning: Overwrites current configuration.</p>
    {/if}

    {#if megaTabAvailable}
      <div class="tabs">
        <button class="tab" class:active={activeTab === 'constructs'} on:click={() => switchTab('constructs')}>Constructs</button>
        <button class="tab" class:active={activeTab === 'mega'} on:click={() => switchTab('mega')}>Megaconstructs</button>
      </div>
    {/if}

    <div class="filters-panel">
      <input class="search" type="text" placeholder="Search name or tag (e.g. Rocinante, shipyard, refuel)…" bind:value={q} />

      {#if activeTab === 'constructs'}
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
      {/if}
    </div>

    {#if activeTab === 'mega'}
    <!-- G53: judged against {hostBody.name} by the one evaluator. Available rows select and create;
         a greyed row states WHY in a sentence and stays final (relevance, §3.5). The portrait is
         DERIVED from the registry's shape() at defaults — the preview cannot disagree with the data. -->
    <div class="browser-window">
      {#if megaResults.length === 0}
        <div class="empty-msg">No megaconstructs match.</div>
      {/if}
      {#each megaResults as row (row.template.id || row.template.name)}
        <div class="browser-item mega {selectedTemplate === row.template ? 'selected' : ''} {row.hard.ok ? '' : 'unavailable'}"
             on:click={() => { if (row.hard.ok) selectedTemplate = row.template; }}
             on:dblclick={() => { if (row.hard.ok && selectedTemplate === row.template) handleLoad(); }}>
          <div class="preview-wrapper">
            {#if row.def && hostBody}
              <MegaPreview def={row.def} host={hostBody} color={row.template.icon_color || '#ffd24d'} />
            {:else}
              <div class="construct-icon {row.template.icon_type || 'triangle'}" style="background-color: {row.template.icon_color || '#ffd24d'}"></div>
            {/if}
          </div>
          <div class="file-info">
            <span class="name">{row.template.name}</span>
            {#if !row.hard.ok}
              <span class="mega-reason">{row.hard.reason}</span>
            {:else if row.template.description}
              <span class="mega-desc">{row.template.description}</span>
            {/if}
            <div class="tag-chips">
              {#each chipTags(row.template) as k}<span class="tag-chip" style="border-color:{catColor(k)}">{label(k)}</span>{/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
    {:else}
    <div class="browser-window">
      {#if results.length === 0}
        <div class="empty-msg">No constructs match.</div>
      {/if}
      {#each results as t (t.id || t.name)}
        {@const handSetDrive = (t.tags || []).some((x) => x.key.startsWith('drive/'))}
        {@const inheritedDrive = handSetDrive ? null : constructDriveTag(t, engineMap)}
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
              {#if inheritedDrive}<span class="tag-chip inherited" title="inherited from engines">{label(inheritedDrive)}</span>{/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
    {/if}

    <div class="footer">
      <div class="selected-info">
        {#if selectedTemplate}
          <strong>{selectedTemplate.name}</strong>
          <div class="stats">
            {#if selectedMegaSummary}
              {selectedMegaSummary}
            {:else}
              {roleLabel(selectedTemplate.roleHint || '')} •
              {((selectedTemplate.physical_parameters?.massKg || 0) / 1000).toLocaleString()}t •
              {selectedTemplate.systems?.power_plants?.[0]?.type || 'No Power'}
            {/if}
          </div>
        {:else if activeTab === 'mega'}
          <span class="placeholder">{megaResults.length} megaconstruct{megaResults.length === 1 ? '' : 's'} — select one…</span>
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

  /* G53: the Constructs / Megaconstructs tab bar. Present only when this host can take something. */
  .tabs { display: flex; gap: 2px; padding: 8px 15px 0; background-color: var(--bg-panel); }
  .tab {
    background: var(--bg-control); color: var(--text-muted); border: 1px solid var(--border-soft);
    border-bottom: none; border-radius: 6px 6px 0 0; padding: 6px 14px; font-size: 0.85em; cursor: pointer;
  }
  .tab.active { background: var(--bg-panel); color: var(--text); border-color: var(--border); font-weight: 600; }

  /* Mega rows: a derived portrait instead of the glyph square; greyed rows keep their sentence. */
  .browser-item.mega { align-items: center; }
  .browser-item.mega .preview-wrapper { width: 48px; margin-right: 12px; display: flex; justify-content: center; flex-shrink: 0; }
  .browser-item.mega.unavailable { opacity: 0.45; cursor: default; }
  .browser-item.mega.unavailable:hover { background-color: transparent; }
  .mega-reason { font-size: 0.76em; color: var(--text-muted); font-style: italic; }
  .mega-desc { font-size: 0.76em; color: var(--text-faint); }

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
  /* Inherited-from-hardware tag (e.g. the FTL drive from the engines) — dashed to read as derived. */
  .tag-chip.inherited { border-style: dashed; border-color: var(--accent, #c07f3f); font-style: italic; }
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

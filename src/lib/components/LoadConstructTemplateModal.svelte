<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { coiCategories, coiTagLabel } from '$lib/constructs/coi';

  export let rulePack: RulePack;
  export let mode: 'overwrite' | 'create' = 'overwrite';

  const dispatch = createEventDispatcher();

  let allTemplates: CelestialBody[] = [];
  let search = '';
  let selectedUniverse: string | null = null;   // a universe/* tag key
  let selectedRole: string | null = null;        // a roleHint value
  let selectedTemplate: CelestialBody | null = null;

  $: cats = $coiCategories;
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

  // Facet chips, derived from the templates' own tags. Universe = the new universe/* CoI; Role = roleHint.
  $: universes = Array.from(new Set(allTemplates.flatMap((t) => tagKeys(t).filter((k) => k.startsWith('universe/'))))).sort();
  $: roles = Array.from(new Set(allTemplates.map((t) => t.roleHint).filter(Boolean))) as string[];

  $: filtered = allTemplates.filter((t) => {
    if (selectedUniverse && !tagKeys(t).includes(selectedUniverse)) return false;
    if (selectedRole && t.roleHint !== selectedRole) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const inName = t.name?.toLowerCase().includes(q);
      const inDesc = t.description?.toLowerCase().includes(q);
      const inTags = tagKeys(t).some((k) => k.toLowerCase().includes(q) || label(k).toLowerCase().includes(q));
      if (!inName && !inDesc && !inTags) return false;
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Tags worth showing on a row: skip the universe (it's a facet) and status; lead with class then purpose.
  const chipTags = (t: CelestialBody): string[] => {
    const keys = tagKeys(t).filter((k) => !k.startsWith('universe/') && !k.startsWith('status/'));
    const rank = (k: string) => (k.startsWith('class/') ? 0 : k.startsWith('owner/') ? 1 : k.startsWith('purpose/') ? 2 : k.startsWith('resource/') ? 3 : 4);
    return keys.sort((a, b) => rank(a) - rank(b));
  };

  function toggleUniverse(k: string) { selectedUniverse = selectedUniverse === k ? null : k; }
  function toggleRole(r: string) { selectedRole = selectedRole === r ? null : r; }
  function clearFilters() { search = ''; selectedUniverse = null; selectedRole = null; }

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

    <!-- Filters: search by name/capability, then narrow by Universe + Role. -->
    <div class="filters">
      <input class="search" type="text" placeholder="Search name or capability (e.g. shipyard, refuel)…" bind:value={search} />
      <div class="chip-row">
        {#each universes as u}
          <button class="chip universe {selectedUniverse === u ? 'on' : ''}" on:click={() => toggleUniverse(u)}>{label(u)}</button>
        {/each}
      </div>
      <div class="chip-row">
        {#each roles as r}
          <button class="chip role {selectedRole === r ? 'on' : ''}" on:click={() => toggleRole(r)}>{roleLabel(r)}</button>
        {/each}
        {#if search || selectedUniverse || selectedRole}
          <button class="chip clear" on:click={clearFilters}>Clear</button>
        {/if}
      </div>
    </div>

    <div class="browser-window">
      {#if filtered.length === 0}
        <div class="empty-msg">No constructs match.</div>
      {/if}
      {#each filtered as t (t.id || t.name)}
        <div class="browser-item {selectedTemplate === t ? 'selected' : ''}"
             on:click={() => (selectedTemplate = t)}
             on:dblclick={handleLoad}>
          <div class="icon-wrapper">
            <div class="construct-icon {t.icon_type || 'triangle'}" style="background-color: {t.icon_color || '#ffd24d'}"></div>
          </div>
          <div class="file-info">
            <span class="name">{t.name}</span>
            <div class="tag-chips">
              {#each chipTags(t) as k}<span class="tag-chip">{label(k)}</span>{/each}
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
          <span class="placeholder">{filtered.length} construct{filtered.length === 1 ? '' : 's'} — select one…</span>
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
    display: flex; flex-direction: column; width: 640px; height: 560px;
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

  /* Filters */
  .filters {
    padding: 10px 15px; background-color: var(--bg-panel);
    border-bottom: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 8px;
  }
  .search {
    width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 5px;
    border: 1px solid var(--border); background: var(--bg-control); color: var(--text); font-size: 0.9em;
  }
  .search:focus { outline: none; border-color: var(--accent); }
  .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border);
    background: var(--bg-control); color: var(--text-muted); font-size: 0.78em; cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }
  .chip:hover { background: var(--bg-control-hover); }
  .chip.universe.on { background: #7a6a9a; border-color: #7a6a9a; color: #fff; }
  .chip.role.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .chip.clear { color: var(--text-faint); border-style: dashed; }

  /* List */
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

  /* Footer */
  .footer {
    padding: 15px; background-color: var(--bg-panel); border-top: 1px solid var(--border-soft);
    display: flex; justify-content: space-between; align-items: center;
  }
  .selected-info { display: flex; flex-direction: column; text-align: left; font-size: 0.9em; max-width: 60%; }
  .selected-info .stats { color: var(--text-muted); font-size: 0.85em; }
  .placeholder { color: var(--text-faint); font-style: italic; }
  .buttons { display: flex; gap: 10px; }
  button { padding: 8px 16px; border-radius: 4px; cursor: pointer; border: none; font-size: 0.9em; }
  button.secondary { background-color: var(--bg-control); color: var(--text-muted); }
  button.secondary:hover { background-color: var(--bg-control-hover); }
  button.primary { background-color: var(--accent); color: white; }
  button.primary:hover { background-color: #0056b3; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

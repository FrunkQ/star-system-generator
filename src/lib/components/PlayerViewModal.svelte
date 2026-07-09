<script lang="ts">
  // Unified Player View — preset manager (design doc step 3). A clean card grid of player presets
  // (shipped built-ins + the campaign's own, saved on the starmap), with a simple detail/edit pane.
  // The full look-editor (live holo preview + every look control) is the next increment; this covers
  // the preset-level fields + create/duplicate/delete + the one-time localStorage migration.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { PlayerPreset, ViewModule } from '$lib/player/presetTypes';
  import { DEFAULT_PRESET, makePresetId } from '$lib/player/presets';
  import {
    playerPresetList, addPreset, updatePreset, deletePreset, duplicateIntoStarmap, runPresetMigration
  } from '$lib/player/presetStore';
  import { get } from 'svelte/store';
  import PlayerPresetEditor from './PlayerPresetEditor.svelte';

  let editing: PlayerPreset | null = null;

  const dispatch = createEventDispatcher();

  let selectedId: string | null = null;
  $: presets = $playerPresetList;
  $: selected = presets.find((p) => p.id === selectedId) ?? null;
  $: editable = !!selected && !selected.builtIn;

  onMount(() => {
    runPresetMigration(); // fold any legacy localStorage holo presets into this campaign, once
    selectedId = presets[0]?.id ?? null;
  });

  const VIEW_LABELS: Record<ViewModule, string> = { list: 'Text list', diagram2d: '2D map', holo3d: '3D holo' };

  function newPreset() {
    const existing = get(playerPresetList).map((p) => p.id);
    const id = makePresetId('New preset', existing);
    const p: PlayerPreset = { ...structuredClone(DEFAULT_PRESET), id, name: 'New preset', description: '', builtIn: false };
    addPreset(p);
    selectedId = id;
  }
  function duplicate(p: PlayerPreset) {
    const copy = duplicateIntoStarmap(p);
    if (copy) selectedId = copy.id;
  }
  function remove(p: PlayerPreset) {
    deletePreset(p.id);
    selectedId = get(playerPresetList)[0]?.id ?? null;
  }
  // Persist an edit to a campaign preset (built-ins are read-only — duplicate to edit).
  function patch(changes: Partial<PlayerPreset>) {
    if (!selected || selected.builtIn) return;
    updatePreset({ ...selected, ...changes });
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-bg" on:click={() => dispatch('close')}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" on:click|stopPropagation>
    <header>
      <h2>Player View presets</h2>
      <p class="lede">One tool for every player-facing view — guides, tables, projections. Pick a preset,
        duplicate it, and make it your own. Presets are saved with this campaign.</p>
    </header>

    <div class="body">
      <div class="grid" role="listbox" aria-label="Presets">
        {#each presets as p (p.id)}
          <button
            class="card"
            class:sel={p.id === selectedId}
            class:gm={p.followGM}
            role="option"
            aria-selected={p.id === selectedId}
            on:click={() => (selectedId = p.id)}
          >
            <span class="swatch" style="background:{p.accentColor}"></span>
            <span class="name">{p.name}</span>
            <span class="desc">{p.description || VIEW_LABELS[p.systemView]}</span>
            <span class="tags">
              {#if p.builtIn}<span class="tag built">Built-in</span>{/if}
              {#if p.followGM}<span class="tag gmtag">GM-driven</span>{/if}
              <span class="tag">{VIEW_LABELS[p.systemView]}</span>
            </span>
          </button>
        {/each}
        <button class="card add" on:click={newPreset}>+ New preset</button>
      </div>

      {#if selected}
        <aside class="detail">
          <div class="det-head">
            <h3>{selected.name}</h3>
            {#if selected.builtIn}<span class="ro">Read-only · duplicate to edit</span>{/if}
          </div>

          <label>Name
            <input type="text" value={selected.name} disabled={!editable} on:input={(e) => patch({ name: (e.currentTarget as HTMLInputElement).value })} />
          </label>
          <label>Description
            <input type="text" value={selected.description} disabled={!editable} on:input={(e) => patch({ description: (e.currentTarget as HTMLInputElement).value })} />
          </label>
          <label>System view
            <select value={selected.systemView} disabled={!editable} on:change={(e) => patch({ systemView: (e.currentTarget as HTMLSelectElement).value as ViewModule })}>
              <option value="list">Text list</option>
              <option value="diagram2d">2D map</option>
              <option value="holo3d">3D holo</option>
            </select>
          </label>
          <label>Accent colour
            <input type="color" value={selected.accentColor} disabled={!editable} on:input={(e) => patch({ accentColor: (e.currentTarget as HTMLInputElement).value })} />
          </label>
          <label class="chk"><input type="checkbox" checked={selected.followGM} disabled={!editable} on:change={(e) => patch({ followGM: (e.currentTarget as HTMLInputElement).checked })} /> Follows the GM (projection-style, read-only for players)</label>
          <label class="chk"><input type="checkbox" checked={selected.interactive} disabled={!editable} on:change={(e) => patch({ interactive: (e.currentTarget as HTMLInputElement).checked })} /> Players can click / focus / scrub</label>

          <div class="det-actions">
            {#if editable}<button class="primary" on:click={() => (editing = selected)}>Edit look…</button>{/if}
            <button on:click={() => duplicate(selected)}>Duplicate</button>
            {#if editable}<button class="danger" on:click={() => remove(selected)}>Delete</button>{/if}
          </div>
          <p class="soon">Edit a preset to open the live look editor (filters, grid, wireframe, framing). Cover page + graphics land next.</p>
        </aside>
      {/if}
    </div>

    <footer>
      <button on:click={() => dispatch('close')}>Close</button>
    </footer>
  </div>
</div>

{#if editing}
  <PlayerPresetEditor preset={editing} on:close={() => (editing = null)} />
{/if}

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2000; }
  .modal { background: var(--bg-panel); color: var(--text); padding: 1.4rem; border-radius: 8px; width: 860px; max-width: 96vw; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; }
  header h2 { margin: 0 0 0.3rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
  .lede { margin: 0; font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; }
  .body { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; min-height: 0; overflow: hidden; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; overflow-y: auto; padding-right: 4px; align-content: start; }
  .card { display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 10px; cursor: pointer; position: relative; }
  .card.sel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .card.gm { border-left: 3px solid #e0a13a; }
  .card .swatch { width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,0.15) inset; }
  .card .name { font-weight: 700; font-size: 0.92rem; }
  .card .desc { font-size: 0.72rem; color: var(--text-muted); line-height: 1.35; min-height: 1.9em; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  .tag { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; }
  .tag.built { color: #7fb0ff; border-color: #395f9a; }
  .tag.gmtag { color: #e0a13a; border-color: #7a5a20; }
  .card.add { align-items: center; justify-content: center; min-height: 90px; color: var(--text-muted); font-weight: 600; border-style: dashed; }
  .detail { display: flex; flex-direction: column; gap: 0.55rem; overflow-y: auto; border-left: 1px solid var(--border); padding-left: 1rem; }
  .det-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .det-head h3 { margin: 0; }
  .ro { font-size: 0.68rem; color: var(--text-muted); }
  .detail label { display: flex; flex-direction: column; gap: 3px; font-size: 0.75rem; color: var(--text-muted); }
  .detail label.chk { flex-direction: row; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: var(--text); }
  .detail input[type=text], .detail select { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; font: inherit; }
  .det-actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
  .det-actions button { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 6px 12px; cursor: pointer; font: inherit; }
  .det-actions button.danger { color: #ff8080; border-color: #7a2f2f; }
  .det-actions button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .soon { font-size: 0.7rem; color: var(--text-muted); font-style: italic; margin: 0.3rem 0 0; }
  footer { display: flex; justify-content: flex-end; }
  footer button { padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: var(--bg-control); color: var(--text); font: inherit; }
</style>

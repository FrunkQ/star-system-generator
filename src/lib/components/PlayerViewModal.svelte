<script lang="ts">
  // Unified Player View — preset PICKER (replaces the Field Guide modal once parity lands). Left: the
  // preset card grid. Right: the SELECTED preset's summary with Edit/Duplicate/Delete, plus the
  // quick live-session overrides (Follow GM / disable filter / disable view orbit) — momentary, never
  // saved into the preset. All design work happens in the wizard editor (PlayerPresetEditor).
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import QRCode from 'qrcode';
  import { broadcastService } from '$lib/broadcast';
  import { measurementUnit, temperatureUnit } from '$lib/stores';
  import type { PlayerPreset, ViewModule } from '$lib/player/presetTypes';
  import { DEFAULT_PRESET, makePresetId } from '$lib/player/presets';
  import {
    playerPresetList, addPreset, deletePreset, duplicateIntoStarmap, runPresetMigration
  } from '$lib/player/presetStore';
  import { liveOverrides } from '$lib/player/liveOverrides';
  import PlayerPresetEditor from './PlayerPresetEditor.svelte';

  export let sessionId: string | null = null;

  const dispatch = createEventDispatcher();

  // Share/open the SELECTED preset — the catalogue reads ?preset=<id> and drives the whole view.
  let origin = '';
  let qrDataUrl = '';
  let copied = false;
  $: shareUrl = selected
    ? `${origin}/catalogue?sid=${sessionId ?? ''}&preset=${selected.id}&units=${$measurementUnit}&temp=${$temperatureUnit}`
    : '';
  $: if (browser && shareUrl) {
    QRCode.toDataURL(shareUrl, { margin: 1, width: 220, color: { dark: '#0a0d14', light: '#ffffff' } })
      .then((d) => (qrDataUrl = d)).catch(() => (qrDataUrl = ''));
  }
  function openWindow() {
    if (shareUrl) window.open(shareUrl, 'StarSystemPlayerView', 'width=520,height=900,menubar=no,toolbar=no,location=no');
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* blocked */ }
  }

  let selectedId: string | null = null;
  let editing: PlayerPreset | null = null;
  $: presets = $playerPresetList;
  $: selected = presets.find((p) => p.id === selectedId) ?? null;
  $: editable = !!selected && !selected.builtIn;

  onMount(() => {
    runPresetMigration(); // fold any legacy localStorage holo presets into this campaign, once
    selectedId = presets[0]?.id ?? null;
    if (browser) origin = window.location.origin;
    broadcastService.enableRemote(); // sharing intent: allow cross-device players to connect
  });

  const VIEW_LABELS: Record<ViewModule, string> = { list: 'Text list', diagram2d: '2D map', holo3d: '3D holo' };
  const FILTER_LABELS: Record<string, string> = { none: 'None', crt: 'CRT Terminal', night_vision: 'Night Vision', thermal: 'Thermal' };

  function newPreset() {
    const existing = get(playerPresetList).map((p) => p.id);
    const id = makePresetId('New preset', existing);
    const p: PlayerPreset = { ...structuredClone(DEFAULT_PRESET), id, name: 'New preset', description: '', builtIn: false };
    addPreset(p);
    selectedId = id;
    editing = p; // straight into the wizard
  }
  function duplicate(p: PlayerPreset) {
    const copy = duplicateIntoStarmap(p);
    if (copy) selectedId = copy.id;
  }
  function remove(p: PlayerPreset) {
    deletePreset(p.id);
    selectedId = get(playerPresetList)[0]?.id ?? null;
  }
  // Summary of what the preset shows: cover / starmap / system, with view modules.
  function stages(p: PlayerPreset): string {
    const parts: string[] = [];
    if (p.cover.enabled) parts.push('Cover');
    if (p.starmapEnabled) parts.push(`Starmap (${VIEW_LABELS[p.starmapView]})`);
    if (p.systemEnabled) parts.push(`System (${VIEW_LABELS[p.systemView]})`);
    return parts.join(' · ') || 'Nothing enabled';
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-bg" on:click={() => dispatch('close')}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" on:click|stopPropagation>
    <header>
      <h2>Player Views</h2>
      <p class="lede">One tool for every player-facing view — guides, tables, projections. Pick a preset,
        duplicate it, and make it your own in the editor. Presets are saved with this campaign.</p>
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
            {#if selected.builtIn}<span class="ro">Built-in · duplicate to edit</span>{/if}
          </div>
          {#if selected.description}<p class="det-desc">{selected.description}</p>{/if}

          <dl class="summary">
            <dt>Stages</dt><dd>{stages(selected)}</dd>
            <dt>Filter</dt><dd>{FILTER_LABELS[selected.filter] ?? selected.filter}</dd>
            <dt>Driver</dt><dd>{selected.followGM ? 'Follows the GM' : 'Player-driven'}{selected.interactive ? ' · interactive' : ' · display only'}</dd>
          </dl>

          <div class="det-actions">
            <button class="primary" on:click={openWindow}>Open player view</button>
            {#if editable}<button on:click={() => (editing = selected)}>Edit…</button>{/if}
            <button on:click={() => duplicate(selected)}>Duplicate</button>
            {#if editable}<button class="danger" on:click={() => remove(selected)}>Delete</button>{/if}
          </div>

          <div class="share">
            {#if qrDataUrl}<img class="qr" src={qrDataUrl} alt="QR code to open this preset" />{/if}
            <div class="share-col">
              <span class="ov-head">Share with players</span>
              <p class="share-hint">Players scan the code or open the link — it opens this preset live. Keep this app running.</p>
              <button on:click={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
          </div>

          <div class="overrides">
            <span class="ov-head">Quick overrides <span class="ov-sub">live session only — never saved</span></span>
            <label class="chk">
              <input type="checkbox" checked={$liveOverrides.followGM ?? selected.followGM}
                on:change={(e) => liveOverrides.update((o) => ({ ...o, followGM: (e.currentTarget as HTMLInputElement).checked }))} />
              Follow GM
            </label>
            <label class="chk">
              <input type="checkbox" checked={$liveOverrides.filterBypass}
                on:change={(e) => liveOverrides.update((o) => ({ ...o, filterBypass: (e.currentTarget as HTMLInputElement).checked }))} />
              Suspend visual filter
            </label>
            <label class="chk">
              <input type="checkbox" checked={$liveOverrides.orbitPaused}
                on:change={(e) => liveOverrides.update((o) => ({ ...o, orbitPaused: (e.currentTarget as HTMLInputElement).checked }))} />
              Pause auto view-orbit
            </label>
          </div>
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
  .modal { background: var(--bg-panel); color: var(--text); padding: 1.4rem; border-radius: 8px; width: 880px; max-width: 96vw; max-height: 92vh; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; }
  header h2 { margin: 0 0 0.3rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
  .lede { margin: 0; font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; }
  .body { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; min-height: 0; overflow: hidden; }
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
  .detail { display: flex; flex-direction: column; gap: 0.65rem; overflow-y: auto; border-left: 1px solid var(--border); padding-left: 1rem; }
  .det-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .det-head h3 { margin: 0; }
  .ro { font-size: 0.68rem; color: var(--text-muted); }
  .det-desc { margin: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 0.76rem; }
  .summary dt { color: var(--text-muted); }
  .summary dd { margin: 0; }
  .det-actions { display: flex; gap: 0.5rem; }
  .det-actions button { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 6px 12px; cursor: pointer; font: inherit; }
  .det-actions button.danger { color: #ff8080; border-color: #7a2f2f; }
  .det-actions button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .share { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; }
  .qr { width: 92px; height: 92px; border-radius: 5px; background: #fff; flex: 0 0 auto; }
  .share-col { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .share-hint { margin: 0; font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; }
  .share-col button { align-self: flex-start; background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 5px 11px; cursor: pointer; font: inherit; }
  .overrides { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin-top: 0.2rem; }
  .ov-head { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .ov-sub { text-transform: none; letter-spacing: 0; font-style: italic; opacity: 0.8; }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; }
  footer { display: flex; justify-content: flex-end; }
  footer button { padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: var(--bg-control); color: var(--text); font: inherit; }
</style>

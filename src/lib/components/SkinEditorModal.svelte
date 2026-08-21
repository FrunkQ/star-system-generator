<script lang="ts">
  // G34: build-your-own skins. A custom skin = a NAME, a BASE built-in look, and colour
  // overrides for the curated chrome tokens below. Edits apply LIVE (the store re-injects the
  // stylesheet), so the app behind the dialog is the preview. Per device, like every skin.
  // Colour-as-information (body types, zones, hazards) is deliberately not offered here —
  // single-token surgery on those lives at /palette (UI-C10).
  import { createEventDispatcher } from 'svelte';
  import { foreground } from '$lib/ui/foreground';
  import {
    skin, customSkins, SKINS, createCustomSkin, updateCustomSkin, deleteCustomSkin, customSkinFor,
    type BuiltinSkinId, type CustomSkin
  } from '$lib/styles/skinStore';

  const dispatch = createEventDispatcher();

  // The curated palette a skin is made of — chrome only, grouped the way the screen reads.
  const FIELDS: { token: string; label: string }[] = [
    { token: '--bg-app', label: 'App background' },
    { token: '--bg-rail', label: 'Left rail' },
    { token: '--bg-side', label: 'Right panel' },
    { token: '--bg-panel', label: 'Panels & popups' },
    { token: '--bg-card', label: 'Info cards' },
    { token: '--bg-control', label: 'Buttons & inputs' },
    { token: '--border', label: 'Borders' },
    { token: '--text', label: 'Text' },
    { token: '--text-muted', label: 'Muted text' },
    { token: '--accent', label: 'Accent' },
    { token: '--accent-hover', label: 'Accent (hover)' },
    { token: '--link', label: 'Links' }
  ];

  let editingId: string | null = null;
  $: editing = editingId ? ($customSkins.find((s) => s.id === editingId) ?? null) : null;

  // Start from whatever is on screen: a selected custom skin opens for editing; a built-in
  // becomes the base of a fresh one.
  function newSkin() {
    const current = customSkinFor($skin, $customSkins);
    const base: BuiltinSkinId = current ? current.base : (SKINS.some((s) => s.id === $skin) ? ($skin as BuiltinSkinId) : 'modern');
    const id = createCustomSkin('My skin', base);
    editingId = id;
    skin.set(`custom:${id}`); // wear it while editing — the app IS the preview
  }

  // The colour the app is showing for a token right now (override if set, else the base's value).
  function effective(s: CustomSkin, token: string): string {
    const ov = s.tokens[token];
    if (ov) return ov;
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : expandHex(v) ?? '#000000';
  }
  function expandHex(v: string): string | null {
    const m = /^#([0-9a-fA-F]{3})$/.exec(v);
    return m ? '#' + m[1].split('').map((c) => c + c).join('') : null;
  }

  function setColour(s: CustomSkin, token: string, value: string) {
    updateCustomSkin(s.id, { tokens: { ...s.tokens, [token]: value } });
  }
  function resetColour(s: CustomSkin, token: string) {
    const next = { ...s.tokens };
    delete next[token];
    updateCustomSkin(s.id, { tokens: next });
  }
  function rebase(s: CustomSkin, base: BuiltinSkinId) {
    updateCustomSkin(s.id, { base });
  }
  function remove(s: CustomSkin) {
    if (!confirm(`Delete the skin "${s.name}"? This only affects this device.`)) return;
    if (editingId === s.id) editingId = null;
    deleteCustomSkin(s.id);
  }
</script>

<div class="modal-backdrop" on:click={() => dispatch('close')} use:foreground>
  <div class="modal" on:click|stopPropagation>
    <div class="head">
      <h3>Skin editor</h3>
      <button class="close" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>
    <p class="hint">Your own looks for this device. Edits apply live — the app behind this dialog is the preview. Meaningful colours (body types, zones, hazards) never move with a skin; tune single tokens at /palette.</p>

    <div class="list">
      {#each $customSkins as s (s.id)}
        <div class="row" class:active={editingId === s.id}>
          <button class="pick" title="Wear and edit this skin" on:click={() => { editingId = s.id; skin.set(`custom:${s.id}`); }}>{s.name}</button>
          <span class="base">on {SKINS.find((b) => b.id === s.base)?.name}</span>
          <button class="del" title="Delete this skin" on:click={() => remove(s)}>✕</button>
        </div>
      {/each}
      <button class="new" on:click={newSkin}>+ New skin (starts from the current look)</button>
    </div>

    {#if editing}
      <div class="editor">
        <div class="field name-row">
          <label for="skin-name">Name</label>
          <input id="skin-name" type="text" maxlength="40" value={editing.name}
            on:change={(e) => updateCustomSkin(editing.id, { name: e.currentTarget.value })} />
          <label for="skin-base">Base</label>
          <select id="skin-base" value={editing.base} on:change={(e) => rebase(editing, e.currentTarget.value)}>
            {#each SKINS as b}<option value={b.id}>{b.name}</option>{/each}
          </select>
        </div>
        <div class="swatches">
          {#each FIELDS as f (f.token)}
            <div class="swatch" class:overridden={f.token in editing.tokens}>
              <input type="color" value={effective(editing, f.token)}
                on:input={(e) => setColour(editing, f.token, e.currentTarget.value)} />
              <span class="sw-label">{f.label}</span>
              {#if f.token in editing.tokens}
                <button class="sw-reset" title="Back to the base skin's colour" on:click={() => resetColour(editing, f.token)}>↺</button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <p class="hint dim">Pick a skin above to edit it, or create a new one.</p>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0; z-index: var(--z-modal, 3000);
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md, 8px);
    width: min(560px, 94vw); max-height: 86vh; overflow-y: auto; padding: 14px 16px;
  }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .head h3 { margin: 0; }
  .close { background: none; border: none; color: var(--text-muted); font-size: 1.3em; cursor: pointer; }
  .close:hover { color: var(--text); }
  .hint { font-size: 0.82em; color: var(--text-muted); margin: 6px 0 10px; }
  .hint.dim { color: var(--text-faint); }

  .list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .row .pick {
    flex: 1; text-align: left; background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: var(--radius-sm, 4px); padding: 5px 8px; cursor: pointer;
  }
  .row.active .pick { border-color: var(--accent); color: var(--accent); }
  .row .base { font-size: 0.78em; color: var(--text-faint); white-space: nowrap; }
  .row .del { background: none; border: none; color: var(--text-faint); cursor: pointer; }
  .row .del:hover { color: var(--status-bad, #f44336); }
  .new {
    background: none; border: 1px dashed var(--border); border-radius: var(--radius-sm, 4px);
    color: var(--text-muted); padding: 6px 8px; cursor: pointer; text-align: left;
  }
  .new:hover { color: var(--accent); border-color: var(--accent); }

  .name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .name-row label { font-size: 0.82em; color: var(--text-muted); }
  .name-row input[type='text'] { flex: 1; min-width: 0; }

  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .swatch {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-control); border: 1px solid var(--border-soft);
    border-radius: var(--radius-sm, 4px); padding: 4px 6px;
  }
  .swatch.overridden { border-color: var(--accent); }
  .swatch input[type='color'] {
    width: 26px; height: 22px; padding: 0; border: none; background: none; cursor: pointer; flex: 0 0 auto;
  }
  .sw-label { font-size: 0.78em; color: var(--text); flex: 1; }
  .sw-reset { background: none; border: none; color: var(--text-muted); cursor: pointer; flex: 0 0 auto; }
  .sw-reset:hover { color: var(--accent); }
</style>

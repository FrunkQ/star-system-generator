<script lang="ts">
  // G16 — the ONE "Background & Overlay" control group for the picture behind the stars. The owner's
  // words: "these are alternative and managed on Background & Overlay on the 2D/3D maps." So the same
  // group authors what the GM 2D map, the player 2D map, the 3D map's plane and the starmap document
  // all show, because they all read one MapBackground off the campaign.
  //
  // THE CONTROL SET CHANGES SHAPE WITH THE ATTACHMENT, and that is not a tidiness choice. Screen-fixed
  // is decoration: a size percentage and a fade. Map-fixed is GEOREFERENCING: a width in the
  // campaign's OWN distance unit, an offset in that unit, and a rotation — because you cannot
  // register a scanned sector map without being able to place and turn it. Showing a "size %" beside
  // a georeferenced image would be inviting the GM to break registration with a cosmetic slider.
  import { createEventDispatcher, tick } from 'svelte';
  import type { MapBackground, Starmap } from '$lib/types';
  import type { PlayerAsset } from '$lib/player/presetTypes';
  import { normaliseMapBackground, suggestAnchor, DEFAULT_BACKGROUND_CREDIT } from '$lib/map/mapBackground';
  import { campaignUnit } from '$lib/map/distanceUnits';
  // THE SAME UPLOAD PATH THE PLAYER-VIEWS LIBRARY USES - one store, not a second one. Sending a GM to
  // another modal to fetch a picture for the control they are already looking at is the kind of errand
  // that makes a feature feel unfinished; the asset still lands in the shared library, so it is
  // immediately placeable on a cover or an overlay too.
  import { addAssetFromFile, BACKGROUND_MAX_PX } from '$lib/player/presetStore';

  export let starmap: Starmap | null = null;
  export let background: MapBackground | null | undefined = null;
  /** Uploaded images available to place. The GM uploads them in Player Views; the list is shared. */
  export let assets: PlayerAsset[] = [];
  /** Disabled with a reason — the print/invert display forces the background off. */
  export let disabledReason = '';

  const dispatch = createEventDispatcher<{ change: MapBackground; align: MapBackground }>();

  $: bg = normaliseMapBackground(background);
  $: unit = campaignUnit(starmap);
  $: chosen = bg.source === 'asset' ? assets.find((a) => a.id === bg.assetId) ?? null : null;

  function patch(changes: Partial<MapBackground>) {
    dispatch('change', normaliseMapBackground({ ...bg, ...changes }));
  }

  // Choosing an image for the first time lands it OVER the charted systems. A GM who picks a sector
  // map and sees nothing — because the stored width happened to be a hundredth of their map — reads
  // the feature as broken rather than as unplaced.
  function chooseAsset(assetId: string) {
    if (!assetId) { patch({ source: 'default', assetId: undefined }); return; }
    const fresh = bg.source !== 'asset' || bg.assetId !== assetId;
    patch({ source: 'asset', assetId, ...(fresh ? suggestAnchor(starmap) : {}) });
  }

  async function setSource(source: MapBackground['source']) {
    if (source === 'asset') {
      const known = bg.assetId && assets.some((a) => a.id === bg.assetId) ? bg.assetId : assets[0]?.id;
      if (known) { chooseAsset(known); return; }
      // NOTHING UPLOADED YET, so "your own image" means "choose a file" rather than a dead option.
      patch({ source: 'asset', assetId: undefined });
      await tick(); // the file input only exists once the asset row has rendered
      fileInput?.click();
      return;
    }
    patch({ source });
  }

  // Re-fit an already-placed image to the systems, for a GM who has moved it somewhere they cannot
  // find. Cheap to offer and it is the "I have lost it" escape hatch every free placement needs.
  function refit() { patch(suggestAnchor(starmap)); }

  const numOf = (e: Event, fallback: number) => {
    const v = parseFloat((e.currentTarget as HTMLInputElement).value);
    return Number.isFinite(v) ? v : fallback;
  };

  // Upload straight from here. A BACKGROUND is kept at the larger cap without asking, because that is
  // the only thing this control can be uploading - the choice only has to be made in the general
  // library, where the same file might be a corner logo.
  let fileInput: HTMLInputElement;
  let uploading = false;
  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = ''; // so re-picking the same file fires again
    if (!f) return;
    uploading = true;
    addAssetFromFile(f, f.name.replace(/\.[a-z0-9]+$/i, ''), (a) => {
      uploading = false;
      if (a) chooseAsset(a.id); // land it over the systems and select it, in one step
    }, BACKGROUND_MAX_PX);
  }
</script>

<div class="mbg" class:disabled={!!disabledReason}>
  <div class="form-group">
    <label for="mbg-source">Background image</label>
    <select id="mbg-source" value={bg.source} disabled={!!disabledReason}
      on:change={(e) => setSource((e.currentTarget as HTMLSelectElement).value as MapBackground['source'])}>
      <option value="none">None (plain space)</option>
      <option value="default">Milky Way (shipped)</option>
      <option value="asset">Your own image&hellip;</option>
    </select>
  </div>

  {#if bg.source === 'asset'}
    <div class="form-group">
      <label for="mbg-asset">Image</label>
      <div class="mbg-pick">
        <select id="mbg-asset" value={bg.assetId ?? ''} disabled={!!disabledReason || !assets.length}
          on:change={(e) => chooseAsset((e.currentTarget as HTMLSelectElement).value)}>
          {#if !assets.length}<option value="">Nothing uploaded yet</option>{/if}
          {#each assets as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </select>
        <button type="button" class="mbg-upload" disabled={!!disabledReason || uploading}
          on:click={() => fileInput?.click()}>{uploading ? 'Reading…' : 'Upload…'}</button>
      </div>
      <input type="file" accept="image/*" bind:this={fileInput} on:change={onPick} hidden />
      {#if chosen && !chosen.credit}
        <p class="section-hint">
          No credit recorded. If you did not draw it, add one in Player Views &mdash; the save bundle
          lists it, and a CC-BY image needs its author named.
        </p>
      {/if}
    </div>
  {/if}

  {#if bg.source !== 'none'}
    <div class="form-group">
      <label for="mbg-attach">Attachment</label>
      <select id="mbg-attach" value={bg.attach} disabled={!!disabledReason}
        on:change={(e) => patch({ attach: (e.currentTarget as HTMLSelectElement).value as 'screen' | 'map' })}>
        <option value="screen">Fixed to the screen (decoration)</option>
        <option value="map">Fixed to the map (sector map, borders)</option>
      </select>
      <p class="section-hint">
        {#if bg.attach === 'map'}
          A system keeps the same spot on the picture at any zoom &mdash; here and on player views.
        {:else}
          The picture holds still while the stars move over it.
        {/if}
      </p>
    </div>

    {#if bg.attach === 'map'}
      <!-- PLACEMENT IS A VISUAL JUDGEMENT, so the primary control is not here. This dialog covers the
           map, and lining a drawn coastline up with the stars it was drawn around cannot be done
           blind. The button hands over to the align strip, which sits ON the map with live sliders.
           The typed numbers stay available underneath for a GM transcribing a known scale. -->
      <div class="form-group">
        <button type="button" class="mbg-align" disabled={!!disabledReason} on:click={() => dispatch('align', bg)}>
          Align &amp; scale on the map&hellip;
        </button>
        <p class="section-hint">Sliders over the live map; Done brings you back.</p>
      </div>
      <details class="mbg-numbers">
        <summary>Type exact values</summary>
        <div class="form-group">
          <label for="mbg-width">Image width ({unit})</label>
          <input id="mbg-width" type="number" min="0.01" step="any" disabled={!!disabledReason}
            value={bg.widthUnits} on:change={(e) => patch({ widthUnits: numOf(e, bg.widthUnits) })} />
          <p class="section-hint">Height follows the picture's own shape.</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="mbg-ox">Centre X ({unit})</label>
            <input id="mbg-ox" type="number" step="any" disabled={!!disabledReason}
              value={bg.offsetX} on:change={(e) => patch({ offsetX: numOf(e, bg.offsetX) })} />
          </div>
          <div class="form-group">
            <label for="mbg-oy">Centre Y ({unit})</label>
            <input id="mbg-oy" type="number" step="any" disabled={!!disabledReason}
              value={bg.offsetY} on:change={(e) => patch({ offsetY: numOf(e, bg.offsetY) })} />
          </div>
        </div>
        <div class="form-group">
          <label for="mbg-rot">Rotation <span class="val">{Math.round(bg.rotationDeg)}&deg;</span></label>
          <input id="mbg-rot" type="range" min="-180" max="180" step="1" disabled={!!disabledReason}
            value={bg.rotationDeg} on:input={(e) => patch({ rotationDeg: numOf(e, bg.rotationDeg) })} />
  
        </div>
        <button type="button" class="mbg-refit" disabled={!!disabledReason} on:click={refit}>
          Fit to charted systems
        </button>
      </details>
    {:else}
      <div class="form-group">
        <label for="mbg-size">Size <span class="val">{bg.sizePct}%</span></label>
        <input id="mbg-size" type="range" min="20" max="100" step="1" disabled={!!disabledReason}
          value={bg.sizePct} on:input={(e) => patch({ sizePct: numOf(e, bg.sizePct) })} />

      </div>
    {/if}

    <div class="form-group">
      <label for="mbg-fade">Fade <span class="val">{Math.round((1 - bg.opacity) * 100)}%</span></label>
      <input id="mbg-fade" type="range" min="0" max="0.95" step="0.05" disabled={!!disabledReason}
        value={1 - bg.opacity} on:input={(e) => patch({ opacity: 1 - numOf(e, 1 - bg.opacity) })} />
      <p class="section-hint">How far the picture sits back behind the stars.</p>
    </div>

    {#if bg.source === 'default'}
      <p class="section-hint credit">Credit: {DEFAULT_BACKGROUND_CREDIT}.</p>
    {/if}
  {/if}

  {#if disabledReason}
    <p class="section-hint">{disabledReason}</p>
  {/if}
</div>

<style>
  /* THIS GROUP STYLES ITSELF, and it has to: Svelte scopes CSS per component, so the host dialog's
     `.form-group` / `.section-hint` / `input` / `select` rules never reach these elements. Relying on
     them left every field at browser-default size with full paragraph margins, which is what made the
     section read as crowded. The look below deliberately MATCHES the dialog around it - same tokens,
     same shapes - only tighter, because this is one group among many rather than a page of its own. */
  .mbg { font-size: 0.85rem; }
  .mbg.disabled { opacity: 0.55; }

  .mbg .form-group { margin-bottom: 9px; }
  .mbg label {
    display: block;
    margin-bottom: 3px;
    color: var(--text-muted, #9aa3b2);
    font-size: 0.85em;
  }
  .mbg select,
  .mbg input[type='number'] {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border, #2a2f3a);
    border-radius: 3px;
    color: var(--text, #dfe6f0);
    font: inherit;
  }
  .mbg input[type='range'] { width: 100%; margin: 2px 0 0; accent-color: var(--accent, #ff5a1f); }
  .mbg .section-hint {
    margin: 3px 0 0;
    color: var(--text-faint, #8a8f9a);
    font-size: 0.78em;
    line-height: 1.35;
  }

  .form-row { display: flex; gap: 8px; }
  .form-row .form-group { flex: 1; min-width: 0; }
  .val { opacity: 0.7; font-weight: normal; float: right; }

  /* Picker + its upload button on ONE line: the button is an alternative to the list beside it, and
     stacking them reads as two unrelated controls. */
  .mbg-pick { display: flex; gap: 6px; align-items: stretch; }
  .mbg-pick select { flex: 1; min-width: 0; }
  .mbg-upload {
    flex: 0 0 auto; padding: 4px 9px; border: 1px solid var(--border, #2a2f3a); border-radius: 3px;
    background: var(--bg-control, #232733); color: var(--text, #dfe6f0); font: inherit; cursor: pointer;
    white-space: nowrap;
  }
  .mbg-upload:hover:not(:disabled) { background: var(--bg-control-hover, #2c313f); }
  .mbg-upload:disabled { cursor: not-allowed; opacity: 0.6; }

  .mbg-refit {
    margin-bottom: 4px; padding: 4px 9px; border: 1px solid var(--border, #2a2f3a);
    border-radius: 3px; background: var(--bg-control, #232733); color: var(--text, #dfe6f0);
    font: inherit; cursor: pointer;
  }
  .mbg-refit:hover:not(:disabled) { background: var(--bg-control-hover, #2c313f); }
  .mbg-refit:disabled { cursor: not-allowed; opacity: 0.6; }

  /* The primary action of the map-fixed mode, so it reads as one rather than as another field. */
  .mbg-align {
    width: 100%; padding: 6px 10px; border: 1px solid transparent; border-radius: 3px;
    background: var(--accent, #ff5a1f); color: var(--on-accent, #fff); font: inherit;
    font-weight: 600; cursor: pointer;
  }
  .mbg-align:hover:not(:disabled) { filter: brightness(1.08); }
  .mbg-align:disabled { cursor: not-allowed; opacity: 0.6; filter: none; }

  /* Folded away: exact numbers are the exception, and five more open fields is the sprawl this group
     was reorganised to avoid. */
  .mbg-numbers { margin-bottom: 9px; }
  .mbg-numbers summary {
    cursor: pointer; opacity: 0.7; font-size: 0.8em; margin-bottom: 5px;
    color: var(--text-muted, #9aa3b2);
  }
  .credit { font-style: italic; }
</style>

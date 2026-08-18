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
  import { createEventDispatcher } from 'svelte';
  import type { MapBackground, Starmap } from '$lib/types';
  import type { PlayerAsset } from '$lib/player/presetTypes';
  import { normaliseMapBackground, suggestAnchor, DEFAULT_BACKGROUND_CREDIT } from '$lib/map/mapBackground';
  import { campaignUnit } from '$lib/map/distanceUnits';

  export let starmap: Starmap | null = null;
  export let background: MapBackground | null | undefined = null;
  /** Uploaded images available to place. The GM uploads them in Player Views; the list is shared. */
  export let assets: PlayerAsset[] = [];
  /** Disabled with a reason — the print/invert display forces the background off. */
  export let disabledReason = '';

  const dispatch = createEventDispatcher<{ change: MapBackground }>();

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

  function setSource(source: MapBackground['source']) {
    if (source === 'asset') {
      const first = assets[0];
      if (!first) return;
      chooseAsset(bg.assetId && assets.some((a) => a.id === bg.assetId) ? bg.assetId : first.id);
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
</script>

<div class="mbg" class:disabled={!!disabledReason}>
  <div class="form-group">
    <label for="mbg-source">Background image</label>
    <select id="mbg-source" value={bg.source} disabled={!!disabledReason}
      on:change={(e) => setSource((e.currentTarget as HTMLSelectElement).value as MapBackground['source'])}>
      <option value="none">None (plain space)</option>
      <option value="default">Milky Way (shipped)</option>
      <option value="asset" disabled={!assets.length}>
        {assets.length ? 'Your own image…' : 'Your own image (none uploaded yet)'}
      </option>
    </select>
    {#if !assets.length}
      <p class="section-hint">Upload images in Player Views &rarr; Images; they are then available here.</p>
    {/if}
  </div>

  {#if bg.source === 'asset'}
    <div class="form-group">
      <label for="mbg-asset">Image</label>
      <select id="mbg-asset" value={bg.assetId ?? ''} disabled={!!disabledReason}
        on:change={(e) => chooseAsset((e.currentTarget as HTMLSelectElement).value)}>
        {#each assets as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </select>
      {#if chosen && !chosen.credit}
        <p class="section-hint">
          No credit recorded for this image. If you did not make it yourself, add one in Player Views
          &mdash; the save bundle lists it, and a CC-BY image needs its author named.
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
          The image is pinned to map coordinates: a system stays on the same point of the picture
          however you pan and zoom, on your map and on every player view.
        {:else}
          The image holds still while the stars move over it &mdash; right for a starfield backdrop,
          wrong for a sector map.
        {/if}
      </p>
    </div>

    {#if bg.attach === 'map'}
      <div class="form-group">
        <label for="mbg-width">Image width ({unit})</label>
        <input id="mbg-width" type="number" min="0.01" step="any" disabled={!!disabledReason}
          value={bg.widthUnits} on:change={(e) => patch({ widthUnits: numOf(e, bg.widthUnits) })} />
        <p class="section-hint">How much of the map the picture spans. Height follows its own shape.</p>
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
        <p class="section-hint">A scanned map is rarely square to the axes.</p>
      </div>
      <button type="button" class="mbg-refit" disabled={!!disabledReason} on:click={refit}>
        Fit to charted systems
      </button>
    {:else}
      <div class="form-group">
        <label for="mbg-size">Size <span class="val">{bg.sizePct}%</span></label>
        <input id="mbg-size" type="range" min="20" max="100" step="1" disabled={!!disabledReason}
          value={bg.sizePct} on:input={(e) => patch({ sizePct: numOf(e, bg.sizePct) })} />
        <p class="section-hint">100% fills the map view.</p>
      </div>
    {/if}

    <div class="form-group">
      <label for="mbg-fade">Fade <span class="val">{Math.round((1 - bg.opacity) * 100)}%</span></label>
      <input id="mbg-fade" type="range" min="0" max="0.95" step="0.05" disabled={!!disabledReason}
        value={1 - bg.opacity} on:input={(e) => patch({ opacity: 1 - numOf(e, 1 - bg.opacity) })} />
      <p class="section-hint">
        How far the picture is pushed back behind the stars. Separate from the 3D view's Star boost,
        which sets the contrast between charted stars and the procedural sky.
      </p>
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
  /* Deliberately borrows the host dialog's own .form-group/.section-hint rules rather than restyling
     them: this group sits inside Settings and must look like the fields above it. */
  .mbg.disabled { opacity: 0.6; }
  .form-row { display: flex; gap: 10px; }
  .form-row .form-group { flex: 1; min-width: 0; }
  .val { opacity: 0.75; font-weight: normal; }
  .mbg-refit {
    margin-bottom: 10px; padding: 5px 10px; border: 1px solid var(--border);
    border-radius: 4px; background: var(--bg-control); color: var(--text);
    font: inherit; cursor: pointer;
  }
  .mbg-refit:hover:not(:disabled) { background: var(--bg-control-hover); }
  .mbg-refit:disabled { cursor: not-allowed; opacity: 0.6; }
  .credit { font-style: italic; }
</style>

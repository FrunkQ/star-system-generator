<script lang="ts">
  // ONE ABSORPTION-BAND CONTROL, USED BY BOTH EDITORS (A56).
  //
  // A band is `{centreNm, widthNm, strength}` and means the same thing wherever it appears: a Gaussian
  // notch taken out of the incoming spectrum, evaluated by `bandAbsorbance` in `physics/surfaceSpectrum`.
  // A pigment's bands and a gas's bands are the SAME OBJECT under the same maths — `GasPhysics` has
  // typed `absorptionBands?: PigmentBand[]` all along — so they must not be two controls that merely
  // resemble each other. That is the fault this codebase keeps finding (TAG-18's four tag pills,
  // A34's four construct glyphs): copies drift, and the second one is written by someone who cannot
  // see the first.
  //
  // IT COMPUTES NOTHING, deliberately, and this is the same rule `SpectrumChart` states for itself:
  // the `absorbed` series arrives as a PROP. If this component derived it, there would be two places
  // that turn bands into absorbance and they would answer differently the first time either changed.
  // It also keeps the callers honest — the pigment editor's curve includes the flat baseline term,
  // the gas card's does not, and that difference belongs to the caller who knows why.
  import type { PigmentBand } from '$lib/types';
  import SpectrumChart from '$lib/charts/SpectrumChart.svelte';
  import { GRID_MIN_NM, GRID_MAX_NM } from '$lib/physics/spectrum';

  /** Bound. Edited in place; the parent re-assigns to trigger its own reactivity. */
  export let bands: PigmentBand[] = [];
  export let label = 'Absorption bands';
  /** Shown when there are none. Say what the ABSENCE means, not that the list is empty. */
  export let emptyNote = 'No bands.';
  /** What "+ band" adds. Sensible for the domain: pigments sit in the visible, gases vary. */
  export let newBand: PigmentBand = { centreNm: 600, widthNm: 30, strength: 0.7 };
  /** Optional preview. Both must be supplied for the chart to appear; neither is derived here. */
  export let previewLight: number[] | null = null;
  export let absorbed: number[] | null = null;
  export let absorbedLabel = 'what this absorbs';
  export let surfaceLabel = 'light from the preview star';
  export let yLabel = 'W&#183;m&#8315;&#178;&#183;nm&#8315;&#185;';
  /** Shown under the chart when there are no bands to draw — say what the FLAT line means. */
  export let emptyPreviewNote = 'Nothing is taken out: with no bands, this passes the whole spectrum through and only scatters.';
  /** Called after any edit. A parent whose reactivity keys off a CONTAINER (`pigments`, `gases`)
   *  has to nudge that container itself; only it knows what it is. */
  export let onChange: () => void = () => {};

  // THE INPUT BOUNDS ARE THE ENGINE'S GRID, NOT THE HUMAN VISIBLE BAND, and they are READ rather than
  // restated (owner, 2026-08-18: "do these curves extend beyond visible spectra - kinda the point").
  // The grid is 280-1400 nm, roughly twice the human band each side, and O2's 762 nm A-band already
  // sits outside human vision while being fully inside the derivation. When G31's second grid widens
  // the range both editors follow for free, and a GM can never author a band the engine cannot see.
  // Visible light is a REFERENCE STRIP on the chart, never a clamp on what may be authored.

  // EVERY EDIT RE-ASSIGNS THE ARRAY, and then says so. Mutating `bands[i].centreNm` in place is not
  // enough: a member mutation does not propagate out through `bind:bands`, so the parent's own derived
  // state (the pigment swatch, the gas preview curve) went stale while the number in the box changed.
  // That is the whole reason the inline version worked — its bindings reached the parent's array
  // directly — and it is the trap in lifting a control OUT of the component that owns the data.
  // The `change` event is the second half: a parent whose reactivity keys off a CONTAINER (`pigments`,
  // `gases`) has to nudge that container itself; only it knows what it is.
  function edit(i: number, field: 'centreNm' | 'widthNm' | 'strength', raw: string) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    bands = bands.map((b, k) => (k === i ? { ...b, [field]: v } : b));
    onChange();
  }
  function addBand() {
    bands = [...bands, { ...newBand }];
    onChange();
  }
  function removeBand(i: number) {
    bands = bands.filter((_, k) => k !== i);
    onChange();
  }
</script>

<div class="bands">
  <div class="bands-head"><span>{label}</span><button class="mini" on:click={addBand}>+ band</button></div>
  {#each bands as bd, bi}
    <div class="band-row">
      <label><small>centre</small>
        <input type="number" min={GRID_MIN_NM} max={GRID_MAX_NM} step="1" value={bd.centreNm}
               on:input={(e) => edit(bi, 'centreNm', e.currentTarget.value)} /><small>nm</small></label>
      <label><small>width</small>
        <input type="number" min="2" max="400" step="1" value={bd.widthNm}
               on:input={(e) => edit(bi, 'widthNm', e.currentTarget.value)} /><small>nm</small></label>
      <label><small>strength</small>
        <input type="number" min="0" max="1" step="0.01" value={bd.strength}
               on:input={(e) => edit(bi, 'strength', e.currentTarget.value)} /></label>
      <button class="mini danger" on:click={() => removeBand(bi)}>×</button>
    </div>
  {/each}
  {#if !bands.length}<p class="note">{emptyNote}</p>{/if}
</div>

<!-- A GAS WITH NO BANDS STILL PREVIEWS, and that is the point rather than an edge case: the chart then
     shows the starlight arriving with nothing taken out of it, which is exactly what N2 or argon does.
     Requiring `absorbed` made 'Preview against a star' a dead button on 17 of the 33 shipped gases —
     it changed its own label and drew nothing, which reads as broken rather than as an answer. -->
{#if previewLight}
  <SpectrumChart surface={previewLight} {absorbed}
    {absorbedLabel} {surfaceLabel}
    topOfAtmosphere={null} {yLabel} />
  {#if !absorbed}<p class="note">{emptyPreviewNote}</p>{/if}
{/if}

<style>
  /* Lifted VERBATIM from EditBiospheresModal, which is where this control lived inline. Svelte scopes
     styles per component, so the numbers have to travel with the markup or the pigment editor would
     change appearance — and "pixel-for-pixel what it was" is the acceptance test for that half. */
  .bands { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .bands-head { display: flex; align-items: center; gap: 8px; font-size: 0.75em; color: var(--text-faint, #8a8f9a); }
  .band-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .band-row label { display: flex; align-items: center; gap: 4px; font-size: 0.75em; }
  .band-row input { width: 68px; background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36); color: var(--text, #eee); border-radius: 4px; padding: 2px 5px; }
  .mini {
    font-size: 0.72em; padding: 2px 7px; border-radius: 3px; cursor: pointer;
    border: 1px solid var(--border, #2a2d36); background: var(--bg-control, #1b1e26); color: var(--text-muted, #cfcfcf);
  }
  .mini.danger:hover { color: #e74c3c; border-color: #e74c3c; }
  .note { font-size: 0.75em; color: var(--text-faint, #8a8f9a); margin: 8px 0 0; line-height: 1.5; }
</style>

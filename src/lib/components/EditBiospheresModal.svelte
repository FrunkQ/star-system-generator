<script lang="ts">
  // Settings -> Planets -> Biospheres. The GM-editable definition of what a morphology IS.
  //
  // THIS IS WHERE THE "no special rules" PRINCIPLE PAYS OUT. Every morphology is one record with the
  // same fields, and every difference between them lives in those fields: flora has an empty tint
  // list and full pigment drive, fauna has two empty ranges and therefore paints nothing, a
  // technological one is a dark tint range plus a strong light range. Adding a sixth kind is a row
  // here and no code anywhere. If a difference you want cannot be said in these fields, the SCHEMA
  // is short a field — say so; do not ask for a branch.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack, MorphologyDef, PigmentDef, PigmentModelConfig } from '$lib/types';
  import { allMorphologies } from '$lib/physics/vegetation';
  import { allPigments, pigmentModel, absorptance, scorePigments } from '$lib/physics/pigments';
  import { makeListDelta, applyListDelta } from '$lib/rulepackDelta';
  import { blackbodySpectrum, gridShare, GRID_NM } from '$lib/physics/spectrum';
  import SpectrumChart from '$lib/charts/SpectrumChart.svelte';
  import { foreground } from '$lib/ui/foreground';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  const baseList: MorphologyDef[] = allMorphologies(rulePack);
  const baseByKey: Record<string, MorphologyDef> = {};
  let morphs: MorphologyDef[] = [];

  onMount(() => {
    baseList.forEach((m) => { baseByKey[m.key] = m; });
    // Open on the EFFECTIVE lists — the pack's, with this campaign's delta already laid over them.
    // Reading the stored override directly would show a delta as if it were the whole list, and
    // saving from that would then wipe everything the GM had not re-typed.
    morphs = JSON.parse(JSON.stringify(
      applyListDelta(baseList, starmap.rulePackOverrides?.morphologies, (m) => m.key)));
    morphs.sort((a, b) => a.order - b.order);
    pigments = JSON.parse(JSON.stringify(
      applyListDelta(basePigments, starmap.rulePackOverrides?.pigments, (p) => p.key)));
    model = { ...baseModel, ...(starmap.rulePackOverrides?.pigmentModel ?? {}) };
  });

  // Pigments are managed here the same way liquids and gases are: start from a clone of the base
  // list, edit freely, and record an override only if it ends up different.
  const basePigments: PigmentDef[] = allPigments(rulePack);
  const baseModel: PigmentModelConfig = pigmentModel(rulePack);
  let pigments: PigmentDef[] = [];
  let model: PigmentModelConfig = { ...baseModel };
  let previewTempK = 5778;
  let openPigment: string | null = null;

  // What each pigment would look like under the preview star, computed by the ENGINE from whatever
  // bands are in the boxes right now — so editing a band centre and watching the swatch move is the
  // fastest way to understand what the numbers mean.
  $: previewLight = blackbodySpectrum(previewTempK, 1361 * gridShare(previewTempK));
  $: preview = scorePigments(previewLight, { ...rulePack, pigments, pigmentModel: model } as RulePack);
  $: previewOf = (key: string) => preview.find((r) => r.key === key);
  $: shownAbsorbed = (() => {
    const def = pigments.find((d) => d.key === openPigment);
    if (!def) return null;
    const abs = absorptance(def, 0);
    return previewLight.map((v, i) => v * abs[i]);
  })();

  function addPigment() {
    const key = prompt('A unique id for the new pigment (e.g. rhodopsin-b):');
    if (!key) return;
    if (pigments.some((x) => x.key === key)) { alert('That id already exists.'); return; }
    pigments = [...pigments, {
      key, label: key.charAt(0).toUpperCase() + key.slice(1),
      baselineAbsorptance: 0.06,
      bands: [{ centreNm: 550, widthNm: 40, strength: 0.8 }]
    }];
    openPigment = key;
  }
  function removePigment(i: number) {
    if (!confirm(`Remove "${pigments[i].label}"? Worlds already using it fall back to whatever else scores best.`)) return;
    pigments = pigments.filter((_, k) => k !== i);
  }
  function resetPigment(i: number) {
    const base = basePigments.find((b) => b.key === pigments[i]?.key);
    if (base) { pigments[i] = JSON.parse(JSON.stringify(base)); pigments = [...pigments]; }
  }
  function addBand(i: number) {
    pigments[i].bands = [...pigments[i].bands, { centreNm: 600, widthNm: 30, strength: 0.7 }];
    pigments = [...pigments];
  }
  function removeBand(i: number, b: number) {
    pigments[i].bands = pigments[i].bands.filter((_, k) => k !== b);
    pigments = [...pigments];
  }

  function handleSave() {
    // Save the DIFFERENCE, not the list. Everything untouched keeps tracking the pack, so a later
    // improvement to the shipped defaults still reaches this campaign — which a whole-list copy
    // would have quietly blocked. `undefined` means "no override at all", which is what a GM who
    // changed nothing should end up storing.
    const overrides: any = {
      morphologies: makeListDelta(baseList, morphs, (m) => m.key),
      pigments: makeListDelta(basePigments, pigments, (p) => p.key)
    };
    const modelDelta: any = {};
    for (const k of Object.keys(model) as (keyof typeof model)[]) {
      if (model[k] !== baseModel[k]) modelDelta[k] = model[k];
    }
    overrides.pigmentModel = Object.keys(modelDelta).length ? modelDelta : undefined;
    dispatch('save', overrides);
    dispatch('close');
  }

  function addMorph() {
    const key = prompt('A unique id for the new morphology (e.g. crystalline):');
    if (!key) return;
    if (morphs.some((m) => m.key === key)) { alert('That id already exists.'); return; }
    morphs = [...morphs, {
      key, label: key.charAt(0).toUpperCase() + key.slice(1),
      order: (morphs[morphs.length - 1]?.order ?? 0) + 10,
      defaultCoverage: 0.3, tints: ['#7a7f6a'], pigmentDriven: 0,
      opacity: 0.7, light: { min: 0, max: 0 }
    }];
  }

  function removeMorph(i: number) {
    if (!confirm(`Remove "${morphs[i].label}"? Worlds already carrying it simply stop drawing it.`)) return;
    morphs = morphs.filter((_, k) => k !== i);
  }

  function resetMorph(i: number) {
    const base = baseByKey[morphs[i]?.key];
    if (base) { morphs[i] = JSON.parse(JSON.stringify(base)); morphs = [...morphs]; }
  }

  // ORDER IS THE HIERARCHY, so this is a real edit. The stored `order` is renumbered from the list
  // position so there is one source of truth for it and not two that can disagree.
  function move(i: number, delta: number) {
    const to = i + delta;
    if (to < 0 || to >= morphs.length) return;
    const next = morphs.slice();
    [next[i], next[to]] = [next[to], next[i]];
    next.forEach((m, k) => { m.order = (k + 1) * 10; });
    morphs = next;
  }

  function setTints(i: number, raw: string) {
    morphs[i].tints = raw.split(',').map((s) => s.trim()).filter((s) => /^#[0-9a-fA-F]{3,8}$/.test(s));
    morphs = [...morphs];
  }
</script>

{#if showModal}
<div class="modal-backdrop" role="presentation" on:click={() => dispatch('close')} use:foreground>
  <div class="modal" role="dialog" aria-label="Biospheres" on:click|stopPropagation>
    <header>
      <h3>Biospheres</h3>
      <button class="x" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </header>

    <p class="intro">
      A morphology is <strong>one record</strong>, and every difference between them lives in its fields.
      The <strong>order is the hierarchy</strong> — later rows are painted over earlier ones, so plant life
      covers fungal and fungal colours microbial. A row with <strong>no tints and no pigment drive</strong>
      contributes nothing you can see from orbit; a row with a <strong>light range</strong> glows on the night
      side. <a href="/physics#biosphere" target="_blank" rel="noopener">How the colours are derived</a>.
    </p>

    <div class="rows">
      {#each morphs as m, i}
        <div class="row">
          <div class="row-head">
            <div class="order-btns">
              <button type="button" title="Deeper (painted earlier)" disabled={i === 0} on:click={() => move(i, -1)}>▲</button>
              <button type="button" title="On top (painted later)" disabled={i === morphs.length - 1} on:click={() => move(i, 1)}>▼</button>
            </div>
            <input class="label-in" bind:value={m.label} aria-label="Label" />
            <code class="key">{m.key}</code>
            <span class="spacer"></span>
            {#if baseByKey[m.key]}<button class="mini" on:click={() => resetMorph(i)}>Reset</button>{/if}
            <button class="mini danger" on:click={() => removeMorph(i)}>Remove</button>
          </div>

          <div class="fields">
            <label>
              <span>Default cover <b>{Math.round(m.defaultCoverage * 100)}%</b></span>
              <input type="range" min="0" max="1" step="0.05" bind:value={m.defaultCoverage} />
              <small>of the LAND, when a GM switches it on</small>
            </label>
            <label>
              <span>Pigment-driven <b>{Math.round(m.pigmentDriven * 100)}%</b></span>
              <input type="range" min="0" max="1" step="0.05" bind:value={m.pigmentDriven} />
              <small>how far the star-derived pigment colour replaces the tints</small>
            </label>
            <label>
              <span>Opacity <b>{Math.round(m.opacity * 100)}%</b></span>
              <input type="range" min="0" max="1" step="0.05" bind:value={m.opacity} />
              <small>how completely it hides what is beneath</small>
            </label>
            <label class="wide">
              <span>Tints</span>
              <div class="tint-row">
                {#each m.tints as t}<span class="chip" style="background:{t}" title={t}></span>{/each}
                {#if !m.tints.length}<span class="empty">empty — no colour of its own</span>{/if}
              </div>
              <input class="tints-in" value={m.tints.join(', ')}
                     placeholder="#5d6b4a, #7a6b4e — leave empty for none"
                     on:change={(e) => setTints(i, e.currentTarget.value)} />
              <small>one is picked per world, seeded on the body</small>
            </label>
            <label>
              <span>Lights <b>{m.light.max <= 0 && m.light.min <= 0 ? 'none' : `${Math.round(m.light.min * 100)}–${Math.round(m.light.max * 100)}%`}</b></span>
              <div class="pair">
                <input type="number" min="0" max="1" step="0.05" bind:value={m.light.min} aria-label="Minimum light" />
                <input type="number" min="0" max="1" step="0.05" bind:value={m.light.max} aria-label="Maximum light" />
              </div>
              <small>night-side emission; an empty range means no lights</small>
            </label>
          </div>
          {#if m.note}<p class="note">{m.note}</p>{/if}
        </div>
      {/each}
    </div>

    <button class="add" on:click={addMorph}>+ Add a morphology</button>

    <details class="pigment-ref" open>
      <summary>Pigments — what life here can catch the light with ({pigments.length})</summary>
      <p class="intro">
        A pigment is a set of <strong>absorption bands</strong>. Its colour is not authored anywhere: it is
        whatever the pigment fails to absorb out of the light reaching a world's ground, which is why the
        same pigment presents green under one star and near-black under another. Edit a band and the swatch
        moves. <a href="/physics#biosphere" target="_blank" rel="noopener">How one is chosen</a>.
      </p>

      <label class="preview-star">
        <span>Preview star <b>{Math.round(previewTempK)} K</b></span>
        <input type="range" min="2600" max="11000" step="50" bind:value={previewTempK} />
        <small>an airless world at 1 AU — the swatches below are what these pigments would present there</small>
      </label>

      <div class="rows">
        {#each pigments as pg, i}
          {@const pv = previewOf(pg.key)}
          <div class="row">
            <div class="row-head">
              <button class="disclose" type="button" aria-expanded={openPigment === pg.key}
                      on:click={() => (openPigment = openPigment === pg.key ? null : pg.key)}>
                {openPigment === pg.key ? '▾' : '▸'}
              </button>
              {#if pv}<span class="chip" style="background:{pv.reflectedUnderStarHex}" title="{pv.reflectedUnderStarHex} — as human eyes would see it under this star"></span>{/if}
              <input class="label-in" bind:value={pg.label} aria-label="Label" />
              <code class="key">{pg.key}</code>
              {#if pv}<span class="score" title="score under the preview star — several are always viable">{pv.score.toFixed(3)}{pv.viable ? '' : ' (outclassed)'}</span>{/if}
              <span class="spacer"></span>
              {#if basePigments.some((b) => b.key === pg.key)}<button class="mini" on:click={() => resetPigment(i)}>Reset</button>{/if}
              <button class="mini danger" on:click={() => removePigment(i)}>Remove</button>
            </div>

            {#if openPigment === pg.key}
              <div class="fields">
                <label>
                  <span>Flat absorption <b>{Math.round((pg.baselineAbsorptance ?? 0) * 100)}%</b></span>
                  <input type="range" min="0" max="1" step="0.01"
                         value={pg.baselineAbsorptance ?? 0}
                         on:input={(e) => { pigments[i].baselineAbsorptance = +e.currentTarget.value; pigments = [...pigments]; }} />
                  <small>absorbed at every wavelength. High here means broadband and dark — it works under any star.</small>
                </label>
              </div>

              <div class="bands">
                <div class="bands-head"><span>Absorption bands</span><button class="mini" on:click={() => addBand(i)}>+ band</button></div>
                {#each pg.bands as bd, bi}
                  <div class="band-row">
                    <label><small>centre</small>
                      <input type="number" min="280" max="1400" step="1" bind:value={bd.centreNm} /><small>nm</small></label>
                    <label><small>width</small>
                      <input type="number" min="2" max="400" step="1" bind:value={bd.widthNm} /><small>nm</small></label>
                    <label><small>strength</small>
                      <input type="number" min="0" max="1" step="0.01" bind:value={bd.strength} /></label>
                    <button class="mini danger" on:click={() => removeBand(i, bi)}>×</button>
                  </div>
                {/each}
                {#if !pg.bands.length}<p class="note">No bands — this pigment absorbs evenly at whatever the flat figure says.</p>{/if}
              </div>

              {#if shownAbsorbed}
                <SpectrumChart surface={previewLight} absorbed={shownAbsorbed}
                  absorbedLabel={`what ${pg.label} takes`} surfaceLabel="light from the preview star"
                  topOfAtmosphere={null} yLabel="W&#183;m&#8315;&#178;&#183;nm&#8315;&#185;" />
              {/if}
              {#if pg.note}<p class="note">{pg.note}</p>{/if}
            {/if}
          </div>
        {/each}
      </div>

      <button class="add" on:click={addPigment}>+ Add a pigment</button>

      <details class="model-ref">
        <summary>How one is chosen — the three pressures</summary>
        <p class="intro">
          A pigment is not picked by grabbing the most light: Earth disproves that, since the Sun peaks in the
          green and chlorophyll reflects green. Three pressures are scored and <strong>multiplied</strong>, so
          each switches itself off where it stops applying.
        </p>
        <div class="fields">
          <label>
            <span>Capture weight <b>{model.captureWeight}</b></span>
            <input type="number" min="0" max="4" step="0.1" bind:value={model.captureWeight} />
            <small>photons absorbed, saturating</small>
          </label>
          <label>
            <span>Protection weight <b>{model.protectionWeight}</b></span>
            <input type="number" min="0" max="4" step="0.1" bind:value={model.protectionWeight} />
            <small>overload and wasted photon energy avoided</small>
          </label>
          <label>
            <span>Steadiness weight <b>{model.steadinessWeight}</b></span>
            <input type="number" min="0" max="4" step="0.1" bind:value={model.steadinessWeight} />
            <small>feeding off the flanks rather than the peak</small>
          </label>
          <label>
            <span>Saturating flux</span>
            <input type="number" min="1e18" max="1e23" step="1e19" bind:value={model.saturationFlux} />
            <small>photons&#183;m&#8315;&#178;&#183;s&#8315;&#185; a photosystem can process. THE number that makes selectivity scale with available light.</small>
          </label>
          <label>
            <span>Reaction centre <b>{model.reactionCentreNm} nm</b></span>
            <input type="number" min="400" max="1400" step="5" bind:value={model.reactionCentreNm} />
            <small>its red limit; everything shorter wastes its excess as heat</small>
          </label>
          <label>
            <span>Damage threshold <b>{model.damageThresholdNm} nm</b></span>
            <input type="number" min="200" max="700" step="5" bind:value={model.damageThresholdNm} />
            <small>shorter than this, a photon breaks chemistry as well as powering it</small>
          </label>
          <label>
            <span>Tissue absorption <b>{Math.round(model.tissueAbsorptance * 100)}%</b></span>
            <input type="range" min="0" max="0.8" step="0.01" bind:value={model.tissueAbsorptance} />
            <small>the organism around the pigment — what makes a leaf dark rather than a paint chip. Colour only; it feeds no photosystem.</small>
          </label>
          <label>
            <span>Viable at <b>{Math.round(model.viabilityFraction * 100)}%</b> of the leader</span>
            <input type="range" min="0.2" max="1" step="0.01" bind:value={model.viabilityFraction} />
            <small>anything above this is in the draw</small>
          </label>
          <label>
            <span>Draw sharpness <b>{model.drawSharpness}</b></span>
            <input type="number" min="1" max="30" step="1" bind:value={model.drawSharpness} />
            <small>how hard the weighted draw favours the leaders</small>
          </label>
        </div>
      </details>
    </details>

    <footer>
      <button class="secondary" on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" on:click={handleSave}>Save</button>
    </footer>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;
  }
  .modal {
    background: var(--bg-panel, #14161c); border: 1px solid var(--border, #2a2d36);
    border-radius: 8px; width: min(760px, 100%); max-height: 88vh; overflow: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  header { display: flex; align-items: center; justify-content: space-between; }
  h3 { margin: 0; color: var(--link, #6cb6ff); font-size: 1em; text-transform: uppercase; letter-spacing: 0.04em; }
  .x { background: none; border: none; color: var(--text-muted, #cfcfcf); font-size: 1.3em; cursor: pointer; line-height: 1; }
  .intro { font-size: 0.82em; color: var(--text-muted, #cfcfcf); margin: 0; line-height: 1.5; }
  .rows { display: flex; flex-direction: column; gap: 10px; }
  .row { border: 1px solid var(--border, #2a2d36); border-radius: 6px; padding: 8px; }
  .row-head { display: flex; align-items: center; gap: 8px; }
  .label-in {
    background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36);
    color: var(--text, #eee); border-radius: 4px; padding: 3px 6px; font-size: 0.9em; width: 130px;
  }
  .key { font-size: 0.75em; color: var(--text-faint, #8a8f9a); }
  .spacer { flex: 1; }
  .order-btns { display: flex; flex-direction: column; gap: 1px; }
  .order-btns button {
    line-height: 1; font-size: 0.55em; padding: 1px 3px; border-radius: 2px;
    border: 1px solid var(--border, #2a2d36); background: var(--bg-control, #1b1e26);
    color: var(--text-muted, #cfcfcf); cursor: pointer;
  }
  .order-btns button:disabled { opacity: 0.3; cursor: default; }
  .mini {
    font-size: 0.72em; padding: 2px 7px; border-radius: 3px; cursor: pointer;
    border: 1px solid var(--border, #2a2d36); background: var(--bg-control, #1b1e26); color: var(--text-muted, #cfcfcf);
  }
  .mini.danger:hover { color: #e74c3c; border-color: #e74c3c; }
  .fields { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .fields label { display: flex; flex-direction: column; gap: 2px; font-size: 0.78em; min-width: 150px; flex: 1 1 150px; }
  .fields label.wide { flex: 1 1 100%; }
  .fields small { color: var(--text-faint, #8a8f9a); font-size: 0.9em; }
  .fields input[type='range'] { width: 100%; }
  .pair { display: flex; gap: 6px; }
  .pair input, .tints-in {
    background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36);
    color: var(--text, #eee); border-radius: 4px; padding: 3px 6px; font-size: 0.95em; width: 100%;
  }
  .tint-row { display: flex; align-items: center; gap: 4px; min-height: 16px; }
  .chip { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--border, #2a2d36); }
  .empty { color: var(--text-faint, #8a8f9a); font-size: 0.95em; }
  .note { font-size: 0.75em; color: var(--text-faint, #8a8f9a); margin: 8px 0 0; line-height: 1.5; }
  .add {
    align-self: flex-start; font-size: 0.8em; padding: 4px 10px; border-radius: 999px; cursor: pointer;
    border: 1px dashed var(--border, #2a2d36); background: transparent; color: var(--text-muted, #cfcfcf);
  }
  .pigment-ref { border-top: 1px solid var(--border, #2a2d36); padding-top: 8px; }
  .pigment-ref summary { cursor: pointer; font-size: 0.85em; color: var(--text, #eee); }
  .preview-star { display: flex; flex-direction: column; gap: 2px; font-size: 0.78em; margin: 8px 0; }
  .preview-star input { width: 100%; }
  .preview-star small { color: var(--text-faint, #8a8f9a); }
  .disclose {
    background: none; border: none; color: var(--text-muted, #cfcfcf); cursor: pointer;
    font-size: 0.8em; padding: 0 2px; line-height: 1;
  }
  .score { font-size: 0.72em; color: var(--text-faint, #8a8f9a); font-variant-numeric: tabular-nums; }
  .bands { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .bands-head { display: flex; align-items: center; gap: 8px; font-size: 0.75em; color: var(--text-faint, #8a8f9a); }
  .band-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .band-row label { display: flex; align-items: center; gap: 4px; font-size: 0.75em; }
  .band-row input { width: 68px; background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36); color: var(--text, #eee); border-radius: 4px; padding: 2px 5px; }
  .model-ref { margin-top: 10px; border-top: 1px solid var(--border, #2a2d36); padding-top: 8px; }
  .model-ref summary { cursor: pointer; font-size: 0.8em; color: var(--text, #eee); }
  .model-ref input[type='number'] { background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36); color: var(--text, #eee); border-radius: 4px; padding: 3px 6px; width: 100%; }
  footer { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border, #2a2d36); padding-top: 10px; }
  footer button { padding: 5px 14px; border-radius: 4px; cursor: pointer; font-size: 0.85em; }
  .secondary { background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36); color: var(--text-muted, #cfcfcf); }
  .primary { background: var(--link, #6cb6ff); border: 1px solid var(--link, #6cb6ff); color: #06121f; font-weight: 600; }
</style>

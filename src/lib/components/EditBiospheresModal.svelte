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
  import type { Starmap, RulePack, MorphologyDef } from '$lib/types';
  import { allMorphologies } from '$lib/physics/vegetation';
  import { allPigments, pigmentModel } from '$lib/physics/pigments';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  const baseList: MorphologyDef[] = allMorphologies(rulePack);
  const baseByKey: Record<string, MorphologyDef> = {};
  let morphs: MorphologyDef[] = [];

  onMount(() => {
    baseList.forEach((m) => { baseByKey[m.key] = m; });
    const source = starmap.rulePackOverrides?.morphologies?.length
      ? starmap.rulePackOverrides.morphologies
      : baseList;
    morphs = JSON.parse(JSON.stringify(source));
    morphs.sort((a, b) => a.order - b.order);
  });

  const pigments = allPigments(rulePack);
  const model = pigmentModel(rulePack);

  function handleSave() {
    const overrides: any = {};
    if (JSON.stringify(baseList) !== JSON.stringify(morphs)) overrides.morphologies = morphs;
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
<div class="modal-backdrop" role="presentation" on:click={() => dispatch('close')}>
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

    <details class="pigment-ref">
      <summary>Pigments and how one is chosen ({pigments.length} in this pack)</summary>
      <p class="intro">
        These are <strong>read-only here</strong> — a pigment's colour is not authored, it is whatever the
        pigment fails to absorb out of the light reaching that world's ground, so it changes with the star.
        Edit them by shipping a <code>biospheres.json</code> in your rule pack.
      </p>
      <ul class="pig-list">
        {#each pigments as p}
          <li><b>{p.label}</b> — absorbs {p.bands.map((b) => `${b.centreNm} nm`).join(', ')}{p.baselineAbsorptance ? `, plus ${Math.round(p.baselineAbsorptance * 100)}% flat` : ''}{p.note ? `. ${p.note}` : ''}</li>
        {/each}
      </ul>
      <p class="intro">
        Selection weighs three competing pressures at once — capture (saturating at
        {model.saturationFlux.toExponential(1)} photons·m⁻²·s⁻¹), protection (reaction centre
        {model.reactionCentreNm} nm, damage threshold {model.damageThresholdNm} nm) and steadiness — then
        draws a dominant from everything scoring above {Math.round(model.viabilityFraction * 100)}% of the
        leader. Several usually qualify, and which one wins is contingent.
      </p>
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
  .pig-list { font-size: 0.78em; color: var(--text-muted, #cfcfcf); line-height: 1.55; padding-left: 18px; }
  footer { display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border, #2a2d36); padding-top: 10px; }
  footer button { padding: 5px 14px; border-radius: 4px; cursor: pointer; font-size: 0.85em; }
  .secondary { background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36); color: var(--text-muted, #cfcfcf); }
  .primary { background: var(--link, #6cb6ff); border: 1px solid var(--link, #6cb6ff); color: #06121f; font-weight: 600; }
</style>

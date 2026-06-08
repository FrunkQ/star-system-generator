<script lang="ts">
  // §4a — interior MAKEUP control. The user tweaks the CAUSE (composition); density and radius are
  // DERIVED (more variety for less data entry). Replaces the old "set radius + read density" flow:
  // set the mass + the mix, and the size follows.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Makeup } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
  import { normalizeMakeup, bulkDensityFromMakeup, radiusReFromMassMakeup, makeupFractions } from '$lib/physics/makeup';

  export let body: CelestialBody;
  const dispatch = createEventDispatcher();

  const KEYS: Array<keyof Makeup> = ['metal', 'rock', 'carbon', 'ice', 'gas'];
  const LABELS: Record<string, string> = { metal: 'Metal', rock: 'Rock', carbon: 'Carbon', ice: 'Ice', gas: 'Gas' };
  const SWATCH: Record<string, string> = { metal: '#9c8d7a', rock: '#a9805a', carbon: '#3a3a40', ice: '#cfe6ff', gas: '#d8c79a' };

  const PRESETS: Array<{ name: string; mk: Makeup }> = [
    { name: 'Iron', mk: { metal: 0.7, rock: 0.3 } },
    { name: 'Rocky', mk: { rock: 0.85, metal: 0.15 } },
    { name: 'Carbon', mk: { carbon: 0.5, rock: 0.5 } },
    { name: 'Icy', mk: { ice: 0.6, rock: 0.4 } },
    { name: 'Ocean', mk: { rock: 0.5, ice: 0.5 } },
    { name: 'Ice giant', mk: { gas: 0.7, ice: 0.3 } },
    { name: 'Gas giant', mk: { gas: 0.95, ice: 0.05 } }
  ];

  // Editable working copy as 0–100 sliders. Seed from explicit makeup, else infer from density.
  let pct: Record<string, number> = {};
  let lastId = '';
  $: if (body.id !== lastId) { lastId = body.id; seed(); }
  function seed() {
    const f = makeupFractions(body);
    pct = {}; for (const k of KEYS) pct[k] = Math.round((f[k] ?? 0) * 100);
  }

  $: norm = normalizeMakeup(Object.fromEntries(KEYS.map((k) => [k, pct[k] || 0])) as Makeup);
  $: impliedDensity = bulkDensityFromMakeup(norm);
  $: massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  $: impliedRadiusRe = radiusReFromMassMakeup(massMe, norm);
  // The body's ACTUAL density (mass/radius). It can exceed the implied uncompressed value because
  // gravity compresses a large interior (Earth: implied ~3.7, actual 5.5 g/cc).
  $: actualDensity = body.massKg && body.radiusKm
    ? (body.massKg / ((4 / 3) * Math.PI * Math.pow(body.radiusKm * 1000, 3))) / 1000 : 0;
  $: actualRadiusRe = (body.radiusKm ?? 0) / EARTH_RADIUS_KM;

  // Composition edits are always safe — they drive classification / geology / colour. They do NOT
  // touch the size; "size follows makeup" is a deliberate opt-in (the uncompressed model is only a
  // first approximation, so a known body keeps its measured radius unless you ask).
  function apply() {
    body.makeup = { ...norm };
    dispatch('update');
  }
  function applyImpliedRadius() {
    body.radiusKm = impliedRadiusRe * EARTH_RADIUS_KM;
    apply();
  }
  function setPreset(mk: Makeup) {
    const f = normalizeMakeup(mk);
    for (const k of KEYS) pct[k] = Math.round(f[k] * 100);
    pct = { ...pct };
    apply();
  }
</script>

<div class="makeup">
  <div class="head">
    <span class="title">Interior makeup</span>
    <span class="hint">density &amp; radius derive from this</span>
  </div>

  <div class="presets">
    {#each PRESETS as p}
      <button class="preset" on:click={() => setPreset(p.mk)}>{p.name}</button>
    {/each}
  </div>

  {#each KEYS as k}
    <div class="row">
      <span class="swatch" style="background-color: {SWATCH[k]}"></span>
      <label for="mk-{k}">{LABELS[k]}</label>
      <input id="mk-{k}" type="range" min="0" max="100" step="1" bind:value={pct[k]} on:change={apply} />
      <span class="val">{Math.round((norm[k] ?? 0) * 100)}%</span>
    </div>
  {/each}

  <div class="derived">
    <div><span class="d-label">Density (actual)</span><span class="d-val">{actualDensity.toFixed(2)} g/cc</span></div>
    <div><span class="d-label">Implied (uncompr.)</span><span class="d-val muted">{impliedDensity.toFixed(2)} g/cc · {impliedRadiusRe.toFixed(2)} R⊕</span></div>
  </div>
  {#if (body.roleHint === 'planet' || body.roleHint === 'moon') && Math.abs(impliedRadiusRe - actualRadiusRe) > 0.03}
    <button class="apply-radius" on:click={applyImpliedRadius} title="Resize this body so its radius matches the makeup (uncompressed model — best for new/small bodies)">
      ↻ Size from makeup → {impliedRadiusRe.toFixed(2)} R⊕
    </button>
  {/if}
</div>

<style>
  .makeup { display: flex; flex-direction: column; gap: 6px; }
  .head { display: flex; align-items: baseline; justify-content: space-between; }
  .title { font-weight: 600; color: var(--text); }
  .hint { font-size: 0.75em; color: var(--text-faint); }
  .presets { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 6px; }
  .preset { font-size: 0.75em; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--link); cursor: pointer; }
  .preset:hover { background: var(--bg-control); }
  .row { display: grid; grid-template-columns: 14px 54px 1fr 40px; align-items: center; gap: 8px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.2); }
  .row label { font-size: 0.85em; color: var(--text-muted); }
  .row input[type="range"] { width: 100%; }
  .val { font-size: 0.8em; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
  .derived { display: flex; gap: 16px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
  .derived > div { display: flex; flex-direction: column; }
  .d-label { font-size: 0.7em; color: var(--text-faint); text-transform: uppercase; }
  .d-val { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
  .d-val.muted { color: var(--text-muted); font-weight: 400; }
  .apply-radius { margin-top: 6px; font-size: 0.78em; padding: 4px 8px; border-radius: 4px; border: 1px dashed var(--border); background: var(--bg-panel); color: var(--link); cursor: pointer; align-self: flex-start; }
  .apply-radius:hover { background: var(--bg-control); }
</style>

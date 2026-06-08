<script lang="ts">
  // §4a — interior MAKEUP control. The user tweaks the CAUSE (composition); density and radius are
  // DERIVED (more variety for less data entry). Replaces the old "set radius + read density" flow:
  // set the mass + the mix, and the size follows.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Makeup } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
  import { normalizeMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup, makeupFractions } from '$lib/physics/makeup';

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
  $: massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  $: derivedDensity = compressedDensityFromMakeup(massMe, norm); // realistic (gravity-compressed)
  $: derivedRadiusRe = radiusReFromMassMakeup(massMe, norm);
  $: drivesSize = body.roleHint === 'planet' || body.roleHint === 'moon';

  // The user is editing the CAUSE: makeup drives density, and (with mass) radius — both are now
  // derived with gravitational compression, so an Earth mix lands at ~5.5 g/cc and 1.0 R⊕. Editing
  // makeup therefore resizes the body to match. (Stars/belts keep their own sizing.)
  function apply() {
    body.makeup = { ...norm };
    if (drivesSize) body.radiusKm = derivedRadiusRe * EARTH_RADIUS_KM;
    dispatch('update');
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
    <div><span class="d-label">Density</span><span class="d-val">{derivedDensity.toFixed(2)} g/cc</span></div>
    {#if drivesSize}
      <div><span class="d-label">Radius</span><span class="d-val">{derivedRadiusRe.toFixed(2)} R⊕</span></div>
    {/if}
  </div>
  <p class="compress-note">Density is gravity-compressed by mass — a bigger interior packs denser, so the same mix is heavier on a super-Earth than on a moon.</p>
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
  .compress-note { margin: 6px 0 0; font-size: 0.72em; color: var(--text-faint); line-height: 1.4; }
</style>

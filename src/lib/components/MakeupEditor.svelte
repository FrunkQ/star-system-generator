<script lang="ts">
  // §4a — interior MAKEUP control. The user tweaks the CAUSE (composition); density and radius are
  // DERIVED (more variety for less data entry). Replaces the old "set radius + read density" flow:
  // set the mass + the mix, and the size follows.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Makeup } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
  import { normalizeMakeup, compressedDensityFromMakeup, radiusReFromMassMakeup, massMeFromRadiusMakeup, makeupFractions } from '$lib/physics/makeup';

  export let body: CelestialBody;
  // Which of mass/radius is the user-pinned driver (planets/moons). 'mass' → makeup resizes the body;
  // 'radius' → makeup re-masses it (radius stays put). Stars/belts ignore this.
  export let sizeDriver: 'mass' | 'radius' = 'mass';
  const dispatch = createEventDispatcher();

  const KEYS: Array<keyof Makeup> = ['metal', 'rock', 'carbon', 'ice', 'gas'];
  const LABELS: Record<string, string> = { metal: 'Metal', rock: 'Rock', carbon: 'Carbon', ice: 'Ice', gas: 'Gas' };
  const SWATCH: Record<string, string> = { metal: '#9c8d7a', rock: '#a9805a', carbon: '#3a3a40', ice: '#cfe6ff', gas: '#d8c79a' };

  // Presets carry a plausible mass range (Earth masses) so we only offer the ones that make sense for
  // this body — no "Gas giant" on a moonlet, no "Iron world" at Jupiter mass.
  const PRESETS: Array<{ name: string; mk: Makeup; minMe?: number; maxMe?: number; hint: string }> = [
    { name: 'Iron-rich', mk: { metal: 0.7, rock: 0.3 }, maxMe: 20, hint: 'Dense metal-core world (Mercury-like).' },
    { name: 'Rocky', mk: { rock: 0.85, metal: 0.15 }, maxMe: 20, hint: 'Silicate + metal terrestrial (Earth/Mars-like).' },
    { name: 'Carbon', mk: { carbon: 0.5, rock: 0.5 }, maxMe: 20, hint: 'Carbon-rich world (graphite/diamond interior).' },
    { name: 'Icy', mk: { ice: 0.6, rock: 0.4 }, maxMe: 25, hint: 'Ice + rock body (icy moon / Kuiper world).' },
    { name: 'Ocean', mk: { rock: 0.5, ice: 0.5 }, maxMe: 25, hint: 'Deep water/ice mantle over rock.' },
    { name: 'Ice giant', mk: { gas: 0.7, ice: 0.3 }, minMe: 3, maxMe: 100, hint: 'Volatile envelope over an icy core (Neptune-like).' },
    { name: 'Gas giant', mk: { gas: 0.95, ice: 0.05 }, minMe: 30, hint: 'Massive H/He envelope (Jupiter/Saturn-like).' }
  ];
  // Filter to the presets plausible at this body's mass (always leaves at least one across the range).
  $: visiblePresets = PRESETS.filter((p) => massMe >= (p.minMe ?? 0) && massMe <= (p.maxMe ?? Infinity));

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
    if (drivesSize) {
      if (sizeDriver === 'radius') {
        // Radius is pinned → makeup changes the implied MASS instead.
        const rRe = (body.radiusKm ?? 0) / EARTH_RADIUS_KM;
        body.massKg = massMeFromRadiusMakeup(rRe, norm) * EARTH_MASS_KG;
      } else {
        body.radiusKm = derivedRadiusRe * EARTH_RADIUS_KM;
      }
    }
    dispatch('update');
  }
  // What the makeup re-derives, for the readout below.
  $: derivedMassMe = sizeDriver === 'radius' ? massMeFromRadiusMakeup((body.radiusKm ?? 0) / EARTH_RADIUS_KM, norm) : massMe;
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

  <div class="presets-label">Composition presets <span class="presets-sub">— for this mass</span></div>
  <div class="presets">
    {#each visiblePresets as p}
      <button class="preset" title={p.hint} on:click={() => setPreset(p.mk)}>{p.name}</button>
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
    {#if drivesSize && sizeDriver === 'radius'}
      <div><span class="d-label">Mass</span><span class="d-val">{derivedMassMe < 0.01 ? derivedMassMe.toExponential(1) : derivedMassMe.toFixed(2)} M⊕</span></div>
    {:else if drivesSize}
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
  .presets-label { font-size: 0.75em; color: var(--text-muted); margin-top: 4px; }
  .presets-sub { color: var(--text-faint); }
  .presets { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0 6px; }
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

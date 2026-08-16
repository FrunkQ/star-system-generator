<script lang="ts">
  // The painter's stack, live: the morphology definitions as the rule pack actually carries them,
  // a coverage slider each, and the layered result. It reads `allMorphologies` and calls the same
  // `deriveVegetation` the processor calls — no local model of what a layer does.
  import type { CelestialBody, RulePack, BiosphereLayer } from '$lib/types';
  import { allMorphologies, deriveVegetation, vegetationTint } from '$lib/physics/vegetation';
  import { deriveSurfaceSpectrum } from '$lib/physics/surfaceSpectrum';
  import ColourSwatch from './ColourSwatch.svelte';

  let { pack = null }: { pack?: RulePack | null } = $props();

  const defs = $derived(allMorphologies(pack).slice().sort((a, b) => a.order - b.order));
  let tempK = $state(5778);
  let enabled = $state<Record<string, number>>({ microbial: 0.8, fungal: 0.4, flora: 0.6, fauna: 0, techno: 0 });

  // A stand-in for the processor's own id-seeded stream — the same recipe, so this preview shows
  // what a body with this id would actually get.
  const roll = (purpose: string) => {
    let h = 2166136261;
    const s = `physics-demo|veg|${purpose}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  };

  const layers = $derived(defs
    .filter((d) => (enabled[d.key] ?? 0) > 0)
    .map((d) => ({ morphology: d.key, coverage: enabled[d.key] }) as BiosphereLayer));

  const body = $derived({
    id: 'physics-demo', kind: 'body', name: 'Worked example', roleHint: 'planet',
    makeup: { rock: 0.7, metal: 0.3 }, calculatedGravity_ms2: 9.81, temperatureK: 288,
    atmosphere: { pressure_bar: 1, molarMassKg: 0.02896, composition: { N2: 0.78, O2: 0.21, H2O: 0.004 } },
    hydrosphere: { composition: 'water', coverage: 0.7 },
    temperatureProfile: { meanK: 288, totalMinK: 220, totalMaxK: 315,
      components: [{ source: 'latitude', label: 'Latitude', lowK: 245, highK: 303 }] },
    biosphere: { complexity: 'complex', coverage: 0.6, biochemistry: 'water-carbon',
      energy_source: 'photosynthesis', morphologies: layers }
  } as unknown as CelestialBody);

  const spec = $derived(deriveSurfaceSpectrum(body, { starTempK: tempK, luminositySolar: 1, distanceAU: 1 }, pack));
  const veg = $derived(layers.length ? deriveVegetation(body, spec?.curves, { roll }, pack) : undefined);
  const flat = $derived(vegetationTint(veg));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rangeText = (d: { min: number; max: number }) =>
    d.max <= 0 && d.min <= 0 ? 'none' : `${pct(d.min)}–${pct(d.max)}`;
</script>

<div class="stack">
  <div class="star-row">
    <label>
      <span>Star temperature <b>{Math.round(tempK)} K</b></span>
      <input type="range" min="2600" max="10000" step="50" bind:value={tempK} />
    </label>
    {#if veg?.pigmentLabel}
      <span class="pigment">Pigment drawn: <b>{veg.pigmentLabel}</b></span>
    {/if}
  </div>

  <table class="morphs">
    <thead>
      <tr><th>Order</th><th>Morphology</th><th>Coverage of the land</th><th>Own tints</th><th>Pigment-driven</th><th>Lights</th><th>Result</th></tr>
    </thead>
    <tbody>
      {#each defs as d}
        {@const drawn = veg?.layers.find((l) => l.morphology === d.key)}
        <tr>
          <td class="num">{d.order}</td>
          <td>{d.label}</td>
          <td class="slider">
            <input type="range" min="0" max="1" step="0.05"
                   value={enabled[d.key] ?? 0}
                   oninput={(e) => (enabled = { ...enabled, [d.key]: +e.currentTarget.value })} />
            <span class="num">{pct(enabled[d.key] ?? 0)}</span>
          </td>
          <td>{d.tints.length ? `${d.tints.length}` : 'none'}</td>
          <td class="num">{pct(d.pigmentDriven)}</td>
          <td>{rangeText(d.light)}</td>
          <td>
            {#if drawn?.colorHex}
              <ColourSwatch hex={drawn.colorHex} size={18} sub="" />
            {:else if (enabled[d.key] ?? 0) > 0}
              <span class="none">paints nothing</span>
            {:else}
              <span class="none">—</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="summary">
    {#if veg && flat}
      Life shows on <b>{pct(veg.visibleCover)}</b> of the land — the UNION of the layers painted over one
      another, not the sum of the sliders, which here total
      <b>{pct(layers.reduce((s, l) => s + l.coverage, 0))}</b>. Flattened to one swatch:
      <ColourSwatch hex={flat.hex} size={18} sub="" />
      Clustered at latitudes {Math.round(Math.max(0, veg.bandCentreDeg - veg.bandWidthDeg))}&#176;–{Math.round(Math.min(90, veg.bandCentreDeg + veg.bandWidthDeg))}&#176;,
      which is where water is liquid on this world — not a rule about poles.
    {:else}
      Nothing switched on, so nothing paints.
    {/if}
  </p>
</div>

<style>
  .stack {
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px; padding: 12px; margin: 14px 0;
    background: var(--bg-panel, #14161c);
  }
  .star-row { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; margin-bottom: 10px; font-size: 0.85em; }
  .star-row label { display: flex; flex-direction: column; gap: 2px; min-width: 220px; }
  .star-row input[type='range'] { width: 100%; }
  .pigment { color: var(--text-muted, #cfcfcf); }
  table.morphs { width: 100%; border-collapse: collapse; font-size: 0.82em; }
  table.morphs th { text-align: left; color: var(--text-faint, #8a8f9a); font-weight: 500; padding: 3px 6px; border-bottom: 1px solid var(--border, #2a2d36); }
  table.morphs td { padding: 3px 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: middle; }
  td.slider { display: flex; align-items: center; gap: 8px; min-width: 150px; }
  td.slider input { flex: 1; }
  .num { font-variant-numeric: tabular-nums; }
  .none { color: var(--text-faint, #8a8f9a); }
  .summary { font-size: 0.85em; color: var(--text-muted, #cfcfcf); margin: 10px 0 0; line-height: 1.7; }
</style>

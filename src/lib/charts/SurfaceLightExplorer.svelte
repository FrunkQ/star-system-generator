<script lang="ts">
  // THE PHYSICS PAGE'S LIVE WORKED EXAMPLE: build a world, watch its surface spectrum change, and
  // see which pigments that light favours. Every number here comes from the engine's own functions —
  // `deriveSurfaceSpectrum` and `scorePigments`, the same two the processor calls on every body.
  // Nothing is recomputed locally, because a diagram that recomputes what it draws is a second
  // authority on it (G23).
  import type { CelestialBody, RulePack } from '$lib/types';
  import { deriveSurfaceSpectrum } from '$lib/physics/surfaceSpectrum';
  import { scorePigments, absorptance, pigmentDef, pigmentModel } from '$lib/physics/pigments';
  import { wienPeakNm } from '$lib/physics/spectrum';
  import SpectrumChart from './SpectrumChart.svelte';
  import ColourSwatch from './ColourSwatch.svelte';
  import UnderThisLight from './UnderThisLight.svelte';

  let { pack = null }: { pack?: RulePack | null } = $props();

  const ATMOSPHERES: Record<string, { label: string; pressure: number; molar: number; comp: Record<string, number>; note: string }> = {
    none:   { label: 'Airless', pressure: 0, molar: 0.028, comp: {}, note: 'Nothing between the star and the ground — the reference charts’ model, and the only case where the star’s spectrum IS the surface spectrum.' },
    earth:  { label: 'Earth-like, 1 bar', pressure: 1, molar: 0.02896, comp: { N2: 0.78, O2: 0.21, Ar: 0.009, CO2: 0.0004, H2O: 0.004 }, note: 'Rayleigh takes the blue end; water vapour punches notches through the near infrared.' },
    thick:  { label: 'Thick CO₂, 10 bar', pressure: 10, molar: 0.044, comp: { CO2: 0.95, N2: 0.05 }, note: 'A deep carbon-dioxide column scatters hard enough to redden the ground badly.' },
    titan:  { label: 'Methane haze, 1.5 bar', pressure: 1.5, molar: 0.028, comp: { N2: 0.94, CH4: 0.056 }, note: 'Methane eats band after band across the red and near infrared.' },
    venus:  { label: 'Venus-like, 92 bar', pressure: 92, molar: 0.044, comp: { CO2: 0.965, N2: 0.035 }, note: 'Almost nothing reaches the ground, and what does is deep red.' }
  };

  let tempK = $state(5778);
  let lumSolar = $state(1);
  let distAU = $state(1);
  let atmKey = $state('earth');
  let focusPigment = $state<string | null>(null);

  const atm = $derived(ATMOSPHERES[atmKey]);
  const body = $derived({
    id: 'physics-demo', kind: 'body', name: 'Worked example', roleHint: 'planet',
    makeup: { rock: 0.7, metal: 0.3 }, calculatedGravity_ms2: 9.81,
    atmosphere: atm.pressure > 0
      ? { pressure_bar: atm.pressure, molarMassKg: atm.molar, composition: atm.comp }
      : undefined
  } as unknown as CelestialBody);

  const result = $derived(deriveSurfaceSpectrum(body, { starTempK: tempK, luminositySolar: lumSolar, distanceAU: distAU }, pack));
  const spec = $derived(result?.summary);
  const curves = $derived(result?.curves);
  const ranks = $derived(curves ? scorePigments(curves.surface, pack) : []);
  const shown = $derived(focusPigment ?? ranks[0]?.key ?? null);
  // The pigment's share OF THE ARRIVING LIGHT, in the same units as the spectrum — surface x
  // absorptance. Drawn on the same axis, so the notch in it where the spectrum peaks IS the green
  // gap, visible rather than asserted.
  const shownAbsorbed = $derived.by(() => {
    const def = pigmentDef(shown ?? undefined, pack);
    if (!def || !curves) return null;
    const abs = absorptance(def, 0);
    return curves.surface.map((v, i) => v * abs[i]);
  });
  const model = $derived(pigmentModel(pack));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
</script>

<div class="explorer">
  <div class="controls">
    <label>
      <span>Star temperature <b>{Math.round(tempK)} K</b></span>
      <input type="range" min="2400" max="12000" step="50" bind:value={tempK} />
      <small>Wien peak {Math.round(wienPeakNm(tempK))} nm, per unit wavelength</small>
    </label>
    <label>
      <span>Luminosity <b>{lumSolar < 0.1 ? lumSolar.toFixed(3) : lumSolar.toFixed(2)} L&#9737;</b></span>
      <input type="range" min="-3" max="2" step="0.05"
             value={Math.log10(lumSolar)}
             oninput={(e) => (lumSolar = Math.pow(10, +e.currentTarget.value))} />
      <small>logarithmic</small>
    </label>
    <label>
      <span>Distance <b>{distAU < 1 ? distAU.toFixed(2) : distAU.toFixed(1)} AU</b></span>
      <input type="range" min="-1.3" max="1.3" step="0.02"
             value={Math.log10(distAU)}
             oninput={(e) => (distAU = Math.pow(10, +e.currentTarget.value))} />
      <small>logarithmic</small>
    </label>
    <label class="atm">
      <span>Sky</span>
      <select bind:value={atmKey}>
        {#each Object.entries(ATMOSPHERES) as [k, v]}<option value={k}>{v.label}</option>{/each}
      </select>
      <small>{atm.note}</small>
    </label>
  </div>

  {#if spec && curves}
    <SpectrumChart
      surface={curves.surface}
      topOfAtmosphere={curves.topOfAtmosphere}
      absorbed={shownAbsorbed}
      peakNm={spec.peakSurfaceNm}
      peakLabel="ground peak"
      absorbedLabel={`what ${pigmentDef(shown ?? undefined, pack)?.label ?? 'the pigment'} takes`}
      yLabel="W&#183;m&#8315;&#178;&#183;nm&#8315;&#185;"
      title="Irradiance against wavelength — above the atmosphere, and at the ground" />

    <div class="readout">
      <div class="fig"><span class="k">Above the atmosphere</span><span class="v">{Math.round(spec.totalTopWm2)} W/m&#178;</span></div>
      <div class="fig"><span class="k">At the {spec.level}</span><span class="v">{Math.round(spec.totalSurfaceWm2)} W/m&#178;</span></div>
      <div class="fig"><span class="k">Star peak</span><span class="v">{spec.peakTopNm} nm</span></div>
      <div class="fig"><span class="k">Ground peak</span><span class="v">{spec.peakSurfaceNm} nm</span></div>
      <div class="fig swatch">
        <span class="k">Daylight there</span>
        <ColourSwatch hex={spec.surfaceLightHex} sub="as human eyes would see it" />
      </div>
    </div>

    {#if spec.attenuators.length}
      <p class="attenuators">
        <span>What the sky takes, at each one's WORST band:</span>
        {#each spec.attenuators as a, i}<em>{a.label} {pct(a.strength)}{i < spec.attenuators.length - 1 ? ',' : ''}</em> {/each}
        <span class="whole">Across the whole grid it keeps {pct(spec.totalTopWm2 > 0 ? spec.totalSurfaceWm2 / spec.totalTopWm2 : 0)}.</span>
      </p>
    {:else}
      <p class="attenuators"><span>Nothing between the star and the ground.</span></p>
    {/if}

    <h4>Which pigment does that light favour?</h4>
    <p class="note">
      Several, always. Click a row to draw its absorption over the spectrum above. <strong>Capture</strong>
      is how far what it absorbs reaches the flux a photosystem can actually process — it saturates, which
      is why absorbing more stops helping on a bright world. <strong>Protection</strong> is what it avoids:
      overload, and the energy wasted as heat when a photon lands harder than the reaction centre can use.
      <strong>Steadiness</strong> is whether it feeds off the steep flanks of the spectrum rather than its
      summit. The three multiply, so each one switches itself off where it stops meaning anything.
    </p>
    <table class="pigments">
      <thead>
        <tr><th>Pigment</th><th>Looks like</th><th>Capture</th><th>Protection</th><th>Steadiness</th><th>Score</th><th>Chance</th></tr>
      </thead>
      <tbody>
        {#each ranks as r}
          <tr class:focus={r.key === shown} class:dead={!r.viable}
              onclick={() => (focusPigment = focusPigment === r.key ? null : r.key)}>
            <td>{r.label}</td>
            <td><ColourSwatch hex={r.reflectedUnderStarHex} size={18} sub="" /></td>
            <td>{pct(r.sufficiency)}</td>
            <td>{pct(r.protection)}</td>
            <td>{pct(r.steadiness)}</td>
            <td>{r.score.toFixed(3)}</td>
            <td>{r.viable ? pct(r.drawWeight) : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <h4>And what it looks like from inside</h4>
    <p class="note">
      The same light at eye level. Left of the line is a familiar reference as it looks at home; right of it
      is the same surfaces under <strong>the star and sky set above</strong>. Move those controls and this
      moves with them — it is the answer to a question that comes up at a table more often than it should:
      <em>can they tell which wire is the red one?</em>
    </p>
    <UnderThisLight light={curves.surface} {pack} height={230} />

    <p class="note small">
      Saturating flux {model.saturationFlux.toExponential(1)} photons&#183;m&#8315;&#178;&#183;s&#8315;&#185;; reaction centre
      {model.reactionCentreNm} nm; damage threshold {model.damageThresholdNm} nm; viable at
      {pct(model.viabilityFraction)} of the leader. Every one of those is rule-pack data — change them and
      this table changes with them.
    </p>
  {:else}
    <p class="note">No star, no light, no answer.</p>
  {/if}
</div>

<style>
  .explorer {
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    padding: 12px;
    margin: 14px 0;
    background: var(--bg-panel, #14161c);
  }
  .controls { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
  .controls label { display: flex; flex-direction: column; gap: 2px; min-width: 190px; flex: 1 1 190px; font-size: 0.85em; }
  .controls small { color: var(--text-faint, #8a8f9a); font-size: 0.85em; }
  .controls input[type='range'] { width: 100%; }
  .controls select { padding: 4px; background: var(--bg-control, #1b1e26); color: var(--text, #eee); border: 1px solid var(--border, #2a2d36); border-radius: 4px; }
  .readout { display: flex; flex-wrap: wrap; gap: 18px; margin: 6px 0 4px; font-size: 0.85em; }
  .fig { display: flex; flex-direction: column; gap: 1px; }
  .fig.swatch { justify-content: flex-start; }
  .k { color: var(--text-faint, #8a8f9a); font-size: 0.85em; }
  .v { font-variant-numeric: tabular-nums; }
  .attenuators { font-size: 0.82em; color: var(--text-muted, #cfcfcf); margin: 4px 0 10px; }
  .attenuators span { color: var(--text-faint, #8a8f9a); }
  .attenuators em { font-style: normal; }
  .attenuators .whole { display: block; }
  h4 { margin: 12px 0 4px; font-size: 0.9em; text-transform: uppercase; color: var(--link, #6cb6ff); }
  .note { font-size: 0.85em; color: var(--text-muted, #cfcfcf); margin: 0 0 8px; }
  .note.small { font-size: 0.78em; color: var(--text-faint, #8a8f9a); }
  table.pigments { width: 100%; border-collapse: collapse; font-size: 0.82em; }
  table.pigments th { text-align: left; color: var(--text-faint, #8a8f9a); font-weight: 500; padding: 3px 6px; border-bottom: 1px solid var(--border, #2a2d36); }
  table.pigments td { padding: 3px 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-variant-numeric: tabular-nums; }
  table.pigments tbody tr { cursor: pointer; }
  table.pigments tbody tr:hover { background: rgba(255, 255, 255, 0.04); }
  table.pigments tr.focus { background: rgba(108, 182, 255, 0.12); }
  table.pigments tr.dead td { color: var(--text-faint, #8a8f9a); }
</style>

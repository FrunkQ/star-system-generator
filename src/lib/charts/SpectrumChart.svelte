<script lang="ts">
  // THE SPECTRUM PLOT — irradiance against wavelength, the peak marked, a wavelength ribbon along
  // the axis, and optional absorption bands shaded over the top.
  //
  // IT COMPUTES NOTHING. Every series arrives as a prop from the engine's own derivation; the only
  // thing this file decides is where a pixel goes. A plot that derived its own spectrum would be a
  // second authority on it (G23), which is exactly the fault the surface-spectrum work exists to
  // remove one layer down.
  import { GRID_NM, wavelengthHex } from '$lib/physics/spectrum';
  import PlotAxes from './PlotAxes.svelte';
  import { DEFAULT_BOX, xScale, yScale, polyline, areaPath, niceMax, type PlotBox } from './plotScale';

  let {
    surface,
    topOfAtmosphere = null,
    absorbed = null,
    peakNm = null,
    peakLabel = 'peak',
    absorbedLabel = 'pigment absorption',
    surfaceLabel = 'reaching the ground',
    topLabel = 'above the atmosphere',
    yLabel = 'irradiance',
    box = DEFAULT_BOX,
    title = ''
  }: {
    surface: number[];
    topOfAtmosphere?: number[] | null;
    absorbed?: number[] | null;
    peakNm?: number | null;
    peakLabel?: string;
    absorbedLabel?: string;
    surfaceLabel?: string;
    topLabel?: string;
    yLabel?: string;
    box?: PlotBox;
    title?: string;
  } = $props();

  const yMax = $derived(niceMax([...(topOfAtmosphere ?? []), ...surface]));
  const sx = $derived(xScale(box, GRID_NM[0], GRID_NM[GRID_NM.length - 1]));
  const sy = $derived(yScale(box, 0, yMax));
  // NOTE what `absorbed` is, because the obvious alternative is a quiet lie in picture form. It is
  // the pigment's share OF THE ARRIVING LIGHT, in the same W·m⁻²·nm⁻¹ as everything else on this
  // axis — not its 0..1 absorptance. A 0..1 fraction plotted against an irradiance axis fills the
  // frame and reads as "it absorbs nearly everything" whatever the light is actually doing, which is
  // PHY-2's fault drawn rather than written. Plotting the absorbed POWER also makes the green gap
  // visible: the curve dips exactly where the spectrum is strongest.

  // The wavelength ribbon: one stop per grid bin, coloured through the SAME colour-matching path
  // the engine uses. It goes black past the red end, which is the honest thing for a chart whose
  // x-axis runs well into the infrared — that light is there, and you cannot see it.
  const ribbon = $derived(GRID_NM.map((nm) => ({ nm, hex: wavelengthHex(nm), off: ((nm - sx.min) / (sx.max - sx.min)) * 100 })));
  const uid = `sp${Math.random().toString(36).slice(2, 8)}`;
</script>

<figure class="spectrum-chart">
  {#if title}<figcaption>{title}</figcaption>{/if}
  <svg viewBox={`0 0 ${box.width} ${box.height}`} role="img"
       aria-label={`${title || 'Spectrum'}: irradiance against wavelength from ${GRID_NM[0]} to ${GRID_NM[GRID_NM.length - 1]} nanometres${peakNm ? `, peaking at ${Math.round(peakNm)} nanometres` : ''}.`}>
    <defs>
      <linearGradient id={`ribbon-${uid}`} x1="0" x2="1" y1="0" y2="0">
        {#each ribbon as s}<stop offset={`${s.off}%`} stop-color={s.hex} />{/each}
      </linearGradient>
    </defs>

    <PlotAxes {box} {sx} {sy} xLabel="wavelength" xUnit="nm" {yLabel}
      yFormat={(v) => (yMax >= 100 ? String(Math.round(v)) : v.toPrecision(2))} />

    <!-- Above the atmosphere: the star as it arrives, before the sky takes its cut. -->
    {#if topOfAtmosphere}
      <polyline class="top" points={polyline(GRID_NM, topOfAtmosphere, sx, sy)} />
    {/if}

    <!-- Reaching the ground. The gap between the two lines IS the filter, and the notches in it are
         the bands the atmosphere and cloud decks ate. -->
    <path class="surface-fill" d={areaPath(GRID_NM, surface, sx, sy)} />
    <polyline class="surface" points={polyline(GRID_NM, surface, sx, sy)} />

    <!-- What the pigment actually takes out of that light, on the SAME axis as the light. -->
    {#if absorbed}
      <path class="absorb" d={areaPath(GRID_NM, absorbed, sx, sy)} />
    {/if}

    {#if peakNm}
      <line class="peak" x1={sx(peakNm)} x2={sx(peakNm)} y1={box.padTop} y2={box.height - box.padBottom} />
      <text class="peak-label" x={sx(peakNm) + 4} y={box.padTop + 10}>{peakLabel} {Math.round(peakNm)} nm</text>
    {/if}

    <!-- The wavelength ribbon, under the x axis. -->
    <rect x={box.padLeft} y={box.height - box.padBottom + 2} width={box.width - box.padRight - box.padLeft}
          height="5" fill={`url(#ribbon-${uid})`} />
  </svg>

  <div class="legend">
    {#if topOfAtmosphere}<span class="key top-key">{topLabel}</span>{/if}
    <span class="key surface-key">{surfaceLabel}</span>
    {#if absorbed}<span class="key absorb-key">{absorbedLabel}</span>{/if}
  </div>
</figure>

<style>
  .spectrum-chart { margin: 12px 0; }
  figcaption { font-size: 0.85em; color: var(--text-muted, #cfcfcf); margin-bottom: 4px; }
  svg { width: 100%; height: auto; display: block; }
  .top { fill: none; stroke: var(--text-faint, #8a8f9a); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .surface { fill: none; stroke: var(--link, #6cb6ff); stroke-width: 1.6; }
  .surface-fill { fill: var(--link, #6cb6ff); fill-opacity: 0.16; }
  .absorb { fill: #7ad07a; fill-opacity: 0.22; stroke: #7ad07a; stroke-opacity: 0.6; stroke-width: 1; }
  .peak { stroke: #ffcc55; stroke-width: 1; stroke-dasharray: 3 2; }
  .peak-label { fill: #ffcc55; font-size: 10px; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.75em; color: var(--text-faint, #8a8f9a); margin-top: 2px; }
  .key::before {
    content: ''; display: inline-block; width: 14px; height: 3px; margin-right: 5px; vertical-align: middle;
  }
  .top-key::before { background: var(--text-faint, #8a8f9a); }
  .surface-key::before { background: var(--link, #6cb6ff); }
  .absorb-key::before { background: #7ad07a; }
</style>

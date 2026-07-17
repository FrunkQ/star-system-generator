<script lang="ts">
  // Interior CUTAWAY (composition redesign stage 4, revised per review): the body's rendered
  // surface (PlanetDisc — so oceans, ice caps, craters and irregular asteroids all show) with a
  // wedge cut out revealing the interior layers, planetary-illustration style. Layers derive live
  // from the makeup mass fractions — metal core out through rock / carbon / ice to a gas envelope —
  // with radii from VOLUME fractions (mass fraction / grain density, normalised; r ∝ cbrt of
  // cumulative volume). Derived fluid layers overlay: a subsurface ocean splits the ice band, a
  // surface liquid films the outermost solid layer. Porosity renders as void speckles, seeded from
  // the body id so the picture is repeatable. Purely presentational — nothing here writes back.
  import type { CelestialBody, Makeup } from '$lib/types';
  import { EARTH_MASS_KG } from '$lib/constants';
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
  import { isSmallBodyShape, smallBodyOutline } from '$lib/catalogue/smallBodyShape';

  export let body: CelestialBody;
  export let makeup: Required<Makeup>;
  export let porosity = 0;
  export let seed = 'body';
  export let size = 120;
  export let subsurfaceOcean: { colorHex?: string } | null = null;
  export let surfaceLiquid: { colorHex?: string } | null = null;
  export let compNote = ''; // explainer shown as the composition disc's tooltip

  const GRAIN: Required<Makeup> = { metal: 7.9, rock: 3.3, carbon: 2.3, ice: 0.95, gas: 0.12 };
  // Inside → out. Colours match the makeup-slider swatches.
  const ORDER: Array<keyof Makeup> = ['metal', 'rock', 'carbon', 'ice', 'gas'];
  const COLOUR: Record<string, string> = { metal: '#8e939e', rock: '#a9805a', carbon: '#3a3a40', ice: '#cfe6ff', gas: '#d8c79a' };
  const LABEL: Record<string, string> = { metal: 'Metal core', rock: 'Rock mantle', carbon: 'Carbon layer', ice: 'Ice shell', gas: 'Gas envelope' };

  // Half cutaway: the RIGHT half of the disc is the rendered planet surface; the LEFT half is the
  // cross-section, split into an upper quarter (composition layers) and a lower quarter (internal-
  // heat gradient). Everything is drawn as FULL concentric circles — identical geometry to the
  // planet disc itself — and simply clipped to its quarter, so every arc and corner lines up
  // exactly with the disc and with the other quarter (no hand-built pie-sector paths).
  const R_MAX = 30;
  const CX = 50, CY = 50;
  // Small bodies render as a seeded potato, not a circle — clip the whole cutaway to the SAME
  // silhouette PlanetDisc draws so the cut faces stop at the rendered edge, not at r=30.
  $: bodyOutline = isSmallBodyShape(body) ? smallBodyOutline(body) : '';

  $: layers = (() => {
      const vols = ORDER.map((k) => (makeup[k] ?? 0) / GRAIN[k]);
      const total = vols.reduce((a, v) => a + v, 0);
      if (total <= 0) return [];
      let cum = 0;
      const out: { key: string; r: number; fill: string; label: string }[] = [];
      for (let i = 0; i < ORDER.length; i++) {
          if (vols[i] <= 1e-6) continue;
          cum += vols[i] / total;
          out.push({ key: ORDER[i] as string, r: R_MAX * Math.cbrt(cum), fill: COLOUR[ORDER[i] as string], label: LABEL[ORDER[i] as string] });
      }
      // Subsurface ocean: split the ice band — liquid beneath, a thinner frozen crust on top.
      // (Schematic split; the physics only asserts "liquid under ice", not the exact depth.)
      const iceIdx = out.findIndex((l) => l.key === 'ice');
      if (subsurfaceOcean && iceIdx > -1) {
          const innerR = iceIdx > 0 ? out[iceIdx - 1].r : 0;
          const oceanR = innerR + (out[iceIdx].r - innerR) * 0.55;
          out.splice(iceIdx, 0, { key: 'subsurface-ocean', r: oceanR, fill: subsurfaceOcean.colorHex ?? '#3a6ea5', label: 'Subsurface ocean' });
      }
      // Surface liquid: a thin film over the outermost SOLID layer (under any gas envelope).
      if (surfaceLiquid) {
          const gasIdx = out.findIndex((l) => l.key === 'gas');
          const solidTopIdx = gasIdx === -1 ? out.length - 1 : gasIdx - 1;
          if (solidTopIdx >= 0) {
              const rTop = out[solidTopIdx].r;
              out.splice(solidTopIdx + 1, 0, { key: 'surface-liquid', r: rTop + 1.4, fill: surfaceLiquid.colorHex ?? '#2b6cb0', label: 'Surface liquid' });
              for (let i = solidTopIdx + 2; i < out.length; i++) out[i].r = Math.max(out[i].r, rTop + 1.8);
          }
      }
      return out;
  })();

  // MOLTEN CORE glow: a metal-cored world keeps a liquid, convecting core while it still has the
  // internal heat to — which is exactly the geothermal vigor the physics already derives from
  // AGE, SIZE and COMPOSITION (Earth today ≈ 1; small/old worlds like Mars/the Moon cool to a dead
  // solid core; young/large or tidally-flexed worlds run hot). We read that stored value. Icy
  // cryovolcanic worlds are excluded — their "liquid" is the blue subsurface ocean, not a hot metal
  // core. No geoActivity / no metal / cooled interior → no glow.
  $: coreHeat = (() => {
      const metal = makeup.metal ?? 0;
      const geo = (body as any).geoActivity;
      if (!geo || metal < 0.03 || geo.regime === 'cryovolcanic') return 0;
      const v = Math.max(0, geo.vigor ?? 0);
      return Math.max(0, Math.min(1, (v - 0.2) / 2.3));   // dead (≲0.2) → 0, vigorous (≳2.5) → full
  })();
  function heatColour(t: number): string {
      const stops: Array<[number, [number, number, number]]> = [
          [0, [90, 18, 6]], [0.35, [150, 40, 10]], [0.6, [205, 82, 26]], [0.8, [235, 138, 44]], [1, [255, 210, 128]]
      ];
      const c = Math.max(0, Math.min(1, t));
      for (let i = 1; i < stops.length; i++) {
          if (c <= stops[i][0]) {
              const [t0, a] = stops[i - 1], [t1, b] = stops[i];
              const f = (c - t0) / (t1 - t0);
              return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
          }
      }
      return 'rgb(255,210,128)';
  }
  $: coreColour = heatColour(coreHeat);
  $: coreGlowR = (() => {
      const rock = layers.find((l) => l.key === 'rock');
      const metalL = layers.find((l) => l.key === 'metal');
      return Math.min(R_MAX, (rock?.r ?? metalL?.r ?? R_MAX * 0.45) * 1.15);
  })();

  // INTERNAL TEMPERATURE gradient (Alex). Absolute core temperatures are genuinely uncertain — a gas
  // giant's is model-dependent to a factor of two (Jupiter ~20,000–50,000 K) — so we do NOT assert a
  // core number. What IS robust: the surface temp (we compute it) and that the interior gets hotter
  // inward (an adiabat for convective bodies, a radiogenic geotherm for rocky ones). So the wedge is
  // a gradient with the surface anchored (the one hard number in the key) and the core shown as a
  // qualitative BAND. The internal coreTempK below only selects the hot-end colour + band word.
  $: surfaceK = body.temperatureK ?? body.equilibriumTempK ?? 0;
  $: coreTempK = (() => {
      const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
      const rockyFrac = (makeup.metal ?? 0) + (makeup.rock ?? 0) + (makeup.carbon ?? 0);
      const gasFrac = makeup.gas ?? 0;
      if (gasFrac > 0.5) return surfaceK + 16000 * Math.min(2, Math.max(0.3, Math.cbrt(Math.max(massMe, 1) / 300)));
      const geo = (body as any).geoActivity;
      const vigor = Math.max(0, geo?.vigor ?? 0);
      const sizeFactor = Math.min(2.5, Math.max(0.1, Math.sqrt(Math.max(massMe, 1e-6))));
      const heatFactor = Math.min(1.3, 0.3 + 0.55 * Math.min(2, vigor));  // a dead core still holds residual heat
      const rise = 5400 * sizeFactor * heatFactor * Math.max(0.2, rockyFrac);
      return surfaceK + rise;
  })();
  // Qualitative core-heat band — no fake kelvins. Silicate/metal melt ~1400–1800 K, so "Molten" starts
  // there; giants and vigorous super-Earths reach "Very hot".
  $: coreBand = coreTempK >= 5000 ? 'Very hot core'
      : coreTempK >= 1600 ? 'Molten core'
      : coreTempK >= 800 ? 'Hot core'
      : coreTempK >= 400 ? 'Warm core'
      : 'Cool core';
  // Cold → hot thermal ramp for the temperature wedge + key. Blues are ALWAYS the cold end and
  // nothing on the warm side reads cooler than what's inside it — navy → blue → pale steel →
  // warm grey → red → orange → amber. (No green: it sat between blue and yellow and made a
  // 300 K layer look "warmer" than intuition allows next to a 90 K blue.)
  function tempColour(K: number): string {
      const stops: Array<[number, [number, number, number]]> = [
          [0, [16, 20, 58]], [80, [30, 54, 122]], [200, [62, 102, 170]], [285, [122, 150, 188]],
          [450, [152, 132, 118]], [800, [148, 60, 28]], [1600, [204, 76, 24]], [3000, [234, 130, 44]], [5500, [250, 190, 92]], [8000, [255, 228, 170]]
      ];
      const c = Math.max(0, K);
      for (let i = 1; i < stops.length; i++) {
          if (c <= stops[i][0]) {
              const [t0, a] = stops[i - 1], [t1, b] = stops[i];
              const f = (c - t0) / (t1 - t0);
              return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
          }
      }
      return 'rgb(255,224,160)';
  }
  $: tempCoreCol = tempColour(coreTempK);
  $: tempMidCol = tempColour((coreTempK + surfaceK) / 2);
  $: tempSurfCol = tempColour(surfaceK);

  // Void speckles for porous bodies: scattered in the OUTER solid region (voids survive where
  // pressure is lowest), count and size scaling with the void fraction.
  $: voids = (() => {
      if (porosity < 0.03 || !layers.length) return [] as { x: number; y: number; r: number }[];
      const solid = layers.filter((l) => l.key !== 'gas' && l.key !== 'surface-liquid' && l.key !== 'subsurface-ocean');
      if (!solid.length) return [];
      const rOut = solid[solid.length - 1].r;
      let s = 17; for (let k = 0; k < seed.length; k++) s = (s * 31 + seed.charCodeAt(k)) & 0xffffff;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const n = Math.round(6 + porosity * 40);
      return Array.from({ length: n }, () => {
          const a = rnd() * 2 * Math.PI;
          const rr = rOut * (0.45 + 0.5 * Math.sqrt(rnd()));   // biased outward
          return { x: 50 + Math.cos(a) * rr * 0.95, y: 50 + Math.sin(a) * rr * 0.95, r: 0.5 + rnd() * (0.7 + porosity * 1.5) };
      });
  })();
</script>

<div class="xsec" style="width:{size}px">
  <div class="stack" style="width:{size}px; height:{size}px" title={compNote ? compNote + '\n\nUpper-left: composition layers. Lower-left: internal heat (estimated). Right: surface.' : ''}>
    <PlanetDisc {body} {size} showStamp={false} />
    <svg viewBox="0 0 100 100" width={size} height={size} class="cut" role="img" aria-label="Half cutaway: surface on the right; composition (upper) and internal heat (lower) on the left">
      <defs>
        <!-- Spherical shading for the 3D look: highlight upper-left, shadow lower-right (anchored
             to the disc in user units so both quarters share one light). -->
        <radialGradient id="xsec-shade-{seed}" gradientUnits="userSpaceOnUse" cx="42" cy="36" r="46">
          <stop offset="0%" stop-color="rgba(255,255,255,0.16)" />
          <stop offset="46%" stop-color="rgba(255,255,255,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.5)" />
        </radialGradient>
        <!-- Temperature: hot at the core (centre), cool at the surface (rim). -->
        <radialGradient id="xsec-temp-{seed}" gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={R_MAX}>
          <stop offset="0%" stop-color={tempCoreCol} />
          <stop offset="55%" stop-color={tempMidCol} />
          <stop offset="100%" stop-color={tempSurfCol} />
        </radialGradient>
        {#if coreHeat > 0.02}
          <radialGradient id="xsec-core-{seed}" gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={coreGlowR}>
            <stop offset="0%" stop-color={coreColour} stop-opacity={(0.7 * coreHeat + 0.3).toFixed(2)} />
            <stop offset="60%" stop-color={coreColour} stop-opacity={(0.4 * coreHeat).toFixed(2)} />
            <stop offset="100%" stop-color={coreColour} stop-opacity="0" />
          </radialGradient>
        {/if}
        <!-- Quarter masks + the body's own silhouette: every face is a FULL concentric circle
             clipped to its quarter, then to the silhouette — so all corners and arcs line up with
             the rendered disc exactly (including irregular small bodies). -->
        <clipPath id="xsec-q-comp-{seed}"><rect x="0" y="0" width="50" height="50" /></clipPath>
        <clipPath id="xsec-q-temp-{seed}"><rect x="0" y="50" width="50" height="50" /></clipPath>
        <clipPath id="xsec-half-{seed}"><rect x="0" y="0" width="50" height="100" /></clipPath>
        <clipPath id="xsec-body-{seed}">
          {#if bodyOutline}<path d={bodyOutline} />{:else}<circle cx={CX} cy={CY} r={R_MAX} />{/if}
        </clipPath>
      </defs>

      <g clip-path="url(#xsec-body-{seed})">
        <!-- UPPER-LEFT quarter: composition layers, outermost first (a rect so it reaches the
             silhouette edge even on a lumpy outline), then inner circles on top. -->
        <g clip-path="url(#xsec-q-comp-{seed})">
          <rect x="0" y="0" width="50" height="50" fill={[...layers].pop()?.fill ?? '#0a0c12'}><title>{[...layers].pop()?.label ?? ''}</title></rect>
          {#each [...layers].reverse().slice(1) as l}
            <circle cx={CX} cy={CY} r={l.r} fill={l.fill}><title>{l.label}</title></circle>
          {/each}
        </g>

        <!-- LOWER-LEFT quarter: the internal-heat gradient (rect: the gradient's rim colour IS the
             surface temperature, so overrun past r=30 stays correct on lumpy outlines). -->
        <g clip-path="url(#xsec-q-temp-{seed})">
          <rect x="0" y="50" width="50" height="50" fill="url(#xsec-temp-{seed})"><title>Internal heat (estimated) — hot core to cool surface</title></rect>
        </g>

        <!-- Molten-core emission + 3D shade across the whole cut half. -->
        <g clip-path="url(#xsec-half-{seed})">
          {#if coreHeat > 0.02}
            <circle cx={CX} cy={CY} r={coreGlowR} fill="url(#xsec-core-{seed})" />
          {/if}
          <rect x="0" y="0" width="50" height="100" fill="url(#xsec-shade-{seed})" />
        </g>

        <!-- Cut plane down the middle (surface | interior) + the divider between the two quarters. -->
        <line x1={CX} y1="0" x2={CX} y2="100" stroke="rgba(255,255,255,0.22)" stroke-width="0.7" />
        <line x1="0" y1={CY} x2={CX} y2={CY} stroke="rgba(8,8,12,0.5)" stroke-width="0.6" />
      </g>
    </svg>
  </div>
  <div class="tempkey" style="width:{size}px" title="Internal heat (estimated): {Math.round(surfaceK)} K at the surface, rising inward to a {coreBand.toLowerCase()}. The surface temperature is computed; the core's exact value is model-dependent, so it's a qualitative band.">
    <div class="tempkey-bar" style="background: linear-gradient(to right, {tempSurfCol}, {tempMidCol}, {tempCoreCol});"></div>
  </div>
</div>

<style>
  .xsec { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .stack { position: relative; }
  .stack :global(.disc-wrap) { position: absolute; inset: 0; }
  .cut { position: absolute; inset: 0; pointer-events: none; }
  .tempkey { display: flex; flex-direction: column; gap: 1px; }
  .tempkey-bar { height: 5px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.4); }
</style>

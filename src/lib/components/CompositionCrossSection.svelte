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
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';

  export let body: CelestialBody;
  export let makeup: Required<Makeup>;
  export let porosity = 0;
  export let seed = 'body';
  export let size = 120;
  export let subsurfaceOcean: { colorHex?: string } | null = null;
  export let surfaceLiquid: { colorHex?: string } | null = null;

  const GRAIN: Required<Makeup> = { metal: 7.9, rock: 3.3, carbon: 2.3, ice: 0.95, gas: 0.12 };
  // Inside → out. Colours match the makeup-slider swatches.
  const ORDER: Array<keyof Makeup> = ['metal', 'rock', 'carbon', 'ice', 'gas'];
  const COLOUR: Record<string, string> = { metal: '#9c8d7a', rock: '#a9805a', carbon: '#3a3a40', ice: '#cfe6ff', gas: '#d8c79a' };
  const LABEL: Record<string, string> = { metal: 'Metal core', rock: 'Rock mantle', carbon: 'Carbon layer', ice: 'Ice shell', gas: 'Gas envelope' };

  // Interior radii match the PlanetDisc sphere (r=30 in its 100-box) so the wedge lines up.
  const R_MAX = 30;
  // The cut: a wedge opening toward the lower-right (SVG angles, y-down).
  const WEDGE_A0 = (15 * Math.PI) / 180;
  const WEDGE_A1 = (105 * Math.PI) / 180;
  const wedgePt = (a: number, r: number) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  const wedgePath = (() => {
    const R = R_MAX + 1.5;
    const [x0, y0] = wedgePt(WEDGE_A0, R);
    const [x1, y1] = wedgePt(WEDGE_A1, R);
    return `M 50 50 L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
  })();

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
  <div class="stack" style="width:{size}px; height:{size}px">
    <PlanetDisc {body} {size} showStamp={false} />
    <svg viewBox="0 0 100 100" width={size} height={size} class="cut" role="img" aria-label="Interior cutaway">
      <defs>
        <clipPath id="wedge-{seed}"><path d={wedgePath} /></clipPath>
        <!-- Spherical shading so the flat layers read as a 3D globe: highlight upper-left, shadow lower-right. -->
        <radialGradient id="xsec-shade-{seed}" cx="38%" cy="33%" r="72%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.18)" />
          <stop offset="44%" stop-color="rgba(255,255,255,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.52)" />
        </radialGradient>
        {#if coreHeat > 0.02}
          <radialGradient id="xsec-core-{seed}" gradientUnits="userSpaceOnUse" cx="50" cy="50" r={coreGlowR}>
            <stop offset="0%" stop-color={coreColour} stop-opacity={(0.7 * coreHeat + 0.25).toFixed(2)} />
            <stop offset="55%" stop-color={coreColour} stop-opacity={(0.45 * coreHeat).toFixed(2)} />
            <stop offset="100%" stop-color={coreColour} stop-opacity="0" />
          </radialGradient>
        {/if}
      </defs>
      <g clip-path="url(#wedge-{seed})">
        <path d={wedgePath} fill="#0c0e14" />
        {#each [...layers].reverse() as l}
          <circle cx="50" cy="50" r={l.r} fill={l.fill}><title>{l.label}</title></circle>
        {/each}
        {#each voids as v}
          <circle cx={v.x} cy={v.y} r={v.r} fill="rgba(10,10,14,0.55)" />
        {/each}
        <!-- 3D shade over the solid layers, then the emissive molten core on top so it stays hot. -->
        {#if layers.length}<circle cx="50" cy="50" r={layers[layers.length - 1].r} fill="url(#xsec-shade-{seed})" />{/if}
        {#if coreHeat > 0.02}<circle cx="50" cy="50" r={coreGlowR} fill="url(#xsec-core-{seed})" />{/if}
      </g>
      <path d={wedgePath} fill="none" stroke="rgba(8,8,12,0.7)" stroke-width="0.9" />
    </svg>
  </div>
  <div class="cap">cutaway{coreHeat > 0.25 ? ' · molten core' : ''}{porosity >= 0.03 ? ` · ${Math.round(porosity * 100)}% voids` : ''}</div>
</div>

<style>
  .xsec { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stack { position: relative; }
  .stack :global(.disc-wrap) { position: absolute; inset: 0; }
  .cut { position: absolute; inset: 0; pointer-events: none; }
  .cap { font-size: 0.68em; color: var(--text-faint, #8a8f9a); }
</style>

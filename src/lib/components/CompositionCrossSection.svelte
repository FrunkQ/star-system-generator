<script lang="ts">
  // Interior cross-section (composition redesign stage 4): a layered disc derived live from the
  // makeup mass fractions — metal core out through rock / carbon / ice to a gas envelope — so the
  // coupling between the mix and the body's structure is visible while dragging. Layer radii come
  // from VOLUME fractions (mass fraction / grain density, normalised; r ∝ cbrt of cumulative
  // volume). Porosity renders as void speckles in the solid layers, seeded from the body id so the
  // picture is repeatable. Purely presentational — nothing here writes back.
  import type { Makeup } from '$lib/types';

  export let makeup: Required<Makeup>;
  export let porosity = 0;
  export let seed = 'body';
  export let size = 104;
  // Derived fluid layers (from the physics, not the makeup): a subsurface ocean renders as a
  // liquid annulus UNDER the ice shell; a surface liquid as a thin film over the solid layers.
  export let subsurfaceOcean: { colorHex?: string } | null = null;
  export let surfaceLiquid: { colorHex?: string } | null = null;

  const GRAIN: Required<Makeup> = { metal: 7.9, rock: 3.3, carbon: 2.3, ice: 0.95, gas: 0.12 };
  // Inside → out. Colours match the makeup-slider swatches.
  const ORDER: Array<keyof Makeup> = ['metal', 'rock', 'carbon', 'ice', 'gas'];
  const COLOUR: Record<string, string> = { metal: '#9c8d7a', rock: '#a9805a', carbon: '#3a3a40', ice: '#cfe6ff', gas: '#d8c79a' };
  const LABEL: Record<string, string> = { metal: 'Metal core', rock: 'Rock mantle', carbon: 'Carbon layer', ice: 'Ice shell', gas: 'Gas envelope' };

  const R_MAX = 46;

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
              out.splice(solidTopIdx + 1, 0, { key: 'surface-liquid', r: rTop + 2, fill: surfaceLiquid.colorHex ?? '#2b6cb0', label: 'Surface liquid' });
              for (let i = solidTopIdx + 2; i < out.length; i++) out[i].r = Math.max(out[i].r, rTop + 2.5);
          }
      }
      return out;
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
          return { x: 50 + Math.cos(a) * rr * 0.95, y: 50 + Math.sin(a) * rr * 0.95, r: 0.7 + rnd() * (1 + porosity * 2.2) };
      });
  })();
</script>

<div class="xsec" style="width:{size}px">
  <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Interior cross-section">
    {#each [...layers].reverse() as l}
      <circle cx="50" cy="50" r={l.r} fill={l.fill}><title>{l.label}</title></circle>
    {/each}
    {#each voids as v}
      <circle cx={v.x} cy={v.y} r={v.r} fill="rgba(10,10,14,0.55)" />
    {/each}
    {#if layers.length}
      <circle cx="50" cy="50" r={layers[layers.length - 1].r} fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8" />
    {/if}
  </svg>
  <div class="cap">cross-section{porosity >= 0.03 ? ` · ${Math.round(porosity * 100)}% voids` : ''}</div>
</div>

<style>
  .xsec { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .cap { font-size: 0.68em; color: var(--text-faint, #8a8f9a); }
</style>

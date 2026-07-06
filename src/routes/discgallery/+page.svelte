<script lang="ts">
  // Gallery for The Guide's procedural PlanetDisc — a reference for how worlds are rendered from
  // their physics + tags (polar ice, gas-giant banding + spin-axis tilt, atmosphere glow, auroras,
  // rotational shape). Linked from Settings → System → Appearance. Uses synthetic example bodies.
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
  import type { CelestialBody } from '$lib/types';

  const mk = (over: Partial<CelestialBody> & { name: string }) => ({
    id: over.name, roleHint: 'planet', apparentColorHex: '#3a6ea5',
    temperatureK: 288, temperatureRangeK: { min: 240, max: 305 }, tags: [], ...over
  }) as unknown as CelestialBody;

  // Ammonia-giant palette (a base cloud + chromophore bands) vs a smooth ice-giant (one cloud stop).
  const ammonia = (b: string, c1: string, c2: string) => ([
    { hex: b, role: 'cloud', weight: 1 }, { hex: c1, role: 'cloud', weight: 0.6 }, { hex: c2, role: 'cloud', weight: 0.4 },
  ]);
  const iceGiant = (b: string) => ([{ hex: b, role: 'cloud', weight: 1 }]);

  const surface = [
    mk({ name: 'Temperate + polar ice', apparentColorHex: '#2f6ea5', tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Polar ice, oblate', apparentColorHex: '#4a8ec5', oblateness: 0.32, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Polar ice, tidally locked', apparentColorHex: '#6aa0c0', tidallyLocked: true, tags: [{ key: 'climate/polar-ice', value: 'water' }] } as any),
    mk({ name: 'Dry world (no ice)', apparentColorHex: '#b08050', tags: [] }),
    mk({ name: 'Lava world', apparentColorHex: '#7a2e1e', tags: [{ key: 'tidal/lava-flows' }] }),
  ];

  const atmospheres = [
    mk({ name: 'Wispy (0.05 bar)', apparentColorHex: '#b09070', atmosphere: { pressure_bar: 0.05 } as any }),
    mk({ name: 'Earth-like (1 bar) + ice', apparentColorHex: '#3a7ac0', atmosphere: { pressure_bar: 1 } as any, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Thick (Venus, 90 bar)', apparentColorHex: '#c9b070', atmosphere: { pressure_bar: 90 } as any }),
    mk({ name: 'None (airless)', apparentColorHex: '#9a9aa2', atmosphere: { pressure_bar: 0 } as any }),
  ];

  const giants = [
    mk({ name: 'Jupiter-like · fast spin · 3° tilt', apparentColorHex: '#d8b888', axial_tilt_deg: 3,
        apparentColor: { hex: '#d8b888', banding: 8, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any }),
    mk({ name: 'Saturn-like · 27° tilt', apparentColorHex: '#d8c89a', axial_tilt_deg: 27,
        apparentColor: { hex: '#d8c89a', banding: 5, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any }),
    mk({ name: 'Ice giant · smooth', apparentColorHex: '#8fc4d6', axial_tilt_deg: 28,
        apparentColor: { hex: '#8fc4d6', banding: 3, palette: iceGiant('#a6d4e2') } as any }),
    mk({ name: 'Uranus-like · 98° tilt (on its side)', apparentColorHex: '#a6d8dc', axial_tilt_deg: 98,
        apparentColor: { hex: '#a6d8dc', banding: 4, palette: iceGiant('#b8e0e4') } as any }),
  ];
</script>

<div class="page">
  <h1>Rendered worlds — reference gallery</h1>
  <p class="lead">How The Guide draws a world from its physics and tags. These are illustrative examples.</p>

  <h2>Surface features</h2>
  <div class="gallery">
    {#each surface as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Atmosphere limb-glow — strength from surface pressure</h2>
  <div class="gallery">
    {#each atmospheres as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Gas &amp; ice giants — banding from spin, tilted by the axis</h2>
  <div class="gallery">
    {#each giants as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>
</div>

<style>
  :global(body) { background: #0a0a12; margin: 0; }
  .page { padding: 20px 24px 48px; font-family: system-ui, sans-serif; color: #ccd; }
  h1 { color: #cfe0ea; font-size: 1.15rem; margin: 8px 0 4px; }
  .lead { color: #8a97a6; margin: 0 0 18px; font-size: 0.85rem; }
  h2 { color: #8aa8bc; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 26px 0 4px; }
  .gallery { display: flex; flex-wrap: wrap; gap: 28px; padding: 12px 0; }
  figure { margin: 0; text-align: center; font-size: 0.78rem; width: 168px; }
  figcaption { margin-top: 8px; color: #b8c2cc; }
</style>

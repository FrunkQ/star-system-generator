<script lang="ts">
  // Dev-only gallery for The Guide's procedural PlanetDisc — lets us eyeball the Phase-G viz
  // (polar ice, bands, atmosphere glow, auroras, shapes) across body types without wiring up a
  // live Companion broadcast. Not linked from the app; visit /discgallery directly.
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
  import type { CelestialBody } from '$lib/types';

  const mk = (over: Partial<CelestialBody> & { name: string }) => ({
    id: over.name, roleHint: 'planet', apparentColorHex: '#3a6ea5',
    temperatureK: 288, temperatureRangeK: { min: 240, max: 305 }, tags: [], ...over
  }) as unknown as CelestialBody;

  const bodies = [
    mk({ name: 'Temperate + polar ice', apparentColorHex: '#2f6ea5', tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Polar ice, oblate', apparentColorHex: '#4a8ec5', oblateness: 0.32, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Polar ice, tidally locked', apparentColorHex: '#6aa0c0', tidallyLocked: true, tags: [{ key: 'climate/polar-ice', value: 'water' }] } as any),
    mk({ name: 'No ice (dry)', apparentColorHex: '#b08050', tags: [] }),
    mk({ name: 'Lava world', apparentColorHex: '#7a2e1e', tags: [{ key: 'tidal/lava-flows' }] }),
  ];
</script>

<h1>PlanetDisc gallery (dev)</h1>
<div class="gallery">
  {#each bodies as b}
    <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
  {/each}
</div>

<style>
  :global(body) { background: #0a0a12; margin: 0; }
  h1 { color: #8aa0b0; font-family: sans-serif; font-size: 1rem; padding: 16px 24px 0; }
  .gallery { display: flex; flex-wrap: wrap; gap: 28px; padding: 24px; }
  figure { margin: 0; text-align: center; color: #ccd; font-family: sans-serif; font-size: 0.8rem; }
  figcaption { margin-top: 8px; }
</style>

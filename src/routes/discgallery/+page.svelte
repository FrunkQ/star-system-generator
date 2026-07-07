<script lang="ts">
  // Gallery for The Guide's procedural PlanetDisc — a reference for how worlds are rendered from
  // their physics + tags (polar ice, gas-giant banding + spin-axis tilt, atmosphere glow, auroras,
  // rotational shape). Linked from Settings → System → Appearance. Uses synthetic example bodies.
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
  import type { CelestialBody } from '$lib/types';
  import { deriveApparentColorParts } from '$lib/rendering/apparentColor';

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
    mk({ name: 'Airless & cratered', apparentColorHex: '#9a9088', atmosphere: { pressure_bar: 0 } as any, tags: [{ key: 'geology/inactive' }, { key: 'science/impact-record' }] }),
    mk({ name: 'Lava world', apparentColorHex: '#7a2e1e', tags: [{ key: 'tidal/lava-flows' }] }),
  ];

  const atmospheres = [
    mk({ name: 'Wispy (0.05 bar)', apparentColorHex: '#b09070', atmosphere: { pressure_bar: 0.05 } as any }),
    mk({ name: 'Earth-like (1 bar) + ice', apparentColorHex: '#3a7ac0', atmosphere: { pressure_bar: 1 } as any, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Thick (Venus, 90 bar)', apparentColorHex: '#c9b070', atmosphere: { pressure_bar: 90 } as any }),
    mk({ name: 'None (airless)', apparentColorHex: '#9a9aa2', atmosphere: { pressure_bar: 0 } as any }),
  ];

  const litBody = mk({ name: 'lit', apparentColorHex: '#3a7ac0', atmosphere: { pressure_bar: 1 } as any });

  // The SAME Earth-like world under different spectral-class stars — starlight tints the ocean, clouds
  // and surface (water under a red dwarf is murky amber; under a blue star, cool and bright).
  const earthLike = {
    id: 'earth-star', roleHint: 'planet',
    makeup: { rock: 0.68, metal: 0.32 },
    hydrosphere: { coverage: 0.71, composition: 'water',
      layers: [{ location: 'surface', liquid: 'water' }, { location: 'cloud', liquid: 'water' }] },
    atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } },
    equilibriumTempK: 288, temperatureK: 288,
    tags: [{ key: 'climate/polar-ice', value: 'water' }],
  };
  const starClasses = [
    { name: 'M dwarf · 3200 K', t: 3200 },
    { name: 'K star · 4500 K', t: 4500 },
    { name: 'G / Sun · 5800 K', t: 5800 },
    { name: 'A star · 9000 K', t: 9000 },
  ];
  const earthUnderStars = starClasses.map((s) => {
    const ap = deriveApparentColorParts(earthLike as any, undefined, { starTempK: s.t });
    return { ...JSON.parse(JSON.stringify(earthLike)), name: `Earth · ${s.name}`, apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
  });

  const shapes = [
    mk({ name: 'Oblate (fast spin)', apparentColorHex: '#c89868', oblateness: 0.4 }),
    mk({ name: 'Ellipsoid', apparentColorHex: '#b8916f', oblateness: 0.62 }),
    mk({ name: 'Near break-up', apparentColorHex: '#a89060', oblateness: 0.78 }),
    mk({ name: 'Toroid (flew apart)', apparentColorHex: '#c2a888', oblateness: 0.92 }),
  ];

  const auroras = [
    mk({ name: 'Oxygen · green (Earth)', apparentColorHex: '#2f6ea5', atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any, tags: [{ key: 'aurora/strong', value: '0.42' }, { key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Nitrogen · blue-violet · 40° tilt', apparentColorHex: '#37589a', axial_tilt_deg: 40, atmosphere: { pressure_bar: 1.5, composition: { N2: 0.98 } } as any, tags: [{ key: 'aurora/strong', value: '0.48' }] }),
    mk({ name: 'CO₂ · violet', apparentColorHex: '#9a6a5a', atmosphere: { pressure_bar: 2, composition: { CO2: 0.95 } } as any, tags: [{ key: 'aurora/moderate', value: '0.28' }] }),
    mk({ name: 'H/He giant · red-pink (brilliant)', apparentColorHex: '#c9a878', axial_tilt_deg: 3,
        atmosphere: { pressure_bar: 1000, composition: { H2: 0.9, He: 0.1 } } as any,
        apparentColor: { hex: '#c9a878', banding: 8, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any,
        tags: [{ key: 'aurora/brilliant', value: '0.75' }] }),
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

  // Self-luminous brown dwarfs: the emission halo's colour comes from the thermal/self-luminous tag's
  // value (its effective temperature). Cool T-dwarf → deep red; hot young L-dwarf → amber.
  const brownDwarfs = [
    mk({ name: 'Y/T dwarf · 500 K', apparentColorHex: '#2e1410', temperatureK: 500, tags: [{ key: 'thermal/self-luminous', value: '500' }] }),
    mk({ name: 'T dwarf · 900 K', apparentColorHex: '#4a1e12', temperatureK: 900, tags: [{ key: 'thermal/self-luminous', value: '900' }] }),
    mk({ name: 'L dwarf · 1500 K', apparentColorHex: '#6e2c14', temperatureK: 1500, tags: [{ key: 'thermal/self-luminous', value: '1500' }] }),
    mk({ name: 'Hot young L · 2300 K', apparentColorHex: '#8a4018', temperatureK: 2300, tags: [{ key: 'thermal/self-luminous', value: '2300' }] }),
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

  <h2>Same Earth under different stars — starlight tints ocean, cloud &amp; surface</h2>
  <div class="gallery">
    {#each earthUnderStars as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Light direction (terminator) — for orrery reuse</h2>
  <div class="gallery">
    <figure><PlanetDisc body={litBody} size={168} /><figcaption>default (upper-left)</figcaption></figure>
    <figure><PlanetDisc body={litBody} size={168} lightAngle={0} /><figcaption>from right</figcaption></figure>
    <figure><PlanetDisc body={litBody} size={168} lightAngle={Math.PI / 2} /><figcaption>from below</figcaption></figure>
    <figure><PlanetDisc body={litBody} size={168} lightAngle={Math.PI} /><figcaption>from left</figcaption></figure>
  </div>

  <h2>Rotational shape — flattening to break-up</h2>
  <div class="gallery">
    {#each shapes as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Auroras — atmosphere + magnetic field + ionising radiation</h2>
  <div class="gallery">
    {#each auroras as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Self-luminous brown dwarfs — glow &amp; colour from their own heat</h2>
  <div class="gallery">
    {#each brownDwarfs as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Gas &amp; ice giants — banding from spin, tilted by the axis</h2>
  <div class="gallery">
    {#each giants as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Ringed &amp; tilted — squash, bands, poles and ring all tilt together</h2>
  <div class="gallery">
    <figure><PlanetDisc body={giants[1]} size={168} ringed={true} ringDensity={0.7} /><figcaption>Ringed giant · 27° tilt</figcaption></figure>
    <figure><PlanetDisc body={giants[3]} size={168} ringed={true} ringDensity={0.6} /><figcaption>Ringed giant · 98° tilt (on its side)</figcaption></figure>
    <figure><PlanetDisc body={mk({ name: 'Oblate + 45° tilt', apparentColorHex: '#c89868', oblateness: 0.4, axial_tilt_deg: 45, apparentColor: { hex: '#c89868', banding: 6, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any })} size={168} ringed={true} ringDensity={0.6} /><figcaption>Oblate + ring · 45° tilt</figcaption></figure>
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
